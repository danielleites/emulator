/**
 * ================================================================
 *  sym-reserveindicator20.js  --  Reserve Indicator v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Reserve Capacity Indicator.
 *  Domain logic lives in piv20-plugins/piv20-reserveindicator.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js                  (PIV20 namespace)
 *    - piv20-reserveindicator.js      (jQuery widget plugin)
 *    - sym-reserveindicator20.css     (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'resrvind20';
    var WIDGET_NAME = 'piv20ReserveIndicator';
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

        // Reserve values
        scope.available = 0;  scope.demand = 0;  scope.spinning = 0; scope.largestUnit = 0;
        scope.planningReserve = 0; scope.marginPct = 0; scope.marginDisplay = '---';
        scope.availableDisplay = '---'; scope.demandDisplay = '---';
        scope.spinningDisplay = '---'; scope.planningReserveDisplay = '---';
        scope.stage = { key: 'adequate', label: '\u05EA\u05E7\u05D9\u05DF', labelEn: 'Adequate', color: '#2ECC71', css: 'ri20-stage-adequate' };

        // N-1
        scope.n1Pass = true; scope.n1Gap = 0; scope.n1GapDisplay = '---';

        // Tank
        scope.tankFill = 0; scope.spinFill = 0; scope.quickFill = 0; scope.coldFill = 0;

        // History
        scope.marginHistory = []; scope.alertEvents = [];

        // Stats
        scope.stats = { current: '---', min: '---', max: '---', avg: '---', stddev: '---', hoursBelowMin: 0, worst24h: '---' };

        // Sparkline
        scope.sparkPath = ''; scope.sparkTrendPath = ''; scope.sparkEwmaPath = '';

        // Forecast
        scope.forecast = { toMonitor: '---', toAlert: '---', toEmergency: '---', slope: 0, slopeDisplay: '---', direction: 'stable' };

        // Connection
        scope.connSummary = null; scope.afConn = null; scope.hasData = false;

        // View
        scope.viewMode = 'gauge';


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };

        scope.setView = function (mode) {
            scope.viewMode = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setViewMode', mode);
        };

        scope.clearAlerts = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('clearAlerts');
        };

        scope.getStageProgress = function () {
            if (_widgetRef) return _widgetRef[WIDGET_NAME]('getStageProgress');
            var c = scope.config, p = scope.marginPct;
            if (p >= c.AdequatePct)  return 100;
            if (p >= c.MonitorPct)   return 75;
            if (p >= c.AlertPct)     return 50;
            if (p >= c.EmergencyPct) return 25;
            return 5;
        };

        scope.getTankColor = function () {
            return scope.stage ? scope.stage.color : (scope.config.accentColor || '#5BC0EB');
        };

        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('ri:updated', function (payload) {
            // Reserve values
            scope.available           = payload.available;
            scope.demand              = payload.demand;
            scope.spinning            = payload.spinning;
            scope.largestUnit         = payload.largestUnit;
            scope.planningReserve     = payload.planningReserve;
            scope.marginPct           = payload.marginPct;
            scope.marginDisplay       = payload.marginDisplay;
            scope.availableDisplay    = payload.availableDisplay;
            scope.demandDisplay       = payload.demandDisplay;
            scope.spinningDisplay     = payload.spinningDisplay;
            scope.planningReserveDisplay = payload.planningReserveDisplay;
            scope.stage               = payload.stage;

            // N-1
            scope.n1Pass       = payload.n1Pass;
            scope.n1Gap        = payload.n1Gap;
            scope.n1GapDisplay = payload.n1GapDisplay;

            // Tank
            scope.tankFill  = payload.tankFill;
            scope.spinFill  = payload.spinFill;
            scope.quickFill = payload.quickFill;
            scope.coldFill  = payload.coldFill;

            // History
            scope.marginHistory = payload.marginHistory;
            scope.alertEvents   = payload.alertEvents;

            // Stats
            scope.stats = payload.stats;

            // Sparkline
            scope.sparkPath      = payload.sparkPath;
            scope.sparkTrendPath = payload.sparkTrendPath;
            scope.sparkEwmaPath  = payload.sparkEwmaPath;

            // Forecast
            scope.forecast = payload.forecast;

            // Connection
            scope.connSummary = payload.connSummary;
            scope.afConn      = payload.afConn;
            scope.hasData     = payload.hasData;

            // View
            scope.viewMode = payload.viewMode;

            scope.loading = false;
            scope.$applyAsync();
        });

        bus.on('toast:show', function (o) {
            PIV20.ui.showToast(container, o.msg, o.duration || 2000, o.style || 'info');
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#ri20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05DE\u05D3 \u05E2\u05EA\u05D5\u05D3\u05D4 \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.reserve = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                    { label: '\u05DC\u05D5\u05D7',   icon: '\u25A8', action: function () { scope.setView('gauge'); } },
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
            scope.marginHistory = null;
            scope.alertEvents   = null;
            scope.stats         = null;
            scope.forecast      = null;
            scope.connSummary   = null;
            scope.afConn        = null;
            scope.stage         = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05E2\u05EA\u05D5\u05D3\u05D4 \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-reserveindicator20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 400,
                Width: 350,
                Decimals: 1,
                panelOpen: false,
                // Reserve
                Title: '\u05E2\u05EA\u05D5\u05D3\u05D4 \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA',
                AdequatePct: 20,
                MonitorPct: 15,
                AlertPct: 10,
                EmergencyPct: 5,
                LargestUnitMW: 575,
                ShowN1: true,
                ShowTrend: true,
                ShowForecast: true,
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 12,
                headerFontSize: 14,
                fontBold: false,
                fontItalic: false,
                // Colors
                goodColor: '#2ECC71',
                warningColor: '#F39C12',
                criticalColor: '#E74C3C',
                accentColor: '#5BC0EB',
                headerBg: '#0A1628',
                rowBg: '#0F2940',
                // Animation
                animationType: 'fade',
                animationSpeed: 300,
                // AF
                StaleThreshold: 300
            };
        },
        configTitle: '\u05E2\u05EA\u05D5\u05D3\u05D4 \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9\u05EA',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
