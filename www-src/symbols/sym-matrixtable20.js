/**
 * ================================================================
 *  sym-matrixtable20.js  --  Operational Matrix Table Symbol v20
 *  Round 6 — Advanced BI Symbols
 * ================================================================
 *  Advanced operational table with:
 *    - Conditional formatting (colors, icons, data bars, badges)
 *    - Row click → cross-filter coordination
 *    - Drillthrough on double-click
 *    - Column sorting + sparkline trend column
 *    - Integration with PIV20.CrossFilter + PIV20.CondFormat
 *
 *  Dependencies:
 *    - piv20-core.js, piv20-crossfilter.js, piv20-condformat.js
 *    - piv20-matrixtable.js, piv20-tooltip-detail.js
 *  ES5 only
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME    = 'matrixtable20';
    var WIDGET_NAME = 'piv20Matrixtable';
    var THROTTLE_MS = 1000;

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    symbolVis.prototype.init = function (scope, el) {
        var PIV20 = window.PIV20;
        if (!PIV20) { console.error('[' + SYM_NAME + '] PIV20 not loaded'); return; }

        var container = el[0] || el;
        var bus = PIV20.createBus();
        var lastProcessTime = 0;

        var _cleanup = { intervals:[], timeouts:[], unwatchers:[], listeners:[], widgets:{} };

        scope.panelOpen  = false;
        scope.liveTime   = PIV20.fmt.time();
        scope.filterCount = 0;

        var symId = SYM_NAME + '-' + Math.random().toString(36).slice(2,7);

        // Listen for cross-filter state changes to show indicator
        if (PIV20.CrossFilter) {
            var unOrig = PIV20.CrossFilter._notifyPanel;
            var wrapped = function () {
                scope.filterCount = PIV20.CrossFilter.getActiveFilterCount();
                if (scope.$apply) {
                    try { scope.$apply(); } catch(e) {}
                }
                unOrig && unOrig();
            };
            // Don't globally replace — use bus
        }

        bus.on('matrix:rowclick', function (payload) {
            scope.liveTime = PIV20.fmt.time();
            scope.filterCount = PIV20.CrossFilter ? PIV20.CrossFilter.getActiveFilterCount() : 0;
            try { scope.$apply(); } catch(e) {}
        });

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

        // Tooltip Detail attachment (if module loaded)
        if (PIV20.TooltipDetail && _widgetRef) {
            PIV20.TooltipDetail.attach(container, 'tbody tr', function (trEl) {
                var $tr = $(trEl);
                var name  = $tr.find('td:first').text() || '';
                var value = $tr.find('td:nth-child(2)').text() || '';
                var status = $tr.find('td:nth-child(3)').text() || 'good';
                return {
                    title:       name,
                    value:       value,
                    unit:        'MW',
                    status:      status,
                    field:       'Name',
                    filterValue: name,
                    spark:       PIV20.TooltipDetail.mockSpark(parseFloat(value) || 50),
                    meta:        ['לחץ לסינון · לחץ פעמיים לפרטים']
                };
            });
        }

        // Data update
        this.onDataUpdate = PIV20.shield.wrap(SYM_NAME, 'dataUpdate', function (data) {
            var now = Date.now();
            if (now - lastProcessTime < THROTTLE_MS) return;
            lastProcessTime = now;
            scope.liveTime = PIV20.fmt.time();
            bus.emit('data:updated', data);
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
        displayName: 'טבלת נתונים מתקדמת v20',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:     '/Scripts/app/editor/symbols/ext/Icons/sym-matrixtable20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape:    'Table',
                Height:       380,
                Width:        700,
                Title:        'טבלת נתונים',
                Decimals:     2,
                minVal:       0,
                maxVal:       100,
                // Conditional formatting thresholds
                warnThreshold: 70,
                critThreshold: 90,
                // Columns: override with custom array for advanced usage
                columns:      null,
                // Cross-filter
                enableCrossFilter: true,
                enableDrillthrough: true,
                // Sorting
                sortBy:       null,
                sortDesc:     false,
                // Style
                fontFamily:   'Segoe UI',
                fontSize:     12,
                headerBg:     '#09192e',
                accentColor:  '#5BC0EB',
                goodColor:    '#2ecc71',
                warnColor:    '#f39c12',
                critColor:    '#e74c3c'
            };
        },
        configTitle: 'טבלת נתונים מתקדמת',
        configOptions: function () { return [{ title: 'Format Symbol', mode: 'format' }]; }
    });

})(window.PIVisualization);
