/**
 * PIVISION Emulator — Symbol Packs registry & loader
 *
 * Stage 8 of the modernization plan: extend the emulator into a
 * general-purpose PI Vision symbol tester. Before this module, the
 * emulator knew only about its 113 hard-coded symbols (see
 * `SYMBOL_LIST` in app.js). Symbol Packs are drop-in extensions
 * that let you test external symbol libraries (werusys, mm20,
 * custom in-house packs, etc.) without editing app.js.
 *
 * The design is deliberately similar to werusys's loader
 * convention (triplet files + per-symbol library dependencies) but
 * not identical — see docs/symbol-packs.md for the rationale.
 *
 * Guarantees:
 *   1. **Non-breaking.** If no packs are installed, the emulator
 *      behaves exactly as before. `SYMBOL_LIST` stays hard-coded
 *      and every built-in symbol loads through the existing
 *      `_loadSymbol` dispatch.
 *   2. **Additive.** Pack symbols are MERGED into the SYMBOL_LIST
 *      at boot — they never replace existing entries. Name
 *      collisions are logged and the built-in wins.
 *   3. **Idempotent.** `init()` can be called multiple times; only
 *      the first invocation actually fetches anything.
 *
 * Loading flow (once per pack):
 *   1. Fetch `symbols/packs/packs-index.json` — list of enabled packs.
 *   2. For each pack id, fetch `symbols/packs/<id>/pack.json`.
 *   3. Validate the manifest (id, displayName, version, symbols[]).
 *   4. Emit the pack symbols into `window.PIV_PACKS.getSymbols()`.
 *
 * Per-symbol lazy load (when the user picks a pack symbol):
 *   1. Load pack `core` files in declared order (cached per pack).
 *   2. Load the symbol's `requires` files in declared order
 *      (cached per file).
 *   3. Load the symbol's `files.js`, `files.template`, `files.config`.
 *   4. Call `onLoaded(def, template)` — the same signature the
 *      existing `_loadSymbol` uses.
 *
 * Stage 8.1 (this commit): scaffold only. The module is loaded by
 * the emulator HTML but `app.js` does NOT use it yet. No pack is
 * shipped. Next stages wire it into the symbol dispatch and ship
 * an example pack.
 */
(function () {
  'use strict';

  // Guard against double-loading (the emulator loads this script
  // via <script src="..."> which executes once per page, but the
  // unit tests re-import the module and we want state to reset).
  if (typeof window !== 'undefined' && window.PIV_PACKS && !window.PIV_PACKS._testReset) {
    return;
  }

  // ──────────────────────────────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────────────────────────────

  var _packs = Object.create(null);     // packId → manifest
  var _symbolIndex = Object.create(null); // symbolName → { packId, info }
  var _initPromise = null;
  var _initialized = false;

  /** Caches for lazy-loaded files. Keyed by absolute url. */
  var _scriptCache = Object.create(null);
  var _coreLoaded = Object.create(null);   // packId → Promise
  var _requiresCache = Object.create(null); // url → Promise

  // ──────────────────────────────────────────────────────────────────────
  // Config
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Resolve the base path where packs live, relative to the
   * emulator entry HTML. The emulator runs from
   * `emulator/index.html` and uses `../symbols/` as its symbol
   * base, so packs live at `../symbols/packs/` → in URL terms
   * that's just `../symbols/packs/`.
   */
  var PACKS_BASE = '../symbols/packs/';

  var INDEX_URL = PACKS_BASE + 'packs-index.json';

  // ──────────────────────────────────────────────────────────────────────
  // Validation
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Minimal semver check. We accept `MAJOR.MINOR.PATCH` plus an
   * optional `-prerelease` tail. This is intentionally strict
   * enough to reject accidental non-versions (empty string, "1",
   * "v1.0"), not strict enough to be a full semver parser.
   *
   * @param {string} v
   */
  var SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

  /**
   * Reject any pack-declared file path that could escape the
   * pack's own directory. Packs are sandboxed by convention to
   * their subdirectory under `symbols/packs/<id>/`, and the
   * loader builds URLs by concatenation: `packBase + relPath`. A
   * malicious or careless path like `../../emulator/js/app.js`
   * would silently overwrite an unrelated file. These checks are
   * purely cautionary — the pack author is trusted — but they
   * make the trust boundary explicit.
   *
   * Rules:
   *   - must be a non-empty string
   *   - must not contain `..` segments
   *   - must not start with `/` (absolute)
   *   - must not contain a scheme (`://`, `data:`, `blob:`, etc.)
   *
   * @param {any} path
   * @returns {boolean}
   */
  function isSafeRelativePath(path) {
    if (typeof path !== 'string' || !path) return false;
    if (path.indexOf('..') !== -1) return false;
    if (path.charAt(0) === '/') return false;
    if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return false;
    return true;
  }

  /**
   * Validate a pack manifest against the minimal schema. Returns
   * `null` on success or an error string on failure. Loud failures
   * are the right call here: a broken pack should fail loudly at
   * boot, not silently at runtime.
   *
   * @param {any} manifest
   * @returns {string | null}
   */
  function validateManifest(manifest) {
    if (!manifest || typeof manifest !== 'object') {
      return 'manifest is not an object';
    }
    if (typeof manifest.id !== 'string' || !manifest.id) {
      return 'missing string `id`';
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id)) {
      return 'id must be lowercase alphanumeric with dashes (kebab-case)';
    }
    if (typeof manifest.displayName !== 'string' || !manifest.displayName) {
      return 'missing string `displayName`';
    }
    if (typeof manifest.version !== 'string' || !manifest.version) {
      return 'missing string `version`';
    }
    if (!SEMVER_RE.test(manifest.version)) {
      return 'version must be MAJOR.MINOR.PATCH (optional -prerelease)';
    }
    if (!Array.isArray(manifest.symbols)) {
      return 'missing `symbols` array';
    }
    if (manifest.core !== undefined) {
      if (!Array.isArray(manifest.core)) {
        return '`core` must be an array if present';
      }
      for (var c = 0; c < manifest.core.length; c++) {
        if (!isSafeRelativePath(manifest.core[c])) {
          return 'core[' + c + '] is not a safe relative path';
        }
      }
    }
    for (var i = 0; i < manifest.symbols.length; i++) {
      var s = manifest.symbols[i];
      if (!s || typeof s !== 'object') {
        return 'symbols[' + i + '] is not an object';
      }
      if (typeof s.name !== 'string' || !s.name) {
        return 'symbols[' + i + '].name missing';
      }
      if (!/^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(s.name)) {
        return 'symbols[' + i + '].name has invalid characters';
      }
      if (typeof s.category !== 'string' || !s.category) {
        return 'symbols[' + i + '].category missing';
      }
      if (typeof s.dataShape !== 'string' || !s.dataShape) {
        return 'symbols[' + i + '].dataShape missing';
      }
      if (!s.files || typeof s.files !== 'object') {
        return 'symbols[' + i + '].files missing';
      }
      if (typeof s.files.js !== 'string') {
        return 'symbols[' + i + '].files.js must be a string';
      }
      if (!isSafeRelativePath(s.files.js)) {
        return 'symbols[' + i + '].files.js is not a safe relative path';
      }
      if (s.files.template !== undefined && !isSafeRelativePath(s.files.template)) {
        return 'symbols[' + i + '].files.template is not a safe relative path';
      }
      if (s.files.config !== undefined && !isSafeRelativePath(s.files.config)) {
        return 'symbols[' + i + '].files.config is not a safe relative path';
      }
      if (s.requires !== undefined) {
        if (!Array.isArray(s.requires)) {
          return 'symbols[' + i + '].requires must be an array if present';
        }
        for (var r = 0; r < s.requires.length; r++) {
          if (!isSafeRelativePath(s.requires[r])) {
            return 'symbols[' + i + '].requires[' + r + '] is not a safe relative path';
          }
        }
      }
    }
    return null;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Fetch helpers
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Fetch JSON with a short timeout and error recovery. Returns
   * `null` on any failure — the caller decides whether the missing
   * file is fatal. `packs-index.json` is optional (absent → no
   * packs installed), but a pack's own `pack.json` is mandatory.
   *
   * @param {string} url
   * @returns {Promise<any | null>}
   */
  function fetchJSON(url) {
    return fetch(url, { credentials: 'same-origin' })
      .then(function (res) {
        if (!res.ok) return null;
        return res.json().catch(function () {
          return null;
        });
      })
      .catch(function () {
        return null;
      });
  }

  /**
   * Load a single script tag, caching by url. The emulator already
   * has a smarter `_loadScript` in app.js; this is a minimal
   * standalone copy so pack code can be tested without the rest of
   * the emulator.
   *
   * @param {string} url
   * @returns {Promise<void>}
   */
  function loadScript(url) {
    if (_scriptCache[url]) return _scriptCache[url];
    _scriptCache[url] = new Promise(function (resolve, reject) {
      // If the page already has a script tag pointing at this url
      // (legacy `_loadScript` injected it, or a cached <script> in
      // the HTML) we don't inject a second one.
      var existing = document.querySelector('script[src="' + url + '"]');
      if (existing) {
        resolve();
        return;
      }
      var el = document.createElement('script');
      el.src = url;
      el.async = false; // preserve order across sequential loads
      el.onload = function () {
        resolve();
      };
      el.onerror = function () {
        _scriptCache[url] = null;
        reject(new Error('failed to load ' + url));
      };
      document.head.appendChild(el);
    });
    return _scriptCache[url];
  }

  // ──────────────────────────────────────────────────────────────────────
  // Public API
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Discover and register all enabled packs. Safe to call more
   * than once — subsequent calls return the first promise.
   *
   * @returns {Promise<{ loaded: string[], errors: Array<{ packId: string, reason: string }> }>}
   */
  function init() {
    if (_initPromise) return _initPromise;

    _initPromise = fetchJSON(INDEX_URL).then(function (index) {
      var result = { loaded: [], errors: [] };

      // No index file → no packs installed. This is the normal
      // case for the built-in emulator before any pack ships.
      if (!index) {
        _initialized = true;
        return result;
      }

      var packIds = Array.isArray(index.packs) ? index.packs : [];
      var jobs = packIds.map(function (packId) {
        return fetchJSON(PACKS_BASE + packId + '/pack.json').then(function (manifest) {
          if (!manifest) {
            result.errors.push({ packId: packId, reason: 'pack.json not found or invalid JSON' });
            return;
          }
          var err = validateManifest(manifest);
          if (err) {
            result.errors.push({ packId: packId, reason: err });
            return;
          }
          if (manifest.id !== packId) {
            result.errors.push({
              packId: packId,
              reason: 'manifest.id (' + manifest.id + ') does not match directory name (' + packId + ')',
            });
            return;
          }
          _registerPack(manifest);
          result.loaded.push(packId);
        });
      });

      return Promise.all(jobs).then(function () {
        _initialized = true;
        return result;
      });
    });

    return _initPromise;
  }

  /**
   * Register a validated pack manifest. Exported for tests — the
   * init() path does this automatically.
   *
   * @param {object} manifest
   */
  function _registerPack(manifest) {
    _packs[manifest.id] = manifest;
    for (var i = 0; i < manifest.symbols.length; i++) {
      var sym = manifest.symbols[i];
      if (_symbolIndex[sym.name]) {
        // Name collision — log and skip. The first pack wins,
        // matching the "built-in symbols take precedence" rule
        // that app.js will enforce via its merge logic.
        if (typeof console !== 'undefined' && console.warn) {
          console.warn(
            '[PIV_PACKS] symbol name collision: ' +
              sym.name +
              ' (already registered by ' +
              _symbolIndex[sym.name].packId +
              ', skipping ' +
              manifest.id +
              ')'
          );
        }
        continue;
      }
      _symbolIndex[sym.name] = { packId: manifest.id, info: sym };
    }
  }

  /**
   * Return the list of all pack-registered symbols in a shape
   * compatible with the emulator's `SYMBOL_LIST` entries. Used by
   * app.js (stage 8.3) to merge pack symbols into the picker.
   *
   * @returns {Array<{ name: string, type: string, category: string, dataShape: string, packId: string, displayName?: string }>}
   */
  function getSymbols() {
    var out = [];
    var names = Object.keys(_symbolIndex);
    for (var i = 0; i < names.length; i++) {
      var entry = _symbolIndex[names[i]];
      out.push({
        name: entry.info.name,
        type: 'pack',
        category: entry.info.category,
        dataShape: entry.info.dataShape,
        packId: entry.packId,
        displayName: entry.info.displayName || entry.info.name,
      });
    }
    return out;
  }

  /**
   * Look up a registered symbol by name. Returns null if the
   * symbol isn't a pack symbol (the caller falls back to the
   * built-in dispatch).
   *
   * @param {string} name
   * @returns {{ packId: string, info: any } | null}
   */
  function getSymbol(name) {
    return _symbolIndex[name] || null;
  }

  /**
   * Lazy-load everything a pack symbol needs: the pack's core
   * files (once per pack), the symbol's requires, and the symbol's
   * own js file. Callers get back a promise that resolves with
   * `{ def, template }` — identical to what the legacy
   * `_loadSymbol` resolves with.
   *
   * Stage 8.1: this function exists but the emulator doesn't call
   * it yet. Wired in stage 8.3.
   *
   * @param {string} name
   * @returns {Promise<{ def: any, template: string } | null>}
   */
  function loadSymbol(name) {
    var entry = _symbolIndex[name];
    if (!entry) return Promise.resolve(null);

    var manifest = _packs[entry.packId];
    if (!manifest) return Promise.resolve(null);

    var packBase = PACKS_BASE + manifest.id + '/';

    // Core — load once per pack
    var corePromise = _coreLoaded[manifest.id];
    if (!corePromise) {
      var coreFiles = Array.isArray(manifest.core) ? manifest.core : [];
      corePromise = coreFiles.reduce(function (chain, relPath) {
        return chain.then(function () {
          return loadScript(packBase + relPath);
        });
      }, Promise.resolve());
      _coreLoaded[manifest.id] = corePromise;
    }

    return corePromise.then(function () {
      // Per-symbol requires — parallel, cached by url
      var reqs = Array.isArray(entry.info.requires) ? entry.info.requires : [];
      var reqPromises = reqs.map(function (r) {
        var url = packBase + r;
        if (!_requiresCache[url]) _requiresCache[url] = loadScript(url);
        return _requiresCache[url];
      });
      return Promise.all(reqPromises);
    }).then(function () {
      // Symbol's own JS
      return loadScript(packBase + entry.info.files.js);
    }).then(function () {
      // Fetch template if declared
      var templateUrl = entry.info.files.template ? packBase + entry.info.files.template : null;
      var templatePromise = templateUrl
        ? fetch(templateUrl, { credentials: 'same-origin' }).then(function (r) {
            return r.ok ? r.text() : '';
          }).catch(function () { return ''; })
        : Promise.resolve('');
      return templatePromise;
    }).then(function (template) {
      var def = null;
      // Pull the registered def out of PIVisualization's catalog
      // (the symbol's own JS file should have called
      // PIVisualization.symbolCatalog.register(...) by now).
      if (typeof window !== 'undefined' && window.PIVisualization && window.PIVisualization.symbolCatalog) {
        def = window.PIVisualization.symbolCatalog.getSymbol(name) || null;
      }
      return { def: def, template: template };
    });
  }

  /**
   * Reset all internal caches. Test-only.
   * @internal
   */
  function _reset() {
    _packs = Object.create(null);
    _symbolIndex = Object.create(null);
    _initPromise = null;
    _initialized = false;
    _scriptCache = Object.create(null);
    _coreLoaded = Object.create(null);
    _requiresCache = Object.create(null);
  }

  /** @returns {boolean} */
  function isInitialized() {
    return _initialized;
  }

  // ──────────────────────────────────────────────────────────────────────
  // Export
  // ──────────────────────────────────────────────────────────────────────

  var api = {
    init: init,
    getSymbols: getSymbols,
    getSymbol: getSymbol,
    loadSymbol: loadSymbol,
    isInitialized: isInitialized,
    validateManifest: validateManifest,
    isSafeRelativePath: isSafeRelativePath,
    _registerPack: _registerPack,
    _reset: _reset,
    _testReset: true, // flag so a test re-import can replace the global
  };

  if (typeof window !== 'undefined') {
    window.PIV_PACKS = api;
  }

  // CommonJS / ESM export for tests
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
})();
