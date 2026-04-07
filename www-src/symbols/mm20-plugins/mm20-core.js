/**
 * ═══════════════════════════════════════════════════════
 *  MM20-CORE  —  Mugbalot Monitor v20 Infrastructure
 * ═══════════════════════════════════════════════════════
 *  Signal bus · Error shield · Stats · Demo engine
 *  SITES array · Utility functions
 *
 *  Version : 20.0.R1
 *  ES5 only — IE11 compatible
 *  Loaded FIRST via <script> in template; all widgets
 *  depend on window.MM20 namespace.
 * ═══════════════════════════════════════════════════════
 */
(function (root) {
    'use strict';

    // Prevent double-init — merge with existing MM20 (may be pre-populated by emu-shims)
    var MM20 = root.MM20 = root.MM20 || {};
    if (MM20._coreLoaded) return;
    MM20._coreLoaded = true;
    MM20._loaded = true;
    MM20.VERSION = MM20.VERSION || '20.0.R1';


    // ═══════════════════════════════════════
    //  DEBUG MODE
    // ═══════════════════════════════════════
    /**
     * Toggle via browser console:  MM20_DEBUG = true
     * Enables verbose logging for data flow, API calls,
     * lifecycle events, and worker messages.
     * Zero overhead when off (simple boolean gate).
     */
    MM20.debug = function (module, msg, data) {
        if (!root.MM20_DEBUG) return;
        var prefix = '[MM20' + (module ? ':' + module : '') + ']';
        if (data !== undefined) {
            console.log(prefix, msg, data);
        } else {
            console.log(prefix, msg);
        }
    };

    MM20.debugWarn = function (module, msg, data) {
        if (!root.MM20_DEBUG) return;
        var prefix = '[MM20' + (module ? ':' + module : '') + ']';
        if (data !== undefined) {
            console.warn(prefix, msg, data);
        } else {
            console.warn(prefix, msg);
        }
    };

    MM20.debugTable = function (module, label, rows) {
        if (!root.MM20_DEBUG) return;
        console.log('[MM20:' + module + '] ' + label);
        if (console.table && rows) { console.table(rows); }
    };


    // ═══════════════════════════════════════
    //  0. DYNAMIC BASE PATH + LOADERS
    // ═══════════════════════════════════════

    /**
     * Auto-detect ext/ base path from the <script> that loaded mm20-core.js.
     * Falls back to the standard PI Vision path if detection fails.
     */
    MM20.basePath = (function () {
        var scripts = document.getElementsByTagName('script');
        var i, src, base;

        for (i = scripts.length - 1; i >= 0; i--) {
            src = scripts[i].getAttribute('src') || '';
            if (src.indexOf('mm20-plugins/mm20-core.js') >= 0) {
                base = src.substring(0, src.lastIndexOf('/') + 1);   // .../ext/mm20-plugins/
                return base.replace(/mm20-plugins\/$/, '');           // .../ext/
            }
        }

        var _m = window.location.pathname.match(/^(\/[^\/]+)\//); return (_m ? _m[1] : '/PIVision') + '/Extensibility/';
    })();

    /**
     * Resolve a relative path against basePath.
     * @param {string} relativePath — e.g. 'icons/mm20.png'
     * @returns {string}
     */
    MM20.resolveUrl = function (relativePath) {
        relativePath = (relativePath || '').replace(/^\/+/, '');
        return MM20.basePath + relativePath;
    };

    /**
     * Load a script exactly once (idempotent, async, sequential).
     * @param {string} url
     * @param {Function} [done] — callback(err)
     */
    MM20.ensureScript = (function () {
        var registry = {};

        return function (url, done) {
            MM20.debug('loader', 'ensureScript: ' + url);
            var state = registry[url];
            var head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
            var s;

            if (state && state.loaded) {
                MM20.debug('loader', 'already loaded: ' + url);
                done && done(null);
                return;
            }

            if (state && state.loading) {
                if (done) state.callbacks.push(done);
                return;
            }

            registry[url] = {
                loading: true,
                loaded: false,
                callbacks: done ? [done] : []
            };

            s = document.createElement('script');
            s.type = 'text/javascript';
            s.async = true;
            s.src = url;

            s.onload = function () {
                var cbs = registry[url].callbacks || [];
                registry[url].loading = false;
                registry[url].loaded = true;
                for (var ci = 0; ci < cbs.length; ci++) {
                    try { cbs[ci](null); } catch (ignore) {}
                }
                registry[url].callbacks = [];
            };

            s.onerror = function () {
                var cbs = registry[url].callbacks || [];
                registry[url].loading = false;
                registry[url].loaded = false;
                for (var ci = 0; ci < cbs.length; ci++) {
                    try { cbs[ci](new Error('Failed loading: ' + url)); } catch (ignore) {}
                }
                registry[url].callbacks = [];
            };

            head.appendChild(s);
        };
    })();

    /**
     * Load an ordered list of scripts sequentially.
     * @param {string[]} urls
     * @param {Function} [done] — callback(err)
     */
    MM20.loadScripts = function (urls, done) {
        MM20.debug('loader', 'loadScripts: ' + urls.length + ' scripts queued');
        var i = 0;

        function next(err) {
            if (err) {
                MM20.debugWarn('loader', 'loadScripts failed at index ' + (i - 1), err);
                done && done(err);
                return;
            }
            if (i >= urls.length) {
                MM20.debug('loader', 'loadScripts: all ' + urls.length + ' loaded');
                done && done(null);
                return;
            }
            MM20.ensureScript(urls[i++], next);
        }

        next();
    };

    /**
     * Inject a <link rel="stylesheet"> if not already present.
     * @param {string} url
     */
    MM20.ensureStyle = function (url) {
        var links = document.getElementsByTagName('link');
        var i, href, link, head;

        for (i = 0; i < links.length; i++) {
            href = links[i].getAttribute('href') || '';
            if (href === url) return;
        }

        head = document.head || document.getElementsByTagName('head')[0] || document.documentElement;
        link = document.createElement('link');
        link.rel = 'stylesheet';
        link.type = 'text/css';
        link.href = url;
        head.appendChild(link);
    };


    // ═══════════════════════════════════════
    //  1. SIGNAL BUS  (per-instance factory)
    // ═══════════════════════════════════════

    /**
     * Creates a fresh, isolated pub/sub bus.
     * Each symbol instance gets its own bus so events
     * never leak between multiple monitors on one display.
     *
     * @returns {{ on, off, emit, once, reset }}
     */
    MM20.createBus = function () {
        var _channels = {};
        var _destroyed = false;

        return {
            /**
             * Subscribe to a channel.
             * @param {string} channel
             * @param {Function} fn
             * @param {Object} [ctx] - optional `this` context
             */
            on: function (channel, fn, ctx) {
                if (_destroyed) return;
                if (!_channels[channel]) _channels[channel] = [];
                _channels[channel].push({ fn: fn, ctx: ctx || null });
            },

            /**
             * Unsubscribe a specific handler from a channel.
             */
            off: function (channel, fn) {
                if (!fn) return;
                var subs = _channels[channel];
                if (!subs) return;
                for (var i = subs.length - 1; i >= 0; i--) {
                    if (subs[i].fn === fn) subs.splice(i, 1);
                }
            },

            /**
             * Publish data to all subscribers on a channel.
             * Each handler is error-shielded — a throwing subscriber
             * never breaks other subscribers.
             */
            emit: function (channel, data) {
                if (_destroyed) return;
                MM20.debug('bus', 'emit ' + channel, data);
                var subs = _channels[channel];
                if (!subs) return;
                var snapshot = subs.slice();
                for (var i = 0; i < snapshot.length; i++) {
                    try {
                        snapshot[i].fn.call(snapshot[i].ctx, data);
                    } catch (e) {
                        MM20.shield.log('bus:' + channel, 'emit', e);
                    }
                }
            },

            /**
             * Subscribe once — auto-removes after first call.
             */
            once: function (channel, fn, ctx) {
                var self = this;
                var wrapper = function (data) {
                    self.off(channel, wrapper);
                    fn.call(ctx || null, data);
                };
                this.on(channel, wrapper, ctx);
            },

            /**
             * Drop all subscriptions (called on $destroy).
             */
            reset: function () {
                _channels = {};
            },

            /**
             * Permanently disable the bus (aligned with mu20-core).
             * After destroy(), on/emit become no-ops.
             */
            destroy: function () {
                _destroyed = true;
                _channels = {};
            }
        };
    };


    // ═══════════════════════════════════════
    //  2. ERROR SHIELD
    // ═══════════════════════════════════════

    MM20.shield = (function () {
        var _errors = [];
        var MAX = 200;

        return {
            /**
             * Wrap a function in try/catch. Returns a safe version.
             * @param {string} source  - widget name (e.g. 'siteGrid')
             * @param {string} fnName  - method name (e.g. 'dataUpdate')
             * @param {Function} fn
             * @returns {Function}
             */
            wrap: function (source, fnName, fn) {
                var self = this;
                return function () {
                    try {
                        return fn.apply(this, arguments);
                    } catch (e) {
                        self.log(source, fnName, e);
                        return undefined;
                    }
                };
            },

            /**
             * Record an error.
             */
            log: function (source, fnName, error) {
                var entry = {
                    ts: new Date().toISOString(),
                    source: source,
                    fn: fnName,
                    msg: (error && error.message) ? error.message : String(error),
                    stack: (error && error.stack) ? error.stack : ''
                };
                _errors.push(entry);
                if (_errors.length > MAX) _errors.shift();

                // Console output for developers
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[MM20][' + source + '.' + fnName + ']', error);
                }
            },

            /**
             * Get all collected errors (copy).
             */
            getErrors: function () {
                return _errors.slice();
            },

            /**
             * Clear error log.
             */
            clear: function () {
                _errors.length = 0;
            },

            /**
             * Render an inline error fallback inside a container element.
             * @param {jQuery|HTMLElement} el
             * @param {string} widgetName
             * @param {Error} err
             */
            renderFallback: function (el, widgetName, err) {
                var html =
                    '<div class="mm20-error-fallback" dir="rtl">' +
                        '<span>\u26A0 \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA ' + MM20.escapeHtml(widgetName) + '</span>' +
                        '<br><small>' + MM20.escapeHtml((err && err.message) || '') + '</small>' +
                    '</div>';
                if (el.html) { el.html(html); } else { el.innerHTML = html; }
            }
        };
    })();


    // ═══════════════════════════════════════
    //  3. STATS HELPERS
    // ═══════════════════════════════════════

    MM20.stats = {
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
        },
        /**
         * Rate of change per hour.
         * @param {number} prev - previous value
         * @param {number} curr - current value
         * @param {number} dtMs - elapsed milliseconds
         */
        rateOfChange: function (prev, curr, dtMs) {
            if (!dtMs || dtMs <= 0) return 0;
            return ((curr - prev) / dtMs) * 3600000; // per hour
        },
        /**
         * Simple linear forecast.
         * @param {number} current  - current value
         * @param {number} rate     - rate per hour
         * @param {number} target   - target value
         * @returns {number} hours until target, or Infinity
         */
        forecast: function (current, rate, target) {
            if (rate <= 0) return Infinity;
            var remaining = target - current;
            if (remaining <= 0) return 0;
            return remaining / rate;
        }
    };


    // ═══════════════════════════════════════
    //  4. DEFAULT SITES  (15 plants, 37 units)
    // ═══════════════════════════════════════

    MM20.SITES = [
        { id: 'orot',       name: '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF',           region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05E4\u05D7\u05DD',       units: ['\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 1', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 2', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 3', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 4', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 5', '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF 6', '\u05E1\u05D9\u05DC\u05D5\u05E0\u05D9\u05EA'] },
        { id: 'rtnb',       name: '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2',                       region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 1', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 2', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 3', '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2 4'] },
        { id: 'eilat',      name: '\u05D0\u05D9\u05DC\u05EA',                                         region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D3\u05D9\u05D6\u05DC',             units: ['\u05D0\u05D9\u05DC\u05EA 1', '\u05D0\u05D9\u05DC\u05EA 2', '\u05D0\u05D9\u05DC\u05EA 3'] },
        { id: 'eitan',      name: '\u05D0\u05D9\u05EA\u05DF',                                         region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D0\u05D9\u05EA\u05DF 1'] },
        { id: 'alon',       name: '\u05D0\u05DC\u05D5\u05DF \u05EA\u05D1\u05D5\u05E8',                 region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D9\u05D7 1', '\u05D9\u05D7 2', '\u05D9\u05D7 6', '\u05D9\u05D7 7'] },
        { id: 'eshkol',     name: '\u05D0\u05E9\u05DB\u05D5\u05DC',                                   region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D0\u05E9\u05DB\u05D5\u05DC 6', '\u05D0\u05E9\u05DB\u05D5\u05DC 7', '\u05D0\u05E9\u05DB\u05D5\u05DC 8', '\u05D0\u05E9\u05DB\u05D5\u05DC 9'] },
        { id: 'egel',       name: '\u05D0\u05EA\u05D2\u05DC',                                         region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D0\u05EA\u05D2\u05DC 1'] },
        { id: 'hartov',     name: '\u05D4\u05E8-\u05D8\u05D5\u05D1',                                   region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D4\u05E8-\u05D8\u05D5\u05D1 1'] },
        { id: 'hagit',      name: '\u05D7\u05D2\u05D9\u05EA',                                         region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D7\u05D2\u05D9\u05EA 1', '\u05D7\u05D2\u05D9\u05EA 2'] },
        { id: 'reading',    name: '\u05E8\u05D3\u05D9\u05E0\u05D2',                                   region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05E8\u05D3\u05D9\u05E0\u05D2 1', '\u05E8\u05D3\u05D9\u05E0\u05D2 2'] },
        { id: 'gezer',      name: '\u05D2\u05D6\u05E8',                                               region: '\u05DE\u05E8\u05DB\u05D6', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D2\u05D6\u05E8 1'] },
        { id: 'opc_rotem',  name: 'OPC \u05E8\u05D5\u05EA\u05DD',                                     region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05E8\u05D5\u05EA\u05DD 1', '\u05E8\u05D5\u05EA\u05DD 2'] },
        { id: 'opc_hadera', name: 'OPC \u05D7\u05D3\u05E8\u05D4',                                     region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D7\u05D3\u05E8\u05D4 1'] },
        { id: 'dorad',      name: '\u05D3\u05D5\u05E8\u05D3',                                         region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D3\u05D5\u05E8\u05D3 1', '\u05D3\u05D5\u05E8\u05D3 2'] },
        { id: 'dalia',      name: '\u05D3\u05DC\u05D9\u05D4 \u05D0\u05E0\u05E8\u05D2\u05D9\u05D5\u05EA', region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9', units: ['\u05D3\u05DC\u05D9\u05D4 1'] }
    ];

    // ── Status labels ──
    MM20.STATUS_LABELS = {
        critical: '\u05E7\u05E8\u05D9\u05D8\u05D9',
        warn:     '\u05D0\u05D6\u05D4\u05E8\u05D4',
        ok:       '\u05EA\u05E7\u05D9\u05DF',
        off:      '\u05DB\u05D1\u05D5\u05D9',
        standby:  '\u05D4\u05DE\u05EA\u05E0\u05D4',
        maintenance: '\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4'
    };

    // ── Report templates ──
    MM20.REPORT_TEMPLATES = [
        { id: 'monthly',          name: '\u05D3\u05D5\u05D7 \u05D7\u05D5\u05D3\u05E9\u05D9' },
        { id: 'critical',         name: '\u05D9\u05D7\u05D9\u05D3\u05D5\u05EA \u05E7\u05E8\u05D9\u05D8\u05D9\u05D5\u05EA' },
        { id: 'annual',           name: '\u05D3\u05D5\u05D7 \u05E9\u05E0\u05EA\u05D9' },
        { id: 'guard',            name: '\u05DE\u05E9\u05DE\u05E8\u05D5\u05EA' },
        { id: 'custom',           name: '\u05DE\u05D5\u05EA\u05D0\u05DD \u05D0\u05D9\u05E9\u05D9\u05EA' },
        { id: 'monthlyBreakdown', name: '\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D7\u05D5\u05D3\u05E9\u05D9' },
        { id: 'yoy',              name: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05D4 \u05E9\u05E0\u05EA\u05D9\u05EA' },
        { id: 'daily',            name: '\u05E1\u05D9\u05DB\u05D5\u05DD \u05D9\u05D5\u05DE\u05D9' },
        { id: 'weekly',           name: '\u05E1\u05D9\u05DB\u05D5\u05DD \u05E9\u05D1\u05D5\u05E2\u05D9' },
        { id: 'fuel',             name: '\u05EA\u05DE\u05D4\u05D9\u05DC \u05D3\u05DC\u05E7' },
        { id: 'n1contingency',    name: 'N-1 \u05D2\u05D9\u05D1\u05D5\u05D9' }
    ];

    MM20.GROUPING_OPTIONS = [
        { id: 'site',   name: '\u05DC\u05E4\u05D9 \u05D0\u05EA\u05E8' },
        { id: 'status', name: '\u05DC\u05E4\u05D9 \u05E1\u05D8\u05D8\u05D5\u05E1' },
        { id: 'fuel',   name: '\u05DC\u05E4\u05D9 \u05D3\u05DC\u05E7' },
        { id: 'region', name: '\u05DC\u05E4\u05D9 \u05D0\u05D6\u05D5\u05E8' }
    ];

    MM20.MONTHS_HE = [
        '\u05D9\u05E0\u05D5\u05D0\u05E8', '\u05E4\u05D1\u05E8\u05D5\u05D0\u05E8', '\u05DE\u05E8\u05E5',
        '\u05D0\u05E4\u05E8\u05D9\u05DC', '\u05DE\u05D0\u05D9', '\u05D9\u05D5\u05E0\u05D9',
        '\u05D9\u05D5\u05DC\u05D9', '\u05D0\u05D5\u05D2\u05D5\u05E1\u05D8', '\u05E1\u05E4\u05D8\u05DE\u05D1\u05E8',
        '\u05D0\u05D5\u05E7\u05D8\u05D5\u05D1\u05E8', '\u05E0\u05D5\u05D1\u05DE\u05D1\u05E8', '\u05D3\u05E6\u05DE\u05D1\u05E8'
    ];

    // Report column definitions
    MM20.REPORT_COLS = [
        { id: 'site',    label: '\u05D0\u05EA\u05E8',              def: true  },
        { id: 'unit',    label: '\u05D9\u05D7\u05D9\u05D3\u05D4',  def: true  },
        { id: 'status',  label: '\u05E1\u05D8\u05D8\u05D5\u05E1',  def: true  },
        { id: 'hours',   label: '\u05E9\u05E2\u05D5\u05EA',        def: true  },
        { id: 'quota',   label: '\u05DE\u05DB\u05E1\u05D4',        def: true  },
        { id: 'pct',     label: '% \u05E0\u05D9\u05E6\u05D5\u05DC', def: true  },
        { id: 'fuel',    label: '\u05D3\u05DC\u05E7',              def: false },
        { id: 'region',  label: '\u05D0\u05D6\u05D5\u05E8',        def: false },
        { id: 'totalLY', label: '\u05E9\u05E0\u05D4 \u05E7\u05D5\u05D3\u05DE\u05EA', def: false },
        { id: 'diff',    label: '\u05D4\u05E4\u05E8\u05E9',        def: false },
        { id: 'diffPct', label: '\u05D4\u05E4\u05E8\u05E9 %',      def: false },
        { id: 'rate',    label: '\u05E7\u05E6\u05D1 \u05D9\u05D5\u05DE\u05D9', def: false },
        { id: 'monthly', label: '\u05D7\u05D5\u05D3\u05E9\u05D9\u05DD', def: false }
    ];


    // ═══════════════════════════════════════
    //  5. DEMO DATA ENGINE
    // ═══════════════════════════════════════

    MM20.demo = {
        /**
         * Generate fake realtime data for all sites/units.
         * @param {Array} siteDefs - MM20.SITES or cfg.CustomSites
         * @returns {Object} { siteId: { unitIdx: { hours, quota, pct, status, tte, ts } } }
         */
        generateSites: function (siteDefs) {
            var result = {};
            var now = new Date().toISOString();
            for (var s = 0; s < siteDefs.length; s++) {
                var site = siteDefs[s];
                result[site.id] = {};
                for (var u = 0; u < site.units.length; u++) {
                    var hours = Math.round(Math.random() * 4000);
                    var quota = 1000 + Math.round(Math.random() * 3000);
                    var pct   = Math.round((hours / quota) * 1000) / 10;
                    var status = pct >= 90 ? 'critical' : pct >= 70 ? 'warn' : 'ok';
                    var tte = MM20.stats.forecast(hours, 0.5 + Math.random() * 2, quota);
                    result[site.id][u] = {
                        hours:  hours,
                        quota:  quota,
                        pct:    pct,
                        status: status,
                        tte:    Math.round(tte),
                        ts:     now,
                        monthly: MM20.demo._fakeMonthly()
                    };
                }
            }
            return result;
        },

        /**
         * Generate 12 months of fake monthly data for heatmap.
         * @returns {Array} [ { month: 0..11, value: number } ]
         */
        _fakeMonthly: function () {
            var arr = [];
            for (var m = 0; m < 12; m++) {
                arr.push({
                    month: m,
                    value: Math.round(Math.random() * 400)
                });
            }
            return arr;
        },

        /**
         * Generate demo history for heatmap (all sites × 12 months).
         * @param {Array} siteDefs
         * @param {number} months
         * @returns {Object} { siteId: { unitIdx: [ {month, value} ] } }
         */
        generateHistory: function (siteDefs, months) {
            var result = {};
            months = months || 12;
            for (var s = 0; s < siteDefs.length; s++) {
                var site = siteDefs[s];
                result[site.id] = {};
                for (var u = 0; u < site.units.length; u++) {
                    var arr = [];
                    for (var m = 0; m < months; m++) {
                        arr.push({ month: m, value: Math.round(Math.random() * 500) });
                    }
                    result[site.id][u] = arr;
                }
            }
            return result;
        }
    };


    // ═══════════════════════════════════════
    //  6. UTILITY FUNCTIONS
    // ═══════════════════════════════════════

    /**
     * Escape HTML entities for safe insertion.
     */
    MM20.escapeHtml = function (str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    /**
     * Format a number with thousands separator and decimal places.
     * @param {number} val
     * @param {number} [decimals=1]
     * @param {boolean} [useSep=true]
     */
    MM20.formatNum = function (val, decimals, useSep) {
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
     * @param {Date|string} dt
     * @param {string} [fmt] - 'date', 'time', or 'full' (default)
     */
    MM20.formatDate = function (dt, fmt) {
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
     * Export an array of objects as CSV and trigger download.
     * @param {Array} rows - array of objects
     * @param {string} filename
     */
    MM20.exportCsv = function (rows, filename) {
        if (!rows || !rows.length) return;
        var keys = Object.keys(rows[0]);
        // BOM for Hebrew support in Excel
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
     * Get total unit count from a sites array.
     */
    MM20.totalUnits = function (sites) {
        var n = 0;
        for (var i = 0; i < sites.length; i++) n += sites[i].units.length;
        return n;
    };

    /**
     * Determine quota status from percentage and thresholds.
     * @param {number} pct
     * @param {number} warn - default 70
     * @param {number} crit - default 90
     * @returns {string} 'ok' | 'warn' | 'critical'
     */
    MM20.getStatus = function (pct, warn, crit) {
        warn = warn || 70;
        crit = crit || 90;
        if (pct >= crit) return 'critical';
        if (pct >= warn) return 'warn';
        return 'ok';
    };

    /**
     * Build a unique key for a unit: siteId + '_' + unitIndex.
     */
    MM20.unitKey = function (siteId, unitIdx) {
        return siteId + '_' + unitIdx;
    };

    /**
     * Show a confirmation dialog inside a container.
     * Returns a handle with { destroy } to remove it early.
     *
     * @param {jQuery|HTMLElement} container - parent element
     * @param {string} msg - Hebrew confirmation message
     * @param {Function} onConfirm - called on "yes" click
     * @param {Function} [onCancel] - called on "no" click
     * @returns {{ destroy: Function }}
     */
    MM20.confirmDialog = function (container, msg, onConfirm, onCancel) {
        var $ = window.jQuery;
        if (!$) return { destroy: function () {} };

        var overlay = $(
            '<div class="mm20-confirm-overlay" dir="rtl">' +
                '<div class="mm20-confirm-box">' +
                    '<div class="mm20-confirm-msg">' + MM20.escapeHtml(msg) + '</div>' +
                    '<div class="mm20-confirm-btns">' +
                        '<button class="mm20-btn mm20-btn--ok">\u05D0\u05D9\u05E9\u05D5\u05E8</button>' +
                        '<button class="mm20-btn mm20-btn--cancel">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                    '</div>' +
                '</div>' +
            '</div>'
        );

        var cleanup = function () { overlay.remove(); };

        overlay.find('.mm20-btn--ok').on('click', function () {
            cleanup();
            if (onConfirm) onConfirm();
        });
        overlay.find('.mm20-btn--cancel').on('click', function () {
            cleanup();
            if (onCancel) onCancel();
        });

        $(container).append(overlay);
        return { destroy: cleanup };
    };


    /**
     * Apply CSS custom properties from config theme values.
     * @param {HTMLElement} root - the symbol root element
     * @param {Object} cfg - scope.config
     */
    MM20.applyTheme = function (root, cfg) {
        if (!root || !root.style || !root.style.setProperty) return; // IE11 guard
        var map = {
            '--mm20-gradient-start': cfg.gradientStart,
            '--mm20-gradient-end':   cfg.gradientEnd,
            '--mm20-card-bg':        cfg.cardBg,
            '--mm20-accent':         cfg.accentColor,
            '--mm20-ok':             cfg.okColor,
            '--mm20-warn':           cfg.warnColor,
            '--mm20-crit':           cfg.critColor,
            '--mm20-font-family':    cfg.fontFamily,
            '--mm20-font-size':      (cfg.fontSize || 12) + 'px',
            '--mm20-header-size':    (cfg.headerFontSize || 16) + 'px'
        };
        for (var prop in map) {
            if (map.hasOwnProperty(prop) && map[prop] !== undefined) {
                try { root.style.setProperty(prop, map[prop]); } catch (e) { /* IE11 */ }
            }
        }
    };


    // ═══════════════════════════════════════
    //  7. PI WEB API CLIENT
    // ═══════════════════════════════════════
    //  Inspired by piv20-afbrowser.js PIWebAPI class.
    //  Provides same-origin auto-detection, CSRF token
    //  handling, Windows Kerberos auth (withCredentials),
    //  and 15-second request timeout.
    //
    //  ES5 only — no Promise, no fetch.
    //  jQuery $.ajax used (provided by PI Vision).
    // ═══════════════════════════════════════

    /**
     * PI Web API client constructor.
     * @param {string} [baseUrl] - e.g. 'https://pi-vision/Piwebapi'.
     *                              If empty, auto-detects from current origin.
     * @constructor
     */
    function PIWebAPI(baseUrl) {
        this._base = baseUrl || '';
        this._csrf = '';
        this._connected = false;
        this._lastError = null;
    }

    /**
     * Auto-detect PI Web API base URL from current page origin.
     * Same-origin fallback: protocol://host/Piwebapi
     * Matches actual IIS virtual directory name (capital P).
     */
    PIWebAPI.prototype._detectBase = function () {
        if (this._base) return;
        var loc = window.location;
        this._base = loc.protocol + '//' + loc.host + '/piwebapi';
    };

    /**
     * Internal XHR wrapper using jQuery.ajax.
     * Handles CSRF token, Windows auth, timeout, error normalization.
     *
     * @param {string} method - 'GET' or 'POST'
     * @param {string} path   - API path (e.g. '/assetservers')
     * @param {Object|null} body - POST body (JSON-serializable) or null for GET
     * @param {Function} cb   - callback(err, data)
     * @returns {jqXHR} - the jQuery XHR object (for abort)
     */
    PIWebAPI.prototype._xhr = function (method, path, body, cb) {
        this._detectBase();
        var self = this;
        var $ = window.jQuery;

        if (!$) {
            cb({ status: 0, text: 'jQuery not available' });
            return null;
        }

        var opts = {
            url: self._base + path,
            method: method,
            dataType: 'json',
            xhrFields: { withCredentials: true },
            timeout: 15000
        };

        // Add CSRF token if available
        if (self._csrf) {
            opts.headers = { 'X-CSRF-TOKEN': self._csrf };
        }

        // POST body
        if (body && method === 'POST') {
            opts.contentType = 'application/json';
            opts.data = JSON.stringify(body);
        }

        return $.ajax(opts)
            .done(function (data, status, xhr) {
                // Capture CSRF token from response
                var csrf = xhr.getResponseHeader('X-CSRF-TOKEN');
                if (csrf) self._csrf = csrf;
                self._connected = true;
                self._lastError = null;
                cb(null, data);
            })
            .fail(function (xhr) {
                var err = {
                    status: xhr.status,
                    text: xhr.statusText,
                    url: self._base + path
                };
                self._lastError = err;
                cb(err);
            });
    };

    /**
     * Convenience GET helper.
     */
    PIWebAPI.prototype._get = function (path, cb) {
        return this._xhr('GET', path, null, cb);
    };

    /**
     * Convenience POST helper.
     */
    PIWebAPI.prototype._post = function (path, body, cb) {
        return this._xhr('POST', path, body, cb);
    };

    // ── AF Server Discovery ──

    /**
     * List all AF servers.
     * GET /Piwebapi/assetservers
     * @param {Function} cb - callback(err, servers[])
     */
    PIWebAPI.prototype.getServers = function (cb) {
        return this._get('/assetservers', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    /**
     * List databases for an AF server.
     * GET /Piwebapi/assetservers/{serverWebId}/assetdatabases
     * @param {string} serverWebId
     * @param {Function} cb - callback(err, databases[])
     */
    PIWebAPI.prototype.getDatabases = function (serverWebId, cb) {
        return this._get('/assetservers/' + encodeURIComponent(serverWebId) + '/assetdatabases', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    // ── AF Element Navigation ──

    /**
     * List child elements of an element.
     * GET /Piwebapi/elements/{parentWebId}/elements?maxCount=200
     * @param {string} parentWebId
     * @param {Function} cb - callback(err, elements[])
     */
    PIWebAPI.prototype.getElements = function (parentWebId, cb) {
        return this._get('/elements/' + encodeURIComponent(parentWebId) + '/elements?maxCount=200', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    /**
     * List root elements of a database.
     * GET /Piwebapi/assetdatabases/{dbWebId}/elements?maxCount=200
     * @param {string} dbWebId
     * @param {Function} cb - callback(err, elements[])
     */
    PIWebAPI.prototype.getDatabaseElements = function (dbWebId, cb) {
        return this._get('/assetdatabases/' + encodeURIComponent(dbWebId) + '/elements?maxCount=200', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    /**
     * List attributes of an element.
     * GET /Piwebapi/elements/{elementWebId}/attributes?maxCount=100
     * @param {string} elementWebId
     * @param {Function} cb - callback(err, attributes[])
     */
    PIWebAPI.prototype.getAttributes = function (elementWebId, cb) {
        return this._get('/elements/' + encodeURIComponent(elementWebId) + '/attributes?maxCount=100', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    // ── Stream Data ──

    /**
     * Get current value of an attribute stream.
     * GET /Piwebapi/streams/{attrWebId}/value
     * @param {string} attrWebId
     * @param {Function} cb - callback(err, valueObj)
     */
    PIWebAPI.prototype.getStreamValue = function (attrWebId, cb) {
        return this._get('/streams/' + encodeURIComponent(attrWebId) + '/value', cb);
    };

    /**
     * Get recorded (historical) values for a stream.
     * GET /Piwebapi/streams/{webId}/recorded?startTime=...&endTime=...&maxCount=...
     *
     * @param {string} webId
     * @param {string} startTime - PI time string, e.g. '*-24h', '*-7d', ISO timestamp
     * @param {string} endTime   - PI time string, e.g. '*'
     * @param {number} maxCount  - max data points (default 1000)
     * @param {Function} cb - callback(err, items[])
     */
    PIWebAPI.prototype.getRecorded = function (webId, startTime, endTime, maxCount, cb) {
        var params = '?startTime=' + encodeURIComponent(startTime || '*-24h') +
                     '&endTime='   + encodeURIComponent(endTime || '*') +
                     '&maxCount='  + (maxCount || 1000);
        return this._get('/streams/' + encodeURIComponent(webId) + '/recorded' + params, function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    /**
     * Get interpolated values for a stream.
     * GET /Piwebapi/streams/{webId}/interpolated?startTime=...&endTime=...&interval=...
     *
     * @param {string} webId
     * @param {string} startTime
     * @param {string} endTime
     * @param {string} interval - e.g. '1h', '15m', '1d'
     * @param {Function} cb - callback(err, items[])
     */
    PIWebAPI.prototype.getInterpolated = function (webId, startTime, endTime, interval, cb) {
        var params = '?startTime=' + encodeURIComponent(startTime || '*-24h') +
                     '&endTime='   + encodeURIComponent(endTime || '*') +
                     '&interval='  + encodeURIComponent(interval || '1h');
        return this._get('/streams/' + encodeURIComponent(webId) + '/interpolated' + params, function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    // ── Batch / StreamSets ──

    /**
     * Write recorded data in batch (multiple tags, multiple values).
     * POST /Piwebapi/streamsets/recorded
     *
     * @param {Array} items - [ { WebId, Items: [{ Timestamp, Value, Good }] } ]
     * @param {Function} cb - callback(err, response)
     */
    PIWebAPI.prototype.writeRecordedBatch = function (items, cb) {
        return this._post('/streamsets/recorded', { Items: items }, cb);
    };

    // ── Path & Search ──

    /**
     * Resolve an AF element by its full path.
     * GET /Piwebapi/elements?path={afPath}
     *
     * @param {string} afPath - e.g. '\\\\PISERVER\\Database\\Element1\\Element2'
     * @param {Function} cb - callback(err, element)
     */
    PIWebAPI.prototype.getByPath = function (afPath, cb) {
        return this._get('/elements?path=' + encodeURIComponent(afPath), cb);
    };

    /**
     * Resolve an AF attribute by its full path (element path + |attribute).
     * GET /Piwebapi/attributes?path={afPath}
     *
     * @param {string} attrPath - e.g. '\\\\PISERVER\\DB\\El|AttrName'
     * @param {Function} cb - callback(err, attribute)
     */
    PIWebAPI.prototype.getAttributeByPath = function (attrPath, cb) {
        return this._get('/attributes?path=' + encodeURIComponent(attrPath), cb);
    };

    /**
     * Search elements within a database.
     * GET /Piwebapi/assetdatabases/{dbWebId}/elements?nameFilter=*{query}*&maxCount=...
     *
     * @param {string} dbWebId
     * @param {string} query
     * @param {number} [maxCount=50]
     * @param {Function} cb - callback(err, elements[])
     */
    PIWebAPI.prototype.searchElements = function (dbWebId, query, maxCount, cb) {
        maxCount = maxCount || 50;
        var path = '/assetdatabases/' + encodeURIComponent(dbWebId) +
                   '/elements?nameFilter=*' + encodeURIComponent(query) +
                   '*&maxCount=' + maxCount;
        return this._get(path, function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    // ── Tag Resolution ──

    /**
     * Resolve a tag to its WebId.
     * Strategy (in order):
     *   1. If webId is already provided, return it immediately
     *   2. If tagPath looks like a PI point path (\\server\pointname), try /points?path=
     *   3. If tagPath looks like an AF attribute path (has |), try /attributes?path=
     *   4. Fall back to search using the full tag name
     *
     * @param {Object} tag - { tagName, tagPath, webId }
     * @param {Function} cb - callback(err, webId)
     */
    PIWebAPI.prototype.resolveTag = function (tag, cb) {
        var self = this;
        if (!tag) { cb({ status: 0, text: 'no tag' }); return; }

        // 1. Already have WebId
        if (tag.webId) { cb(null, tag.webId); return; }

        var tagPath = tag.tagPath || '';
        var tagName = tag.tagName || '';

        // 2. PI point path: \\server\pointname
        if (tagPath && tagPath.indexOf('\\\\') === 0 && tagPath.indexOf('|') < 0) {
            self._get('/points?path=' + encodeURIComponent(tagPath) + '&selectedFields=WebId', function (err, data) {
                if (!err && data && data.WebId) {
                    cb(null, data.WebId);
                } else {
                    // Fall through to search
                    self._resolveTagBySearch(tagName || tagPath, cb);
                }
            });
            return;
        }

        // 3. AF attribute path: \\server\db\el|attr
        if (tagPath && tagPath.indexOf('|') >= 0) {
            self._get('/attributes?path=' + encodeURIComponent(tagPath) + '&selectedFields=WebId', function (err, data) {
                if (!err && data && data.WebId) {
                    cb(null, data.WebId);
                } else {
                    self._resolveTagBySearch(tagName || tagPath, cb);
                }
            });
            return;
        }

        // 4. Search by name (using full name, not just basename)
        self._resolveTagBySearch(tagName || tagPath, cb);
    };

    /**
     * Internal: search for a tag by name using PI Web API search endpoint.
     * Uses full tag name for accuracy (not just basename).
     */
    PIWebAPI.prototype._resolveTagBySearch = function (tagName, cb) {
        if (!tagName) { cb({ status: 0, text: 'no tag name' }); return; }
        this._get('/search/query?q=name:' + encodeURIComponent(tagName) + '&count=5', function (err, data) {
            if (err || !data || !data.Items || data.Items.length === 0) {
                cb(err || { status: 404, text: 'tag not found' });
                return;
            }
            // Prefer exact match if multiple results
            var exact = null;
            var nameLower = tagName.toLowerCase();
            for (var i = 0; i < data.Items.length; i++) {
                var itemName = (data.Items[i].Name || '').toLowerCase();
                if (itemName === nameLower) {
                    exact = data.Items[i];
                    break;
                }
            }
            var best = exact || data.Items[0];
            if (!best.WebId) {
                cb({ status: 404, text: 'tag found but no WebId' });
                return;
            }
            cb(null, best.WebId);
        });
    };

    // ── Event Frames ──

    /**
     * List event frames for an element.
     * GET /Piwebapi/elements/{elementWebId}/eventframes?startTime=...&endTime=...&maxCount=...
     *
     * @param {string} elementWebId
     * @param {string} startTime
     * @param {string} endTime
     * @param {number} [maxCount=100]
     * @param {Function} cb - callback(err, eventFrames[])
     */
    PIWebAPI.prototype.getEventFrames = function (elementWebId, startTime, endTime, maxCount, cb) {
        maxCount = maxCount || 100;
        var params = '?startTime=' + encodeURIComponent(startTime || '*-7d') +
                     '&endTime='   + encodeURIComponent(endTime || '*') +
                     '&maxCount='  + maxCount +
                     '&sortOrder=Descending&sortField=StartTime';
        return this._get('/elements/' + encodeURIComponent(elementWebId) + '/eventframes' + params, function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    // ── System / Auth ──

    /**
     * Get system status (connection test).
     * GET /Piwebapi/system
     * @param {Function} cb - callback(err, systemInfo)
     */
    PIWebAPI.prototype.getSystem = function (cb) {
        return this._get('/system', cb);
    };

    /**
     * Get current Windows user info.
     * GET /Piwebapi/system/userinfo
     * @param {Function} cb - callback(err, userInfo)
     */
    PIWebAPI.prototype.getUserInfo = function (cb) {
        return this._get('/system/userinfo', cb);
    };

    /**
     * Connection status.
     * @returns {boolean}
     */
    PIWebAPI.prototype.isConnected = function () {
        return this._connected;
    };

    /**
     * Last error details.
     * @returns {Object|null}
     */
    PIWebAPI.prototype.getLastError = function () {
        return this._lastError;
    };

    // Expose constructor on namespace
    MM20.PIWebAPI = PIWebAPI;


    // ═══════════════════════════════════════
    //  8. AF PATH UTILITIES
    // ═══════════════════════════════════════
    //  Structured AF path parsing compatible
    //  with PI Vision data row Label/Path format.
    //  Matches PIV20.AF namespace conventions.
    // ═══════════════════════════════════════

    MM20.AF = {};

    /**
     * Parse a full AF path string into components.
     * Input formats:
     *   '\\\\SERVER\\Database\\Elem1\\Elem2|Attribute'
     *   '\\SERVER\Database\Elem1\Elem2|Attribute'
     *   'af:\\SERVER\Database\...|Attribute'
     *
     * @param {string} label
     * @returns {{ server:string, db:string, elements:string[], element:string,
     *             attribute:string, fullPath:string }}
     */
    MM20.AF.parsePath = function (label) {
        var empty = { server:'', db:'', elements:[], element:'', attribute:'', fullPath:'' };
        if (!label || typeof label !== 'string') return empty;

        var path = label;
        // Strip 'af:' prefix if present
        if (path.indexOf('af:') === 0) path = path.substring(3);

        // Split attribute part (after |)
        var attribute = '';
        var pipeIdx = path.indexOf('|');
        if (pipeIdx >= 0) {
            attribute = path.substring(pipeIdx + 1).replace(/^\s+|\s+$/g, '');
            path = path.substring(0, pipeIdx);
        }

        // Normalize backslashes and remove leading slashes
        path = path.replace(/\\\\/g, '\\').replace(/^\\+/, '');

        // Split by backslash
        var parts = path.split('\\');
        // Filter empty
        var clean = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].replace(/^\s+|\s+$/g, '');
            if (p) clean.push(p);
        }

        var server   = clean.length > 0 ? clean[0] : '';
        var db       = clean.length > 1 ? clean[1] : '';
        var elements = clean.length > 2 ? clean.slice(2) : [];
        var element  = elements.length > 0 ? elements[elements.length - 1] : '';

        return {
            server:    server,
            db:        db,
            elements:  elements,
            element:   element,
            attribute: attribute,
            fullPath:  label
        };
    };

    /**
     * Extract a safe numeric/string value from a PI Vision data row.
     * Handles nested Value objects, NaN, null, digital states.
     *
     * @param {Object} row - { Value, Good, Time, Label, Path }
     * @param {number} [decimals=1]
     * @returns {{ display:string, numeric:number, good:boolean, isDigitalState:boolean }}
     */
    MM20.AF.safeVal = function (row, decimals) {
        var bad = { display: '---', numeric: 0, good: false, isDigitalState: false };
        if (!row) return bad;

        var v = row.Value;
        // Unwrap nested { Value: x } objects (PI Web API pattern)
        if (typeof v === 'object' && v !== null && v.Value !== undefined) {
            v = v.Value;
        }

        // Handle null/undefined
        if (v === null || v === undefined) return bad;

        // Try numeric
        var n = parseFloat(v);
        if (isNaN(n)) {
            // Digital state or string
            return {
                display: String(v),
                numeric: 0,
                good: row.Good !== false,
                isDigitalState: true
            };
        }

        decimals = (decimals !== undefined) ? decimals : 1;
        return {
            display: MM20.formatNum(n, decimals),
            numeric: n,
            good: row.Good !== false,
            isDigitalState: false
        };
    };

    /**
     * Check quality flag of a data row.
     * @param {Object} row
     * @returns {boolean}
     */
    MM20.AF.checkQuality = function (row) {
        if (!row) return false;
        return row.Good !== false;
    };

    /**
     * Check if a data row is stale (timestamp too old).
     * @param {Object} row - must have .Time property (ISO string or Date)
     * @param {number} thresholdSec - staleness threshold in seconds
     * @returns {boolean} true if stale
     */
    MM20.AF.isStale = function (row, thresholdSec) {
        if (!row || !row.Time) return true;
        var ts = new Date(row.Time).getTime();
        if (isNaN(ts)) return true;
        var age = (Date.now() - ts) / 1000;
        return age > (thresholdSec || 300);
    };

    /**
     * Summarize connection quality from an array of data rows.
     * @param {Array} rows
     * @returns {{ total:number, good:number, bad:number, stale:number, status:string }}
     */
    MM20.AF.connectionSummary = function (rows) {
        if (!rows || !rows.length) {
            return { total: 0, good: 0, bad: 0, stale: 0, status: 'none' };
        }
        var g = 0, b = 0, s = 0;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].Good === false) { b++; }
            else if (MM20.AF.isStale(rows[i], 300)) { s++; }
            else { g++; }
        }
        var st = (b + s === 0) ? 'ok' :
                 (g === 0)      ? 'error' : 'partial';
        return { total: rows.length, good: g, bad: b, stale: s, status: st };
    };


    // ═══════════════════════════════════════
    //  9. WEBID CACHE
    // ═══════════════════════════════════════
    //  In-memory cache mapping AF paths to WebIds.
    //  TTL-based (default 5 minutes).
    //  Prevents redundant API calls.
    // ═══════════════════════════════════════

    MM20._webIdCache = {};
    var CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

    /**
     * Resolve an AF path to a WebId, using cache.
     * If cached and not expired, returns immediately via callback.
     * Otherwise, calls api.getByPath() and caches the result.
     *
     * @param {string} afPath - full AF element path (without attribute)
     * @param {PIWebAPI} api - API client instance
     * @param {Function} cb - callback(err, webId)
     */
    MM20.resolveWebId = function (afPath, api, cb) {
        if (!afPath || !api) {
            cb({ status: 0, text: 'Missing path or API' });
            return;
        }

        var cached = MM20._webIdCache[afPath];
        if (cached && (Date.now() - cached.ts < CACHE_TTL_MS)) {
            cb(null, cached.webId);
            return;
        }

        api.getByPath(afPath, function (err, data) {
            if (err) {
                cb(err);
                return;
            }
            if (data && data.WebId) {
                MM20._webIdCache[afPath] = { webId: data.WebId, ts: Date.now() };
                cb(null, data.WebId);
            } else {
                cb({ status: 404, text: 'WebId not found for: ' + afPath });
            }
        });
    };

    /**
     * Resolve an AF attribute path to a WebId.
     * Uses attribute endpoint.
     *
     * @param {string} attrPath - full AF path with |attribute
     * @param {PIWebAPI} api
     * @param {Function} cb - callback(err, webId)
     */
    MM20.resolveAttributeWebId = function (attrPath, api, cb) {
        if (!attrPath || !api) {
            cb({ status: 0, text: 'Missing path or API' });
            return;
        }

        var cached = MM20._webIdCache[attrPath];
        if (cached && (Date.now() - cached.ts < CACHE_TTL_MS)) {
            cb(null, cached.webId);
            return;
        }

        api.getAttributeByPath(attrPath, function (err, data) {
            if (err) {
                cb(err);
                return;
            }
            if (data && data.WebId) {
                MM20._webIdCache[attrPath] = { webId: data.WebId, ts: Date.now() };
                cb(null, data.WebId);
            } else {
                cb({ status: 404, text: 'Attribute WebId not found: ' + attrPath });
            }
        });
    };

    /**
     * Clear the WebId cache (e.g. on config change).
     */
    MM20.clearWebIdCache = function () {
        MM20._webIdCache = {};
    };


    // ═══════════════════════════════════════
    //  10. DESTROY HELPER
    // ═══════════════════════════════════════
    //  Standardized cleanup for $interval, $timeout,
    //  watchers, XHRs, observers, listeners, widgets.
    //  Matches PIV20.destroyHelper() pattern.
    // ═══════════════════════════════════════

    /**
     * Clean up all resources tracked in a context object.
     * @param {Object} ctx - {
     *   intervals: [],  $interval: angularService,
     *   timeouts:  [],  $timeout:  angularService,
     *   unwatchers: [], xhrs: [],
     *   listeners: [{ el, event, fn }],
     *   observers: [IntersectionObserver],
     *   widgets: [{ $el, name }],
     *   workers: [Worker],          // aligned with mu20-core
     *   rafs: [requestAnimationFrame id]  // aligned with mu20-core
     * }
     */
    MM20.destroyHelper = function (ctx) {
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

        // Terminate Web Workers (aligned with mu20-core)
        if (ctx.workers) {
            for (i = 0; i < ctx.workers.length; i++) {
                try { ctx.workers[i].terminate(); } catch (e) { /* ignore */ }
            }
            ctx.workers.length = 0;
        }

        // Cancel requestAnimationFrame handles (aligned with mu20-core)
        if (ctx.rafs) {
            for (i = 0; i < ctx.rafs.length; i++) {
                try { cancelAnimationFrame(ctx.rafs[i]); } catch (e) { /* ignore */ }
            }
            ctx.rafs.length = 0;
        }

        // Destroy jQuery UI widgets (+ ES6 class support aligned with mu20-core)
        if (ctx.widgets) {
            for (i = 0; i < ctx.widgets.length; i++) {
                try {
                    var w = ctx.widgets[i];
                    if (w && w.destroy && typeof w.destroy === 'function') {
                        w.destroy();
                    } else if (w.$el && w.name && w.$el[w.name]) {
                        w.$el[w.name]('destroy');
                    }
                } catch (e) { /* ignore */ }
            }
            ctx.widgets.length = 0;
        }
    };

    /**
     * Initialize a jQuery UI widget safely with error fallback.
     * Matches PIV20.safeWidget() pattern.
     *
     * @param {jQuery} rootEl - parent element
     * @param {string} selector - CSS selector for widget container
     * @param {string} widgetName - jQuery UI widget name (e.g. 'mm20SiteGrid')
     * @param {Object} [options] - widget options
     * @param {string} [label] - display label for error fallback
     * @returns {jQuery|null}
     */
    MM20.safeWidget = function (rootEl, selector, widgetName, options, label) {
        var $ = window.jQuery;
        if (!$) {
            MM20.shield.log('safeWidget', widgetName, new Error('jQuery not available'));
            return null;
        }

        var $el = rootEl.find ? rootEl.find(selector) : $(selector, rootEl);
        if (!$el || !$el.length) {
            MM20.shield.log('safeWidget', widgetName, new Error('Container not found: ' + selector));
            return null;
        }

        if (!$.fn[widgetName]) {
            MM20.shield.log('safeWidget', widgetName, new Error('Plugin not loaded: ' + widgetName));
            MM20.shield.renderFallback($el, label || widgetName, new Error('Plugin not loaded'));
            return null;
        }

        try {
            $el[widgetName](options || {});
            return $el;
        } catch (e) {
            MM20.shield.log('safeWidget', widgetName, e);
            MM20.shield.renderFallback($el, label || widgetName, e);
            return null;
        }
    };


})(window);
