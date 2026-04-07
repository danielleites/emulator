#!/usr/bin/env node
/**
 * PIVISION emulator — pack:lint
 *
 * Static validator for installed Symbol Packs. Runs the same
 * manifest schema checks the emulator enforces at runtime via
 * `window.PIV_PACKS.validateManifest`, plus a round of static
 * analysis on the symbol files themselves:
 *
 *   Errors (exit 1)
 *     - pack.json fails the schema validator
 *     - a file referenced in core[]/requires[]/files.* is missing
 *       on disk
 *     - `eval(...)` or `new Function(...)` appears in a symbol
 *       .js file (the same rule CI's security audit enforces on
 *       the main source tree)
 *     - `document.write(...)` in a symbol .js file
 *
 *   Warnings (exit 0 unless --strict)
 *     - raw `.innerHTML = ...` assignment in a symbol .js file
 *       (packs should use `createElement` or `window.SafeDOM`)
 *     - `on*=` inline event handlers in a symbol -template.html
 *       (blocked by CSP in production; they look like they work
 *       during `pack:dev` but fail when the emulator enforces
 *       `script-src 'self' 'unsafe-inline'`)
 *
 * Runs once per invocation; use this as a pre-commit hook or in
 * CI alongside the existing `security` job.
 *
 * Usage:
 *   npm run pack:lint                # lint every enabled pack
 *   npm run pack:lint -- --strict    # warnings become errors
 *   npm run pack:lint -- <pack-id>   # lint a single pack
 *   npm run pack:lint -- --json      # machine-readable output
 */

import { readFileSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PACKS_DIR = join(ROOT, 'www-src', 'symbols', 'packs');
const INDEX_PATH = join(PACKS_DIR, 'packs-index.json');

// ──────────────────────────────────────────────────────────────────────
// CLI
// ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { strict: false, json: false, packs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--strict') args.strict = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-')) args.packs.push(a);
    else {
      console.error(`[pack:lint] unknown flag: ${a}`);
      process.exit(2);
    }
  }
  return args;
}

function usage() {
  console.log(`
pack:lint — static validator for Symbol Packs

  Usage:
    npm run pack:lint                 # lint every pack in packs-index.json
    npm run pack:lint -- --strict     # warnings become errors
    npm run pack:lint -- --json       # machine-readable JSON output
    npm run pack:lint -- my-pack      # lint only "my-pack"
    npm run pack:lint -- --help

  Exit codes:
    0 — no errors (warnings allowed)
    1 — at least one error (or warning with --strict)
    2 — invalid CLI arguments
`);
}

// ──────────────────────────────────────────────────────────────────────
// Manifest validation (mirrors emu-packs.js:validateManifest)
// ──────────────────────────────────────────────────────────────────────

const PACK_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const SYMBOL_NAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function isSafeRelativePath(p) {
  if (typeof p !== 'string' || !p) return false;
  if (p.indexOf('..') !== -1) return false;
  if (p.charAt(0) === '/') return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  return true;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') return 'manifest is not an object';
  if (typeof manifest.id !== 'string' || !manifest.id) return 'missing string `id`';
  if (!PACK_ID_RE.test(manifest.id)) return 'id must be lowercase kebab-case';
  if (typeof manifest.displayName !== 'string' || !manifest.displayName) return 'missing string `displayName`';
  if (typeof manifest.version !== 'string' || !manifest.version) return 'missing string `version`';
  if (!SEMVER_RE.test(manifest.version)) return 'version must be MAJOR.MINOR.PATCH';
  if (!Array.isArray(manifest.symbols)) return 'missing `symbols` array';
  if (manifest.core !== undefined) {
    if (!Array.isArray(manifest.core)) return '`core` must be an array if present';
    for (let c = 0; c < manifest.core.length; c++) {
      if (!isSafeRelativePath(manifest.core[c])) return `core[${c}] is not a safe relative path`;
    }
  }
  for (let i = 0; i < manifest.symbols.length; i++) {
    const s = manifest.symbols[i];
    if (!s || typeof s !== 'object') return `symbols[${i}] is not an object`;
    if (typeof s.name !== 'string' || !s.name) return `symbols[${i}].name missing`;
    if (!SYMBOL_NAME_RE.test(s.name)) return `symbols[${i}].name has invalid characters`;
    if (typeof s.category !== 'string' || !s.category) return `symbols[${i}].category missing`;
    if (typeof s.dataShape !== 'string' || !s.dataShape) return `symbols[${i}].dataShape missing`;
    if (!s.files || typeof s.files !== 'object') return `symbols[${i}].files missing`;
    if (typeof s.files.js !== 'string') return `symbols[${i}].files.js must be a string`;
    if (!isSafeRelativePath(s.files.js)) return `symbols[${i}].files.js is not a safe relative path`;
    if (s.files.template !== undefined && !isSafeRelativePath(s.files.template)) {
      return `symbols[${i}].files.template is not a safe relative path`;
    }
    if (s.files.config !== undefined && !isSafeRelativePath(s.files.config)) {
      return `symbols[${i}].files.config is not a safe relative path`;
    }
    if (s.requires !== undefined) {
      if (!Array.isArray(s.requires)) return `symbols[${i}].requires must be an array if present`;
      for (let r = 0; r < s.requires.length; r++) {
        if (!isSafeRelativePath(s.requires[r])) return `symbols[${i}].requires[${r}] is not a safe relative path`;
      }
    }
  }
  return null;
}

// ──────────────────────────────────────────────────────────────────────
// Static analysis rules
// ──────────────────────────────────────────────────────────────────────

/**
 * Each rule takes a (path, content) pair and returns an array of
 * findings: `{ severity, rule, line, message }`.
 *
 * The line number comes from a simple 1-based string split; it's
 * accurate enough for human-readable output without a full AST.
 */
const RULES = [
  {
    id: 'no-eval',
    severity: 'error',
    ext: /\.js$/,
    check(path, src) {
      // Match `eval(` or `new Function(` — but NOT inside
      // single-line comments or string literals. This is a
      // simple line-based scan, so we reject any line with the
      // pattern AND without an obvious comment prefix. False
      // positives on `eval` in a string literal are acceptable;
      // pack authors should just avoid literal `eval(` text.
      const findings = [];
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        if (/\beval\s*\(/.test(line)) {
          findings.push({
            severity: 'error',
            rule: 'no-eval',
            line: i + 1,
            message: '`eval(...)` is forbidden in pack symbols',
          });
        }
        if (/\bnew\s+Function\s*\(/.test(line)) {
          findings.push({
            severity: 'error',
            rule: 'no-new-function',
            line: i + 1,
            message: '`new Function(...)` is forbidden in pack symbols',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'no-document-write',
    severity: 'error',
    ext: /\.js$/,
    check(path, src) {
      const findings = [];
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        if (/\bdocument\s*\.\s*write\s*\(/.test(line)) {
          findings.push({
            severity: 'error',
            rule: 'no-document-write',
            line: i + 1,
            message: 'document.write is SPA-unsafe and forbidden in pack symbols',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'no-raw-inner-html',
    severity: 'warning',
    ext: /\.js$/,
    check(path, src) {
      const findings = [];
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*')) continue;
        // Match `<expr>.innerHTML =` but not `<expr>.innerHTML ==`
        // or `= foo.innerHTML` (read) or inside an eslint-disable.
        if (line.indexOf('eslint-disable') !== -1) continue;
        if (/\.innerHTML\s*=[^=]/.test(line)) {
          findings.push({
            severity: 'warning',
            rule: 'no-raw-inner-html',
            line: i + 1,
            message: 'use `createElement`/`textContent` or `window.SafeDOM.setSafeHTML` instead of raw innerHTML',
          });
        }
      }
      return findings;
    },
  },
  {
    id: 'no-inline-event-handler',
    severity: 'warning',
    ext: /-template\.html$|-config\.html$/,
    check(path, src) {
      const findings = [];
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match `onclick="..."`, `onload='...'`, etc. Exclude
        // `ng-click`, `ng-submit` — those are Angular-shim
        // directives the emulator dispatches safely.
        const m = line.match(/(?:\s|^)(on[a-z]+)\s*=\s*["']/i);
        if (m && !/\bng-/i.test(line.substring(0, m.index || 0))) {
          findings.push({
            severity: 'warning',
            rule: 'no-inline-event-handler',
            line: i + 1,
            message: `inline "${m[1]}" handler blocked by production CSP; use ng-* or attach listeners from the symbol js`,
          });
        }
      }
      return findings;
    },
  },
];

// ──────────────────────────────────────────────────────────────────────
// Lint a single pack
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} packId
 * @returns {{ packId: string, errors: string[], warnings: string[], findings: any[] }}
 */
function lintPack(packId) {
  const result = { packId, errors: [], warnings: [], findings: [] };
  const packDir = join(PACKS_DIR, packId);

  if (!existsSync(packDir) || !statSync(packDir).isDirectory()) {
    result.errors.push(`pack directory not found: ${packDir}`);
    return result;
  }
  const manifestPath = join(packDir, 'pack.json');
  if (!existsSync(manifestPath)) {
    result.errors.push(`pack.json missing at ${manifestPath}`);
    return result;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
  } catch (e) {
    result.errors.push(`pack.json is not valid JSON: ${e.message}`);
    return result;
  }

  // Schema check
  const schemaErr = validateManifest(manifest);
  if (schemaErr) {
    result.errors.push(`manifest schema: ${schemaErr}`);
    return result;
  }

  if (manifest.id !== packId) {
    result.errors.push(`manifest id (${manifest.id}) does not match directory name (${packId})`);
  }

  // Referenced-file existence
  const refs = [];
  if (manifest.core) {
    for (const c of manifest.core) refs.push({ label: `core/${c}`, path: join(packDir, c) });
  }
  for (const sym of manifest.symbols || []) {
    refs.push({ label: `${sym.name}: files.js`, path: join(packDir, sym.files.js) });
    if (sym.files.template) refs.push({ label: `${sym.name}: files.template`, path: join(packDir, sym.files.template) });
    if (sym.files.config) refs.push({ label: `${sym.name}: files.config`, path: join(packDir, sym.files.config) });
    if (sym.requires) {
      for (const r of sym.requires) refs.push({ label: `${sym.name}: requires/${r}`, path: join(packDir, r) });
    }
  }
  for (const ref of refs) {
    if (!existsSync(ref.path)) {
      result.errors.push(`referenced file missing: ${ref.label} → ${ref.path}`);
    }
  }

  // Static analysis on every existing file referenced by the manifest
  for (const ref of refs) {
    if (!existsSync(ref.path)) continue;
    const src = readFileSync(ref.path, 'utf-8');
    for (const rule of RULES) {
      if (!rule.ext.test(ref.path)) continue;
      const findings = rule.check(ref.path, src);
      for (const f of findings) {
        f.file = ref.label;
        result.findings.push(f);
        if (f.severity === 'error') result.errors.push(`${ref.label}:${f.line} [${f.rule}] ${f.message}`);
        else result.warnings.push(`${ref.label}:${f.line} [${f.rule}] ${f.message}`);
      }
    }
  }

  return result;
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

function loadIndex() {
  if (!existsSync(INDEX_PATH)) {
    console.error(`[pack:lint] packs-index.json not found at ${INDEX_PATH}`);
    process.exit(1);
  }
  try {
    const raw = JSON.parse(readFileSync(INDEX_PATH, 'utf-8'));
    if (!Array.isArray(raw.packs)) {
      console.error('[pack:lint] packs-index.json is missing a `packs` array');
      process.exit(1);
    }
    return raw.packs;
  } catch (e) {
    console.error(`[pack:lint] packs-index.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }
}

function renderHuman(results, strict) {
  const reset = '\x1b[0m';
  const red = '\x1b[31m';
  const yellow = '\x1b[33m';
  const green = '\x1b[32m';
  const dim = '\x1b[2m';
  const bold = '\x1b[1m';

  let totalErrors = 0;
  let totalWarnings = 0;

  for (const r of results) {
    const head = `${bold}▸ ${r.packId}${reset}`;
    const statusIcon = r.errors.length
      ? `${red}✗${reset}`
      : r.warnings.length
        ? `${yellow}⚠${reset}`
        : `${green}✓${reset}`;
    console.log(`${statusIcon} ${head}  ${dim}(${r.errors.length} errors, ${r.warnings.length} warnings)${reset}`);
    for (const err of r.errors) console.log(`  ${red}error${reset} ${err}`);
    for (const w of r.warnings) console.log(`  ${yellow}warn ${reset} ${w}`);
    totalErrors += r.errors.length;
    totalWarnings += r.warnings.length;
  }

  console.log();
  const summary = `${totalErrors} error(s), ${totalWarnings} warning(s) across ${results.length} pack(s)`;
  if (totalErrors > 0) {
    console.log(`${red}${summary}${reset}`);
  } else if (totalWarnings > 0 && strict) {
    console.log(`${yellow}${summary} (strict mode — treated as failure)${reset}`);
  } else if (totalWarnings > 0) {
    console.log(`${yellow}${summary}${reset}`);
  } else {
    console.log(`${green}${summary}${reset}`);
  }

  return { totalErrors, totalWarnings };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }

  const enabled = loadIndex();
  const target = args.packs.length > 0 ? args.packs : enabled;

  // If the user passed explicit pack ids, verify each is actually enabled.
  if (args.packs.length > 0) {
    for (const p of args.packs) {
      if (!enabled.includes(p)) {
        console.error(`[pack:lint] "${p}" is not in packs-index.json (enabled: ${enabled.join(', ') || 'none'})`);
        process.exit(2);
      }
    }
  }

  if (target.length === 0) {
    if (args.json) {
      console.log(JSON.stringify({ results: [], totalErrors: 0, totalWarnings: 0 }, null, 2));
    } else {
      console.log('[pack:lint] no packs enabled in packs-index.json — nothing to lint');
    }
    process.exit(0);
  }

  const results = target.map(lintPack);

  if (args.json) {
    const totalErrors = results.reduce((n, r) => n + r.errors.length, 0);
    const totalWarnings = results.reduce((n, r) => n + r.warnings.length, 0);
    console.log(JSON.stringify({ results, totalErrors, totalWarnings }, null, 2));
    process.exit(totalErrors > 0 || (args.strict && totalWarnings > 0) ? 1 : 0);
  }

  const { totalErrors, totalWarnings } = renderHuman(results, args.strict);
  process.exit(totalErrors > 0 || (args.strict && totalWarnings > 0) ? 1 : 0);
}

main();
