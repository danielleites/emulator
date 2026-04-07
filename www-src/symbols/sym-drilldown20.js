/**
 * ================================================================
 *  sym-drilldown20.js  --  Drillthrough / Detail Navigation v20
 *  Round 6 — Advanced BI Symbols
 * ================================================================
 *  PI Vision–style detail navigation symbol.
 *  Receives cross-filter selections and shows a rich detail view
 *  with KPIs, sparkline chart, and attribute table.
 *  Supports breadcrumb back-navigation.
 *
 *  Dependencies:
 *    - piv20-core.js, piv20-crossfilter.js, piv20-drilldown.js
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'drilldown20';
    var WIDGET_NAME = 'piv20Drilldown';
    var THROTTLE_MS = 500;

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    symbolVis.prototype.init = function (scope, el) {
        var PIV20 = window.PIV20;
        if (!PIV20) { console.error('[' + SYM_NAME + '] PIV20 not loaded'); return; }

        var container = el[0] || el;
        var bus = PIV20.createBus();
        var lastProcessTime = 0;

        var _cleanup = { intervals:[], timeouts:[], unwatchers:[], listeners:[], widgets:{} };

        scope.panelOpen = false;
        scope.liveTime  = PIV20.fmt.time();

        var symId = SYM_NAME + '-' + Math.random().toString(36).slice(2,7);

        // Init widget
        var _widgetRef = null;
        PIV20.safeWidget($(container), WIDGET_NAME, {
            widgetName: WIDGET_NAME,
            bus:        bus,
            config:     scope.config,
            symId:      symId,
            onCreate: function ($root) {
                _widgetRef = $root;
                _cleanup.widgets[WIDGET_NAME] = $root;
            }
        });

        // Data update
        this.onDataUpdate = PIV20.shield.wrap(SYM_NAME, 'dataUpdate', function (data) {
            var now = Date.now();
            if (now - lastProcessTime < THROTTLE_MS) return;
            lastProcessTime = now;
            scope.liveTime = PIV20.fmt.time();
            if (_widgetRef && _widgetRef.data(WIDGET_NAME)) {
                _widgetRef[WIDGET_NAME]('dataUpdate', data);
            }
        });

        // Config change
        this.onConfigChange = PIV20.shield.wrap(SYM_NAME, 'configChange', function () {
            if (_widgetRef && _widgetRef.data(WIDGET_NAME)) {
                _widgetRef[WIDGET_NAME]('option', 'config', scope.config);
            }
            bus.emit('config:changed', scope.config);
        });

        scope.$on('$destroy', function () {
            bus.reset();
            PIV20.destroyHelper(_cleanup);
        });
    };

    PV.symbolCatalog.register({
        typeName:    SYM_NAME,
        displayName: 'ניווט פרטים v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-drilldown20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'Table',
                Height:    400,
                Width:     450,
                Title:     'פרטי רשומה'
            };
        },
        configTitle: 'ניווט פרטים',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
