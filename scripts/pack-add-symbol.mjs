#!/usr/bin/env node
/**
 * PIVISION emulator — pack:add-symbol
 *
 * Adds a new symbol to an existing Symbol Pack:
 *   1. Writes sym-<name>.js / -template.html / -config.html from
 *      the templates under scripts/templates/
 *   2. Appends a new entry to <pack>/pack.json with sane defaults
 *      (category = "Custom", dataShape = "Value")
 *   3. Validates the resulting manifest against the same schema
 *      rules the emulator's validateManifest uses at runtime
 *
 * Usage:
 *   npm run pack:add-symbol <pack-id> <symbol-name> [options]
 *
 * Options:
 *   --display <name>        human-readable displayName
 *   --category <name>       picker category (default "Custom")
 *   --data-shape <shape>    None|Value|Table|Gauge|Trend|TimeSeries|XYPlot
 *                           (default "Value")
 *
 * Examples:
 *   npm run pack:add-symbol my-pack temperature
 *   npm run pack:add-symbol my-pack pie-chart --display "Pie Chart" \
 *     --category Charts --data-shape Table
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const PACKS_DIR = join(ROOT, 'www-src', 'symbols', 'packs');
const TEMPLATES_DIR = join(__dirname, 'templates');

const VALID_DATA_SHAPES = [
  'None',
  'Value',
  'Table',
  'Gauge',
  'Trend',
  'TimeSeries',
  'XYPlot',
];

const SYMBOL_NAME_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/;

// ──────────────────────────────────────────────────────────────────────
// CLI parsing
// ──────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    pack: null,
    name: null,
    display: null,
    category: 'Custom',
    dataShape: 'Value',
  };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--display') args.display = argv[++i];
    else if (a === '--category') args.category = argv[++i];
    else if (a === '--data-shape') args.dataShape = argv[++i];
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-')) positional.push(a);
    else {
      console.error(`[pack:add-symbol] unknown flag: ${a}`);
      process.exit(2);
    }
  }
  args.pack = positional[0] || null;
  args.name = positional[1] || null;
  return args;
}

function usage() {
  console.log(`
pack:add-symbol — scaffold a new symbol inside an existing pack

  Usage:
    npm run pack:add-symbol <pack-id> <symbol-name> [options]

  Arguments:
    pack-id           existing pack directory (created via pack:new)
    symbol-name       identifier; becomes the file prefix and the
                      typeName passed to symbolCatalog.register

  Options:
    --display <name>         human-readable displayName
    --category <name>        picker category (default "Custom")
    --data-shape <shape>     ${VALID_DATA_SHAPES.join(' | ')}
                             (default "Value")
    --help, -h               show this message
`);
}

// ──────────────────────────────────────────────────────────────────────
// Validation
// ──────────────────────────────────────────────────────────────────────

function assertArgs(args) {
  if (!args.pack) {
    console.error('[pack:add-symbol] missing pack-id');
    usage();
    process.exit(2);
  }
  if (!args.name) {
    console.error('[pack:add-symbol] missing symbol-name');
    usage();
    process.exit(2);
  }
  if (!SYMBOL_NAME_RE.test(args.name)) {
    console.error(
      `[pack:add-symbol] invalid symbol name "${args.name}" — must match /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/`
    );
    process.exit(2);
  }
  if (!VALID_DATA_SHAPES.includes(args.dataShape)) {
    console.error(
      `[pack:add-symbol] invalid --data-shape "${args.dataShape}" — allowed: ${VALID_DATA_SHAPES.join(', ')}`
    );
    process.exit(2);
  }
}

// ──────────────────────────────────────────────────────────────────────
// File operations
// ──────────────────────────────────────────────────────────────────────

/**
 * Read a template file and perform placeholder replacement.
 * @param {string} filename
 * @param {Record<string, string>} vars
 */
function renderTemplate(filename, vars) {
  const src = readFileSync(join(TEMPLATES_DIR, filename), 'utf-8');
  let out = src;
  for (const [k, v] of Object.entries(vars)) {
    const token = '__' + k + '__';
    // Literal string replace (global) without regex metachar risks
    out = out.split(token).join(v);
  }
  return out;
}

function loadManifest(packDir) {
  const manifestPath = join(packDir, 'pack.json');
  if (!existsSync(manifestPath)) {
    console.error(`[pack:add-symbol] pack.json not found at ${manifestPath}`);
    console.error(`[pack:add-symbol] did you run \`npm run pack:new ${packDir.split('/').pop()}\` first?`);
    process.exit(1);
  }
  const raw = readFileSync(manifestPath, 'utf-8');
  try {
    return { path: manifestPath, manifest: JSON.parse(raw) };
  } catch (e) {
    console.error(`[pack:add-symbol] pack.json is not valid JSON: ${e.message}`);
    process.exit(1);
  }
}

function writeSymbolFiles(packDir, symbolName, displayName) {
  const symbolsDir = join(packDir, 'symbols');
  if (!existsSync(symbolsDir)) mkdirSync(symbolsDir, { recursive: true });

  const vars = {
    SYMBOL_NAME: symbolName,
    SYMBOL_DISPLAY: displayName,
  };

  const files = [
    ['sym-boilerplate.js', `sym-${symbolName}.js`],
    ['sym-boilerplate-template.html', `sym-${symbolName}-template.html`],
    ['sym-boilerplate-config.html', `sym-${symbolName}-config.html`],
  ];

  for (const [templateFile, outFile] of files) {
    const outPath = join(symbolsDir, outFile);
    if (existsSync(outPath)) {
      console.error(`[pack:add-symbol] file already exists: ${outPath}`);
      process.exit(1);
    }
    writeFileSync(outPath, renderTemplate(templateFile, vars), 'utf-8');
    console.log(`[pack:add-symbol] wrote ${outPath}`);
  }
}

function appendToManifest(manifestPath, manifest, entry) {
  if (!Array.isArray(manifest.symbols)) manifest.symbols = [];
  // Check for collision
  if (manifest.symbols.some((s) => s.name === entry.name)) {
    console.error(
      `[pack:add-symbol] symbol "${entry.name}" already registered in ${manifestPath}`
    );
    process.exit(1);
  }
  manifest.symbols.push(entry);
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
  console.log(`[pack:add-symbol] registered "${entry.name}" in ${manifestPath}`);
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
  assertArgs(args);

  const packDir = join(PACKS_DIR, args.pack);
  if (!existsSync(packDir)) {
    console.error(`[pack:add-symbol] pack directory not found: ${packDir}`);
    console.error(`[pack:add-symbol] run \`npm run pack:new ${args.pack}\` first`);
    process.exit(1);
  }

  const displayName = args.display || args.name;
  writeSymbolFiles(packDir, args.name, displayName);

  const { path: manifestPath, manifest } = loadManifest(packDir);
  appendToManifest(manifestPath, manifest, {
    name: args.name,
    displayName,
    category: args.category,
    dataShape: args.dataShape,
    files: {
      js: `symbols/sym-${args.name}.js`,
      template: `symbols/sym-${args.name}-template.html`,
      config: `symbols/sym-${args.name}-config.html`,
    },
  });

  console.log(`
✅ Symbol "${args.name}" added to pack "${args.pack}".

Next steps:
  1. Edit www-src/symbols/packs/${args.pack}/symbols/sym-${args.name}.js
     to define your actual rendering logic (the generated file has
     a createElement scaffold + a $watch-driven update loop).
  2. Edit the config template to expose the options you want users
     to tweak from the side panel.
  3. Reload the emulator and pick your symbol from the picker.
`);
}

main();
