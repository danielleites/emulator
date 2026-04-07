/**
 * wow-loading.js — Shadow DOM Native Loading Spinner for WOW Symbols
 * ═══════════════════════════════════════════════════════════════════
 * Injects loading overlay INSIDE the shadow root for true encapsulation.
 * No jQuery dependency. No global CSS leak.
 *
 * Usage (inside init, after shadow root created):
 *   WOW.Loading.autoBind(scope, shadowRoot);
 *   scope._loading = true;   // shows spinner inside shadow
 *   scope._loading = false;  // hides
 *
 * Namespace: window.WOW.Loading
 */
(function (root) {
    'use strict';

    if (!root.WOW) root.WOW = {};
    var WOW = root.WOW;

    var STYLE_TAG = 'wow-loading-style';

    function ensureStyle(shadowRoot) {
        if (shadowRoot.querySelector('[data-wow-loading]')) return;
        var style = document.createElement('style');
        style.setAttribute('data-wow-loading', '1');
        style.textContent = [
            '.wow-loading-overlay { position:absolute; top:0; left:0; right:0; bottom:0; z-index:9100; background:rgba(18,26,38,.88); display:flex; align-items:center; justify-content:center; direction:rtl; pointer-events:all; opacity:0; transition:opacity .2s ease; }',
            '.wow-loading-overlay--visible { opacity:1; }',
            '.wow-loading-spinner { width:36px; height:36px; border:3px solid rgba(91,192,235,.15); border-top-color:#5BC0EB; border-radius:50%; animation:wowSpin .8s linear infinite; }',
            '@keyframes wowSpin { to { transform:rotate(360deg); } }',
            '.wow-loading-text { color:#B0C4DE; font-family:"Segoe UI",sans-serif; font-size:12px; margin-top:8px; text-align:center; }'
        ].join('\n');
        shadowRoot.insertBefore(style, shadowRoot.firstChild);
    }

    WOW.Loading = {
        /**
         * Auto-bind loading state to scope._loading.
         * @param {Object} scope - AngularJS scope
         * @param {ShadowRoot|Element} shadowRoot - shadow root or fallback element
         * @param {Object} [opts] - { message: 'טוען...' }
         * @returns {Function} unwatch function for cleanup
         */
        autoBind: function (scope, shadowRoot, opts) {
            try {
                opts = opts || {};
                var root = shadowRoot.host ? shadowRoot : (shadowRoot.shadowRoot || shadowRoot);
                ensureStyle(root);

                var overlay = null;
                var msg = opts.message || '\u05D8\u05D5\u05E2\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD...';

                function show() {
                    if (overlay) return;
                    overlay = document.createElement('div');
                    overlay.className = 'wow-loading-overlay';
                    overlay.innerHTML =
                        '<div style="text-align:center">' +
                        '<div class="wow-loading-spinner"></div>' +
                        '<div class="wow-loading-text">' + msg + '</div>' +
                        '</div>';
                    root.appendChild(overlay);
                    // Trigger reflow for CSS transition
                    overlay.offsetHeight; // eslint-disable-line no-unused-expressions
                    overlay.classList.add('wow-loading-overlay--visible');
                }

                function hide() {
                    if (!overlay) return;
                    try { root.removeChild(overlay); } catch (_e) { /* safe */ }
                    overlay = null;
                }

                // Watch scope._loading
                var unwatch = scope.$watch('_loading', function (nv) {
                    if (nv) { show(); } else { hide(); }
                });

                // Cleanup on scope destroy
                scope.$on('$destroy', function () {
                    hide();
                    unwatch();
                });

                return unwatch;
            } catch (e) {
                if (root.WOW && root.WOW.debug) root.WOW.debug('loading', e);
                return function () {}; // noop unwatch
            }
        }
    };

})(typeof window !== 'undefined' ? window : this);
