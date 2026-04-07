/**
 * ================================================================
 *  sym-trafficlight20.js  --  Traffic Light v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Traffic Light indicator.
 *  Domain logic lives in piv20-plugins/piv20-trafficlight.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  NOTE: This symbol uses DatasourceBehaviors.Single
 *        (single PI tag → one value indicator).
 *
 *  Dependencies:
 *    - piv20-core.js          (PIV20 namespace)
 *    - piv20-trafficlight.js  (jQuery widget plugin)
 *    - sym-trafficlight20.css (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'traflit20';
    var WIDGET_NAME = 'piv20Trafficlight';
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

        // Traffic light state (populated from widget via bus)
        scope.state = { name: '\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2', nameEn: 'Unknown', cls: 'off', shape: '\u25A0' };
        scope.currentValue = null;
        scope.currentLabel = '';
        scope.history = [];
        scope.afConn = null;
        scope.layout = scope.config.layout || 'vertical';
        scope.historyView = false;
        scope.showLabel = true;
        scope.thresholds = scope.config.thresholds || {};
        scope.adaptiveStats = null;


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.toggleSidePanel = function () { scope.showSidePanel = !scope.showSidePanel; };

        // ── Layout ──
        scope.setLayout = function (mode) {
            scope.layout = mode;
            scope.config.layout = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setLayout', mode);
        };

        // ── History ──
        scope.toggleHistory = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleHistory');
        };

        scope.clearHistory = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('clearHistory');
        };

        // ── Export ──
        scope.exportHistory = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('status:updated', function (payload) {
            scope.state = payload.state;
            scope.currentValue = payload.value;
            scope.currentLabel = payload.label;
            scope.history = payload.history;
            scope.afConn = payload.afConn;
            scope.layout = payload.layout;
            scope.historyView = payload.historyView;
            scope.showLabel = payload.showLabel;
            scope.thresholds = payload.thresholds;
            scope.adaptiveStats = payload.adaptiveStats;
            scope.loading = false;
            scope.$applyAsync();
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#tl20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05E8\u05DE\u05D6\u05D5\u05E8 \u05DE\u05E6\u05D1\u05D9\u05DD \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.trafficlight = { ref: _widgetRef, widgetName: WIDGET_NAME };
        }


        // ══════════════════════════════════════════════
        //  PIV10 SHARED INFRA (optional)
        // ══════════════════════════════════════════════

        if (P && P.initSymbol) {
            P.initSymbol(scope, el, {
                name: SYM_NAME,
                onTagDrop: function (path) {
                    scope.symbol.DataSources = [path];
                    if (P.tagContainer) P.tagContainer.register(scope, path, '', '');
                },
                onExport: function () { scope.exportHistory(); }
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
            scope.state = null;
            scope.history = null;
            scope.afConn = null;
            scope.adaptiveStats = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05E8\u05DE\u05D6\u05D5\u05E8 \u05DE\u05E6\u05D1\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Single,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-trafficlight20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 480,
                Width: 400,
                Decimals: 2,
                panelOpen: false,
                layout: 'vertical',
                showLabel: true,
                // EE-7: Dual threshold support
                thresholds: {
                    mode: 'high_only',
                    warn: 50, crit: 80,
                    warnLo: 0, critLo: 0
                },
                // R10: Adaptive thresholds
                AdaptiveThresholds: false,
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
        configTitle: '\u05E8\u05DE\u05D6\u05D5\u05E8 \u05DE\u05E6\u05D1\u05D9\u05DD',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
