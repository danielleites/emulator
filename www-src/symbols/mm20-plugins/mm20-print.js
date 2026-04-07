/**
 * mm20-print.js — Print Mode for MM20 Symbols
 * ═══════════════════════════════════════════════
 * Injects @media print CSS for clean, white-background printout.
 *
 * Usage:
 *   MM20.Print.attach(scope, elem);
 *
 * Namespace: MM20.Print
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
            '@media print {',
            '  body { background:#fff !important; }',
            '  .mm20-loading-overlay, .mm20-error-panel, .mm20-empty, .mm20-ctx { display:none !important; }',
            '  .mm20-print-root { background:#fff !important; color:#000 !important; border:none !important; box-shadow:none !important; }',
            '  .mm20-print-root * { color:#000 !important; }',
            '  .mm20-print-header { display:block !important; text-align:center; font-size:14px; font-weight:bold; margin-bottom:8px; page-break-after:avoid; }',
            '}'
        ].join('\n');
        var s = document.createElement('style');
        s.setAttribute('data-mm20-print', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    MM20.Print = {
        attach: function (scope, elem) {
            try {
                injectCSS();
                var rootEl = elem[0] || elem;
                rootEl.classList.add('mm20-print-root');

                // Add print header (hidden except in print)
                var hdr = document.createElement('div');
                hdr.className = 'mm20-print-header';
                hdr.style.display = 'none';
                hdr.textContent = (scope.config && scope.config.Title) || 'MM20 Monitor';
                rootEl.insertBefore(hdr, rootEl.firstChild);

                MM20.debug('print', 'attached');
            } catch (e) {
                MM20.shield.log('Print', 'attach', e);
            }
        }
    };
})(window);
