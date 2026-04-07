/**
 * piv20-kpicard.js — Kpicard widget plugin
 * jQuery widget consumed by sym-kpicard20.js orchestrator.
 * Loaded via <script> in sym-kpicard20-template.html.
 * Depends on piv20-core.js (PIV20 namespace).
 */
(function ($, PIV20) {
    'use strict';

    if (!$ || !$.fn) return;

    var WIDGET = 'piv20Kpicard';

    // Prevent double-registration
    if ($.fn[WIDGET]) return;

    $.fn[WIDGET] = function (optionsOrMethod) {
        return this.each(function () {
            var $el = $(this);
            var instance = $el.data(WIDGET);

            // Method call on existing instance
            if (typeof optionsOrMethod === 'string' && instance) {
                if (typeof instance[optionsOrMethod] === 'function') {
                    var args = Array.prototype.slice.call(arguments, 1);
                    instance[optionsOrMethod].apply(instance, args);
                }
                return;
            }

            // Already initialized
            if (instance) return;

            // Create new instance
            var opts = optionsOrMethod || {};
            var bus = opts.bus;
            var config = opts.config || {};

            var widget = {
                destroy: function () {
                    if (bus) bus.reset();
                    $el.removeData(WIDGET);
                }
            };

            $el.data(WIDGET, widget);
        });
    };

})(window.jQuery, window.PIV20);
