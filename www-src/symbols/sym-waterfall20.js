/**
 * ================================================================
 *  sym-waterfall20.js  --  Waterfall Chart v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Waterfall Chart.
 *  Domain logic lives in piv20-plugins/piv20-waterfall.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js          (PIV20 namespace)
 *    - piv20-waterfall.js     (jQuery widget plugin)
 *    - sym-waterfall20.css    (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'waterfall20';
    var WIDGET_NAME = 'piv20Waterfall';
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

        // Waterfall data (populated from widget via bus)
        scope.items          = [];
        scope.filteredItems  = [];
        scope.waterfallBars  = [];
        scope.summary        = {};
        scope.stats          = {};
        scope.afConn         = null;
        scope.hasData        = false;

        // View state
        scope.viewMode    = 'waterfall'; // waterfall | table | compact
        scope.filterText  = '';
        scope.sortField   = '';
        scope.sortReverse = false;
        scope.hoveredBar  = -1;
        scope.selectedBar = -1;
        scope.tooltip     = { visible: false, x: 0, y: 0 };


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };

        // ── View mode ──
        scope.setView = function (mode) {
            scope.viewMode = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setViewMode', mode);
        };

        // ── Table sort/filter ──
        scope.sortBy = function (field) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('sortBy', field);
        };

        scope.onFilterChange = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setFilterText', scope.filterText);
        };

        scope.getFiltered = function () {
            return scope.filteredItems;
        };

        // ── Canvas interaction ──
        scope._onCanvasMove = function (evt) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('onCanvasMove', evt);
        };
        scope._onCanvasLeave = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('onCanvasLeave');
        };
        scope._onCanvasClick = function (evt) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('onCanvasClick', evt);
        };

        // ── Export ──
        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('wf:updated', function (payload) {
            scope.items         = payload.items;
            scope.filteredItems = payload.filteredItems;
            scope.waterfallBars = payload.waterfallBars;
            scope.summary       = payload.summary;
            scope.stats         = payload.stats;
            scope.afConn        = payload.afConn;
            scope.hasData       = payload.hasData;
            scope.viewMode      = payload.viewMode;
            scope.filterText    = payload.filterText;
            scope.sortField     = payload.sortField;
            scope.sortReverse   = payload.sortReverse;
            scope.hoveredBar    = payload.hoveredBar;
            scope.selectedBar   = payload.selectedBar;
            scope.tooltip       = payload.tooltip;
            scope.loading       = false;
            scope.$applyAsync();
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#wf20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05DE\u05E4\u05DC \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.waterfall = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                    { label: '\u05DE\u05E4\u05DC',   icon: '\u25A8', action: function () { scope.setView('waterfall'); } },
                    { label: '\u05D8\u05D1\u05DC\u05D4', icon: '\u2261', action: function () { scope.setView('table'); } },
                    { label: '\u05EA\u05E7\u05E6\u05D9\u05E8', icon: '\u2582', action: function () { scope.setView('compact'); } }
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
            scope.items         = null;
            scope.filteredItems = null;
            scope.waterfallBars = null;
            scope.summary       = null;
            scope.stats         = null;
            scope.afConn        = null;
            scope.tooltip       = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05DE\u05E4\u05DC \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-waterfall20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 350,
                Width: 650,
                Decimals: 1,
                panelOpen: false,
                // Waterfall
                Title: '\u05DE\u05E4\u05DC \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD',
                BaseValue: 0,
                ShowConnectors: true,
                ShowLabels: true,
                ShowTotal: true,
                PositiveColor: '#2ECC71',
                NegativeColor: '#E74C3C',
                TotalColor: '#5BC0EB',
                BaseColor: '#8BACC4',
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 12,
                headerFontSize: 14,
                fontBold: false,
                fontItalic: false,
                // Colors
                headerBg: '#0A1628',
                rowBg: '#0F2940',
                // Animation
                animationType: 'fade',
                animationSpeed: 300,
                // AF
                StaleThreshold: 300
            };
        },
        configTitle: '\u05DE\u05E4\u05DC \u05E9\u05D9\u05E0\u05D5\u05D9\u05D9\u05DD',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
