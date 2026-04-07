#!/usr/bin/env node
/**
 * PIVISION emulator — pack:new
 *
 * Scaffolds a new Symbol Pack directory under
 * `www-src/symbols/packs/<pack-id>/` and enables it in
 * `packs-index.json`. The generated pack has a valid empty
 * manifest; add symbols with `npm run pack:add-symbol <pack-id>
 * <symbol-name>`.
 *
 * Usage:
 *   npm run pack:new <pack-id> [--display "Human Name"] [--version 1.0.0]
 *
 * Examples:
 *   npm run pack:new my-pack
 *   npm run pack:new my-pack --display "My Pack" --version 0.1.0
 *
 * The pack id must be kebab-case (lowercase alphanumeric + dashes,
 * first char alphanumeric). This is the same rule the emulator's
 * `validateManifest` enforces at runtime.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PACKS_DIR = join(ROOT, 'www-src', 'symbols', 'packs');
const INDEX_PATH = join(PACKS_DIR, 'packs-index.json');

// ──────────────────────────────────────────────────────────────────────
// CLI parsing
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = { id: null, display: null, version: '0.1.0' };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--display') {
      args.display = argv[++i];
    } else if (a === '--version') {
      args.version = argv[++i];
    } else if (a === '--help' || a === '-h') {
      args.help = true;
    } else if (!a.startsWith('-')) {
      positional.push(a);
    } else {
      console.error(`[pack:new] unknown flag: ${a}`);
      process.exit(2);
    }
  }
  args.id = positional[0] || null;
  return args;
}

function usage() {
  console.log(`
pack:new — scaffold a new Symbol Pack

  Usage:
    npm run pack:new <pack-id> [--display "Human Name"] [--version X.Y.Z]

  Arguments:
    pack-id           kebab-case id (e.g. "my-pack"); becomes the
                      directory name under www-src/symbols/packs/

  Options:
    --display <name>  human-readable displayName for the manifest
                      (defaults to the pack id, title-cased)
    --version <ver>   semver MAJOR.MINOR.PATCH (defaults to 0.1.0)
    --help, -h        show this message
`);
}

// ──────────────────────────────────────────────────────────────────────
// Validation (mirrors www-src/emulator/js/emu-packs.js)
// ──────────────────────────────────────────────────────────────────────

const PACK_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/** @param {string} id */
function assertPackId(id) {
  if (!id) {
    console.error('[pack:new] missing pack id');
    usage();
    process.exit(2);
  }
  if (!PACK_ID_RE.test(id)) {
    console.error(`[pack:new] invalid pack id "${id}" — must be lowercase kebab-case (e.g. "my-pack")`);
    process.exit(2);
  }
}

/** @param {string} v */
function assertSemver(v) {
  if (!SEMVER_RE.test(v)) {
    console.error(`[pack:new] invalid version "${v}" — must be MAJOR.MINOR.PATCH`);
    process.exit(2);
  }
}

/** @param {string} id */
function deriveDisplayName(id) {
  return id
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ──────────────────────────────────────────────────────────────────────
// Filesystem operations
// ──────────────────────────────────────────────────────────────────────

/**
 * @param {string} id
 * @param {string} displayName
 * @param {string} version
 */
function createPackDir(id, displayName, version) {
  const packDir = join(PACKS_DIR, id);
  if (existsSync(packDir)) {
    console.error(`[pack:new] directory already exists: ${packDir}`);
    process.exit(1);
  }
  mkdirSync(packDir, { recursive: true });
  mkdirSync(join(packDir, 'symbols'), { recursive: true });

  const manifest = {
    id,
    displayName,
    version,
    symbols: [],
  };
  writeFileSync(
    join(packDir, 'pack.json'),
    JSON.stringify(manifest, null, 2) + '\n',
    'utf-8'
  );
  console.log(`[pack:new] created ${packDir}`);
}

/** @param {string} id */
function registerInIndex(id) {
  if (!existsSync(INDEX_PATH)) {
    writeFileSync(INDEX_PATH, JSON.stringify({ packs: [id] }, null, 2) + '\n', 'utf-8');
    console.log(`[pack:new] created ${INDEX_PATH}`);
    return;
  }
  const raw = readFileSync(INDEX_PATH, 'utf-8');
  let index;
  try {
    index = JSON.parse(raw);
  } catch (e) {
    console.error(`[pack:new] packs-index.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }
  if (!Array.isArray(index.packs)) index.packs = [];
  if (index.packs.includes(id)) {
    console.log(`[pack:new] "${id}" already in packs-index.json — skipping registry update`);
    return;
  }
  index.packs.push(id);
  writeFileSync(INDEX_PATH, JSON.stringify(index, null, 2) + '\n', 'utf-8');
  console.log(`[pack:new] enabled "${id}" in packs-index.json`);
}

// ──────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    usage();
    process.exit(0);
  }
  assertPackId(args.id);
  assertSemver(args.version);
  const displayName = args.display || deriveDisplayName(args.id);

  createPackDir(args.id, displayName, args.version);
  registerInIndex(args.id);

  console.log(`
✅ Pack "${args.id}" created.

Next steps:
  npm run pack:add-symbol ${args.id} <symbol-name>
    → scaffolds sym-<symbol-name>.js / -template.html / -config.html

  npm run dev
    → starts the Vite dev server

  open http://localhost:5173/emulator/index.html
    → your new pack is already enabled and will appear in the picker
      once you add at least one symbol.
`);
}

main();
