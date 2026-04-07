/**
 * PIVISION Mobile — ambient declarations for legacy modules
 *
 * The hand-rolled JS files in `www-src/js/`, `www-src/emulator/js/`,
 * and `www-src/symbols/` are not real ES modules — they are IIFE
 * scripts that attach to globals. They are loaded at runtime via
 * dynamic `import()` (so Vite can chunk them) and via `<script>`
 * tags (the standalone-APK code path).
 *
 * Without this declaration TypeScript would fail every dynamic
 * import with "File is not a module" because it tries to read each
 * legacy `.js` as a typed module and finds zero exports.
 *
 * The declaration is intentionally permissive (`any`). As legacy
 * files are migrated to TypeScript in stages 6+, this catch-all
 * gives way to per-module typings.
 */

declare module '*.js' {
  const value: any;
  export default value;
  export = value;
}

declare module '*.css';
declare module '*.html?raw' {
  const value: string;
  export default value;
}
