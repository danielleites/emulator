/**
 * ================================================================
 *  sym-heatmap20.js  --  Heatmap v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Heatmap widget.
 *  Domain logic lives in piv20-plugins/piv20-heatmap.js.
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
 *    - piv20-heatmap.js       (jQuery widget plugin)
 *    - sym-heatmap20.css      (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'heatmap20';
    var WIDGET_NAME = 'piv20Heatmap';
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

        // Heatmap data (populated from widget via bus)
        scope.cells         = [];
        scope.calendarDays  = [];
        scope.calMin        = 0;
        scope.calMax        = 100;
        scope.stats         = {};
        scope.afConn        = null;
        scope.hasData       = false;
        scope.selectedCell  = null;
        scope.colorScheme   = 'thermal';
        scope.viewMode      = 'grid';
        scope.sortBy        = 'none';
        scope.showValues    = true;
        scope.showLabels    = true;

        // Playback state
        scope.playback      = false;
        scope.playPlaying   = false;
        scope.playIndex     = 0;
        scope.playTime      = '';
        scope.snapCount     = 0;

        // Color helper functions (injected via bus payload)
        scope.getColor     = function () { return '#0F2940'; };
        scope.getTextColor = function () { return '#fff'; };


        // ══════════════════════════════════════════════
        //  SCOPE METHODS (proxy to widget)
        // ══════════════════════════════════════════════

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };

        // ── View mode ──
        scope.setView = function (mode) {
            scope.viewMode = mode;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setViewMode', mode);
        };

        // ── Color scheme ──
        scope.setScheme = function (scheme) {
            scope.colorScheme = scheme;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setColorScheme', scheme);
        };

        // ── Sort ──
        scope.doSort = function (by) {
            scope.sortBy = by;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('sortBy', by);
        };

        // ── Cell selection ──
        scope.selectCell = function (idx) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('selectCell', idx);
        };

        // ── Toggle values/labels ──
        scope.doToggleValues = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleValues');
        };
        scope.doToggleLabels = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleLabels');
        };

        // ── Calendar bucket ──
        scope.setBucket = function (bucket) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('setBucket', bucket);
        };

        // ── Playback ──
        scope.enterPlayback = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('enterPlayback');
        };
        scope.exitPlayback = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exitPlayback');
        };
        scope.playStart = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('playStart');
        };
        scope.playPause = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('playPause');
        };
        scope.playStep = function (dir) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('playStep', dir);
        };
        scope.playSeek = function (idx) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('playSeek', parseInt(idx, 10));
        };

        // ── Export ──
        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };


        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('hm:updated', function (payload) {
            scope.cells         = payload.cells;
            scope.calendarDays  = payload.calendarDays;
            scope.calMin        = payload.calMin;
            scope.calMax        = payload.calMax;
            scope.stats         = payload.stats;
            scope.afConn        = payload.afConn;
            scope.hasData       = payload.hasData;
            scope.selectedCell  = payload.selectedCell;
            scope.colorScheme   = payload.colorScheme;
            scope.viewMode      = payload.viewMode;
            scope.sortBy        = payload.sortBy;
            scope.showValues    = payload.showValues;
            scope.showLabels    = payload.showLabels;
            // Playback
            scope.playback      = payload.playback;
            scope.playPlaying   = payload.playPlaying;
            scope.playIndex     = payload.playIndex;
            scope.playTime      = payload.playTime;
            scope.snapCount     = payload.snapCount;
            // Color functions
            if (payload.getColor)     scope.getColor     = payload.getColor;
            if (payload.getTextColor) scope.getTextColor  = payload.getTextColor;

            scope.loading = false;
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
            el, '#hm20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD \u05D9\u05D9\u05E6\u05D5\u05E8'
        );

        if (_widgetRef) {
            _cleanup.widgets.heatmap = { ref: _widgetRef, widgetName: WIDGET_NAME };
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
                    { label: '\u05EA\u05E8\u05DE\u05D9',  icon: '\u2588', action: function () { scope.setScheme('thermal'); } },
                    { label: '\u05D9\u05E8\u05D5\u05E7',   icon: '\u2588', action: function () { scope.setScheme('green'); } },
                    { label: '\u05DB\u05D7\u05D5\u05DC',    icon: '\u2588', action: function () { scope.setScheme('blue'); } }
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
            scope.cells        = null;
            scope.calendarDays = null;
            scope.stats        = null;
            scope.afConn       = null;
            scope.getColor     = null;
            scope.getTextColor = null;
        });
    };


    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-heatmap20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 450,
                Width: 600,
                Decimals: 2,
                panelOpen: false,
                // Heatmap
                ViewMode: 'grid',
                CalendarBucket: 'day',
                colorScheme: 'thermal',
                showValues: true,
                showLabels: true,
                sortBy: 'none',
                sortDesc: false,
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 13,
                headerFontSize: 16,
                fontBold: false,
                fontItalic: false,
                // Colors
                headerBg: '#1a2332',
                rowBg: '#0d1117',
                altRowBg: '#131a24',
                goodColor: '#2ecc71',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                accentColor: '#5bc0eb',
                // Animation
                animationType: 'fade',
                animationSpeed: 300,
                // AF
                StaleThreshold: 300
            };
        },
        configTitle: '\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
