/**
 * wow-emptystate.js — Shadow DOM Native Empty State for WOW Symbols
 * ═══════════════════════════════════════════════════════════════════
 * Shows "אין נתונים" inside shadow root. Fully encapsulated.
 * No jQuery. No global CSS leak.
 *
 * Usage (inside init, after shadow root created):
 *   var es = WOW.EmptyState.attach(scope, shadowRoot, { message: 'אין יחידות' });
 *   es.check(data);  // shows if data is empty, hides if data exists
 *
 * Namespace: window.WOW.EmptyState
 */
(function (root) {
    'use strict';

    if (!root.WOW) root.WOW = {};
    var WOW = root.WOW;

    function ensureStyle(shadowRoot) {
        if (shadowRoot.querySelector('[data-wow-empty]')) return;
        var style = document.createElement('style');
        style.setAttribute('data-wow-empty', '1');
        style.textContent = [
            '.wow-empty { position:absolute; top:0; left:0; right:0; bottom:0; z-index:9050; background:rgba(18,26,38,.7); display:flex; align-items:center; justify-content:center; direction:rtl; opacity:0; transition:opacity .25s ease; pointer-events:none; }',
            '.wow-empty--visible { opacity:1; }',
            '.wow-empty-box { text-align:center; color:#7B8FA3; font-family:"Segoe UI",sans-serif; }',
            '.wow-empty-icon { font-size:32px; margin-bottom:8px; opacity:.6; }',
            '.wow-empty-msg { font-size:13px; }'
        ].join('\n');
        shadowRoot.insertBefore(style, shadowRoot.firstChild);
    }

    WOW.EmptyState = {
        /**
         * Attach empty state to shadow root.
         * @param {Object} scope - AngularJS scope
         * @param {ShadowRoot|Element} shadowRoot - shadow root or fallback
         * @param {Object} [opts] - { message, icon }
         * @returns {{ check: Function, show: Function, hide: Function }}
         */
        attach: function (scope, shadowRoot, opts) {
            try {
                opts = opts || {};
                var sr = shadowRoot.host ? shadowRoot : (shadowRoot.shadowRoot || shadowRoot);
                ensureStyle(sr);

                var panel = null;
                var msg = opts.message || '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D4\u05E6\u05D2\u05D4';
                var icon = opts.icon || '\uD83D\uDCED'; // 📭

                function show() {
                    if (panel) return;
                    panel = document.createElement('div');
                    panel.className = 'wow-empty';
                    panel.innerHTML =
                        '<div class="wow-empty-box">' +
                        '<div class="wow-empty-icon">' + icon + '</div>' +
                        '<div class="wow-empty-msg">' + msg + '</div>' +
                        '</div>';
                    sr.appendChild(panel);
                    panel.offsetHeight; // eslint-disable-line
                    panel.classList.add('wow-empty--visible');
                }

                function hide() {
                    if (!panel) return;
                    try { sr.removeChild(panel); } catch (_e) { /* safe */ }
                    panel = null;
                }

                function check(data) {
                    var empty = !data ||
                        (Array.isArray(data) && data.length === 0) ||
                        (typeof data === 'object' && Object.keys(data).length === 0);
                    if (empty) { show(); } else { hide(); }
                    return empty;
                }

                scope.$on('$destroy', function () { hide(); });

                return { check: check, show: show, hide: hide };
            } catch (e) {
                if (root.WOW && root.WOW.debug) root.WOW.debug('emptystate', e);
                return { check: function () { return false; }, show: function () {}, hide: function () {} };
            }
        }
    };

})(typeof window !== 'undefined' ? window : this);
