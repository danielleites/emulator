/**
 * ================================================================
 *  sym-comparison20.js  --  Comparison v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for bar comparison & statistics.
 *  Domain logic lives in piv20-plugins/piv20-comparison.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js            (PIV20 namespace)
 *    - piv20-comparison.js      (jQuery widget plugin)
 *    - sym-comparison20.css     (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'comparison20';
    var WIDGET_NAME = 'piv20Comparison';
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

        // Comparison data (populated from widget via bus)
        scope.items = [];
        scope.compStats = { mean: 0, stddev: 0, min: 0, max: 0, spread: 0, cv: 0 };
        scope.viewMode = 'bars';
        scope.baselineMode = 'first';
        scope.baseline = 0;
        scope.maxValue = 100;
        scope.sortBy = 'name';
        scope.afConn = null;


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.toggleSidePanel = function () { scope.showSidePanel = !scope.showSidePanel; };

        // ── View mode ──
        scope.setView = function (mode) {
            scope.viewMode = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setView', mode);
        };

        // ── Baseline mode ──
        scope.setBaseline = function (mode) {
            scope.baselineMode = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setBaseline', mode);
        };

        // ── Sort ──
        scope.setSortBy = function (by) {
            scope.sortBy = by;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setSortBy', by);
        };

        // ── Export ──
        scope.exportCSV = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };

        scope.copyToClipboard = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('copyToClipboard');
        };

        // ── Diff helpers (delegate to widget) ──
        scope.getDiff = function (val) {
            if (_widgetRef && _widgetRef.data && _widgetRef.data(WIDGET_NAME)) {
                return _widgetRef[WIDGET_NAME]('getDiff', val);
            }
            return { abs: 0, pct: 0 };
        };

        scope.getBarColor = function (idx) {
            if (_widgetRef && _widgetRef.data && _widgetRef.data(WIDGET_NAME)) {
                return _widgetRef[WIDGET_NAME]('getBarColor', idx);
            }
            var colors = ['#5BC0EB', '#2ECC71', '#F39C12', '#E74C3C', '#9B59B6', '#1ABC9C', '#E67E22', '#3498DB'];
            return colors[idx % colors.length];
        };

        scope.getBarWidth = function (val) {
            if (!scope.maxValue) return '0%';
            return (Math.abs(val) / scope.maxValue * 100) + '%';
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('comparison:updated', function (payload) {
            scope.items = payload.items;
            scope.compStats = payload.compStats;
            scope.viewMode = payload.viewMode;
            scope.baselineMode = payload.baselineMode;
            scope.baseline = payload.baseline;
            scope.maxValue = payload.maxValue;
            scope.sortBy = payload.sortBy;
            scope.afConn = payload.afConn;
            scope.loading = false;
            scope.$applyAsync();
        });

        bus.on('toast:show', function (msg) {
            PIV20.ui.showToast(container, msg);
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#cp20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05D4\u05E9\u05D5\u05D5\u05D0\u05D4 \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.comparison = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                onExport: function () { scope.exportCSV(); },
                contextMenuItems: [
                    { label: '\u05E2\u05DE\u05D5\u05D3\u05D5\u05EA', icon: '\u2587', action: function () { scope.setView('bars'); } },
                    { label: '\u05D8\u05D1\u05DC\u05D4', icon: '\u2261', action: function () { scope.setView('table'); } }
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
            scope.items = null;
            scope.compStats = null;
            scope.afConn = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05D4 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-comparison20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 450,
                Width: 700,
                Decimals: 2,
                panelOpen: false,
                // Baseline
                baselineMode: 'first',
                // View
                viewMode: 'bars',
                // Sort
                sortBy: 'name',
                sortDesc: false,
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 13,
                headerFontSize: 16,
                fontBold: false,
                fontItalic: false,
                // Colors
                headerBg: '#0A1628',
                rowBg: '#0F2940',
                altRowBg: '#12122b',
                goodColor: '#2ecc71',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                accentColor: '#5BC0EB',
                // Animation
                animationType: 'fade',
                animationSpeed: 300,
                // AF
                StaleThreshold: 300
            };
        },
        configTitle: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05D4',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
