/**
 * ═══════════════════════════════════════════════════════
 *  mu20-layout.js  —  Layout Manager Plugin (MU20)
 * ═══════════════════════════════════════════════════════
 *  Manages tab order, visibility, labels with drag-reorder.
 *  Persists layout via onLayoutChange callback.
 *
 *  Version: ULT.1.7  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-layout] MU20 core not loaded'); return; }

    /**
     * @param {Array} defaultTabs - Array of { id, label, icon } from TABS constant
     * @param {Object|null} savedLayout - config.Layout or null
     * @param {Object} bus - event bus
     * @param {Function} onLayoutChange - callback(layoutObj) to persist
     */
    function Mu20Layout(defaultTabs, savedLayout, bus, onLayoutChange) {
        this._defaultTabs = defaultTabs;
        this._bus = bus;
        this._onLayoutChange = onLayoutChange || null;
        this._editMode = false;

        // Build default label map
        this._defaultLabels = {};
        this._defaultOrder = [];
        for (var i = 0; i < defaultTabs.length; i++) {
            this._defaultLabels[defaultTabs[i].id] = defaultTabs[i].label;
            this._defaultOrder.push(defaultTabs[i].id);
        }

        // Load saved or use defaults
        this._layout = this._normalize(savedLayout);
    }

    /** Ensure layout has valid structure */
    Mu20Layout.prototype._normalize = function (raw) {
        var layout = {
            tabOrder: this._defaultOrder.slice(),
            hidden: [],
            labels: {},
            showHeader: true
        };
        if (!raw) return layout;

        // Validate tabOrder — must contain only known tab IDs
        if (raw.tabOrder && Array.isArray(raw.tabOrder)) {
            var validOrder = [];
            var seen = {};
            for (var i = 0; i < raw.tabOrder.length; i++) {
                var id = raw.tabOrder[i];
                if (this._defaultLabels[id] && !seen[id]) {
                    validOrder.push(id);
                    seen[id] = true;
                }
            }
            // Append any missing tabs at the end
            for (var j = 0; j < this._defaultOrder.length; j++) {
                if (!seen[this._defaultOrder[j]]) {
                    validOrder.push(this._defaultOrder[j]);
                }
            }
            layout.tabOrder = validOrder;
        }

        if (raw.hidden && Array.isArray(raw.hidden)) {
            layout.hidden = raw.hidden.slice();
        }
        if (raw.labels && typeof raw.labels === 'object') {
            for (var k in raw.labels) {
                if (raw.labels.hasOwnProperty(k) && this._defaultLabels[k]) {
                    layout.labels[k] = String(raw.labels[k]);
                }
            }
        }
        if (raw.showHeader === false) layout.showHeader = false;

        return layout;
    };

    /** Get ordered array of tab IDs */
    Mu20Layout.prototype.getTabOrder = function () {
        return this._layout.tabOrder.slice();
    };

    /** Check if a tab is visible */
    Mu20Layout.prototype.isTabVisible = function (tabId) {
        return this._layout.hidden.indexOf(tabId) === -1;
    };

    /** Get label for a tab (custom or default) */
    Mu20Layout.prototype.getTabLabel = function (tabId) {
        return this._layout.labels[tabId] || this._defaultLabels[tabId] || tabId;
    };

    /** Get full layout object */
    Mu20Layout.prototype.getLayout = function () {
        return this._layout;
    };

    /** Toggle edit mode */
    Mu20Layout.prototype.toggleEditMode = function () {
        this._editMode = !this._editMode;
        this._bus.emit('layout:editModeChanged', { active: this._editMode });
    };

    /** Is edit mode active */
    Mu20Layout.prototype.isEditMode = function () {
        return this._editMode;
    };

    /** Toggle tab visibility */
    Mu20Layout.prototype.toggleTabVisibility = function (tabId) {
        var idx = this._layout.hidden.indexOf(tabId);
        if (idx >= 0) {
            this._layout.hidden.splice(idx, 1);
        } else {
            // Don't hide last visible tab
            var visibleCount = 0;
            for (var i = 0; i < this._layout.tabOrder.length; i++) {
                if (this._layout.hidden.indexOf(this._layout.tabOrder[i]) === -1) visibleCount++;
            }
            if (visibleCount <= 1) return;
            this._layout.hidden.push(tabId);
        }
        this._bus.emit('layout:tabsReordered');
    };

    /** Set custom label for a tab */
    Mu20Layout.prototype.setTabLabel = function (tabId, label) {
        if (!label || label === this._defaultLabels[tabId]) {
            delete this._layout.labels[tabId];
        } else {
            this._layout.labels[tabId] = label;
        }
        this._bus.emit('layout:tabsReordered');
    };

    /** Move tab from one position to another */
    Mu20Layout.prototype.moveTab = function (fromIdx, toIdx) {
        var order = this._layout.tabOrder;
        if (fromIdx < 0 || fromIdx >= order.length) return;
        if (toIdx < 0 || toIdx >= order.length) return;
        var item = order.splice(fromIdx, 1)[0];
        order.splice(toIdx, 0, item);
        this._bus.emit('layout:tabsReordered');
    };

    /** Save layout to config via callback */
    Mu20Layout.prototype.save = function () {
        if (this._onLayoutChange) {
            this._onLayoutChange(JSON.parse(JSON.stringify(this._layout)));
        }
    };

    /** Reset to defaults */
    Mu20Layout.prototype.reset = function () {
        this._layout = this._normalize(null);
        this._editMode = false;
        this._bus.emit('layout:tabsReordered');
        this._bus.emit('layout:editModeChanged', { active: false });
    };

    /** Destroy */
    Mu20Layout.prototype.destroy = function () {
        this._bus = null;
        this._onLayoutChange = null;
    };

    window.Mu20Layout = Mu20Layout;
})();
