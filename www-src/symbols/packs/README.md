# Symbol Packs

Symbol Packs are drop-in extensions that let the PIVISION emulator test
**external** PI Vision symbol libraries without editing `app.js`. The
built-in 113 symbols (v20 / wow / mm20) stay hard-coded and unaffected;
packs are purely additive.

## Directory layout

```
www-src/symbols/packs/
├── packs-index.json          ← registry (lists enabled pack ids)
└── <pack-id>/                ← one directory per pack
    ├── pack.json             ← manifest
    ├── core/                 ← libs loaded ONCE at first use
    │   └── *.js
    ├── libs/                 ← libs loaded on-demand per symbol
    │   └── *.js
    └── symbols/
        ├── sym-<name>.js
        ├── sym-<name>-template.html
        └── sym-<name>-config.html
```

## Enabling a pack

1. Copy the pack directory into `www-src/symbols/packs/<pack-id>/`
2. Add the pack id to `packs-index.json`:
   ```json
   {
     "packs": ["my-pack-id"]
   }
   ```
3. Reload the emulator. The new symbols appear in the picker under their
   declared category alongside the built-ins.

## Manifest schema (`pack.json`)

```jsonc
{
  "id": "my-pack-id",                 // must match directory name, kebab-case
  "displayName": "My Extension Pack",
  "version": "1.0.0",
  "core": [                            // optional; loaded once per pack
    "core/base.js",
    "core/directives.js"
  ],
  "symbols": [
    {
      "name": "hello",                 // identifier; must be unique across ALL packs
      "displayName": "Hello Symbol",   // optional; human-readable
      "category": "Examples",          // grouping in the emulator picker
      "dataShape": "Value",            // None | Value | Table | Gauge | Trend | TimeSeries | XYPlot
      "requires": [                    // optional; loaded before the symbol js
        "libs/chart-lib.js"
      ],
      "files": {
        "js":       "symbols/sym-hello.js",
        "template": "symbols/sym-hello-template.html",  // optional
        "config":   "symbols/sym-hello-config.html"     // optional
      }
    }
  ]
}
```

## Guarantees

- **Non-breaking**: absence of `packs-index.json` OR an empty `packs` array
  makes the emulator behave exactly as before this feature existed.
- **Additive**: pack symbols are merged INTO the existing `SYMBOL_LIST` at
  boot. Built-in names win on collision (logged as a warning).
- **Idempotent**: reloading the page reinitializes safely; duplicate
  imports during development are handled by internal caches.
- **Lazy**: `core` files load once per pack, `requires` once per file,
  the symbol's own JS + template fetch only when the user picks it.

## Authoring a symbol

Each symbol's JS file is expected to register itself with the emulator's
existing `window.PIVisualization.symbolCatalog.register(...)` API — the
same entry point that built-in symbols use. The pack loader does not
impose a new plugin protocol; it just orchestrates the file loading so
your symbol code lands in the same runtime environment as a built-in.

See `www-src/symbols/sym-gauge20.js` for a reference pattern.

## Testing

- Static validation runs in CI via `emu-packs.test.js` (unit) and an e2e
  smoke test that installs a minimal example pack and verifies it
  renders (once stage 8.4 lands).
- Pack authors should `npm run typecheck && npm run test` before shipping
  to catch manifest errors early.

## Stage rollout

| Stage | What | Status |
|-------|------|--------|
| 8.1 | Scaffold: `emu-packs.js` + empty `packs-index.json` + unit tests | current |
| 8.2 | Manifest validator + pack discovery (fetch/validate, no wiring) | next |
| 8.3 | Merge pack symbols into `SYMBOL_LIST`; dispatch in `_loadSymbol` | pending |
| 8.4 | Ship an example pack (`example-hello`) with one dependency-free symbol | pending |
| 8.5 | Playwright e2e test: install example pack, navigate emulator, verify render | pending |
| 8.6 | README section + pack authoring guide | pending |
