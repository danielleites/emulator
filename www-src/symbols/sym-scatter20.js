/**
 * ================================================================
 *  sym-scatterplot20.js  --  Scatter / Correlation Plot v20
 * ================================================================
 *  Thin PI Vision orchestrator for the Scatter Plot.
 *  Domain logic in piv20-plugins/piv20-scatterplot.js.
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'scatter20';
    var WIDGET_NAME = 'piv20Scatterplot';
    var THROTTLE_MS = 500;

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
        scope.viewMode = 'scatter';
        scope.seriesArr = [];
        scope.regressionResults = [];
        scope.totalPoints = 0;
        scope.hoverPt = null;

        scope.togglePanel = function () { scope.panelOpen = !scope.panelOpen; };
        scope.setView = function (v) {
            scope.viewMode = v;
            if (v === 'scatter' && _widgetRef) _widgetRef[WIDGET_NAME]('_render');
        };
        scope.clearHistory = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('clearHistory');
            scope.seriesArr = []; scope.regressionResults = []; scope.totalPoints = 0;
        };
        scope.exportData = function () {
            if (_widgetRef) _widgetRef[WIDGET_NAME]('exportCSV');
        };

        // ── Bus listeners ──
        bus.on('scatter:processed', function (payload) {
            scope.seriesArr = payload.seriesArr;
            scope.regressionResults = payload.regressionResults;
            scope.totalPoints = payload.totalPoints;
            scope.$applyAsync();
        });
        bus.on('hover:changed', function (pt) {
            scope.hoverPt = pt;
            scope.$applyAsync();
        });

        // ── Init widget ──
        var _widgetRef = PIV20.safeWidget(
            el, '#sp20-widget', WIDGET_NAME,
            { bus: bus, config: scope.config, container: container },
            '\u05EA\u05E8\u05E9\u05D9\u05DD \u05E4\u05D9\u05D6\u05D5\u05E8'
        );
        if (_widgetRef) _cleanup.widgets.scatterplot = { ref: _widgetRef, widgetName: WIDGET_NAME };

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
                    { label: '\u05E4\u05D9\u05D6\u05D5\u05E8', action: function () { scope.setView('scatter'); } },
                    { label: '\u05E1\u05D8\u05D8\u05D9\u05E1\u05D8\u05D9\u05E7\u05D4', action: function () { scope.setView('stats'); } },
                    { label: '\u05D8\u05D1\u05DC\u05D4', action: function () { scope.setView('table'); } },
                    { sep: true },
                    { label: '\u05E0\u05E7\u05D4 \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D4', action: function () { scope.clearHistory(); } }
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

        scope.showDocs = function (section) {
            if (P && P.docs) P.docs.show(SYM_NAME, container, section);
        };
        if (P && P.docs) P.docs.initTooltips(container, SYM_NAME);

        scope.$on('$destroy', function () {
            bus.reset(); PIV20.destroyHelper(_cleanup);
            scope.seriesArr = null; scope.regressionResults = null;
        });
    };

    PV.symbolCatalog.register({
        typeName: SYM_NAME,
        displayName: '\u05EA\u05E8\u05E9\u05D9\u05DD \u05E4\u05D9\u05D6\u05D5\u05E8 \u2014 \u05DE\u05EA\u05D0\u05DD v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl: '/Scripts/app/editor/symbols/ext/Icons/sym-scatterplot20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table', Columns: ['Value'], Height: 400, Width: 600, Decimals: 2, panelOpen: false,
                Title: '\u05EA\u05E8\u05E9\u05D9\u05DD \u05E4\u05D9\u05D6\u05D5\u05E8 \u2014 \u05DE\u05EA\u05D0\u05DD',
                PairingMode: 'shared_x', ShowRegression: true, ShowR2: true, ShowOutliers: true,
                PointSize: 4, MaxHistory: 200, XLabel: '', YLabel: '',
                XMin: 0, XMax: 0, YMin: 0, YMax: 0,
                fontFamily: 'Segoe UI', fontSize: 12, headerFontSize: 14, fontBold: false, fontItalic: false,
                headerBg: '#0A1628', rowBg: '#0F2940',
                goodColor: '#2ecc71', warningColor: '#f39c12', criticalColor: '#e74c3c', accentColor: '#5BC0EB',
                animationType: 'fade', animationSpeed: 300, StaleThreshold: 300
            };
        },
        configTitle: '\u05EA\u05E8\u05E9\u05D9\u05DD \u05E4\u05D9\u05D6\u05D5\u05E8',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
