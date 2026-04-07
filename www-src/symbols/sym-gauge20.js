/**
 * ================================================================
 *  sym-gauge20.js  --  Performance Gauge v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the SVG performance gauge.
 *  Domain logic lives in piv20-plugins/piv20-gauge.js.
 *
 *  Responsibilities:
 *    - PI Vision symbol registration (catalog, config, lifecycle)
 *    - AngularJS scope binding (view state, methods)
 *    - Create bus + init widget via PIV20.safeWidget
 *    - Route dataUpdate / configChange to widget via bus
 *    - $destroy cleanup via PIV20.destroyHelper
 *
 *  Dependencies:
 *    - piv20-core.js       (PIV20 namespace)
 *    - piv20-gauge.js      (jQuery widget plugin)
 *    - sym-gauge20.css     (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'gauge20';
    var WIDGET_NAME = 'piv20Gauge';
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
        var lastProcessTime = 0;

        // ── Create per-instance bus ──
        var bus = PIV20.createBus();

        // ── Scope defaults ──
        scope.gauges = [];
        scope.filteredGauges = [];
        scope.gaugeMin = scope.config.GaugeMin || 0;
        scope.gaugeMax = scope.config.GaugeMax || 100;
        scope.engUnit = scope.config.EngineeringUnit || '';
        scope.viewMode = scope.config.viewMode || 'gauges';
        scope.showTarget = scope.config.ShowTarget !== false;
        scope.targetValue = scope.config.TargetValue || 0;
        scope.targetPos = { x: 100, y: 100 };
        scope.afConn = null;
        scope.liveTime = '--:--:--';
        scope.showGearModal = false;
        scope.gearUnit = null;
        scope.searchText = '';
        scope.copySuccess = false;
        scope.hasHidden = false;
        scope.hiddenGauges = {};
        scope.showSidePanel = false;

        // ── Widget init ──
        var widgetEl = container.querySelector('#ga20-widget') || container;
        var widget = PIV20.safeWidget(widgetEl, WIDGET_NAME, {
            bus: bus,
            config: scope.config,
            demoMode: false
        }, SYM_NAME);

        // ══════════════════════════════════════════════
        //  BUS → SCOPE BINDING
        // ══════════════════════════════════════════════

        bus.on('gauge:updated', function (state) {
            scope.$applyAsync(function () {
                scope.gauges = state.gauges;
                scope.filteredGauges = state.filtered;
                scope.gaugeMin = state.gaugeMin;
                scope.gaugeMax = state.gaugeMax;
                scope.engUnit = state.engUnit;
                scope.viewMode = state.viewMode;
                scope.showTarget = state.showTarget;
                scope.targetValue = state.targetValue;
                scope.targetPos = state.targetPos;
                scope.afConn = state.afConn;
                scope.liveTime = state.liveTime;
                scope.gearUnit = state.gearUnit;
                scope.showGearModal = state.showGearModal;
                scope.hasHidden = state.hasHidden;
                scope.hiddenGauges = state.hiddenGauges;
            });
        });

        bus.on('toast:show', function (data) {
            scope.$applyAsync(function () {
                scope.copySuccess = true;
            });
            setTimeout(function () {
                scope.$applyAsync(function () { scope.copySuccess = false; });
            }, 2000);
        });

        // ══════════════════════════════════════════════
        //  SCOPE → WIDGET PROXIES
        // ══════════════════════════════════════════════

        scope.setView = function (v) {
            if (widget) widget.setView(v);
        };

        scope.onSearchChange = function () {
            if (widget) widget.onSearchChange(scope.searchText);
        };

        scope.toggleGaugeVisibility = function (key) {
            if (widget) widget.toggleGaugeVisibility(key);
        };

        scope.openGear = function (gauge) {
            if (widget) widget.openGear(gauge);
        };

        scope.closeGearModal = function () {
            if (widget) widget.closeGearModal();
        };

        scope.exportCSV = function () {
            if (widget) widget.exportCSV();
        };

        scope.copyToClipboard = function () {
            if (widget) widget.copyToClipboard();
        };

        scope.toggleSidePanel = function () {
            scope.showSidePanel = !scope.showSidePanel;
        };

        // SVG helpers (proxied so template can call them)
        scope.getGaugeArc = function (val) {
            return widget ? widget.getGaugeArc(val) : '';
        };

        scope.getGaugeColor = function (val) {
            return widget ? widget.getGaugeColor(val) : '#ccc';
        };

        scope.getTrackArc = function () {
            return widget ? widget.getTrackArc() : '';
        };

        scope.getTargetPos = function () {
            return widget ? widget.getTargetPos() : { x: 100, y: 100 };
        };

        // ══════════════════════════════════════════════
        //  PI VISION LIFECYCLE
        // ══════════════════════════════════════════════

        this.onDataUpdate = PIV20.shield.wrap(SYM_NAME, 'onDataUpdate', function (data) {
            var now = Date.now();
            if (now - lastProcessTime < THROTTLE_MS) return;
            lastProcessTime = now;
            if (data && data.Rows) {
                bus.emit('data:updated', { rows: data.Rows });
            }
        });

        this.onConfigChange = PIV20.shield.wrap(SYM_NAME, 'onConfigChange', function (changes) {
            bus.emit('config:changed', scope.config);
        });

        // ── Cleanup ──
        PIV20.destroyHelper(scope, bus, widget, SYM_NAME);
    };

    // ══════════════════════════════════════════════
    //  REGISTRATION
    // ══════════════════════════════════════════════

    var def = {
        typeName: SYM_NAME,
        displayName: '\u05DE\u05D3 \u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD v20',  // מד ביצועים v20
        description: '\u05DE\u05D3 SVG \u05DE\u05EA\u05E7\u05D3\u05DD \u05E2\u05DD \u05D0\u05E0\u05D9\u05DE\u05E6\u05D9\u05D5\u05EA, \u05DE\u05D2\u05DE\u05D5\u05EA \u05D5\u05E0\u05D9\u05D4\u05D5\u05DC \u05EA\u05D2\u05D9\u05DD',
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-gauge20-icon.png',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        supportsCollections: true,

        getDefaultConfig: function () {
            return {
                Height: 400, Width: 600,
                DataShape: 'Table', Columns: ['Value'],
                Decimals: 2,
                // Range [EE-4]
                GaugeMin: 0,
                GaugeMax: 0,     // 0 = auto-detect
                AutoRange: true,
                EngineeringUnit: '',
                // Color bands (% of range)
                GreenMaxPct: 60,
                YellowMaxPct: 80,
                // Target
                ShowTarget: true,
                TargetValue: 0,
                // Arc Angles (degrees)
                StartAngle: -225,
                EndAngle: 45,
                // Display
                viewMode: 'gauges',
                showTrend: true,
                maxAlerts: 50,
                // Sort
                sortBy: 'value',
                sortDesc: true,
                // Colors
                headerBg: '#0A1628',
                rowBg: '#0F2940',
                altRowBg: '#12122b',
                goodColor: '#2ECC71',
                warningColor: '#F39C12',
                criticalColor: '#E74C3C',
                accentColor: '#5BC0EB',
                // Font
                fontFamily: 'Segoe UI',
                fontSize: 12,
                headerFontSize: 14,
                fontBold: false,
                fontItalic: false,
                // Animation
                animationType: 'fade',
                animationSpeed: 300,
                // AF
                StaleThreshold: 300
            };
        },

        configTitle: '\u05DE\u05D3 \u05D1\u05D9\u05E6\u05D5\u05E2\u05D9\u05DD',
        configOptions: function () {
            return [{ title: 'Format Symbol', mode: 'format' }];
        }
    };

    def.visObjectType = symbolVis;
    PV.symbolCatalog.register(def);

})(window.PIVisualization);
