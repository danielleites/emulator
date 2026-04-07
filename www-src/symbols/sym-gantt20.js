/**
 * ================================================================
 *  sym-gantt20.js  --  Gantt Card Grid v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Gantt Card Grid panel.
 *  Domain logic lives in piv20-plugins/piv20-gantt.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js        (PIV20 namespace)
 *    - piv20-gantt.js       (jQuery widget plugin)
 *    - sym-gantt20.css      (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'gantt20';
    var WIDGET_NAME = 'piv20Gantt';
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

        // Data (populated from widget via bus)
        scope.items = [];
        scope.filteredItems = [];
        scope.summary = { total: 0, ok: 0, warn: 0, crit: 0, off: 0, avg: 0, max: 0, sum: 0 };
        scope.stats = null;
        scope.afConn = null;
        scope.viewMode = 'cards';
        scope.sortField = 'value';
        scope.sortDesc = true;
        scope.searchText = '';
        scope.maxVal = 0;


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.toggleSidePanel = function () { scope.showSidePanel = !scope.showSidePanel; };

        // ── View mode ──
        scope.setView = function (mode) {
            scope.viewMode = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setViewMode', mode);
        };

        // ── Search ──
        scope.onSearchChange = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setFilterText', scope.searchText);
        };

        // ── Sort ──
        scope.sortBy = function (field) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setSortField', field);
        };

        // ── Export ──
        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };

        // ── Helpers for template ──
        scope.getStatusColors = function (status) {
            if (_widgetRef) return _widgetRef[WIDGET_NAME]('getStatusColors', status);
            return { bg: 'transparent', fg: '#ccc', bar: '#ccc' };
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('gantt:updated', function (payload) {
            scope.items = payload.items;
            scope.filteredItems = payload.filtered;
            scope.summary = payload.summary;
            scope.stats = payload.stats;
            scope.afConn = payload.afConn;
            scope.viewMode = payload.viewMode;
            scope.sortField = payload.sortField;
            scope.sortDesc = payload.sortDesc;
            scope.maxVal = payload.maxVal;
            scope.loading = false;
            scope.$applyAsync();
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#gt20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05EA\u05E8\u05E9\u05D9\u05DD \u05D2\u05E0\u05D8 \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.gantt = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                    { label: '\u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05DD', icon: '\u2B1C', action: function () { scope.setView('cards'); } },
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
            scope.filteredItems = null;
            scope.summary = null;
            scope.stats = null;
            scope.afConn = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05EA\u05E8\u05E9\u05D9\u05DD \u05D2\u05E0\u05D8 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-gantt20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 400,
                Width: 800,
                Decimals: 2,
                Title: '\u05EA\u05E8\u05E9\u05D9\u05DD \u05D2\u05E0\u05D8',
                // Thresholds
                WarnThreshold: 0,
                CritThreshold: 0,
                // Display
                ShowToday: true,
                BarHeight: 24,
                GroupBy: 'site',
                // Sort
                sortBy: 'value',
                sortDesc: true,
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 12,
                headerFontSize: 14,
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
        configTitle: '\u05EA\u05E8\u05E9\u05D9\u05DD \u05D2\u05E0\u05D8',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
