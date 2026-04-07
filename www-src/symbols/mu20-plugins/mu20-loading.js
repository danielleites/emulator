/**
 * mu20-loading.js — Loading State for MU20 Symbols
 * ═══════════════════════════════════════════════════
 * Loading spinner overlay + scope._loading auto-watch.
 * Uses MU20.shield for error safety, no jQuery dependency.
 *
 * Usage:
 *   MU20.Loading.autoBind(scope, elem);
 *   scope._loading = true;   // shows spinner
 *   scope._loading = false;  // hides spinner
 *
 * Namespace: MU20.Loading
 */
(function (root) {
    'use strict';
    var MU20 = root.MU20;
    if (!MU20) return;

    var CSS_INJECTED = false;

    function injectCSS() {
        if (CSS_INJECTED) return;
        CSS_INJECTED = true;
        var css = [
            '.mu20-loading-overlay { position:absolute; top:0; left:0; right:0; bottom:0; z-index:9100; background:rgba(18,26,38,.85); display:flex; align-items:center; justify-content:center; direction:rtl; pointer-events:all; }',
            '.mu20-loading-spinner { width:36px; height:36px; border:3px solid rgba(91,192,235,.2); border-top-color:#5BC0EB; border-radius:50%; animation:mu20spin .8s linear infinite; }',
            '@keyframes mu20spin { to { transform:rotate(360deg); } }',
            '.mu20-loading-text { color:#B0C4DE; font-family:"Segoe UI",sans-serif; font-size:12px; margin-top:8px; text-align:center; }'
        ].join('\n');
        var s = document.createElement('style');
        s.setAttribute('data-mu20-loading', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    MU20.Loading = {
        autoBind: function (scope, elem) {
            try {
                injectCSS();
                var rootEl = elem[0] || elem;
                if (rootEl.style) rootEl.style.position = 'relative';

                var overlay = null;

                function show() {
                    if (overlay) return;
                    overlay = document.createElement('div');
                    overlay.className = 'mu20-loading-overlay';
                    overlay.innerHTML = '<div style="text-align:center"><div class="mu20-loading-spinner"></div><div class="mu20-loading-text">\u05D8\u05D5\u05E2\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD...</div></div>';
                    rootEl.appendChild(overlay);
                }

                function hide() {
                    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
                    overlay = null;
                }

                if (scope.$watch) {
                    scope.$watch('_loading', function (val) {
                        if (val) show(); else hide();
                    });
                }

                scope._showLoading = show;
                scope._hideLoading = hide;
            } catch (e) {
                MU20.shield.log('Loading', 'autoBind', e);
            }
        }
    };
})(window);
