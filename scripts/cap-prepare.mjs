#!/usr/bin/env node
/**
 * PIVISION Mobile — Capacitor prepare step
 *
 * Copies the raw `www-src/` tree into `www/`, the directory that
 * Capacitor reads from (see `capacitor.config.ts → webDir: 'www'`).
 *
 * Why a copy and not a symlink?
 *   - Capacitor's `cap sync` walks the directory and stat()s every
 *     file. Symlinks confuse `cap sync` on Windows runners and break
 *     the Android Gradle merger when it deduplicates assets.
 *   - The copy is fast (a few MB) and idempotent.
 *
 * Why not bundle through Vite first?
 *   See capacitor.config.ts for the rationale. The legacy classic
 *   `<script>` tags in `www-src/` need to load in their original
 *   order; bundling them is a stage-7 task once the legacy modules
 *   are real ESM.
 *
 * Usage:
 *   node scripts/cap-prepare.mjs
 *   npm run cap:prepare
 *
 * Exits non-zero on any I/O error so that `cap:sync` (which chains
 * this with `cap sync android`) fails fast.
 */

import { cp, mkdir, rm, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');
const SRC = resolve(ROOT, 'www-src');
const DEST = resolve(ROOT, 'www');

async function main() {
  // Sanity-check the source.
  if (!existsSync(SRC)) {
    console.error(`[cap-prepare] source missing: ${SRC}`);
    process.exit(1);
  }
  const srcStat = await stat(SRC);
  if (!srcStat.isDirectory()) {
    console.error(`[cap-prepare] source is not a directory: ${SRC}`);
    process.exit(1);
  }

  // Wipe and recreate dest so stale files from a previous run can't
  // shadow renamed/removed sources.
  if (existsSync(DEST)) {
    console.log(`[cap-prepare] cleaning ${DEST}`);
    await rm(DEST, { recursive: true, force: true });
  }
  await mkdir(DEST, { recursive: true });

  // Recursive copy. Excluding test files (*.test.js / *.spec.js) and
  // TypeScript sources (*.ts / *.d.ts) so the runtime image is lean.
  console.log(`[cap-prepare] copying ${SRC} → ${DEST}`);
  await cp(SRC, DEST, {
    recursive: true,
    force: true,
    filter: (source) => {
      const rel = source.slice(SRC.length + 1);
      // The TypeScript ambient declarations and entry facades are
      // a build-time concern only — they don't belong in the
      // runtime image.
      if (rel === 'types' || rel.startsWith('types/')) return false;
      if (rel.endsWith('.ts') || rel.endsWith('.d.ts')) return false;
      // Test files
      if (rel.endsWith('.test.js') || rel.endsWith('.spec.js')) return false;
      return true;
    },
  });

  console.log(`[cap-prepare] done — www/ ready for cap sync`);
}

main().catch((err) => {
  console.error('[cap-prepare] failed:', err);
  process.exit(1);
});
