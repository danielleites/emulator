/**
 * ================================================================
 *  sym-dataexport20.js  --  Data Export v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Data Export panel.
 *  Domain logic lives in piv20-plugins/piv20-dataexport.js.
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
 *    - piv20-dataexport.js      (jQuery widget plugin)
 *    - sym-dataexport20.css     (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'dataexport20';
    var WIDGET_NAME = 'piv20Dataexport';
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
        scope.currentValues = [];
        scope.recording = false;
        scope.records = [];
        scope.recordCount = 0;
        scope.maxRecords = 5000;
        scope.snapshots = [];
        scope.snapshotCount = 0;
        scope.viewTab = 'live';
        scope.afConn = null;
        scope.autoExport = false;
        scope.autoExportCount = 100;


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.toggleSidePanel = function () { scope.showSidePanel = !scope.showSidePanel; };

        // ── Tab switching ──
        scope.setTab = function (tab) {
            scope.viewTab = tab;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setViewTab', tab);
        };

        // ── Recording ──
        scope.startRecording = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('startRecording');
        };
        scope.stopRecording = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('stopRecording');
        };
        scope.clearRecords = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('clearRecords');
        };

        // ── Snapshots ──
        scope.takeSnapshot = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('takeSnapshot');
        };
        scope.deleteSnapshot = function (idx) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('deleteSnapshot', idx);
        };

        // ── Export ──
        scope.exportLive = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportLive');
        };
        scope.exportRecords = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportRecords');
        };
        scope.exportSnapshot = function (idx) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportSnapshot', idx);
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('export:updated', function (payload) {
            scope.currentValues = payload.currentValues;
            scope.recording = payload.recording;
            scope.records = payload.records;
            scope.recordCount = payload.recordCount;
            scope.maxRecords = payload.maxRecords;
            scope.snapshots = payload.snapshots;
            scope.snapshotCount = payload.snapshotCount;
            scope.viewTab = payload.viewTab;
            scope.afConn = payload.afConn;
            scope.autoExport = payload.autoExport;
            scope.autoExportCount = payload.autoExportCount;
            scope.loading = false;
            scope.$applyAsync();
        });


        // ══════════════════════════════════════════════
        //  WIDGET INIT
        // ══════════════════════════════════════════════

        var _widgetRef = PIV20.safeWidget(
            el, '#dx20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05D9\u05D9\u05E6\u05D5\u05D0 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.dataexport = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                onExport: function () { scope.exportLive(); },
                contextMenuItems: [
                    { label: '\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05D7\u05D9\u05D9\u05DD', icon: '\u05D7', action: function () { scope.setTab('live'); } },
                    { label: '\u05E8\u05E9\u05D5\u05DE\u05D5\u05EA', icon: '\u23FA', action: function () { scope.setTab('records'); } },
                    { label: '\u05E6\u05D9\u05DC\u05D5\u05DE\u05D9\u05DD', icon: '\u05E6', action: function () { scope.setTab('snapshots'); } }
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
            scope.currentValues = null;
            scope.records = null;
            scope.snapshots = null;
            scope.afConn = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05D9\u05D9\u05E6\u05D5\u05D0 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-dataexport20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 450,
                Width: 600,
                Decimals: 2,
                panelOpen: false,
                // Recording
                maxRecords: 5000,
                autoExport: false,
                autoExportCount: 100,
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
        configTitle: '\u05D9\u05D9\u05E6\u05D5\u05D0 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
