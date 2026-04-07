/**
 * ================================================================
 *  sym-alertpanel20.js  --  ISA-18.2 Alert Panel v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Alert Panel.
 *  Domain logic lives in piv20-plugins/piv20-alertpanel.js.
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
 *    - piv20-alertpanel.js    (jQuery widget plugin)
 *    - sym-alertpanel20.css   (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'alertpanel20';
    var WIDGET_NAME = 'piv20Alertpanel';
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
        scope.liveTime = PIV20.fmt.time();
        scope.viewMode = 'panel';        // panel | summary | history
        scope.loading = true;

        // Alarm display state (populated from widget via bus)
        scope.alarms = [];
        scope.alarmHistory = [];
        scope.summary = {
            total: 0, critical: 0, warning: 0, info: 0,
            unack: 0, shelved: 0, oldestUnackDuration: '---'
        };
        scope.stats = {
            alarmRate: '0', mostFrequent: '---', avgAckTime: '---', standing: 0
        };
        scope.hasUnackCritical = false;
        scope.afConn = null;

        // Filter state
        scope.filterPriority = 'all';
        scope.filterState = 'all';
        scope.filterText = '';


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };

        scope.setView = function (mode) {
            scope.viewMode = mode;
            bus.emit('view:changed', mode);
        };

        // ── Alarm actions ──

        scope.ackAlarm = function (idx) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('ackAlarm', idx);
        };

        scope.ackAll = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('ackAll');
        };

        scope.shelveAlarm = function (idx) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('shelveAlarm', idx);
        };

        scope.clearResolved = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('clearResolved');
        };

        // ── Filtering ──

        scope.setFilterPriority = function (p) {
            scope.filterPriority = p;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setFilterPriority', p);
        };

        scope.setFilterState = function (s) {
            scope.filterState = s;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setFilterState', s);
        };

        scope.onFilterTextChange = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setFilterText', scope.filterText);
        };

        scope.getFiltered = function () {
            if (!_widgetRef) return scope.alarms;
            return _widgetRef[WIDGET_NAME]('getFiltered');
        };

        scope.getFilteredHistory = function () {
            if (!_widgetRef) return scope.alarmHistory;
            return _widgetRef[WIDGET_NAME]('getFilteredHistory');
        };

        // ── Export ──

        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('alarm:updated', function (payload) {
            scope.alarms = payload.alarms;
            scope.alarmHistory = payload.alarmHistory;
            scope.summary = payload.summary;
            scope.stats = payload.stats;
            scope.hasUnackCritical = payload.hasUnackCritical;
            scope.afConn = payload.afConn;
            scope.loading = false;
            scope.$applyAsync();
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#ap20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05DC\u05D5\u05D7 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA ISA-18.2'
        );

        if (_widgetRef) {
            _cleanup.widgets.alertpanel = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                    { label: '\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA', icon: '\u26A0', action: function () { scope.setView('panel'); } },
                    { label: '\u05E1\u05D9\u05DB\u05D5\u05DD',  icon: '\u2261', action: function () { scope.setView('summary'); } },
                    { label: '\u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D4', icon: '\u23F0', action: function () { scope.setView('history'); } }
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
            scope.alarms = null;
            scope.alarmHistory = null;
            scope.summary = null;
            scope.stats = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05DC\u05D5\u05D7 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA ISA-18.2 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-alertpanel20-icon.png',
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
                Title: '\u05DC\u05D5\u05D7 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA',
                // Thresholds
                DefaultWarnThreshold: 0,
                DefaultCritThreshold: 0,
                ThresholdMode: 'high',
                MaxAlarms: 100,
                // ISA-18.2
                DebounceSeconds: 5,
                ShelveDurationMinutes: 30,
                AutoAckOnRTN: false,
                MaxHistory: 200,
                // Display toggles
                ShowTimestamp: true,
                ShowDuration: true,
                ShowValue: true,
                ShowAlerts: true,
                StaleThreshold: 300,
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
                animationSpeed: 300
            };
        },
        configTitle: '\u05DC\u05D5\u05D7 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA ISA-18.2',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
