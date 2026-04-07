/**
 * mu20-print.js — Print Mode for MU20 Symbols
 * ═══════════════════════════════════════════════
 * @media print CSS for white-background printout.
 *
 * Usage:
 *   MU20.Print.attach(scope, elem);
 *
 * Namespace: MU20.Print
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
            '@media print {',
            '  body { background:#fff !important; }',
            '  .mu20-loading-overlay, .mu20-error-panel, .mu20-empty, .mu20-ctx { display:none !important; }',
            '  .mu20-print-root { background:#fff !important; color:#000 !important; border:none !important; box-shadow:none !important; }',
            '  .mu20-print-root * { color:#000 !important; }',
            '  .mu20-print-header { display:block !important; text-align:center; font-size:14px; font-weight:bold; margin-bottom:8px; page-break-after:avoid; }',
            '}'
        ].join('\n');
        var s = document.createElement('style');
        s.setAttribute('data-mu20-print', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    MU20.Print = {
        attach: function (scope, elem) {
            try {
                injectCSS();
                var rootEl = elem[0] || elem;
                rootEl.classList.add('mu20-print-root');

                var hdr = document.createElement('div');
                hdr.className = 'mu20-print-header';
                hdr.style.display = 'none';
                hdr.textContent = (scope.config && scope.config.Title) || 'MU20 Ultimate Monitor';
                rootEl.insertBefore(hdr, rootEl.firstChild);
            } catch (e) {
                MU20.shield.log('Print', 'attach', e);
            }
        }
    };
})(window);
