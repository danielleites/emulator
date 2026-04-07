/**
 * mu20-resize.js — Resize Observer for MU20 Symbols
 * ═══════════════════════════════════════════════════════
 * ResizeObserver + fallback. No jQuery.
 *
 * Usage:
 *   MU20.Resize.observe(scope, elem, function(w, h) { ... });
 *
 * Namespace: MU20.Resize
 */
(function (root) {
    'use strict';
    var MU20 = root.MU20;
    if (!MU20) return;

    MU20.Resize = {
        observe: function (scope, elem, callback) {
            try {
                var rootEl = elem[0] || elem;
                var lastW = 0, lastH = 0;

                function fire() {
                    var w = rootEl.offsetWidth || 0;
                    var h = rootEl.offsetHeight || 0;
                    if (w !== lastW || h !== lastH) {
                        lastW = w; lastH = h;
                        try { callback(w, h); } catch (e) { MU20.shield.log('Resize', 'callback', e); }
                    }
                }

                if (typeof ResizeObserver !== 'undefined') {
                    var ro = new ResizeObserver(function () { fire(); });
                    ro.observe(rootEl);
                    if (scope.$on) {
                        scope.$on('$destroy', function () { ro.disconnect(); });
                    }
                } else {
                    var interval = setInterval(fire, 500);
                    if (scope.$on) {
                        scope.$on('$destroy', function () { clearInterval(interval); });
                    }
                }

                setTimeout(fire, 50);
            } catch (e) {
                MU20.shield.log('Resize', 'observe', e);
            }
        }
    };
})(window);
