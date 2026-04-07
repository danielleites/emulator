/**
 * mu20-keyboard.js — Keyboard/Accessibility for MU20 Symbols
 * ═══════════════════════════════════════════════════════════════
 * tabIndex, ARIA, keyboard shortcuts. No jQuery.
 *
 * Usage:
 *   MU20.Keyboard.attach(scope, elem, { role: 'region', label: 'אולטימייט מוגבלויות' });
 *
 * Namespace: MU20.Keyboard
 */
(function (root) {
    'use strict';
    var MU20 = root.MU20;
    if (!MU20) return;

    MU20.Keyboard = {
        attach: function (scope, elem, opts) {
            try {
                opts = opts || {};
                var rootEl = elem[0] || elem;

                rootEl.setAttribute('role', opts.role || 'region');
                rootEl.setAttribute('aria-label', opts.label || 'MU20 Symbol');
                if (!rootEl.getAttribute('tabindex')) {
                    rootEl.setAttribute('tabindex', '0');
                }

                rootEl.addEventListener('keydown', function (e) {
                    if (e.key === 'F5' || e.keyCode === 116) {
                        e.preventDefault();
                        if (scope.refresh) scope.refresh();
                        else if (scope.manualRefresh) scope.manualRefresh();
                    }
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E' || e.keyCode === 69)) {
                        e.preventDefault();
                        if (scope.exportCSV) scope.exportCSV();
                    }
                    if (e.key === 'Escape' || e.keyCode === 27) {
                        if (scope._error) { scope._error = null; if (scope.$apply) try { scope.$apply(); } catch (ignore) {} }
                    }
                });
            } catch (e) {
                MU20.shield.log('Keyboard', 'attach', e);
            }
        }
    };
})(window);
