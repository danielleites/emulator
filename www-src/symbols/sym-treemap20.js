/**
 * ================================================================
 *  sym-treemap20.js  --  Treemap Visualization v20 Orchestrator
 * ================================================================
 *  Thin PI Vision orchestrator. Domain logic in piv20-treemap.js.
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME = 'treemap20';
    var WIDGET_NAME = 'piv20Treemap';
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
        var _cleanup = { intervals: [], timeouts: [], unwatchers: [], listeners: [], widgets: {}, $interval: null, $timeout: null };

        scope.panelOpen = false;
        scope.liveTime = PIV20.fmt.time();
        scope.viewMode = 'treemap';
        scope.items = [];
        scope.legend = [];
        scope.summary = {};
        scope.hoveredItem = null;

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.setView = function (mode) { scope.viewMode = mode; bus.emit('view:changed', mode); };
        scope.exportData = function () { if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV'); };

        scope.onCanvasMove = function (e) {
            if (!_widgetRef) return;
            var cvs = container.querySelector('.tm20-canvas');
            if (!cvs) return;
            var rect = cvs.getBoundingClientRect();
            scope.hoveredItem = _widgetRef[WIDGET_NAME]('handleHover', e.clientX - rect.left, e.clientY - rect.top);
            scope.$applyAsync();
        };
        scope.onCanvasLeave = function () {
            scope.hoveredItem = null;
            if (_widgetRef) _widgetRef[WIDGET_NAME]('handleHover', -999, -999);
            scope.$applyAsync();
        };

        scope.sortBy = function (f) {
            if (scope.sortField === f) scope.sortReverse = !scope.sortReverse;
            else { scope.sortField = f; scope.sortReverse = false; }
        };
        scope.getFiltered = function () {
            var items = scope.items;
            if (scope.filterText) {
                var ft = scope.filterText.toLowerCase();
                items = items.filter(function (it) { return (it.label || '').toLowerCase().indexOf(ft) > -1; });
            }
            if (scope.sortField) {
                var sf = scope.sortField, r = scope.sortReverse ? -1 : 1;
                items = items.slice().sort(function (a, b) {
                    var va = a[sf], vb = b[sf];
                    return typeof va === 'number' ? (va - vb) * r : String(va || '').localeCompare(String(vb || '')) * r;
                });
            }
            return items;
        };

        bus.on('treemap:processed', function (payload) {
            scope.items = payload.items;
            scope.legend = payload.legend;
            scope.summary = payload.summary;
            scope.$applyAsync();
        });

        var _widgetRef = PIV20.safeWidget(
            el, '#tm20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05DE\u05E4\u05EA \u05E2\u05E5'
        );
        if (_widgetRef) _cleanup.widgets.treemap = { ref: _widgetRef, widgetName: WIDGET_NAME };

        if (P && P.initSymbol) {
            P.initSymbol(scope, el, {
                name: SYM_NAME,
                onTagDrop: function (path) { scope.symbol.DataSources.push(path); },
                onExport: function () { scope.exportData(); },
                contextMenuItems: [
                    { label: '\u05DE\u05E4\u05EA \u05E2\u05E5', action: function () { scope.setView('treemap'); } },
                    { label: '\u05D8\u05D1\u05DC\u05D4', action: function () { scope.setView('table'); } },
                    { label: '\u05E7\u05D5\u05DE\u05E4\u05E7\u05D8', action: function () { scope.setView('compact'); } }
                ]
            });
        } else {
            var _c = setInterval(function () { scope.liveTime = PIV20.fmt.time(); scope.$applyAsync(); }, 1000);
            _cleanup.intervals.push({ cancel: function () { clearInterval(_c); } });
        }

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

        scope.showDocs = function (section) { if (P && P.docs) P.docs.show(SYM_NAME, container, section); };
        if (P && P.docs) P.docs.initTooltips(container, SYM_NAME);

        scope.$on('$destroy', function () {
            bus.reset(); PIV20.destroyHelper(_cleanup);
            scope.items = null; scope.legend = null;
        });
    };

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05DE\u05E4\u05EA \u05E2\u05E5 v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-treemap20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table', Columns: ['Value'], Height: 400, Width: 600, Decimals: 1, panelOpen: false,
                Title: '\u05DE\u05E4\u05EA \u05E2\u05E5 \u2014 \u05D7\u05DC\u05D5\u05E7\u05EA \u05D4\u05E1\u05E4\u05E7',
                WarnThreshold: 0, CritThreshold: 0, ColorMode: 'category',
                ShowLabels: true, ShowValues: true, ShowPercentage: true, MinRectSize: 30,
                fontFamily: 'Segoe UI', fontSize: 12, headerFontSize: 14, fontBold: false, fontItalic: false,
                headerBg: '#0A1628', rowBg: '#0F2940',
                goodColor: '#2ECC71', warningColor: '#F39C12', criticalColor: '#E74C3C', accentColor: '#5BC0EB',
                animationType: 'fade', animationSpeed: 300, StaleThreshold: 300
            };
        },
        configTitle: '\u05DE\u05E4\u05EA \u05E2\u05E5',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
