/**
 * mm20-contextmenu.js — Context Menu for MM20 Symbols
 * ═══════════════════════════════════════════════════════
 * RTL right-click menu with auto-detect export/refresh/print actions.
 * Uses MM20.shield, MM20.debug, MM20.confirmDialog patterns.
 *
 * Usage:
 *   MM20.ContextMenu.attach(scope, elem, { autoDetect: true });
 *
 * Namespace: MM20.ContextMenu
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
            '.mm20-ctx { position:fixed; z-index:10030; background:#1A2332; border:1px solid rgba(91,192,235,.3); border-radius:4px; padding:4px 0; font-family:"Segoe UI",sans-serif; font-size:12px; direction:rtl; min-width:160px; box-shadow:0 4px 16px rgba(0,0,0,.5); }',
            '.mm20-ctx-item { padding:6px 14px; color:#D0E4F5; cursor:pointer; white-space:nowrap; }',
            '.mm20-ctx-item:hover { background:rgba(91,192,235,.15); }',
            '.mm20-ctx-sep { height:1px; background:rgba(91,192,235,.15); margin:3px 8px; }'
        ].join('\n');
        var s = document.createElement('style');
        s.setAttribute('data-mm20-ctx', '1');
        s.textContent = css;
        document.head.appendChild(s);
    }

    function closeMenu() {
        var old = document.querySelector('.mm20-ctx');
        if (old && old.parentNode) old.parentNode.removeChild(old);
    }

    MM20.ContextMenu = {
        attach: function (scope, elem, opts) {
            try {
                injectCSS();
                opts = opts || {};
                var rootEl = elem[0] || elem;

                rootEl.addEventListener('contextmenu', function (e) {
                    e.preventDefault();
                    closeMenu();

                    var menu = document.createElement('div');
                    menu.className = 'mm20-ctx';

                    var items = [];

                    // Auto-detect available actions
                    if (opts.autoDetect !== false) {
                        if (scope.exportCSV || (root.PIV20 && root.PIV20.Export)) {
                            items.push({ label: '\uD83D\uDCE5 \u05D9\u05D9\u05E6\u05D5\u05D0 CSV', fn: function () { if (scope.exportCSV) scope.exportCSV(); } });
                        }
                        if (scope.refresh || scope.manualRefresh) {
                            items.push({ label: '\u21BB \u05E8\u05E2\u05E0\u05D5\u05DF', fn: function () { (scope.refresh || scope.manualRefresh)(); } });
                        }
                        items.push({ label: '\uD83D\uDDA8 \u05D4\u05D3\u05E4\u05E1\u05D4', fn: function () { window.print(); } });
                    }

                    // Custom items
                    if (opts.items) {
                        items = items.concat(opts.items);
                    }

                    items.forEach(function (item) {
                        if (item.separator) {
                            var sep = document.createElement('div');
                            sep.className = 'mm20-ctx-sep';
                            menu.appendChild(sep);
                        } else {
                            var div = document.createElement('div');
                            div.className = 'mm20-ctx-item';
                            div.textContent = item.label;
                            div.addEventListener('click', function () {
                                closeMenu();
                                try { item.fn(); } catch (err) { MM20.shield.log('ContextMenu', 'action', err); }
                            });
                            menu.appendChild(div);
                        }
                    });

                    menu.style.left = e.clientX + 'px';
                    menu.style.top = e.clientY + 'px';
                    document.body.appendChild(menu);

                    // Adjust if off-screen
                    var rect = menu.getBoundingClientRect();
                    if (rect.right > window.innerWidth) menu.style.left = (e.clientX - rect.width) + 'px';
                    if (rect.bottom > window.innerHeight) menu.style.top = (e.clientY - rect.height) + 'px';

                    // Close on outside click
                    setTimeout(function () {
                        document.addEventListener('click', closeMenu, { once: true });
                    }, 10);
                });

                MM20.debug('contextMenu', 'attached');
            } catch (e) {
                MM20.shield.log('ContextMenu', 'attach', e);
            }
        }
    };
})(window);
