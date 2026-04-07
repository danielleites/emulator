/* ================================================================
   sym-eftable20.js — Event Frame Table v20 (orchestrator)
   ================================================================ */
(function (PV, PIV20) {
    'use strict';

    var SYM_NAME    = 'eftable20';
    var WIDGET_NAME = 'piv20Eftable';
    var THROTTLE_MS = 1000;

    function symbolVis() { }
    symbolVis.prototype.init = function (scope, elem) {
        var bus   = PIV20.createBus();
        var cfg   = scope.config;
        var $root = elem.find('#ef20-widget');
        $root.show();

        /* ── Scope defaults ─────────────────── */
        scope.events         = [];
        scope.filteredEvents = [];
        scope.searchText     = '';
        scope.severityFilter = 'all';
        scope.ackFilter      = 'all';
        scope.sortCol        = 'time';
        scope.sortAsc        = false;
        scope.page           = 0;
        scope.selectedEvent  = null;
        scope.viewMode       = 'table';
        scope.unackedCount   = 0;
        scope.updatePaused   = false;
        scope.pauseTimestamp = null;
        scope.efMode         = !!cfg.UseRealEF;
        scope.efLoading      = false;
        scope.efError        = null;
        scope.panelOpen      = false;
        scope.annotationText = '';

        /* ── Widget init ────────────────────── */
        PIV20.safeWidget($root, WIDGET_NAME, { bus: bus, config: cfg });

        /* ── Bus listeners ──────────────────── */
        bus.on('eftable:processed', function (d) {
            scope.events       = d.events;
            scope.unackedCount = d.unackedCount;
            scope.updatePaused = d.paused;
            scope.pauseTimestamp = d.pauseTimestamp;
            scope.efMode       = d.efMode;
            doFilter();
            PIV20.safeApply(scope);
        });

        bus.on('eftable:loading', function (loading) {
            scope.efLoading = loading;
            PIV20.safeApply(scope);
        });

        bus.on('eftable:error', function (err) {
            scope.efError = err;
            PIV20.safeApply(scope);
        });

        /* ── Filter + Sort ─────────────────── */
        var filterTimer = null;
        function doFilter() {
            var list = scope.events;

            /* Search text */
            if (scope.searchText) {
                var q = scope.searchText.toLowerCase();
                list = list.filter(function (e) {
                    return (e.name || '').toLowerCase().indexOf(q) >= 0 ||
                           (e.desc || '').toLowerCase().indexOf(q) >= 0;
                });
            }

            /* Severity filter */
            if (scope.severityFilter !== 'all') {
                list = list.filter(function (e) { return e.severity === scope.severityFilter; });
            }

            /* Ack filter */
            if (scope.ackFilter !== 'all') {
                var w = $root.data(WIDGET_NAME);
                list = list.filter(function (e) {
                    var acked = w ? w.isAcknowledged(e.id) : false;
                    return scope.ackFilter === 'acked' ? acked : !acked;
                });
            }

            /* Sort */
            var col = scope.sortCol;
            var asc = scope.sortAsc;
            list.sort(function (a, b) {
                var va = a[col], vb = b[col];
                if (col === 'time') { va = a.rawStart || 0; vb = b.rawStart || 0; }
                if (col === 'severity') {
                    var sevOrder = { crit: 3, warn: 2, ok: 1 };
                    va = sevOrder[a.severity] || 0;
                    vb = sevOrder[b.severity] || 0;
                }
                if (typeof va === 'string') return asc ? va.localeCompare(vb, 'he') : vb.localeCompare(va, 'he');
                return asc ? (va - vb) : (vb - va);
            });

            scope.filteredEvents = list;
            scope.page = 0;
        }

        /* ── Scope actions ──────────────────── */
        scope.filterChanged = function () {
            clearTimeout(filterTimer);
            filterTimer = setTimeout(function () {
                doFilter();
                PIV20.safeApply(scope);
            }, 200);
        };

        scope.setSeverityFilter = function (f) { scope.severityFilter = f; doFilter(); };
        scope.setAckFilter      = function (f) { scope.ackFilter = f; doFilter(); };

        scope.setSort = function (col) {
            if (scope.sortCol === col) scope.sortAsc = !scope.sortAsc;
            else { scope.sortCol = col; scope.sortAsc = true; }
            doFilter();
        };

        scope.getSeverityText = function (sev) {
            if (sev === 'crit') return '\u05E7\u05E8\u05D9\u05D8\u05D9';
            if (sev === 'warn') return '\u05D0\u05D6\u05D4\u05E8\u05D4';
            return '\u05EA\u05E7\u05D9\u05DF';
        };

        /* Pagination */
        var pageSize = cfg.PageSize || 25;
        scope.getPagedEvents = function () {
            var start = scope.page * pageSize;
            return scope.filteredEvents.slice(start, start + pageSize);
        };
        scope.totalPages = function () { return Math.ceil(scope.filteredEvents.length / pageSize) || 1; };
        scope.prevPage = function () { if (scope.page > 0) scope.page--; };
        scope.nextPage = function () { if (scope.page < scope.totalPages() - 1) scope.page++; };

        /* Event selection */
        scope.selectEvent = function (evt) {
            scope.selectedEvent = evt;
            scope.viewMode = 'detail';
        };
        scope.backToTable = function () {
            scope.viewMode = 'table';
            scope.selectedEvent = null;
        };

        /* Acknowledge */
        scope.acknowledgeEvent = function (evt, $event) {
            if ($event) $event.stopPropagation();
            var w = $root.data(WIDGET_NAME);
            if (w) w.acknowledgeEvent(evt.id);
        };
        scope.acknowledgeBulk = function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.acknowledgeBulk();
        };
        scope.isAcknowledged = function (evt) {
            var w = $root.data(WIDGET_NAME);
            return w ? w.isAcknowledged(evt.id) : false;
        };
        scope.getAckInfo = function (evt) {
            var w = $root.data(WIDGET_NAME);
            return w ? w.getAckInfo(evt.id) : null;
        };

        /* Annotations */
        scope.openAnnotation = function (evt, $event) {
            if ($event) $event.stopPropagation();
            scope.selectedEvent = evt;
            scope.viewMode = 'detail';
        };
        scope.saveAnnotation = function () {
            if (!scope.annotationText || !scope.selectedEvent) return;
            var w = $root.data(WIDGET_NAME);
            if (w) w.addAnnotation(scope.selectedEvent.id, scope.annotationText);
            scope.annotationText = '';
        };
        scope.getAnnotations = function (evt) {
            if (!evt) return [];
            var w = $root.data(WIDGET_NAME);
            return w ? w.getAnnotations(evt.id) : [];
        };
        scope.annotationCount = function (evt) {
            if (!evt) return 0;
            var w = $root.data(WIDGET_NAME);
            return w ? w.annotationCount(evt.id) : 0;
        };

        /* Pause / Resume */
        scope.togglePause = function () {
            var w = $root.data(WIDGET_NAME);
            if (w) w.togglePause();
        };

        /* EF Reload */
        scope.loadEF = function () { bus.emit('loadEF'); };

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
            clearTimeout(filterTimer);
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
        displayName: 'Event Frame Table v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-eftable20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                Title: 'Event Frames',
                Decimals: 2,
                UseRealEF: false,
                EFStartTime: '*-7d',
                EFEndTime: '*',
                EFMaxCount: 100,
                WarnThreshold: 50,
                CritThreshold: 80,
                EnableAcknowledge: true,
                PageSize: 25,
                StaleThreshold: 300,
                accentColor: '#5BC0EB',
                warningColor: '#f39c12',
                criticalColor: '#e74c3c',
                fontFamily: 'Segoe UI',
                fontSize: 12,
                Height: 500,
                Width: 850
            };
        },
        configTitle: 'Event Frame Table v20'
    });
})(window.PIVisualization, window.PIV20);
