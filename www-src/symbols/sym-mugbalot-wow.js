/**
 * ═══════════════════════════════════════════════════════
 *  sym-mugbalot-wow.js  —  Next-Gen Executive Grid
 * ═══════════════════════════════════════════════════════
 *  PI Vision symbol wrapper with modern internals:
 *    • Shadow DOM for CSS isolation
 *    • Web Worker for off-thread data processing
 *    • ES6 WowGridRenderer for GPU-composited rendering
 *
 *  Architecture:
 *    PI Vision → onDataUpdate() → Worker.postMessage()
 *    Worker → RENDER_STATE → Renderer.update()
 *    Worker → SPARKLINE    → Renderer.updateSparkline()
 *
 *  Version : WOW 100.0
 *  Prefix  : wow-
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
        var scripts = document.querySelectorAll('script[src*="sym-mugbalot-wow"]');
        if (scripts.length) {
            var s = scripts[scripts.length - 1].getAttribute('src') || '';
            return s.substring(0, s.lastIndexOf('/') + 1);
        }
        // Dynamic fallback via PI Vision base URL
        var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
        return base + '/Scripts/app/editor/symbols/ext/';
    })();

    // ── Ensure renderer is loaded (previously loaded by template <script> tag) ──
    if (!window.WowGridRenderer) {
        var _rs = document.createElement('script');
        _rs.src = SCRIPT_BASE + 'wow-plugins/wow-grid-renderer.js';
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
        if (!window.WowGridRenderer) {
            var _retries = scope._wowRetries || 0;
            if (_retries < 25) { // retry up to 5 seconds (25 × 200ms)
                scope._wowRetries = _retries + 1;
                setTimeout(function () { self.init(scope, elem); }, 200);
                return;
            }
            console.error('[WOW] wow-grid-renderer.js not loaded after retries');
            var root = elem[0].querySelector('.wow-root') || elem[0];
            root.innerHTML =
                '<div dir="rtl" style="display:flex;align-items:center;justify-content:center;' +
                'height:100%;color:#F39C12;text-align:center;padding:20px;font-family:Segoe UI,Arial,sans-serif;">' +
                '<div><div style="font-size:32px;margin-bottom:8px;">\u26A0</div>' +
                '<div style="font-size:14px;font-weight:600;">WOW Renderer \u05DC\u05D0 \u05E0\u05D8\u05E2\u05DF</div></div></div>';
            return;
        }

        // ── Resolve container ──
        var rootEl = elem[0].querySelector('.wow-root');
        if (!rootEl) {
            rootEl = elem[0];
        }

        // ── Create Shadow DOM ──
        var shadow;
        try {
            shadow = rootEl.attachShadow({ mode: 'open' });
        } catch (e) {
            // Fallback: if Shadow DOM not supported, use rootEl directly
            console.warn('[WOW] Shadow DOM not available, using light DOM fallback');
            shadow = rootEl;
        }

        // ── Inject CSS into Shadow DOM ──
        var styleLink = document.createElement('link');
        styleLink.rel = 'stylesheet';
        styleLink.href = SCRIPT_BASE + 'sym-mugbalot-wow.css';
        shadow.appendChild(styleLink);

        // ── Create Event Bus ──
        var bus = null;
        if (MM && MM.createBus) {
            bus = MM.createBus();
        }

        // ── Create Web Worker ──
        var worker = null;
        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-data-worker.js');
        } catch (e) {
            console.error('[WOW] Failed to create Worker:', e);
        }

        // ── Create Renderer ──
        var sites = scope.config.CustomSites || DEFAULT_SITES;
        var renderer = new window.WowGridRenderer(shadow, {
            sites:          sites,
            favorites:      scope.config.Favorites || {},
            sortOrder:      scope.config.SortOrder || 'name',
            warnPct:        scope.config.WarnPct || 70,
            critPct:        scope.config.CritPct || 90,
            showSparklines: scope.config.ShowSparklines !== false,
            decimals:       scope.config.Decimals || 1,
            annotations:    scope.config.Annotations || {},
            unitSettings:   scope.config.UnitSettings || {},
            siteSettings:   scope.config.SiteSettings || {},
            trendBaseUrl:   scope.config.TrendBaseUrl || '',
            demoMode:       scope.config.DemoMode || false
        }, bus);

        renderer.mount(sites);

        // ── Send initial config to Worker ──
        if (worker) {
            worker.postMessage({
                type: 'CONFIG',
                payload: {
                    warnPct:  scope.config.WarnPct || 70,
                    critPct:  scope.config.CritPct || 90,
                    decimals: scope.config.Decimals || 1
                }
            });

            // ── Worker → Renderer bridge ──
            worker.onmessage = function (e) {
                var msg = e.data;
                if (!msg || !msg.type) return;

                switch (msg.type) {
                    case 'RENDER_STATE':
                        renderer.update(msg.payload);
                        break;
                    case 'SPARKLINE':
                        renderer.updateSparkline(msg.payload);
                        break;
                    case 'SENSITIVITY':
                        // Sensitivity already handled in renderer.update()
                        break;
                    case 'RATE':
                        // Rate data — could be used for extended TTE display
                        break;
                    case 'ERROR':
                        console.warn('[WOW Worker]', msg.payload.source, msg.payload.message);
                        break;
                }
            };

            worker.onerror = function (err) {
                console.error('[WOW Worker Error]', err.message);
            };
        }

        // ── Store refs for dataUpdate and cleanup ──
        self._wowWorker   = worker;
        self._wowRenderer = renderer;
        self._wowBus      = bus;
        self._wowSites    = sites;
        self._wowScope    = scope;

        // ── Debounce state ──
        self._wowPendingData  = null;
        self._wowDebounceId   = null;
        self._wowFirstDone    = false;

        // ── Demo mode: generate initial data ──
        if (scope.config.DemoMode && MM && MM.demo && MM.demo.generateSites) {
            var demoData = MM.demo.generateSites(sites);
            if (worker) {
                worker.postMessage({
                    type: 'PI_DATA',
                    payload: {
                        sites: sites,
                        data: demoData,
                        warnPct: scope.config.WarnPct || 70,
                        critPct: scope.config.CritPct || 90,
                        unitSettings: scope.config.UnitSettings || {}
                    }
                });
            }
        }

        // ── Config watcher: push config changes to Worker ──
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

        // ── Cleanup on $destroy ──
        scope.$on('$destroy', function () {
            clearTimeout(self._wowDebounceId);
            self._wowPendingData = null;
            if (self._wowRenderer) {
                self._wowRenderer.destroy();
                self._wowRenderer = null;
            }
            if (self._wowWorker) {
                self._wowWorker.terminate();
                self._wowWorker = null;
            }
            if (self._wowBus) {
                self._wowBus.reset();
                self._wowBus = null;
            }
            self._wowSites = null;
            self._wowScope = null;
        });
    };


    // ═══════════════════════════════════════
    //  DATA UPDATE — PI Vision → Worker
    // ═══════════════════════════════════════

    symbolVis.prototype._processDataUpdate = function (data) {
        if (!this._wowWorker || !data) return;

        try {
            // Parse PI Vision data format into site-keyed structure
            var parsedData = this._parseData(data);
            var scope = this._wowScope;

            this._wowWorker.postMessage({
                type: 'PI_DATA',
                payload: {
                    sites:        this._wowSites,
                    data:         parsedData,
                    warnPct:      scope ? scope.config.WarnPct  : 70,
                    critPct:      scope ? scope.config.CritPct  : 90,
                    decimals:     scope ? scope.config.Decimals : 1,
                    unitSettings: scope ? (scope.config.UnitSettings || {}) : {}
                }
            });
        } catch (e) {
            console.error('[WOW] dataUpdate error:', e);
        }
    };

    symbolVis.prototype.dataUpdate = function (data) {
        if (!this._wowWorker || !data) return;
        var self = this;
        self._wowPendingData = data;
        if (!self._wowFirstDone) {
            self._wowFirstDone = true;
            self._processDataUpdate(data);
            self._wowPendingData = null;
            return;
        }
        if (!self._wowDebounceId) {
            self._wowDebounceId = setTimeout(function () {
                self._wowDebounceId = null;
                if (self._wowPendingData) {
                    self._processDataUpdate(self._wowPendingData);
                    self._wowPendingData = null;
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

        var sites = this._wowSites || [];
        var siteMap = {};
        for (var s = 0; s < sites.length; s++) {
            siteMap[sites[s].id] = sites[s];
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
                tte:     row.TTE !== undefined ? parseFloat(row.TTE) : Infinity,
                value:   row.Value || 0,
                ts:      row.Timestamp || new Date().toISOString(),
                monthly: row.Monthly || null,
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

        // Pattern 1: "siteId|unit_N" or "siteId_uN"
        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            if (label.indexOf(site.id) >= 0) {
                // Try to extract unit index
                var match = label.match(/[_|]u(?:nit[_\s]?)?(\d+)/i);
                if (match) {
                    return { siteId: site.id, unitIdx: parseInt(match[1], 10) };
                }
                // Fallback: sequential by order within site
                var existing = 0;
                for (var key in this._parsedCounts) {
                    if (key === site.id) existing = this._parsedCounts[key];
                }
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
        typeName:           'mugbalot-wow',
        displayName:        '\u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'images/wow-icon.svg',
        visObjectType:      symbolVis,
        inject:             ['$interval', '$timeout'],

        getDefaultConfig: function () {
            return {
                DataShape:      'Table',
                Height:         600,
                Width:          1200,
                Title:          '\u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA WOW',
                Subtitle:       '',
                DemoMode:       true,
                ShowFooter:     false,
                FooterText:     '',
                ActiveTab:      'realtime',
                WarnPct:        70,
                CritPct:        90,
                Decimals:       1,
                SortOrder:      'name',
                ShowSparklines: true,
                Favorites:      {},
                Annotations:    {},
                UnitSettings:   {},
                SiteSettings:   {},
                TrendBaseUrl:   '',
                CustomSites:    null,
                fontFamily:     'Segoe UI',
                fontSize:       12
            };
        },

        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA WOW'
    });

})(window.PIVisualization);
