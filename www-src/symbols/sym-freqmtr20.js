/* ================================================================
   sym-frequencymeter20.js — Grid Frequency Meter v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'freqmtr20';
    var WIDGET_NAME = 'piv20Frequencymeter';
    var THROTTLE_MS = 500;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#fm20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.viewMode  = 'gauge';
        scope.freq      = 50.0;
        scope.status    = { cls: 'normal', label: 'תקין', color: '#2ecc71' };
        scope.rocof     = 0;
        scope.stats     = {};
        scope.ufls      = [];
        scope.events    = [];

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('freq:processed', function (d) {
            scope.freq    = d.freq;
            scope.status  = d.status;
            scope.rocof   = d.rocof;
            scope.stats   = d.stats;
            scope.ufls    = d.ufls;
            scope.events  = d.events;
            PIV20.safeApply(scope);

            /* Update sparkline */
            if (cfg.ShowSpark) {
                setTimeout(function () {
                    var c = $root.find('.fm20-spark-canvas')[0];
                    var w = $root.data(WIDGET_NAME);
                    if (c && w) w.drawSparkline(c);
                }, 30);
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

        /* ── Data bridge (Single datasource) ── */
        var lastPush = 0;
        scope.$on('dataUpdate', function () {
            var now = Date.now();
            if (now - lastPush < THROTTLE_MS) return;
            lastPush = now;

            bus.emit('config', cfg);

            var freq = null;
            if (scope.symbol && scope.symbol.DataSources && scope.symbol.DataSources.length > 0) {
                var ds = scope.symbol.DataSources[0];
                freq = parseFloat(ds.Value != null ? ds.Value : ds.Snapshot);
            }
            if (freq != null && !isNaN(freq)) {
                bus.emit('data', freq);
            }
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
        displayName: 'מד תדר רשת v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Single,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-frequencymeter20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: 'תדר רשת',
                Decimals: 3,
                NominalFreq: 50.0,
                MinHz: 49.0,
                MaxHz: 51.0,
                NormalBand: 0.05,
                WarnBand: 0.2,
                RocofWarnThreshold: 0.125,
                EventThreshold: 0.15,
                ShowStats: true,
                ShowSpark: true,
                ShowUFLS: true,
                ShowROCOF: true,
                accentColor: '#5BC0EB',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 300,
                Width: 600
            };
        },
        configTitle: 'הגדרות מד תדר v20'
    });
})(window.PIVisualization, window.PIV20);
