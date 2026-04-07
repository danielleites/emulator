/**
 * mu20-rtl.js — RTL/Hebrew Support for MU20 Symbols
 * ═══════════════════════════════════════════════════════
 * dir=rtl + numeric input normalization. No jQuery.
 *
 * Usage:
 *   MU20.RTL.apply(elem);
 *
 * Namespace: MU20.RTL
 */
(function (root) {
    'use strict';
    var MU20 = root.MU20;
    if (!MU20) return;

    MU20.RTL = {
        apply: function (elem) {
            try {
                var rootEl = elem[0] || elem;
                rootEl.setAttribute('dir', 'rtl');
                rootEl.style.direction = 'rtl';
                rootEl.style.textAlign = 'right';

                var inputs = rootEl.querySelectorAll('input[type="number"], input[type="tel"]');
                for (var i = 0; i < inputs.length; i++) {
                    inputs[i].style.direction = 'ltr';
                    inputs[i].style.textAlign = 'left';
                }
            } catch (e) {
                MU20.shield.log('RTL', 'apply', e);
            }
        }
    };
})(window);
