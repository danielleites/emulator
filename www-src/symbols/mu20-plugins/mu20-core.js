/**
 * ================================================================
 *  MU20-CORE  --  Ultimate Mugbalot Monitor Infrastructure
 * ================================================================
 *  Signal bus  -  Error shield  -  Stats  -  Demo engine
 *  SITES array -  Utility functions  -  PI Web API client
 *  XHR Queue   -  Config Schema  -  Safe Plugin loader
 *
 *  Ported from MM20-CORE with:
 *    - Namespace rename  MM20 --> MU20
 *    - jQuery removal from confirmDialog / renderFallback
 *    - New: XHR concurrency queue (MU20.xhrQueue)
 *    - New: Config schema validator (MU20.config)
 *    - New: safePlugin for ES6-class plugins
 *    - Enhanced destroyHelper (Worker + rAF support)
 *
 *  Version : ULT.1.6
 *  ES5 only -- IE11 compatible (PI Vision requirement)
 *  No dependencies except jQuery for PIWebAPI $.ajax calls.
 * ================================================================
 */
(function (root) {
    'use strict';

    // Prevent double-init — merge with existing MU20 (may be pre-populated by emu-shims)
    var MU20 = root.MU20 = root.MU20 || {};
    if (MU20._coreLoaded) return;
    MU20._coreLoaded = true;
    MU20._loaded = true;
    MU20.VERSION = MU20.VERSION || 'ULT.1.6';


    // =========================================================
    //  1. SIGNAL BUS  (per-instance factory)
    // =========================================================

    /**
     * Creates a fresh, isolated pub/sub bus.
     * Each symbol instance gets its own bus so events
     * never leak between multiple monitors on one display.
     *
     * @returns {{ on, off, emit, once, reset }}
     */
    MU20.createBus = function () {
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
             * Each handler is error-shielded -- a throwing subscriber
             * never breaks other subscribers.
             */
            emit: function (channel, data) {
                if (_destroyed) return;
                var subs = _channels[channel];
                if (!subs) return;
                for (var i = 0; i < subs.length; i++) {
                    try {
                        subs[i].fn.call(subs[i].ctx, data);
                    } catch (e) {
                        MU20.shield.log('bus:' + channel, 'emit', e);
                    }
                }
            },

            /**
             * Subscribe once -- auto-removes after first call.
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
             * Drop all subscriptions (called on destroy).
             */
            reset: function () {
                _channels = {};
            },

            /**
             * Destroy the bus — prevent further emit/on after cleanup.
             */
            destroy: function () {
                _channels = {};
                _destroyed = true;
            }
        };
    };


    // =========================================================
    //  2. ERROR SHIELD
    // =========================================================

    MU20.shield = (function () {
        // L-3 fix: errors partitioned by instance ID.
        // _errorsByInst['<id>'] = [entry, …]; _globalErrors = all-instance fallback.
        var _errorsByInst = {};
        var _globalErrors = [];
        var MAX = 200;

        function _getStore(instanceId) {
            if (!instanceId) return _globalErrors;
            if (!_errorsByInst[instanceId]) _errorsByInst[instanceId] = [];
            return _errorsByInst[instanceId];
        }

        return {
            /**
             * Wrap a function in try/catch. Returns a safe version.
             * @param {string} source     - plugin name (e.g. 'siteGrid')
             * @param {string} fnName     - method name (e.g. 'dataUpdate')
             * @param {Function} fn
             * @param {string} [instanceId] - optional instance key for partitioning
             * @returns {Function}
             */
            wrap: function (source, fnName, fn, instanceId) {
                var self = this;
                return function () {
                    try {
                        return fn.apply(this, arguments);
                    } catch (e) {
                        self.log(source, fnName, e, instanceId);
                        return undefined;
                    }
                };
            },

            /**
             * Record an error.
             * @param {string} [instanceId] - optional instance key
             */
            log: function (source, fnName, error, instanceId) {
                var entry = {
                    ts: new Date().toISOString(),
                    source: source,
                    fn: fnName,
                    msg: (error && error.message) ? error.message : String(error),
                    stack: (error && error.stack) ? error.stack : '',
                    instance: instanceId || ''
                };
                var store = _getStore(instanceId);
                store.push(entry);
                if (store.length > MAX) store.shift();
                // Also keep in global log for cross-instance debugging
                if (instanceId) {
                    _globalErrors.push(entry);
                    if (_globalErrors.length > MAX) _globalErrors.shift();
                }

                // Console output for developers
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[MU20][' + source + '.' + fnName + ']', error);
                }
            },

            /**
             * Get collected errors (copy).
             * @param {string} [instanceId] - omit for all errors
             */
            getErrors: function (instanceId) {
                return _getStore(instanceId).slice();
            },

            /**
             * Clear error log.
             * @param {string} [instanceId] - omit to clear everything
             */
            clear: function (instanceId) {
                if (instanceId) {
                    var store = _errorsByInst[instanceId];
                    if (store) store.length = 0;
                } else {
                    _globalErrors.length = 0;
                    for (var k in _errorsByInst) {
                        if (_errorsByInst.hasOwnProperty(k)) {
                            _errorsByInst[k].length = 0;
                        }
                    }
                }
            },

            /**
             * Render an inline error fallback inside a container element.
             * Uses plain DOM -- no jQuery dependency.
             * @param {HTMLElement} el
             * @param {string} pluginName
             * @param {Error} err
             */
            renderFallback: function (el, pluginName, err) {
                var div = document.createElement('div');
                div.className = 'mu20-error-fallback';
                div.setAttribute('dir', 'rtl');
                div.innerHTML = '<span>\u26A0 \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA ' + MU20.escapeHtml(pluginName) + '</span>' +
                    '<br><small>' + MU20.escapeHtml((err && err.message) || '') + '</small>';
                if (el.innerHTML !== undefined) {
                    el.innerHTML = '';
                    el.appendChild(div);
                }
            }
        };
    })();


    // =========================================================
    //  3. STATS HELPERS
    // =========================================================

    MU20.stats = {
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


    // =========================================================
    //  4. DEFAULT SITES  (15 plants, 37 units)
    // =========================================================

    MU20.SITES = [
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


    // =========================================================
    //  5. LABELS, TEMPLATES, GROUPINGS, MONTHS, COLUMNS
    // =========================================================

    // -- Status labels --
    MU20.STATUS_LABELS = {
        critical: '\u05E7\u05E8\u05D9\u05D8\u05D9',
        warn:     '\u05D0\u05D6\u05D4\u05E8\u05D4',
        ok:       '\u05EA\u05E7\u05D9\u05DF',
        off:      '\u05DB\u05D1\u05D5\u05D9',
        standby:  '\u05D4\u05DE\u05EA\u05E0\u05D4',
        maintenance: '\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4'
    };

    // -- Report templates --
    MU20.REPORT_TEMPLATES = [
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

    MU20.GROUPING_OPTIONS = [
        { id: 'site',   name: '\u05DC\u05E4\u05D9 \u05D0\u05EA\u05E8' },
        { id: 'status', name: '\u05DC\u05E4\u05D9 \u05E1\u05D8\u05D8\u05D5\u05E1' },
        { id: 'fuel',   name: '\u05DC\u05E4\u05D9 \u05D3\u05DC\u05E7' },
        { id: 'region', name: '\u05DC\u05E4\u05D9 \u05D0\u05D6\u05D5\u05E8' }
    ];

    MU20.MONTHS_HE = [
        '\u05D9\u05E0\u05D5\u05D0\u05E8', '\u05E4\u05D1\u05E8\u05D5\u05D0\u05E8', '\u05DE\u05E8\u05E5',
        '\u05D0\u05E4\u05E8\u05D9\u05DC', '\u05DE\u05D0\u05D9', '\u05D9\u05D5\u05E0\u05D9',
        '\u05D9\u05D5\u05DC\u05D9', '\u05D0\u05D5\u05D2\u05D5\u05E1\u05D8', '\u05E1\u05E4\u05D8\u05DE\u05D1\u05E8',
        '\u05D0\u05D5\u05E7\u05D8\u05D5\u05D1\u05E8', '\u05E0\u05D5\u05D1\u05DE\u05D1\u05E8', '\u05D3\u05E6\u05DE\u05D1\u05E8'
    ];

    // Report column definitions
    MU20.REPORT_COLS = [
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


    // =========================================================
    //  6. DEMO DATA ENGINE
    // =========================================================

    MU20.demo = {
        /**
         * Generate fake realtime data for all sites/units.
         * @param {Array} siteDefs - MU20.SITES or cfg.CustomSites
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
                    var tte = MU20.stats.forecast(hours, 0.5 + Math.random() * 2, quota);
                    result[site.id][u] = {
                        hours:  hours,
                        quota:  quota,
                        pct:    pct,
                        status: status,
                        tte:    Math.round(tte),
                        ts:     now,
                        monthly: MU20.demo._fakeMonthly()
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
         * Generate demo history for heatmap (all sites x 12 months).
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


    // =========================================================
    //  7. UTILITY FUNCTIONS
    // =========================================================

    /**
     * Escape HTML entities for safe insertion.
     */
    MU20.escapeHtml = function (str) {
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
    MU20.formatNum = function (val, decimals, useSep) {
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
    MU20.formatDate = function (dt, fmt) {
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
    MU20.exportCsv = function (rows, filename) {
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
    MU20.totalUnits = function (sites) {
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
    MU20.getStatus = function (pct, warn, crit) {
        warn = warn || 70;
        crit = crit || 90;
        if (pct >= crit) return 'critical';
        if (pct >= warn) return 'warn';
        return 'ok';
    };

    /**
     * Build a unique key for a unit: siteId + '_u' + unitIndex.
     * FIX #6: Unified format. All files (Worker, siteGrid, alerts, dispatch)
     * MUST use this same format. Never use siteId + '_' + unitIdx.
     */
    MU20.unitKey = function (siteId, unitIdx) {
        return siteId + '_u' + unitIdx;
    };


    // =========================================================
    //  8. CONFIRM DIALOG  (vanilla DOM -- no jQuery)
    // =========================================================

    /**
     * Show a confirmation dialog inside a container.
     * Returns a handle with { destroy } to remove it early.
     *
     * @param {HTMLElement} container - parent element
     * @param {string} msg - Hebrew confirmation message
     * @param {Function} onConfirm - called on "yes" click
     * @param {Function} [onCancel] - called on "no" click
     * @returns {{ destroy: Function }}
     */
    MU20.confirmDialog = function (container, msg, onConfirm, onCancel) {
        var overlay = document.createElement('div');
        overlay.className = 'mu20-confirm-overlay';
        overlay.setAttribute('dir', 'rtl');

        var box = document.createElement('div');
        box.className = 'mu20-confirm-box';

        var msgEl = document.createElement('div');
        msgEl.className = 'mu20-confirm-msg';
        msgEl.textContent = msg;

        var btns = document.createElement('div');
        btns.className = 'mu20-confirm-btns';

        var okBtn = document.createElement('button');
        okBtn.className = 'mu20-btn mu20-btn--ok';
        okBtn.textContent = '\u05D0\u05D9\u05E9\u05D5\u05E8';  // אישור

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'mu20-btn mu20-btn--cancel';
        cancelBtn.textContent = '\u05D1\u05D9\u05D8\u05D5\u05DC';  // ביטול

        var cleanup = function () {
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        };

        okBtn.addEventListener('click', function () { cleanup(); if (onConfirm) onConfirm(); });
        cancelBtn.addEventListener('click', function () { cleanup(); if (onCancel) onCancel(); });

        btns.appendChild(okBtn);
        btns.appendChild(cancelBtn);
        box.appendChild(msgEl);
        box.appendChild(btns);
        overlay.appendChild(box);

        var parent = container.nodeType ? container : (container[0] || container);
        parent.appendChild(overlay);

        return { destroy: cleanup };
    };


    // =========================================================
    //  9. APPLY THEME  (--mu20-* CSS custom properties)
    // =========================================================

    /**
     * Apply CSS custom properties from config theme values.
     * @param {HTMLElement} root - the symbol root element
     * @param {Object} cfg - scope.config
     */
    MU20.applyTheme = function (root, cfg) {
        if (!root || !root.style || !root.style.setProperty) return; // IE11 guard
        // QA17-FIX1: Map config theme keys to ACTUAL CSS variables used by stylesheet.
        // Previously set --mu20-gradient-start etc. which CSS never read.
        var map = {
            // ── Background & surfaces (what CSS actually reads) ──
            '--mu20-bg':             cfg.gradientStart,
            '--mu20-surface':        cfg.gradientEnd,
            '--mu20-surface-alt':    cfg.cardBg,
            // ── Colors ──
            '--mu20-accent':         cfg.accentColor,
            '--mu20-accent-hover':   cfg.accentColor,   // will get lightened by CSS hover
            '--mu20-green':          cfg.okColor,
            '--mu20-yellow':         cfg.warnColor,
            '--mu20-red':            cfg.critColor,
            // ── Semi-transparent tints (derived from solid colors) ──
            '--mu20-green-dim':      MU20._toDim(cfg.okColor),
            '--mu20-yellow-dim':     MU20._toDim(cfg.warnColor),
            '--mu20-red-dim':        MU20._toDim(cfg.critColor),
            '--mu20-blue-dim':       MU20._toDim(cfg.accentColor),
            // ── Font ──
            '--mu20-font':           cfg.fontFamily,
            // ── Legacy aliases (keep for any external overrides) ──
            '--mu20-gradient-start': cfg.gradientStart,
            '--mu20-gradient-end':   cfg.gradientEnd,
            '--mu20-card-bg':        cfg.cardBg
        };
        // Font sizes need 'px' suffix
        if (cfg.fontSize)       map['--mu20-font-size']   = cfg.fontSize + 'px';
        if (cfg.headerFontSize) map['--mu20-header-size']  = cfg.headerFontSize + 'px';

        for (var prop in map) {
            if (map.hasOwnProperty(prop) && map[prop] !== undefined && map[prop] !== '') {
                try { root.style.setProperty(prop, map[prop]); } catch (e) { /* IE11 */ }
            }
        }

        // QA17-FIX1: Derive text color from background luminance.
        // If bg is light → dark text; if dark → light text.
        var textColor = MU20._contrastText(cfg.gradientStart);
        if (textColor) {
            try {
                root.style.setProperty('--mu20-text', textColor);
                root.style.setProperty('--mu20-text-dim', textColor === '#1f2328' ? '#656d76' : '#8b949e');
                root.style.setProperty('--mu20-text-muted', textColor === '#1f2328' ? '#8c959f' : '#484f58');
            } catch (e) { /* IE11 */ }
        }
    };

    /**
     * QA17-FIX1: Convert hex color to rgba with 15% opacity for dim variants.
     * @param {string} hex - e.g. '#2ECC71'
     * @returns {string} rgba(..., .15) or undefined
     */
    MU20._toDim = function (hex) {
        if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return undefined;
        var r = parseInt(hex.substring(1, 3), 16);
        var g = parseInt(hex.substring(3, 5), 16);
        var b = parseInt(hex.substring(5, 7), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
        return 'rgba(' + r + ',' + g + ',' + b + ',.15)';
    };

    /**
     * QA17-FIX1: Returns dark or light text color based on background luminance.
     * @param {string} hex - background color
     * @returns {string|undefined} '#1f2328' (dark) or '#e6edf3' (light)
     */
    MU20._contrastText = function (hex) {
        if (!hex || hex.charAt(0) !== '#' || hex.length < 7) return undefined;
        var r = parseInt(hex.substring(1, 3), 16);
        var g = parseInt(hex.substring(3, 5), 16);
        var b = parseInt(hex.substring(5, 7), 16);
        if (isNaN(r) || isNaN(g) || isNaN(b)) return undefined;
        // W3C relative luminance formula
        var lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
        return lum > 0.5 ? '#1f2328' : '#e6edf3';
    };


    // =========================================================
    //  10. PI WEB API CLIENT
    // =========================================================
    //  Provides same-origin auto-detection, CSRF token
    //  handling, Windows Kerberos auth (withCredentials),
    //  and 15-second request timeout.
    //
    //  ES5 only -- no Promise, no fetch.
    //  jQuery $.ajax used (provided by PI Vision).
    // =========================================================

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

    // -- AF Server Discovery --

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

    // -- AF Element Navigation --

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

    // -- Stream Data --

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

    // -- Batch / StreamSets --

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

    /**
     * List element templates in a database, optionally filtered by name.
     * GET /Piwebapi/assetdatabases/{dbWebId}/elementtemplates?nameFilter={name}
     *
     * @param {string} dbWebId - WebId of the AF database
     * @param {string} [nameFilter] - Optional exact template name to filter
     * @param {Function} cb - callback(err, templates[])
     */
    PIWebAPI.prototype.getElementTemplates = function (dbWebId, nameFilter, cb) {
        var path = '/assetdatabases/' + encodeURIComponent(dbWebId) +
                   '/elementtemplates?maxCount=50';
        if (nameFilter) {
            path += '&nameFilter=' + encodeURIComponent(nameFilter);
        }
        return this._get(path, function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    /**
     * Resolve an AF database by path.
     * GET /Piwebapi/assetdatabases?path={dbPath}
     *
     * @param {string} dbPath - AF database path, e.g. '\\\\PI-AF2\\fuel'
     * @param {Function} cb - callback(err, database)
     */
    PIWebAPI.prototype.getDatabaseByPath = function (dbPath, cb) {
        return this._get('/assetdatabases?path=' + encodeURIComponent(dbPath), cb);
    };

    // -- Path & Search --

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

    // -- Event Frames --

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

    // -- System / Auth --

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
    MU20.PIWebAPI = PIWebAPI;


    // =========================================================
    //  11. AF PATH UTILITIES
    // =========================================================
    //  Structured AF path parsing compatible
    //  with PI Vision data row Label/Path format.
    // =========================================================

    MU20.AF = {};

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
    MU20.AF.parsePath = function (label) {
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
    MU20.AF.safeVal = function (row, decimals) {
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
            display: MU20.formatNum(n, decimals),
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
    MU20.AF.checkQuality = function (row) {
        if (!row) return false;
        return row.Good !== false;
    };

    /**
     * Extract a plain number from an AF value (wrapper or primitive).
     * Handles: {numeric:87}, {numeric:87, display:'87.0'}, plain 87, '87', null.
     * @param {*} val - AF wrapper object, number, string, or null/undefined
     * @param {number} [fallback=0] - value to return if extraction fails
     * @returns {number}
     */
    MU20.toNum = function (val, fallback) {
        if (val === null || val === undefined) return (fallback !== undefined ? fallback : 0);
        if (typeof val === 'number') return isNaN(val) ? (fallback !== undefined ? fallback : 0) : val;
        if (typeof val === 'object' && val.numeric !== undefined) return +val.numeric;
        var n = +val;
        return isNaN(n) ? (fallback !== undefined ? fallback : 0) : n;
    };

    /**
     * Check if a data row is stale (timestamp too old).
     * @param {Object} row - must have .Time property (ISO string or Date)
     * @param {number} thresholdSec - staleness threshold in seconds
     * @returns {boolean} true if stale
     */
    MU20.AF.isStale = function (row, thresholdSec) {
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
    MU20.AF.connectionSummary = function (rows) {
        if (!rows || !rows.length) {
            return { total: 0, good: 0, bad: 0, stale: 0, status: 'none' };
        }
        var g = 0, b = 0, s = 0;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].Good === false) { b++; }
            else if (MU20.AF.isStale(rows[i], 300)) { s++; }
            else { g++; }
        }
        var st = (b + s === 0) ? 'ok' :
                 (g === 0)      ? 'error' : 'partial';
        return { total: rows.length, good: g, bad: b, stale: s, status: st };
    };


    // =========================================================
    //  12. WEBID CACHE
    // =========================================================
    //  In-memory cache mapping AF paths to WebIds.
    //  TTL-based (default 5 minutes).
    //  Prevents redundant API calls.
    // =========================================================

    MU20._webIdCache = {};
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
    MU20.resolveWebId = function (afPath, api, cb) {
        if (!afPath || !api) {
            cb({ status: 0, text: 'Missing path or API' });
            return;
        }

        var cached = MU20._webIdCache[afPath];
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
                MU20._webIdCache[afPath] = { webId: data.WebId, ts: Date.now() };
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
    MU20.resolveAttributeWebId = function (attrPath, api, cb) {
        if (!attrPath || !api) {
            cb({ status: 0, text: 'Missing path or API' });
            return;
        }

        var cached = MU20._webIdCache[attrPath];
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
                MU20._webIdCache[attrPath] = { webId: data.WebId, ts: Date.now() };
                cb(null, data.WebId);
            } else {
                cb({ status: 404, text: 'Attribute WebId not found: ' + attrPath });
            }
        });
    };

    /**
     * Clear the WebId cache (e.g. on config change).
     */
    MU20.clearWebIdCache = function () {
        MU20._webIdCache = {};
    };

    /**
     * Store a WebId in the cache (public API for plugins).
     * M-2 fix: avoids direct write to _webIdCache from external modules.
     * @param {string} path - AF path
     * @param {string} webId - resolved WebId
     */
    MU20.cacheWebId = function (path, webId) {
        if (path && webId) {
            MU20._webIdCache[path] = { webId: webId, ts: Date.now() };
        }
    };


    // =========================================================
    //  13. DESTROY HELPER  (enhanced)
    // =========================================================
    //  Standardized cleanup for $interval, $timeout,
    //  watchers, XHRs, observers, listeners, plugins,
    //  Workers, and requestAnimationFrame handles.
    // =========================================================

    /**
     * Clean up all resources tracked in a context object.
     * @param {Object} ctx - {
     *   intervals: [],  $interval: angularService,
     *   timeouts:  [],  $timeout:  angularService,
     *   unwatchers: [], xhrs: [],
     *   listeners: [{ el, event, fn }],
     *   observers: [IntersectionObserver],
     *   widgets: [{ $el, name }],
     *   workers: [Worker],
     *   rafs: [requestAnimationFrame id]
     * }
     */
    MU20.destroyHelper = function (ctx) {
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

        // Destroy jQuery UI widgets (legacy support)
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

        // Terminate Web Workers (NEW)
        if (ctx.workers) {
            for (i = 0; i < ctx.workers.length; i++) {
                try { ctx.workers[i].terminate(); } catch (e) { /* ignore */ }
            }
            ctx.workers.length = 0;
        }

        // Cancel requestAnimationFrame handles (NEW)
        if (ctx.rafs) {
            for (i = 0; i < ctx.rafs.length; i++) {
                try { cancelAnimationFrame(ctx.rafs[i]); } catch (e) { /* ignore */ }
            }
            ctx.rafs.length = 0;
        }
    };


    // =========================================================
    //  14. SAFE PLUGIN  (NEW -- replaces safeWidget)
    // =========================================================
    //  For ES6 class-based plugins instead of jQuery widgets.
    //  Instantiates a plugin class with error shielding.
    // =========================================================

    /**
     * Safely instantiate an ES6 class plugin with error fallback.
     *
     * @param {Function} Cls - constructor / ES6 class
     * @param {ShadowRoot|HTMLElement} shadowRoot - shadow DOM root or regular root
     * @param {HTMLElement} containerEl - the container element for the plugin
     * @param {Object} opts - configuration options
     * @param {Object} bus - signal bus instance (MU20.createBus())
     * @param {string} [label] - display label for error fallback
     * @returns {Object|null} - plugin instance or null on error
     */
    MU20.safePlugin = function (Cls, shadowRoot, containerEl, opts, bus, label) {
        if (!Cls) {
            MU20.shield.log('safePlugin', label || 'unknown', new Error('Plugin class not loaded'));
            MU20.shield.renderFallback(containerEl, label || 'unknown', new Error('Plugin not loaded'));
            return null;
        }
        try {
            return new Cls(shadowRoot, containerEl, opts, bus);
        } catch (e) {
            MU20.shield.log('safePlugin', label || 'unknown', e);
            MU20.shield.renderFallback(containerEl, label || 'unknown', e);
            return null;
        }
    };


    // =========================================================
    //  15. CONFIG SCHEMA VALIDATOR  (NEW)
    // =========================================================
    //  Provides versioned config migration, normalization,
    //  and validation with sensible defaults.
    // =========================================================

    MU20.config = {
        DEFAULTS: {
            version: 2,
            Title: '\u05DE\u05D5\u05E0\u05D9\u05D8\u05D5\u05E8 \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA',
            Subtitle: '',
            ActiveTab: 'realtime',
            WarnThreshold: 70,
            CritThreshold: 90,
            Decimals: 1,
            DataUpdateInterval: 30000,
            DemoMode: false,
            ShowFooter: true,
            FooterText: '',
            EnableAutoRefresh: true,    // default — future: orchestrator pipeline toggle
            Height: 600,
            Width: 1200,
            // Display
            SortOrder: 'name',
            ShowSparklines: true,
            FavoritesEnabled: false,
            AutoCollapse: false,        // default — future: siteGrid collapse toggle
            TTEEnabled: true,
            TTEHorizonDays: 90,         // default — future: forecast TTE horizon config
            ExceptionMode: false,       // default — future: exception-only view config
            ShowQuota: true,
            HighlightOverQuota: true,
            UseThousandsSep: true,
            // Heatmap
            HeatmapMetric: 'pct',
            HeatmapSite: '',
            // Alerts
            AlertsEnabled: true,
            AlertSoundEnabled: false,
            AlertQuotaPct: 90,
            AlertHoursMax: 0,
            AlertStaleSec: 300,
            PushNotificationsEnabled: false,
            // Forecast
            ForecastEnabled: true,      // default — future: tab visibility config
            ForecastCritDays: 30,
            ForecastWarnDays: 90,
            AnomalyEnabled: true,
            AnomalyCritRatio: 1.6,
            AnomalyWarnRatio: 1.3,
            ShowTTECountdown: true,
            // Tags
            TagStaleSec: 300,
            TagSortCol: 'site',
            TagSortAsc: true,
            // Tag Warehouse
            EnableTagWarehouse: true,
            DefaultTagBindings: {},
            UserTagBindings: {},
            AllowUserTagRebinding: true,
            // Tag Explorer
            EnableTagExplorer: true,
            DefaultExplorerChart: 'trend',
            MaxExplorerTags: 8,
            ExplorerState: null,
            // Dispatch
            DispatchEnabled: true,      // default — future: tab visibility config
            DispatchMinMW: 0,
            DispatchMWCap: 600,
            DispatchExcludeFltMnt: true,
            // Theme
            fontFamily: 'Segoe UI, Arial, sans-serif',
            fontSize: 12,
            headerFontSize: 16,
            gradientStart: '#0f2027',
            gradientEnd: '#203a43',
            cardBg: 'rgba(255,255,255,0.05)',
            accentColor: '#3498DB',
            okColor: '#2ECC71',
            warnColor: '#F39C12',
            critColor: '#E74C3C',
            // System
            PiWebApiBaseUrl: '',
            CustomSites: null,
            EnableSystemLog: false,     // wired: opts.enableSystemLog
            MaxLogEntries: 500,         // wired: opts.maxLogEntries → mu20-log trim
            AFBasePath: '',             // default — future: AF build base path config
            StaleThreshold: 300,        // default — future: stale-data alert threshold
            limitHoursDaily: 0,
            limitHoursMonthly: 0,
            // Template-Driven Discovery
            TDDEnabled: true,
            TDDTemplateName: 'Mugbalot',
            // Time Sync (QA11/12)
            SyncReportsWithDisplayTime: true,
            SyncReportsSelection: true,
            // Display Guard (QA13)
            DisplayGuardEnabled: false,
            AllowedEditors: '',
            // Saved Templates
            SavedTemplates: [],
            // Layout Manager
            Layout: null,
            // Unit Event Bindings (QA15)
            EnableUnitEvents: true,
            UnitEventBindings: {},
            // Global Search
            ShowGlobalSearch: true,
            // Logo
            LogoUrl: ''
        },

        /**
         * FIX #7: Map editor config panel names to runtime names.
         * The config HTML uses WarnPct / CritPct / RefreshInterval
         * but runtime code uses WarnThreshold / CritThreshold / DataUpdateInterval.
         * This bridges the gap.
         */
        mapEditor: function (cfg) {
            if (!cfg) return cfg;
            // Threshold aliases
            if (cfg.WarnPct !== undefined) {
                cfg.WarnThreshold = Number(cfg.WarnPct);
            }
            if (cfg.CritPct !== undefined) {
                cfg.CritThreshold = Number(cfg.CritPct);
            }
            // Refresh interval (seconds in config → ms in runtime)
            if (cfg.RefreshInterval !== undefined) {
                cfg.DataUpdateInterval = Number(cfg.RefreshInterval) * 1000;
            }
            return cfg;
        },

        migrate: function (cfg) {
            // Migrate from older schema versions
            if (!cfg) return JSON.parse(JSON.stringify(MU20.config.DEFAULTS));
            if (!cfg.version || cfg.version < 2) {
                cfg.version = 2;
                // v1->v2: rename old fields if present
                if (cfg.warnPct !== undefined && cfg.WarnThreshold === undefined) {
                    cfg.WarnThreshold = cfg.warnPct;
                }
                if (cfg.critPct !== undefined && cfg.CritThreshold === undefined) {
                    cfg.CritThreshold = cfg.critPct;
                }
            }
            // Always apply editor mapping
            MU20.config.mapEditor(cfg);
            return cfg;
        },

        normalize: function (cfg) {
            // Clamp and coerce values to valid ranges
            var d = MU20.config.DEFAULTS;
            cfg.WarnThreshold = Math.max(1, Math.min(99, Number(cfg.WarnThreshold) || d.WarnThreshold));
            cfg.CritThreshold = Math.max(cfg.WarnThreshold + 1, Math.min(100, Number(cfg.CritThreshold) || d.CritThreshold));
            cfg.Decimals = Math.max(0, Math.min(4, Math.round(Number(cfg.Decimals)))) || 0;
            cfg.DataUpdateInterval = Math.max(5000, Number(cfg.DataUpdateInterval) || d.DataUpdateInterval);
            cfg.fontSize = Math.max(8, Math.min(24, Number(cfg.fontSize) || d.fontSize));
            cfg.headerFontSize = Math.max(12, Math.min(32, Number(cfg.headerFontSize) || d.headerFontSize));
            // Boolean coercion — config panel may store strings "true"/"false"
            for (var bk in d) {
                if (d.hasOwnProperty(bk) && typeof d[bk] === 'boolean' && cfg[bk] !== undefined) {
                    if (typeof cfg[bk] === 'string') {
                        cfg[bk] = cfg[bk] === 'true' || cfg[bk] === '1';
                    } else {
                        cfg[bk] = !!cfg[bk];
                    }
                }
            }
            return cfg;
        },

        validate: function (cfg) {
            cfg = MU20.config.migrate(cfg);
            // Fill missing keys from DEFAULTS
            var d = MU20.config.DEFAULTS;
            for (var key in d) {
                if (d.hasOwnProperty(key) && cfg[key] === undefined) {
                    cfg[key] = d[key];
                }
            }
            // Warn about unknown keys (typos, leftover config)
            var unknown = [];
            for (var ck in cfg) {
                if (cfg.hasOwnProperty(ck) && !d.hasOwnProperty(ck) && ck !== 'DataShape') {
                    unknown.push(ck);
                }
            }
            if (unknown.length > 0) {
                if (typeof console !== 'undefined' && console.warn) {
                    console.warn('[MU20] Config: unknown keys ignored \u2014 ' + unknown.join(', '));
                }
            }
            cfg = MU20.config.normalize(cfg);
            return cfg;
        }
    };


    // =========================================================
    //  16. XHR CONCURRENCY QUEUE  (NEW)
    // =========================================================
    //  Limits concurrent PI Web API requests to avoid
    //  browser connection saturation and server overload.
    //  Default: 6 concurrent requests (browser limit).
    // =========================================================

    MU20.xhrQueue = (function () {
        var MAX_CONCURRENT = 6;
        var _running = 0;
        var _queue = [];

        function _next() {
            while (_running < MAX_CONCURRENT && _queue.length > 0) {
                var item = _queue.shift();
                _running++;
                try {
                    item.fn(function () {
                        _running--;
                        _next();
                    });
                } catch (e) {
                    _running--;
                    MU20.shield.log('xhrQueue', 'execute', e);
                    _next();
                }
            }
        }

        return {
            enqueue: function (fn) {
                _queue.push({ fn: fn });
                _next();
            },
            pending: function () { return _queue.length; },
            running: function () { return _running; },
            clear: function () { _queue.length = 0; }
        };
    })();


})(window);
