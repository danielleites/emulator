/**
 * wow-errorboundary.js — Shadow DOM Native Error Boundary for WOW Symbols
 * ═══════════════════════════════════════════════════════════════════════════
 * Catch-all error display + retry inside shadow root. Fully encapsulated.
 * No jQuery. No global CSS leak.
 *
 * Usage (inside init, after shadow root created):
 *   WOW.ErrorBoundary.attach(scope, shadowRoot);
 *   scope._error = 'שגיאה בטעינת נתונים';  // shows error inside shadow
 *   scope._error = null;                     // clears
 *
 * Namespace: window.WOW.ErrorBoundary
 */
(function (root) {
    'use strict';

    if (!root.WOW) root.WOW = {};
    var WOW = root.WOW;

    function ensureStyle(shadowRoot) {
        if (shadowRoot.querySelector('[data-wow-error]')) return;
        var style = document.createElement('style');
        style.setAttribute('data-wow-error', '1');
        style.textContent = [
            '.wow-error-panel { position:absolute; top:0; left:0; right:0; bottom:0; z-index:9200; background:rgba(30,20,20,.92); display:flex; align-items:center; justify-content:center; direction:rtl; opacity:0; transition:opacity .2s ease; }',
            '.wow-error-panel--visible { opacity:1; }',
            '.wow-error-box { text-align:center; max-width:320px; padding:16px; }',
            '.wow-error-icon { font-size:28px; margin-bottom:8px; }',
            '.wow-error-msg { color:#FF6B6B; font-family:"Segoe UI",sans-serif; font-size:13px; margin-bottom:12px; word-break:break-word; }',
            '.wow-error-retry { background:#2D4A6F; border:1px solid rgba(91,192,235,.4); color:#D0E4F5; padding:6px 18px; border-radius:4px; cursor:pointer; font-family:"Segoe UI",sans-serif; font-size:12px; transition:background .15s; }',
            '.wow-error-retry:hover { background:#3A5F8A; }'
        ].join('\n');
        shadowRoot.insertBefore(style, shadowRoot.firstChild);
    }

    function escapeHtml(s) {
        if (!s) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    WOW.ErrorBoundary = {
        /**
         * Attach error boundary to shadow root.
         * Watches scope._error; shows/hides panel.
         * @param {Object} scope - AngularJS scope
         * @param {ShadowRoot|Element} shadowRoot - shadow root or fallback
         * @param {Object} [opts] - { onRetry: Function }
         * @returns {Function} unwatch function
         */
        attach: function (scope, shadowRoot, opts) {
            try {
                opts = opts || {};
                var sr = shadowRoot.host ? shadowRoot : (shadowRoot.shadowRoot || shadowRoot);
                ensureStyle(sr);

                var panel = null;

                function show(msg) {
                    hide();
                    panel = document.createElement('div');
                    panel.className = 'wow-error-panel';
                    panel.innerHTML =
                        '<div class="wow-error-box">' +
                        '<div class="wow-error-icon">\u26A0\uFE0F</div>' +
                        '<div class="wow-error-msg">' + escapeHtml(msg) + '</div>' +
                        '<button class="wow-error-retry">\u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1</button>' +
                        '</div>';

                    var retryBtn = panel.querySelector('.wow-error-retry');
                    if (retryBtn) {
                        retryBtn.addEventListener('click', function () {
                            scope._error = null;
                            try { scope.$apply(); } catch (_e) { /* safe */ }
                            if (typeof opts.onRetry === 'function') {
                                try { opts.onRetry(); } catch (_e2) { /* safe */ }
                            }
                        });
                    }

                    sr.appendChild(panel);
                    panel.offsetHeight; // eslint-disable-line
                    panel.classList.add('wow-error-panel--visible');
                }

                function hide() {
                    if (!panel) return;
                    // Remove retry listener by removing the element
                    try { sr.removeChild(panel); } catch (_e) { /* safe */ }
                    panel = null;
                }

                var unwatch = scope.$watch('_error', function (nv) {
                    if (nv) { show(nv); } else { hide(); }
                });

                scope.$on('$destroy', function () {
                    hide();
                    unwatch();
                });

                return unwatch;
            } catch (e) {
                if (root.WOW && root.WOW.debug) root.WOW.debug('errorboundary', e);
                return function () {}; // noop
            }
        }
    };

})(typeof window !== 'undefined' ? window : this);
