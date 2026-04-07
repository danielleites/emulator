// ═══════════════════════════════════════════════════════════════════
//  JSDoc Type Definitions for PIV-SHARED-CORE
// ═══════════════════════════════════════════════════════════════════

/**
 * @typedef {Object} PIVBus
 * @property {function(string, Function, Object=): void} on - Subscribe to a channel
 * @property {function(string, Function): void} off - Unsubscribe from a channel
 * @property {function(string, *): void} emit - Emit data on a channel
 * @property {function(string, Function, Object=): void} once - Subscribe once, auto-unsubscribe after first call
 * @property {function(): void} reset - Remove all subscriptions
 * @property {function(): void} destroy - Alias for reset, clears all channels
 */

/**
 * @typedef {Object} PIVErrorEntry
 * @property {string} ts - ISO timestamp of the error
 * @property {string} source - Source module/component name
 * @property {string} fn - Function name where error occurred
 * @property {string} msg - Error message
 * @property {string} stack - Error stack trace (may be empty)
 */

/**
 * @typedef {Object} PIVShield
 * @property {function(string, string, Function): Function} wrap - Wrap a function with try/catch error protection
 * @property {function(string, string, Error): void} log - Log an error entry
 * @property {function(): Array<PIVErrorEntry>} getErrors - Get a copy of all logged errors
 * @property {function(): void} clear - Clear all logged errors
 * @property {function(Element|jQuery, string, Error): void} renderFallback - Render an error fallback UI in an element
 */

/**
 * @typedef {Object} PIWebAPI
 * @property {function(function(Object=, Array=): void): XMLHttpRequest} getServers - Get all AF servers
 * @property {function(string, function(Object=, Array=): void): XMLHttpRequest} getDatabases - Get databases for a server
 * @property {function(string, function(Object=, Array=): void): XMLHttpRequest} getElements - Get child elements
 * @property {function(string, function(Object=, Array=): void): XMLHttpRequest} getDatabaseElements - Get root elements of a database
 * @property {function(string, function(Object=, Array=): void): XMLHttpRequest} getAttributes - Get attributes for an element
 * @property {function(string, function(Object=, Object=): void): XMLHttpRequest} getStreamValue - Get current value of a stream
 * @property {function(string, string=, string=, number=, function(Object=, Array=): void): XMLHttpRequest} getRecorded - Get recorded data
 * @property {function(string, string=, string=, string=, function(Object=, Array=): void): XMLHttpRequest} getInterpolated - Get interpolated data
 * @property {function(Array, function(Object=, Object=): void): XMLHttpRequest} writeRecordedBatch - Write batch recorded values
 * @property {function(string, function(Object=, Object=): void): XMLHttpRequest} getByPath - Get element by AF path
 * @property {function(string, function(Object=, Object=): void): XMLHttpRequest} getAttributeByPath - Get attribute by AF path
 * @property {function(string, string, number=, function(Object=, Array=): void): XMLHttpRequest} searchElements - Search elements by name
 * @property {function(string, string=, string=, number=, function(Object=, Array=): void): XMLHttpRequest} getEventFrames - Get event frames for an element
 * @property {function(function(Object=, Object=): void): XMLHttpRequest} getSystem - Get system info
 * @property {function(function(Object=, Object=): void): XMLHttpRequest} getUserInfo - Get user info
 * @property {function(): boolean} isConnected - Check if API is connected
 * @property {function(): Object|null} getLastError - Get last error object
 */

/**
 * @typedef {Object} AFPath
 * @property {string} server - AF server name
 * @property {string} db - AF database name
 * @property {Array<string>} elements - Array of element path segments
 * @property {string} element - Last element name
 * @property {string} attribute - Attribute name (after pipe)
 * @property {string} fullPath - Original full path string
 */

/**
 * @typedef {Object} SafeValResult
 * @property {string} display - Formatted display string
 * @property {number} numeric - Numeric value (0 if non-numeric)
 * @property {boolean} good - Whether the value quality is good
 * @property {boolean} isDigitalState - Whether the value is a digital state string
 */

/**
 * @typedef {Object} DestroyContext
 * @property {Array<number>} [intervals] - Interval IDs to clear
 * @property {Array<number>} [timeouts] - Timeout IDs to clear
 * @property {Array<Function>} [unwatchers] - Angular $watch unregister functions
 * @property {Array<{el: Element|jQuery, event: string, fn: Function}>} [listeners] - DOM event listeners to remove
 * @property {Object<string, {destroy: Function}>} [widgets] - Widget instances to destroy
 * @property {PIVBus} [bus] - Signal bus to reset
 */

/**
 * @typedef {Object} PIVSharedCore
 * @property {string} VERSION - Library version
 * @property {function(PIVShield=): PIVBus} createBus - Create a new signal bus instance
 * @property {function(string): PIVShield} createShield - Create a new error shield instance
 * @property {function(string): string} escapeHtml - Escape HTML special characters
 * @property {function(number, number=, boolean=): string} formatNum - Format a number with decimals and separators
 * @property {function(Date|string, string=): string} formatDate - Format a date/time value
 * @property {function(DestroyContext|Object, Function=, PIVShield=): void} destroyHelper - Clean up resources on destroy
 * @property {{parsePath: function(string): AFPath, safeVal: function(Object, number=): SafeValResult}} AF - AF path utilities
 * @property {function(new:PIWebAPI, string=)} PIWebAPI - PI Web API client constructor
 * @property {function(Object, string): void} wireNamespace - Wire shared utilities into a namespace object
 */

/**
 * ═══════════════════════════════════════════════════════
 *  PIV-SHARED-CORE  —  Common infrastructure for
 *  PIV20, MM20, and MU20 namespaces
 * ═══════════════════════════════════════════════════════
 *  Signal bus · Error shield · Formatting · Destroy helper
 *  PI Web API client · AF path utilities
 *
 *  Version : 1.0.0
 *  ES5 only — no transpilation needed
 *  Must be loaded BEFORE any namespace core file.
 * ═══════════════════════════════════════════════════════
 */
(function (root) {
    'use strict';

    if (root._PIV_SHARED) return;

    var S = root._PIV_SHARED = {};
    S.VERSION = '1.0.0';


    // ═══════════════════════════════════════
    //  1. SIGNAL BUS  (per-instance factory)
    // ═══════════════════════════════════════

    S.createBus = function (shieldRef) {
        var _channels = {};

        return {
            on: function (channel, fn, ctx) {
                if (!_channels[channel]) _channels[channel] = [];
                _channels[channel].push({ fn: fn, ctx: ctx || null });
            },

            off: function (channel, fn) {
                var subs = _channels[channel];
                if (!subs) return;
                for (var i = subs.length - 1; i >= 0; i--) {
                    if (subs[i].fn === fn) subs.splice(i, 1);
                }
            },

            emit: function (channel, data) {
                var subs = _channels[channel];
                if (!subs) return;
                var snapshot = subs.slice();
                for (var i = 0; i < snapshot.length; i++) {
                    try {
                        snapshot[i].fn.call(snapshot[i].ctx, data);
                    } catch (e) {
                        if (shieldRef && shieldRef.log) {
                            shieldRef.log('bus:' + channel, 'emit', e);
                        }
                    }
                }
            },

            once: function (channel, fn, ctx) {
                var self = this;
                var wrapper = function (data) {
                    self.off(channel, wrapper);
                    fn.call(ctx || null, data);
                };
                this.on(channel, wrapper, ctx);
            },

            reset: function () { _channels = {}; },
            destroy: function () { _channels = {}; }
        };
    };


    // ═══════════════════════════════════════
    //  2. ERROR SHIELD
    // ═══════════════════════════════════════

    S.createShield = function (nsLabel) {
        var _errors = [];
        var MAX = 200;

        return {
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
                if (typeof console !== 'undefined' && console.error) {
                    console.error('[' + nsLabel + '][' + source + '.' + fnName + ']', error);
                }
            },

            getErrors: function () { return _errors.slice(); },
            clear: function () { _errors.length = 0; },

            renderFallback: function (el, widgetName, err) {
                // Uses escapeHtml to safely render error info
                var msg = S.escapeHtml(widgetName);
                var detail = S.escapeHtml((err && err.message) || '');
                var div = document.createElement('div');
                div.className = 'piv20-error-fallback';
                div.setAttribute('dir', 'rtl');
                var span = document.createElement('span');
                span.textContent = '\u26A0 \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA ' + widgetName;
                div.appendChild(span);
                div.appendChild(document.createElement('br'));
                var small = document.createElement('small');
                small.textContent = (err && err.message) || '';
                div.appendChild(small);

                if (el.jquery || el.html) {
                    // jQuery element
                    el.empty().append(div);
                } else if (el.appendChild) {
                    while (el.firstChild) el.removeChild(el.firstChild);
                    el.appendChild(div);
                }
            }
        };
    };


    // ═══════════════════════════════════════
    //  3. FORMATTING HELPERS
    // ═══════════════════════════════════════

    S.escapeHtml = function (str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    S.formatNum = function (val, decimals, useSep) {
        if (val === null || val === undefined || isNaN(val)) return '--';
        decimals = (decimals !== undefined) ? decimals : 1;
        useSep = (useSep !== undefined) ? useSep : true;
        var fixed = Number(val).toFixed(decimals);
        if (!useSep) return fixed;
        var parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    };

    S.formatDate = function (dt, fmt) {
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


    // ═══════════════════════════════════════
    //  4. DESTROY HELPER (base version)
    // ═══════════════════════════════════════

    S.destroyHelper = function (arg1, arg2, shieldRef) {
        if (typeof arg2 === 'function') {
            var scope = arg1;
            if (scope && scope.$on) {
                scope.$on('$destroy', function () {
                    try { arg2(); } catch (e) {
                        if (shieldRef && shieldRef.log) shieldRef.log('core', 'destroyHelper', e);
                    }
                });
            }
            return;
        }

        var ctx = arg1;
        if (!ctx) return;

        if (ctx.intervals) {
            for (var i = 0; i < ctx.intervals.length; i++) clearInterval(ctx.intervals[i]);
            ctx.intervals = [];
        }
        if (ctx.timeouts) {
            for (var t = 0; t < ctx.timeouts.length; t++) clearTimeout(ctx.timeouts[t]);
            ctx.timeouts = [];
        }
        if (ctx.unwatchers) {
            for (var w = 0; w < ctx.unwatchers.length; w++) {
                if (typeof ctx.unwatchers[w] === 'function') ctx.unwatchers[w]();
            }
            ctx.unwatchers = [];
        }
        if (ctx.listeners) {
            for (var l = 0; l < ctx.listeners.length; l++) {
                var ln = ctx.listeners[l];
                if (ln && ln.el && ln.event && ln.fn) {
                    try {
                        if (ln.el.removeEventListener) ln.el.removeEventListener(ln.event, ln.fn);
                        else if (ln.el.off) ln.el.off(ln.event, ln.fn);
                    } catch (e) { /* ignore */ }
                }
            }
            ctx.listeners = [];
        }
        if (ctx.widgets) {
            for (var wn in ctx.widgets) {
                if (ctx.widgets.hasOwnProperty(wn)) {
                    try { var wgt = ctx.widgets[wn]; if (wgt && wgt.destroy) wgt.destroy(); } catch (e) { /* ignore */ }
                }
            }
            ctx.widgets = {};
        }
        if (ctx.bus) {
            try { ctx.bus.reset(); } catch (e) { /* ignore */ }
        }
    };


    // ═══════════════════════════════════════
    //  5. AF PATH UTILITIES
    // ═══════════════════════════════════════

    S.AF = {};

    S.AF.parsePath = function (label) {
        var empty = { server:'', db:'', elements:[], element:'', attribute:'', fullPath:'' };
        if (!label || typeof label !== 'string') return empty;

        var path = label;
        if (path.indexOf('af:') === 0) path = path.substring(3);

        var attribute = '';
        var pipeIdx = path.indexOf('|');
        if (pipeIdx >= 0) {
            attribute = path.substring(pipeIdx + 1).replace(/^\s+|\s+$/g, '');
            path = path.substring(0, pipeIdx);
        }

        path = path.replace(/\\\\/g, '\\').replace(/^\\+/, '');

        var parts = path.split('\\');
        var clean = [];
        for (var i = 0; i < parts.length; i++) {
            var p = parts[i].replace(/^\s+|\s+$/g, '');
            if (p) clean.push(p);
        }

        var server   = clean.length > 0 ? clean[0] : '';
        var db       = clean.length > 1 ? clean[1] : '';
        var elements = clean.length > 2 ? clean.slice(2) : [];
        var element  = elements.length > 0 ? elements[elements.length - 1] : '';

        return { server: server, db: db, elements: elements, element: element, attribute: attribute, fullPath: label };
    };

    S.AF.safeVal = function (row, decimals) {
        var bad = { display: '---', numeric: 0, good: false, isDigitalState: false };
        if (!row) return bad;

        var v = row.Value;
        if (typeof v === 'object' && v !== null && v.Value !== undefined) v = v.Value;
        if (v === null || v === undefined) return bad;

        var n = parseFloat(v);
        if (!isNaN(n)) {
            decimals = (decimals !== undefined) ? decimals : 1;
            return { display: S.formatNum(n, decimals), numeric: n, good: row.Good !== false, isDigitalState: false };
        }

        return { display: String(v), numeric: 0, good: row.Good !== false, isDigitalState: typeof v === 'string' && (/^[A-Z]/.test(v) || v.indexOf('|') >= 0) };
    };


    // ═══════════════════════════════════════
    //  6. PI WEB API CLIENT
    // ═══════════════════════════════════════

    function PIWebAPI(baseUrl) {
        this._base = baseUrl || '';
        this._csrf = '';
        this._connected = false;
        this._lastError = null;
        this._demoMode = false;
    }

    PIWebAPI.prototype._detectBase = function () {
        if (this._base) return;
        var loc = root.location;
        this._base = loc.protocol + '//' + loc.host + '/Piwebapi';
    };

    /** Enable or disable demo mode for this client instance */
    PIWebAPI.prototype.setDemoMode = function (enabled) {
        this._demoMode = !!enabled;
    };

    /** Check if demo mode is active (instance-level or global) */
    PIWebAPI.prototype._isDemoActive = function () {
        return this._demoMode || PIWebAPI.prototype._globalDemoMode;
    };

    /** Global demo mode flag — set by offline-manager.js */
    PIWebAPI.prototype._globalDemoMode = false;

    // ── Demo response generator (private) ──────────────────

    function _generateDemoResponse(path) {
        var now = new Date();

        // Helper: generate a random WebId-like string
        function _webId(prefix) {
            var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            var id = prefix || 'W';
            for (var i = 0; i < 20; i++) {
                id += chars.charAt(Math.floor(Math.random() * chars.length));
            }
            return id;
        }

        // Helper: generate hourly timestamped values for the last 24h
        function _timeSeriesValues(hours) {
            hours = hours || 24;
            var items = [];
            var base = 48 + Math.random() * 4; // base around 48-52
            for (var h = hours; h >= 0; h--) {
                var ts = new Date(now.getTime() - h * 3600000);
                var val = base + (Math.random() - 0.5) * 6;
                items.push({
                    Timestamp: ts.toISOString(),
                    Value: Math.round(val * 100) / 100,
                    UnitsAbbreviation: 'Hz',
                    Good: true,
                    Questionable: false,
                    Substituted: false
                });
            }
            return items;
        }

        // Helper: generate sample event frames
        function _eventFrames(count) {
            count = count || 5;
            var severities = ['Low', 'Medium', 'High', 'Critical'];
            var names = [
                '\u05D7\u05E8\u05D9\u05D2\u05D4 \u05DE\u05EA\u05D7 \u05DC\u05D0\u05DC\u05EA\u05E8',
                '\u05E2\u05DC\u05D9\u05D9\u05EA \u05DE\u05EA\u05D7',
                '\u05D9\u05E8\u05D9\u05D3\u05EA \u05EA\u05D3\u05E8',
                '\u05D0\u05D9\u05E8\u05D5\u05E2 \u05EA\u05D7\u05D6\u05D5\u05E7\u05D4',
                '\u05D1\u05D3\u05D9\u05E7\u05EA \u05E2\u05D5\u05DE\u05E1',
                '\u05D4\u05E4\u05E1\u05E7\u05EA \u05D7\u05E9\u05DE\u05DC'
            ];
            var frames = [];
            for (var i = 0; i < count; i++) {
                var startMs = now.getTime() - (i + 1) * 3600000 * (2 + Math.random() * 4);
                var endMs   = startMs + 1800000 + Math.random() * 3600000;
                frames.push({
                    WebId: _webId('EF'),
                    Name: names[i % names.length] + ' #' + (i + 1),
                    Description: '\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D3\u05DE\u05D5 \u05DE\u05E1\u05E4\u05E8 ' + (i + 1),
                    StartTime: new Date(startMs).toISOString(),
                    EndTime: new Date(endMs).toISOString(),
                    Severity: severities[Math.floor(Math.random() * severities.length)],
                    AcknowledgedBy: '',
                    IsAcknowledged: false
                });
            }
            return frames;
        }

        var lowerPath = path.toLowerCase();

        // ── /assetservers
        if (/\/assetservers\/?$/i.test(path)) {
            return {
                Items: [{
                    WebId: _webId('S'),
                    Name: 'IL-PI-SERVER',
                    Description: 'Israel Grid PI AF Server (Demo)',
                    IsConnected: true,
                    ServerVersion: '2018 SP3',
                    Links: { Self: '/assetservers/' + _webId('S') }
                }]
            };
        }

        // ── /assetdatabases
        if (/\/assetdatabases\/?$/i.test(path)) {
            return {
                Items: [{
                    WebId: _webId('D'),
                    Name: 'IEC_Grid',
                    Description: '\u05DE\u05E1\u05D3 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05E9\u05DC \u05E8\u05E9\u05EA \u05D4\u05D7\u05E9\u05DE\u05DC \u2014 \u05D3\u05DE\u05D5',
                    Path: '\\\\IL-PI-SERVER\\IEC_Grid',
                    Links: { Self: '/assetdatabases/' + _webId('D') }
                }]
            };
        }

        // ── /elements (child elements or database root elements)
        if (/\/elements\/?(\?|$)/i.test(path)) {
            var elementNames = [
                '\u05EA\u05D7\u05E0\u05EA \u05DB\u05D5\u05D7 \u05D0\u05D5\u05E8\u05D5\u05EA',
                '\u05EA\u05D7\u05E0\u05EA \u05DB\u05D5\u05D7 \u05D7\u05D3\u05E8\u05D4',
                '\u05EA\u05D7\u05E0\u05EA \u05DB\u05D5\u05D7 \u05E8\u05D5\u05EA\u05DD',
                '\u05E7\u05D5 \u05DE\u05E2\u05E8\u05D1\u05D9 230KV',
                '\u05DE\u05E8\u05DB\u05D6 \u05D1\u05E7\u05E8\u05D4 \u05D0\u05E8\u05E6\u05D9',
                '\u05E7\u05D5 \u05DE\u05D6\u05E8\u05D7\u05D9 132KV',
                '\u05DE\u05E2\u05E8\u05DB\u05EA \u05D4\u05D5\u05DC\u05DB\u05D4'
            ];
            var elems = [];
            for (var ei = 0; ei < elementNames.length; ei++) {
                elems.push({
                    WebId: _webId('E'),
                    Name: elementNames[ei],
                    Description: '\u05D0\u05DC\u05DE\u05E0\u05D8 \u05D3\u05DE\u05D5 — ' + elementNames[ei],
                    TemplateName: 'PowerStation',
                    HasChildren: true,
                    Path: '\\\\IL-PI-SERVER\\IEC_Grid\\' + elementNames[ei],
                    Links: { Self: '/elements/' + _webId('E') }
                });
            }
            return { Items: elems };
        }

        // ── /attributes
        if (/\/attributes\/?(\?|$)/i.test(path)) {
            var attrDefs = [
                { name: 'Frequency',   unit: 'Hz',  defVal: 50.01 },
                { name: 'Voltage',     unit: 'kV',  defVal: 230.5 },
                { name: 'ActivePower', unit: 'MW',  defVal: 1245.3 },
                { name: 'ReactivePower', unit: 'MVAR', defVal: 312.7 },
                { name: 'Current',     unit: 'A',   defVal: 876.2 },
                { name: 'Temperature', unit: '\u00B0C', defVal: 38.4 },
                { name: 'Status',      unit: '',    defVal: 'Active' }
            ];
            var attrs = [];
            for (var ai = 0; ai < attrDefs.length; ai++) {
                var ad = attrDefs[ai];
                attrs.push({
                    WebId: _webId('A'),
                    Name: ad.name,
                    Description: 'Demo attribute — ' + ad.name,
                    DefaultUnitsName: ad.unit,
                    Type: typeof ad.defVal === 'number' ? 'Double' : 'String',
                    Value: ad.defVal,
                    HasChildren: false,
                    Path: '\\\\IL-PI-SERVER\\IEC_Grid|' + ad.name,
                    Links: { Self: '/attributes/' + _webId('A') }
                });
            }
            return { Items: attrs };
        }

        // ── /streams/.../value (single current value)
        if (/\/streams\/[^/]+\/value/i.test(path)) {
            var sv = 48 + Math.random() * 4;
            return {
                Timestamp: now.toISOString(),
                Value: Math.round(sv * 1000) / 1000,
                UnitsAbbreviation: 'Hz',
                Good: true,
                Questionable: false,
                Substituted: false
            };
        }

        // ── /streams/.../recorded
        if (/\/streams\/[^/]+\/recorded/i.test(path)) {
            return { Items: _timeSeriesValues(24) };
        }

        // ── /streams/.../interpolated
        if (/\/streams\/[^/]+\/interpolated/i.test(path)) {
            return { Items: _timeSeriesValues(24) };
        }

        // ── /eventframes
        if (/\/eventframes/i.test(path)) {
            return { Items: _eventFrames(6) };
        }

        // ── /system
        if (/\/system\/?$/i.test(path)) {
            return {
                ProductTitle: 'PI Web API (Demo)',
                ProductVersion: '2019 SP1',
                Links: {}
            };
        }

        // ── /system/userinfo
        if (/\/system\/userinfo/i.test(path)) {
            return {
                Name: 'DemoUser',
                IsAuthenticated: true,
                IdentityType: 'Demo'
            };
        }

        // ── Fallback — generic empty success
        return {};
    }

    PIWebAPI.prototype._xhr = function (method, path, body, cb) {
        this._detectBase();

        // ── Demo mode interception ──
        if (this._isDemoActive()) {
            var demoData = _generateDemoResponse(path);
            // Deliver asynchronously to match real XHR behaviour
            var self = this;
            setTimeout(function () {
                self._connected = true;
                self._lastError = null;
                cb(null, demoData);
            }, 50 + Math.random() * 100);
            return null;
        }

        var self = this;
        var $ = root.jQuery;
        if (!$) { cb({ status: 0, text: 'jQuery not available' }); return null; }

        var opts = {
            url: self._base + path, method: method, dataType: 'json',
            xhrFields: { withCredentials: true }, timeout: 15000
        };
        if (self._csrf) opts.headers = { 'X-CSRF-TOKEN': self._csrf };
        if (body && method === 'POST') { opts.contentType = 'application/json'; opts.data = JSON.stringify(body); }

        return $.ajax(opts)
            .done(function (data, status, xhr) {
                var csrf = xhr.getResponseHeader('X-CSRF-TOKEN');
                if (csrf) self._csrf = csrf;
                self._connected = true; self._lastError = null;
                // Store base URL for offline-manager PI ping
                if (root._PIV_SHARED) root._PIV_SHARED._lastPIBase = self._base;
                cb(null, data);
            })
            .fail(function (xhr) {
                var err = { status: xhr.status, text: xhr.statusText, url: self._base + path };
                self._lastError = err; cb(err);
            });
    };

    PIWebAPI.prototype._get  = function (path, cb) { return this._xhr('GET', path, null, cb); };
    PIWebAPI.prototype._post = function (path, body, cb) { return this._xhr('POST', path, body, cb); };

    PIWebAPI.prototype.getServers = function (cb) {
        return this._get('/assetservers', function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.getDatabases = function (serverWebId, cb) {
        return this._get('/assetservers/' + encodeURIComponent(serverWebId) + '/assetdatabases', function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.getElements = function (parentWebId, cb) {
        return this._get('/elements/' + encodeURIComponent(parentWebId) + '/elements?maxCount=200', function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.getDatabaseElements = function (dbWebId, cb) {
        return this._get('/assetdatabases/' + encodeURIComponent(dbWebId) + '/elements?maxCount=200', function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.getAttributes = function (elementWebId, cb) {
        return this._get('/elements/' + encodeURIComponent(elementWebId) + '/attributes?maxCount=100', function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.getStreamValue = function (attrWebId, cb) {
        return this._get('/streams/' + encodeURIComponent(attrWebId) + '/value', cb);
    };
    PIWebAPI.prototype.getRecorded = function (webId, startTime, endTime, maxCount, cb) {
        var params = '?startTime=' + encodeURIComponent(startTime || '*-24h') + '&endTime=' + encodeURIComponent(endTime || '*') + '&maxCount=' + (maxCount || 1000);
        return this._get('/streams/' + encodeURIComponent(webId) + '/recorded' + params, function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.getInterpolated = function (webId, startTime, endTime, interval, cb) {
        var params = '?startTime=' + encodeURIComponent(startTime || '*-24h') + '&endTime=' + encodeURIComponent(endTime || '*') + '&interval=' + encodeURIComponent(interval || '1h');
        return this._get('/streams/' + encodeURIComponent(webId) + '/interpolated' + params, function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.writeRecordedBatch = function (items, cb) { return this._post('/streamsets/recorded', { Items: items }, cb); };
    PIWebAPI.prototype.getByPath = function (afPath, cb) { return this._get('/elements?path=' + encodeURIComponent(afPath), cb); };
    PIWebAPI.prototype.getAttributeByPath = function (attrPath, cb) { return this._get('/attributes?path=' + encodeURIComponent(attrPath), cb); };
    PIWebAPI.prototype.searchElements = function (dbWebId, query, maxCount, cb) {
        maxCount = maxCount || 50;
        var path = '/assetdatabases/' + encodeURIComponent(dbWebId) + '/elements?nameFilter=*' + encodeURIComponent(query) + '*&maxCount=' + maxCount;
        return this._get(path, function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.getEventFrames = function (elementWebId, startTime, endTime, maxCount, cb) {
        maxCount = maxCount || 100;
        var params = '?startTime=' + encodeURIComponent(startTime || '*-7d') + '&endTime=' + encodeURIComponent(endTime || '*') + '&maxCount=' + maxCount + '&sortOrder=Descending&sortField=StartTime';
        return this._get('/elements/' + encodeURIComponent(elementWebId) + '/eventframes' + params, function (e, d) { cb(e, d && d.Items ? d.Items : []); });
    };
    PIWebAPI.prototype.getSystem = function (cb) { return this._get('/system', cb); };
    PIWebAPI.prototype.getUserInfo = function (cb) { return this._get('/system/userinfo', cb); };
    PIWebAPI.prototype.isConnected = function () { return this._connected; };
    PIWebAPI.prototype.getLastError = function () { return this._lastError; };

    S.PIWebAPI = PIWebAPI;


    // ═══════════════════════════════════════
    //  getCached — fetch through requestCache
    // ═══════════════════════════════════════

    PIWebAPI.prototype.getCached = function (path, cb) {
        var self = this;
        S.requestCache.get(
            (self._base || '') + path,
            function (url, fetchCb) {
                self._get(path, fetchCb);
            },
            cb
        );
    };


    // ═══════════════════════════════════════
    //  8. REQUEST DEDUPLICATION + CACHE
    // ═══════════════════════════════════════

    S.requestCache = (function () {
        var _cache = {};      // url → { data, ts }
        var _pending = {};    // url → [cb, cb, ...]
        var TTL = 30000;      // 30 second cache TTL

        return {
            get: function (url, fetchFn, cb) {
                // 1. Check cache
                var cached = _cache[url];
                if (cached && (Date.now() - cached.ts < TTL)) {
                    cb(null, cached.data);
                    return;
                }
                // 2. Check if request is already in-flight (dedup)
                if (_pending[url]) {
                    _pending[url].push(cb);
                    return;
                }
                // 3. New request
                _pending[url] = [cb];
                fetchFn(url, function (err, data) {
                    // Cache successful responses
                    if (!err && data) {
                        _cache[url] = { data: data, ts: Date.now() };
                    }
                    // Notify all waiters
                    var cbs = _pending[url] || [];
                    delete _pending[url];
                    for (var i = 0; i < cbs.length; i++) {
                        try { cbs[i](err, data); } catch (e) { /* ignore */ }
                    }
                });
            },
            invalidate: function (urlPattern) {
                // Invalidate cache entries matching a pattern
                for (var url in _cache) {
                    if (_cache.hasOwnProperty(url) && url.indexOf(urlPattern) >= 0) {
                        delete _cache[url];
                    }
                }
            },
            clear: function () { _cache = {}; },
            setTTL: function (ms) { TTL = ms; },
            stats: function () {
                return { cached: Object.keys(_cache).length, pending: Object.keys(_pending).length };
            }
        };
    })();


    // ═══════════════════════════════════════
    //  7. NAMESPACE WIRING HELPER
    // ═══════════════════════════════════════

    S.wireNamespace = function (ns, label) {
        ns.shield     = S.createShield(label);
        ns.createBus  = function () { return S.createBus(ns.shield); };
        ns.escapeHtml = S.escapeHtml;
        ns.formatNum  = S.formatNum;
        ns.formatDate = S.formatDate;
        ns.PIWebAPI   = S.PIWebAPI;
        ns.AF         = ns.AF || {};
        ns.AF.parsePath = S.AF.parsePath;
        ns.AF.safeVal   = S.AF.safeVal;
        ns.destroyHelper = function (arg1, arg2) { S.destroyHelper(arg1, arg2, ns.shield); };
        ns.requestCache  = S.requestCache;
    };

})(typeof window !== 'undefined' ? window : this);
