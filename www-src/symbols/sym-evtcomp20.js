/* ================================================================
   sym-eventcompare20.js — Event Compare v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'evtcomp20';
    var WIDGET_NAME = 'piv20Eventcompare';
    var THROTTLE_MS = 1500;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#ec20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.activeTab        = 'table';
        scope.events           = [];
        scope.filteredEvents   = [];
        scope.totalEventCount  = 0;
        scope.filterText       = '';
        scope.filterType       = '';
        scope.filterUnit       = '';
        scope.eventTypes       = {};
        scope.unitList         = [];
        scope.eventStats       = {};
        scope.unitReliability  = {};
        scope.recurrencePatterns = [];
        scope.crossCorrelations = [];
        scope.timelineData     = [];
        scope.comparisonMatrix = {};
        scope.timeRange        = { start: 0, end: 0 };
        scope.lastUpdate       = null;
        scope.panelOpen        = false;

        var sortCol = 'startTime';
        var sortAsc = false;

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('eventcompare:processed', function (d) {
            scope.events            = d.events;
            scope.totalEventCount   = d.totalEventCount;
            scope.eventTypes        = d.eventTypes;
            scope.unitList          = d.unitList;
            scope.eventStats        = d.eventStats;
            scope.unitReliability   = d.unitReliability;
            scope.recurrencePatterns = d.recurrencePatterns;
            scope.crossCorrelations = d.crossCorrelations;
            scope.timelineData      = d.timelineData;
            scope.comparisonMatrix  = d.comparisonMatrix;
            scope.timeRange         = d.timeRange;
            scope.lastUpdate        = Date.now();
            applyFilters();
            PIV20.safeApply(scope);
        });

        /* ── Client-side Filtering ─────────── */
        function applyFilters() {
            var list = scope.events;

            if (scope.filterText) {
                var q = scope.filterText.toLowerCase();
                list = list.filter(function (e) {
                    return (e.name || '').toLowerCase().indexOf(q) >= 0 ||
                           (e.unitName || '').toLowerCase().indexOf(q) >= 0 ||
                           (e.description || '').toLowerCase().indexOf(q) >= 0;
                });
            }
            if (scope.filterType) {
                list = list.filter(function (e) { return e.type === scope.filterType; });
            }
            if (scope.filterUnit) {
                list = list.filter(function (e) { return e.unitKey === scope.filterUnit; });
            }

            /* Sort */
            list.sort(function (a, b) {
                var va = a[sortCol], vb = b[sortCol];
                if (typeof va === 'string') return sortAsc ? va.localeCompare(vb, 'he') : vb.localeCompare(va, 'he');
                va = va || 0; vb = vb || 0;
                return sortAsc ? (va - vb) : (vb - va);
            });

            scope.filteredEvents = list;
        }

        /* ── Scope actions ──────────────────── */
        scope.setTab = function (t) { scope.activeTab = t; };
        scope.filterChanged = function () { applyFilters(); };

        scope.doSort = function (col) {
            if (sortCol === col) sortAsc = !sortAsc;
            else { sortCol = col; sortAsc = true; }
            applyFilters();
        };

        scope.getSeverityLabel = function (sev) {
            var labels = { 1: '\u05E0\u05DE\u05D5\u05DA', 2: '\u05D0\u05D6\u05D4\u05E8\u05D4', 3: '\u05D2\u05D1\u05D5\u05D4', 4: '\u05E7\u05E8\u05D9\u05D8\u05D9' };
            return labels[sev] || '';
        };

        scope.formatTime = function (ts) {
            if (!ts) return '---';
            try { return new Date(ts).toLocaleString('he-IL'); } catch (e) { return '---'; }
        };

        scope.formatDuration = function (ms) {
            if (!ms || ms <= 0) return '---';
            var sec = Math.floor(ms / 1000);
            if (sec < 60) return sec + ' \u05E9\u05E0\u05D9\u05D5\u05EA';
            if (sec < 3600) return Math.floor(sec / 60) + ' \u05D3\u05E7\u05D5\u05EA';
            return Math.floor(sec / 3600) + ' \u05E9\u05E2\u05D5\u05EA';
        };

        scope.formatTimeAxis = function (which) {
            var t = which === 'start' ? scope.timeRange.start : scope.timeRange.end;
            return scope.formatTime(t);
        };

        /* Timeline positioning */
        scope.getTimelinePos = function (startTime) {
            var range = scope.timeRange;
            var span = range.end - range.start;
            if (span <= 0) return 0;
            return Math.max(0, Math.min(100, ((startTime - range.start) / span) * 100));
        };

        scope.getTimelineWidth = function (evt) {
            if (!evt.durationMs) return 1; /* Minimum width for point events */
            var span = scope.timeRange.end - scope.timeRange.start;
            if (span <= 0) return 1;
            return Math.max(0.5, Math.min(50, (evt.durationMs / span) * 100));
        };

        scope.getReliabilityColor = function (score) {
            if (score >= 80) return '#2ecc71';
            if (score >= 50) return '#f39c12';
            return '#e74c3c';
        };

        scope.getMTBF = function (unitKey) {
            var rel = scope.unitReliability[unitKey];
            return (rel && rel.mtbf) ? (rel.mtbf + ' \u05E9\u05E2\u05D5\u05EA') : '---';
        };

        scope.getMTTR = function (unitKey) {
            var rel = scope.unitReliability[unitKey];
            return (rel && rel.mttr) ? (rel.mttr + ' \u05E9\u05E2\u05D5\u05EA') : '---';
        };

        scope.getMatrixCellStyle = function (count) {
            if (!count) return {};
            var intensity = Math.min(1, count / 10);
            return { 'background': 'rgba(91,192,235,' + (intensity * 0.3).toFixed(2) + ')' };
        };

        scope.getRowTotal = function (types) {
            var total = 0;
            for (var t in types) {
                if (types.hasOwnProperty(t)) total += (types[t] || 0);
            }
            return total;
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
        displayName: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05EA \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-eventcompare20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05EA \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD',
                timeRangeHours: 168,
                maxEvents: 500,
                showTimeline: true,
                showDuration: true,
                showSeverity: true,
                showRecurrence: true,
                showCrossCorrelation: true,
                showReliabilityScore: true,
                minDurationMinutes: 0,
                maxDurationMinutes: 0,
                StaleThreshold: 300,
                accentColor: '#5BC0EB',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                Height: 550,
                Width: 950
            };
        },
        configTitle: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05EA \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD v20'
    });
})(window.PIVisualization, window.PIV20);
