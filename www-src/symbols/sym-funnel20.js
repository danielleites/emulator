/**
 * ================================================================
 *  sym-funnel20.js  --  Funnel / Pipeline Chart v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for funnel / pipeline visualization.
 *  Domain logic lives in piv20-plugins/piv20-funnel.js.
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
 *    - piv20-funnel.js          (jQuery widget plugin)
 *    - sym-funnel20.css         (external stylesheet)
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'funnel20';
    var WIDGET_NAME = 'piv20Funnel';
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

        // ── Initialize scope defaults ──
        scope.stages = [];
        scope.summary = {};
        scope.hoverIdx = -1;
        scope.afConn = null;
        scope.liveTime = PIV20.fmt.time();
        scope.viewMode = scope.config.viewMode || 'funnel';
        scope.filterText = '';
        scope.panelOpen = false;

        // ── Create widget ──
        var $el = $(container);
        var widgetRef = PIV20.safeWidget($el, WIDGET_NAME, {
            bus: bus,
            demoMode: !!(P && P.demoMode),
            config: scope.config
        });

        // ── Bus → Scope binding ──
        bus.on('funnel:updated', function (payload) {
            if (!payload) return;
            scope.stages = payload.stages || [];
            scope.summary = payload.summary || {};
            scope.hoverIdx = payload.hoverIdx != null ? payload.hoverIdx : -1;
            scope.viewMode = payload.viewMode || 'funnel';
            scope.afConn = payload.afConn || null;
            scope.$applyAsync();
        });

        bus.on('toast:show', function (payload) {
            PIV20.ui.showToast(container, payload.msg, payload.duration, payload.style);
        });

        // ── Scope methods → Widget proxies ──
        scope.setView = function (mode) {
            if (widgetRef) widgetRef[WIDGET_NAME]('setView', mode);
        };

        scope.exportCSV = function () {
            if (widgetRef) widgetRef[WIDGET_NAME]('exportCSV');
        };

        scope.togglePanel = function () {
            scope.panelOpen = !scope.panelOpen;
        };

        /** Get filtered stages for ng-repeat (delegates to widget). */
        scope.getFiltered = function () {
            if (widgetRef) return widgetRef[WIDGET_NAME]('getFiltered', scope.filterText);
            return scope.stages;
        };

        /** Efficiency color for template ng-style. */
        scope.getEffColor = function (pct) {
            if (widgetRef) return widgetRef[WIDGET_NAME]('getEffColor', pct);
            return '#5BC0EB';
        };

        // ── Clock ──
        if (P && P.clock) {
            P.clock.bind(scope);
        } else {
            var _clockId = setInterval(function () {
                scope.liveTime = PIV20.fmt.time();
                scope.$applyAsync();
            }, 1000);
            scope.$on('$destroy', function () { clearInterval(_clockId); });
        }

        // ── Cleanup ──
        PIV20.destroyHelper(scope, bus, $el, WIDGET_NAME);

        console.log('[' + SYM_NAME + '] Initialized');
    };

    /**
     * Route data from PI Vision into widget via bus.
     */
    symbolVis.prototype.onDataUpdate = PIV20.shield.wrap(SYM_NAME, 'onDataUpdate', function (data, scope) {
        if (!data) return;
        var now = Date.now();
        if (now - this._lastProcess < THROTTLE_MS) return;
        this._lastProcess = now;

        var bus = scope._piv20Bus;
        if (!bus) {
            // Fallback: find bus from widget
            var $el = $(scope.elem || scope.symbol && scope.symbol.Element);
            bus = $el.data('piv20Bus');
        }
        if (bus) bus.emit('data:updated', data);
    });
    symbolVis.prototype._lastProcess = 0;

    /**
     * Route config changes to widget via bus.
     */
    symbolVis.prototype.onConfigChange = PIV20.shield.wrap(SYM_NAME, 'onConfigChange', function (newConfig, oldConfig, scope) {
        var bus = scope._piv20Bus;
        if (bus) bus.emit('config:changed', newConfig);
    });

    // ══════════════════════════════════════════════
    //  CATALOG REGISTRATION
    // ══════════════════════════════════════════════

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05DE\u05E9\u05E4\u05DA \u05D4\u05E1\u05E4\u05E7',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-funnel20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Columns: ['Value'],
                Height: 400,
                Width: 350,
                Decimals: 1,
                Title: '\u05DE\u05E9\u05E4\u05DA \u05D4\u05E1\u05E4\u05E7',
                viewMode: 'funnel',
                // Efficiency
                ShowEfficiency: true,
                ShowLosses: true,
                ShowPercentage: true,
                AutoSort: true,
                EfficiencyGoodPct: 95,
                EfficiencyWarnPct: 90,
                // Display
                fontFamily: 'Segoe UI',
                fontSize: 12,
                headerFontSize: 14,
                fontBold: false,
                fontItalic: false,
                animationType: 'fade',
                animationSpeed: 300,
                // Colors
                headerBg: '#0A1628',
                rowBg: '#0F2940',
                goodColor: '#2ecc71',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                accentColor: '#5BC0EB',
                // AF
                StaleThreshold: 300
            };
        },
        configTitle: '\u05DE\u05E9\u05E4\u05DA \u05D4\u05E1\u05E4\u05E7',
        configOptions: function () {
            return [{ title: 'Format Symbol', mode: 'format' }];
        }
    });

    console.log('[' + SYM_NAME + '] Symbol registered');
})(window.PIVisualization);
