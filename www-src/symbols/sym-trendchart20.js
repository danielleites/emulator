/**
 * ================================================================
 *  sym-trendchart20.js  --  Canvas Trend Chart v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the multi-series trend chart.
 *  Domain logic lives in piv20-plugins/piv20-trendchart.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - Resize observer → widget.redraw()
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js          (PIV20 namespace)
 *    - piv20-trendchart.js    (jQuery widget plugin)
 *    - sym-trendchart20.css   (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'trendchart20';
    var WIDGET_NAME = 'piv20Trendchart';
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
        scope.panelOpen = false;
        scope.showSidePanel = false;
        scope.liveTime = PIV20.fmt.time();
        scope.loading = true;

        // Chart display state (populated from widget via bus)
        scope.legendItems = [];
        scope.stats = {};
        scope.afConn = null;
        scope.seriesCount = 0;

        // Time range
        scope.timeRange = '5m';

        // Series visibility
        scope.hiddenSeries = {};

        // Chart options (mirrored in scope for template binding)
        scope.showArea = true;
        scope.showDots = false;
        scope.showGrid = true;
        scope.showTrendLine = false;
        scope.showEWMA = false;

        // Playback state
        scope.playbackMode = false;
        scope.playbackPlaying = false;
        scope.playbackIndex = 0;
        scope.playbackSpeed = 1000;
        scope.playbackTime = '';
        scope.playbackMaxSteps = 0;


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.toggleSidePanel = function () { scope.showSidePanel = !scope.showSidePanel; };

        // ── Time range ──

        scope.setTimeRange = function (range) {
            scope.timeRange = range;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setTimeRange', range);
        };

        // ── Series visibility ──

        scope.toggleSeries = function (key) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleSeries', key);
        };

        // ── Chart display options ──

        scope.setShowArea = function (v) {
            scope.showArea = v;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setShowArea', v);
        };

        scope.setShowDots = function (v) {
            scope.showDots = v;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setShowDots', v);
        };

        scope.setShowGrid = function (v) {
            scope.showGrid = v;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setShowGrid', v);
        };

        scope.toggleTrendLine = function () {
            scope.showTrendLine = !scope.showTrendLine;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleTrendLine');
        };

        scope.toggleEWMA = function () {
            scope.showEWMA = !scope.showEWMA;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleEWMA');
        };

        // ── Playback controls ──

        scope.enterPlayback = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('enterPlayback');
        };

        scope.exitPlayback = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exitPlayback');
        };

        scope.playbackPlay = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('playbackPlay');
        };

        scope.playbackPause = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('playbackPause');
        };

        scope.playbackStep = function (dir) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('playbackStep', dir);
        };

        scope.playbackSetSpeed = function (ms) {
            scope.playbackSpeed = ms;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('playbackSetSpeed', ms);
        };

        scope.onPlaybackSlider = function () {
            if (_widgetRef) {
                _widgetRef[WIDGET_NAME]('playbackPause');
                _widgetRef[WIDGET_NAME]('playbackStep', scope.playbackIndex - (_widgetRef[WIDGET_NAME]('option', '_playbackIndex') || 0));
            }
        };

        // ── Export ──

        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };

        // ── Redraw (e.g., on resize) ──

        scope.redraw = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('redraw');
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('chart:updated', function (payload) {
            scope.legendItems = payload.legendItems;
            scope.stats = payload.stats;
            scope.afConn = payload.afConn;
            scope.seriesCount = payload.seriesCount;
            scope.hiddenSeries = payload.hiddenSeries;
            scope.timeRange = payload.timeRange;
            scope.playbackMode = payload.playbackMode;
            scope.playbackPlaying = payload.playbackPlaying;
            scope.playbackIndex = payload.playbackIndex;
            scope.playbackSpeed = payload.playbackSpeed;
            scope.playbackTime = payload.playbackTime;
            scope.playbackMaxSteps = payload.playbackMaxSteps;
            scope.loading = false;
            scope.$applyAsync();
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#tc20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05D2\u05E8\u05E3 \u05DE\u05D2\u05DE\u05D5\u05EA \u05E8\u05D1-\u05E1\u05D3\u05E8\u05EA\u05D9'
        );

        if (_widgetRef) {
            _cleanup.widgets.trendchart = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                    { label: '\u05D8\u05D5\u05D5\u05D7 \u05D6\u05DE\u05DF', icon: '\u2261', action: function () { scope.setTimeRange('5m'); } },
                    { label: '\u05D4\u05E4\u05E2\u05DC\u05D4', icon: '\u25B6', action: function () { scope.enterPlayback(); } },
                    { label: '\u05D9\u05D9\u05E6\u05D5\u05D0 CSV', icon: '\u2B07', action: function () { scope.exportData(); } }
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


        // ══════════════════════════════════════════════
        //  RESIZE OBSERVER
        // ══════════════════════════════════════════════

        var _resizeDebounce = null;
        if (typeof ResizeObserver !== 'undefined') {
            var ro = new ResizeObserver(function () {
                if (_resizeDebounce) clearTimeout(_resizeDebounce);
                _resizeDebounce = setTimeout(function () {
                    if (_widgetRef) _widgetRef[WIDGET_NAME]('redraw');
                }, 150);
            });
            ro.observe(container);
            _cleanup.listeners.push({ off: function () { ro.disconnect(); } });
        }


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
            if (_resizeDebounce) clearTimeout(_resizeDebounce);
            bus.reset();
            PIV20.destroyHelper(_cleanup);
            scope.legendItems = null;
            scope.stats = null;
            scope.afConn = null;
            scope.hiddenSeries = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05D2\u05E8\u05E3 \u05DE\u05D2\u05DE\u05D5\u05EA v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-trendchart20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 200,
                Width: 800,
                Decimals: 2,
                panelOpen: false,
                // Titles
                Title: '\u05D2\u05E8\u05E3 \u05DE\u05D2\u05DE\u05D5\u05EA',
                // Chart
                refreshRate: 5,
                showTrend: true,
                StaleThreshold: 300,
                MaxAlerts: 50,
                // Sorting
                sortBy: 'name',
                sortDesc: false,
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 12,
                headerFontSize: 14,
                fontBold: false,
                fontItalic: false,
                // Colors
                headerBg: '#0A1628',
                rowBg: '#0F2940',
                altRowBg: '#0D1F35',
                goodColor: '#2ecc71',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                accentColor: '#5BC0EB',
                // Animation
                animationType: 'fade',
                animationSpeed: 300
            };
        },
        configTitle: '\u05D2\u05E8\u05E3 \u05DE\u05D2\u05DE\u05D5\u05EA',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
