/* ================================================================
   sym-powerflow20.js — Power Flow Visualization v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'powerflow20';
    var WIDGET_NAME = 'piv20Powerflow';
    var THROTTLE_MS = 1000;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#pf20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.viewMode   = 'flow';
        scope.nodes      = [];
        scope.flows      = [];
        scope.events     = [];
        scope.aggregate  = { generation: 0, load: 0, losses: 0, balance: 0 };
        scope.bottleneck = null;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('powerflow:processed', function (d) {
            scope.nodes      = d.nodes;
            scope.flows      = d.flows;
            scope.aggregate  = d.aggregate;
            scope.bottleneck = d.bottleneck;
            /* Merge events */
            if (d.newEvents && d.newEvents.length) {
                for (var e = 0; e < d.newEvents.length; e++) {
                    scope.events.unshift(d.newEvents[e]);
                }
                while (scope.events.length > 200) scope.events.pop();
            }
            PIV20.safeApply(scope);
        });

        bus.on('powerflow:render', function () {
            var w = $root.data(WIDGET_NAME);
            if (w) {
                var container = elem.find('#pf20-svg-container')[0];
                if (container) w.renderSVG(container);
            }
        });

        /* ── Scope actions ──────────────────── */
        scope.setView = function (v) {
            scope.viewMode = v;
            if (v === 'flow') {
                setTimeout(function () { bus.emit('powerflow:render'); }, 50);
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
        displayName: '\u05D6\u05E8\u05D9\u05DE\u05EA \u05D4\u05E1\u05E4\u05E7 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-powerflow20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05D6\u05E8\u05D9\u05DE\u05EA \u05D4\u05E1\u05E4\u05E7',
                Decimals: 1,
                WarnThreshold: 80,
                CritThreshold: 100,
                TopologyMode: 'auto',
                TopologyAttr: '',
                ShowLosses: true,
                ShowAnimation: true,
                AnimSpeed: 2,
                ShowValues: true,
                accentColor: '#5BC0EB',
                genColor: '#22c55e',
                loadColor: '#f59e0b',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 400,
                Width: 800
            };
        },
        configTitle: '\u05D6\u05E8\u05D9\u05DE\u05EA \u05D4\u05E1\u05E4\u05E7 v20'
    });
})(window.PIVisualization, window.PIV20);
