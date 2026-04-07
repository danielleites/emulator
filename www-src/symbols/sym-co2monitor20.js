/* ================================================================
   sym-co2monitor20.js — CO2 Monitor / Quota Tracker v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'co2monitor20';
    var WIDGET_NAME = 'piv20Co2monitor';
    var THROTTLE_MS = 1000;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#cm20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.activeTab    = 'overview';
        scope.units        = [];
        scope.currentRate  = 0;
        scope.totalToday   = 0;
        scope.yearlyUsed   = 0;
        scope.monthlyUsed  = 0;
        scope.yearlyPct    = 0;
        scope.monthlyPct   = 0;
        scope.dailyPct     = 0;
        scope.yearlyStatus  = 'ok';
        scope.monthlyStatus = 'ok';
        scope.dailyStatus   = 'ok';
        scope.trendData    = [];
        scope.alerts       = [];

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('co2monitor:processed', function (d) {
            scope.units        = d.units;
            scope.currentRate  = d.currentRate;
            scope.totalToday   = d.totalToday;
            scope.yearlyUsed   = d.yearlyUsed;
            scope.monthlyUsed  = d.monthlyUsed;
            scope.yearlyPct    = d.yearlyPct;
            scope.monthlyPct   = d.monthlyPct;
            scope.dailyPct     = d.dailyPct;
            scope.yearlyStatus  = d.yearlyStatus;
            scope.monthlyStatus = d.monthlyStatus;
            scope.dailyStatus   = d.dailyStatus;
            scope.trendData    = d.trendData;
            /* Merge alerts */
            if (d.newAlerts && d.newAlerts.length) {
                for (var a = 0; a < d.newAlerts.length; a++) {
                    scope.alerts.unshift(d.newAlerts[a]);
                }
                var maxA = cfg.MaxAlerts || 50;
                while (scope.alerts.length > maxA) scope.alerts.pop();
            }
            PIV20.safeApply(scope);
        });

        bus.on('co2monitor:render', function () {
            var w = $root.data(WIDGET_NAME);
            if (w) {
                var canvas = elem.find('.cm20-canvas')[0];
                if (canvas) w.drawTrendChart(canvas);
            }
        });

        /* ── Scope actions ──────────────────── */
        scope.setTab = function (t) {
            scope.activeTab = t;
            if (t === 'overview') {
                setTimeout(function () { bus.emit('co2monitor:render'); }, 50);
            }
        };

        scope.exportCSV = function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.exportCSV();
        };

        scope.openPanel  = function () { scope.panelOpen = true; };
        scope.closePanel = function () { scope.panelOpen = false; };

        scope.showDocs = function () {
            if (PIV20.docs) PIV20.docs.show(SYM_NAME, scope, elem);
        };

        /* ── Data bridge ────────────────────── */
        var lastPush = 0;
        scope.$on('dataUpdate', function () {
            var now = Date.now();
            if (now - lastPush < THROTTLE_MS) return;
            lastPush = now;

            bus.emit('config', cfg);

            var items = [];
            if (scope.symbol && scope.symbol.DataSources) {
                var ds = scope.symbol.DataSources;
                for (var i = 0; i < ds.length; i++) {
                    var d = ds[i];
                    items.push({
                        Label: d.Label || d.Name || d.Path || ('Tag ' + (i + 1)),
                        Value: d.Value != null ? d.Value : d.Snapshot,
                        Path:  d.Path || '',
                        Time:  d.Time || null,
                        Good:  d.Good
                    });
                }
            }
            if (items.length) bus.emit('data', items);
        });

        /* ── Cleanup ────────────────────────── */
        PIV20.destroyHelper(scope, function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.destroy();
            bus.destroy();
        });

        if (PIV20.initSymbol) {
            PIV20.initSymbol(scope, elem, {
                name: SYM_NAME, bus: bus, widgetName: WIDGET_NAME, $root: $root
            });
        }
    };

    /* ── Registration ────────────────────────── */
    PV.symbolCatalog.register({
        typeName:    SYM_NAME,
        displayName: '\u05E0\u05D9\u05D8\u05D5\u05E8 CO2 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-co2monitor20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05E0\u05D9\u05D8\u05D5\u05E8 CO2',
                Decimals: 1,
                YearlyQuota: 500000,
                MonthlyQuota: 45000,
                DailyTarget: 1500,
                FactorGas: 2.75,
                FactorDiesel: 3.15,
                FactorCoal: 2.42,
                FactorMazut: 3.07,
                WarningPct: 75,
                CriticalPct: 90,
                TrendPoints: 24,
                MaxAlerts: 50,
                accentColor: '#5BC0EB',
                co2Color: '#e74c3c',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 500,
                Width: 950
            };
        },
        configTitle: '\u05E0\u05D9\u05D8\u05D5\u05E8 CO2 v20'
    });
})(window.PIVisualization, window.PIV20);
