/**
 * ═══════════════════════════════════════════════════════
 *  PIV20-CORE  —  PI Vision v20 Infrastructure
 * ═══════════════════════════════════════════════════════
 *  Signal bus · Error shield · Safe helpers · Formatting
 *  PI Web API client · AF path utilities · UI helpers
 *
 *  Version : 20.0.R1
 *  ES5 only
 *  Loaded FIRST via <script> in template; all widgets
 *  depend on window.PIV20 namespace.
 * ═══════════════════════════════════════════════════════
 */
(function (root) {
    'use strict';

    // Prevent double-init — merge with existing PIV20 (may be pre-populated by emu-shims)
    var PIV20 = root.PIV20 = root.PIV20 || {};
    if (PIV20._coreLoaded) return;
    PIV20._coreLoaded = true;
    PIV20._loaded = true;
    PIV20.VERSION = PIV20.VERSION || '20.0.R1';


    // ═══════════════════════════════════════
    //  1. SIGNAL BUS  (per-instance factory)
    // ═══════════════════════════════════════

    /**
     * Creates a fresh, isolated pub/sub bus.
     * Each symbol instance gets its own bus so events
     * never leak between multiple symbols on one display.
     *
     * @returns {{ on, off, emit, once, reset, destroy }}
     */
    PIV20.createBus = function () {
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
                for (var i = 0; i < subs.length; i++) {
                    try {
                        subs[i].fn.call(subs[i].ctx, data);
                    } catch (e) {
                        PIV20.shield.log('bus:' + channel, 'emit', e);
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

            reset: function () {
                _channels = {};
            },

            destroy: function () {
                _channels = {};
            }
        };
    };


    // ═══════════════════════════════════════
    //  2. ERROR SHIELD
    // ═══════════════════════════════════════

    PIV20.shield = (function () {
        var _errors = [];
        var MAX = 200;

        return {
            /**
             * Wrap a function in try/catch. Returns a safe version.
             * @param {string} source  - widget name (e.g. 'waterfall20')
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
                    console.error('[PIV20][' + source + '.' + fnName + ']', error);
                }
            },

            getErrors: function () {
                return _errors.slice();
            },

            clear: function () {
                _errors.length = 0;
            },

            renderFallback: function (el, widgetName, err) {
                var html =
                    '<div class="piv20-error-fallback" dir="rtl">' +
                        '<span>\u26A0 \u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D8\u05E2\u05D9\u05E0\u05EA ' + PIV20.escapeHtml(widgetName) + '</span>' +
                        '<br><small>' + PIV20.escapeHtml((err && err.message) || '') + '</small>' +
                    '</div>';
                if (el.html) { el.html(html); } else { el.innerHTML = html; }
            }
        };
    })();


    // ═══════════════════════════════════════
    //  3. SAFE HELPERS
    // ═══════════════════════════════════════

    /**
     * Safe AngularJS $apply — avoids "$digest already in progress".
     * @param {Object} scope - AngularJS scope
     */
    PIV20.safeApply = function (scope) {
        if (!scope) return;
        try {
            var phase = scope.$root && scope.$root.$$phase;
            if (phase !== '$apply' && phase !== '$digest') {
                scope.$apply();
            }
        } catch (e) {
            PIV20.shield.log('core', 'safeApply', e);
        }
    };

    /**
     * Safely initialize a jQuery widget on a container element.
     * Guards against missing jQuery UI / widget factory.
     *
     * @param {jQuery|HTMLElement} $root - the container element
     * @param {string} widgetName - e.g. 'piv20Afbrowser'
     * @param {Object} opts - options to pass to the widget constructor
     */
    PIV20.safeWidget = function ($root, widgetName, opts) {
        try {
            var $ = root.jQuery;
            if (!$) return;
            var el = $.fn ? ($root.jquery ? $root : $($root)) : null;
            if (el && el[widgetName]) {
                el[widgetName](opts || {});
            }
        } catch (e) {
            PIV20.shield.log('core', 'safeWidget:' + widgetName, e);
            PIV20.shield.renderFallback($root, widgetName, e);
        }
    };

    /**
     * Initialize a symbol with standard lifecycle wiring.
     * Called from symbols that follow the late-binding pattern.
     *
     * @param {Object} scope - AngularJS scope
     * @param {jQuery} elem  - symbol root element
     * @param {Object} opts  - { name, bus, widgetName, $root }
     */
    PIV20.initSymbol = function (scope, elem, opts) {
        if (!opts) return;
        var $root = opts.$root || elem;
        PIV20.safeWidget($root, opts.widgetName, {
            bus: opts.bus,
            config: scope.config
        });
    };

    /**
     * Destroy helper — cleans up intervals, timeouts, watchers, widgets.
     * Supports two call signatures:
     *   1. PIV20.destroyHelper(scope, cleanupFn) — registers $destroy listener
     *   2. PIV20.destroyHelper(_cleanup)          — directly clears a cleanup context object
     *
     * @param {Object} arg1 - scope (signature 1) or _cleanup object (signature 2)
     * @param {Function} [arg2] - cleanup callback (signature 1 only)
     */
    PIV20.destroyHelper = function (arg1, arg2) {
        // Signature 1: destroyHelper(scope, fn) — register $destroy
        if (typeof arg2 === 'function') {
            var scope = arg1;
            if (scope && scope.$on) {
                scope.$on('$destroy', function () {
                    try { arg2(); } catch (e) {
                        PIV20.shield.log('core', 'destroyHelper', e);
                    }
                });
            }
            return;
        }

        // Signature 2: destroyHelper(_cleanup) — direct cleanup
        var ctx = arg1;
        if (!ctx) return;

        // Clear intervals
        if (ctx.intervals) {
            for (var i = 0; i < ctx.intervals.length; i++) {
                clearInterval(ctx.intervals[i]);
            }
            ctx.intervals = [];
        }

        // Clear timeouts
        if (ctx.timeouts) {
            for (var t = 0; t < ctx.timeouts.length; t++) {
                clearTimeout(ctx.timeouts[t]);
            }
            ctx.timeouts = [];
        }

        // AngularJS watchers
        if (ctx.unwatchers) {
            for (var w = 0; w < ctx.unwatchers.length; w++) {
                if (typeof ctx.unwatchers[w] === 'function') ctx.unwatchers[w]();
            }
            ctx.unwatchers = [];
        }

        // Event listeners
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

        // jQuery widgets
        if (ctx.widgets) {
            for (var wn in ctx.widgets) {
                if (ctx.widgets.hasOwnProperty(wn)) {
                    try {
                        var wgt = ctx.widgets[wn];
                        if (wgt && wgt.destroy) wgt.destroy();
                    } catch (e) { /* ignore */ }
                }
            }
            ctx.widgets = {};
        }

        // Bus
        if (ctx.bus) {
            try { ctx.bus.reset(); } catch (e) { /* ignore */ }
        }
    };


    // ═══════════════════════════════════════
    //  4. FORMATTING HELPERS
    // ═══════════════════════════════════════

    PIV20.fmt = {
        /**
         * Format current time as HH:MM:SS.
         * @param {Date} [dt] - optional date, defaults to now
         * @returns {string}
         */
        time: function (dt) {
            var d = dt || new Date();
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        },

        /**
         * Format a Date as DD/MM/YYYY.
         * @param {Date|string} [dt] - optional date, defaults to now
         * @returns {string}
         */
        date: function (dt) {
            var d = dt ? (dt instanceof Date ? dt : new Date(dt)) : new Date();
            if (isNaN(d.getTime())) return '--';
            var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
            return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
        }
    };


    // ═══════════════════════════════════════
    //  5. DOCS HELPER
    // ═══════════════════════════════════════

    PIV20.docs = {
        /**
         * Show inline documentation / help panel for a symbol.
         * @param {string} symName - symbol name (e.g. 'afbrowser20')
         * @param {Object} scope   - AngularJS scope
         * @param {jQuery} elem    - symbol root element
         */
        show: function (symName, scope, elem) {
            if (!scope || !elem) return;
            scope.showingDocs = !scope.showingDocs;
            PIV20.safeApply(scope);
        }
    };


    // ═══════════════════════════════════════
    //  6. UI HELPERS
    // ═══════════════════════════════════════

    PIV20.ui = {
        /**
         * Show a temporary toast notification inside a container.
         * @param {HTMLElement|jQuery} container
         * @param {string} msg       - message text
         * @param {number} [duration=2500] - ms to show
         * @param {string} [style='info'] - 'info' | 'success' | 'warn' | 'error'
         */
        showToast: function (container, msg, duration, style) {
            duration = duration || 2500;
            style = style || 'info';
            var el = container;
            if (el && el.jquery) el = el[0];
            if (!el) return;

            var toast = document.createElement('div');
            toast.className = 'piv20-toast piv20-toast--' + style;
            toast.setAttribute('dir', 'rtl');
            toast.textContent = msg || '';
            toast.style.cssText = 'position:absolute;top:8px;left:50%;transform:translateX(-50%);' +
                'z-index:9999;padding:8px 18px;border-radius:6px;font-size:13px;' +
                'background:rgba(0,0,0,0.82);color:#fff;pointer-events:none;' +
                'opacity:0;transition:opacity .25s ease';

            el.style.position = el.style.position || 'relative';
            el.appendChild(toast);

            // Fade in
            setTimeout(function () { toast.style.opacity = '1'; }, 30);
            // Fade out + remove
            setTimeout(function () {
                toast.style.opacity = '0';
                setTimeout(function () {
                    if (toast.parentNode) toast.parentNode.removeChild(toast);
                }, 300);
            }, duration);
        }
    };


    // ═══════════════════════════════════════
    //  7. UTILITY FUNCTIONS
    // ═══════════════════════════════════════

    PIV20.escapeHtml = function (str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    };

    PIV20.formatNum = function (val, decimals, useSep) {
        if (val === null || val === undefined || isNaN(val)) return '--';
        decimals = (decimals !== undefined) ? decimals : 1;
        useSep = (useSep !== undefined) ? useSep : true;
        var fixed = Number(val).toFixed(decimals);
        if (!useSep) return fixed;
        var parts = fixed.split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    };

    PIV20.formatDate = function (dt, fmt) {
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
    //  8. PI WEB API CLIENT
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
     * Uses location.origin + '/Piwebapi' — matches IIS virtual directory.
     */
    PIWebAPI.prototype._detectBase = function () {
        if (this._base) return;
        var loc = root.location;
        this._base = loc.protocol + '//' + loc.host + '/Piwebapi';
    };

    PIWebAPI.prototype._xhr = function (method, path, body, cb) {
        this._detectBase();
        var self = this;
        var $ = root.jQuery;

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

        if (self._csrf) {
            opts.headers = { 'X-CSRF-TOKEN': self._csrf };
        }

        if (body && method === 'POST') {
            opts.contentType = 'application/json';
            opts.data = JSON.stringify(body);
        }

        return $.ajax(opts)
            .done(function (data, status, xhr) {
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

    PIWebAPI.prototype._get = function (path, cb) {
        return this._xhr('GET', path, null, cb);
    };

    PIWebAPI.prototype._post = function (path, body, cb) {
        return this._xhr('POST', path, body, cb);
    };

    PIWebAPI.prototype.getServers = function (cb) {
        return this._get('/assetservers', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    PIWebAPI.prototype.getDatabases = function (serverWebId, cb) {
        return this._get('/assetservers/' + encodeURIComponent(serverWebId) + '/assetdatabases', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    PIWebAPI.prototype.getElements = function (parentWebId, cb) {
        return this._get('/elements/' + encodeURIComponent(parentWebId) + '/elements?maxCount=200', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    PIWebAPI.prototype.getDatabaseElements = function (dbWebId, cb) {
        return this._get('/assetdatabases/' + encodeURIComponent(dbWebId) + '/elements?maxCount=200', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    PIWebAPI.prototype.getAttributes = function (elementWebId, cb) {
        return this._get('/elements/' + encodeURIComponent(elementWebId) + '/attributes?maxCount=100', function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    PIWebAPI.prototype.getStreamValue = function (attrWebId, cb) {
        return this._get('/streams/' + encodeURIComponent(attrWebId) + '/value', cb);
    };

    PIWebAPI.prototype.getRecorded = function (webId, startTime, endTime, maxCount, cb) {
        var params = '?startTime=' + encodeURIComponent(startTime || '*-24h') +
                     '&endTime='   + encodeURIComponent(endTime || '*') +
                     '&maxCount='  + (maxCount || 1000);
        return this._get('/streams/' + encodeURIComponent(webId) + '/recorded' + params, function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    PIWebAPI.prototype.getInterpolated = function (webId, startTime, endTime, interval, cb) {
        var params = '?startTime=' + encodeURIComponent(startTime || '*-24h') +
                     '&endTime='   + encodeURIComponent(endTime || '*') +
                     '&interval='  + encodeURIComponent(interval || '1h');
        return this._get('/streams/' + encodeURIComponent(webId) + '/interpolated' + params, function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

    PIWebAPI.prototype.writeRecordedBatch = function (items, cb) {
        return this._post('/streamsets/recorded', { Items: items }, cb);
    };

    PIWebAPI.prototype.getByPath = function (afPath, cb) {
        return this._get('/elements?path=' + encodeURIComponent(afPath), cb);
    };

    PIWebAPI.prototype.getAttributeByPath = function (attrPath, cb) {
        return this._get('/attributes?path=' + encodeURIComponent(attrPath), cb);
    };

    PIWebAPI.prototype.searchElements = function (dbWebId, query, maxCount, cb) {
        maxCount = maxCount || 50;
        var path = '/assetdatabases/' + encodeURIComponent(dbWebId) +
                   '/elements?nameFilter=*' + encodeURIComponent(query) +
                   '*&maxCount=' + maxCount;
        return this._get(path, function (err, data) {
            cb(err, data && data.Items ? data.Items : []);
        });
    };

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

    PIWebAPI.prototype.getSystem = function (cb) {
        return this._get('/system', cb);
    };

    PIWebAPI.prototype.getUserInfo = function (cb) {
        return this._get('/system/userinfo', cb);
    };

    PIWebAPI.prototype.isConnected = function () {
        return this._connected;
    };

    PIWebAPI.prototype.getLastError = function () {
        return this._lastError;
    };

    PIV20.PIWebAPI = PIWebAPI;


    // ═══════════════════════════════════════
    //  9. AF PATH UTILITIES
    // ═══════════════════════════════════════

    PIV20.AF = {};

    PIV20.AF.parsePath = function (label) {
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

        return {
            server:    server,
            db:        db,
            elements:  elements,
            element:   element,
            attribute: attribute,
            fullPath:  label
        };
    };

    PIV20.AF.safeVal = function (row, decimals) {
        var bad = { display: '---', numeric: 0, good: false, isDigitalState: false };
        if (!row) return bad;

        var v = row.Value;
        if (typeof v === 'object' && v !== null && v.Value !== undefined) {
            v = v.Value;
        }

        if (v === null || v === undefined) return bad;

        var n = parseFloat(v);
        if (!isNaN(n)) {
            decimals = (decimals !== undefined) ? decimals : 1;
            return {
                display: PIV20.formatNum(n, decimals),
                numeric: n,
                good: row.Good !== false,
                isDigitalState: false
            };
        }

        return {
            display: String(v),
            numeric: 0,
            good: row.Good !== false,
            isDigitalState: typeof v === 'string' && (/^[A-Z]/.test(v) || v.indexOf('|') >= 0)
        };
    };


})(typeof window !== 'undefined' ? window : this);
