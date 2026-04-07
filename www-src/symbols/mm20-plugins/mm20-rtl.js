/**
 * mm20-rtl.js — RTL/Hebrew Support for MM20 Symbols
 * ═══════════════════════════════════════════════════════
 * Applies dir=rtl, text-align, and numeric input normalization.
 *
 * Usage:
 *   MM20.RTL.apply(elem);
 *
 * Namespace: MM20.RTL
 */
(function (root) {
    'use strict';
    var MM20 = root.MM20;
    if (!MM20) return;

    MM20.RTL = {
        apply: function (elem) {
            try {
                var rootEl = elem[0] || elem;
                rootEl.setAttribute('dir', 'rtl');
                rootEl.style.direction = 'rtl';
                rootEl.style.textAlign = 'right';

                // Normalize numeric inputs — keep LTR for numbers
                var inputs = rootEl.querySelectorAll('input[type="number"], input[type="tel"]');
                for (var i = 0; i < inputs.length; i++) {
                    inputs[i].style.direction = 'ltr';
                    inputs[i].style.textAlign = 'left';
                }

                MM20.debug('rtl', 'applied dir=rtl');
            } catch (e) {
                MM20.shield.log('RTL', 'apply', e);
            }
        }
    };
})(window);
