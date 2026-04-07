/**
 * ═══════════════════════════════════════════════════════
 *  sym-wow-heatmap.js  —  Executive Canvas Heatmap
 * ═══════════════════════════════════════════════════════
 *  PI Vision symbol wrapper with modern internals:
 *    • Shadow DOM for CSS isolation
 *    • Web Worker for off-thread data processing
 *    • ES6 WowHeatmapRenderer for GPU-accelerated Canvas
 *    • OffscreenCanvas progressive enhancement
 *
 *  Architecture:
 *    PI Vision → onDataUpdate() → Worker.postMessage(PI_DATA)
 *    Worker → HEATMAP_STATE → Renderer.update()
 *    Worker → SENSITIVITY  → Renderer.updateSensitivity()
 *
 *  Version : WOW HM 100.0
 *  Prefix  : wow-hm-
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    // ── Symbol constructor ──
    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    var DATA_DEBOUNCE_MS = 100;

    // ── Resolve script base path from current <script> tag ──
    var SCRIPT_BASE = (function () {
        var scripts = document.querySelectorAll('script[src*="sym-wow-heatmap"]');
        if (scripts.length) {
            var s = scripts[scripts.length - 1].getAttribute('src') || '';
            return s.substring(0, s.lastIndexOf('/') + 1);
        }
        // Dynamic fallback via PI Vision base URL
        var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
        return base + '/Scripts/app/editor/symbols/ext/';
    })();

    // ── Ensure renderer is loaded (previously loaded by template <script> tag) ──
    if (!window.WowHeatmapRenderer) {
        var _rs = document.createElement('script');
        _rs.src = SCRIPT_BASE + 'wow-plugins/wow-heatmap-renderer.js';
        (document.head || document.documentElement).appendChild(_rs);
    }


    // ═══════════════════════════════════════
    //  DEFAULT SITES (fallback if none configured)
    // ═══════════════════════════════════════

    var DEFAULT_SITES = (window.MM20 && window.MM20.SITES) ? window.MM20.SITES : [
        { id: 'orot_rabin',  name: '\u05D0\u05D5\u05E8\u05D5\u05EA \u05E8\u05D1\u05D9\u05DF',  region: '\u05D7\u05D3\u05E8\u05D4', fuel: '\u05E4\u05D7\u05DD', units: ['\u05D9\u05D7\u05D9\u05D3\u05D4 1','\u05D9\u05D7\u05D9\u05D3\u05D4 2','\u05D9\u05D7\u05D9\u05D3\u05D4 3','\u05D9\u05D7\u05D9\u05D3\u05D4 4'] },
        { id: 'reading',     name: '\u05E8\u05D9\u05D3\u05D9\u05E0\u05D2',        region: '\u05EA\u05F4\u05D0',    fuel: '\u05D2\u05D6',   units: ['\u05D9\u05D7\u05D9\u05D3\u05D4 1','\u05D9\u05D7\u05D9\u05D3\u05D4 2'] },
        { id: 'eshkol',      name: '\u05D0\u05E9\u05DB\u05D5\u05DC',       region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05D2\u05D6',   units: ['\u05D9\u05D7\u05D9\u05D3\u05D4 1','\u05D9\u05D7\u05D9\u05D3\u05D4 2','\u05D9\u05D7\u05D9\u05D3\u05D4 3'] },
        { id: 'rutenberg',   name: '\u05E8\u05D5\u05D8\u05E0\u05D1\u05E8\u05D2',     region: '\u05D3\u05E8\u05D5\u05DD', fuel: '\u05E4\u05D7\u05DD', units: ['\u05D9\u05D7\u05D9\u05D3\u05D4 1','\u05D9\u05D7\u05D9\u05D3\u05D4 2','\u05D9\u05D7\u05D9\u05D3\u05D4 3','\u05D9\u05D7\u05D9\u05D3\u05D4 4'] },
        { id: 'hagit',       name: '\u05D7\u05D2\u05D9\u05EA',        region: '\u05E6\u05E4\u05D5\u05DF', fuel: '\u05D2\u05D6',   units: ['\u05D9\u05D7\u05D9\u05D3\u05D4 1'] }
    ];


    // ═══════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════

    symbolVis.prototype.init = function (scope, elem) {
        var self = this;
        var MM = window.MM20;

        // ── Defensive guard with self-healing retry ──
        if (!window.WowHeatmapRenderer) {
            var _retries = scope._wowHmRetries || 0;
            if (_retries < 25) { // retry up to 5 seconds (25 × 200ms)
                scope._wowHmRetries = _retries + 1;
                setTimeout(function () { self.init(scope, elem); }, 200);
                return;
            }
            console.error('[WOW-HM] wow-heatmap-renderer.js not loaded after retries');
            var root = elem[0].querySelector('.wow-hm-root-mount') || elem[0];
            root.innerHTML =
                '<div dir="rtl" style="display:flex;align-items:center;justify-content:center;' +
                'height:100%;color:#F39C12;text-align:center;padding:20px;font-family:Segoe UI,Arial,sans-serif;">' +
                '<div><div style="font-size:32px;margin-bottom:8px;">\u26A0</div>' +
                '<div style="font-size:14px;font-weight:600;">WOW Heatmap Renderer \u05DC\u05D0 \u05E0\u05D8\u05E2\u05DF</div></div></div>';
            return;
        }

        // ── Resolve container ──
        var rootEl = elem[0].querySelector('.wow-hm-root-mount');
        if (!rootEl) {
            rootEl = elem[0];
        }

        // ── Create Shadow DOM ──
        var shadow;
        try {
            shadow = rootEl.attachShadow({ mode: 'open' });
        } catch (e) {
            // Fallback: if Shadow DOM not supported, use rootEl directly
            console.warn('[WOW-HM] Shadow DOM not available, using light DOM fallback');
            shadow = rootEl;
        }

        // ── Inject CSS into Shadow DOM ──
        var styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = SCRIPT_BASE + 'sym-wow-heatmap.css';
        shadow.appendChild(styleLink);

        // ── Create Event Bus ──
        var bus = null;
        if (MM && MM.createBus) {
            bus = MM.createBus();
        }

        // ── Create Web Worker ──
        var worker = null;
        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-heatmap-worker.js');
        } catch (e) {
            console.error('[WOW-HM] Failed to create Worker:', e);
        }

        // ── Create Renderer ──
        var sites = scope.config.CustomSites || DEFAULT_SITES;
        var renderer = new window.WowHeatmapRenderer(shadow, {
            sites:       sites,
            metric:      scope.config.Metric      || 'hours',
            viewMode:    scope.config.ViewMode     || 'monthly',
            colorScheme: scope.config.ColorScheme  || 'executive',
            warnPct:     scope.config.WarnPct      || 70,
            critPct:     scope.config.CritPct      || 90,
            decimals:    scope.config.Decimals      || 1,
            showValues:  scope.config.ShowValues   !== false,
            showLabels:  scope.config.ShowLabels   !== false,
            fontFamily:  scope.config.fontFamily   || 'Segoe UI',
            fontSize:    scope.config.fontSize     || 12,
            demoMode:    scope.config.DemoMode     || false
        }, bus);

        renderer.mount(sites);

        // ── Send initial config to Worker ──
        if (worker) {
            worker.postMessage({
                type: 'CONFIG',
                payload: {
                    warnPct:     scope.config.WarnPct     || 70,
                    critPct:     scope.config.CritPct     || 90,
                    decimals:    scope.config.Decimals    || 1,
                    metric:      scope.config.Metric      || 'hours',
                    viewMode:    scope.config.ViewMode    || 'monthly',
                    colorScheme: scope.config.ColorScheme || 'executive'
                }
            });

            // ── OffscreenCanvas progressive enhancement ──
            self._hmOffscreenActive = false;
            try {
                var canvas = shadow.querySelector ? shadow.querySelector('.wow-hm-canvas') : null;
                if (canvas && typeof canvas.transferControlToOffscreen === 'function') {
                    var offscreen = canvas.transferControlToOffscreen();
                    worker.postMessage({
                        type: 'OFFSCREEN_INIT',
                        payload: {
                            canvas: offscreen,
                            dpr:    window.devicePixelRatio || 1,
                            width:  canvas.clientWidth || 800,
                            height: canvas.clientHeight || 400
                        }
                    }, [offscreen]);
                    self._hmOffscreenActive = true;
                }
            } catch (oce) {
                // OffscreenCanvas not supported — renderer draws on main thread
                console.info('[WOW-HM] OffscreenCanvas not available, using main-thread rendering');
            }

            // ── Worker → Renderer bridge ──
            worker.onmessage = function (e) {
                var msg = e.data;
                if (!msg || !msg.type) return;

                switch (msg.type) {
                    case 'HEATMAP_STATE':
                        renderer.update(msg.payload);
                        break;
                    case 'SENSITIVITY':
                        renderer.updateSensitivity(msg.payload);
                        break;
                    case 'OFFSCREEN_FRAME':
                        // Frame drawn on OffscreenCanvas — no action needed
                        break;
                    case 'ERROR':
                        console.warn('[WOW-HM Worker]', msg.payload.source, msg.payload.message);
                        break;
                }
            };

            worker.onerror = function (err) {
                console.error('[WOW-HM Worker Error]', err.message);
            };
        }

        // ── Store refs for dataUpdate and cleanup ──
        self._hmWorker   = worker;
        self._hmRenderer = renderer;
        self._hmBus      = bus;
        self._hmSites    = sites;
        self._hmScope    = scope;

        // ── Debounce state ──
        self._hmPendingData  = null;
        self._hmDebounceId   = null;
        self._hmFirstDone    = false;

        // ── Demo mode: generate initial heatmap data ──
        if (scope.config.DemoMode && MM && MM.demo && MM.demo.generateSites) {
            var demoData = MM.demo.generateSites(sites);
            if (worker) {
                worker.postMessage({
                    type: 'PI_DATA',
                    payload: {
                        sites:    sites,
                        data:     demoData,
                        warnPct:  scope.config.WarnPct  || 70,
                        critPct:  scope.config.CritPct  || 90,
                        metric:   scope.config.Metric   || 'hours',
                        viewMode: scope.config.ViewMode || 'monthly'
                    }
                });
            }
        }

        // ── Config watchers: push changes to Worker + Renderer ──
        scope.$watch('config.WarnPct', function (nv) {
            if (worker && nv !== undefined) {
                worker.postMessage({ type: 'CONFIG', payload: { warnPct: nv } });
            }
        });
        scope.$watch('config.CritPct', function (nv) {
            if (worker && nv !== undefined) {
                worker.postMessage({ type: 'CONFIG', payload: { critPct: nv } });
            }
        });
        scope.$watch('config.Metric', function (nv) {
            if (nv) {
                if (worker) worker.postMessage({ type: 'CONFIG', payload: { metric: nv } });
                if (renderer) renderer.setMetric(nv);
            }
        });
        scope.$watch('config.ViewMode', function (nv) {
            if (nv) {
                if (worker) worker.postMessage({ type: 'CONFIG', payload: { viewMode: nv } });
                if (renderer) renderer.setViewMode(nv);
            }
        });
        scope.$watch('config.ColorScheme', function (nv) {
            if (nv) {
                if (worker) worker.postMessage({ type: 'CONFIG', payload: { colorScheme: nv } });
                if (renderer) renderer.setColorScheme(nv);
            }
        });
        scope.$watch('config.Decimals', function (nv) {
            if (worker && nv !== undefined) {
                worker.postMessage({ type: 'CONFIG', payload: { decimals: nv } });
            }
        });

        // ── Bus events from Renderer (toolbar actions) ──
        if (bus) {
            bus.on('metric-change', function (metric) {
                scope.config.Metric = metric;
            });
            bus.on('viewmode-change', function (mode) {
                scope.config.ViewMode = mode;
            });
            bus.on('colorscheme-change', function (scheme) {
                scope.config.ColorScheme = scheme;
            });
        }

        // ── Cleanup on $destroy ──
        scope.$on('$destroy', function () {
            clearTimeout(self._hmDebounceId);
            self._hmPendingData = null;
            if (self._hmRenderer) {
                self._hmRenderer.destroy();
                self._hmRenderer = null;
            }
            if (self._hmWorker) {
                self._hmWorker.terminate();
                self._hmWorker = null;
            }
            if (self._hmBus) {
                self._hmBus.reset();
                self._hmBus = null;
            }
            self._hmSites = null;
            self._hmScope = null;
            self._hmOffscreenActive = false;
        });
    };


    // ═══════════════════════════════════════
    //  DATA UPDATE — PI Vision → Worker
    // ═══════════════════════════════════════

    symbolVis.prototype._processDataUpdate = function (data) {
        if (!this._hmWorker || !data) return;

        try {
            // Parse PI Vision data format into site-keyed structure
            var parsedData = this._parseData(data);
            var scope = this._hmScope;

            this._hmWorker.postMessage({
                type: 'PI_DATA',
                payload: {
                    sites:    this._hmSites,
                    data:     parsedData,
                    warnPct:  scope ? scope.config.WarnPct  : 70,
                    critPct:  scope ? scope.config.CritPct  : 90,
                    metric:   scope ? scope.config.Metric   : 'hours',
                    viewMode: scope ? scope.config.ViewMode : 'monthly'
                }
            });
        } catch (e) {
            console.error('[WOW-HM] dataUpdate error:', e);
        }
    };

    symbolVis.prototype.dataUpdate = function (data) {
        if (!this._hmWorker || !data) return;
        var self = this;
        self._hmPendingData = data;
        if (!self._hmFirstDone) {
            self._hmFirstDone = true;
            self._processDataUpdate(data);
            self._hmPendingData = null;
            return;
        }
        if (!self._hmDebounceId) {
            self._hmDebounceId = setTimeout(function () {
                self._hmDebounceId = null;
                if (self._hmPendingData) {
                    self._processDataUpdate(self._hmPendingData);
                    self._hmPendingData = null;
                }
            }, DATA_DEBOUNCE_MS);
        }
    };


    // ═══════════════════════════════════════
    //  _parseData — PI Vision Table → Site Map
    // ═══════════════════════════════════════

    symbolVis.prototype._parseData = function (data) {
        var result = {};
        if (!data || !data.Rows) return result;

        var sites = this._hmSites || [];
        for (var s = 0; s < sites.length; s++) {
            result[sites[s].id] = {};
        }

        // PI Vision Table format: Rows[i].Label, Rows[i].Value, etc.
        for (var r = 0; r < data.Rows.length; r++) {
            var row = data.Rows[r];
            if (!row) continue;

            // Extract site ID and unit index from row label or path
            var label = row.Label || row.Path || '';
            var parsed = this._parseLabel(label, sites);
            if (!parsed) continue;

            if (!result[parsed.siteId]) result[parsed.siteId] = {};
            result[parsed.siteId][parsed.unitIdx] = {
                pct:     row.Value !== undefined ? parseFloat(row.Value) : 0,
                hours:   row.Hours || 0,
                quota:   row.Quota || 0,
                value:   row.Value || 0,
                ts:      row.Timestamp || new Date().toISOString(),
                monthly: row.Monthly || null,
                dayHour: row.DayHour || null,
                status:  null  // Worker will classify
            };
        }

        return result;
    };


    /**
     * Parse a PI Vision row label to extract siteId and unitIdx.
     * Supports patterns like "orot_rabin|unit_2" or AF path formats.
     */
    symbolVis.prototype._parseLabel = function (label, sites) {
        if (!label) return null;

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            if (label.indexOf(site.id) >= 0) {
                // Try to extract unit index
                var match = label.match(/[_|]u(?:nit[_\s]?)?(\d+)/i);
                if (match) {
                    return { siteId: site.id, unitIdx: parseInt(match[1], 10) };
                }
                // Fallback: sequential by order within site
                if (!this._parsedCounts) this._parsedCounts = {};
                if (!this._parsedCounts[site.id]) this._parsedCounts[site.id] = 0;
                var idx = this._parsedCounts[site.id];
                this._parsedCounts[site.id]++;
                if (idx < site.units.length) {
                    return { siteId: site.id, unitIdx: idx };
                }
            }
        }

        return null;
    };


    // ═══════════════════════════════════════
    //  REGISTRATION
    // ═══════════════════════════════════════

    PV.symbolCatalog.register({
        typeName:           'wow-heatmap',
        displayName:        '\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'images/wow-icon.svg',
        visObjectType:      symbolVis,
        inject:             ['$interval', '$timeout'],

        getDefaultConfig: function () {
            return {
                DataShape:    'Table',
                Height:       500,
                Width:        1000,
                Title:        '\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD WOW',
                DemoMode:     true,
                Metric:       'hours',
                ViewMode:     'monthly',
                ColorScheme:  'executive',
                WarnPct:      70,
                CritPct:      90,
                Decimals:     1,
                ShowValues:   true,
                ShowLabels:   true,
                CustomSites:  null,
                fontFamily:   'Segoe UI',
                fontSize:     12
            };
        },

        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DE\u05E4\u05EA \u05D7\u05D5\u05DD WOW'
    });

})(window.PIVisualization);
