/**
 * ================================================================
 *  sym-radar20.js  --  Radar Chart v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Radar Chart widget.
 *  Domain logic lives in piv20-plugins/piv20-radar.js.
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
 *    - piv20-radar.js         (jQuery widget plugin)
 *    - sym-radar20.css        (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'radar20';
    var WIDGET_NAME = 'piv20Radar';
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
        scope.errorMessage = '';

        // Radar data (populated from widget via bus)
        scope.items         = [];
        scope.filteredItems = [];
        scope.axes          = [];
        scope.series        = [];
        scope.hoverInfo     = null;
        scope.summary       = {};
        scope.afConn        = null;
        scope.hasData       = false;
        scope.overallScore  = 0;
        scope.grade         = { letter: '-', color: '#607D8B', label: '---' };
        scope.axisStats     = [];
        scope.balanceStatus = 'unknown';
        scope.balanceLabel  = '---';

        // View state
        scope.viewMode    = 'radar';
        scope.filterText  = '';
        scope.sortField   = '';
        scope.sortReverse = false;


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };

        // ── View mode ──
        scope.setView = function (mode) {
            scope.viewMode = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setViewMode', mode);
        };

        // ── Table sort / filter ──
        scope.sortBy = function (field) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('sortBy', field);
        };

        scope.onFilterChange = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setFilterText', scope.filterText);
        };

        scope.getFiltered = function () {
            return scope.filteredItems;
        };

        // ── Series legend toggle ──
        scope.toggleSeries = function (idx) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleSeries', idx);
        };

        // ── Export ──
        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };

        // ── Color helpers for template ──
        scope.getSeriesColor = function (idx) {
            var colors = ['#5BC0EB', '#2ECC71', '#F39C12', '#E74C3C', '#9B59B6', '#1ABC9C', '#E67E22', '#3498DB'];
            return colors[idx % colors.length];
        };

        scope.getNormColor = function (val) {
            if (val > 75) return 'var(--rd20-ok)';
            if (val > 45) return 'var(--rd20-warn)';
            return 'var(--rd20-crit)';
        };

        scope.getStatusColor = function (css) {
            var map = { 'rd20-ok': 'var(--rd20-ok)', 'rd20-warn': 'var(--rd20-warn)', 'rd20-crit': 'var(--rd20-crit)', 'rd20-off': 'var(--rd20-off)' };
            return map[css] || 'var(--rd20-text3)';
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('rd:updated', function (payload) {
            scope.items         = payload.items;
            scope.filteredItems = payload.filteredItems;
            scope.axes          = payload.axes;
            scope.series        = payload.series;
            scope.hoverInfo     = payload.hoverInfo;
            scope.summary       = payload.summary;
            scope.afConn        = payload.afConn;
            scope.hasData       = payload.hasData;
            scope.overallScore  = payload.overallScore;
            scope.grade         = payload.grade;
            scope.axisStats     = payload.axisStats;
            scope.balanceStatus = payload.balanceStatus;
            scope.balanceLabel  = payload.balanceLabel;
            scope.viewMode      = payload.viewMode;
            scope.filterText    = payload.filterText;
            scope.sortField     = payload.sortField;
            scope.sortReverse   = payload.sortReverse;
            scope.loading       = false;
            scope.errorMessage  = payload.items.length < 3 && payload.items.length > 0
                ? '\u05E0\u05D3\u05E8\u05E9\u05D9\u05DD \u05DC\u05E4\u05D7\u05D5\u05EA 3 \u05E6\u05D9\u05E8\u05D9\u05DD'
                : '';
            scope.$applyAsync();
        });

        bus.on('toast:show', function (t) {
            if (PIV20.ui && PIV20.ui.showToast) {
                PIV20.ui.showToast(container, t.msg, t.duration || 2500, t.level || 'info');
            }
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#rd20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05E8\u05D3\u05D0\u05E8 \u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.radar = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                    { label: '\u05E8\u05D3\u05D0\u05E8',    icon: '\u25CE', action: function () { scope.setView('radar'); } },
                    { label: '\u05D8\u05D1\u05DC\u05D4',     icon: '\u2261', action: function () { scope.setView('table'); } },
                    { label: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05D4', icon: '\u2582', action: function () { scope.setView('comparison'); } }
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
            scope.axes          = null;
            scope.series        = null;
            scope.hoverInfo     = null;
            scope.summary       = null;
            scope.afConn        = null;
            scope.axisStats     = null;
            scope.grade         = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05E8\u05D3\u05D0\u05E8 \u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-radar20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 400,
                Width: 400,
                Decimals: 1,
                panelOpen: false,
                // Radar
                Title: '\u05E8\u05D3\u05D0\u05E8 \u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD',
                NormalizeMode: 'auto',
                ManualMin: 0,
                ManualMax: 100,
                ShowGrid: true,
                ShowLabels: true,
                ShowValues: true,
                ShowScore: true,
                GridRings: 5,
                FillOpacity: 0.25,
                WarnThreshold: 0,
                CritThreshold: 0,
                AxisRanges: null,
                SeriesName: '',
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 12,
                headerFontSize: 14,
                fontBold: false,
                fontItalic: false,
                // Colors
                headerBg: '#0A1628',
                rowBg: '#0F2940',
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
        configTitle: '\u05E8\u05D3\u05D0\u05E8 \u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
