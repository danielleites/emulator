/* ================================================================
   sym-renewablewidget20.js — Renewable Energy Monitor v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'renewwdg20';
    var WIDGET_NAME = 'piv20Renewable';
    var THROTTLE_MS = 1000;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#rw20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.viewMode          = 'dashboard';
        scope.allItems          = [];
        scope.categories        = {};
        scope.totalRenewableMW  = 0;
        scope.penetrationPct    = 0;
        scope.systemLoadMW      = 0;
        scope.hasCurtailTag     = false;
        scope.intermittency     = { variability: 0, rampRate: 0, rampEvents: 0, ewmaValue: 0 };
        scope.curtailment       = { mw: 0, pct: 0, mwhToday: 0, costToday: 0 };
        scope.stats             = { min: 0, max: 0, avg: 0, p95: 0 };

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('renewable:processed', function (d) {
            scope.allItems         = d.allItems;
            scope.categories       = d.categories;
            scope.totalRenewableMW = d.totalRenewableMW;
            scope.penetrationPct   = d.penetrationPct;
            scope.systemLoadMW     = d.systemLoadMW;
            scope.hasCurtailTag    = d.hasCurtailTag;
            scope.intermittency    = d.intermittency;
            scope.curtailment      = d.curtailment;
            scope.stats            = d.stats;
            PIV20.safeApply(scope);
        });

        bus.on('renewable:render', function () {
            var w = $root.data(WIDGET_NAME);
            if (w) {
                var canvas = elem.find('.rw20-canvas')[0];
                if (canvas) w.drawChart(canvas);
            }
        });

        /* ── Scope actions ──────────────────── */
        scope.setView = function (v) {
            scope.viewMode = v;
            if (v === 'chart') {
                setTimeout(function () { bus.emit('renewable:render'); }, 50);
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
        displayName: '\u05D0\u05E0\u05E8\u05D2\u05D9\u05D4 \u05DE\u05EA\u05D7\u05D3\u05E9\u05EA v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-renewablewidget20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05D0\u05E0\u05E8\u05D2\u05D9\u05D4 \u05DE\u05EA\u05D7\u05D3\u05E9\u05EA',
                Decimals: 1,
                SolarInstalledMW: 0,
                WindInstalledMW: 0,
                CurtailmentCostPerMWh: 250,
                RampThresholdMW: 50,
                HighPenetrationPct: 30,
                ShowCF: true,
                ShowCurtailment: true,
                ShowIntermittency: true,
                MaxHistory: 480,
                accentColor: '#5BC0EB',
                solarColor: '#f59e0b',
                windColor: '#22c55e',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 450,
                Width: 700
            };
        },
        configTitle: '\u05D0\u05E0\u05E8\u05D2\u05D9\u05D4 \u05DE\u05EA\u05D7\u05D3\u05E9\u05EA v20'
    });
})(window.PIVisualization, window.PIV20);
