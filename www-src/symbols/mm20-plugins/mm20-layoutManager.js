/**
 * ═══════════════════════════════════════════════════════
 *  mm20-layoutManager.js  —  Layout Manager Plugin
 * ═══════════════════════════════════════════════════════
 *  Manages dynamic layout: tab order, tab visibility,
 *  custom labels, header toggle, tab bar position,
 *  Developer Layout Mode, tab drag-reorder, persistence.
 *
 *  NOT a jQuery widget — plain constructor on MM20 namespace.
 *  Usage: var lm = new MM20.LayoutManager(rootEl, config, bus);
 *
 *  Version : 20.1.R1
 *  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function (root) {
    'use strict';

    var MM = root.MM20;
    if (!MM) return;

    // ═══════════════════════════════════════
    //  Constants
    // ═══════════════════════════════════════

    var SCHEMA_VERSION = 1;

    /** Default Hebrew labels for each tab key */
    var DEFAULT_TAB_LABELS = {
        realtime:     '\u05D6\u05DE\u05DF \u05D0\u05DE\u05EA',
        heatmap:      '\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD',
        reports:      '\u05D3\u05D5\u05D7\u05D5\u05EA',
        alerts:       '\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA',
        log:          '\u05DC\u05D5\u05D2',
        tags:         '\u05EA\u05D2\u05D9\u05DD',
        tagWarehouse: '\u05DE\u05D7\u05E1\u05DF \u05EA\u05D2\u05D9\u05DD',
        tagExplorer:  '\u05D7\u05E7\u05E8 \u05EA\u05D2\u05D9\u05DD',
        events:       '\u05D9\u05D5\u05DE\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD',
        afbuild:      'AF'
    };

    var DEFAULT_TAB_ORDER = [
        'realtime', 'heatmap', 'reports', 'alerts', 'log',
        'tags', 'tagWarehouse', 'tagExplorer', 'events', 'afbuild'
    ];


    // ═══════════════════════════════════════
    //  Helpers
    // ═══════════════════════════════════════

    /** Deep clone via JSON (safe for plain objects) */
    function _deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }

    /** Factory — returns a clean default Layout object */
    function _getDefaultLayout() {
        var vis = {};
        for (var i = 0; i < DEFAULT_TAB_ORDER.length; i++) {
            vis[DEFAULT_TAB_ORDER[i]] = true;
        }
        return {
            version:        SCHEMA_VERSION,
            editMode:       false,
            showHeader:     true,
            headerHeight:   36,
            tabBarPosition: 'top',
            tabOrder:       DEFAULT_TAB_ORDER.slice(),
            tabVisibility:  vis,
            tabLabels:      {},
            panelSizes:     {}
        };
    }

    /**
     * Ensure config.Layout exists and is up-to-date.
     * Merges missing keys from defaults while preserving user-set values.
     */
    function _ensureLayout(config) {
        var def = _getDefaultLayout();
        if (!config.Layout || typeof config.Layout !== 'object') {
            config.Layout = def;
            return config.Layout;
        }

        var lay = config.Layout;

        // Version migration: fill any missing keys
        if (!lay.version || lay.version < SCHEMA_VERSION) {
            lay.version = SCHEMA_VERSION;
        }
        if (typeof lay.showHeader !== 'boolean')   lay.showHeader = def.showHeader;
        if (typeof lay.headerHeight !== 'number')  lay.headerHeight = def.headerHeight;
        if (typeof lay.editMode !== 'boolean')     lay.editMode = false;
        if (lay.tabBarPosition !== 'top' && lay.tabBarPosition !== 'bottom') {
            lay.tabBarPosition = def.tabBarPosition;
        }
        if (!Array.isArray(lay.tabOrder) || lay.tabOrder.length === 0) {
            lay.tabOrder = def.tabOrder;
        }
        if (!lay.tabVisibility || typeof lay.tabVisibility !== 'object') {
            lay.tabVisibility = def.tabVisibility;
        } else {
            // Ensure every known tab has a visibility entry
            for (var t = 0; t < DEFAULT_TAB_ORDER.length; t++) {
                var key = DEFAULT_TAB_ORDER[t];
                if (typeof lay.tabVisibility[key] !== 'boolean') {
                    lay.tabVisibility[key] = true;
                }
            }
        }
        if (!lay.tabLabels || typeof lay.tabLabels !== 'object') {
            lay.tabLabels = {};
        }
        if (!lay.panelSizes || typeof lay.panelSizes !== 'object') {
            lay.panelSizes = {};
        }

        return lay;
    }


    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════

    /**
     * @param {HTMLElement} rootEl  — .mm20-root element
     * @param {Object}      config — scope.config (PI Vision persisted)
     * @param {Object}      bus    — MM.createBus() instance
     */
    MM.LayoutManager = function (rootEl, config, bus) {

        var _rootEl     = rootEl;
        var _config     = config;
        var _bus        = bus;
        var _layout     = _ensureLayout(config);
        var _editMode   = false;
        var _destroyed  = false;

        // ── Tab drag-reorder state ──
        var _dragState  = null;   // { tabEl, startX, startIdx, clone }
        var _tabBarEl   = null;
        var _onMouseMove = null;
        var _onMouseUp   = null;


        // ─────────────────────────────────────
        //  Getters
        // ─────────────────────────────────────

        function getTabOrder() {
            return _layout.tabOrder.slice();
        }

        function getTabLabel(tabKey) {
            // Custom label takes priority (if non-empty)
            if (_layout.tabLabels[tabKey]) return _layout.tabLabels[tabKey];
            return DEFAULT_TAB_LABELS[tabKey] || tabKey;
        }

        function isTabVisible(tabKey) {
            if (!_layout.tabVisibility) return true;
            return _layout.tabVisibility[tabKey] !== false;
        }

        function isEditMode() {
            return _editMode;
        }


        // ─────────────────────────────────────
        //  Tab Management
        // ─────────────────────────────────────

        function reorderTabs(newOrder) {
            if (!Array.isArray(newOrder)) return;
            _layout.tabOrder = newOrder.slice();
            _bus.emit('layout:tabsReordered', { order: _layout.tabOrder });
        }

        function setTabVisibility(tabKey, visible) {
            if (!_layout.tabVisibility) return;
            _layout.tabVisibility[tabKey] = !!visible;
            _bus.emit('layout:tabVisibility', { tab: tabKey, visible: !!visible });
        }

        function setTabLabel(tabKey, label) {
            _layout.tabLabels[tabKey] = label || '';
            _bus.emit('layout:tabLabel', { tab: tabKey, label: label });
        }


        // ─────────────────────────────────────
        //  Header / Footer / Tab Bar
        // ─────────────────────────────────────

        function setHeaderVisible(visible) {
            _layout.showHeader = !!visible;
            _bus.emit('layout:headerToggled', { visible: !!visible });
        }

        function setHeaderHeight(px) {
            _layout.headerHeight = Math.max(20, Math.min(120, px || 36));
        }

        function setTabBarPosition(pos) {
            _layout.tabBarPosition = (pos === 'bottom') ? 'bottom' : 'top';
        }


        // ─────────────────────────────────────
        //  Panel Sizes
        // ─────────────────────────────────────

        function setPanelSize(panelKey, value) {
            _layout.panelSizes[panelKey] = value;
            _bus.emit('layout:panelResized', { panel: panelKey, size: value });
        }

        function getPanelSize(panelKey, fallback) {
            var v = _layout.panelSizes[panelKey];
            return (v !== undefined && v !== null) ? v : (fallback || 0);
        }


        // ─────────────────────────────────────
        //  Developer Layout Mode
        // ─────────────────────────────────────

        function enterEditMode() {
            _editMode = true;
            _layout.editMode = true;
            _rootEl.classList.add('mm20-layout-edit');
            _bus.emit('layout:editMode', { active: true });
        }

        function exitEditMode() {
            _editMode = false;
            _layout.editMode = false;
            _rootEl.classList.remove('mm20-layout-edit');
            _bus.emit('layout:editMode', { active: false });
        }

        function toggleEditMode() {
            if (_editMode) { exitEditMode(); }
            else           { enterEditMode(); }
        }


        // ─────────────────────────────────────
        //  Persistence
        // ─────────────────────────────────────

        function save() {
            // editMode should never be persisted as true — also exit visually
            _layout.editMode = false;
            if (_editMode) {
                _editMode = false;
                _rootEl.classList.remove('mm20-layout-edit');
            }
            _config.Layout = _deepClone(_layout);
            _bus.emit('layout:saved', { layout: _layout });
        }

        function reset() {
            _layout = _getDefaultLayout();
            _config.Layout = _deepClone(_layout);
            _editMode = false;
            _rootEl.classList.remove('mm20-layout-edit');
            _bus.emit('layout:reset', { layout: _layout });
        }


        // ─────────────────────────────────────
        //  Tab Drag-Reorder
        // ─────────────────────────────────────

        function _getTabButtons() {
            if (!_tabBarEl) return [];
            var btns = _tabBarEl.querySelectorAll('.mm20-tab');
            // Convert NodeList to array
            var arr = [];
            for (var i = 0; i < btns.length; i++) arr.push(btns[i]);
            return arr;
        }

        function _isRTL() {
            if (!_tabBarEl) return false;
            var dir = '';
            try { dir = window.getComputedStyle(_tabBarEl).direction; } catch (e) {}
            return dir === 'rtl';
        }

        function _onTabMouseDown(e) {
            if (_destroyed || !_editMode) return;
            var target = e.target;
            if (!target || !target.classList.contains('mm20-tab')) return;

            var btns = _getTabButtons();
            var idx = -1;
            for (var i = 0; i < btns.length; i++) {
                if (btns[i] === target) { idx = i; break; }
            }
            if (idx < 0) return;

            e.preventDefault();
            _dragState = {
                tabEl:    target,
                startX:   e.clientX,
                startIdx: idx,
                currentIdx: idx
            };
            target.classList.add('mm20-tab--dragging');
        }

        _onMouseMove = function (e) {
            if (!_dragState) return;
            var dx = e.clientX - _dragState.startX;

            // Visual transform always follows cursor (RTL handling is in drop logic)
            _dragState.tabEl.style.transform = 'translateX(' + dx + 'px)';
            _dragState.tabEl.style.msTransform = 'translateX(' + dx + 'px)';

            // Determine drop position by comparing centers
            var btns = _getTabButtons();
            var dragRect = _dragState.tabEl.getBoundingClientRect();
            var dragCenter = dragRect.left + dragRect.width / 2;

            // Clear previous drop indicators
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.remove('mm20-tab--drop-target');
            }

            // Find insertion point
            var newIdx = _dragState.startIdx;
            for (var j = 0; j < btns.length; j++) {
                if (btns[j] === _dragState.tabEl) continue;
                var r = btns[j].getBoundingClientRect();
                var center = r.left + r.width / 2;
                if (_isRTL()) {
                    if (dragCenter > center && j < newIdx) newIdx = j;
                    if (dragCenter < center && j > newIdx) newIdx = j;
                } else {
                    if (dragCenter < center && j < newIdx) newIdx = j;
                    if (dragCenter > center && j > newIdx) newIdx = j;
                }
            }
            _dragState.currentIdx = newIdx;

            // Show drop indicator on target position
            if (newIdx >= 0 && newIdx < btns.length && btns[newIdx] !== _dragState.tabEl) {
                btns[newIdx].classList.add('mm20-tab--drop-target');
            }
        };

        _onMouseUp = function () {
            if (!_dragState) return;

            var tabEl = _dragState.tabEl;
            tabEl.classList.remove('mm20-tab--dragging');
            tabEl.style.transform = '';
            tabEl.style.msTransform = '';

            // Clear all drop indicators
            var btns = _getTabButtons();
            for (var i = 0; i < btns.length; i++) {
                btns[i].classList.remove('mm20-tab--drop-target');
            }

            // Apply reorder if index changed
            var fromIdx = _dragState.startIdx;
            var toIdx   = _dragState.currentIdx;
            if (fromIdx !== toIdx && toIdx >= 0 && toIdx < _layout.tabOrder.length) {
                var order = _layout.tabOrder.slice();
                var item = order.splice(fromIdx, 1)[0];
                order.splice(toIdx, 0, item);
                reorderTabs(order);
            }

            _dragState = null;
        };

        function initTabDragReorder(tabBarEl) {
            _tabBarEl = tabBarEl;
            if (!_tabBarEl) return;

            _tabBarEl.addEventListener('mousedown', _onTabMouseDown);
            document.addEventListener('mousemove', _onMouseMove);
            document.addEventListener('mouseup', _onMouseUp);
        }


        // ─────────────────────────────────────
        //  Cleanup
        // ─────────────────────────────────────

        function destroy() {
            _destroyed = true;

            if (_tabBarEl) {
                _tabBarEl.removeEventListener('mousedown', _onTabMouseDown);
            }
            if (_onMouseMove) {
                document.removeEventListener('mousemove', _onMouseMove);
            }
            if (_onMouseUp) {
                document.removeEventListener('mouseup', _onMouseUp);
            }

            _dragState  = null;
            _tabBarEl   = null;
            _rootEl     = null;
            _config     = null;
            _bus        = null;
            _layout     = null;
        }


        // ─────────────────────────────────────
        //  Public API
        // ─────────────────────────────────────

        return {
            // Getters
            getLayout:          function () { return _layout; },
            getTabOrder:        getTabOrder,
            getTabLabel:        getTabLabel,
            isTabVisible:       isTabVisible,
            isEditMode:         isEditMode,
            getDefaultLabels:   function () { return _deepClone(DEFAULT_TAB_LABELS); },

            // Tab management
            reorderTabs:        reorderTabs,
            setTabVisibility:   setTabVisibility,
            setTabLabel:        setTabLabel,

            // Header / Tab bar
            setHeaderVisible:   setHeaderVisible,
            setHeaderHeight:    setHeaderHeight,
            setTabBarPosition:  setTabBarPosition,

            // Panel sizes
            setPanelSize:       setPanelSize,
            getPanelSize:       getPanelSize,

            // Edit mode
            enterEditMode:      enterEditMode,
            exitEditMode:       exitEditMode,
            toggleEditMode:     toggleEditMode,

            // Persistence
            save:               save,
            reset:              reset,

            // Tab drag-reorder
            initTabDragReorder: initTabDragReorder,

            // Cleanup
            destroy:            destroy
        };
    };

})(window);
