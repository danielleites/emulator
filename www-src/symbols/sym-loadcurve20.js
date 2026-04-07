/* ================================================================
   sym-loadcurve20.js — Load Curve / Load Profile v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'loadcurve20';
    var WIDGET_NAME = 'piv20Loadcurve';
    var THROTTLE_MS = 800;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#lc20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.viewMode    = 'chart';
        scope.legend      = [];
        scope.stats       = {};
        scope.currentLoad = 0;
        scope.rampRate    = 0;
        scope.trendDir    = '\u2192';
        scope.peakInfo    = null;
        scope.valleyInfo  = null;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('loadcurve:processed', function (d) {
            scope.legend      = d.legend;
            scope.stats       = d.stats || {};
            scope.currentLoad = d.currentLoad;
            scope.rampRate    = d.rampRate;
            scope.trendDir    = d.trendDir;
            scope.peakInfo    = d.peakInfo;
            scope.valleyInfo  = d.valleyInfo;
            PIV20.safeApply(scope);
        });

        /* ── Scope actions ──────────────────── */
        scope.setView = function (v) { scope.viewMode = v; };

        scope.toggleSeries = function (key) {
            var w = $root.data(WIDGET_NAME);
            if (w) {
                w.toggleSeries(key);
                scope.legend = w._legend;
            }
        };

        scope.clearHistory = function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.clearHistory();
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
                        Label: d.Label || d.Name || d.Path || ('Series ' + (i + 1)),
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
        displayName: 'עקומת עומס v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-loadcurve20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: 'עקומת עומס',
                Decimals: 1,
                MaxHistory: 720,
                RefreshIntervalSec: 5,
                CapacityLimit: 0,
                WarnLimit: 0,
                accentColor: '#5BC0EB',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 300,
                Width: 600
            };
        },
        configTitle: 'הגדרות עקומת עומס v20'
    });
})(window.PIVisualization, window.PIV20);
