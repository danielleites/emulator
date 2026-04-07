/* ================================================================
   sym-fuelgauge20.js — Fuel Inventory Monitor v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'fuelgauge20';
    var WIDGET_NAME = 'piv20Fuelgauge';
    var THROTTLE_MS = 1000;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#fg20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.viewMode   = 'tanks';
        scope.tanks      = [];
        scope.summary    = {};

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('fuelgauge:processed', function (d) {
            scope.tanks   = d.tanks;
            scope.summary = d.summary;

            /* Generate SVG strings for tank view */
            var w = $root.data(WIDGET_NAME);
            if (w) {
                for (var i = 0; i < d.tanks.length; i++) {
                    d.tanks[i]._svg = w.getTankSVG(i);
                }
            }
            PIV20.safeApply(scope);

            /* Render sparklines after digest */
            if (cfg.ShowSparkline && w) {
                setTimeout(function () {
                    $root.find('.fg20-spark-canvas').each(function () {
                        var idx = parseInt(this.getAttribute('data-idx'), 10);
                        if (!isNaN(idx)) w.drawSparkline(this, idx);
                    });
                }, 50);
            }
        });

        /* ── Scope actions ──────────────────── */
        scope.setView = function (v) { scope.viewMode = v; };

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
                        Label: d.Label || d.Name || d.Path || ('Tank ' + (i + 1)),
                        Value: d.Value != null ? d.Value : d.Snapshot,
                        Path:  d.Path || ''
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
        displayName: 'מאגר דלק v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-fuelgauge20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: 'מאגר דלק',
                Decimals: 1,
                WarnLevelPct: 30,
                CritLevelPct: 15,
                HoursWarnThreshold: 48,
                HoursCritThreshold: 12,
                TankCapacity: 0,
                ShowBurnRate: true,
                ShowHoursRemain: true,
                ShowSparkline: true,
                ShowCost: false,
                FuelCostPerUnit: 0,
                FuelCostCurrency: '\u20AA',
                MaxHistory: 360,
                accentColor: '#5BC0EB',
                goodColor: '#2ecc71',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 450,
                Width: 600
            };
        },
        configTitle: 'הגדרות מאגר דלק v20'
    });
})(window.PIVisualization, window.PIV20);
