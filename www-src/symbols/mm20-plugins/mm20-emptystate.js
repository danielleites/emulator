/**
 * mm20-emptystate.js — Empty State for MM20 Symbols
 * ═══════════════════════════════════════════════════
 * Shows "אין נתונים" message when no data is available.
 *
 * Usage:
 *   var es = MM20.EmptyState.attach(scope, elem, { message: 'אין יחידות' });
 *   es.check(data);  // shows/hides automatically
 *
 * Namespace: MM20.EmptyState
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
            '.mm20-empty { position:absolute; top:0; left:0; right:0; bottom:0; z-index:9050; background:rgba(18,26,38,.7); display:flex; align-items:center; justify-content:center; direction:rtl; }',
            '.mm20-empty-box { text-align:center; color:#7B8FA3; font-family:"Segoe UI",sans-serif; }',
            '.mm20-empty-icon { font-size:32px; margin-bottom:8px; opacity:.6; }',
            '.mm20-empty-msg { font-size:13px; }'
        ].join('\n');
        var s = document.createElement('style');
        s.setAttribute('data-mm20-empty', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    MM20.EmptyState = {
        attach: function (scope, elem, opts) {
            try {
                injectCSS();
                opts = opts || {};
                var rootEl = elem[0] || elem;
                if (rootEl.style) rootEl.style.position = 'relative';
                var panel = null;
                var msg = opts.message || '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D4\u05E6\u05D2\u05D4';

                function show() {
                    if (panel) return;
                    MM20.debug('emptyState', 'show');
                    panel = document.createElement('div');
                    panel.className = 'mm20-empty';
                    panel.innerHTML =
                        '<div class="mm20-empty-box">' +
                            '<div class="mm20-empty-icon">\uD83D\uDCCA</div>' +
                            '<div class="mm20-empty-msg">' + MM20.escapeHtml(msg) + '</div>' +
                        '</div>';
                    rootEl.appendChild(panel);
                }

                function hide() {
                    if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
                    panel = null;
                }

                return {
                    check: function (data) {
                        var empty = !data || (Array.isArray(data) && data.length === 0) ||
                                    (typeof data === 'object' && Object.keys(data).length === 0);
                        if (empty) show(); else hide();
                        return empty;
                    },
                    show: show,
                    hide: hide
                };
            } catch (e) {
                MM20.shield.log('EmptyState', 'attach', e);
                return { check: function () { return false; }, show: function () {}, hide: function () {} };
            }
        }
    };
})(window);
