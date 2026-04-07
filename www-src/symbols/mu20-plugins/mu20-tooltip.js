/**
 * mu20-tooltip.js — Tooltip System for MU20 Symbols
 * ═══════════════════════════════════════════════════
 * Hover tooltips. No jQuery.
 *
 * Usage:
 *   MU20.Tooltip.attach(scope, elem);
 *
 * Namespace: MU20.Tooltip
 */
(function (root) {
    'use strict';
    var MU20 = root.MU20;
    if (!MU20) return;

    var CSS_INJECTED = false;
    var activeTooltip = null;

    function injectCSS() {
        if (CSS_INJECTED) return;
        CSS_INJECTED = true;
        var css = [
            '.mu20-tip { position:fixed; z-index:10020; background:#1A2332; border:1px solid rgba(91,192,235,.3); border-radius:4px; padding:4px 8px; font-family:"Segoe UI",sans-serif; font-size:11px; color:#D0E4F5; direction:rtl; pointer-events:none; box-shadow:0 3px 12px rgba(0,0,0,.4); max-width:240px; white-space:pre-wrap; word-break:break-word; }',
            '.mu20-tip::after { content:""; position:absolute; top:100%; left:50%; transform:translateX(-50%); border:5px solid transparent; border-top-color:#1A2332; }'
        ].join('\n');
        var s = document.createElement('style');
        s.setAttribute('data-mu20-tip', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    function showTip(text, x, y) {
        hideTip();
        injectCSS();
        var tip = document.createElement('div');
        tip.className = 'mu20-tip';
        tip.textContent = text;
        tip.style.left = x + 'px';
        tip.style.top = (y - 30) + 'px';
        document.body.appendChild(tip);
        activeTooltip = tip;

        var rect = tip.getBoundingClientRect();
        if (rect.right > window.innerWidth) tip.style.left = (x - rect.width) + 'px';
        if (rect.top < 0) tip.style.top = (y + 20) + 'px';
    }

    function hideTip() {
        if (activeTooltip && activeTooltip.parentNode) activeTooltip.parentNode.removeChild(activeTooltip);
        activeTooltip = null;
    }

    MU20.Tooltip = {
        attach: function (scope, elem) {
            try {
                injectCSS();
                var rootEl = elem[0] || elem;

                rootEl.addEventListener('mouseover', function (e) {
                    var target = e.target;
                    var text = target.getAttribute('data-mu20-tooltip') || target.getAttribute('data-tooltip') || target.getAttribute('title');
                    if (text) {
                        if (target.hasAttribute('title')) {
                            target.setAttribute('data-mu20-tooltip', text);
                            target.removeAttribute('title');
                        }
                        showTip(text, e.clientX, e.clientY);
                    }
                });

                rootEl.addEventListener('mouseout', function (e) {
                    var target = e.target;
                    if (target.hasAttribute('data-mu20-tooltip') || target.hasAttribute('data-tooltip') || target.hasAttribute('title')) {
                        hideTip();
                    }
                });
            } catch (e) {
                MU20.shield.log('Tooltip', 'attach', e);
            }
        },

        show: function (targetEl, text) {
            var rect = targetEl.getBoundingClientRect();
            showTip(text, rect.left + rect.width / 2, rect.top);
        },

        hide: hideTip
    };
})(window);
