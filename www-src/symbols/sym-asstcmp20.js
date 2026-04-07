/* ================================================================
   sym-assetcompare20.js — Asset Compare v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'asstcmp20';
    var WIDGET_NAME = 'piv20Assetcompare';
    var THROTTLE_MS = 1500;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#ac20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.activeTab     = 'ranking';
        scope.units         = [];
        scope.filteredUnits = [];
        scope.siteList      = [];
        scope.filterText    = '';
        scope.filterSite    = '';
        scope.filterStatus  = '';
        scope.panelOpen     = false;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('assetcompare:processed', function (d) {
            scope.units    = d.units;
            scope.siteList = d.siteList;
            if (d.compareParams) scope.config.compareParams = d.compareParams;
            applyFilters();
            PIV20.safeApply(scope);
        });

        /* ── Client-side Filtering ─────────── */
        function applyFilters() {
            var list = scope.units;

            if (scope.filterText) {
                var q = scope.filterText.toLowerCase();
                list = list.filter(function (u) {
                    return (u.displayName || '').toLowerCase().indexOf(q) >= 0 ||
                           (u.site || '').toLowerCase().indexOf(q) >= 0;
                });
            }
            if (scope.filterSite) {
                list = list.filter(function (u) { return u.site === scope.filterSite; });
            }
            if (scope.filterStatus) {
                list = list.filter(function (u) { return u.status === scope.filterStatus; });
            }

            scope.filteredUnits = list;
        }

        /* ── Scope actions ──────────────────── */
        scope.setTab = function (t) { scope.activeTab = t; };
        scope.filterChanged = function () { applyFilters(); };

        scope.doSort = function (field) {
            var w = $root.data(WIDGET_NAME);
            if (!w) return;
            scope.units.sort(function (a, b) {
                if (field === 'name') return (a.displayName || '').localeCompare(b.displayName || '', 'he');
                if (field === 'compositeScore') return (b.compositeScore || 0) - (a.compositeScore || 0);
                /* Sort by specific param value */
                var va = (a.values && a.values[field]) || 0;
                var vb = (b.values && b.values[field]) || 0;
                return vb - va;
            });
            applyFilters();
        };

        scope.getScoreColor = function (score) {
            if (score >= 80) return '#2ecc71';
            if (score >= 50) return '#f39c12';
            return '#e74c3c';
        };

        scope.getStatusText = function (status) {
            var map = {
                'producing': '\u05D9\u05D9\u05E6\u05D5\u05E8',
                'offline':   '\u05DB\u05D1\u05D5\u05D9',
                'starting':  '\u05D4\u05EA\u05E0\u05E2\u05D4',
                'sync':      '\u05E1\u05E0\u05DB\u05E8\u05D5\u05DF',
                'fault':     '\u05EA\u05E7\u05DC\u05D4'
            };
            return map[status] || status || '---';
        };

        scope.getStatusClass = function (status) {
            return 'ac20-status-' + (status || 'offline');
        };

        scope.formatValue = function (val, dec) {
            if (val == null || isNaN(val)) return '---';
            return PIV20.fmt ? PIV20.fmt(val, dec) : Number(val).toFixed(dec || 1);
        };

        scope.getHeatmapColor = function (unitKey, paramKey) {
            var w = $root.data(WIDGET_NAME);
            return w ? w.getHeatmapColor(unitKey, paramKey) : 'transparent';
        };

        scope.getRanking = function (unitKey, paramKey) {
            var w = $root.data(WIDGET_NAME);
            return w ? w.getRanking(unitKey, paramKey) : null;
        };

        scope.getSparklinePath = function (data) {
            var w = $root.data(WIDGET_NAME);
            return w ? w.getSparklinePath(data) : '';
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
        displayName: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05EA Assets v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-assetcompare20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05EA Assets',
                sortBy: 'compositeScore',
                maxVisibleUnits: 50,
                showHeatmap: true,
                showSparklines: true,
                showDeltas: true,
                showBaseline: false,
                Decimals: 2,
                StaleThreshold: 300,
                accentColor: '#5BC0EB',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                Height: 550,
                Width: 950,
                compareParams: [
                    { key: 'Production_MW',       label: '\u05D9\u05D9\u05E6\u05D5\u05E8',       unit: 'MW',     weight: 3, decimals: 1, higherBetter: true },
                    { key: 'Efficiency_Pct',      label: '\u05E0\u05E6\u05D9\u05DC\u05D5\u05EA', unit: '%',      weight: 3, decimals: 1, higherBetter: true },
                    { key: 'Load_Pct',            label: '\u05E2\u05D5\u05DE\u05E1',              unit: '%',      weight: 2, decimals: 1, higherBetter: true },
                    { key: 'Stress_Level',        label: '\u05E2\u05D5\u05DE\u05E1',              unit: '',       weight: 2, decimals: 1, higherBetter: false },
                    { key: 'CO2_Emission_TPH',    label: 'CO2',                                    unit: 't/h',    weight: 2, decimals: 2, higherBetter: false },
                    { key: 'Running_Hours_Total', label: '\u05E9\u05E2\u05D5\u05EA',              unit: 'h',      weight: 1, decimals: 0, higherBetter: true },
                    { key: 'Ramp_Rate_MW_min',    label: '\u05E8\u05DE\u05E4\u05D4',              unit: 'MW/min', weight: 1, decimals: 2, higherBetter: true }
                ]
            };
        },
        configTitle: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05EA Assets v20'
    });
})(window.PIVisualization, window.PIV20);
