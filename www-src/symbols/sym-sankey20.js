/* ================================================================
   sym-sankey20.js — Sankey Flow Diagram v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME     = 'sankey20';
    var WIDGET_NAME  = 'piv20Sankey';
    var THROTTLE_MS  = 800;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#sk20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.viewMode   = 'sankey';
        scope.nodes      = [];
        scope.flows      = [];
        scope.stats      = {};
        scope.hoverInfo  = null;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('sankey:processed', function (d) {
            scope.nodes = d.nodes;
            scope.flows = d.flows;
            scope.stats = d.stats;
            PIV20.safeApply(scope);
        });

        bus.on('hover:changed', function (info) {
            scope.hoverInfo = info;
            PIV20.safeApply(scope);
        });

        /* ── Canvas mouse handlers ──────────── */
        var canvas = $root.find('canvas.sk20-canvas');
        canvas.on('mousemove', function (e) {
            var rect = this.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;
            var w = $root.data(WIDGET_NAME);
            if (w) w.handleHover(mx, my);
        });
        canvas.on('mouseleave', function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.clearHover();
        });

        /* ── Scope actions ──────────────────── */
        scope.setView = function (v) { scope.viewMode = v; };

        scope.exportCSV = function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.exportCSV();
        };

        scope.openPanel = function () { scope.panelOpen = true; };
        scope.closePanel = function () { scope.panelOpen = false; };

        scope.showDocs = function () {
            if (PIV20.docs) PIV20.docs.show(SYM_NAME, scope, elem);
        };

        /* ── Animation control ──────────────── */
        function updateAnimation() {
            var w = $root.data(WIDGET_NAME);
            if (!w) return;
            if (cfg.AnimateFlows) w.startAnimation();
            else w.stopAnimation();
        }

        /* ── Data bridge ────────────────────── */
        var lastPush = 0;
        scope.$on('dataUpdate', function () {
            var now = Date.now();
            if (now - lastPush < THROTTLE_MS) return;
            lastPush = now;

            bus.emit('config', cfg);
            updateAnimation();

            var items = [];
            if (scope.symbol && scope.symbol.DataSources) {
                var ds = scope.symbol.DataSources;
                for (var i = 0; i < ds.length; i++) {
                    var d = ds[i];
                    items.push({
                        Label: d.Label || d.Name || d.Path || ('Tag ' + (i + 1)),
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
            if (w) {
                w.stopAnimation();
                w.destroy();
            }
            bus.destroy();
            canvas.off();
        });

        /* ── Init with PIV20.initSymbol if available */
        if (PIV20.initSymbol) {
            PIV20.initSymbol(scope, elem, {
                name: SYM_NAME, bus: bus, widgetName: WIDGET_NAME, $root: $root
            });
        }
    };

    /* ── Registration ────────────────────────── */
    var def = {
        typeName:    SYM_NAME,
        displayName: 'סנקי / זרימת אנרגיה v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-sankey20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: 'סנקי זרימה',
                Decimals: 1,
                ShowLabels: true,
                ShowValues: true,
                ShowPercentages: true,
                ShowEfficiency: true,
                ShowLosses: true,
                AnimateFlows: true,
                NodeWidth: 20,
                accentColor: '#5BC0EB',
                lossColor: '#EE5A24',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 300,
                Width: 400
            };
        },
        configTitle: 'הגדרות סנקי v20'
    };

    PV.symbolCatalog.register(def);
})(window.PIVisualization, window.PIV20);
