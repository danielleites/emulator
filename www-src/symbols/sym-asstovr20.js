/**
 * ================================================================
 *  sym-assetoverview20.js  --  Asset Overview v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Asset Overview.
 *  Domain logic lives in piv20-plugins/piv20-assetoverview.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - Trigger sparkline rendering after Angular digest
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js              (PIV20 namespace)
 *    - piv20-assetoverview.js     (jQuery widget plugin)
 *    - sym-assetoverview20.css    (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'asstovr20';
    var WIDGET_NAME = 'piv20AssetOverview';
    var THROTTLE_MS = 500;

    // ══════════════════════════════════════════════
    //  SYMBOL VIS
    // ══════════════════════════════════════════════

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    /**
     * Initialize symbol: create bus, bind scope, init widget.
     */
    symbolVis.prototype.init = function (scope, el) {
        var PIV20 = window.PIV20;
        if (!PIV20) { console.error('[' + SYM_NAME + '] PIV20 not loaded'); return; }

        var container = el[0] || el;
        var P = window.PIV10;
        var lastProcessTime = 0;

        // ── Create per-instance bus ──
        var bus = PIV20.createBus();

        // ── Cleanup context ──
        var _cleanup = {
            intervals: [],
            timeouts: [],
            unwatchers: [],
            listeners: [],
            widgets: {},
            $interval: null,
            $timeout: null
        };

        // ── Scope state ──
        scope.panelOpen    = false;
        scope.liveTime     = PIV20.fmt.time();
        scope.loading      = true;

        // Asset overview data (populated from widget via bus)
        scope.assets          = [];
        scope.filteredAssets  = [];
        scope.stats           = { total: 0, avg: 0, min: 0, max: 0, sum: 0, good: 0, bad: 0, stale: 0, outlierCount: 0 };
        scope.afConn          = null;
        scope.hasData         = false;
        scope.selectedAsset   = null;

        // View state
        scope.viewMode        = 'table';
        scope.searchText      = '';
        scope.sortCol         = 'label';
        scope.sortDir         = 'asc';
        scope.sparklineEnabled = scope.config.sparklineEnabled !== false;
        scope.isFullscreen    = false;


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };

        // ── View mode ──
        scope.setView = function (mode) {
            scope.viewMode = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setViewMode', mode);
        };

        // ── Sort ──
        scope.setSort = function (col) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('sortBy', col);
        };

        // ── Search filter ──
        scope.onFilterChange = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setFilterText', scope.searchText);
        };

        // ── Asset selection ──
        scope.selectAsset = function (asset) {
            var idx = asset ? asset._idx : -1;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('selectAsset', idx);
        };

        scope.clearSelection = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('selectAsset', -1);
        };

        // ── Sparkline toggle ──
        scope.toggleSparklines = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleSparklines');
        };

        // ── Export ──
        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };

        // ── Fullscreen ──
        scope.toggleFullscreen = function () {
            try {
                var fsEl = document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
                if (!fsEl) {
                    var rfs = null;
                    if (rfs) rfs.call(container);
                    scope.isFullscreen = true;
                } else {
                    var efs = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
                    if (efs) efs.call(document);
                    scope.isFullscreen = false;
                }
            } catch (e) { /* ignore */ }
        };

        // ── Value color helper ──
        scope.getValueColor = function (asset) {
            if (!asset) return 'var(--ao20-text)';
            return 'var(' + asset.valColor + ')';
        };

        // ── Quality badge class ──
        scope.getQualityClass = function (asset) {
            if (!asset) return '';
            if (!asset.quality.ok) return 'bad';
            if (asset.stale) return 'warn';
            return 'good';
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('ao:updated', function (payload) {
            scope.assets          = payload.assets;
            scope.filteredAssets  = payload.filteredAssets;
            scope.stats           = payload.stats;
            scope.afConn          = payload.afConn;
            scope.hasData         = payload.hasData;
            scope.viewMode        = payload.viewMode;
            scope.searchText      = payload.searchText;
            scope.sortCol         = payload.sortCol;
            scope.sortDir         = payload.sortDir;
            scope.selectedAsset   = payload.selectedAsset;
            scope.sparklineEnabled = payload.sparklineEnabled;
            scope.loading         = false;
            scope.$applyAsync();

            // Trigger sparkline rendering after digest
            if (payload.sparklineEnabled && _widgetRef) {
                _widgetRef[WIDGET_NAME]('renderSparklines');
            }
        });

        bus.on('toast:show', function (msg) {
            PIV20.ui.showToast(container, msg);
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#ao20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05E1\u05E7\u05D9\u05E8\u05EA \u05E0\u05DB\u05E1\u05D9\u05DD \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.assetoverview = { ref: _widgetRef, widgetName: WIDGET_NAME };
        }


        // ══════════════════════════════════════════════
        //  PIV10 SHARED INFRA (optional)
        // ══════════════════════════════════════════════

        if (P && P.initSymbol) {
            P.initSymbol(scope, el, {
                name: SYM_NAME,
                onTagDrop: function (path) {
                    scope.symbol.DataSources.push(path);
                    if (P.tagContainer) P.tagContainer.register(scope, path, '', '');
                },
                onExport: function () { scope.exportData(); },
                contextMenuItems: [
                    { label: '\u05D8\u05D1\u05DC\u05D4', icon: '\u2261', action: function () { scope.setView('table'); } },
                    { label: '\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05DD', icon: '\u25A4', action: function () { scope.setView('cards'); } }
                ]
            });
        } else {
            // Fallback clock
            var _clockInterval = setInterval(function () {
                scope.liveTime = PIV20.fmt.time();
                scope.$applyAsync();
            }, 1000);
            _cleanup.intervals.push({ cancel: function () { clearInterval(_clockInterval); } });
        }

        // ── Fullscreen change listener ──
        function _onFsChange() {
            scope.isFullscreen = !!(document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement);
            scope.$applyAsync();
        }
        document.addEventListener('fullscreenchange', _onFsChange);
        document.addEventListener('webkitfullscreenchange', _onFsChange);
        _cleanup.listeners.push(
            { remove: function () { document.removeEventListener('fullscreenchange', _onFsChange); } },
            { remove: function () { document.removeEventListener('webkitfullscreenchange', _onFsChange); } }
        );


        // ══════════════════════════════════════════════
        //  DATA UPDATE (throttled, routed to widget)
        // ══════════════════════════════════════════════

        this.onDataUpdate = PIV20.shield.wrap(SYM_NAME, 'dataUpdate', function (data) {
            var now = Date.now();
            if (now - lastProcessTime < THROTTLE_MS) return;
            lastProcessTime = now;

            scope.liveTime = PIV20.fmt.time();

            // Route to widget via bus
            bus.emit('data:updated', data);
        });

        // ── Config change → re-emit to widget ──
        this.onConfigChange = PIV20.shield.wrap(SYM_NAME, 'configChange', function () {
            if (_widgetRef && _widgetRef.data && _widgetRef.data(WIDGET_NAME)) {
                _widgetRef[WIDGET_NAME]('option', 'config', scope.config);
            }
            bus.emit('config:changed', scope.config);
        });

        // ── Docs integration ──
        scope.showDocs = function (section) {
            if (P && P.docs) P.docs.show(SYM_NAME, container, section);
        };
        if (P && P.docs) P.docs.initTooltips(container, SYM_NAME);

        // ── $destroy cleanup ──
        scope.$on('$destroy', function () {
            bus.reset();
            PIV20.destroyHelper(_cleanup);
            scope.assets         = null;
            scope.filteredAssets = null;
            scope.stats          = null;
            scope.afConn         = null;
            scope.selectedAsset  = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05E1\u05E7\u05D9\u05E8\u05EA \u05E0\u05DB\u05E1\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-assetoverview20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 500,
                Width: 750,
                Decimals: 2,
                panelOpen: false,
                // Thresholds
                warnThreshold: 60,
                critThreshold: 80,
                perAssetThresholds: {},
                // Sparklines
                sparklineEnabled: true,
                sparklinePoints: 12,
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 13,
                headerFontSize: 15,
                fontBold: false,
                fontItalic: false,
                // Colors
                headerBg: '#0D1F35',
                rowBg: '#0F2940',
                altRowBg: '#0A1628',
                goodColor: '#2ECC71',
                warningColor: '#F39C12',
                criticalColor: '#E74C3C',
                accentColor: '#5BC0EB',
                // Animation
                animationType: 'fade',
                animationSpeed: 300,
                // AF
                StaleThreshold: 300
            };
        },
        configTitle: '\u05E1\u05E7\u05D9\u05E8\u05EA \u05E0\u05DB\u05E1\u05D9\u05DD',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
