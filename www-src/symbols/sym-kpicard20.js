/**
 * ================================================================
 *  sym-kpicard20.js  --  KPI Card Dashboard v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the KPI Card Dashboard.
 *  Domain logic lives in piv20-plugins/piv20-kpicard.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js      (PIV20 namespace)
 *    - piv20-kpicard.js   (jQuery widget plugin)
 *    - sym-kpicard20.css  (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'kpicard20';
    var WIDGET_NAME = 'piv20Kpicard';
    var THROTTLE_MS = 1000;

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
        scope.liveTime = PIV20.fmt.time();
        scope.viewMode = 'cards';       // cards | list | detail
        scope.expandedIdx = -1;
        scope.cards = [];
        scope.summary = { total: 0, ok: 0, warn: 0, crit: 0, bad: 0, message: '' };
        scope.activeFilter = 'all';

        // ── Scope methods ──

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };

        scope.setView = function (mode) {
            scope.viewMode = mode;
            if (mode !== 'detail') scope.expandedIdx = -1;
            bus.emit('view:changed', mode);
        };

        scope.expandCard = function (idx) {
            scope.expandedIdx = idx;
            scope.viewMode = 'detail';
        };

        scope.collapseDetail = function () {
            scope.expandedIdx = -1;
            scope.viewMode = 'cards';
        };

        scope.setFilter = function (filter) {
            scope.activeFilter = filter;
            if (_widgetRef) {
                _widgetRef[WIDGET_NAME]('setFilter', filter);
            }
        };

        scope.exportData = function () {
            if (_widgetRef) {
                _widgetRef[WIDGET_NAME]('exportCSV');
            }
        };

        scope.getFilteredCards = function () {
            if (!_widgetRef) return scope.cards;
            return _widgetRef[WIDGET_NAME]('getFilteredCards');
        };

        // ── Listen for processed cards from widget ──
        bus.on('cards:processed', function (payload) {
            scope.cards = payload.cards;
            scope.summary = payload.summary;
            scope.$applyAsync();
        });

        // ── Init widget ──
        var _widgetRef = PIV20.safeWidget(
            el, '#kpi20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05DC\u05D5\u05D7 \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9 KPI'
        );

        if (_widgetRef) {
            _cleanup.widgets.kpicard = { ref: _widgetRef, widgetName: WIDGET_NAME };
        }

        // ── PIV10 shared infra wire-up ──
        if (P && P.initSymbol) {
            P.initSymbol(scope, el, {
                name: SYM_NAME,
                onTagDrop: function (path) {
                    scope.symbol.DataSources.push(path);
                    if (P.tagContainer) P.tagContainer.register(scope, path, '', '');
                },
                onExport: function () { scope.exportData(); },
                contextMenuItems: [
                    { label: '\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05DD', icon: '\u25A6', action: function () { scope.setView('cards'); } },
                    { label: '\u05E8\u05E9\u05D9\u05DE\u05D4', icon: '\u2630', action: function () { scope.setView('list'); } }
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
            // Update widget's config reference
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
            scope.cards = null;
            scope.summary = null;
        });
    };

    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05DC\u05D5\u05D7 \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9 KPI v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-kpicard20-icon.png',
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
                Title: '\u05DE\u05D3\u05D3\u05D9 KPI',
                Unit: '',
                // Card layout
                CardSize: 'medium',
                // Thresholds
                WarnThreshold: 0,
                CritThreshold: 0,
                ThresholdMode: 'high',
                // Feature toggles
                ShowSparkline: true,
                ShowTrend: true,
                ShowDelta: true,
                ShowMinMax: true,
                ShowStats: false,
                SparklinePoints: 60,
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 12,
                headerFontSize: 14,
                fontBold: false,
                fontItalic: false,
                valueFontSize: 36,
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
                StaleThreshold: 300
            };
        },
        configTitle: '\u05DC\u05D5\u05D7 \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9 KPI',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
