/**
 * mm20-resize.js — Resize Observer for MM20 Symbols
 * ═══════════════════════════════════════════════════════
 * ResizeObserver + fallback polling for responsive layout.
 *
 * Usage:
 *   MM20.Resize.observe(scope, elem, function(w, h) { ... });
 *
 * Namespace: MM20.Resize
 */
(function (root) {
    'use strict';
    var MM20 = root.MM20;
    if (!MM20) return;

    MM20.Resize = {
        observe: function (scope, elem, callback) {
            try {
                var rootEl = elem[0] || elem;
                var lastW = 0, lastH = 0;

                function fire() {
                    var w = rootEl.offsetWidth || 0;
                    var h = rootEl.offsetHeight || 0;
                    if (w !== lastW || h !== lastH) {
                        lastW = w; lastH = h;
                        MM20.debug('resize', w + 'x' + h);
                        try { callback(w, h); } catch (e) { MM20.shield.log('Resize', 'callback', e); }
                    }
                }

                if (typeof ResizeObserver !== 'undefined') {
                    var ro = new ResizeObserver(function () { fire(); });
                    ro.observe(rootEl);
                    // Cleanup on $destroy
                    if (scope.$on) {
                        scope.$on('$destroy', function () { ro.disconnect(); });
                    }
                } else {
                    // Fallback polling every 500ms
                    var interval = setInterval(fire, 500);
                    if (scope.$on) {
                        scope.$on('$destroy', function () { clearInterval(interval); });
                    }
                }

                // Initial fire
                setTimeout(fire, 50);
            } catch (e) {
                MM20.shield.log('Resize', 'observe', e);
            }
        }
    };
})(window);
