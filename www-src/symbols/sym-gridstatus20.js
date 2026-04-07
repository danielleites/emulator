/* ================================================================
   sym-gridstatus20.js — Grid Status Monitor v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'gridstatus20';
    var WIDGET_NAME = 'piv20Gridstatus';
    var THROTTLE_MS = 1000;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#gs20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.activeTab      = 'dashboard';
        scope.filterText     = '';
        scope.filterCategory = '';
        scope.sortField      = '';
        scope.sortReverse    = false;
        scope.items          = [];
        scope.filteredItems  = [];
        scope.categories     = {};
        scope.activeCategories = [];
        scope.summary        = { total: 0, good: 0, warn: 0, crit: 0 };
        scope.healthScore    = 0;
        scope.healthGrade    = 'F';
        scope.healthColor    = '#e74c3c';
        scope.healthArc      = '';
        scope.n1             = { available: false, ok: false, reserve: 0, largestGen: 0, margin: 0 };
        scope.eventLog       = [];
        scope.alerts         = [];
        scope.panelOpen      = false;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Filtering helper ───────────────── */
        function applyFilters() {
            var list = scope.items;
            if (scope.filterCategory) {
                var fc = scope.filterCategory;
                list = list.filter(function (p) { return p.category === fc; });
            }
            if (scope.filterText) {
                var ft = scope.filterText.toLowerCase();
                list = list.filter(function (p) {
                    return (p.label || '').toLowerCase().indexOf(ft) > -1;
                });
            }
            if (scope.sortField) {
                var sf = scope.sortField, rev = scope.sortReverse ? -1 : 1;
                list = list.slice().sort(function (a, b) {
                    var va = a[sf], vb = b[sf];
                    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * rev;
                    return String(va || '').localeCompare(String(vb || '')) * rev;
                });
            }
            scope.filteredItems = list;
        }

        /* ── Bus listeners ──────────────────── */
        bus.on('gridstatus:processed', function (d) {
            scope.items            = d.items;
            scope.categories       = d.categories;
            scope.activeCategories = d.activeCategories;
            scope.summary          = d.summary;
            scope.healthScore      = d.healthScore;
            scope.healthGrade      = d.healthGrade;
            scope.healthColor      = d.healthColor;
            scope.healthArc        = d.healthArc;
            scope.n1               = d.n1;
            scope.eventLog         = d.eventLog;
            /* Merge alerts */
            if (d.newAlerts && d.newAlerts.length) {
                for (var a = 0; a < d.newAlerts.length; a++) {
                    scope.alerts.unshift(d.newAlerts[a]);
                }
                var maxA = cfg.MaxAlerts || 50;
                while (scope.alerts.length > maxA) scope.alerts.pop();
            }
            applyFilters();
            PIV20.safeApply(scope);
        });

        /* ── Scope actions ──────────────────── */
        scope.setTab = function (t) { scope.activeTab = t; };
        scope.sortBy = function (field) {
            if (scope.sortField === field) scope.sortReverse = !scope.sortReverse;
            else { scope.sortField = field; scope.sortReverse = false; }
            applyFilters();
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
                        Label: d.Label || d.Name || d.Path || ('Param ' + (i + 1)),
                        Value: d.Value != null ? d.Value : d.Snapshot,
                        Path:  d.Path || '',
                        Time:  d.Time || null,
                        Good:  d.Good
                    });
                }
            }
            if (items.length) bus.emit('data', items);
        });

        /* Watch filter text to re-apply */
        scope.$watch('filterText', function () { applyFilters(); });
        scope.$watch('filterCategory', function () { applyFilters(); });

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
        displayName: '\u05E1\u05D8\u05D8\u05D5\u05E1 \u05E8\u05E9\u05EA v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-gridstatus20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05E1\u05D8\u05D8\u05D5\u05E1 \u05E8\u05E9\u05EA',
                Decimals: 2,
                FreqNominal: 50.0,
                FreqWarnBand: 0.2,
                FreqCritBand: 0.5,
                VoltNominal: 1.0,
                VoltWarnPct: 5,
                VoltCritPct: 10,
                ReserveWarnPct: 15,
                ReserveCritPct: 10,
                WarnThreshold: 0,
                CritThreshold: 0,
                HealthWeights: { freq: 30, volt: 25, reserve: 20, conn: 15, events: 10 },
                ShowAlerts: true,
                MaxAlerts: 50,
                accentColor: '#5BC0EB',
                goodColor: '#2ecc71',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                StaleThreshold: 300,
                Height: 600,
                Width: 950
            };
        },
        configTitle: '\u05E1\u05D8\u05D8\u05D5\u05E1 \u05E8\u05E9\u05EA v20'
    });
})(window.PIVisualization, window.PIV20);
