/**
 * ================================================================
 *  PIV20-ULTRA  --  Shared Infrastructure for Symbol Upgrades
 * ================================================================
 *  Error shield  -  Config factory  -  Destroy helper
 *  Demo engine   -  Theme applicator  -  Keyboard manager
 *  Config I/O    -  Utility functions
 *
 *  Adapted from MU20-CORE (sym-mugult20 v1.4).
 *  Extends existing PIV20 namespace with PIV20.ultra.
 *  Does NOT break existing PIV20 helpers (createBus, safeWidget,
 *  safeApply, destroyHelper, initSymbol).
 *
 *  Version : ULTRA.1.0
 *  ES5 only (PI Vision convention)
 *  No external dependencies beyond PIV20.
 * ================================================================
 */
(function (root) {
    'use strict';

    var PIV20 = root.PIV20;
    if (!PIV20) {
        // PIV20 must already exist from sym-afbrowser20.js
        if (typeof console !== 'undefined' && console.error) {
            console.error('[PIV20U] PIV20 namespace not found. Load sym-afbrowser20.js first.');
        }
        return;
    }

    // Prevent double-init
    if (PIV20.ultra && PIV20.ultra._loaded) return;

    var U = PIV20.ultra = {};
    U._loaded = true;
    U.VERSION = 'ULTRA.1.0';


    // =========================================================
    //  1. ERROR SHIELD
    // =========================================================
    //  Adapted from MU20.shield (mu20-core.js lines 113-220).
    //  Wraps functions in try/catch, logs errors with rotating
    //  buffer partitioned by module name.
    // =========================================================

    U.shield = (function () {
        var _errorsByModule = {};
        var _globalErrors = [];
        var MAX = 200;

        function _getStore(moduleId) {
            if (!moduleId) return _globalErrors;
            if (!_errorsByModule[moduleId]) _errorsByModule[moduleId] = [];
            return _errorsByModule[moduleId];
        }

        return {
            /**
             * Wrap a function in try/catch. Returns a safe version.
             * @param {string} module  - module name (e.g. 'genblock20')
             * @param {string} fnName  - method name (e.g. 'onDataUpdate')
             * @param {Function} fn
             * @returns {Function}
             */
            wrap: function (module, fnName, fn) {
                var self = this;
                return function () {
                    try {
                        return fn.apply(this, arguments);
                    } catch (e) {
                        self.log(module, fnName, e);
                        return undefined;
                    }
                };
            },

            /**
             * Record an error.
             * @param {string} module
             * @param {string} fnName
             * @param {Error|string} error
             */
            log: function (module, fnName, error) {
                var entry = {
                    ts: new Date().toISOString(),
                    module: module,
                    fn: fnName,
                    msg: (error && error.message) ? error.message : String(error),
                    stack: (error && error.stack) ? error.stack : ''
                };
                var store = _getStore(module);
                store.push(entry);
                if (store.length > MAX) store.shift();
                if (module) {
                    _globalErrors.push(entry);
                    if (_globalErrors.length > MAX) _globalErrors.shift();
                }
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[PIV20U][' + module + '.' + fnName + ']', error);
                }
            },

            /**
             * Get collected errors (copy).
             * @param {string} [module] - omit for all errors
             */
            getErrors: function (module) {
                return _getStore(module).slice();
            },

            /**
             * Clear error log.
             * @param {string} [module] - omit to clear everything
             */
            clear: function (module) {
                if (module) {
                    var store = _errorsByModule[module];
                    if (store) store.length = 0;
                } else {
                    _globalErrors.length = 0;
                    for (var k in _errorsByModule) {
                        if (_errorsByModule.hasOwnProperty(k)) {
                            _errorsByModule[k].length = 0;
                        }
                    }
                }
            },

            /**
             * Render an inline error fallback inside a container element.
             * @param {HTMLElement} el
             * @param {string} label
             * @param {Error} err
             */
            renderFallback: function (el, label, err) {
                var div = document.createElement('div');
                div.className = 'piv20u-error-fallback';
                div.setAttribute('dir', 'rtl');
                div.innerHTML = '<span>\u26A0 \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA ' + U.escapeHtml(label) + '</span>' +
                    '<br><small>' + U.escapeHtml((err && err.message) || '') + '</small>';
                if (el && el.innerHTML !== undefined) {
                    el.innerHTML = '';
                    el.appendChild(div);
                }
            }
        };
    })();


    // =========================================================
    //  2. CONFIG FACTORY
    // =========================================================
    //  Adapted from MU20.config (mu20-core.js lines 1397-1533).
    //  Factory pattern — each symbol creates its own validator
    //  with its own DEFAULTS.
    // =========================================================

    /**
     * Create a config validator scoped to a symbol's DEFAULTS.
     * @param {Object} defaults - default config values for the symbol
     * @returns {{ DEFAULTS, validate, normalize, mapEditor, migrate }}
     */
    U.configFactory = function (defaults) {
        var DEFAULTS = {};
        for (var k in defaults) {
            if (defaults.hasOwnProperty(k)) DEFAULTS[k] = defaults[k];
        }

        return {
            DEFAULTS: DEFAULTS,

            /**
             * Map editor config panel names to runtime names.
             * Handles common aliases across all symbols.
             */
            mapEditor: function (cfg) {
                if (!cfg) return cfg;
                if (cfg.WarnPct !== undefined) cfg.WarnThreshold = Number(cfg.WarnPct);
                if (cfg.CritPct !== undefined) cfg.CritThreshold = Number(cfg.CritPct);
                if (cfg.RefreshInterval !== undefined) cfg.DataUpdateInterval = Number(cfg.RefreshInterval) * 1000;
                return cfg;
            },

            /**
             * Migrate from older schema versions.
             */
            migrate: function (cfg) {
                if (!cfg) return JSON.parse(JSON.stringify(DEFAULTS));
                if (!cfg.version || cfg.version < (DEFAULTS.version || 1)) {
                    cfg.version = DEFAULTS.version || 1;
                    // v0->v1: rename old lowercase fields
                    if (cfg.warnPct !== undefined && cfg.WarnThreshold === undefined) {
                        cfg.WarnThreshold = cfg.warnPct;
                    }
                    if (cfg.critPct !== undefined && cfg.CritThreshold === undefined) {
                        cfg.CritThreshold = cfg.critPct;
                    }
                }
                this.mapEditor(cfg);
                return cfg;
            },

            /**
             * Clamp and coerce values to valid ranges.
             */
            normalize: function (cfg) {
                if (cfg.WarnThreshold !== undefined) {
                    cfg.WarnThreshold = Math.max(1, Math.min(99, Number(cfg.WarnThreshold) || DEFAULTS.WarnThreshold || 70));
                }
                if (cfg.CritThreshold !== undefined) {
                    cfg.CritThreshold = Math.max((cfg.WarnThreshold || 70) + 1, Math.min(100, Number(cfg.CritThreshold) || DEFAULTS.CritThreshold || 90));
                }
                if (cfg.Decimals !== undefined) {
                    cfg.Decimals = Math.max(0, Math.min(6, Math.round(Number(cfg.Decimals)))) || 0;
                }
                if (cfg.fontSize !== undefined) {
                    cfg.fontSize = Math.max(8, Math.min(24, Number(cfg.fontSize) || DEFAULTS.fontSize || 12));
                }
                if (cfg.MaxAlerts !== undefined) {
                    cfg.MaxAlerts = Math.max(10, Math.min(500, Number(cfg.MaxAlerts) || 50));
                }
                if (cfg.StaleThreshold !== undefined) {
                    cfg.StaleThreshold = Math.max(30, Math.min(3600, Number(cfg.StaleThreshold) || 300));
                }
                return cfg;
            },

            /**
             * Full validation: migrate → fill defaults → normalize.
             */
            validate: function (cfg) {
                cfg = this.migrate(cfg);
                for (var key in DEFAULTS) {
                    if (DEFAULTS.hasOwnProperty(key) && cfg[key] === undefined) {
                        cfg[key] = DEFAULTS[key];
                    }
                }
                cfg = this.normalize(cfg);
                return cfg;
            }
        };
    };


    // =========================================================
    //  3. ENHANCED DESTROY HELPER
    // =========================================================
    //  Adapted from MU20.destroyHelper (mu20-core.js lines 1267-1353).
    //  Cleans up all tracked resources in a context object.
    // =========================================================

    /**
     * Clean up all resources tracked in a context object.
     * @param {Object} ctx - {
     *   intervals: [],  $interval: angularService,
     *   timeouts:  [],  $timeout:  angularService,
     *   nativeTimers: [],  (setInterval/setTimeout handles)
     *   unwatchers: [],
     *   xhrs: [],
     *   listeners: [{ el, event, fn }],
     *   observers: [IntersectionObserver],
     *   widgets: [{ destroy } | { $el, name }],
     *   rafs: [requestAnimationFrame id],
     *   bus: eventBus
     * }
     */
    U.destroyHelper = function (ctx) {
        var i;

        // Cancel $interval handles
        if (ctx.intervals && ctx.$interval) {
            for (i = 0; i < ctx.intervals.length; i++) {
                try { ctx.$interval.cancel(ctx.intervals[i]); } catch (e) { /* ignore */ }
            }
            ctx.intervals.length = 0;
        }

        // Cancel $timeout handles
        if (ctx.timeouts && ctx.$timeout) {
            for (i = 0; i < ctx.timeouts.length; i++) {
                try { ctx.$timeout.cancel(ctx.timeouts[i]); } catch (e) { /* ignore */ }
            }
            ctx.timeouts.length = 0;
        }

        // Cancel native timers (setInterval / setTimeout)
        if (ctx.nativeTimers) {
            for (i = 0; i < ctx.nativeTimers.length; i++) {
                try { clearInterval(ctx.nativeTimers[i]); clearTimeout(ctx.nativeTimers[i]); } catch (e) { /* ignore */ }
            }
            ctx.nativeTimers.length = 0;
        }

        // Deregister scope watchers
        if (ctx.unwatchers) {
            for (i = 0; i < ctx.unwatchers.length; i++) {
                try { ctx.unwatchers[i](); } catch (e) { /* ignore */ }
            }
            ctx.unwatchers.length = 0;
        }

        // Abort pending XHRs
        if (ctx.xhrs) {
            for (i = 0; i < ctx.xhrs.length; i++) {
                try { ctx.xhrs[i].abort(); } catch (e) { /* ignore */ }
            }
            ctx.xhrs.length = 0;
        }

        // Disconnect IntersectionObservers
        if (ctx.observers) {
            for (i = 0; i < ctx.observers.length; i++) {
                try { ctx.observers[i].disconnect(); } catch (e) { /* ignore */ }
            }
            ctx.observers.length = 0;
        }

        // Remove event listeners
        if (ctx.listeners) {
            for (i = 0; i < ctx.listeners.length; i++) {
                try {
                    var l = ctx.listeners[i];
                    if (l.el && l.el.removeEventListener) {
                        l.el.removeEventListener(l.event, l.fn);
                    }
                } catch (e) { /* ignore */ }
            }
            ctx.listeners.length = 0;
        }

        // Destroy widgets
        if (ctx.widgets) {
            for (i = 0; i < ctx.widgets.length; i++) {
                try {
                    var w = ctx.widgets[i];
                    if (w && w.destroy && typeof w.destroy === 'function') {
                        w.destroy();
                    } else if (w && w.$el && w.name && w.$el[w.name]) {
                        w.$el[w.name]('destroy');
                    }
                } catch (e) { /* ignore */ }
            }
            ctx.widgets.length = 0;
        }

        // Cancel requestAnimationFrame handles
        if (ctx.rafs) {
            for (i = 0; i < ctx.rafs.length; i++) {
                try { cancelAnimationFrame(ctx.rafs[i]); } catch (e) { /* ignore */ }
            }
            ctx.rafs.length = 0;
        }

        // Reset bus
        if (ctx.bus && ctx.bus.reset) {
            try { ctx.bus.reset(); } catch (e) { /* ignore */ }
        }
    };


    // =========================================================
    //  4. DEMO DATA ENGINE
    // =========================================================
    //  Domain-specific synthetic data generators for each
    //  symbol type. Call PIV20.ultra.demo.generate(type, opts).
    // =========================================================

    U.demo = {
        /**
         * Generate synthetic data for a specific symbol type.
         * @param {string} type - 'genblock' | 'constmon' | 'maindash' | 'co2emis'
         * @param {Object} [opts] - { unitCount, siteCount, ... }
         * @returns {Array} array of data items matching the symbol's expected shape
         */
        generate: function (type, opts) {
            opts = opts || {};
            switch (type) {
                case 'genblock':  return U.demo._genblock(opts);
                case 'constmon':  return U.demo._constmon(opts);
                case 'maindash':  return U.demo._maindash(opts);
                case 'co2emis':   return U.demo._co2emis(opts);
                default:          return [];
            }
        },

        /**
         * Generator Block — fake generator units with MW, state, ramp, efficiency.
         */
        _genblock: function (opts) {
            var count = opts.unitCount || 8;
            var states = ['active', 'active', 'active', 'starting', 'standby', 'fault', 'maintenance', 'off'];
            var names = ['\u05D0\u05D5\u05E8\u05D5\u05EA 1', '\u05D0\u05D5\u05E8\u05D5\u05EA 2', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 1', '\u05D0\u05D9\u05DC\u05EA 1',
                '\u05D0\u05D9\u05EA\u05DF 1', '\u05D0\u05E9\u05DB\u05D5\u05DC 1', '\u05D7\u05D2\u05D9\u05EA 1', '\u05E8\u05D3\u05D9\u05E0\u05D2 1'];
            var items = [];
            for (var i = 0; i < count; i++) {
                var state = states[i % states.length];
                var mw = state === 'active' ? 100 + Math.round(Math.random() * 400) : 0;
                items.push({
                    Label: names[i % names.length] || '\u05D9\u05D7\u05D9\u05D3\u05D4 ' + (i + 1),
                    Value: mw,
                    Path: 'demo\\unit' + i + '|MW',
                    Time: new Date().toISOString(),
                    Good: true,
                    _demo: {
                        stateId: state,
                        rated: 500,
                        utilization: state === 'active' ? Math.round((mw / 500) * 100) : 0,
                        rampRate: state === 'active' ? (Math.random() * 10 - 5).toFixed(1) : '0.0',
                        efficiency: state === 'active' ? (85 + Math.random() * 10).toFixed(1) : '0.0',
                        sparkline: U.demo._sparkline(20)
                    }
                });
            }
            return items;
        },

        /**
         * Constraint Monitor — fake constraint quotas and usage.
         */
        _constmon: function (opts) {
            var count = opts.unitCount || 6;
            var names = ['\u05D0\u05D5\u05E8\u05D5\u05EA 1', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 1', '\u05D0\u05D9\u05DC\u05EA 1', '\u05D0\u05D9\u05EA\u05DF 1', '\u05D0\u05E9\u05DB\u05D5\u05DC 1', '\u05D7\u05D2\u05D9\u05EA 1'];
            var items = [];
            for (var i = 0; i < count; i++) {
                var hours = Math.round(Math.random() * 8000);
                var quota = 8760;
                var pct = Math.round((hours / quota) * 1000) / 10;
                items.push({
                    Label: names[i % names.length] || '\u05D9\u05D7\u05D9\u05D3\u05D4 ' + (i + 1),
                    Value: hours,
                    Path: 'demo\\unit' + i + '|Hours',
                    Time: new Date().toISOString(),
                    Good: true,
                    _demo: {
                        quota: quota,
                        pct: pct,
                        co2: Math.round(Math.random() * 50000),
                        fuel: Math.round(Math.random() * 10000),
                        starts: Math.round(Math.random() * 100),
                        maint: Math.round(Math.random() * 2000),
                        status: pct >= 95 ? 'critical' : pct >= 80 ? 'warning' : 'normal'
                    }
                });
            }
            return items;
        },

        /**
         * Main Dashboard — fake sites with aggregated production, demand.
         */
        _maindash: function (opts) {
            var siteCount = opts.siteCount || 5;
            var siteNames = ['\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2', '\u05D0\u05D9\u05DC\u05EA', '\u05D0\u05D9\u05EA\u05DF', '\u05D0\u05E9\u05DB\u05D5\u05DC'];
            var items = [];
            for (var s = 0; s < siteCount; s++) {
                var production = 200 + Math.round(Math.random() * 800);
                var capacity = 1000 + Math.round(Math.random() * 500);
                var demand = production * (0.7 + Math.random() * 0.5);
                items.push({
                    Label: siteNames[s % siteNames.length] || '\u05D0\u05EA\u05E8 ' + (s + 1),
                    Value: production,
                    Path: 'demo\\site' + s + '|Production',
                    Time: new Date().toISOString(),
                    Good: true,
                    _demo: {
                        production: production,
                        demand: Math.round(demand),
                        capacity: capacity,
                        loadPct: Math.round((production / capacity) * 100),
                        efficiency: (80 + Math.random() * 15).toFixed(1),
                        co2: (production * 0.05 + Math.random() * 10).toFixed(1),
                        activeUnits: 2 + Math.floor(Math.random() * 4),
                        totalUnits: 4 + Math.floor(Math.random() * 3),
                        status: production / capacity > 0.9 ? 'critical' : production / capacity > 0.7 ? 'warning' : 'normal',
                        trendData: U.demo._trendLine(30)
                    }
                });
            }
            return items;
        },

        /**
         * CO2 Emissions — fake emission values, factors, fuel breakdown.
         */
        _co2emis: function (opts) {
            var count = opts.unitCount || 6;
            var fuels = ['\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', '\u05E4\u05D7\u05DD', '\u05D3\u05D9\u05D6\u05DC', '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', '\u05E1\u05D5\u05DC\u05E8\u05D9', '\u05E8\u05D5\u05D7'];
            var names = ['\u05D0\u05D5\u05E8\u05D5\u05EA 1', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 1', '\u05D0\u05D9\u05DC\u05EA 1', '\u05D0\u05D9\u05EA\u05DF 1', '\u05D0\u05E9\u05DB\u05D5\u05DC 1', '\u05D7\u05D2\u05D9\u05EA 1'];
            var items = [];
            for (var i = 0; i < count; i++) {
                var emission = Math.round(Math.random() * 150);
                var production = 100 + Math.round(Math.random() * 400);
                var factor = +(emission / Math.max(production, 1)).toFixed(3);
                items.push({
                    Label: names[i % names.length] || '\u05D9\u05D7\u05D9\u05D3\u05D4 ' + (i + 1),
                    Value: emission,
                    Path: 'demo\\unit' + i + '|CO2',
                    Time: new Date().toISOString(),
                    Good: true,
                    _demo: {
                        emission: emission,
                        production: production,
                        factor: factor,
                        fuel: fuels[i % fuels.length],
                        severity: emission > 100 ? 'crit' : emission > 50 ? 'warn' : 'ok'
                    }
                });
            }
            return items;
        },

        /** Generate a sparkline data array. */
        _sparkline: function (points) {
            var arr = [];
            var v = 50 + Math.random() * 50;
            for (var i = 0; i < points; i++) {
                v = Math.max(0, Math.min(100, v + (Math.random() - 0.5) * 20));
                arr.push(Math.round(v));
            }
            return arr;
        },

        /** Generate trend line data points. */
        _trendLine: function (points) {
            var arr = [];
            var base = 300 + Math.random() * 200;
            var now = Date.now();
            for (var i = 0; i < points; i++) {
                base = Math.max(100, Math.min(800, base + (Math.random() - 0.48) * 30));
                arr.push({
                    ts: new Date(now - (points - i) * 60000).toISOString(),
                    value: Math.round(base)
                });
            }
            return arr;
        }
    };


    // =========================================================
    //  5. THEME APPLICATOR (CSS Variables, no Shadow DOM)
    // =========================================================
    //  Adapted from MU20.applyTheme (mu20-core.js lines 619-638).
    //  Uses symbol-specific prefix to avoid CSS variable collisions.
    // =========================================================

    /**
     * Apply CSS custom properties from config to the root element.
     * @param {HTMLElement} rootEl - the symbol's root DOM element
     * @param {Object} cfg - scope.config
     * @param {string} prefix - CSS variable prefix (e.g. 'gb20', 'ct20')
     */
    U.applyTheme = function (rootEl, cfg, prefix) {
        if (!rootEl || !rootEl.style || !rootEl.style.setProperty) return;
        var p = '--' + prefix + '-';
        var map = {};
        map[p + 'accent']      = cfg.accentColor;
        map[p + 'warn']        = cfg.warningColor;
        map[p + 'crit']        = cfg.criticalColor;
        map[p + 'good']        = cfg.goodColor;
        map[p + 'font-family'] = cfg.fontFamily;
        map[p + 'font-size']   = (cfg.fontSize || 12) + 'px';
        // Generic theme props
        map[p + 'bg']          = cfg.bgColor;
        map[p + 'surface']     = cfg.surfaceColor;
        map[p + 'text']        = cfg.textColor;

        for (var prop in map) {
            if (map.hasOwnProperty(prop) && map[prop] !== undefined && map[prop] !== null) {
                try { rootEl.style.setProperty(prop, map[prop]); } catch (e) { /* legacy guard */ }
            }
        }
    };


    // =========================================================
    //  6. KEYBOARD SHORTCUT MANAGER
    // =========================================================
    //  Adapted from sym-mugult20.js lines 686-711.
    //  Scopes listeners to a root element (not document).
    // =========================================================

    U.keyboard = (function () {
        var _handlerMap = new (root.WeakMap || function FakeWeakMap() {
            var items = [];
            this.get = function (k) { for (var i = 0; i < items.length; i++) { if (items[i].k === k) return items[i].v; } return undefined; };
            this.set = function (k, v) { for (var i = 0; i < items.length; i++) { if (items[i].k === k) { items[i].v = v; return; } } items.push({k:k,v:v}); };
            this['delete'] = function (k) { for (var i = 0; i < items.length; i++) { if (items[i].k === k) { items.splice(i, 1); return; } } };
        })();

        return {
            /**
             * Attach keyboard shortcuts to a root element.
             * @param {HTMLElement} rootEl
             * @param {Object} handlers - { 'ctrl+k': fn, '1': fn, 'Escape': fn, ... }
             */
            attach: function (rootEl, handlers) {
                if (!rootEl || !handlers) return;

                // Make focusable
                if (!rootEl.getAttribute('tabindex')) {
                    rootEl.setAttribute('tabindex', '0');
                }

                var onKeyDown = function (e) {
                    var key = e.key;
                    var combo = '';
                    if (e.ctrlKey) combo += 'ctrl+';
                    if (e.altKey) combo += 'alt+';
                    if (e.shiftKey) combo += 'shift+';
                    combo += key;

                    // Try combo first, then plain key
                    var fn = handlers[combo] || handlers[key];
                    if (fn) {
                        e.preventDefault();
                        try { fn(e); } catch (err) {
                            U.shield.log('keyboard', combo, err);
                        }
                    }
                };

                rootEl.addEventListener('keydown', onKeyDown);
                _handlerMap.set(rootEl, onKeyDown);

                // Focus with small delay
                setTimeout(function () { try { rootEl.focus(); } catch (e) { /* ignore */ } }, 200);
            },

            /**
             * Remove keyboard shortcuts from a root element.
             * @param {HTMLElement} rootEl
             */
            detach: function (rootEl) {
                if (!rootEl) return;
                var fn = _handlerMap.get(rootEl);
                if (fn) {
                    rootEl.removeEventListener('keydown', fn);
                    _handlerMap['delete'](rootEl);
                }
            }
        };
    })();


    // =========================================================
    //  7. CONFIG IMPORT / EXPORT
    // =========================================================
    //  Adapted from sym-mugult20.js lines 763-801.
    //  JSON-based config backup and restore.
    // =========================================================

    U.configIO = {
        /**
         * Export config as JSON file download.
         * @param {Object} cfg - scope.config
         * @param {string} prefix - filename prefix (e.g. 'genblock20')
         */
        exportJSON: function (cfg, prefix) {
            if (!cfg) return;
            var json = JSON.stringify(cfg, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = (prefix || 'config') + '-' + new Date().toISOString().slice(0, 10) + '.json';
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            setTimeout(function () {
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            }, 100);
        },

        /**
         * Import config from a JSON file.
         * @param {File} file - File object from input[type=file]
         * @param {Object} currentCfg - current scope.config (will be merged into)
         * @param {Object} validator - config validator from configFactory()
         * @param {Function} callback - called after merge
         */
        importJSON: function (file, currentCfg, validator, callback) {
            if (!file || !currentCfg || !validator) return;

            var reader = new FileReader();
            reader.onload = function (e) {
                try {
                    var imported = JSON.parse(e.target.result);
                    // Merge imported values into current config
                    for (var key in imported) {
                        if (imported.hasOwnProperty(key) && key !== 'version') {
                            currentCfg[key] = imported[key];
                        }
                    }
                    validator.validate(currentCfg);
                    if (callback) callback(null, currentCfg);
                } catch (err) {
                    U.shield.log('configIO', 'importJSON', err);
                    if (callback) callback(err);
                }
            };
            reader.onerror = function () {
                var err = new Error('Failed to read config file');
                U.shield.log('configIO', 'importJSON', err);
                if (callback) callback(err);
            };
            reader.readAsText(file);
        },

        /**
         * Scope reference for config import workaround.
         * Stored per-symbol: _activeScopes[symbolName] = scope.
         */
        _activeScopes: {}
    };


    // =========================================================
    //  8. UTILITY FUNCTIONS
    // =========================================================
    //  Adapted from MU20 utilities (mu20-core.js lines 441-551).
    // =========================================================

    /**
     * Escape HTML entities for safe insertion.
     */
    U.escapeHtml = function (str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * Format a number with optional thousands separator and decimal places.
     */
    U.formatNum = function (val, decimals, useSep) {
        if (val === null || val === undefined || isNaN(val)) return '--';
        decimals = (decimals !== undefined) ? decimals : 1;
        useSep = (useSep !== undefined) ? useSep : true;
        var fixed = Number(val).toFixed(decimals);
        if (!useSep) return fixed;
        var parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    };

    /**
     * Format a Date to locale-friendly string.
     */
    U.formatDate = function (dt, fmt) {
        if (!dt) return '--';
        var d = (dt instanceof Date) ? dt : new Date(dt);
        if (isNaN(d.getTime())) return '--';
        var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
        var day  = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
        var time = pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        if (fmt === 'date') return day;
        if (fmt === 'time') return time;
        return day + ' ' + time;
    };

    /**
     * Export array of objects as CSV and trigger download.
     */
    U.exportCsv = function (rows, filename) {
        if (!rows || !rows.length) return;
        var keys = Object.keys(rows[0]);
        var csv = '\uFEFF' + keys.join(',') + '\n';
        for (var i = 0; i < rows.length; i++) {
            var line = [];
            for (var k = 0; k < keys.length; k++) {
                var val = rows[i][keys[k]];
                if (val === null || val === undefined) val = '';
                val = String(val).replace(/"/g, '""');
                line.push('"' + val + '"');
            }
            csv += line.join(',') + '\n';
        }
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = filename || 'export.csv';
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);
    };

    /**
     * Debounce a function.
     * @param {Function} fn
     * @param {number} delay - milliseconds
     * @param {boolean} [immediate] - fire on leading edge
     * @returns {Function}
     */
    U.debounce = function (fn, delay, immediate) {
        var timer = null;
        return function () {
            var ctx = this, args = arguments;
            var later = function () {
                timer = null;
                if (!immediate) fn.apply(ctx, args);
            };
            var callNow = immediate && !timer;
            clearTimeout(timer);
            timer = setTimeout(later, delay);
            if (callNow) fn.apply(ctx, args);
        };
    };

    /**
     * Clamp a value between min and max.
     */
    U.clamp = function (val, min, max) {
        return Math.max(min, Math.min(max, val));
    };

    /**
     * Determine status from percentage and thresholds.
     * @param {number} pct
     * @param {number} warnPct - default 70
     * @param {number} critPct - default 90
     * @returns {string} 'ok' | 'warning' | 'critical'
     */
    U.getStatus = function (pct, warnPct, critPct) {
        warnPct = warnPct || 70;
        critPct = critPct || 90;
        if (pct >= critPct) return 'critical';
        if (pct >= warnPct) return 'warning';
        return 'ok';
    };


    // =========================================================
    //  9. STATS HELPERS
    // =========================================================

    U.stats = {
        min: function (arr) {
            if (!arr || !arr.length) return 0;
            var m = arr[0];
            for (var i = 1; i < arr.length; i++) { if (arr[i] < m) m = arr[i]; }
            return m;
        },
        max: function (arr) {
            if (!arr || !arr.length) return 0;
            var m = arr[0];
            for (var i = 1; i < arr.length; i++) { if (arr[i] > m) m = arr[i]; }
            return m;
        },
        sum: function (arr) {
            var s = 0;
            for (var i = 0; arr && i < arr.length; i++) s += (arr[i] || 0);
            return s;
        },
        avg: function (arr) {
            return (arr && arr.length) ? this.sum(arr) / arr.length : 0;
        }
    };


    // =========================================================
    //  INIT COMPLETE
    // =========================================================

    if (typeof console !== 'undefined' && console.log) {
        console.log('[PIV20U] Ultra infrastructure loaded v' + U.VERSION);
    }

})(window);
