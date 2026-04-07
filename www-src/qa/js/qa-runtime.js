/**
 * qa-runtime.js — Runtime Error Detection Engine
 * 
 * Two modes:
 * 1. Sandbox Mode: Creates isolated iframes with mocked PI Vision APIs,
 *    loads each symbol's JS, and captures runtime errors automatically.
 * 2. Emulator Bridge: Communicates with the PI Vision emulator via postMessage
 *    to capture live runtime errors during interactive testing.
 */

'use strict';

const QARuntime = (() => {

  // ─── State ───────────────────────────────────────────────────
  const _results = {};      // symbolName → { errors: [], warnings: [], logs: [], status }
  let _emulatorFrame = null;
  let _emulatorOrigin = '*';
  let _onEmulatorMessage = null;
  let _sandboxContainer = null;

  // ─── PI Vision Mock Environment ──────────────────────────────
  // This creates a minimal but functional PI Vision runtime that allows
  // symbol JS to execute without crashing on missing APIs.

  function getPIVisionMockScript() {
    return `
    (function() {
      'use strict';

      // ── PIVisualization namespace ──
      var registeredSymbols = [];

      function BaseVisualization() {}
      BaseVisualization.prototype.init = function() {};
      BaseVisualization.prototype.onDataUpdate = function() {};
      BaseVisualization.prototype.onConfigChange = function() {};
      BaseVisualization.prototype.onResize = function() {};

      window.PIVisualization = {
        deriveVisualizationFromBase: function(ctor) {
          if (ctor && ctor.prototype) {
            ctor.prototype = Object.create(BaseVisualization.prototype);
            ctor.prototype.constructor = ctor;
          }
        },
        symbolCatalog: {
          register: function(def) {
            registeredSymbols.push(def);
            window.__piv_registered = registeredSymbols;
            return def;
          }
        },
        Extensibility: {
          Enums: {
            DatasourceBehaviors: { Single: 1, Multiple: 2, None: 0 },
            ObjectTypes: { Value: 1, Table: 2 }
          }
        }
      };

      // ── PIV20 namespace ──
      var noop = function() {};
      var noopReturn = function() { return noop; };

      window.PIV20 = {
        createBus: function() {
          return { on: noop, emit: noop, off: noop, destroy: noop };
        },
        // safeWidget(el, widgetName, options [, label]) — jQuery widget init mock
        // Symbols call: PIV20.safeWidget($root, WIDGET_NAME, { bus, config })
        // Some call: PIV20.safeWidget(el, '#selector', WIDGET_NAME, { options }, 'label')
        safeWidget: function() {
          // Just return a mock widget reference — never call fn()
          return { destroy: noop, update: noop, option: noop };
        },
        safeApply: function(scope, fn) {
          try { if (fn) fn(); } catch(e) { window.__piv_captureError('PIV20.safeApply', e); }
        },
        destroyHelper: function() { return noop; },
        initSymbol: function() { return {}; },
        shield: {
          wrap: function(symName, fnName, fn) { return fn || noop; },
          protect: function(symName, fn) { return fn || noop; },
          log: noop
        },
        fmt: {
          time: function(v) { return v != null ? String(v) : '--'; },
          date: function(v) { return v != null ? String(v) : '--'; },
          number: function(v) { return v != null ? String(v) : '--'; },
          percent: function(v) { return v != null ? (v + '%') : '--'; }
        },
        docs: {
          show: noop
        },
        ui: {
          showToast: noop
        },
        ultra: null   // will be initialized below after full ultra mock
      };

      // ── MU20 namespace ──
      window.MU20 = {
        _loaded: true,
        VERSION: 'ULT.1.6',
        SITES: [
          { id: 'ashkelon', name: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF', nameEn: 'Ashkelon', capacity: 2250, units: 6, type: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9' },
          { id: 'hadera', name: '\u05D7\u05D3\u05E8\u05D4', nameEn: 'Hadera', capacity: 2590, units: 6, type: '\u05E4\u05D7\u05DD/\u05D2\u05D6' },
          { id: 'orot-rabin', name: '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF', nameEn: 'Orot Rabin', capacity: 2590, units: 6, type: '\u05E4\u05D7\u05DD/\u05D2\u05D6' },
          { id: 'rutenberg', name: '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2', nameEn: 'Rutenberg', capacity: 2250, units: 4, type: '\u05E4\u05D7\u05DD' },
          { id: 'reading', name: '\u05E8\u05D9\u05D3\u05D9\u05E0\u05D2', nameEn: 'Reading', capacity: 604, units: 4, type: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9' }
        ],
        config: {
          validate: function(cfg) { return cfg || {}; },
          mapEditor: function(cfg) { return cfg || {}; },
          migrate: function(cfg) { return cfg || {}; },
          normalize: function(cfg) { return cfg || {}; },
          DEFAULTS: {}
        },
        shield: {
          wrap: function(a, b, fn) { return fn || noop; },
          protect: function(a, fn) { return fn || noop; },
          log: noop,
          renderFallback: noop
        },
        destroyHelper: noop,
        applyTheme: noop,
        createBus: function() { return { on: noop, emit: noop, off: noop, destroy: noop }; },
        safePlugin: function(Cls, shadow, container, opts, bus, tabId) {
          try { var inst = new Cls(); if (inst.init) inst.init(shadow, container, opts, bus); return inst; } catch(e) { return { update: noop, destroy: noop }; }
        },
        resolveUrl: function(rel) { return rel || ''; },
        ensureStyle: noop,
        loadScripts: function(arr, cb) { if (cb) cb(); return Promise.resolve(); },
        unitKey: function(s,u) { return (s||'') + ':' + (u||''); },
        formatNum: function(v, d) { return v != null ? Number(v).toFixed(d || 0) : '--'; },
        formatDate: function(v) { return String(v || ''); },
        _activeConfigScope: null,
        AF: {
          _afLayer: null,
          _getAF: function() {
            if (!this._afLayer) {
              try { this._afLayer = (typeof AFDataLayer !== 'undefined') ? new AFDataLayer() : (window.parent && window.parent.__AF ? window.parent.__AF : null); } catch(e) {}
            }
            return this._afLayer;
          },
          browse: function(parentWebId) {
            var af = MU20.AF._getAF();
            if (!af) return Promise.resolve([]);
            if (!parentWebId) return Promise.resolve(af.getRootElements().Items);
            return Promise.resolve(af.getChildElements(parentWebId).Items);
          },
          getAttributes: function(elementWebId, category) {
            var af = MU20.AF._getAF();
            if (!af) return Promise.resolve([]);
            return Promise.resolve(af.getAttributes(elementWebId, category).Items);
          },
          getRecordedValues: function(tagWebId, start, end, maxCount) {
            var af = MU20.AF._getAF();
            if (!af) return Promise.resolve([]);
            return Promise.resolve(af.getRecordedValues(tagWebId, start, end, maxCount).Items);
          },
          getInterpolatedValues: function(tagWebId, start, end, interval) {
            var af = MU20.AF._getAF();
            if (!af) return Promise.resolve([]);
            return Promise.resolve(af.getInterpolatedValues(tagWebId, start, end, interval).Items);
          },
          searchTags: function(query, maxCount) {
            var af = MU20.AF._getAF();
            if (!af) return Promise.resolve([]);
            return Promise.resolve(af.searchTags(query, maxCount).Items);
          },
          getEventFrames: function(opts) {
            var af = MU20.AF._getAF();
            if (!af) return Promise.resolve([]);
            return Promise.resolve(af.getEventFrames(opts).Items);
          },
          parsePath: function(p) { return { server: 'PIServer-IEC', db: 'IEC-PowerGrid', path: p || '' }; },
          safeVal: function(row, dec) { 
            if (row && row.Value != null) return Number(row.Value).toFixed(dec || 0);
            return '0'; 
          }
        },
        demo: {
          generate: function(type, opts) {
            var af = MU20.AF._getAF();
            if (!af) return [];
            var tags = af.searchTags(type || '', 20);
            return tags.Items || [];
          },
          generateSites: function() {
            var af = MU20.AF._getAF();
            if (!af) return [];
            return af.getRootElements().Items || [];
          }
        },
        PIWebAPI: function(baseUrl) {
          var self = this;
          var af = null;
          try { af = (typeof AFDataLayer !== 'undefined') ? new AFDataLayer() : (window.parent && window.parent.__AF ? window.parent.__AF : null); } catch(e) {}
          self.get = function(path, params) { 
            if (af) return Promise.resolve({ data: af.handleRequest(path, params || {}) });
            return Promise.resolve({ data: {} }); 
          };
          self._get = function(url, cb) { 
            var result = af ? af.handleRequest(url) : {};
            if (cb) cb(null, result); 
            return Promise.resolve(result); 
          };
          self.post = function() { return Promise.resolve({ data: {} }); };
          self.batch = function(requests) {
            if (!af || !requests) return Promise.resolve({ data: {} });
            var results = {};
            Object.keys(requests).forEach(function(key) {
              var req = requests[key];
              results[key] = { Status: 200, Content: af.handleRequest(req.Resource || req.path || '', req.Parameters || {}) };
            });
            return Promise.resolve({ data: results });
          };
          self.getUserInfo = function(cb) { if (cb) cb(null, { Name: 'MockUser', IsAdmin: true }); return Promise.resolve({ Name: 'MockUser' }); };
        }
      };

      // ── MM20 namespace (MugMonitor shared infra) ──
      window.MM20 = {
        _loaded: true,
        VERSION: '20.0.0',
        SITES: [
          { id: 'ashkelon', name: '\u05D0\u05E9\u05E7\u05DC\u05D5\u05DF', nameEn: 'Ashkelon', capacity: 2250, units: 6, type: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9' },
          { id: 'hadera', name: '\u05D7\u05D3\u05E8\u05D4', nameEn: 'Hadera', capacity: 2590, units: 6, type: '\u05E4\u05D7\u05DD/\u05D2\u05D6' },
          { id: 'orot-rabin', name: '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF', nameEn: 'Orot Rabin', capacity: 2590, units: 6, type: '\u05E4\u05D7\u05DD/\u05D2\u05D6' },
          { id: 'rutenberg', name: '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2', nameEn: 'Rutenberg', capacity: 2250, units: 4, type: '\u05E4\u05D7\u05DD' },
          { id: 'reading', name: '\u05E8\u05D9\u05D3\u05D9\u05E0\u05D2', nameEn: 'Reading', capacity: 604, units: 4, type: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9' }
        ],
        basePath: '',
        shield: {
          wrap: function(a, b, fn) { return fn || noop; },
          log: noop,
          renderFallback: noop
        },
        config: {
          validate: function(c) { return c || {}; },
          mapEditor: function(c) { return c || {}; },
          migrate: function(c) { return c || {}; },
          normalize: function(c) { return c || {}; },
          DEFAULTS: {}
        },
        destroyHelper: noop,
        createBus: function() { return { on: noop, emit: noop, off: noop, destroy: noop }; },
        resolveUrl: function(rel) { return rel || ''; },
        ensureStyle: noop,
        loadScripts: function(arr, cb) { if (cb) cb(); return Promise.resolve(); },
        applyTheme: noop,
        formatDate: function(v) { return String(v || ''); },
        getStatus: function() { return 'ok'; },
        unitKey: function(s,u) { return (s||'') + ':' + (u||''); },
        stats: { track: noop },
        demo: { generate: function() { return []; } },
        AF: {
          browse: function(parentWebId) {
            var af = MU20.AF._getAF();
            if (!af) return Promise.resolve([]);
            if (!parentWebId) return Promise.resolve(af.getRootElements().Items);
            return Promise.resolve(af.getChildElements(parentWebId).Items);
          },
          searchTags: function(q) { return MU20.AF.searchTags(q); },
          getAttributes: function(wid, cat) { return MU20.AF.getAttributes(wid, cat); }
        },
        LayoutManager: function() { this.init = noop; this.destroy = noop; this.getTabOrder = function(){ return []; }; this.setTabOrder = noop; },
        PIWebAPI: function(baseUrl) {
          var self = this;
          var af = null;
          try { af = MU20.AF._getAF(); } catch(e) {}
          self.get = function(path, params) { 
            if (af) return Promise.resolve({ data: af.handleRequest(path, params || {}) });
            return Promise.resolve({ data: {} }); 
          };
          self._get = function(url, cb) { 
            var result = af ? af.handleRequest(url) : {};
            if (cb) cb(null, result); 
            return Promise.resolve(result); 
          };
          self.post = function() { return Promise.resolve({ data: {} }); };
          self.batch = function(requests) {
            if (!af || !requests) return Promise.resolve({ data: {} });
            var results = {};
            Object.keys(requests).forEach(function(key) {
              var req = requests[key];
              results[key] = { Status: 200, Content: af.handleRequest(req.Resource || req.path || '', req.Parameters || {}) };
            });
            return Promise.resolve({ data: results });
          };
          self.getUserInfo = function(cb) { if (cb) cb(null, { Name: 'MockUser', IsAdmin: true }); return Promise.resolve({ Name: 'MockUser' }); };
        }
      };

      // ── PIV10 namespace (legacy shared infra) ──
      window.PIV10 = {
        initSymbol: noop,
        safeWidget: function() { return { destroy: noop }; },
        safeApply: noop,
        createBus: function() { return { on: noop, emit: noop, off: noop, destroy: noop }; },
        shield: { wrap: function(a,b,fn){ return fn || noop; }, log: noop },
        fmt: { time: function(v){ return String(v||'--'); }, date: function(v){ return String(v||'--'); }, number: function(v){ return String(v||'--'); } },
        destroyHelper: function() { return noop; }
      };

      // ── WOW Renderer mocks ──
      window.WowGridRenderer = function() {
        this.mount = noop; this.update = noop; this.updateSparkline = noop; this.destroy = noop; this.resize = noop;
      };
      window.WowHeatmapRenderer = function() {
        this.mount = noop; this.update = noop; this.destroy = noop; this.resize = noop;
      };

      // ── Mu20 plugin constructors (for mugult20) ──
      var mu20PluginNames = ['Mu20Layout','Mu20Tags','Mu20TagWarehouse','Mu20TagExplorer',
        'Mu20SiteGrid','Mu20Reports','Mu20Log','Mu20Heatmap','Mu20Forecast',
        'Mu20EventFrames','Mu20Dispatch','Mu20Alerts','Mu20Config'];
      mu20PluginNames.forEach(function(name) {
        if (!window[name]) {
          window[name] = function() {
            this.init = noop; this.update = noop; this.destroy = noop; this.resize = noop;
            this.getTabOrder = function(){ return []; }; this.setTabOrder = noop;
            this.getTabLabel = function(id){ return id || ''; };
            this.isTabVisible = function(){ return true; };
            this.isEditMode = function(){ return false; };
            this.save = noop;
            this.setActive = noop; this.getActive = function(){ return null; };
          };
        }
      });

      // ── PIV20.ultra — full mock for ultra-upgraded symbols ──
      // (co2emis20, constmon20, genblock20, maindash20 etc.)
      (function() {
        var U = {};
        U._loaded = true;

        // shield: error-wrapping utility — symbols use U.shield.wrap(MODULE, 'fnName', fn)
        U.shield = {
          wrap: function(module, fnName, fn) { return fn || noop; },
          protect: function(module, fn) { return fn || noop; },
          log: noop,
          renderFallback: noop
        };

        // configFactory: creates a config validator from defaults
        U.configFactory = function(defaults) {
          var DEFAULTS = {};
          for (var k in defaults) {
            if (defaults.hasOwnProperty(k)) DEFAULTS[k] = defaults[k];
          }
          return {
            DEFAULTS: DEFAULTS,
            mapEditor: function(cfg) { return cfg || {}; },
            migrate: function(cfg) {
              if (!cfg) return JSON.parse(JSON.stringify(DEFAULTS));
              return cfg;
            },
            validate: function(cfg) {
              if (!cfg) return JSON.parse(JSON.stringify(DEFAULTS));
              var result = {};
              for (var k in DEFAULTS) {
                if (DEFAULTS.hasOwnProperty(k)) {
                  result[k] = cfg.hasOwnProperty(k) ? cfg[k] : DEFAULTS[k];
                }
              }
              return result;
            },
            normalize: function(cfg) {
              return this.validate(cfg);
            }
          };
        };

        // destroyHelper — returns a cleanup function
        U.destroyHelper = function(scope) {
          return function destroy() {};
        };

        // Keyboard manager (symbols use attach/detach, not bind/unbind)
        U.keyboard = {
          bind: noop,
          unbind: noop,
          attach: noop,
          detach: noop,
          isActive: function() { return false; }
        };

        // Theme applicator
        U.applyTheme = noop;

        // Demo mode data generator
        U.demo = {
          generate: function(type, opts) {
            return [];
          }
        };

        // Debounce utility
        U.debounce = function(fn, wait) {
          var timer;
          return function() {
            var args = arguments, self = this;
            clearTimeout(timer);
            timer = setTimeout(function() { fn.apply(self, args); }, wait || 100);
          };
        };

        // CSV export
        U.exportCsv = noop;

        // Config I/O (import/export)
        U.configIO = {
          exportConfig: function() { return '{}'; },
          exportJSON: noop,
          importConfig: noop,
          importJSON: noop
        };

        window.PIV20.ultra = U;
      })();

      // ── Angular mini-mock ──
      // angular.element() must return a jQuery-like wrapper with chainable methods
      // including .find() that also returns a jQuery-like object. This is critical
      // because all v20 symbols call elem.find('#some-id') in their init().
      function makeJqLite(el) {
        var realEl = (el && el.nodeType) ? el : document.createElement('div');
        var obj = {
          0: realEl,
          length: 1,
          find: function(sel) {
            try {
              var found = realEl.querySelector ? realEl.querySelector(sel) : null;
              return makeJqLite(found || document.createElement('div'));
            } catch(e) { return makeJqLite(document.createElement('div')); }
          },
          append: function(c) { try { if (c && c.nodeType) realEl.appendChild(c); else if (typeof c === 'string') realEl.insertAdjacentHTML('beforeend', c); } catch(e){} return obj; },
          prepend: function(c) { try { if (typeof c === 'string') realEl.insertAdjacentHTML('afterbegin', c); } catch(e){} return obj; },
          remove: function() { if (realEl.parentNode) realEl.parentNode.removeChild(realEl); return obj; },
          empty: function() { realEl.innerHTML = ''; return obj; },
          addClass: function(c) { try { realEl.classList.add(c); } catch(e){} return obj; },
          removeClass: function(c) { try { realEl.classList.remove(c); } catch(e){} return obj; },
          toggleClass: function(c, f) { try { realEl.classList.toggle(c, f); } catch(e){} return obj; },
          hasClass: function(c) { try { return realEl.classList.contains(c); } catch(e) { return false; } },
          css: function(k, v) {
            if (typeof k === 'object') { for (var p in k) { try { realEl.style[p] = k[p]; } catch(e){} } return obj; }
            if (v !== undefined) { try { realEl.style[k] = v; } catch(e){} return obj; }
            try { return getComputedStyle(realEl)[k]; } catch(e) { return ''; }
          },
          attr: function(k, v) {
            if (v !== undefined) { try { realEl.setAttribute(k, v); } catch(e){} return obj; }
            try { return realEl.getAttribute(k); } catch(e) { return null; }
          },
          prop: function(k, v) { if (v !== undefined) { realEl[k] = v; return obj; } return realEl[k]; },
          data: function(k, v) { if (v !== undefined) { try { realEl.dataset[k] = v; } catch(e){} return obj; } try { return realEl.dataset[k]; } catch(e) { return undefined; } },
          html: function(v) { if (v !== undefined) { realEl.innerHTML = v; return obj; } return realEl.innerHTML; },
          text: function(v) { if (v !== undefined) { realEl.textContent = v; return obj; } return realEl.textContent; },
          val: function(v) { if (v !== undefined) { realEl.value = v; return obj; } return realEl.value || ''; },
          on: function(evt, sel, fn) { if (typeof sel === 'function') { fn = sel; } try { realEl.addEventListener(evt.split('.')[0], fn || noop); } catch(e){} return obj; },
          off: function(evt) { return obj; },
          trigger: function(evt) { try { realEl.dispatchEvent(new Event(evt)); } catch(e){} return obj; },
          show: function() { realEl.style.display = ''; return obj; },
          hide: function() { realEl.style.display = 'none'; return obj; },
          fadeIn: function(d, cb) { realEl.style.display = ''; if (cb) cb(); return obj; },
          fadeOut: function(d, cb) { realEl.style.display = 'none'; if (cb) cb(); return obj; },
          animate: function(props, dur, ease, cb) { if (typeof dur === 'function') cb = dur; if (cb) setTimeout(cb, 0); return obj; },
          stop: function() { return obj; },
          width: function(v) { if (v !== undefined) { realEl.style.width = v + 'px'; return obj; } return realEl.offsetWidth || 400; },
          height: function(v) { if (v !== undefined) { realEl.style.height = v + 'px'; return obj; } return realEl.offsetHeight || 300; },
          innerWidth: function() { return realEl.clientWidth || 400; },
          innerHeight: function() { return realEl.clientHeight || 300; },
          outerWidth: function() { return realEl.offsetWidth || 400; },
          outerHeight: function() { return realEl.offsetHeight || 300; },
          offset: function() { try { var r = realEl.getBoundingClientRect(); return { top: r.top, left: r.left }; } catch(e) { return { top: 0, left: 0 }; } },
          position: function() { return { top: realEl.offsetTop || 0, left: realEl.offsetLeft || 0 }; },
          scrollTop: function(v) { if (v !== undefined) { realEl.scrollTop = v; return obj; } return realEl.scrollTop || 0; },
          scrollLeft: function(v) { if (v !== undefined) { realEl.scrollLeft = v; return obj; } return realEl.scrollLeft || 0; },
          each: function(fn) { if (fn) fn.call(realEl, 0, realEl); return obj; },
          eq: function() { return obj; },
          first: function() { return obj; },
          last: function() { return obj; },
          parent: function() { return makeJqLite(realEl.parentElement || document.createElement('div')); },
          children: function() { return makeJqLite(realEl.firstElementChild || document.createElement('div')); },
          closest: function(sel) { try { var m = realEl.closest(sel); return makeJqLite(m || document.createElement('div')); } catch(e) { return makeJqLite(document.createElement('div')); } },
          siblings: function() { return makeJqLite(document.createElement('div')); },
          next: function() { return makeJqLite(realEl.nextElementSibling || document.createElement('div')); },
          prev: function() { return makeJqLite(realEl.previousElementSibling || document.createElement('div')); },
          clone: function() { return makeJqLite(realEl.cloneNode(true)); },
          replaceWith: function(c) { return obj; },
          wrap: function(c) { return obj; },
          ready: function(fn) { if (fn) fn(); return obj; },
          scope: function() { return {}; },
          controller: function() { return {}; },
          injector: function() { return { get: function() { return {}; } }; }
        };
        return obj;
      }

      window.angular = {
        module: function() {
          return {
            directive: noop,
            controller: noop,
            service: noop,
            factory: noop,
            filter: function(name, fn) { return this; },
            run: noop,
            config: noop
          };
        },
        element: makeJqLite,
        noop: noop,
        isUndefined: function(v) { return typeof v === 'undefined'; },
        isDefined: function(v) { return typeof v !== 'undefined'; },
        isObject: function(v) { return v !== null && typeof v === 'object'; },
        isString: function(v) { return typeof v === 'string'; },
        isNumber: function(v) { return typeof v === 'number'; },
        isFunction: function(v) { return typeof v === 'function'; },
        isArray: Array.isArray,
        forEach: function(obj, fn) {
          if (Array.isArray(obj)) obj.forEach(fn);
          else if (obj) Object.keys(obj).forEach(function(k) { fn(obj[k], k); });
        },
        extend: Object.assign,
        copy: function(o) { return JSON.parse(JSON.stringify(o || {})); },
        merge: function() { return Object.assign.apply(null, arguments); },
        toJson: function(o) { return JSON.stringify(o); },
        fromJson: function(s) { try { return JSON.parse(s); } catch(e) { return null; } },
        identity: function(v) { return v; },
        bind: function(self, fn) { return fn.bind(self); }
      };

      // ── jQuery mock (delegates to makeJqLite for DOM wrapping) ──
      window.jQuery = window.$ = function(sel) {
        if (typeof sel === 'function') { sel(); return makeJqLite(document.body); }
        if (typeof sel === 'string') {
          try {
            var found = document.querySelector(sel);
            return makeJqLite(found || document.createElement('div'));
          } catch(e) { return makeJqLite(document.createElement('div')); }
        }
        if (sel && sel.nodeType) return makeJqLite(sel);
        return makeJqLite(document.createElement('div'));
      };
      window.jQuery.fn = window.jQuery.prototype = makeJqLite(document.createElement('div'));
      window.jQuery.extend = function() {
        var target = arguments[0] || {};
        for (var i = 1; i < arguments.length; i++) {
          var src = arguments[i];
          if (src) for (var k in src) { if (src.hasOwnProperty(k)) target[k] = src[k]; }
        }
        return target;
      };
      window.jQuery.each = function(obj, fn) {
        if (Array.isArray(obj)) obj.forEach(function(v, i) { fn(i, v); });
        else if (obj) { for (var k in obj) { if (obj.hasOwnProperty(k)) fn(k, obj[k]); } }
      };
      window.jQuery.isFunction = function(f) { return typeof f === 'function'; };
      window.jQuery.isPlainObject = function(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); };
      window.jQuery.isArray = Array.isArray;
      window.jQuery.map = function(arr, fn) { return (arr || []).map(fn); };
      window.jQuery.grep = function(arr, fn) { return (arr || []).filter(fn); };
      window.jQuery.inArray = function(v, arr) { return (arr || []).indexOf(v); };
      window.jQuery.trim = function(s) { return (s || '').trim(); };
      window.jQuery.proxy = function(fn, ctx) { return fn.bind(ctx); };
      window.jQuery.Callbacks = function() {
        var list = [];
        return { add: function(fn) { list.push(fn); }, fire: function() { list.forEach(function(fn) { fn(); }); }, remove: noop, empty: function() { list = []; } };
      };
      window.jQuery.widget = function() {};
      window.jQuery.Deferred = function() {
        var d = {
          resolve: function() { if (d._done) d._done.apply(null, arguments); return d; },
          reject: function() { if (d._fail) d._fail.apply(null, arguments); return d; },
          promise: function() { return d; },
          then: function(done, fail) { d._done = done; d._fail = fail; return d; },
          done: function(fn) { d._done = fn; return d; },
          fail: function(fn) { d._fail = fn; return d; },
          always: function(fn) { d._always = fn; return d; },
          _done: null, _fail: null, _always: null
        };
        return d;
      };

      // ── Error Capture System ──
      window.__piv_errors = [];
      window.__piv_warnings = [];
      window.__piv_logs = [];

      window.__piv_captureError = function(context, err) {
        window.__piv_errors.push({
          type: 'runtime-error',
          context: context,
          message: err.message || String(err),
          stack: err.stack ? err.stack.substring(0, 500) : '',
          timestamp: Date.now()
        });
      };

      // Override console to capture logs
      var origConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console)
      };

      console.log = function() {
        var msg = Array.from(arguments).map(String).join(' ');
        window.__piv_logs.push({ level: 'log', message: msg, timestamp: Date.now() });
        origConsole.log.apply(null, arguments);
      };
      console.warn = function() {
        var msg = Array.from(arguments).map(String).join(' ');
        window.__piv_warnings.push({ level: 'warn', message: msg, timestamp: Date.now() });
        origConsole.warn.apply(null, arguments);
      };
      console.error = function() {
        var msg = Array.from(arguments).map(String).join(' ');
        window.__piv_errors.push({ type: 'console-error', context: 'console.error', message: msg, timestamp: Date.now() });
        origConsole.error.apply(null, arguments);
      };
      console.info = function() {
        var msg = Array.from(arguments).map(String).join(' ');
        window.__piv_logs.push({ level: 'info', message: msg, timestamp: Date.now() });
        origConsole.info.apply(null, arguments);
      };

      // Catch unhandled errors
      window.addEventListener('error', function(event) {
        window.__piv_errors.push({
          type: 'uncaught-error',
          context: 'window.onerror',
          message: event.message || 'Unknown error',
          stack: event.error ? (event.error.stack || '').substring(0, 500) : '',
          file: event.filename || '',
          line: event.lineno || 0,
          col: event.colno || 0,
          timestamp: Date.now()
        });
      });

      // Catch unhandled promise rejections
      window.addEventListener('unhandledrejection', function(event) {
        var msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unhandled promise rejection';
        window.__piv_errors.push({
          type: 'unhandled-rejection',
          context: 'Promise',
          message: msg,
          stack: event.reason && event.reason.stack ? event.reason.stack.substring(0, 500) : '',
          timestamp: Date.now()
        });
      });

      // Mock fetch for symbols that call PI Web API
      var origFetch = window.fetch;
      window.fetch = function(url, opts) {
        if (typeof url === 'string' && (url.includes('piwebapi') || url.includes('api.github'))) {
          window.__piv_logs.push({ level: 'net', message: 'Mock fetch: ' + url, timestamp: Date.now() });
          return Promise.resolve({
            ok: true,
            status: 200,
            json: function() { return Promise.resolve({ Items: [], Links: {} }); },
            text: function() { return Promise.resolve('{}'); }
          });
        }
        return origFetch ? origFetch.apply(window, arguments) : Promise.reject(new Error('fetch not available'));
      };

      // Mock Worker for WOW symbols
      window.__origWorker = window.Worker;
      window.Worker = function(url) {
        this.postMessage = noop;
        this.terminate = noop;
        this.onmessage = null;
        this.onerror = null;
        this.addEventListener = noop;
        this.removeEventListener = noop;
        window.__piv_logs.push({ level: 'info', message: 'Mock Worker created: ' + url, timestamp: Date.now() });
      };

      // Report ready
      window.__piv_ready = true;
    })();`;
  }

  // ─── Sandbox Mode ────────────────────────────────────────────

  /**
   * Create a hidden container for sandbox iframes
   */
  function ensureSandboxContainer() {
    if (_sandboxContainer) return _sandboxContainer;
    _sandboxContainer = document.createElement('div');
    _sandboxContainer.id = 'qa-runtime-sandbox';
    _sandboxContainer.style.cssText = 'position:fixed;top:-9999px;left:-9999px;width:1px;height:1px;overflow:hidden;pointer-events:none;';
    document.body.appendChild(_sandboxContainer);
    return _sandboxContainer;
  }

  /**
   * Run a single symbol in an isolated sandbox iframe
   * Returns: { errors: [], warnings: [], logs: [], registered: bool, initOk: bool }
   */
  function runSymbolInSandbox(symbolName, files, timeoutMs) {
    return new Promise((resolve) => {
      const timeout = timeoutMs || 5000;
      const container = ensureSandboxContainer();

      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'width:800px;height:600px;border:none;';
      iframe.sandbox = 'allow-scripts allow-same-origin';
      container.appendChild(iframe);

      let resolved = false;
      const cleanup = () => {
        if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
      };

      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          // Collect results even on timeout
          try {
            const win = iframe.contentWindow;
            resolve({
              symbolName,
              errors: win.__piv_errors || [],
              warnings: win.__piv_warnings || [],
              logs: win.__piv_logs || [],
              registered: !!(win.__piv_registered && win.__piv_registered.length > 0),
              initOk: false,
              timedOut: true
            });
          } catch (e) {
            resolve({
              symbolName,
              errors: [{ type: 'sandbox-error', context: 'timeout', message: 'Sandbox timed out', timestamp: Date.now() }],
              warnings: [], logs: [],
              registered: false, initOk: false, timedOut: true
            });
          }
          cleanup();
        }
      }, timeout);

      iframe.onload = () => {
        const doc = iframe.contentDocument;
        const win = iframe.contentWindow;

        try {
          // 1. Inject PI Vision mock environment
          const mockScript = doc.createElement('script');
          mockScript.textContent = getPIVisionMockScript();
          doc.head.appendChild(mockScript);

          // 2. Inject symbol CSS (if available)
          if (files.css?.content) {
            const style = doc.createElement('style');
            style.textContent = files.css.content;
            doc.head.appendChild(style);
          }

          // 3. Inject symbol HTML template
          if (files.template?.content) {
            const templateDiv = doc.createElement('div');
            templateDiv.id = 'sym-container';
            templateDiv.innerHTML = files.template.content;
            doc.body.appendChild(templateDiv);
          }

          // 4. Inject config HTML
          if (files.config?.content) {
            const configDiv = doc.createElement('div');
            configDiv.id = 'sym-config';
            configDiv.style.display = 'none';
            configDiv.innerHTML = files.config.content;
            doc.body.appendChild(configDiv);
          }

          // 5. Execute symbol JS
          if (files.js?.content) {
            const symScript = doc.createElement('script');
            symScript.textContent = files.js.content;
            doc.head.appendChild(symScript);
          }

          // 6. Try to instantiate the symbol
          setTimeout(() => {
            let initOk = false;
            try {
              const regs = win.__piv_registered || [];
              if (regs.length > 0) {
                const def = regs[0];
                if (def.visObjectType && def.getDefaultConfig) {
                  // Try creating an instance
                  const mockScope = {
                    symbol: { Name: 'Test', DataSources: ['pi:\\\\server\\sinusoid'] },
                    config: typeof def.getDefaultConfig === 'function' ? def.getDefaultConfig() : {},
                    runtimeData: { Value: { Value: 42, Timestamp: new Date().toISOString() } },
                    $watch: function() { return function() {}; },
                    $watchGroup: function() { return function() {}; },
                    $watchCollection: function() { return function() {}; },
                    $on: function() { return function() {}; },
                    $apply: function(fn) { if (fn) fn(); },
                    $applyAsync: function(fn) { if (fn) setTimeout(fn, 0); },
                    $digest: function() {},
                    $broadcast: function() {},
                    $emit: function() {},
                    $timeout: function(fn) { if (fn) setTimeout(fn, 0); },
                    $interval: function(fn) { return 0; }
                  };

                  const rawElement = doc.getElementById('sym-container') || doc.createElement('div');
                  // Wrap the element in angular.element() — symbols expect jqLite-wrapped elem
                  const mockElement = win.angular ? win.angular.element(rawElement) : rawElement;

                  // Instantiate the visualization constructor
                  if (typeof def.visObjectType === 'function') {
                    const instance = new def.visObjectType();
                    if (instance.init) {
                      // Build DI args from inject array (PI Vision injects $interval, $timeout etc.)
                      var diNoop = function(){};
                      var diMap = {
                        '$interval': (function(){ var iv = function(fn, ms) { return 0; }; iv.cancel = function(){}; return iv; })(),
                        '$timeout': (function(){ var to = function(fn, ms) { if (fn) setTimeout(fn, ms||0); return { then: function(cb){ if(cb) setTimeout(cb,0); return this; } }; }; to.cancel = function(){}; return to; })(),
                        '$http': function() { return Promise.resolve({ data: {} }); },
                        '$q': { when: function(v){ return Promise.resolve(v); }, defer: function(){ var d = {}; d.promise = new Promise(function(r,j){ d.resolve=r; d.reject=j; }); return d; } },
                        '$sce': { trustAsHtml: function(v){ return v; }, trustAsResourceUrl: function(v){ return v; } }
                      };
                      var args = [mockScope, mockElement];
                      var injectArr = def.inject || [];
                      for (var di = 0; di < injectArr.length; di++) {
                        args.push(diMap[injectArr[di]] || diNoop);
                      }
                      instance.init.apply(instance, args);
                      initOk = true;
                    }
                  }
                }
              }
            } catch (e) {
              win.__piv_errors.push({
                type: 'init-error',
                context: 'symbol.init()',
                message: e.message,
                stack: e.stack ? e.stack.substring(0, 500) : '',
                timestamp: Date.now()
              });
            }

            if (!resolved) {
              resolved = true;
              clearTimeout(timer);
              resolve({
                symbolName,
                errors: win.__piv_errors || [],
                warnings: win.__piv_warnings || [],
                logs: win.__piv_logs || [],
                registered: !!(win.__piv_registered && win.__piv_registered.length > 0),
                initOk,
                timedOut: false
              });
              cleanup();
            }
          }, 300); // Give symbol time to execute IIFE

        } catch (e) {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve({
              symbolName,
              errors: [{ type: 'sandbox-error', context: 'setup', message: e.message, timestamp: Date.now() }],
              warnings: [], logs: [],
              registered: false, initOk: false, timedOut: false
            });
            cleanup();
          }
        }
      };

      // Write a blank document to trigger onload
      iframe.src = 'about:blank';
    });
  }

  /**
   * Run all symbols through the sandbox sequentially
   */
  async function runAllInSandbox(symbolFiles, onProgress) {
    const names = Object.keys(symbolFiles);
    const results = {};
    let done = 0;

    for (const name of names) {
      const entry = symbolFiles[name];
      const files = entry.files ? entry.files : entry;

      if (onProgress) {
        onProgress(Math.round((done / names.length) * 100), `בדיקת runtime: ${name}`);
      }

      try {
        const result = await runSymbolInSandbox(name, files, 6000);
        results[name] = result;
      } catch (e) {
        results[name] = {
          symbolName: name,
          errors: [{ type: 'sandbox-crash', context: 'runSymbolInSandbox', message: e.message, timestamp: Date.now() }],
          warnings: [], logs: [],
          registered: false, initOk: false, timedOut: false
        };
      }

      done++;
    }

    if (onProgress) onProgress(100, 'בדיקת runtime הושלמה');

    // Store results
    Object.assign(_results, results);
    return results;
  }

  // ─── Emulator Bridge ─────────────────────────────────────────

  /**
   * Connect to the PI Vision emulator via postMessage
   */
  function connectEmulator(iframeOrUrl, origin) {
    _emulatorOrigin = origin || '*';

    if (typeof iframeOrUrl === 'string') {
      // URL — find or create iframe
      const existing = document.getElementById('qa-emulator-frame');
      if (existing) {
        _emulatorFrame = existing;
      }
    } else {
      _emulatorFrame = iframeOrUrl;
    }

    // Listen for messages from emulator
    if (!_onEmulatorMessage) {
      _onEmulatorMessage = (event) => {
        const data = event.data;
        if (!data || !data.type) return;

        switch (data.type) {
          case 'piv-emu-error':
            addEmulatorResult(data.symbolName, 'error', {
              type: data.errorType || 'runtime-error',
              context: data.context || 'emulator',
              message: data.message,
              stack: data.stack || '',
              file: data.file || '',
              line: data.line || 0,
              timestamp: data.timestamp || Date.now()
            });
            break;

          case 'piv-emu-warning':
            addEmulatorResult(data.symbolName, 'warning', {
              level: 'warn',
              message: data.message,
              timestamp: data.timestamp || Date.now()
            });
            break;

          case 'piv-emu-log':
            addEmulatorResult(data.symbolName, 'log', {
              level: data.level || 'log',
              message: data.message,
              timestamp: data.timestamp || Date.now()
            });
            break;

          case 'piv-emu-console-dump':
            // Bulk import of all console entries from emulator
            if (data.entries && Array.isArray(data.entries)) {
              data.entries.forEach(entry => {
                const target = entry.level === 'error' ? 'error' :
                               entry.level === 'warn' ? 'warning' : 'log';
                addEmulatorResult(data.symbolName, target, entry);
              });
            }
            break;

          case 'piv-emu-status':
            // Emulator reports symbol load status
            if (data.symbolName && _results[data.symbolName]) {
              _results[data.symbolName].emulatorLoaded = data.loaded;
              _results[data.symbolName].emulatorStatus = data.status;
            }
            break;
        }

        // Dispatch custom event for UI updates
        document.dispatchEvent(new CustomEvent('qa-runtime-update', {
          detail: { symbolName: data.symbolName, type: data.type }
        }));
      };

      window.addEventListener('message', _onEmulatorMessage);
    }
  }

  function addEmulatorResult(symbolName, type, entry) {
    if (!symbolName) return;

    if (!_results[symbolName]) {
      _results[symbolName] = {
        symbolName,
        errors: [], warnings: [], logs: [],
        registered: null, initOk: null, timedOut: false,
        emulatorSource: true
      };
    }

    const r = _results[symbolName];
    entry.source = 'emulator';

    if (type === 'error') r.errors.push(entry);
    else if (type === 'warning') r.warnings.push(entry);
    else r.logs.push(entry);
  }

  /**
   * Request error dump from emulator for a specific symbol
   */
  function requestEmulatorErrors(symbolName) {
    if (_emulatorFrame && _emulatorFrame.contentWindow) {
      _emulatorFrame.contentWindow.postMessage({
        type: 'piv-qa-request-errors',
        symbolName
      }, _emulatorOrigin);
    }
  }

  /**
   * Request the emulator to load and test a specific symbol
   */
  function requestEmulatorLoadSymbol(symbolName) {
    if (_emulatorFrame && _emulatorFrame.contentWindow) {
      _emulatorFrame.contentWindow.postMessage({
        type: 'piv-qa-load-symbol',
        symbolName
      }, _emulatorOrigin);
    }
  }

  // ─── Results API ─────────────────────────────────────────────

  function getResults(symbolName) {
    if (symbolName) return _results[symbolName] || null;
    return { ..._results };
  }

  function getAllResults() {
    return { ..._results };
  }

  function clearResults(symbolName) {
    if (symbolName) {
      delete _results[symbolName];
    } else {
      Object.keys(_results).forEach(k => delete _results[k]);
    }
  }

  /**
   * Generate a summary of runtime results
   */
  function getRuntimeSummary() {
    const names = Object.keys(_results);
    let totalErrors = 0, totalWarnings = 0;
    let registeredCount = 0, initOkCount = 0, failedCount = 0;

    names.forEach(name => {
      const r = _results[name];
      totalErrors += r.errors.length;
      totalWarnings += r.warnings.length;
      if (r.registered) registeredCount++;
      if (r.initOk) initOkCount++;
      if (r.errors.length > 0) failedCount++;
    });

    return {
      total: names.length,
      totalErrors,
      totalWarnings,
      registeredCount,
      initOkCount,
      failedCount,
      cleanCount: names.length - failedCount
    };
  }

  /**
   * Calculate a runtime score for a symbol (0-100)
   */
  function getSymbolRuntimeScore(symbolName) {
    const r = _results[symbolName];
    if (!r) return null;

    let score = 100;

    // Registration: -20 if not registered
    if (!r.registered) score -= 20;

    // Init: -15 if init failed
    if (r.registered && !r.initOk) score -= 15;

    // Each runtime error: -10
    const runtimeErrors = r.errors.filter(e => e.type !== 'console-error');
    score -= runtimeErrors.length * 10;

    // Each console.error: -5
    const consoleErrors = r.errors.filter(e => e.type === 'console-error');
    score -= consoleErrors.length * 5;

    // Each warning: -2
    score -= r.warnings.length * 2;

    // Timeout: -10
    if (r.timedOut) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  // ─── Disconnect ──────────────────────────────────────────────

  function disconnect() {
    if (_onEmulatorMessage) {
      window.removeEventListener('message', _onEmulatorMessage);
      _onEmulatorMessage = null;
    }
    if (_sandboxContainer && _sandboxContainer.parentNode) {
      _sandboxContainer.parentNode.removeChild(_sandboxContainer);
      _sandboxContainer = null;
    }
    _emulatorFrame = null;
  }

  // ─── Public API ──────────────────────────────────────────────

  return {
    // Sandbox mode
    runSymbolInSandbox,
    runAllInSandbox,

    // Emulator bridge
    connectEmulator,
    requestEmulatorErrors,
    requestEmulatorLoadSymbol,

    // Results
    getResults,
    getAllResults,
    clearResults,
    getRuntimeSummary,
    getSymbolRuntimeScore,

    // Lifecycle
    disconnect
  };

})();

export default QARuntime;
