/**
 * ================================================================
 *  sym-piechart20.js  --  Pie / Donut Chart v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator for the Pie/Donut Chart.
 *  Domain logic lives in piv20-plugins/piv20-piechart.js.
 *
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'piechart20';
    var WIDGET_NAME = 'piv20Piechart';
    var THROTTLE_MS = 800;

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    symbolVis.prototype.init = function (scope, el) {
        var PIV20 = window.PIV20;
        if (!PIV20) { console.error('[' + SYM_NAME + '] PIV20 not loaded'); return; }

        var container = el[0] || el;
        var P = window.PIV10;
        var lastProcessTime = 0;

        var bus = PIV20.createBus();
        var _cleanup = {
            intervals: [], timeouts: [], unwatchers: [],
            listeners: [], widgets: {}, $interval: null, $timeout: null
        };

        // ── Scope state ──
        scope.panelOpen = false;
        scope.liveTime = PIV20.fmt.time();
        scope.viewMode = 'donut';
        scope.slices = [];
        scope.summary = {};
        scope.stats = {};
        scope.hoveredIdx = -1;
        scope.selectedIdx = -1;

        // ── Scope methods ──
        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.setView = function (mode) {
            scope.viewMode = mode;
            bus.emit('view:changed', mode);
        };
        scope.toggleSlice = function (label) {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('toggleSlice', label);
        };
        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };
        scope.sortBy = function (f) {
            if (scope.sortField === f) scope.sortReverse = !scope.sortReverse;
            else { scope.sortField = f; scope.sortReverse = false; }
        };
        scope.getFiltered = function () {
            var items = scope.slices;
            if (scope.filterText) {
                var ft = scope.filterText.toLowerCase();
                items = items.filter(function (sl) {
                    return (sl.label || '').toLowerCase().indexOf(ft) > -1;
                });
            }
            if (scope.sortField) {
                var sf = scope.sortField, r = scope.sortReverse ? -1 : 1;
                items = items.slice().sort(function (a, b) {
                    var va = a[sf], vb = b[sf];
                    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * r;
                    return String(va || '').localeCompare(String(vb || '')) * r;
                });
            }
            return items;
        };

        // ── Canvas mouse interaction ──
        scope.onCanvasMove = function (e) {
            if (!_widgetRef) return;
            var cvs = container.querySelector('.pc20-canvas');
            if (!cvs) return;
            var rect = cvs.getBoundingClientRect();
            var idx = _widgetRef[WIDGET_NAME]('handleHover', e.clientX - rect.left, e.clientY - rect.top);
            if (idx !== scope.hoveredIdx) {
                scope.hoveredIdx = idx;
                scope.$applyAsync();
            }
        };
        scope.onCanvasClick = function (e) {
            if (!_widgetRef) return;
            var cvs = container.querySelector('.pc20-canvas');
            if (!cvs) return;
            var rect = cvs.getBoundingClientRect();
            scope.selectedIdx = _widgetRef[WIDGET_NAME]('handleClick', e.clientX - rect.left, e.clientY - rect.top);
            scope.$applyAsync();
        };
        scope.onCanvasLeave = function () {
            scope.hoveredIdx = -1;
            if (_widgetRef) { _widgetRef[WIDGET_NAME]('handleHover', -999, -999); }
            scope.$applyAsync();
        };

        // ── Listen for processed data from widget ──
        bus.on('chart:processed', function (payload) {
            scope.slices = payload.slices;
            scope.summary = payload.summary;
            scope.stats = payload.stats;
            scope.$applyAsync();
        });

        // ── Init widget ──
        var _widgetRef = PIV20.safeWidget(
            el, '#pc20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05E2\u05D5\u05D2\u05D4 / \u05E1\u05D5\u05E4\u05D2\u05E0\u05D9\u05D4'
        );
        if (_widgetRef) _cleanup.widgets.piechart = { ref: _widgetRef, widgetName: WIDGET_NAME };

        // ── PIV10 shared infra ──
        if (P && P.initSymbol) {
            P.initSymbol(scope, el, {
                name: SYM_NAME,
                onTagDrop: function (path) {
                    scope.symbol.DataSources.push(path);
                    if (P.tagContainer) P.tagContainer.register(scope, path, '', '');
                },
                onExport: function () { scope.exportData(); },
                contextMenuItems: [
                    { label: '\u05E1\u05D5\u05E4\u05D2\u05E0\u05D9\u05D4', icon: '\u25CB', action: function () { scope.setView('donut'); } },
                    { label: '\u05E2\u05D5\u05D2\u05D4', icon: '\u25CF', action: function () { scope.setView('pie'); } },
                    { label: '\u05D8\u05D1\u05DC\u05D4', icon: '\u2630', action: function () { scope.setView('table'); } }
                ]
            });
        } else {
            var _clockInterval = setInterval(function () {
                scope.liveTime = PIV20.fmt.time();
                scope.$applyAsync();
            }, 1000);
            _cleanup.intervals.push({ cancel: function () { clearInterval(_clockInterval); } });
        }

        // ── Data update ──
        this.onDataUpdate = PIV20.shield.wrap(SYM_NAME, 'dataUpdate', function (data) {
            var now = Date.now();
            if (now - lastProcessTime < THROTTLE_MS) return;
            lastProcessTime = now;
            scope.liveTime = PIV20.fmt.time();
            bus.emit('data:updated', data);
        });

        this.onConfigChange = PIV20.shield.wrap(SYM_NAME, 'configChange', function () {
            if (_widgetRef && _widgetRef.data && _widgetRef.data(WIDGET_NAME)) {
                _widgetRef[WIDGET_NAME]('option', 'config', scope.config);
            }
            bus.emit('config:changed', scope.config);
        });

        // ── Docs ──
        scope.showDocs = function (section) {
            if (P && P.docs) P.docs.show(SYM_NAME, container, section);
        };
        if (P && P.docs) P.docs.initTooltips(container, SYM_NAME);

        // ── Destroy ──
        scope.$on('$destroy', function () {
            bus.reset();
            PIV20.destroyHelper(_cleanup);
            scope.slices = null;
            scope.summary = null;
        });
    };

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05E2\u05D5\u05D2\u05D4 / \u05E1\u05D5\u05E4\u05D2\u05E0\u05D9\u05D4 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-piechart20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table', Columns: ['Value'], Height: 350, Width: 500, Decimals: 1, panelOpen: false,
                Title: '\u05EA\u05DE\u05D4\u05D9\u05DC \u05D9\u05D9\u05E6\u05D5\u05E8',
                ChartType: 'donut', InnerRadiusPct: 55, GroupSmallSlicesPct: 3,
                ShowLabels: true, ShowPercentage: true, ShowLegend: true, ShowCenterTotal: true,
                fontFamily: 'Segoe UI', fontSize: 12, headerFontSize: 14, fontBold: false, fontItalic: false,
                headerBg: '#0A1628', rowBg: '#0F2940',
                goodColor: '#2ecc71', warningColor: '#f39c12', criticalColor: '#e74c3c', accentColor: '#5BC0EB',
                animationType: 'fade', animationSpeed: 300, StaleThreshold: 300
            };
        },
        configTitle: '\u05E2\u05D5\u05D2\u05D4 / \u05E1\u05D5\u05E4\u05D2\u05E0\u05D9\u05D4',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
