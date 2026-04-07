/**
 * emu-shims.js — PI Vision Symbol Emulator Shim Layer
 * Provides: PIVisualization, PIV20, MU20, MM20 namespaces
 * Angular mini-runtime, jQuery widget factory mock, PI Web API mock
 * ~2000 lines  ES5 compatible
 */
(function (root) {
    'use strict';

    /* =========================================================
     *  1. PIVisualization NAMESPACE
     * ========================================================= */
    var _symbolDefs = {};

    var PIVisualization = root.PIVisualization = root.PV = {};

    PIVisualization._loaded = true;
    PIVisualization.VERSION = 'Emulator 1.0';

    /* ── E5: ClientSettings & SecurityContext (PI Vision 2023+) ──
     *  PIVisualization.ClientSettings.PIWebAPIUrl — gateway URL for PI Web API
     *  PIVisualization.SecurityContext.RequestVerificationToken — anti-forgery token
     *  These are required by symbols that use direct PI Web API or OIDC auth.
     */
    PIVisualization.ClientSettings = {
        PIWebAPIUrl: '/piwebapi/',
        ServerUrl: root.location ? root.location.origin : 'http://localhost',
        IsEmulator: true
    };

    PIVisualization.SecurityContext = {
        RequestVerificationToken: 'EMU-MOCK-TOKEN-' + Date.now(),
        IsAuthenticated: true,
        UserName: 'emulator-admin',
        // Helper to set up jQuery AJAX headers (PI Vision 2023 pattern)
        setupAjaxHeaders: function () {
            if (root.jQuery && root.jQuery.ajaxSetup) {
                root.jQuery.ajaxSetup({
                    headers: {
                        'RequestVerificationToken': PIVisualization.SecurityContext.RequestVerificationToken
                    }
                });
            }
        }
    };

    /* -- Extensibility enums (aligned with PI Vision Extensibility Guide) -- */
    PIVisualization.Extensibility = {
        Enums: {
            ObjectTypes: { sym: 'sym' },
            Formats: {
                Value:      'Value',       // Single data point at specific time
                Gauge:      'Gauge',       // Single source with min/max/indicator ratio
                Trend:      'Trend',       // Multiple traces with LineSegments in 100x100 space
                Table:      'Table',       // Multiple sources with statistical summaries
                TimeSeries: 'TimeSeries',  // Raw data values array
                XYPlot:     'XYPlot'       // Scatter/XY data points
            },
            DatasourceBehaviors: {
                None:     0,    // No data sources
                Single:   1,    // Single data source
                Multiple: 2,    // Multiple data sources
                All:      'All' // Legacy compat
            }
        }
    };

    /* -- Valid DataShape names for validation -- */
    var _VALID_SHAPES = { None:1, Value:1, Gauge:1, Trend:1, Table:1, TimeSeries:1, XYPlot:1 };

    /* -- Symbol Catalog -- */
    PIVisualization.symbolCatalog = {
        _defs: _symbolDefs,
        register: function (def) {
            if (!def || !def.typeName) { console.warn('[PV.symbolCatalog.register] missing typeName', def); return; }

            // ── E2: Validate DataShape against PI Vision spec ──
            var cfg = (typeof def.getDefaultConfig === 'function') ? def.getDefaultConfig() : null;
            var shape = cfg && cfg.DataShape;
            if (shape && !_VALID_SHAPES[shape]) {
                console.warn('[PV.symbolCatalog.register] "' + def.typeName + '" has unknown DataShape "' + shape + '". Valid shapes: ' + Object.keys(_VALID_SHAPES).join(', '));
            }

            // Validate datasourceBehavior if provided
            var dsb = def.datasourceBehavior;
            if (dsb !== undefined && dsb !== null) {
                var validDSB = { 0:1, 1:1, 2:1, 'None':1, 'Single':1, 'Multiple':1, 'All':1 };
                if (!validDSB[dsb]) {
                    console.warn('[PV.symbolCatalog.register] "' + def.typeName + '" has unknown datasourceBehavior: ' + dsb);
                }
            }

            // ── S6: loadConfig migration support ──
            if (typeof def.loadConfig === 'function') {
                def._hasLoadConfig = true;
            }

            // ── S7: Catalog advanced definition properties ──
            // These properties control display behavior in PI Vision.
            // We normalize them for consistent access.
            if (def.supportsCollections === undefined) def.supportsCollections = false;
            if (def.supportsDynamicSearchCriteria === undefined) def.supportsDynamicSearchCriteria = false;
            if (!def.resizerMode) def.resizerMode = ''; // '' = any direction, 'AutoWidth' = width-only
            // noExpandSelector: CSS class that prevents popup trends on click
            // (e.g., clicking a gauge needle shouldn't open a trend popup)

            _symbolDefs[def.typeName] = def;
            // Notify app layer
            if (root.__EMU_CATALOG_CALLBACK) {
                try { root.__EMU_CATALOG_CALLBACK(def); } catch (e) {}
            }
            if (window.console && window.console.log) {
                console.log('[PV] Registered symbol: ' + def.typeName + (shape ? ' [' + shape + ']' : '') + ' — ' + (def.displayName || ''));
            }
        },
        getSymbol: function (name) { return _symbolDefs[name]; },
        getAllSymbols: function () {
            return Object.keys(_symbolDefs).map(function (k) { return _symbolDefs[k]; });
        }
    };

    /* =========================================================
     *  E7: TOOL PANE CATALOG
     *
     *  PI Vision tool panes register via PV.toolCatalog.register(def).
     *  Tool pane definition:
     *    typeName, displayName, iconUrl, templateUrl, inject, init(scope)
     *  Badge feature: scope.Badge.raise("10") for notifications
     * ========================================================= */
    var _toolDefs = {};

    PIVisualization.toolCatalog = {
        _defs: _toolDefs,
        register: function (def) {
            if (!def || !def.typeName) {
                console.warn('[PV.toolCatalog.register] missing typeName', def);
                return;
            }
            _toolDefs[def.typeName] = def;
            if (root.__EMU_TOOL_CALLBACK) {
                try { root.__EMU_TOOL_CALLBACK(def); } catch (e) {}
            }
            console.log('[PV] Registered tool pane: ' + def.typeName + ' — ' + (def.displayName || ''));
        },
        getTool: function (name) { return _toolDefs[name]; },
        getAllTools: function () {
            return Object.keys(_toolDefs).map(function (k) { return _toolDefs[k]; });
        }
    };

    /* =========================================================
     *  E8: DEPENDENCY INJECTION SERVICE REGISTRY
     *
     *  PI Vision symbols can declare inject: ['$http', '$interval', 'log']
     *  to get services passed to init(). The emulator provides mock
     *  implementations of common PI Vision services.
     * ========================================================= */
    var _services = {};

    PIVisualization.ServiceRegistry = {
        /**
         * Register a service by name.
         */
        register: function (name, impl) {
            _services[name] = impl;
        },

        /**
         * Resolve an array of service names to implementations.
         * Unknown services get a stub that logs a warning.
         */
        resolve: function (names) {
            if (!names || !names.length) return [];
            return names.map(function (name) {
                if (_services[name]) return _services[name];
                // Return a stub for unknown services
                console.warn('[PV.ServiceRegistry] Unknown service: ' + name);
                return {};
            });
        },

        /**
         * Get a single service by name.
         */
        get: function (name) {
            return _services[name] || null;
        }
    };

    // Register common PI Vision services
    _services['$scope'] = null; // Injected per-symbol as scope
    _services['$http'] = {
        get: function (url) {
            return root.fetch ? root.fetch(url).then(function (r) { return r.json(); }) : Promise.resolve({});
        },
        post: function (url, data) {
            return root.fetch ? root.fetch(url, { method: 'POST', body: JSON.stringify(data) }).then(function (r) { return r.json(); }) : Promise.resolve({});
        }
    };
    _services['$interval'] = function (fn, ms) {
        return setInterval(fn, ms);
    };
    _services['$interval'].cancel = function (id) { clearInterval(id); };
    _services['$timeout'] = function (fn, ms) {
        return setTimeout(fn, ms || 0);
    };
    _services['$timeout'].cancel = function (id) { clearTimeout(id); };
    _services['$q'] = {
        defer: function () {
            var _resolve, _reject;
            var promise = new Promise(function (res, rej) { _resolve = res; _reject = rej; });
            return { promise: promise, resolve: _resolve, reject: _reject };
        },
        when: function (val) { return Promise.resolve(val); },
        resolve: function (val) { return Promise.resolve(val); },
        all: function (arr) { return Promise.all(arr); },
        reject: function (reason) { return Promise.reject(reason); }
    };
    _services['log'] = {
        log: function () { console.log.apply(console, arguments); },
        warn: function () { console.warn.apply(console, arguments); },
        error: function () { console.error.apply(console, arguments); },
        info: function () { console.info.apply(console, arguments); }
    };
    _services['$log'] = _services['log'];

    /* -- deriveVisualizationFromBase -- */
    PIVisualization.deriveVisualizationFromBase = function (symbolVis) {
        // Official PI Vision Extensibility API:
        // Sets up the prototype chain so symbol constructors inherit base methods.
        // Supports two calling patterns:
        //   1) v20 style: PV.deriveVisualizationFromBase(symbolVis) — argument is constructor
        //   2) WOW style: called from inside constructor as PV.deriveVisualizationFromBase(this) — argument is instance

        if (typeof symbolVis === 'function') {
            // Pattern 1: Constructor passed directly (v20 style)
            if (symbolVis._derived) return symbolVis;
            symbolVis._derived = true;

            if (!symbolVis.prototype.hasOwnProperty('onDataUpdate'))   symbolVis.prototype.onDataUpdate = null;
            if (!symbolVis.prototype.hasOwnProperty('onResize'))       symbolVis.prototype.onResize = null;
            if (!symbolVis.prototype.hasOwnProperty('onConfigChange')) symbolVis.prototype.onConfigChange = null;
            if (!symbolVis.prototype.hasOwnProperty('onDestroy'))      symbolVis.prototype.onDestroy = null;

            return symbolVis;
        } else {
            // Pattern 2: Instance passed from inside constructor (WOW style)
            // 'this' is the new instance — set lifecycle defaults on it directly
            if (!symbolVis.onDataUpdate)   symbolVis.onDataUpdate = null;
            if (!symbolVis.onResize)       symbolVis.onResize = null;
            if (!symbolVis.onConfigChange) symbolVis.onConfigChange = null;
            if (!symbolVis.onDestroy)      symbolVis.onDestroy = null;

            return symbolVis;
        }
    };

    /* -- Base Visualization (legacy compat) -- */
    function _BaseVis() {}
    _BaseVis.prototype.init = function () {};
    _BaseVis.prototype.dataUpdate = function () {};
    _BaseVis.prototype.configChange = function () {};
    _BaseVis.prototype.resize = function () {};
    _BaseVis.prototype.destroy = function () {};
    PIVisualization._BaseVis = _BaseVis;

    /* =========================================================
     *  E3: FORMAT OPTIONS ENGINE (PI Vision Standard Formats)
     *
     *  PI Vision defines standard format names that symbols declare
     *  in getDefaultConfig().FormatOptions. The format engine:
     *  1. Validates format names against known standards
     *  2. Applies format values as CSS custom properties on the symbol element
     *  3. Supports formatMap for legacy format bridging
     *
     *  Standard format names (from Extensibility Guide):
     *    TextColor, TextSize, TextFont — text styling
     *    BackgroundColor — symbol background
     *    LineColor, LineWidth, LineDashType — border/line
     *    ValueColor — value display color
     *    TitleColor, TitleSize, TitleFont, TitleAlignment — title
     *    FaceColor, NeedleColor, TickColor — gauge-specific
     * ========================================================= */
    var _STANDARD_FORMATS = {
        TextColor: 'color', TextSize: 'font-size', TextFont: 'font-family',
        BackgroundColor: 'background-color',
        LineColor: 'border-color', LineWidth: 'border-width', LineDashType: 'border-style',
        ValueColor: 'color', ValueSize: 'font-size',
        TitleColor: 'color', TitleSize: 'font-size', TitleFont: 'font-family',
        TitleAlignment: 'text-align',
        FaceColor: 'background-color', NeedleColor: 'color', TickColor: 'color',
        BorderColor: 'border-color'
    };

    PIVisualization.FormatEngine = {
        STANDARD_FORMATS: _STANDARD_FORMATS,

        /**
         * Apply FormatOptions to a DOM element as CSS custom properties.
         * @param {HTMLElement} element - the symbol wrapper element
         * @param {Object} formatOptions - the FormatOptions from config
         * @param {Object} [formatMap] - optional legacy name mapping
         */
        apply: function (element, formatOptions, formatMap) {
            if (!element || !formatOptions) return;
            var map = formatMap || {};
            Object.keys(formatOptions).forEach(function (key) {
                var val = formatOptions[key];
                if (val === undefined || val === null) return;
                // Apply as CSS custom property: --pv-format-TextColor
                element.style.setProperty('--pv-format-' + key, String(val));
                // If there's a formatMap entry, also set the mapped name
                var mappedKey = map[key];
                if (mappedKey) {
                    element.style.setProperty('--pv-format-' + mappedKey, String(val));
                }
                // Apply standard CSS directly for common formats
                var cssProp = _STANDARD_FORMATS[key];
                if (cssProp && key.indexOf('Title') !== 0) {
                    // Only apply directly for non-Title formats (Title formats go on .pv-title elements)
                    if (key === 'BackgroundColor') {
                        element.style.backgroundColor = val;
                    } else if (key === 'TextColor') {
                        element.style.color = val;
                    } else if (key === 'TextSize') {
                        element.style.fontSize = (typeof val === 'number') ? val + 'px' : val;
                    }
                }
            });
        },

        /**
         * Validate FormatOptions keys against known standards.
         * Returns array of unknown format names (for QA warnings).
         */
        validate: function (formatOptions) {
            if (!formatOptions) return [];
            var unknown = [];
            Object.keys(formatOptions).forEach(function (key) {
                if (!_STANDARD_FORMATS[key]) {
                    unknown.push(key);
                }
            });
            return unknown;
        }
    };

    /* =========================================================
     *  S5: MULTISTATE ENGINE
     *
     *  PI Vision supports StateVariables in symbol definitions.
     *  StateVariables is an array of property names that can be
     *  bound to multistate conditions (e.g., BackgroundColor changes
     *  from green to red when value exceeds threshold).
     *
     *  This engine:
     *  1. Evaluates multistate conditions against current data
     *  2. Applies state-driven format overrides
     *  3. Supports numeric ranges and string matching
     * ========================================================= */
    PIVisualization.MultistateEngine = {
        /**
         * Define multistate rules for a symbol.
         * @param {Object} config - symbol config object
         * @param {Array} stateVariables - property names from def.StateVariables
         * @param {Array} rules - array of { min, max, match, formats }
         *   formats: { BackgroundColor: 'red', TextColor: 'white' }
         */
        defineRules: function (config, stateVariables, rules) {
            if (!config || !rules) return;
            config._multistateRules = rules;
            config._stateVariables = stateVariables || [];
        },

        /**
         * Evaluate multistate conditions and return active formats.
         * @param {number|string} value - current data value
         * @param {Array} rules - multistate rules array
         * @returns {Object|null} - format overrides to apply, or null
         */
        evaluate: function (value, rules) {
            if (!rules || !rules.length) return null;
            for (var i = 0; i < rules.length; i++) {
                var rule = rules[i];
                // Numeric range check
                if (rule.min !== undefined && rule.max !== undefined) {
                    var num = parseFloat(value);
                    if (!isNaN(num) && num >= rule.min && num <= rule.max) {
                        return rule.formats || null;
                    }
                }
                // String match check
                if (rule.match !== undefined && String(value) === String(rule.match)) {
                    return rule.formats || null;
                }
                // Regex match check
                if (rule.pattern) {
                    try {
                        if (new RegExp(rule.pattern).test(String(value))) {
                            return rule.formats || null;
                        }
                    } catch (e) {}
                }
            }
            return null;
        },

        /**
         * Apply multistate evaluation to an element.
         * Combines with FormatEngine for actual CSS application.
         */
        applyToElement: function (element, value, rules) {
            var formats = this.evaluate(value, rules);
            if (formats && PIVisualization.FormatEngine) {
                PIVisualization.FormatEngine.apply(element, formats);
            }
            return formats;
        },

        /**
         * Create default multistate rules for common IEC grid scenarios.
         */
        createDefaultRules: function (type) {
            switch (type) {
                case 'power':
                    return [
                        { min: 0,   max: 200, formats: { BackgroundColor: 'rgba(231,76,60,0.15)', TextColor: '#e74c3c' }},   // Low
                        { min: 200, max: 500, formats: { BackgroundColor: 'rgba(243,156,18,0.15)', TextColor: '#f39c12' }},   // Medium
                        { min: 500, max: 9999, formats: { BackgroundColor: 'rgba(46,204,113,0.15)', TextColor: '#2ecc71' }}    // High
                    ];
                case 'frequency':
                    return [
                        { min: 0,     max: 49.5, formats: { BackgroundColor: 'rgba(231,76,60,0.3)', TextColor: '#e74c3c' }},  // Critical low
                        { min: 49.5,  max: 49.8, formats: { BackgroundColor: 'rgba(243,156,18,0.2)', TextColor: '#f39c12' }},  // Warning low
                        { min: 49.8,  max: 50.2, formats: { BackgroundColor: 'rgba(46,204,113,0.1)', TextColor: '#2ecc71' }},  // Normal
                        { min: 50.2,  max: 50.5, formats: { BackgroundColor: 'rgba(243,156,18,0.2)', TextColor: '#f39c12' }},  // Warning high
                        { min: 50.5,  max: 99,   formats: { BackgroundColor: 'rgba(231,76,60,0.3)', TextColor: '#e74c3c' }}   // Critical high
                    ];
                case 'temperature':
                    return [
                        { min: 0,   max: 400, formats: { BackgroundColor: 'rgba(46,204,113,0.1)', TextColor: '#2ecc71' }},
                        { min: 400, max: 500, formats: { BackgroundColor: 'rgba(243,156,18,0.2)', TextColor: '#f39c12' }},
                        { min: 500, max: 9999, formats: { BackgroundColor: 'rgba(231,76,60,0.3)', TextColor: '#e74c3c' }}
                    ];
                case 'status':
                    return [
                        { match: 'running',     formats: { BackgroundColor: 'rgba(46,204,113,0.15)', TextColor: '#2ecc71' }},
                        { match: 'idle',         formats: { BackgroundColor: 'rgba(149,165,166,0.15)', TextColor: '#95a5a6' }},
                        { match: 'maintenance',  formats: { BackgroundColor: 'rgba(243,156,18,0.15)', TextColor: '#f39c12' }},
                        { match: 'fault',        formats: { BackgroundColor: 'rgba(231,76,60,0.2)', TextColor: '#e74c3c' }}
                    ];
                default:
                    return [];
            }
        }
    };

    /* =========================================================
     *  S3: PI TIME EXPRESSION PARSER
     *
     *  Parses PI AF time syntax used throughout the PI System:
     *    * = now
     *    t = today midnight
     *    y = yesterday midnight
     *    *-1h = now minus 1 hour
     *    t+8h = today 8am
     *    y-3d = yesterday minus 3 days
     *    Units: s(sec), m(min), h(hour), d(day), w(week), mo(month), y(year)
     *
     *  Also supports fixed times: "23-aug-12 15:00:00"
     * ========================================================= */
    PIVisualization.TimeParser = {
        _UNITS: { s: 1000, m: 60000, h: 3600000, d: 86400000, w: 604800000 },

        /**
         * Parse a PI time expression to a JavaScript Date.
         * @param {string} expr - PI time expression (e.g., "*-1h", "t+8h", "y")
         * @param {Date} [refTime] - reference time (default: now)
         * @returns {Date}
         */
        parse: function (expr, refTime) {
            if (!expr || typeof expr !== 'string') return new Date();
            expr = expr.trim();

            // Already ISO/timestamp? Try native parse
            if (/^\d{4}-\d{2}/.test(expr) || /^\d{2}-\w{3}-\d{2,4}/.test(expr)) {
                var d = new Date(expr);
                return isNaN(d.getTime()) ? new Date() : d;
            }

            var now = refTime || new Date();
            var base;

            // Determine base reference
            if (expr.charAt(0) === '*') {
                base = new Date(now.getTime());
                expr = expr.substring(1);
            } else if (expr.charAt(0) === 't') {
                base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                expr = expr.substring(1);
            } else if (expr.substring(0, 1) === 'y' && (expr.length === 1 || /^y[+-]/.test(expr))) {
                base = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
                expr = expr.substring(1);
            } else {
                return new Date(now.getTime());
            }

            // Parse offset: +3h, -30m, +1d, etc.
            var offsetMatch = expr.match(/^([+-])(\d+(?:\.\d+)?)(mo|[smhdwy])/);
            if (offsetMatch) {
                var sign = offsetMatch[1] === '+' ? 1 : -1;
                var num = parseFloat(offsetMatch[2]);
                var unit = offsetMatch[3];

                if (unit === 'mo') {
                    base.setMonth(base.getMonth() + sign * Math.round(num));
                } else if (unit === 'y') {
                    base.setFullYear(base.getFullYear() + sign * Math.round(num));
                } else {
                    var ms = this._UNITS[unit] || 0;
                    base = new Date(base.getTime() + sign * num * ms);
                }
            }

            return base;
        },

        /**
         * Format a Date as a PI time display string.
         */
        format: function (date, pattern) {
            if (!date) return '';
            if (pattern === 'iso') return date.toISOString();
            // Default: locale-aware Hebrew display
            try {
                return date.toLocaleString('he-IL', { hour12: false });
            } catch (e) {
                return date.toISOString();
            }
        },

        /**
         * Calculate duration between two PI time expressions.
         * @returns {number} milliseconds
         */
        duration: function (startExpr, endExpr) {
            var s = this.parse(startExpr);
            var e = this.parse(endExpr);
            return Math.abs(e.getTime() - s.getTime());
        }
    };

    /* =========================================================
     *  2. PIV20 NAMESPACE
     * ========================================================= */
    var PIV20 = root.PIV20 = root.PIV10 = {};
    PIV20._loaded = true;
    PIV20.VERSION = '20.0.R1';

    /* -- Signal Bus factory -- */
    PIV20.createBus = function () {
        var _ch = {};
        return {
            on: function (ch, fn, ctx) {
                if (!_ch[ch]) _ch[ch] = [];
                _ch[ch].push({ fn: fn, ctx: ctx || null });
            },
            off: function (ch, fn) {
                var subs = _ch[ch];
                if (!subs) return;
                for (var i = subs.length - 1; i >= 0; i--) {
                    if (subs[i].fn === fn) subs.splice(i, 1);
                }
            },
            emit: function (ch, data) {
                var subs = _ch[ch];
                if (!subs) return;
                for (var i = 0; i < subs.length; i++) {
                    try { subs[i].fn.call(subs[i].ctx, data); } catch (e) {}
                }
            },
            once: function (ch, fn, ctx) {
                var self = this;
                var w = function (d) { self.off(ch, w); fn.call(ctx || null, d); };
                this.on(ch, w);
            },
            reset: function () { _ch = {}; },
            destroy: function () { _ch = {}; },
            // Aliases for pub/sub pattern compatibility
            publish: function (ch, data) { this.emit(ch, data); },
            subscribe: function (ch, fn, ctx) { this.on(ch, fn, ctx); },
            unsubscribe: function (ch, fn) { this.off(ch, fn); },
            unsubscribeAll: function () { _ch = {}; }
        };
    };

    /* -- Error shield -- */
    PIV20.shield = {
        _errors: [],
        log: function (src, fn, e) {
            this._errors.push({ src: src, fn: fn, err: e, ts: Date.now() });
            console.warn('[PIV20.shield]', src, fn, e);
        },
        wrap: function (src, fn, func) {
            return function () {
                try { return func.apply(this, arguments); } catch (e) { PIV20.shield.log(src, fn, e); }
            };
        }
    };

    /* -- safeWidget -- */
    // Called as: PIV20.safeWidget(elem, selectorOrName, widgetName, opts, label)
    // OR: PIV20.safeWidget(elem, widgetName, opts)
    PIV20.safeWidget = function (elem, arg2, arg3, arg4, arg5) {
        // Detect calling convention:
        // 5-arg: (el, selector, widgetName, opts, label)
        // 3-arg: (el, widgetName, opts)
        var widgetName, opts;
        if (typeof arg3 === 'string') {
            // 5-arg form: arg2=selector, arg3=widgetName, arg4=opts
            widgetName = arg3;
            opts = arg4 || {};
        } else {
            // 3-arg form: arg2=widgetName, arg3=opts
            widgetName = arg2;
            opts = arg3 || {};
        }
        // Mock widget fallback — provides common methods symbols expect
        var _mockWidget = {
            getTemplates: function () { return [{ id: 'default', name: 'Default Template' }]; },
            getFavorites: function () { return []; },
            getRecent: function () { return []; },
            toggleFavorite: function () {},
            option: function () { return {}; },
            refresh: function () {},
            destroy: function () {},
            redraw: function () {},
            setTimeRange: function () {},
            toggleSeries: function () {},
            enterPlayback: function () {},
            exitPlayback: function () {},
            playbackStep: function () {},
            exportCSV: function () {}
        };
        try {
            var $e = window.jQuery ? window.jQuery(elem) : null;
            if ($e && $e.length && typeof $e[widgetName] === 'function') {
                $e[widgetName](opts);
                return $e;
            } else if ($e) {
                // Widget plugin not loaded — create callable mock on jQuery element
                // Symbols call _widgetRef[WIDGET_NAME]('method', arg) which is jQuery widget pattern
                // Even if $e is empty (elem not found), store mock so .data() calls work
                $e.data(widgetName, _mockWidget);
                $e[widgetName] = function (method) {
                    if (typeof _mockWidget[method] === 'function') {
                        return _mockWidget[method].apply(_mockWidget, Array.prototype.slice.call(arguments, 1));
                    }
                    return $e;
                };
                // Also patch the original elem if it's a different jQuery object
                if (elem && elem.jquery && elem !== $e) {
                    elem.data(widgetName, _mockWidget);
                    elem[widgetName] = $e[widgetName];
                }
                return $e;
            }
        } catch (e) {
            console.warn('[PIV20.safeWidget] failed', widgetName, e);
        }
        // No jQuery — return plain mock with callable widget name
        var _fakeRef = { data: function () { return _mockWidget; } };
        _fakeRef[widgetName] = function (method) {
            if (typeof _mockWidget[method] === 'function') {
                return _mockWidget[method].apply(_mockWidget, Array.prototype.slice.call(arguments, 1));
            }
            return _fakeRef;
        };
        return _fakeRef;
    };

    /* -- safeApply -- */
    PIV20.safeApply = function (scope, fn) {
        if (!scope) return;
        try {
            if (scope.$$phase || (scope.$root && scope.$root.$$phase)) {
                fn && fn();
            } else {
                scope.$apply ? scope.$apply(fn) : (fn && fn());
            }
        } catch (e) { console.warn('[PIV20.safeApply]', e); }
    };

    /* -- destroyHelper -- */
    PIV20.destroyHelper = function (cleanup) {
        if (typeof cleanup === 'function') {
            try { cleanup(); } catch (e) {}
        } else if (Array.isArray(cleanup)) {
            cleanup.forEach(function (fn) { if (typeof fn === 'function') try { fn(); } catch (e) {} });
        }
    };

    /* -- initSymbol -- */
    PIV20.initSymbol = function (scope, el, config, callbacks) {
        // Used by some symbols as alternate init approach
        if (callbacks && typeof callbacks.onInit === 'function') {
            try { callbacks.onInit(scope, el, config); } catch (e) {}
        }
        return { scope: scope, el: el, config: config };
    };

    /* -- formatters -- */
    PIV20.formatters = {
        number: function (val, decimals) {
            var n = parseFloat(val);
            if (isNaN(n)) return val;
            return n.toFixed(decimals !== undefined ? decimals : 2);
        },
        date: function (val, fmt) {
            var d = val instanceof Date ? val : new Date(val);
            if (isNaN(d)) return String(val);
            fmt = fmt || 'dd/MM/yyyy HH:mm';
            var pad = function (v) { return String(v).length < 2 ? '0' + v : String(v); };
            return fmt
                .replace('yyyy', d.getFullYear())
                .replace('MM', pad(d.getMonth() + 1))
                .replace('dd', pad(d.getDate()))
                .replace('HH', pad(d.getHours()))
                .replace('mm', pad(d.getMinutes()))
                .replace('ss', pad(d.getSeconds()));
        },
        percent: function (val, decimals) {
            var n = parseFloat(val);
            if (isNaN(n)) return val + '%';
            return (n * 100).toFixed(decimals || 1) + '%';
        }
    };

    /* -- fmt shorthand (used by symbols as PIV20.fmt.time(), PIV20.fmt.date(), etc.) -- */
    PIV20.fmt = {
        time: function (d) {
            d = d || new Date();
            var pad = function (v) { return String(v).length < 2 ? '0' + v : String(v); };
            return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        },
        date: function (d, fmt) { return PIV20.formatters.date(d || new Date(), fmt); },
        number: function (v, dec) { return PIV20.formatters.number(v, dec); },
        percent: function (v, dec) { return PIV20.formatters.percent(v, dec); },
        duration: function (ms) {
            var s = Math.floor(ms / 1000), m = Math.floor(s / 60), h = Math.floor(m / 60);
            return h + 'h ' + (m % 60) + 'm';
        }
    };

    /* -- ultra namespace (extended features) -- */
    PIV20.ultra = {};

    /* =========================================================
     *  3. MU20 / MM20 NAMESPACE
     * ========================================================= */
    var MU20 = root.MU20 = {};
    MU20._loaded = true;
    MU20.VERSION = 'ULT.1.6';

    /* -- Copy bus factory from PIV20 -- */
    MU20.createBus = PIV20.createBus;
    MU20.shield = PIV20.shield;
    MU20.safeApply = PIV20.safeApply;
    MU20.destroyHelper = PIV20.destroyHelper;

    /* -- Config validator -- */
    MU20.config = {
        validate: function (c) { return c || {}; },
        merge: function (defaults, incoming) {
            var out = {};
            var k;
            for (k in defaults) if (defaults.hasOwnProperty(k)) out[k] = defaults[k];
            for (k in incoming) if (incoming.hasOwnProperty(k)) out[k] = incoming[k];
            return out;
        },
        mapEditor: function () { /* stub — owner map editor not needed in emulator */ },
        DEFAULTS: null
    };

    /* -- AF mock -- */
    MU20.AF = {
        browse: function (path, cb) {
            setTimeout(function () { cb && cb(null, _mockAFBrowse(path)); }, 50);
        },
        getAttributes: function (path, cb) {
            setTimeout(function () { cb && cb(null, _mockAttributes(path)); }, 50);
        },
        getRecordedValues: function (path, startTime, endTime, maxCount, cb) {
            setTimeout(function () { cb && cb(null, _mockTimeSeries(60)); }, 100);
        },
        getInterpolatedValues: function (path, startTime, endTime, interval, cb) {
            setTimeout(function () { cb && cb(null, _mockTimeSeries(48)); }, 100);
        },
        searchTags: function (query, cb) {
            var results = _mockTagSearch(query);
            setTimeout(function () { cb && cb(null, results); }, 80);
        },
        getEventFrames: function (opts, cb) {
            setTimeout(function () { cb && cb(null, _mockEventFrames()); }, 100);
        }
    };

    /* -- PIWebAPI mock (constructor-compatible) -- */
    MU20.PIWebAPI = function PIWebAPIMock(opts) {
        this.baseUrl = (opts && opts.baseUrl) || '/piwebapi/';
    };
    MU20.PIWebAPI.prototype.request = function (path, cb) {
        var data = _piwebapi_mock(path);
        setTimeout(function () { cb && cb(null, data); }, 50);
        return { then: function (fn) { setTimeout(function () { fn(data); }, 50); return this; } };
    };
    MU20.PIWebAPI.prototype._get = function (path, cb) {
        var data = _piwebapi_mock(path);
        setTimeout(function () { cb && cb(null, data); }, 50);
    };
    MU20.PIWebAPI.prototype.get = MU20.PIWebAPI.prototype._get;
    MU20.PIWebAPI.baseUrl = '/piwebapi/';
    MU20.PIWebAPI.request = function (path, cb) {
        var data = _piwebapi_mock(path);
        setTimeout(function () { cb && cb(null, data); }, 50);
        return { then: function (fn) { setTimeout(function () { fn(data); }, 50); return this; } };
    };

    /* -- SITES -- */
    MU20.SITES = [
        { id: 'ASH', name: 'אשקלון',     nameEn: 'Ashkelon',    capacity: 2250, units: ['יחידה 1','יחידה 2','יחידה 3','יחידה 4','קיטור 1','קיטור 2'] },
        { id: 'HAD', name: 'חדרה',       nameEn: 'Hadera',      capacity: 2590, units: ['יחידה 1','יחידה 2','יחידה 3','יחידה 4','יחידה 5','יחידה 6','קיטור 1'] },
        { id: 'ORT', name: 'אורות רבין', nameEn: 'Orot Rabin',  capacity: 2590, units: ['יחידה 1','יחידה 2','יחידה 3','יחידה 4','יחידה 5','יחידה 6','קיטור 1'] },
        { id: 'RUT', name: 'רוטנברג',    nameEn: 'Rutenberg',   capacity: 2250, units: ['יחידה 1','יחידה 2','יחידה 3','יחידה 4','קיטור 1','קיטור 2'] },
        { id: 'RDG', name: 'רידינג',     nameEn: 'Reading',     capacity: 604,  units: ['יחידה 1','יחידה 2','יחידה 3'] }
    ];

    /* -- Formatters -- */
    MU20.formatters = PIV20.formatters;

    /* -- URL helpers used by MUG symbols -- */
    MU20.resolveUrl = function (relPath) {
        return '../symbols/' + relPath;
    };
    MU20.ensureStyle = function (href) {
        if (!href) return;
        if (document.querySelector('link[href="' + href + '"]')) return;
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        document.head.appendChild(link);
    };

    /* -- loadScripts: sequential script loader used by MUG symbols -- */
    MU20.loadScripts = function (urls, callback) {
        var idx = 0;
        function next() {
            if (idx >= urls.length) { callback && callback(null); return; }
            var url = urls[idx++];
            var s = document.createElement('script');
            s.src = url;
            s.onload = function () { next(); };
            s.onerror = function () { next(); }; // skip missing plugins silently
            document.head.appendChild(s);
        }
        next();
    };
    if (!MU20.resolveUrl) {
        MU20.resolveUrl = function (relPath) { return '../symbols/' + relPath; };
    }
    if (!MU20.ensureStyle) {
        MU20.ensureStyle = function (href) {
            if (!href) return;
            if (document.querySelector('link[href="' + href + '"]')) return;
            var link = document.createElement('link');
            link.rel = 'stylesheet'; link.href = href;
            document.head.appendChild(link);
        };
    }
    MU20.basePath = MU20.basePath || '../symbols/';

    /* -- Alias MM20 = MU20 -- */
    root.MM20 = MU20;
    root.MM20._loaded = true;

    /* -- Short aliases used by symbols (MU = MU20, MM = MU20/MM20) -- */
    root.MU = MU20;
    root.MM = MU20;

    /* -- Theme & UI stubs used by MUG symbols -- */
    MU20.applyTheme = function () {};
    MU20.setTheme = function () {};
    MU20.getTheme = function () { return { primary: '#5BC0EB', bg: '#0D1B2A', text: '#E2EAF4' }; };

    /* -- Utility stubs used by sym-mugult20.js and sym-mugmon20.js -- */
    MU20.formatNum = function (v, dec) { return typeof v === 'number' ? v.toFixed(dec || 0) : String(v); };
    MU20.safePlugin = function (Cls, shadow, container, opts, bus, id) {
        try { return new Cls(shadow, container, opts, bus); } catch(e) { return {}; }
    };
    MU20.unitKey = function () { return 'unit-0'; };
    MU20.demo = {
        generateSites: function (siteDefs) {
            var rows = [];
            if (siteDefs && siteDefs.length) {
                for (var i = 0; i < siteDefs.length; i++) {
                    rows.push({ site: siteDefs[i].name || 'Site ' + i, hours: +(Math.random() * 8000).toFixed(0), quota: 8760, pct: +(Math.random() * 100).toFixed(1), status: 'ok', mw: +(Math.random() * 600).toFixed(0) });
                }
            }
            return rows;
        }
    };
    MU20.config.normalize = function (c) { return c || {}; };

    /* =========================================================
     *  4. MOCK DATA HELPERS
     * ========================================================= */
    function _rnd(min, max) { return min + Math.random() * (max - min); }

    function _mockTimeSeries(pts) {
        var data = [];
        var now = Date.now();
        var base = _rnd(200, 800);
        for (var i = pts; i >= 0; i--) {
            base += _rnd(-20, 20);
            if (base < 0) base = 10;
            data.push({ Timestamp: new Date(now - i * 300000).toISOString(), Value: +base.toFixed(2) });
        }
        return data;
    }

    function _mockTableData(cols) {
        cols = cols || ['Value', 'Timestamp', 'Attribute'];
        var rows = [];
        var attrs = ['כוח פעיל', 'עומס גז', 'טמפ. פליטה', 'מתח', 'זרם', 'תדירות'];
        for (var i = 0; i < 6; i++) {
            var row = {};
            row.Attribute = attrs[i] || ('מדד ' + (i + 1));
            row.Value = +_rnd(50, 500).toFixed(2);
            row.Timestamp = new Date(Date.now() - _rnd(0, 60000)).toISOString();
            row.Status = ['Normal', 'Warning', 'Critical'][Math.floor(Math.random() * 3)];
            row.Unit = ['MW', 'MSCF/h', '°C', 'kV', 'A', 'Hz'][i] || '';
            rows.push(row);
        }
        return rows;
    }

    function _mockAFBrowse(path) {
        if (!path || path === '/') {
            return MU20.SITES.map(function (s) {
                return { Path: '\\\\' + s.id, Name: s.name, TypeName: 'Database', HasChildren: true };
            });
        }
        var parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
        var site = MU20.SITES.find ? MU20.SITES.filter(function (s) { return s.id === parts[0]; })[0] : null;
        if (site && parts.length === 1) {
            return site.units.map(function (u, i) {
                return { Path: '\\\\' + site.id + '\\' + u, Name: u, TypeName: 'Element', HasChildren: true };
            });
        }
        return [
            { Path: path + '\\מדחסים', Name: 'מדחסים', TypeName: 'Element', HasChildren: false },
            { Path: path + '\\טורבינות', Name: 'טורבינות', TypeName: 'Element', HasChildren: false },
            { Path: path + '\\קירור', Name: 'קירור', TypeName: 'Element', HasChildren: false }
        ];
    }

    function _mockAttributes(path) {
        return [
            { Name: 'כוח פעיל',     Value: +_rnd(100, 600).toFixed(1), Unit: 'MW', Type: 'Float' },
            { Name: 'מתח',          Value: +_rnd(10, 24).toFixed(2),   Unit: 'kV', Type: 'Float' },
            { Name: 'זרם',          Value: +_rnd(100, 500).toFixed(1), Unit: 'A',  Type: 'Float' },
            { Name: 'תדירות',       Value: +(49.9 + Math.random() * 0.2).toFixed(3), Unit: 'Hz', Type: 'Float' },
            { Name: 'טמפ. פליטה',  Value: +_rnd(300, 600).toFixed(1), Unit: '°C', Type: 'Float' },
            { Name: 'סטטוס',        Value: 'פעיל', Type: 'String' }
        ];
    }

    function _mockTagSearch(query) {
        var all = [
            'ASH.U1.MW.ACTIVE_POWER', 'ASH.U1.GAS.FLOW', 'ASH.U1.EXHAUST.TEMP',
            'ASH.U2.MW.ACTIVE_POWER', 'ASH.U2.VOLTAGE.HV', 'HAD.U1.MW.ACTIVE_POWER',
            'HAD.U1.FREQ.NET', 'ORT.U3.MW.OUTPUT', 'RUT.U1.STEAM.FLOW',
            'RDG.U1.COAL.FEED', 'ASH.GRID.FREQUENCY', 'ASH.TOTAL.MW',
            'HAD.TOTAL.MW', 'ORT.TOTAL.MW', 'RUT.TOTAL.MW', 'RDG.TOTAL.MW'
        ];
        var q = (query || '').toLowerCase();
        return all.filter(function (t) { return t.toLowerCase().indexOf(q) >= 0; })
            .map(function (t) { return { Tag: t, Value: +_rnd(10, 500).toFixed(2), Unit: 'MW', Timestamp: new Date().toISOString() }; });
    }

    function _mockEventFrames() {
        var frames = [];
        for (var i = 0; i < 8; i++) {
            var start = new Date(Date.now() - _rnd(3600000, 86400000));
            frames.push({
                Name: 'EF_' + i,
                StartTime: start.toISOString(),
                EndTime: i % 3 === 0 ? null : new Date(start.getTime() + _rnd(900000, 7200000)).toISOString(),
                Template: ['דלקה מחדש', 'תקלת גנרטור', 'תחזוקה מתוכננת'][i % 3],
                Status: i % 3 === 0 ? 'Active' : 'Closed'
            });
        }
        return frames;
    }

    function _piwebapi_mock(path) {
        path = path || '';

        // ── E6: Enhanced PI Web API Mock — covers core PI Vision endpoints ──

        // System info
        if (path.indexOf('system/version') >= 0) return { FullVersion: '2025.1.0', ProductTitle: 'PI Web API' };
        if (path.indexOf('system/status') >= 0) return { State: 'Running', UpTimeInHours: 720.5 };

        // Data Archive
        if (path.indexOf('dataservers') >= 0) return { Items: [{ Id: 'srv1', Name: 'PISERVER01', ServerVersion: '3.4.455', IsConnected: true }] };

        // Asset Framework
        if (path.indexOf('assetservers') >= 0) return { Items: [{ Id: 'af1', Name: 'AFSERVER01', IsConnected: true }] };
        if (path.indexOf('assetdatabases') >= 0) return { Items: [
            { Id: 'db1', Name: 'IEC_Grid', Description: 'רשת החשמל הישראלית', Path: '\\\\AFSERVER01\\IEC_Grid' }
        ]};

        // Element browsing
        if (path.indexOf('elements') >= 0) return { Items: _mockAFBrowse(path.split('path=')[1] || '/') };

        // Attributes
        if (path.indexOf('attributes') >= 0) return { Items: _mockAttributes(path) };

        // Stream values (current/snapshot)
        if (path.indexOf('streamsets/value') >= 0 || path.indexOf('streams/value') >= 0) {
            return { Items: _mockAttributes(path).map(function(a) {
                return { WebId: 'wid_' + a.Name, Name: a.Name, Value: { Value: a.Value, Timestamp: new Date().toISOString(), Good: true }, UnitsAbbreviation: a.Unit || '' };
            })};
        }

        // Stream recorded values (historical)
        if (path.indexOf('recorded') >= 0) {
            var ts = _mockTimeSeries(48);
            return { Items: [{ WebId: 'wid_rec', Name: 'RecordedTag', Items: ts.map(function(p) {
                return { Timestamp: p.Timestamp, Value: p.Value, Good: true };
            })}]};
        }

        // Stream interpolated values
        if (path.indexOf('interpolated') >= 0) {
            var tsI = _mockTimeSeries(24);
            return { Items: [{ WebId: 'wid_int', Name: 'InterpolatedTag', Items: tsI.map(function(p) {
                return { Timestamp: p.Timestamp, Value: p.Value, Good: true };
            })}]};
        }

        // Calculation summary (TagAvg, TagMin, TagMax, etc.)
        if (path.indexOf('calculation/summary') >= 0 || path.indexOf('summary') >= 0) {
            return { Items: [{
                WebId: 'wid_sum',
                Items: [
                    { Type: 'Average', Value: { Value: +_rnd(200, 500).toFixed(1), Timestamp: new Date().toISOString(), Good: true }},
                    { Type: 'Minimum', Value: { Value: +_rnd(50, 200).toFixed(1), Timestamp: new Date().toISOString(), Good: true }},
                    { Type: 'Maximum', Value: { Value: +_rnd(500, 900).toFixed(1), Timestamp: new Date().toISOString(), Good: true }},
                    { Type: 'StdDev',  Value: { Value: +_rnd(20, 80).toFixed(1), Timestamp: new Date().toISOString(), Good: true }},
                    { Type: 'Range',   Value: { Value: +_rnd(200, 700).toFixed(1), Timestamp: new Date().toISOString(), Good: true }},
                    { Type: 'Count',   Value: { Value: _rndInt(100, 5000), Timestamp: new Date().toISOString(), Good: true }}
                ]
            }]};
        }

        // Event Frames
        if (path.indexOf('eventframes') >= 0) {
            return { Items: _mockEventFrames() };
        }

        // Point search
        if (path.indexOf('points') >= 0 && path.indexOf('search') >= 0) {
            var query = (path.split('query=')[1] || '').split('&')[0];
            return { Items: _mockTagSearch(query || '*') };
        }

        // Batch requests
        if (path.indexOf('batch') >= 0) {
            return {};
        }

        return { Items: [] };
    }

    root.__mockTimeSeries = _mockTimeSeries;
    root.__mockTableData = _mockTableData;
    root.__mockAFBrowse = _mockAFBrowse;
    root.__mockAttributes = _mockAttributes;
    root.__piwebapi_mock = _piwebapi_mock;

    /* =========================================================
     *  5. MOCK PI WEB API INTERCEPT (fetch + XHR)
     * ========================================================= */
    var _origFetch = root.fetch;
    var _networkLog = [];
    root.__networkLog = _networkLog;

    root.fetch = function (url, opts) {
        var urlStr = String(url);
        var ts = Date.now();

        // Only intercept piwebapi paths
        if (urlStr.indexOf('/piwebapi/') >= 0 || urlStr.indexOf('piwebapi') >= 0) {
            var mockData = _piwebapi_mock(urlStr);
            var body = JSON.stringify(mockData);
            _networkLog.push({ url: urlStr, method: 'GET', status: 200, size: body.length, time: 12, ts: ts, mock: true });
            if (root.__EMU_NETWORK_CALLBACK) root.__EMU_NETWORK_CALLBACK(_networkLog[_networkLog.length - 1]);
            return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }));
        }

        // Let real fetch handle everything else (symbol files)
        if (typeof _origFetch === 'function') {
            var startT = Date.now();
            return _origFetch.apply(root, arguments).then(function (resp) {
                _networkLog.push({ url: urlStr, method: (opts && opts.method) || 'GET', status: resp.status, time: Date.now() - startT, ts: ts, mock: false });
                if (root.__EMU_NETWORK_CALLBACK) root.__EMU_NETWORK_CALLBACK(_networkLog[_networkLog.length - 1]);
                return resp;
            }, function (err) {
                _networkLog.push({ url: urlStr, method: (opts && opts.method) || 'GET', status: 0, error: String(err), time: Date.now() - startT, ts: ts, mock: false });
                if (root.__EMU_NETWORK_CALLBACK) root.__EMU_NETWORK_CALLBACK(_networkLog[_networkLog.length - 1]);
                return Promise.reject(err);
            });
        }
        return Promise.reject(new Error('fetch not available'));
    };

    /* =========================================================
     *  6. JQUERY WIDGET FACTORY MOCK
     * ========================================================= */
    function _installWidgetFactory($) {
        if (!$) return;

        $.widget = $.widget || function (name, base, proto) {
            if (typeof base === 'object' && !proto) {
                proto = base; base = null;
            }
            proto = proto || {};

            var parts = name.split('.');
            var ns = parts[0], widgetName = parts[1] || parts[0];
            if (parts[1]) {
                $[ns] = $[ns] || {};
                $[ns][widgetName] = proto;
            }

            var fullName = parts[1] ? ns + '.' + widgetName : widgetName;

            $.fn[widgetName] = function (optionsOrMethod) {
                var args = Array.prototype.slice.call(arguments, 1);
                return this.each(function () {
                    var $this = $(this);
                    var key = 'widget-' + fullName;
                    var instance = $this.data(key);

                    if (!instance) {
                        var opts = typeof optionsOrMethod === 'object' ? optionsOrMethod : {};
                        instance = Object.create(proto);
                        instance.element = $this;
                        instance.options = $.extend({}, proto.options || {}, opts);
                        instance.widgetName = widgetName;
                        instance.widgetFullName = fullName;
                        // Provide _trigger if not defined by the prototype
                        if (typeof instance._trigger !== 'function') {
                            instance._trigger = function (evtType, event, data) {
                                var evtName = widgetName + evtType.toLowerCase();
                                $this.trigger(evtName, [data || {}]);
                                var cbName = evtType.charAt(0).toLowerCase() + evtType.slice(1);
                                if (typeof instance.options[cbName] === 'function') {
                                    instance.options[cbName].call(instance.element[0], event || {}, data || {});
                                }
                            };
                        }
                        // Provide _destroy if not defined
                        if (typeof instance._destroy !== 'function') {
                            instance._destroy = function () {};
                        }
                        instance.destroy = function () {
                            if (typeof instance._destroy === 'function') instance._destroy();
                            $this.removeData(key);
                            $this.removeData(widgetName);
                        };
                        $this.data(key, instance);
                        $this.data(widgetName, instance);
                        if (typeof instance._create === 'function') {
                            try { instance._create(); } catch (e) { console.warn('[widget._create]', widgetName, e); }
                        }
                        if (typeof instance._init === 'function') {
                            try { instance._init(); } catch (e) { console.warn('[widget._init]', widgetName, e); }
                        }
                    } else if (typeof optionsOrMethod === 'string') {
                        if (optionsOrMethod === 'option') {
                            if (args.length === 1) return instance.options[args[0]];
                            if (args.length >= 2) {
                                var prev = instance.options[args[0]];
                                instance.options[args[0]] = args[1];
                                if (typeof instance._setOption === 'function') {
                                    try { instance._setOption(args[0], args[1], prev); } catch (e) {}
                                }
                            }
                        } else if (typeof instance[optionsOrMethod] === 'function') {
                            return instance[optionsOrMethod].apply(instance, args);
                        }
                    } else if (typeof optionsOrMethod === 'object') {
                        $.extend(instance.options, optionsOrMethod);
                        if (typeof instance._setOptions === 'function') {
                            try { instance._setOptions(optionsOrMethod); } catch (e) {}
                        }
                    }
                });
            };
        };

        // Extend $.fn with a noop 'piv20-ready' trigger helper
        $.fn.pivReady = function () { return this; };
    }

    // Try to install immediately if $ exists, else defer
    if (root.jQuery) {
        _installWidgetFactory(root.jQuery);
    } else {
        var _jqTimer = setInterval(function () {
            if (root.jQuery) { clearInterval(_jqTimer); _installWidgetFactory(root.jQuery); }
        }, 50);
    }
    root.__installWidgetFactory = _installWidgetFactory;

    /* =========================================================
     *  7. ANGULAR MINI-RUNTIME
     * ========================================================= */
    var _AngularEmu = (function () {

        /* ── Scope ── */
        function Scope(parent) {
            this.$$parent = parent || null;
            this.$$children = [];
            this.$$watchers = [];
            this.$$listeners = {};
            this.$$phase = null;
            this.$$destroyed = false;
            this.$id = _scopeId++;
            if (parent && parent.$$children) parent.$$children.push(this);

            // ── S8: Badge system for tool panes ──
            // PI Vision tool panes use scope.Badge.raise("count") to show notifications.
            var _badgeValue = '';
            var _badgeCallbacks = [];
            this.Badge = {
                raise: function (val) {
                    _badgeValue = String(val || '');
                    _badgeCallbacks.forEach(function (cb) { try { cb(_badgeValue); } catch (e) {} });
                    // Also emit event for toolbar integration
                    if (root.__EMU_BADGE_CALLBACK) {
                        try { root.__EMU_BADGE_CALLBACK(_badgeValue); } catch (e) {}
                    }
                },
                clear: function () {
                    _badgeValue = '';
                    _badgeCallbacks.forEach(function (cb) { try { cb(''); } catch (e) {} });
                },
                getValue: function () { return _badgeValue; },
                onChange: function (cb) { _badgeCallbacks.push(cb); }
            };
        }
        var _scopeId = 1;

        Scope.prototype.$new = function (isolate) {
            var child;
            if (isolate) {
                child = new Scope(this);
            } else {
                child = Object.create(this);
                child.$$parent = this;
                child.$$children = [];
                child.$$watchers = [];
                child.$$listeners = {};
                child.$$phase = null;
                child.$$destroyed = false;
                child.$id = _scopeId++;
                if (this.$$children) this.$$children.push(child);
            }
            return child;
        };

        Scope.prototype.$watch = function (expr, fn, deep) {
            var self = this;
            var _initWatchVal = {};
            var getter = typeof expr === 'function' ? expr : function (s) { return _evalExpr(expr, s); };
            var watcher = { expr: expr, fn: fn, last: _initWatchVal, getter: getter, deep: !!deep };
            this.$$watchers.push(watcher);
            return function () {
                var idx = self.$$watchers.indexOf(watcher);
                if (idx >= 0) self.$$watchers.splice(idx, 1);
            };
        };

        Scope.prototype.$watchGroup = function (exprs, fn) {
            var self = this;
            var vals = exprs.map(function (e) { return _evalExpr(e, self); });
            exprs.forEach(function (e, i) {
                self.$watch(e, function (newV) {
                    vals[i] = newV;
                    fn(vals.slice(), vals.slice());
                });
            });
        };

        Scope.prototype.$on = function (evt, fn) {
            if (!this.$$listeners[evt]) this.$$listeners[evt] = [];
            this.$$listeners[evt].push(fn);
            var self = this;
            return function () {
                var idx = self.$$listeners[evt].indexOf(fn);
                if (idx >= 0) self.$$listeners[evt].splice(idx, 1);
            };
        };

        Scope.prototype.$emit = function (evt, data) {
            var scope = this;
            while (scope) {
                var fns = scope.$$listeners[evt] || [];
                for (var i = 0; i < fns.length; i++) { try { fns[i]({ name: evt }, data); } catch (e) {} }
                scope = scope.$$parent;
            }
        };

        Scope.prototype.$broadcast = function (evt, data) {
            var fns = this.$$listeners[evt] || [];
            for (var i = 0; i < fns.length; i++) { try { fns[i]({ name: evt }, data); } catch (e) {} }
            for (var j = 0; j < (this.$$children || []).length; j++) {
                this.$$children[j].$broadcast(evt, data);
            }
        };

        Scope.prototype.$apply = function (fn) {
            if (this.$$phase) { if (typeof fn === 'function') try { fn(); } catch (e) {} return; }
            this.$$phase = '$apply';
            try {
                if (typeof fn === 'function') fn();
                this.$digest();
            } finally { this.$$phase = null; }
        };

        Scope.prototype.$digest = function () {
            var dirty = true, iters = 0, maxIters = 10;
            while (dirty && iters++ < maxIters) {
                dirty = false;
                var watchers = this.$$watchers || [];
                for (var i = 0; i < watchers.length; i++) {
                    var w = watchers[i];
                    var newV;
                    try { newV = w.getter(this); } catch (e) { continue; }
                    var oldV = w.last;
                    var changed = w.deep ? JSON.stringify(newV) !== JSON.stringify(oldV) : newV !== oldV;
                    if (changed) {
                        dirty = true;
                        w.last = w.deep ? JSON.parse(JSON.stringify(newV)) : newV;
                        try { w.fn(newV, oldV, this); } catch (e) {}
                    }
                }
            }
        };

        Scope.prototype.$evalAsync = function (fn) {
            var self = this;
            setTimeout(function () { if (!self.$$destroyed) try { fn(self); } catch (e) {} }, 0);
        };

        Scope.prototype.$applyAsync = function (fn) {
            var self = this;
            setTimeout(function () {
                if (!self.$$destroyed) {
                    try { if (typeof fn === 'function') fn(self); } catch (e) {}
                    try { self.$digest(); } catch (e) {}
                }
            }, 0);
        };

        Scope.prototype.$destroy = function () {
            if (this.$$destroyed) return; // prevent double-destroy
            this.$$destroyed = true;
            this.$broadcast('$destroy');
            // Destroy children first (copy array to avoid mutation during iteration)
            var children = (this.$$children || []).slice();
            for (var i = 0; i < children.length; i++) {
                try { children[i].$destroy(); } catch (e) {}
            }
            if (this.$$parent && this.$$parent.$$children) {
                var idx = this.$$parent.$$children.indexOf(this);
                if (idx >= 0) this.$$parent.$$children.splice(idx, 1);
            }
            this.$$watchers = [];
            this.$$listeners = {};
            this.$$children = [];
            this.$$parent = null;
        };

        /* ── Expression evaluator ── */
        function _evalExpr(expr, scope) {
            if (typeof expr !== 'string') return undefined;
            expr = expr.trim();
            if (expr === '' || expr === 'true') return true;
            if (expr === 'false') return false;
            if (expr === 'null') return null;
            if (expr === 'undefined') return undefined;
            if (/^-?\d+(\.\d+)?$/.test(expr)) return parseFloat(expr);
            if (/^(['"]).*\1$/.test(expr)) return expr.slice(1, -1);
            // Handle method calls and property access on scope
            try {
                var fn = new Function('$scope', 'with($scope){ try{ return (' + expr + '); }catch(e){ return undefined; } }');
                return fn(scope);
            } catch (e) {
                return undefined;
            }
        }

        /* ── Filter engine ── */
        var _filters = {
            number: function (val, decimals) {
                var n = parseFloat(val);
                if (isNaN(n)) return val;
                return n.toLocaleString('he-IL', { minimumFractionDigits: decimals || 0, maximumFractionDigits: decimals || 0 });
            },
            date: function (val, fmt) {
                var d = val ? new Date(val) : new Date();
                if (isNaN(d)) return String(val);
                fmt = fmt || 'dd/MM/yyyy HH:mm';
                var pad = function (v) { return String(v).length < 2 ? '0' + v : String(v); };
                return fmt
                    .replace('yyyy', d.getFullYear()).replace('MM', pad(d.getMonth() + 1))
                    .replace('dd', pad(d.getDate())).replace('HH', pad(d.getHours()))
                    .replace('mm', pad(d.getMinutes())).replace('ss', pad(d.getSeconds()));
            },
            uppercase: function (val) { return String(val || '').toUpperCase(); },
            lowercase: function (val) { return String(val || '').toLowerCase(); },
            json: function (val, spacing) { try { return JSON.stringify(val, null, spacing || 2); } catch (e) { return String(val); } },
            currency: function (val, sym) {
                var n = parseFloat(val);
                return (sym || '₪') + (isNaN(n) ? val : n.toFixed(2));
            },
            limitTo: function (val, limit) {
                if (Array.isArray(val)) return val.slice(0, limit);
                return String(val || '').slice(0, limit);
            },
            orderBy: function (val, expr, rev) {
                if (!Array.isArray(val)) return val;
                var copy = val.slice();
                copy.sort(function (a, b) {
                    var av = expr ? a[expr] : a;
                    var bv = expr ? b[expr] : b;
                    if (av < bv) return rev ? 1 : -1;
                    if (av > bv) return rev ? -1 : 1;
                    return 0;
                });
                return copy;
            },
            filter: function (val, query) {
                if (!Array.isArray(val)) return val;
                if (!query) return val;
                var q = String(query).toLowerCase();
                return val.filter(function (item) {
                    return JSON.stringify(item).toLowerCase().indexOf(q) >= 0;
                });
            }
        };

        /* ── Interpolate {{ expr | filter }} ── */
        function _interpolate(text, scope) {
            return text.replace(/\{\{([\s\S]*?)\}\}/g, function (_, expr) {
                expr = expr.trim();
                var parts = expr.split('|');
                var val = _evalExpr(parts[0].trim(), scope);
                for (var i = 1; i < parts.length; i++) {
                    var fParts = parts[i].trim().split(':');
                    var fName = fParts[0].trim();
                    var fArg = fParts[1] ? fParts[1].trim().replace(/['"]/g, '') : undefined;
                    if (_filters[fName]) val = _filters[fName](val, fArg);
                }
                return val === undefined || val === null ? '' : String(val);
            });
        }

        /* ── Compile directives ── */
        function _compileElement(el, scope) {
            if (!el || el.nodeType === 8) return; // skip comments

            if (el.nodeType === 3) { // text node
                var orig = el._origText !== undefined ? el._origText : el.textContent;
                el._origText = orig;
                if (orig.indexOf('{{') >= 0) {
                    el.textContent = _interpolate(orig, scope);
                }
                return;
            }

            if (el.nodeType !== 1) return;

            // ng-if
            var ngIf = el.getAttribute && el.getAttribute('ng-if');
            if (ngIf !== null && ngIf !== undefined) {
                var show = !!_evalExpr(ngIf, scope);
                if (!show) {
                    if (!el._ngIfPlaceholder) {
                        el._ngIfPlaceholder = document.createComment('ng-if: ' + ngIf);
                        el._ngIfParent = el.parentNode;
                        el._ngIfNext = el.nextSibling;
                        if (el.parentNode) el.parentNode.replaceChild(el._ngIfPlaceholder, el);
                    }
                    return;
                } else if (el._ngIfPlaceholder && el._ngIfPlaceholder.parentNode) {
                    el._ngIfPlaceholder.parentNode.replaceChild(el, el._ngIfPlaceholder);
                    el._ngIfPlaceholder = null;
                }
            }

            // ng-show / ng-hide
            var ngShow = el.getAttribute && el.getAttribute('ng-show');
            if (ngShow !== null && ngShow !== undefined) {
                el.style.display = _evalExpr(ngShow, scope) ? '' : 'none';
            }
            var ngHide = el.getAttribute && el.getAttribute('ng-hide');
            if (ngHide !== null && ngHide !== undefined) {
                el.style.display = _evalExpr(ngHide, scope) ? 'none' : '';
            }

            // ng-class
            var ngClass = el.getAttribute && el.getAttribute('ng-class');
            if (ngClass) {
                var classVal = _evalExpr(ngClass, scope);
                if (typeof classVal === 'object' && classVal) {
                    Object.keys(classVal).forEach(function (cls) {
                        el.classList.toggle(cls, !!classVal[cls]);
                    });
                } else if (typeof classVal === 'string') {
                    // clear previous ng-class additions by storing
                    if (el._ngClassPrev) el._ngClassPrev.split(' ').forEach(function (c) { if (c) el.classList.remove(c); });
                    el._ngClassPrev = classVal;
                    classVal.split(' ').forEach(function (c) { if (c) el.classList.add(c); });
                }
            }

            // ng-style
            var ngStyle = el.getAttribute && el.getAttribute('ng-style');
            if (ngStyle) {
                var styleVal = _evalExpr(ngStyle, scope);
                if (styleVal && typeof styleVal === 'object') {
                    Object.keys(styleVal).forEach(function (prop) {
                        el.style[prop] = styleVal[prop];
                    });
                }
            }

            // ng-bind / ng-bind-html
            var ngBind = el.getAttribute && el.getAttribute('ng-bind');
            if (ngBind) {
                var bv = _evalExpr(ngBind, scope);
                el.textContent = bv === undefined || bv === null ? '' : String(bv);
            }
            var ngBindHtml = el.getAttribute && el.getAttribute('ng-bind-html');
            if (ngBindHtml) {
                var bvh = _evalExpr(ngBindHtml, scope);
                el.innerHTML = bvh === undefined || bvh === null ? '' : String(bvh);
            }

            // ng-src / ng-href
            var ngSrc = el.getAttribute && el.getAttribute('ng-src');
            if (ngSrc) el.src = _evalExpr(ngSrc, scope) || '';
            var ngHref = el.getAttribute && el.getAttribute('ng-href');
            if (ngHref) el.href = _evalExpr(ngHref, scope) || '';

            // ng-model
            var ngModel = el.getAttribute && el.getAttribute('ng-model');
            if (ngModel) {
                // Set value from scope
                var modelVal = _evalExpr(ngModel, scope);
                if (el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
                    if (el.type === 'checkbox') {
                        el.checked = !!modelVal;
                    } else {
                        if (el.value !== String(modelVal === undefined ? '' : modelVal)) {
                            el.value = modelVal === undefined || modelVal === null ? '' : modelVal;
                        }
                    }
                }
                if (!el._ngModelBound) {
                    el._ngModelBound = true;
                    var _ngModelHandler = function () {
                        var val = el.type === 'checkbox' ? el.checked : el.value;
                        // Set on scope via path
                        _setExpr(ngModel, scope, val);
                        var ngChange = el.getAttribute('ng-change');
                        if (ngChange) _evalExpr(ngChange, scope);
                    };
                    el.addEventListener('input', _ngModelHandler);
                    el.addEventListener('change', _ngModelHandler);
                }
            }

            // ng-checked
            var ngChecked = el.getAttribute && el.getAttribute('ng-checked');
            if (ngChecked) el.checked = !!_evalExpr(ngChecked, scope);

            // ng-disabled
            var ngDisabled = el.getAttribute && el.getAttribute('ng-disabled');
            if (ngDisabled) el.disabled = !!_evalExpr(ngDisabled, scope);

            // ng-click / ng-dblclick / ng-submit
            ['ng-click', 'ng-dblclick', 'ng-submit'].forEach(function (attr) {
                var val = el.getAttribute && el.getAttribute(attr);
                if (val && !el['_bound_' + attr]) {
                    el['_bound_' + attr] = true;
                    var evtName = attr === 'ng-click' ? 'click' : attr === 'ng-dblclick' ? 'dblclick' : 'submit';
                    el.addEventListener(evtName, function (e) {
                        scope.$event = e;
                        _evalExpr(val, scope);
                        scope.$event = null;
                        scope.$digest && scope.$digest();
                    });
                }
            });

            // ng-repeat
            var ngRepeat = el.getAttribute && el.getAttribute('ng-repeat');
            if (ngRepeat) {
                _compileRepeat(el, ngRepeat, scope);
                return; // Don't recurse into children — repeat handles it
            }

            // Interpolate attributes
            var attrNames = [];
            if (el.attributes) {
                for (var ai = 0; ai < el.attributes.length; ai++) {
                    attrNames.push({ name: el.attributes[ai].name, value: el.attributes[ai].value });
                }
            }
            attrNames.forEach(function (a) {
                if (a.value && a.value.indexOf('{{') >= 0 && !a.name.startsWith('ng-')) {
                    var origAttr = el._origAttrs || {};
                    origAttr[a.name] = origAttr[a.name] || a.value;
                    el._origAttrs = origAttr;
                    el.setAttribute(a.name, _interpolate(origAttr[a.name], scope));
                }
            });

            // Recurse children
            var children = Array.prototype.slice.call(el.childNodes);
            children.forEach(function (child) { _compileElement(child, scope); });
        }

        function _compileRepeat(el, repeatExpr, scope) {
            // Parse "item in items" or "item in items track by item.id"
            var match = repeatExpr.match(/^\s*(\S+)\s+in\s+(\S+)/);
            if (!match) return;
            var itemName = match[1];
            var collectionExpr = match[2].split(' track')[0].trim();

            var placeholder = el._repeatPlaceholder;
            if (!placeholder) {
                placeholder = document.createComment('ng-repeat: ' + repeatExpr);
                el._repeatPlaceholder = placeholder;
                el.parentNode && el.parentNode.insertBefore(placeholder, el);
                el.removeAttribute('ng-repeat');
                el.parentNode && el.parentNode.removeChild(el);
                el._repeatTemplate = el.cloneNode(true);
            }

            var parent = placeholder.parentNode;
            if (!parent) return;

            // Remove previous items
            var prev = placeholder._repeatItems || [];
            prev.forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });

            var collection = _evalExpr(collectionExpr, scope);
            if (!Array.isArray(collection)) {
                placeholder._repeatItems = [];
                return;
            }

            var newItems = [];
            var insertRef = placeholder.nextSibling;

            collection.forEach(function (item, idx) {
                var clone = el._repeatTemplate.cloneNode(true);
                var childScope = scope.$new ? scope.$new() : Object.create(scope);
                childScope[itemName] = item;
                childScope.$index = idx;
                childScope.$first = idx === 0;
                childScope.$last = idx === collection.length - 1;
                childScope.$even = idx % 2 === 0;
                childScope.$odd = idx % 2 !== 0;
                _compileElement(clone, childScope);
                parent.insertBefore(clone, insertRef);
                newItems.push(clone);
            });

            placeholder._repeatItems = newItems;
        }

        function _setExpr(path, scope, value) {
            var parts = path.split('.');
            var obj = scope;
            for (var i = 0; i < parts.length - 1; i++) {
                if (obj[parts[i]] === undefined) obj[parts[i]] = {};
                obj = obj[parts[i]];
            }
            obj[parts[parts.length - 1]] = value;
        }

        function compileTemplate(element, scope) {
            if (!scope) scope = new Scope(null);
            _compileElement(element, scope);
            return scope;
        }

        return {
            Scope: Scope,
            compileTemplate: compileTemplate,
            evalExpr: _evalExpr,
            interpolate: _interpolate
        };
    })();

    root._AngularEmu = _AngularEmu;
    root.compileTemplate = _AngularEmu.compileTemplate;

    /* =========================================================
     *  8. CONSOLE CAPTURE
     * ========================================================= */
    var _consoleLogs = [];
    root.__consoleLogs = _consoleLogs;

    ['log', 'warn', 'error', 'info', 'debug'].forEach(function (level) {
        var orig = console[level].bind(console);
        console[level] = function () {
            orig.apply(console, arguments);
            var msg = Array.prototype.slice.call(arguments).map(function (a) {
                if (typeof a === 'object') try { return JSON.stringify(a, null, 1); } catch (e) { return String(a); }
                return String(a);
            }).join(' ');
            var entry = { level: level, msg: msg, ts: Date.now() };
            // Dedup
            var last = _consoleLogs[_consoleLogs.length - 1];
            if (last && last.msg === msg) { last.count = (last.count || 1) + 1; }
            else { entry.count = 1; _consoleLogs.push(entry); if (_consoleLogs.length > 500) _consoleLogs.shift(); }
            if (root.__EMU_CONSOLE_CALLBACK) root.__EMU_CONSOLE_CALLBACK(entry);
        };
    });

    /* =========================================================
     *  9. UTILITY — mock $http / $q for symbols that reference them
     * ========================================================= */
    root.$q = {
        defer: function () {
            var def = {};
            def.promise = new Promise(function (res, rej) { def.resolve = res; def.reject = rej; });
            // Keep native .then intact — don't overwrite
            return def;
        },
        resolve: function (val) { return Promise.resolve(val); },
        reject: function (val) { return Promise.reject(val); },
        all: function (arr) { return Promise.all(arr); }
    };

    root.$http = function (cfg) {
        var url = cfg.url || cfg;
        var data = _piwebapi_mock(String(url));
        return { then: function (fn) { setTimeout(function () { fn({ data: data, status: 200 }); }, 30); return this; }, catch: function () { return this; } };
    };
    root.$http.get = function (url) { return root.$http({ url: url }); };
    root.$http.post = function (url, data) { return root.$http({ url: url, data: data, method: 'POST' }); };

    /* =========================================================
     *  10. MISC COMPAT
     * ========================================================= */

    // Some symbols use angular.element
    if (!root.angular) {
        root.angular = {
            element: function (el) { return window.jQuery ? window.jQuery(el) : { 0: typeof el === 'string' ? document.querySelector(el) : el, find: function () { return this; } }; },
            module: function () { return { directive: function () { return this; }, controller: function () { return this; }, filter: function () { return this; }, service: function () { return this; }, factory: function () { return this; }, run: function () { return this; }, config: function () { return this; } }; },
            noop: function () {},
            isFunction: function (fn) { return typeof fn === 'function'; },
            isObject: function (v) { return v !== null && typeof v === 'object'; },
            isArray: Array.isArray,
            isString: function (v) { return typeof v === 'string'; },
            isDefined: function (v) { return typeof v !== 'undefined'; },
            forEach: function (obj, fn) { if (Array.isArray(obj)) { obj.forEach(fn); } else { Object.keys(obj || {}).forEach(function (k) { fn(obj[k], k); }); } },
            extend: function (dst) { var srcs = Array.prototype.slice.call(arguments, 1); srcs.forEach(function (s) { for (var k in s) if (s.hasOwnProperty(k)) dst[k] = s[k]; }); return dst; },
            copy: function (src) { try { return JSON.parse(JSON.stringify(src)); } catch (e) { return src; } },
            toJson: function (v) { try { return JSON.stringify(v); } catch (e) { return '{}'; } },
            fromJson: function (s) { try { return JSON.parse(s); } catch (e) { return {}; } }
        };
    }

    // d3 stub if not loaded
    if (!root.d3) {
        root.d3 = null; // symbols check for d3, we'll note absence
    }

    // Moment stub
    if (!root.moment) {
        root.moment = function (d) {
            var _d = d ? new Date(d) : new Date();
            return {
                format: function (fmt) { return PIV20.formatters.date(_d, fmt); },
                valueOf: function () { return _d.getTime(); },
                toDate: function () { return _d; },
                add: function (n, unit) {
                    var ms = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
                    _d = new Date(_d.getTime() + n * (ms[unit] || 1000));
                    return this;
                },
                diff: function (other, unit) {
                    var ms = { seconds: 1000, minutes: 60000, hours: 3600000, days: 86400000 };
                    var d2 = other && other.toDate ? other.toDate() : new Date(other);
                    return Math.floor((_d - d2) / (ms[unit] || 1000));
                },
                isValid: function () { return !isNaN(_d); }
            };
        };
        root.moment.utc = root.moment;
    }

    // Chart.js stub (prevent "Chart is not defined" errors)
    if (!root.Chart) {
        root.Chart = function (canvas, config) {
            this.canvas = canvas;
            this.config = config;
            this.data = (config && config.data) || {};
            this.update = function () {};
            this.destroy = function () {};
            this.resize = function () {};
        };
        root.Chart.register = function () {};
        root.Chart.defaults = { font: {}, color: '#fff' };
    }

    /* =========================================================
     *  E9: EVENT FRAME MONITOR — real-time event frame generation
     *
     *  Watches simulated data values and generates event frames when
     *  values cross defined thresholds. Mirrors PI Analytics' real-time
     *  event frame generation and Notifications workflow.
     *
     *  Usage:
     *    PIVisualization.EventFrameMonitor.start()   — begin monitoring
     *    PIVisualization.EventFrameMonitor.stop()    — pause monitoring
     *    PIVisualization.EventFrameMonitor.getActive()    — current open frames
     *    PIVisualization.EventFrameMonitor.getHistory()   — all generated frames
     *    PIVisualization.EventFrameMonitor.addRule(rule)  — add threshold rule
     *    PIVisualization.EventFrameMonitor.onEvent(cb)    — subscribe to new events
     * ========================================================= */
    (function () {
        var _rules = [
            { name: 'חריגת טמפרטורה', attribute: 'Temperature', threshold: 520, direction: 'above', severity: 'Major', template: 'עלייה בטמפרטורה' },
            { name: 'ירידת הספק', attribute: 'MW', threshold: 100, direction: 'below', severity: 'Warning', template: 'ירידת הספק' },
            { name: 'תדר נמוך', attribute: 'Frequency', threshold: 49.5, direction: 'below', severity: 'Critical', template: 'חריגת תדר' },
            { name: 'רעידות גבוהות', attribute: 'Vibration', threshold: 8.0, direction: 'above', severity: 'Minor', template: 'רעידות חריגות' }
        ];
        var _activeFrames = {};   // key = rule.name + site, value = frame object
        var _history = [];        // all completed frames
        var _callbacks = [];
        var _intervalId = null;
        var _tick = 0;
        var SEVERITIES = { Information: 0, Warning: 1, Minor: 2, Major: 3, Critical: 4 };

        function _rndEF(min, max) { return min + Math.random() * (max - min); }

        function _generateValue(rule) {
            // Simulate values that occasionally cross thresholds
            var base = rule.direction === 'above' ? rule.threshold * 0.85 : rule.threshold * 1.15;
            var noise = (Math.random() - 0.4) * rule.threshold * 0.3;
            return +(base + noise).toFixed(2);
        }

        function _checkRules() {
            _tick++;
            var sites = ['אשקלון', 'חדרה', 'אורות רבין', 'רוטנברג', 'רידינג'];
            var site = sites[_tick % sites.length];

            _rules.forEach(function (rule) {
                var value = _generateValue(rule);
                var key = rule.name + '|' + site;
                var crossed = rule.direction === 'above' ? value > rule.threshold : value < rule.threshold;

                if (crossed && !_activeFrames[key]) {
                    // Open new event frame
                    var frame = {
                        Id: 'ef_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
                        Name: rule.template + ' — ' + site,
                        Description: rule.name + ': ערך ' + value + ' חצה סף ' + rule.threshold,
                        StartTime: new Date().toISOString(),
                        EndTime: null,
                        Template: rule.template,
                        Severity: rule.severity,
                        SeverityLevel: SEVERITIES[rule.severity] || 1,
                        PrimaryReferencedElement: '\\\\PISERVER01\\IEC_Grid\\' + site,
                        TriggerValue: value,
                        ThresholdValue: rule.threshold,
                        IsAcknowledged: false,
                        AcknowledgedBy: null,
                        Annotations: []
                    };
                    _activeFrames[key] = frame;
                    _notify(frame, 'opened');
                } else if (!crossed && _activeFrames[key]) {
                    // Close the event frame
                    var closingFrame = _activeFrames[key];
                    closingFrame.EndTime = new Date().toISOString();
                    closingFrame.Duration = Math.round((new Date(closingFrame.EndTime) - new Date(closingFrame.StartTime)) / 60000) + ' דקות';
                    _history.push(closingFrame);
                    if (_history.length > 200) _history.shift();
                    _notify(closingFrame, 'closed');
                    delete _activeFrames[key];
                }
            });
        }

        function _notify(frame, action) {
            var evt = { frame: frame, action: action, timestamp: new Date().toISOString() };
            _callbacks.forEach(function (cb) { try { cb(evt); } catch (e) {} });
            if (root.__EMU_CONSOLE_CALLBACK) {
                root.__EMU_CONSOLE_CALLBACK({ level: 'info', msg: '[EventFrameMonitor] ' + action + ': ' + frame.Name, time: evt.timestamp });
            }
        }

        PIVisualization.EventFrameMonitor = {
            start: function (intervalMs) {
                if (_intervalId) return;
                _intervalId = setInterval(_checkRules, intervalMs || 5000);
                console.log('[PV.EventFrameMonitor] Started — checking every ' + (intervalMs || 5000) + 'ms, ' + _rules.length + ' rules');
            },
            stop: function () {
                if (_intervalId) { clearInterval(_intervalId); _intervalId = null; }
                console.log('[PV.EventFrameMonitor] Stopped');
            },
            isRunning: function () { return !!_intervalId; },
            getActive: function () {
                var arr = [];
                for (var k in _activeFrames) if (_activeFrames.hasOwnProperty(k)) arr.push(_activeFrames[k]);
                return arr;
            },
            getHistory: function () { return _history.slice(); },
            getAll: function () {
                var active = [];
                for (var k in _activeFrames) if (_activeFrames.hasOwnProperty(k)) active.push(_activeFrames[k]);
                return active.concat(_history);
            },
            addRule: function (rule) {
                if (rule && rule.name && rule.attribute && rule.threshold !== undefined && rule.direction) {
                    _rules.push(rule);
                    console.log('[PV.EventFrameMonitor] Added rule: ' + rule.name);
                }
            },
            getRules: function () { return _rules.slice(); },
            onEvent: function (cb) { if (typeof cb === 'function') _callbacks.push(cb); },
            acknowledge: function (frameId, user) {
                var all = PIVisualization.EventFrameMonitor.getAll();
                for (var i = 0; i < all.length; i++) {
                    if (all[i].Id === frameId) {
                        all[i].IsAcknowledged = true;
                        all[i].AcknowledgedBy = user || 'operator';
                        all[i].AcknowledgedDate = new Date().toISOString();
                        _notify(all[i], 'acknowledged');
                        return true;
                    }
                }
                return false;
            },
            reset: function () {
                _activeFrames = {};
                _history = [];
                _tick = 0;
            }
        };
    })();

    console.log('[EMU-SHIMS] All shim layers loaded. PIVisualization, PIV20, MU20, MM20 ready.');

})(window);
