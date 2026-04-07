/**
 * ================================================================
 *  sym-paramctrl20.js  --  Parameter Control v20 Orchestrator
 * ================================================================
 *  On-canvas parameter control symbol for PI Vision displays.
 *  Powered by piv20-paramcontrol.js (jQuery widget).
 *
 *  Supported control types (set via config.controlType):
 *    slider    — numeric range slider
 *    stepper   — +/- step buttons
 *    toggle    — boolean on/off
 *    dropdown  — discrete option select
 *    timerange — time range picker with quick presets
 *    text      — free-form text input
 *
 *  Broadcasts via PIV20.CrossFilter._paramStore and PIV20.TimeSync.
 *  ES5 only.
 * ================================================================
 */
(function (PV) {
    'use strict';

    var SYM_NAME   = 'paramctrl20';
    var WIDGET_NAME = 'piv20ParamControl';

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    symbolVis.prototype.init = function (scope, el) {
        var PIV20 = window.PIV20;
        if (!PIV20) { console.error('[' + SYM_NAME + '] PIV20 not loaded'); return; }

        var container = el[0] || el;
        var bus = PIV20.createBus();
        var symId = 'paramctrl-' + Math.random().toString(36).slice(2, 7);

        // Scope defaults
        scope.controlType = scope.config.controlType || 'slider';
        scope.paramName   = scope.config.paramName   || 'param1';

        // Init widget — piv20-paramcontrol.js pre-loaded in index.html
        var _opts = { config: scope.config, bus: bus, symId: symId };

        function _init() {
            var $c = window.jQuery(container);
            if ($c.data('piv20ParamControl')) return; // already init
            try {
                $c.piv20ParamControl(_opts);
            } catch(e) {
                // Fallback: mount directly using widget factory
                var $ = window.jQuery;
                if ($ && $.fn && $.fn.piv20ParamControl) {
                    $(container).piv20ParamControl(_opts);
                }
            }
        }

        // Init: widget available immediately (global script)
        if (window.jQuery && window.jQuery.fn && window.jQuery.fn.piv20ParamControl) {
            _init();
        } else {
            setTimeout(_init, 300);
        }

        // Config change
        this.onConfigChange = function () {
            var $el = $(container).find('.piv20-paramctrl');
            if ($el.length) {
                var w = $el.data('piv20ParamControl');
                if (w && w.update) w.update(scope.config);
            }
        };

        // Destroy
        scope.$on('$destroy', function () {
            PIV20.destroyHelper(container, bus, []);
        });
    };

    // ── Catalog definition ─────────────────────────────────────────────────────

    PV.symbolCatalog.register({
        typeName:   SYM_NAME,
        displayName: 'Parameter Control',
        datasources: 0,
        iconUrl:    '/symbols/Icons/sym-paramctrl20-icon.png',
        visObjectType: symbolVis,
        getDefaultConfig: function () {
            return {
                DataShape: 'None',
                controlType:  'slider',
                paramName:    'param1',
                title:        'Parameter',
                min:          0,
                max:          100,
                step:         1,
                defaultValue: 50,
                unit:         '',
                autoApply:    true,
                options:      ['Option A', 'Option B', 'Option C'],
                defaultPreset: '1h'
            };
        },
        configOptions: function (cfg) {
            return [
                {
                    label: 'Control Type',
                    entries: [
                        { label: 'Type', field: 'controlType', type: 'select',
                          options: ['slider','stepper','toggle','dropdown','timerange','text'] }
                    ]
                },
                {
                    label: 'Parameter',
                    entries: [
                        { label: 'Parameter Name', field: 'paramName', type: 'text' },
                        { label: 'Title', field: 'title', type: 'text' },
                        { label: 'Unit', field: 'unit', type: 'text' }
                    ]
                },
                {
                    label: 'Numeric',
                    entries: [
                        { label: 'Min', field: 'min', type: 'num' },
                        { label: 'Max', field: 'max', type: 'num' },
                        { label: 'Step', field: 'step', type: 'num' },
                        { label: 'Default', field: 'defaultValue', type: 'num' }
                    ]
                },
                {
                    label: 'Behavior',
                    entries: [
                        { label: 'Auto Apply', field: 'autoApply', type: 'bool' }
                    ]
                }
            ];
        }
    });

})(PIVisualization);
