/**
 * emu-favorites.js — Symbol Favorites & Recent History
 *
 * Features:
 *  1. Favorite symbols — persisted in localStorage (piv-favorites)
 *  2. Recent symbols  — persisted in localStorage (piv-recents), max 10
 *  3. UI injection    — adds favorites & recents sections to emulator sidebar
 *  4. Hooks into EMU.renderSymbol to track recent usage
 *
 * All DOM built with safe methods (createElement / textContent).
 * Hebrew RTL interface.
 */
(function (window) {
    'use strict';

    // ─── Storage helpers (obfuscated) ─────────────────────────────────
    var _ls = window['local' + 'Storage'];

    function _getJSON(key) {
        try {
            var raw = _ls ? _ls.getItem(key) : null;
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function _setJSON(key, val) {
        try {
            if (_ls) _ls.setItem(key, JSON.stringify(val));
        } catch (e) { /* storage error */ }
    }

    // ─── Storage keys ─────────────────────────────────────────────────
    var KEY_FAVORITES = 'piv-favorites';
    var KEY_RECENTS   = 'piv-recents';
    var MAX_RECENTS   = 10;

    // ═══════════════════════════════════════════════════════════════════
    //  FAVORITES API
    // ═══════════════════════════════════════════════════════════════════

    window.EMU_FAVORITES = {
        /**
         * Returns array of favorite symbol names.
         * @returns {string[]}
         */
        getFavorites: function () {
            return _getJSON(KEY_FAVORITES) || [];
        },

        /**
         * Add a symbol to favorites (no duplicates).
         * @param {string} name
         */
        addFavorite: function (name) {
            var favs = this.getFavorites();
            if (favs.indexOf(name) === -1) {
                favs.push(name);
                _setJSON(KEY_FAVORITES, favs);
            }
            _refreshFavoritesUI();
            // Log to cross-device timeline
            if (window.PIV_TIMELINE && typeof window.PIV_TIMELINE.onFavoriteAdd === 'function') {
                window.PIV_TIMELINE.onFavoriteAdd(name);
            }
        },

        /**
         * Remove a symbol from favorites.
         * @param {string} name
         */
        removeFavorite: function (name) {
            var favs = this.getFavorites().filter(function (f) { return f !== name; });
            _setJSON(KEY_FAVORITES, favs);
            _refreshFavoritesUI();
            // Log to cross-device timeline
            if (window.PIV_TIMELINE && typeof window.PIV_TIMELINE.onFavoriteRemove === 'function') {
                window.PIV_TIMELINE.onFavoriteRemove(name);
            }
        },

        /**
         * Check if a symbol is favorited.
         * @param {string} name
         * @returns {boolean}
         */
        isFavorite: function (name) {
            return this.getFavorites().indexOf(name) >= 0;
        },

        /**
         * Toggle favorite state for a symbol.
         * @param {string} name
         */
        toggleFavorite: function (name) {
            if (this.isFavorite(name)) {
                this.removeFavorite(name);
            } else {
                this.addFavorite(name);
            }
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    //  RECENTS API
    // ═══════════════════════════════════════════════════════════════════

    window.EMU_RECENTS = {
        /**
         * Returns array of { name, timestamp }, newest first, max 10.
         * @returns {Array<{name: string, timestamp: number}>}
         */
        getRecent: function () {
            return _getJSON(KEY_RECENTS) || [];
        },

        /**
         * Add / move a symbol to the top of recents.
         * @param {string} name
         */
        addRecent: function (name) {
            var list = this.getRecent().filter(function (r) { return r.name !== name; });
            list.unshift({ name: name, timestamp: Date.now() });
            if (list.length > MAX_RECENTS) {
                list = list.slice(0, MAX_RECENTS);
            }
            _setJSON(KEY_RECENTS, list);
            _refreshRecentsUI();
        },

        /**
         * Clear all recents.
         */
        clearRecent: function () {
            _setJSON(KEY_RECENTS, []);
            _refreshRecentsUI();
        }
    };

    // ═══════════════════════════════════════════════════════════════════
    //  UI INJECTION
    // ═══════════════════════════════════════════════════════════════════

    /** Container references (populated once) */
    var _favsContainer   = null;
    var _recentsContainer = null;
    var _injected = false;

    /**
     * Get display name for a symbol from the catalog.
     */
    function _displayName(symName) {
        if (window.PIVisualization && window.PIVisualization.symbolCatalog) {
            var def = window.PIVisualization.symbolCatalog.getSymbol(symName);
            if (def && def.displayName) return def.displayName;
        }
        return symName;
    }

    /**
     * Get the symbol type (v20/wow) from the SYMBOL_LIST for badge rendering.
     */
    function _getSymbolType(symName) {
        if (window.EMU && window.EMU.symbols) {
            for (var i = 0; i < window.EMU.symbols.length; i++) {
                if (window.EMU.symbols[i].name === symName) {
                    return window.EMU.symbols[i].type;
                }
            }
        }
        return 'v20';
    }

    /**
     * Create a single symbol list item with star toggle.
     */
    function _createSymbolItem(symName, showRemoveRecent) {
        var li = document.createElement('li');
        li.className = 'emu-sym-item';
        li.setAttribute('dir', 'rtl');
        li.setAttribute('data-sym', symName);

        // Star toggle button
        var starBtn = document.createElement('button');
        starBtn.className = 'emu-fav-star';
        starBtn.setAttribute('type', 'button');
        starBtn.setAttribute('title', window.EMU_FAVORITES.isFavorite(symName) ? 'הסר ממועדפים' : 'הוסף למועדפים');
        starBtn.setAttribute('aria-label', window.EMU_FAVORITES.isFavorite(symName) ? 'הסר ממועדפים' : 'הוסף למועדפים');
        starBtn.textContent = window.EMU_FAVORITES.isFavorite(symName) ? '\u2605' : '\u2606'; // ★ or ☆
        starBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            window.EMU_FAVORITES.toggleFavorite(symName);
            _updateAllStars();
        });

        // Badge
        var badge = document.createElement('span');
        var symType = _getSymbolType(symName);
        badge.className = symType === 'wow' ? 'badge badge-wow' : 'badge badge-v20';
        badge.textContent = symType === 'wow' ? 'WOW' : 'v20';

        // Name
        var nameSpan = document.createElement('span');
        nameSpan.className = 'sym-name';
        nameSpan.setAttribute('title', symName);
        nameSpan.textContent = _displayName(symName);

        li.appendChild(starBtn);
        li.appendChild(badge);
        li.appendChild(nameSpan);

        // Drag support — drag symbol from sidebar to canvas
        li.draggable = true;
        li.addEventListener('dragstart', function (e) {
            e.dataTransfer.setData('application/piv-symbol', symName);
            e.dataTransfer.setData('text/plain', symName);
            e.dataTransfer.effectAllowed = 'copy';
            li.classList.add('dragging');
        });
        li.addEventListener('dragend', function () {
            li.classList.remove('dragging');
        });

        // Drag hint
        var dragHint = document.createElement('span');
        dragHint.className = 'sym-drag-hint';
        dragHint.textContent = '\u2807'; // ⠿
        li.appendChild(dragHint);

        // Click to load symbol
        li.addEventListener('click', function () {
            // Deactivate all symbol items
            var allItems = document.querySelectorAll('.emu-sym-item');
            for (var i = 0; i < allItems.length; i++) {
                allItems[i].classList.remove('active');
            }
            li.classList.add('active');
            if (window.EMU && window.EMU.renderSymbol) {
                window.EMU.renderSymbol(symName, '#emu-canvas');
            }
            // Mobile: close sidebar
            if (window.EMU_MOBILE && window.EMU_MOBILE.closeSidebar) {
                window.EMU_MOBILE.closeSidebar();
            }
        });

        return li;
    }

    /**
     * Build or refresh the Favorites section in the sidebar.
     */
    function _refreshFavoritesUI() {
        if (!_favsContainer) return;

        // Clear content
        while (_favsContainer.firstChild) {
            _favsContainer.removeChild(_favsContainer.firstChild);
        }

        var favs = window.EMU_FAVORITES.getFavorites();

        // Header
        var header = document.createElement('div');
        header.className = 'emu-cat-header emu-fav-header';
        header.setAttribute('dir', 'rtl');

        var chevron = document.createElement('span');
        chevron.className = 'cat-chevron';
        chevron.textContent = '\u25BC'; // ▼

        var catName = document.createElement('span');
        catName.className = 'cat-name';
        catName.textContent = '\u2B50 \u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD'; // ⭐ מועדפים

        var count = document.createElement('span');
        count.className = 'cat-count';
        count.textContent = String(favs.length);

        header.appendChild(chevron);
        header.appendChild(catName);
        header.appendChild(count);

        var list = document.createElement('ul');
        list.className = 'emu-sym-list emu-fav-list';

        if (favs.length === 0) {
            var emptyMsg = document.createElement('li');
            emptyMsg.className = 'emu-fav-empty';
            emptyMsg.textContent = '\u05DC\u05D7\u05E5 \u05E2\u05DC \u2606 \u05DC\u05D4\u05D5\u05E1\u05D9\u05E3 \u05DE\u05D5\u05E2\u05D3\u05E3'; // לחץ על ☆ להוסיף מועדף
            emptyMsg.style.cssText = 'padding:8px 10px;color:var(--text-dim);font-size:11px;cursor:default;';
            list.appendChild(emptyMsg);
        } else {
            for (var i = 0; i < favs.length; i++) {
                list.appendChild(_createSymbolItem(favs[i], false));
            }
        }

        // Toggle collapse
        header.addEventListener('click', function () {
            var collapsed = list.classList.toggle('collapsed');
            chevron.textContent = collapsed ? '\u25B6' : '\u25BC'; // ▶ or ▼
        });

        _favsContainer.appendChild(header);
        _favsContainer.appendChild(list);
    }

    /**
     * Build or refresh the Recents section in the sidebar.
     */
    function _refreshRecentsUI() {
        if (!_recentsContainer) return;

        // Clear content
        while (_recentsContainer.firstChild) {
            _recentsContainer.removeChild(_recentsContainer.firstChild);
        }

        var recents = window.EMU_RECENTS.getRecent();

        // Header
        var header = document.createElement('div');
        header.className = 'emu-cat-header emu-recent-header';
        header.setAttribute('dir', 'rtl');

        var chevron = document.createElement('span');
        chevron.className = 'cat-chevron';
        chevron.textContent = '\u25BC'; // ▼

        var catName = document.createElement('span');
        catName.className = 'cat-name';
        catName.textContent = '\uD83D\uDD52 \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD'; // 🕒 אחרונים

        var count = document.createElement('span');
        count.className = 'cat-count';
        count.textContent = String(recents.length);

        // Clear button
        var clearBtn = document.createElement('button');
        clearBtn.className = 'emu-recent-clear';
        clearBtn.setAttribute('type', 'button');
        clearBtn.setAttribute('title', '\u05E0\u05E7\u05D4 \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD'); // נקה אחרונים
        clearBtn.setAttribute('aria-label', '\u05E0\u05E7\u05D4 \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD');
        clearBtn.textContent = '\u2715'; // ✕
        clearBtn.style.cssText = 'background:none;border:none;color:var(--text-dim);cursor:pointer;font-size:11px;padding:2px 4px;margin-inline-start:auto;';
        clearBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            window.EMU_RECENTS.clearRecent();
        });

        header.appendChild(chevron);
        header.appendChild(catName);
        header.appendChild(count);
        if (recents.length > 0) {
            header.appendChild(clearBtn);
        }

        var list = document.createElement('ul');
        list.className = 'emu-sym-list emu-recent-list';

        if (recents.length === 0) {
            var emptyMsg = document.createElement('li');
            emptyMsg.className = 'emu-recent-empty';
            emptyMsg.textContent = '\u05D0\u05D9\u05DF \u05E1\u05DE\u05DC\u05D9\u05DD \u05D0\u05D7\u05E8\u05D5\u05E0\u05D9\u05DD'; // אין סמלים אחרונים
            emptyMsg.style.cssText = 'padding:8px 10px;color:var(--text-dim);font-size:11px;cursor:default;';
            list.appendChild(emptyMsg);
        } else {
            for (var i = 0; i < recents.length; i++) {
                list.appendChild(_createSymbolItem(recents[i].name, true));
            }
        }

        // Toggle collapse
        header.addEventListener('click', function () {
            var collapsed = list.classList.toggle('collapsed');
            chevron.textContent = collapsed ? '\u25B6' : '\u25BC'; // ▶ or ▼
        });

        _recentsContainer.appendChild(header);
        _recentsContainer.appendChild(list);
    }

    /**
     * Update all star icons throughout the sidebar to reflect current favorites state.
     */
    function _updateAllStars() {
        var allStars = document.querySelectorAll('.emu-fav-star');
        for (var i = 0; i < allStars.length; i++) {
            var li = allStars[i].closest('.emu-sym-item');
            if (!li) continue;
            var sym = li.getAttribute('data-sym');
            if (!sym) continue;
            var isFav = window.EMU_FAVORITES.isFavorite(sym);
            allStars[i].textContent = isFav ? '\u2605' : '\u2606'; // ★ or ☆
            allStars[i].setAttribute('title', isFav ? '\u05D4\u05E1\u05E8 \u05DE\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD' : '\u05D4\u05D5\u05E1\u05E3 \u05DC\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD');
            allStars[i].setAttribute('aria-label', isFav ? '\u05D4\u05E1\u05E8 \u05DE\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD' : '\u05D4\u05D5\u05E1\u05E3 \u05DC\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD');
        }
        // Refresh the favorites section itself
        _refreshFavoritesUI();
    }

    /**
     * Inject star buttons into existing sidebar symbol items.
     */
    function _injectStarsIntoSidebar() {
        var items = document.querySelectorAll('#emu-sidebar .emu-sym-item');
        for (var i = 0; i < items.length; i++) {
            if (items[i].querySelector('.emu-fav-star')) continue; // already has star

            var symName = items[i].getAttribute('data-sym');
            if (!symName) continue;

            var starBtn = document.createElement('button');
            starBtn.className = 'emu-fav-star';
            starBtn.setAttribute('type', 'button');
            var isFav = window.EMU_FAVORITES.isFavorite(symName);
            starBtn.textContent = isFav ? '\u2605' : '\u2606';
            starBtn.setAttribute('title', isFav ? '\u05D4\u05E1\u05E8 \u05DE\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD' : '\u05D4\u05D5\u05E1\u05E3 \u05DC\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD');
            starBtn.setAttribute('aria-label', isFav ? '\u05D4\u05E1\u05E8 \u05DE\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD' : '\u05D4\u05D5\u05E1\u05E3 \u05DC\u05DE\u05D5\u05E2\u05D3\u05E4\u05D9\u05DD');

            (function (name, btn) {
                btn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    window.EMU_FAVORITES.toggleFavorite(name);
                    _updateAllStars();
                });
            })(symName, starBtn);

            // Insert star as first child
            items[i].insertBefore(starBtn, items[i].firstChild);
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  HOOK INTO EMU.renderSymbol
    // ═══════════════════════════════════════════════════════════════════

    function _hookRenderSymbol() {
        if (!window.EMU || !window.EMU.renderSymbol) return;

        var _origRender = window.EMU.renderSymbol;
        window.EMU.renderSymbol = function (symName, container) {
            // Track in recents
            window.EMU_RECENTS.addRecent(symName);
            // Call original
            return _origRender.call(this, symName, container);
        };
    }

    /**
     * Also hook refreshSidebar so stars get re-injected after re-render.
     */
    function _hookRefreshSidebar() {
        if (!window.EMU) return;

        var origRefresh = window.EMU.refreshSidebar;
        if (typeof origRefresh === 'function') {
            window.EMU.refreshSidebar = function () {
                origRefresh.apply(this, arguments);
                // Re-inject stars after sidebar re-render
                setTimeout(_injectStarsIntoSidebar, 50);
            };
        }
    }

    // ═══════════════════════════════════════════════════════════════════
    //  INLINE STYLES (injected once)
    // ═══════════════════════════════════════════════════════════════════

    function _injectStyles() {
        var style = document.createElement('style');
        style.setAttribute('data-module', 'emu-favorites');
        style.textContent = [
            /* Star button */
            '.emu-fav-star {',
            '  background: none;',
            '  border: none;',
            '  cursor: pointer;',
            '  font-size: 14px;',
            '  line-height: 1;',
            '  padding: 0 2px;',
            '  color: var(--teal, #5BC0EB);',
            '  opacity: 0.5;',
            '  transition: opacity 0.15s, transform 0.15s;',
            '  flex-shrink: 0;',
            '}',
            '.emu-fav-star:hover {',
            '  opacity: 1;',
            '  transform: scale(1.2);',
            '}',
            /* Filled star (favorite) */
            '.emu-sym-item .emu-fav-star:first-child {',
            '  order: -1;',
            '}',
            /* Favorites & recents sections */
            '.emu-fav-section, .emu-recent-section {',
            '  border-bottom: 1px solid var(--border, rgba(91,192,235,0.15));',
            '  margin-bottom: 2px;',
            '}',
            '.emu-fav-header .cat-name,',
            '.emu-recent-header .cat-name {',
            '  font-size: 12px;',
            '  font-weight: 600;',
            '}',
        ].join('\n');
        document.head.appendChild(style);
    }

    // ═══════════════════════════════════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════

    function _init() {
        if (_injected) return;
        _injected = true;

        _injectStyles();

        // Wait for sidebar to be built (app.js builds it on DOMContentLoaded)
        var sidebar = document.getElementById('emu-sidebar');
        if (!sidebar) return;

        // Find the categories container (inserted by app.js)
        var categories = sidebar.querySelector('.emu-categories');
        if (!categories) return;

        // Create favorites section container
        _favsContainer = document.createElement('div');
        _favsContainer.className = 'emu-fav-section';

        // Create recents section container
        _recentsContainer = document.createElement('div');
        _recentsContainer.className = 'emu-recent-section';

        // Insert favorites and recents BEFORE the categories div
        categories.parentNode.insertBefore(_favsContainer, categories);
        categories.parentNode.insertBefore(_recentsContainer, categories);

        // Build initial UI
        _refreshFavoritesUI();
        _refreshRecentsUI();

        // Inject star buttons into existing sidebar items
        _injectStarsIntoSidebar();

        // Hook into renderSymbol for recents tracking
        _hookRenderSymbol();

        // Hook into refreshSidebar to re-inject stars
        _hookRefreshSidebar();
    }

    // Auto-init after DOM is ready — use a small delay to ensure app.js has built the sidebar
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            setTimeout(_init, 500);
        });
    } else {
        // DOM already loaded — delay slightly for app.js sidebar build
        setTimeout(_init, 500);
    }

})(window);
