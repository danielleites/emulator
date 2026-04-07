#!/usr/bin/env node
/**
 * PIVISION emulator — pack:dev
 *
 * Minimal dev server tailored for Symbol Pack authoring. Three jobs:
 *
 *   1. **Static HTTP server** over `www-src/` on port 5173 (same
 *      default as Vite). No bundling, no transforms — just serves
 *      files as-is so classic <script> tags work the same way
 *      they do in production APK mode.
 *
 *   2. **File watcher** on `www-src/symbols/packs/`. Uses native
 *      `fs.watch` with recursive mode + a 200 ms debounce to
 *      collapse the bursts of events most editors produce on a
 *      single save.
 *
 *   3. **Server-Sent Events (SSE)** endpoint at
 *      `/__pack-dev__/events` that the injected client snippet
 *      subscribes to. When a pack file changes, the server emits
 *      a `reload` event; the client calls `location.reload()`.
 *
 * Zero external dependencies — only Node built-ins. The script is
 * safe to run from a fresh `npm install` because the user's real
 * devDeps (Vite, Vitest, etc.) are completely separate from this
 * code path.
 *
 * Usage:
 *   npm run pack:dev                 # port 5173
 *   npm run pack:dev -- --port 4000  # custom port
 *   npm run pack:dev -- --no-open    # don't print the open-me URL
 *
 * What to open after it starts:
 *   http://localhost:5173/emulator/index.html   ← the emulator
 *   http://localhost:5173/index.html            ← the mobile shell
 *   http://localhost:5173/desktop.html          ← the desktop shell
 *
 * The client auto-reload snippet is injected into every `.html`
 * response — you don't need to add anything to your pack's HTML
 * files. It's silently skipped on non-HTML responses so static
 * JSON/JS/CSS are served byte-for-byte.
 */

import { createServer } from 'node:http';
import { readFile, stat, watch as fsWatch } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const WWW_SRC = join(ROOT, 'www-src');
const PACKS_DIR = join(WWW_SRC, 'symbols', 'packs');

// ──────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { port: 5173, open: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--port') args.port = Number(argv[++i]);
    else if (a === '--no-open') args.open = false;
    else if (a === '--help' || a === '-h') args.help = true;
    else {
      console.error(`[pack:dev] unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function usage() {
  console.log(`
pack:dev — dev server for Symbol Pack authoring

  Usage:
    npm run pack:dev [-- --port <n>] [-- --no-open]

  Options:
    --port <n>   HTTP port (default 5173)
    --no-open    skip the "open me" URL banner
    --help, -h   show this message

  The server watches www-src/symbols/packs/ and triggers an
  auto-reload in any connected browser when a file changes.
`);
}

// ──────────────────────────────────────────────────────────────────────
// MIME types — enough for the emulator's actual file mix
// ──────────────────────────────────────────────────────────────────────

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm':  'text/html; charset=utf-8',
  '.js':   'text/javascript; charset=utf-8',
  '.mjs':  'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css':  'text/css; charset=utf-8',
  '.svg':  'image/svg+xml; charset=utf-8',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif':  'image/gif',
  '.webp': 'image/webp',
  '.ico':  'image/x-icon',
  '.ttf':  'font/ttf',
  '.woff': 'font/woff',
  '.woff2':'font/woff2',
  '.map':  'application/json; charset=utf-8',
  '.txt':  'text/plain; charset=utf-8',
  '.xml':  'application/xml; charset=utf-8',
};

function mimeFor(pathname) {
  return MIME[extname(pathname).toLowerCase()] || 'application/octet-stream';
}

// ──────────────────────────────────────────────────────────────────────
// Client snippet — injected into every HTML response
// ──────────────────────────────────────────────────────────────────────

const CLIENT_SNIPPET = `
<!-- injected by scripts/pack-dev.mjs — auto-reload on pack changes -->
<script>
(function () {
  if (window.__PACK_DEV_SSE__) return;
  window.__PACK_DEV_SSE__ = true;
  try {
    var src = new EventSource('/__pack-dev__/events');
    src.addEventListener('open', function () {
      console.log('[pack:dev] watching for changes');
    });
    src.addEventListener('reload', function (e) {
      console.log('[pack:dev] reload:', e.data || '(file changed)');
      // Short debounce to allow the server to finish writing.
      setTimeout(function () { location.reload(); }, 50);
    });
    src.addEventListener('error', function () {
      // Auto-reconnects built into EventSource. Nothing to do.
    });
  } catch (err) {
    console.warn('[pack:dev] EventSource unavailable — auto-reload disabled');
  }
})();
</script>
`;

/**
 * Inject the client snippet at the very end of the <body>.
 * Falls back to appending at end-of-file if no </body> tag is
 * present (which can happen with the older emulator HTML that
 * has weird attribution blocks floating around).
 */
function injectSnippet(html) {
  const marker = '</body>';
  const idx = html.lastIndexOf(marker);
  if (idx === -1) return html + CLIENT_SNIPPET;
  return html.slice(0, idx) + CLIENT_SNIPPET + html.slice(idx);
}

// ──────────────────────────────────────────────────────────────────────
// SSE client registry
// ──────────────────────────────────────────────────────────────────────

/** @type {Set<import('node:http').ServerResponse>} */
const sseClients = new Set();

function broadcastReload(relPath) {
  const data = JSON.stringify(relPath);
  for (const res of sseClients) {
    try {
      res.write(`event: reload\ndata: ${data}\n\n`);
    } catch {
      // Connection gone — will be cleaned up on the next close event.
    }
  }
}

// ──────────────────────────────────────────────────────────────────────
// Path safety
// ──────────────────────────────────────────────────────────────────────

/**
 * Resolve a URL pathname to a filesystem path under www-src, or
 * null if the requested path would escape the server root.
 *
 * @param {string} urlPath
 */
function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0].split('#')[0]);
  } catch {
    return null;
  }
  if (decoded === '/' || decoded === '') decoded = '/index.html';
  // Normalize + strip leading slashes so path.join doesn't treat
  // the argument as absolute.
  const cleaned = decoded.replace(/^\/+/, '');
  const full = normalize(join(WWW_SRC, cleaned));
  if (!full.startsWith(WWW_SRC + sep) && full !== WWW_SRC) {
    return null; // path traversal
  }
  return full;
}

// ──────────────────────────────────────────────────────────────────────
// HTTP server
// ──────────────────────────────────────────────────────────────────────

function createPackDevServer() {
  return createServer(async (req, res) => {
    // SSE endpoint
    if (req.url === '/__pack-dev__/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('retry: 1000\n\n');
      sseClients.add(res);
      req.on('close', () => sseClients.delete(res));
      return;
    }

    const filePath = resolveFile(req.url || '/');
    if (!filePath) {
      res.writeHead(400, { 'Content-Type': 'text/plain' });
      res.end('bad request');
      return;
    }

    try {
      let target = filePath;
      const st = await stat(target).catch(() => null);
      if (!st) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('not found: ' + (req.url || ''));
        return;
      }
      if (st.isDirectory()) {
        target = join(target, 'index.html');
        const dirStat = await stat(target).catch(() => null);
        if (!dirStat) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('not found: ' + (req.url || ''));
          return;
        }
      }

      const mime = mimeFor(target);
      const buf = await readFile(target);
      if (mime.startsWith('text/html')) {
        const html = injectSnippet(buf.toString('utf-8'));
        const out = Buffer.from(html, 'utf-8');
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': out.length,
          'Cache-Control': 'no-store',
        });
        res.end(out);
      } else {
        res.writeHead(200, {
          'Content-Type': mime,
          'Content-Length': buf.length,
          'Cache-Control': 'no-store',
        });
        res.end(buf);
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('server error: ' + (err && err.message));
    }
  });
}

// ──────────────────────────────────────────────────────────────────────
// File watcher
// ──────────────────────────────────────────────────────────────────────

/**
 * Watch `www-src/symbols/packs/` recursively. Node's `fs.watch`
 * with `recursive: true` works on macOS and Windows; on Linux
 * it's supported in Node 20+. We still debounce because editors
 * fire multiple events per save (atomic-rename, write, rename
 * back, etc.).
 *
 * @param {(relPath: string) => void} onChange
 */
async function watchPacks(onChange) {
  let timer = null;
  let pendingPath = '';
  const ac = new AbortController();

  (async () => {
    try {
      const watcher = fsWatch(PACKS_DIR, { recursive: true, signal: ac.signal });
      for await (const event of watcher) {
        if (!event.filename) continue;
        pendingPath = event.filename;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          timer = null;
          onChange(pendingPath);
        }, 200);
      }
    } catch (err) {
      if (err && err.name === 'AbortError') return;
      console.error('[pack:dev] watcher error:', err && err.message);
    }
  })();

  return () => ac.abort();
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  // Sanity check: PACKS_DIR must exist. It's shipped in the repo.
  const packsStat = await stat(PACKS_DIR).catch(() => null);
  if (!packsStat || !packsStat.isDirectory()) {
    console.error(`[pack:dev] packs directory missing: ${PACKS_DIR}`);
    console.error('[pack:dev] run `npm run pack:new <pack-id>` first.');
    process.exit(1);
  }

  const server = createPackDevServer();

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(args.port, '127.0.0.1', () => resolve(undefined));
  }).catch((err) => {
    console.error(`[pack:dev] listen failed on port ${args.port}: ${err.message}`);
    process.exit(1);
  });

  await watchPacks((relPath) => {
    console.log(`[pack:dev] changed: ${relPath}`);
    broadcastReload(relPath);
  });

  if (args.open) {
    const url = `http://localhost:${args.port}`;
    console.log(`
┌──────────────────────────────────────────────────────────────┐
│  pack:dev — watching www-src/symbols/packs/                  │
├──────────────────────────────────────────────────────────────┤
│  emulator:      ${url}/emulator/index.html
│  mobile shell:  ${url}/index.html
│  desktop shell: ${url}/desktop.html
│  qa tool:       ${url}/qa/qa-app.html
├──────────────────────────────────────────────────────────────┤
│  Ctrl-C to stop. Saving a pack file auto-reloads any tab.    │
└──────────────────────────────────────────────────────────────┘
`);
  }
}

// Graceful shutdown so the SSE clients don't hang on dangling TCP.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log('\n[pack:dev] shutting down');
    for (const res of sseClients) {
      try { res.end(); } catch {}
    }
    process.exit(0);
  });
}

main().catch((err) => {
  console.error('[pack:dev] fatal:', err && err.stack);
  process.exit(1);
});
