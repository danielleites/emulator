/**
 * mm20-keyboard.js — Keyboard/Accessibility for MM20 Symbols
 * ═══════════════════════════════════════════════════════════════
 * Adds tabIndex, ARIA role/label, and keyboard shortcuts (F5, Ctrl+E).
 *
 * Usage:
 *   MM20.Keyboard.attach(scope, elem, { role: 'region', label: 'מוניטור מוגבלויות' });
 *
 * Namespace: MM20.Keyboard
 */
(function (root) {
    'use strict';
    var MM20 = root.MM20;
    if (!MM20) return;

    MM20.Keyboard = {
        attach: function (scope, elem, opts) {
            try {
                opts = opts || {};
                var rootEl = elem[0] || elem;

                // ARIA attributes
                rootEl.setAttribute('role', opts.role || 'region');
                rootEl.setAttribute('aria-label', opts.label || 'MM20 Symbol');
                if (!rootEl.getAttribute('tabindex')) {
                    rootEl.setAttribute('tabindex', '0');
                }

                // Keyboard handler
                rootEl.addEventListener('keydown', function (e) {
                    // F5 = refresh
                    if (e.key === 'F5' || e.keyCode === 116) {
                        e.preventDefault();
                        MM20.debug('keyboard', 'F5 refresh');
                        if (scope.refresh) scope.refresh();
                        else if (scope.manualRefresh) scope.manualRefresh();
                    }
                    // Ctrl+E = export
                    if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E' || e.keyCode === 69)) {
                        e.preventDefault();
                        MM20.debug('keyboard', 'Ctrl+E export');
                        if (scope.exportCSV) scope.exportCSV();
                    }
                    // Escape = close overlays
                    if (e.key === 'Escape' || e.keyCode === 27) {
                        if (scope._error) { scope._error = null; if (scope.$apply) try { scope.$apply(); } catch (ignore) {} }
                    }
                });

                MM20.debug('keyboard', 'attached with role=' + (opts.role || 'region'));
            } catch (e) {
                MM20.shield.log('Keyboard', 'attach', e);
            }
        }
    };
})(window);
