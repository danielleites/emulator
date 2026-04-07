/**
 * ================================================================
 *  sym-slicer20.js  --  On-Canvas Filter / Slicer Symbol v20
 *  Round 6 — Advanced BI Symbols
 * ================================================================
 *  PI Vision–style on-canvas slicer control.
 *  Provides list, range, button, and dropdown filter controls.
 *  Integrates with PIV20.CrossFilter for cross-symbol coordination.
 *
 *  Dependencies:
 *    - piv20-core.js, piv20-crossfilter.js, piv20-slicer.js
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'slicer20';
    var WIDGET_NAME = 'piv20Slicer';

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    symbolVis.prototype.init = function (scope, el) {
        var PIV20 = window.PIV20;
        if (!PIV20) { console.error('[' + SYM_NAME + '] PIV20 not loaded'); return; }

        var container = el[0] || el;
        var bus = PIV20.createBus();

        var _cleanup = { intervals:[], timeouts:[], unwatchers:[], listeners:[], widgets:{} };

        // Scope state
        scope.panelOpen = false;

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

    // Catalog registration
    PV.symbolCatalog.register({
        typeName:    SYM_NAME,
        displayName: 'מסנן / Slicer v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-slicer20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape:   'Table',
                Height:      300,
                Width:       220,
                Title:       'מסנן',
                slicerType:  'list',    // list | range | button | dropdown
                targetField: 'Name',    // field name to filter on
                multiSelect: true,
                demoType:    'units',   // units | status | regions | shift
                rangeMin:    0,
                rangeMax:    100,
                // Colors (inherits from theme)
                accentColor: '#5BC0EB'
            };
        },
        configTitle: 'מסנן',
        configOptions: function () {
            return [
                { title: 'Format Symbol', mode: 'format' }
            ];
        }
    });

})(window.PIVisualization);
