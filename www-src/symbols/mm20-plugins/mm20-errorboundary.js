/**
 * mm20-errorboundary.js — Error Boundary for MM20 Symbols
 * ═══════════════════════════════════════════════════════════
 * Catch-all error display + retry button.
 * Extends MM20.shield with user-visible error state.
 *
 * Usage:
 *   MM20.ErrorBoundary.attach(scope, elem);
 *   scope._error = 'שגיאה בטעינת נתונים';  // shows error
 *   scope._error = null;                     // clears
 *
 * Namespace: MM20.ErrorBoundary
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
            '.mm20-error-panel { position:absolute; top:0; left:0; right:0; bottom:0; z-index:9200; background:rgba(30,20,20,.92); display:flex; align-items:center; justify-content:center; direction:rtl; }',
            '.mm20-error-box { text-align:center; max-width:320px; padding:16px; }',
            '.mm20-error-icon { font-size:28px; margin-bottom:8px; }',
            '.mm20-error-msg { color:#FF6B6B; font-family:"Segoe UI",sans-serif; font-size:13px; margin-bottom:12px; word-break:break-word; }',
            '.mm20-error-retry { background:#2D4A6F; border:1px solid rgba(91,192,235,.4); color:#D0E4F5; padding:6px 18px; border-radius:4px; cursor:pointer; font-family:"Segoe UI",sans-serif; font-size:12px; }',
            '.mm20-error-retry:hover { background:#3A5F8A; }'
        ].join('\n');
        var s = document.createElement('style');
        s.setAttribute('data-mm20-error', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    MM20.ErrorBoundary = {
        attach: function (scope, elem) {
            try {
                injectCSS();
                var rootEl = elem[0] || elem;
                if (rootEl.style) rootEl.style.position = 'relative';
                var panel = null;

                function show(msg) {
                    hide();
                    MM20.debug('errorBoundary', 'show: ' + msg);
                    panel = document.createElement('div');
                    panel.className = 'mm20-error-panel';
                    panel.innerHTML =
                        '<div class="mm20-error-box">' +
                            '<div class="mm20-error-icon">\u26A0</div>' +
                            '<div class="mm20-error-msg">' + MM20.escapeHtml(msg) + '</div>' +
                            '<button class="mm20-error-retry">\u21BB \u05E0\u05E1\u05D4 \u05E9\u05D5\u05D1</button>' +
                        '</div>';
                    panel.querySelector('.mm20-error-retry').addEventListener('click', function () {
                        hide();
                        scope._error = null;
                        if (scope.$apply) try { scope.$apply(); } catch (e) { /* ignore */ }
                    });
                    rootEl.appendChild(panel);
                }

                function hide() {
                    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
                    panel = null;
                }

                if (scope.$watch) {
                    scope.$watch('_error', function (val) {
                        if (val) show(val); else hide();
                    });
                }

                // wrap() helper for error-shielding functions
                scope._errorWrap = function (fnName, fn) {
                    return MM20.shield.wrap('MM20.ErrorBoundary', fnName, fn);
                };
            } catch (e) {
                MM20.shield.log('ErrorBoundary', 'attach', e);
            }
        }
    };
})(window);
