/* ================================================================
   sym-datatablepro20.js — Data Table Pro v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'dtblpro20';
    var WIDGET_NAME = 'piv20Datatablepro';
    var THROTTLE_MS = 800;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#dtp20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.items          = [];
        scope.groups         = [];
        scope.summary        = { total: 0, good: 0, warn: 0, crit: 0, bad: 0, stale: 0 };
        scope.footerStats    = {};
        scope.columns        = [];
        scope.searchText     = '';
        scope.quickFilter    = 'all';
        scope.activeFilterCount = 0;
        scope.currentPage    = 0;
        scope.panelOpen      = false;
        scope.detailItem     = null;
        scope.connectionStatus = 'good';
        scope.connectionText   = '\u05DE\u05D7\u05D5\u05D1\u05E8';

        /* Column visibility state */
        var hiddenCols = {};
        var sortCol = 'index';
        var sortAsc = true;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('datatablepro:processed', function (d) {
            scope.items       = d.items;
            scope.groups      = d.groups;
            scope.summary     = d.summary;
            scope.footerStats = d.footerStats;
            scope.columns     = d.columns;
            applyClientFilters();
            PIV20.safeApply(scope);
        });

        bus.on('datatablepro:render', function () {
            /* Render sparklines after digest */
            setTimeout(function () {
                var w = $root.data(WIDGET_NAME);
                if (w) w.renderSparklines($root[0]);
            }, 50);
        });

        /* ── Client-side Filtering ─────────── */
        function applyClientFilters() {
            var list = scope.items;
            var filterCount = 0;

            /* Search text */
            if (scope.searchText) {
                var q = scope.searchText.toLowerCase();
                list = list.filter(function (it) {
                    return (it.label || '').toLowerCase().indexOf(q) >= 0 ||
                           (it.fullPath || '').toLowerCase().indexOf(q) >= 0;
                });
                filterCount++;
            }

            /* Quick filter */
            if (scope.quickFilter !== 'all') {
                if (scope.quickFilter === 'crit') {
                    list = list.filter(function (it) { return it.statusLevel === 'crit'; });
                } else if (scope.quickFilter === 'bad') {
                    list = list.filter(function (it) { return !it.good; });
                } else if (scope.quickFilter === 'stale') {
                    list = list.filter(function (it) { return it.stale; });
                }
                filterCount++;
            }

            scope.filteredItems = list;
            scope.activeFilterCount = filterCount;
            scope.currentPage = 0;
        }

        /* ── Scope actions ──────────────────── */
        scope.filterChanged   = function () { applyClientFilters(); };
        scope.setQuickFilter  = function (f) { scope.quickFilter = f; applyClientFilters(); };
        scope.clearFilters    = function () { scope.searchText = ''; scope.quickFilter = 'all'; applyClientFilters(); };

        scope.sortBy = function (col) {
            if (sortCol === col) { sortAsc = !sortAsc; }
            else { sortCol = col; sortAsc = true; }
            var w = $root.data(WIDGET_NAME);
            if (w) w.sortByColumn(sortCol, sortAsc);
        };

        scope.getSortIcon = function (col) {
            if (col !== sortCol) return '';
            return sortAsc ? '\u25B2' : '\u25BC';
        };

        scope.isColumnVisible = function (col) { return !hiddenCols[col]; };
        scope.toggleColumn    = function (col) { hiddenCols[col] = !hiddenCols[col]; };
        scope.getColWidth     = function (col) {
            for (var i = 0; i < (scope.columns || []).length; i++) {
                if (scope.columns[i].key === col) return scope.columns[i].width;
            }
            return 'auto';
        };

        scope.selectRow = function (item, $event) {
            scope.detailItem = item;
        };

        scope.isSelected = function (item) {
            return scope.detailItem && scope.detailItem.idx === item.idx;
        };

        scope.getHighlightStyle = function (item) {
            if (item.statusLevel === 'crit') return { 'border-right-color': cfg.criticalColor || '#e74c3c' };
            if (item.statusLevel === 'warn') return { 'border-right-color': cfg.warningColor || '#f39c12' };
            return {};
        };

        scope.toggleGroup = function (group) { group.collapsed = !group.collapsed; };

        /* Pagination */
        var rowsPerPage = cfg.RowsPerPage || 50;
        scope.getPagedItems = function () {
            var start = scope.currentPage * rowsPerPage;
            return (scope.filteredItems || []).slice(start, start + rowsPerPage);
        };
        scope.totalPages = function () { return Math.ceil((scope.filteredItems || []).length / rowsPerPage) || 1; };
        scope.pageInfo = function () { return (scope.currentPage + 1) + ' / ' + scope.totalPages(); };
        scope.firstPage = function () { scope.currentPage = 0; };
        scope.prevPage  = function () { if (scope.currentPage > 0) scope.currentPage--; };
        scope.nextPage  = function () { if (scope.currentPage < scope.totalPages() - 1) scope.currentPage++; };
        scope.lastPage  = function () { scope.currentPage = scope.totalPages() - 1; };

        scope.hiddenCount = function () {
            var w = $root.data(WIDGET_NAME);
            return w ? w.hiddenCount() : 0;
        };
        scope.unhideAll = function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.unhideAll();
        };

        scope.exportData = function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.exportCSV();
        };

        scope.copyToClipboard = function () {
            var w = $root.data(WIDGET_NAME);
            if (!w) return;
            var items = scope.filteredItems || scope.items || [];
            var lines = items.map(function (it) { return it.label + '\t' + it.display; });
            w.copyToClipboard(lines.join('\n'));
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

            scope.connectionStatus = items.length > 0 ? 'good' : 'warn';
            scope.connectionText = items.length > 0 ? '\u05DE\u05D7\u05D5\u05D1\u05E8' : '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD';

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
        displayName: '\u05D8\u05D1\u05DC\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DE\u05EA\u05E7\u05D3\u05DE\u05EA v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-datatablepro20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05D8\u05D1\u05DC\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD',
                Decimals: 2,
                RowsPerPage: 50,
                GroupBy: 'none',
                ShowSparklines: true,
                ShowFooterStats: true,
                ShowTrend: true,
                WarnThreshold: 80,
                CritThreshold: 95,
                ThresholdMode: 'above',
                StaleThreshold: 300,
                accentColor: '#5BC0EB',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                Height: 500,
                Width: 900
            };
        },
        configTitle: '\u05D8\u05D1\u05DC\u05EA \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DE\u05EA\u05E7\u05D3\u05DE\u05EA v20'
    });
})(window.PIVisualization, window.PIV20);
