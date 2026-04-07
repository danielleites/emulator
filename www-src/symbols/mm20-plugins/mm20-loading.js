/**
 * mm20-loading.js — Loading State for MM20 Symbols
 * ═══════════════════════════════════════════════════
 * Provides loading spinner overlay + scope._loading auto-watch.
 * Uses MM20.shield for error safety, MM20.debug for tracing.
 *
 * Usage:
 *   MM20.Loading.autoBind(scope, elem);
 *   scope._loading = true;   // shows spinner
 *   scope._loading = false;  // hides spinner
 *
 * Namespace: MM20.Loading
 */
(function (root) {
    'use strict';
    var MM20 = root.MM20;
    if (!MM20) return;

    var CSS_INJECTED = false;

    function injectCSS() {
        if (CSS_INJECTED) return;
        CSS_INJECTED = true;
        var css = [
            '.mm20-loading-overlay { position:absolute; top:0; left:0; right:0; bottom:0; z-index:9100; background:rgba(18,26,38,.85); display:flex; align-items:center; justify-content:center; direction:rtl; pointer-events:all; }',
            '.mm20-loading-spinner { width:36px; height:36px; border:3px solid rgba(91,192,235,.2); border-top-color:#5BC0EB; border-radius:50%; animation:mm20spin .8s linear infinite; }',
            '@keyframes mm20spin { to { transform:rotate(360deg); } }',
            '.mm20-loading-text { color:#B0C4DE; font-family:"Segoe UI",sans-serif; font-size:12px; margin-top:8px; text-align:center; }'
        ].join('\n');
        var s = document.createElement('style');
        s.setAttribute('data-mm20-loading', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    MM20.Loading = {
        /**
         * Auto-bind loading state to scope._loading.
         * Shows/hides spinner overlay when _loading changes.
         */
        autoBind: function (scope, elem) {
            try {
                injectCSS();
                var root = elem[0] || elem;
                if (root.style) root.style.position = 'relative';

                var overlay = null;

                function show() {
                    if (overlay) return;
                    MM20.debug('loading', 'show spinner');
                    overlay = document.createElement('div');
                    overlay.className = 'mm20-loading-overlay';
                    overlay.innerHTML = '<div style="text-align:center"><div class="mm20-loading-spinner"></div><div class="mm20-loading-text">טוען נתונים...</div></div>';
                    root.appendChild(overlay);
                }

                function hide() {
                    if (overlay && overlay.parentNode) {
                        overlay.parentNode.removeChild(overlay);
                        MM20.debug('loading', 'hide spinner');
                    }
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
                MM20.shield.log('Loading', 'autoBind', e);
            }
        }
    };
})(window);
