/**
 * ═══════════════════════════════════════════════════════
 *  mu20-tagWarehouse.js  —  Smart Tag Warehouse
 * ═══════════════════════════════════════════════════════
 *  Manages tag-to-object bindings inside the symbol.
 *  Shows which tag is assigned to which role for each
 *  site/unit/widget object.
 *
 *  Three-panel layout:
 *    [Object Tree]  [Role Slots]  [Binding Details]
 *
 *  Ported from mm20-tagWarehouse.js (jQuery widget → vanilla ES5).
 *  Constructor: Mu20TagWarehouse(shadowRoot, containerEl, options, bus)
 *  Version: ULT.1.6  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-tagWarehouse] MU20 core not loaded'); return; }


    // ── Role definitions per object type ──
    var ROLE_DEFS = {
        site: [
            { key: 'totalProductionTag', label: '\u05EA\u05D2 \u05D9\u05D9\u05E6\u05D5\u05E8 \u05DB\u05D5\u05DC\u05DC', required: false },
            { key: 'totalPowerTag',      label: '\u05EA\u05D2 \u05D4\u05E1\u05E4\u05DA \u05DB\u05D5\u05DC\u05DC', required: false },
            { key: 'alarmCountTag',      label: '\u05EA\u05D2 \u05E1\u05E4\u05D9\u05E8\u05EA \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA', required: false }
        ],
        unit: [
            { key: 'productionTag',   label: '\u05EA\u05D2 \u05D9\u05D9\u05E6\u05D5\u05E8',    required: true },
            { key: 'powerTag',        label: '\u05EA\u05D2 \u05D4\u05E1\u05E4\u05DA',    required: false },
            { key: 'availabilityTag', label: '\u05EA\u05D2 \u05D6\u05DE\u05D9\u05E0\u05D5\u05EA', required: false },
            { key: 'alarmTag',        label: '\u05EA\u05D2 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA', required: false },
            { key: 'qualityTag',      label: '\u05EA\u05D2 \u05D0\u05D9\u05DB\u05D5\u05EA', required: false },
            { key: 'temperatureTag',  label: '\u05EA\u05D2 \u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4', required: false },
            { key: 'efficiencyTag',   label: '\u05EA\u05D2 \u05E0\u05E6\u05D9\u05DC\u05D5\u05EA', required: false },
            { key: 'emissionsTag',    label: '\u05EA\u05D2 \u05E4\u05DC\u05D9\u05D8\u05D5\u05EA', required: false }
        ]
    };

    // ── DOM helper ──
    function _el(tag, cls, style) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        if (style) el.setAttribute('style', style);
        return el;
    }

    function _txt(tag, cls, text) {
        var el = _el(tag, cls);
        el.textContent = text;
        return el;
    }

    // Simple object merge (replaces $.extend)
    function _merge(target, source) {
        if (!source) return target;
        for (var k in source) {
            if (source.hasOwnProperty(k)) target[k] = source[k];
        }
        return target;
    }


    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════

    /**
     * @param {ShadowRoot} shadowRoot
     * @param {HTMLElement} containerEl
     * @param {Object} options
     * @param {Object} bus
     */
    function Mu20TagWarehouse(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._bus       = bus;
        self._opts      = options || {};
        self._destroyed = false;

        self._sites             = self._opts.sites || MU.SITES || [];
        self._api               = self._opts.api || null;
        self._demoMode          = !!self._opts.demoMode;
        self._defaultBindings   = self._opts.defaultBindings || {};
        self._userBindings      = self._opts.userBindings || {};
        self._allowRebinding    = self._opts.allowUserRebinding !== false;

        self._objectRegistry    = [];
        self._effectiveBindings = {};
        self._selectedObject    = null;
        self._discoveredTags    = [];

        // DOM refs
        self._treeEl    = null;
        self._slotsEl   = null;
        self._detailEl  = null;
        self._statusBar = null;
        self._assignDialogEl = null;
        self._pendingAssign  = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('tagWarehouse', 'constructor', e);
            MU.shield.renderFallback(self._container, '\u05DE\u05D7\u05E1\u05DF \u05EA\u05D2\u05D9\u05DD', e);
        }
    }


    // ═══════════════════════════════════════
    //  Mount DOM
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._mount = function () {
        var self = this;
        var c = self._container;
        c.className = 'mu20-warehouse-root';
        c.setAttribute('dir', 'rtl');

        // ── Header bar ──
        var header = _el('div', 'mu20-warehouse-header');
        header.setAttribute('dir', 'rtl');

        header.appendChild(_txt('span', 'mu20-warehouse-title', '\u05DE\u05D7\u05E1\u05DF \u05EA\u05D2\u05D9\u05DD \u05D7\u05DB\u05DD'));

        self._statusBar = _el('span', 'mu20-warehouse-status');
        header.appendChild(self._statusBar);

        var validateBtn = _el('button', 'mu20-btn mu20-warehouse-validate');
        validateBtn.textContent = '\u2714 \u05D0\u05DE\u05EA \u05E9\u05D9\u05D5\u05DB\u05D9\u05DD';
        validateBtn.addEventListener('click', function () { self._validateAll(); });
        header.appendChild(validateBtn);

        var exportBtn = _el('button', 'mu20-btn');
        exportBtn.textContent = '\u05D9\u05E6\u05D0 CSV';
        exportBtn.addEventListener('click', function () { self._exportCsv(); });
        header.appendChild(exportBtn);

        c.appendChild(header);

        // ── Three-panel layout ──
        var panels = _el('div', 'mu20-warehouse-panels');
        panels.setAttribute('dir', 'rtl');

        // Panel 1: Object Tree
        self._treeEl = _el('div', 'mu20-warehouse-tree');
        self._treeEl.appendChild(_txt('div', 'mu20-warehouse-panel-title', '\u05D0\u05D5\u05D1\u05D9\u05D9\u05E7\u05D8\u05D9\u05DD'));
        panels.appendChild(self._treeEl);

        // Panel 2: Role Slots
        self._slotsEl = _el('div', 'mu20-warehouse-slots');
        self._slotsEl.appendChild(_txt('div', 'mu20-warehouse-panel-title', '\u05EA\u05E4\u05E7\u05D9\u05D3\u05D9\u05DD / Slots'));
        panels.appendChild(self._slotsEl);

        // Panel 3: Binding Details
        self._detailEl = _el('div', 'mu20-warehouse-detail');
        self._detailEl.appendChild(_txt('div', 'mu20-warehouse-panel-title', '\u05E4\u05E8\u05D8\u05D9 \u05E9\u05D9\u05D5\u05DA'));
        panels.appendChild(self._detailEl);

        c.appendChild(panels);

        // ── Assign dialog (hidden) ──
        self._buildAssignDialog(c);

        // ── Bus subscriptions ──
        if (self._bus) {
            self._onDataUpdated = function (d) {
                if (d && d.sites) self._discoverTagsFromData(d.sites);
            };
            self._bus.on('data:updated', self._onDataUpdated);

            self._onDemoToggle = function (d) {
                if (d) self._demoMode = d.enabled;
            };
            self._bus.on('demo:toggle', self._onDemoToggle);

            self._onApiReady = function (api) { self._api = api; };
            self._bus.on('api:ready', self._onApiReady);
        }

        // ── Build registry and render ──
        self._buildObjectRegistry();
        self._mergeBindings();
        self._renderObjectTree();
        self._updateStatusBar();

        // Select first object by default
        if (self._objectRegistry.length > 0) {
            self._selectObject(self._objectRegistry[0]);
        }
    };


    // ═══════════════════════════════════════
    //  Assign Dialog DOM
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._buildAssignDialog = function (parent) {
        var self = this;

        var dialog = _el('div', 'mu20-warehouse-assign-dialog');
        dialog.setAttribute('dir', 'rtl');
        dialog.style.display = 'none';

        // Backdrop
        var backdrop = _el('div', 'mu20-assign-backdrop');
        backdrop.addEventListener('click', function () { self._closeAssignDialog(); });
        dialog.appendChild(backdrop);

        // Content
        var content = _el('div', 'mu20-assign-content');

        self._assignHeader = _txt('div', 'mu20-assign-header', '\u05E9\u05D9\u05D9\u05DA \u05EA\u05D2');
        content.appendChild(self._assignHeader);

        self._assignSearch = _el('input', 'mu20-search-input mu20-assign-search');
        self._assignSearch.type = 'text';
        self._assignSearch.placeholder = '\u05D7\u05E4\u05E9 \u05EA\u05D2 \u05DC\u05E4\u05D9 \u05E9\u05DD / \u05E0\u05EA\u05D9\u05D1...';
        self._assignSearch.setAttribute('dir', 'rtl');
        self._assignSearch.addEventListener('input', function () { self._filterSuggestions(this.value); });
        content.appendChild(self._assignSearch);

        self._suggestionsEl = _el('div', 'mu20-assign-suggestions');
        content.appendChild(self._suggestionsEl);

        // Manual entry
        var manual = _el('div', 'mu20-assign-manual');
        manual.appendChild(_txt('div', '', '\u05D0\u05D5 \u05D4\u05D6\u05DF \u05D9\u05D3\u05E0\u05D9\u05EA:'));
        manual.lastChild.style.cssText = 'font-size:11px; color:#8899AA; margin:8px 0 4px;';

        self._assignTagName = _el('input', 'mu20-search-input mu20-assign-tagname');
        self._assignTagName.type = 'text';
        self._assignTagName.placeholder = '\u05E9\u05DD \u05EA\u05D2 \u05DE\u05DC\u05D0...';
        self._assignTagName.setAttribute('dir', 'ltr');
        manual.appendChild(self._assignTagName);

        self._assignTagPath = _el('input', 'mu20-search-input mu20-assign-tagpath');
        self._assignTagPath.type = 'text';
        self._assignTagPath.placeholder = '\u05E0\u05EA\u05D9\u05D1 AF (\u05D0\u05D5\u05E4\u05E6\u05D9\u05D5\u05E0\u05DC\u05D9)...';
        self._assignTagPath.setAttribute('dir', 'ltr');
        manual.appendChild(self._assignTagPath);

        content.appendChild(manual);

        // Actions
        var actions = _el('div', 'mu20-assign-actions');

        var okBtn = _el('button', 'mu20-btn mu20-assign-ok');
        okBtn.textContent = '\u05E9\u05D9\u05D9\u05DA';
        self._assignOkBtn = okBtn;
        actions.appendChild(okBtn);

        var cancelBtn = _el('button', 'mu20-btn mu20-assign-cancel');
        cancelBtn.textContent = '\u05D1\u05D9\u05D8\u05D5\u05DC';
        cancelBtn.addEventListener('click', function () { self._closeAssignDialog(); });
        actions.appendChild(cancelBtn);

        content.appendChild(actions);
        dialog.appendChild(content);
        parent.appendChild(dialog);

        self._assignDialogEl = dialog;
    };


    // ═══════════════════════════════════════
    //  Build Object Registry from Sites
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._buildObjectRegistry = function () {
        var self = this;
        var sites = self._sites;
        var registry = [];

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];

            // Site-level object
            registry.push({
                type: 'site',
                id: site.id,
                name: site.name,
                icon: '\uD83C\uDFED',
                roles: ROLE_DEFS.site
            });

            // Unit-level objects
            var units = site.units || [];
            for (var u = 0; u < units.length; u++) {
                registry.push({
                    type: 'unit',
                    id: MU.unitKey(site.id, u),
                    siteId: site.id,
                    unitIdx: u,
                    name: units[u],
                    icon: '\u2699',
                    roles: ROLE_DEFS.unit
                });
            }
        }

        self._objectRegistry = registry;
    };


    // ═══════════════════════════════════════
    //  Merge Default + User Bindings
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._mergeBindings = function () {
        var self = this;
        var defaults = self._defaultBindings || {};
        var user = self._userBindings || {};
        var effective = {};

        // Start with defaults
        for (var objKey in defaults) {
            if (defaults.hasOwnProperty(objKey)) {
                effective[objKey] = {};
                var roles = defaults[objKey];
                for (var rk in roles) {
                    if (roles.hasOwnProperty(rk)) {
                        var binding = roles[rk];
                        if (typeof binding === 'string') {
                            effective[objKey][rk] = {
                                tagName: binding, tagPath: '',
                                assignedBy: 'developer', assignedAt: '', status: 'ok'
                            };
                        } else if (binding && typeof binding === 'object') {
                            effective[objKey][rk] = _merge({}, binding);
                            if (!effective[objKey][rk].assignedBy) {
                                effective[objKey][rk].assignedBy = 'developer';
                            }
                        }
                    }
                }
            }
        }

        // Apply user overrides
        for (var uKey in user) {
            if (user.hasOwnProperty(uKey)) {
                if (!effective[uKey]) effective[uKey] = {};
                var uRoles = user[uKey];
                for (var urk in uRoles) {
                    if (uRoles.hasOwnProperty(urk)) {
                        var uBinding = uRoles[urk];
                        // Sentinel: user explicitly cleared this binding
                        if (uBinding && uBinding.cleared) {
                            delete effective[uKey][urk];
                            continue;
                        }
                        if (typeof uBinding === 'string') {
                            effective[uKey][urk] = {
                                tagName: uBinding, tagPath: '',
                                assignedBy: 'user',
                                assignedAt: new Date().toISOString(),
                                status: 'ok'
                            };
                        } else if (uBinding && typeof uBinding === 'object') {
                            effective[uKey][urk] = _merge({}, uBinding);
                            if (!effective[uKey][urk].assignedBy) {
                                effective[uKey][urk].assignedBy = 'user';
                            }
                        }
                    }
                }
            }
        }

        self._effectiveBindings = effective;
    };


    // ═══════════════════════════════════════
    //  Discover Tags from Data Flow
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._discoverTagsFromData = function (sitesData) {
        var self = this;
        var sites = self._sites;
        var discovered = [];

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            var siteData = sitesData[site.id];
            if (!siteData) continue;

            var units = site.units || [];
            for (var u = 0; u < units.length; u++) {
                var unitData = siteData[u];
                if (!unitData) continue;

                var objId = MU.unitKey(site.id, u);
                var attrMap = {
                    hours: 'productionTag',
                    power: 'powerTag',
                    temperature: 'temperatureTag',
                    efficiency: 'efficiencyTag',
                    emissions: 'emissionsTag'
                };

                for (var attr in attrMap) {
                    if (attrMap.hasOwnProperty(attr)) {
                        var raw = unitData[attr];
                        // Unwrap safeVal objects
                        var val = (raw && typeof raw === 'object' && raw.numeric !== undefined) ? raw.numeric : raw;
                        if (val !== undefined && val !== null && val !== 0) {
                            discovered.push({
                                objectId: objId,
                                roleKey: attrMap[attr],
                                tagName: site.id + '.' + units[u] + '.' + attr,
                                value: val,
                                ts: unitData.ts
                            });
                        }
                    }
                }
            }
        }

        self._discoveredTags = discovered;
    };


    // ═══════════════════════════════════════
    //  Render Object Tree (Panel 1)
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._renderObjectTree = function () {
        var self = this;
        var treeEl = self._treeEl;

        // Remove old list
        var oldList = treeEl.querySelector('.mu20-warehouse-tree-list');
        if (oldList) treeEl.removeChild(oldList);

        var list = _el('div', 'mu20-warehouse-tree-list');
        var registry = self._objectRegistry;

        for (var i = 0; i < registry.length; i++) {
            var obj = registry[i];

            // Site separator
            if (obj.type === 'site') {
                list.appendChild(_txt('div', 'mu20-warehouse-tree-site', obj.icon + ' ' + obj.name));
            }

            var item = _el('div', 'mu20-warehouse-tree-item');
            item.setAttribute('data-obj-id', obj.id);

            // Status dot
            item.appendChild(self._getObjectStatusDot(obj));

            // Label
            var label = obj.type === 'site' ? obj.name : '  ' + obj.icon + ' ' + obj.name;
            item.appendChild(_txt('span', '', label));

            // Binding count badge
            var bindingCount = self._countBindings(obj);
            var totalRoles = obj.roles.length;
            var badgeCls = 'mu20-warehouse-badge';
            if (bindingCount === totalRoles) badgeCls += ' mu20-warehouse-badge--ok';
            else if (bindingCount > 0) badgeCls += ' mu20-warehouse-badge--partial';
            else badgeCls += ' mu20-warehouse-badge--empty';

            item.appendChild(_txt('span', badgeCls, bindingCount + '/' + totalRoles));

            // Click handler
            (function (objRef, itemEl) {
                itemEl.addEventListener('click', function () {
                    var items = treeEl.querySelectorAll('.mu20-warehouse-tree-item');
                    for (var x = 0; x < items.length; x++) items[x].classList.remove('mu20-warehouse-tree-item--active');
                    itemEl.classList.add('mu20-warehouse-tree-item--active');
                    self._selectObject(objRef);
                });
            })(obj, item);

            // Mark active
            if (self._selectedObject && self._selectedObject.id === obj.id) {
                item.classList.add('mu20-warehouse-tree-item--active');
            }

            list.appendChild(item);
        }

        treeEl.appendChild(list);
    };


    // ═══════════════════════════════════════
    //  Select Object — render slots + details
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._selectObject = function (obj) {
        var self = this;
        self._selectedObject = obj;
        self._renderRoleSlots(obj);

        // Clear detail panel
        var old = self._detailEl.querySelector('.mu20-warehouse-detail-content');
        if (old) self._detailEl.removeChild(old);
        self._detailEl.appendChild(_txt('div', 'mu20-warehouse-detail-content mu20-warehouse-placeholder',
            '\u05D1\u05D7\u05E8 \u05EA\u05E4\u05E7\u05D9\u05D3 \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4 \u05D1\u05E4\u05E8\u05D8\u05D9\u05DD'));
    };


    // ═══════════════════════════════════════
    //  Render Role Slots (Panel 2)
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._renderRoleSlots = function (obj) {
        var self = this;
        var slotsEl = self._slotsEl;

        // Remove old list
        var oldList = slotsEl.querySelector('.mu20-warehouse-slots-list');
        if (oldList) slotsEl.removeChild(oldList);

        var list = _el('div', 'mu20-warehouse-slots-list');
        var roles = obj.roles;
        var bindings = self._effectiveBindings[obj.id] || {};

        for (var r = 0; r < roles.length; r++) {
            var role = roles[r];
            var binding = bindings[role.key] || null;

            var slot = _el('div', 'mu20-warehouse-slot');
            slot.setAttribute('data-role-key', role.key);

            // Status indicator
            var status = self._getBindingStatus(binding, role);
            slot.appendChild(_el('span', 'mu20-warehouse-slot-status'));
            slot.lastChild.appendChild(self._statusDot(status));

            // Role label
            var roleLabel = _txt('span', 'mu20-warehouse-slot-label', role.label);
            if (role.required) {
                roleLabel.appendChild(_txt('span', 'mu20-warehouse-required', ' *'));
            }
            slot.appendChild(roleLabel);

            // Tag name (or empty)
            var tagCls = 'mu20-warehouse-slot-tag';
            if (binding && binding.tagName) {
                tagCls += ' mu20-warehouse-slot-tag--assigned';
                slot.appendChild(_txt('span', tagCls, binding.tagName));
            } else {
                tagCls += ' mu20-warehouse-slot-tag--empty';
                slot.appendChild(_txt('span', tagCls, '\u05DC\u05D0 \u05DE\u05E9\u05D5\u05D9\u05DA'));
            }

            // Source badge
            if (binding && binding.assignedBy) {
                var srcCls = 'mu20-warehouse-src-badge';
                srcCls += binding.assignedBy === 'developer' ? ' mu20-warehouse-src--dev' : ' mu20-warehouse-src--user';
                slot.appendChild(_txt('span', srcCls, binding.assignedBy === 'developer' ? 'DEV' : 'USER'));
            }

            // Click to show details
            (function (roleObj, bindingObj, slotEl) {
                slotEl.addEventListener('click', function () {
                    var slots = slotsEl.querySelectorAll('.mu20-warehouse-slot');
                    for (var x = 0; x < slots.length; x++) slots[x].classList.remove('mu20-warehouse-slot--active');
                    slotEl.classList.add('mu20-warehouse-slot--active');
                    self._renderBindingDetail(obj, roleObj, bindingObj);
                });
            })(role, binding, slot);

            list.appendChild(slot);
        }

        slotsEl.appendChild(list);
    };


    // ═══════════════════════════════════════
    //  Render Binding Detail (Panel 3)
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._renderBindingDetail = function (obj, role, binding) {
        var self = this;
        var detailEl = self._detailEl;

        // Remove old content
        var old = detailEl.querySelector('.mu20-warehouse-detail-content');
        if (old) detailEl.removeChild(old);

        var content = _el('div', 'mu20-warehouse-detail-content');

        // Header
        content.appendChild(_txt('div', 'mu20-warehouse-detail-role', role.label));
        content.appendChild(_txt('div', 'mu20-warehouse-detail-obj', obj.name + ' (' + obj.type + ')'));

        if (binding && binding.tagName) {
            // ── Assigned binding details ──
            var table = _el('table', 'mu20-warehouse-detail-table');
            var rows = [
                ['\u05E9\u05DD \u05EA\u05D2', binding.tagName],
                ['\u05E0\u05EA\u05D9\u05D1', binding.tagPath || '\u2014'],
                ['\u05E1\u05D8\u05D8\u05D5\u05E1', self._statusLabel(self._getBindingStatus(binding, role))],
                ['\u05E9\u05D5\u05D9\u05DA \u05E2"\u05D9', binding.assignedBy === 'developer' ? '\u05DE\u05E4\u05EA\u05D7' : '\u05DE\u05E9\u05EA\u05DE\u05E9'],
                ['\u05EA\u05D0\u05E8\u05D9\u05DA', binding.assignedAt ? new Date(binding.assignedAt).toLocaleString() : '\u2014']
            ];
            for (var i = 0; i < rows.length; i++) {
                var tr = _el('tr');
                tr.appendChild(_txt('td', 'mu20-warehouse-detail-key', rows[i][0]));
                tr.appendChild(_txt('td', 'mu20-warehouse-detail-val', rows[i][1]));
                table.appendChild(tr);
            }
            content.appendChild(table);

            // ── Actions ──
            var actions = _el('div', 'mu20-warehouse-detail-actions');

            // Replace
            if (self._allowRebinding) {
                var replaceBtn = _el('button', 'mu20-btn mu20-btn-sm');
                replaceBtn.textContent = '\u05D4\u05D7\u05DC\u05E3';
                replaceBtn.addEventListener('click', function () { self._openAssignDialog(obj, role); });
                actions.appendChild(replaceBtn);
            }

            // Remove
            if (self._allowRebinding) {
                var removeBtn = _el('button', 'mu20-btn mu20-btn-sm mu20-btn-danger');
                removeBtn.textContent = '\u05D4\u05E1\u05E8';
                removeBtn.addEventListener('click', function () { self._removeBinding(obj, role); });
                actions.appendChild(removeBtn);
            }

            // Open in Explorer
            var exploreBtn = _el('button', 'mu20-btn mu20-btn-sm mu20-btn-accent');
            exploreBtn.textContent = '\u05E4\u05EA\u05D7 \u05D1\u05D7\u05D5\u05E7\u05E8';
            exploreBtn.addEventListener('click', function () {
                self._sendToExplorer([{
                    objectId: obj.id, objectName: obj.name,
                    roleKey: role.key, roleLabel: role.label,
                    tagName: binding.tagName, tagPath: binding.tagPath || ''
                }]);
            });
            actions.appendChild(exploreBtn);

            // Copy path
            if (binding.tagPath) {
                var copyBtn = _el('button', 'mu20-btn mu20-btn-sm');
                copyBtn.textContent = '\u05D4\u05E2\u05EA\u05E7 \u05E0\u05EA\u05D9\u05D1';
                copyBtn.addEventListener('click', function () {
                    try {
                        var ta = document.createElement('textarea');
                        ta.value = binding.tagPath;
                        document.body.appendChild(ta);
                        ta.select();
                        document.execCommand('copy');
                        document.body.removeChild(ta);
                        copyBtn.textContent = '\u2705';
                        setTimeout(function () { copyBtn.textContent = '\u05D4\u05E2\u05EA\u05E7 \u05E0\u05EA\u05D9\u05D1'; }, 1500);
                    } catch (e) { /* clipboard not available */ }
                });
                actions.appendChild(copyBtn);
            }

            content.appendChild(actions);

        } else {
            // ── No binding ──
            content.appendChild(_txt('div', 'mu20-warehouse-detail-empty',
                '\u05DC\u05D0 \u05DE\u05E9\u05D5\u05D9\u05DA \u05EA\u05D2 \u05DC\u05EA\u05E4\u05E7\u05D9\u05D3 \u05D6\u05D4'));

            if (self._allowRebinding) {
                var assignBtn = _el('button', 'mu20-btn mu20-btn-accent');
                assignBtn.textContent = '\u05E9\u05D9\u05D9\u05DA \u05EA\u05D2';
                assignBtn.addEventListener('click', function () { self._openAssignDialog(obj, role); });
                content.appendChild(assignBtn);
            }
        }

        // ── Explore all bound tags for this object ──
        var boundTags = self._getBoundTags(obj);
        if (boundTags.length > 1) {
            var exploreAllBtn = _el('button', 'mu20-btn mu20-btn-sm', 'margin-top:12px;');
            exploreAllBtn.textContent = '\u05E4\u05EA\u05D7 \u05D0\u05EA \u05DB\u05DC \u05D4\u05EA\u05D2\u05D9\u05DD \u05D1\u05D7\u05D5\u05E7\u05E8 (' + boundTags.length + ')';
            exploreAllBtn.addEventListener('click', function () { self._sendToExplorer(boundTags); });
            content.appendChild(exploreAllBtn);
        }

        detailEl.appendChild(content);
    };


    // ═══════════════════════════════════════
    //  Assign Dialog
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._openAssignDialog = function (obj, role) {
        var self = this;
        self._pendingAssign = { obj: obj, role: role };

        // Clear inputs
        self._assignSearch.value = '';
        self._assignTagName.value = '';
        self._assignTagPath.value = '';
        self._assignHeader.textContent = '\u05E9\u05D9\u05D9\u05DA \u05EA\u05D2 \u2014 ' + role.label + ' \u2014 ' + obj.name;

        // Build suggestions
        self._filterSuggestions('');

        // OK button — rebind each time
        var okBtn = self._assignOkBtn;
        var newOk = okBtn.cloneNode(true);
        okBtn.parentNode.replaceChild(newOk, okBtn);
        self._assignOkBtn = newOk;
        newOk.addEventListener('click', function () {
            var tagName = self._assignTagName.value.replace(/^\s+|\s+$/g, '');
            var tagPath = self._assignTagPath.value.replace(/^\s+|\s+$/g, '');
            if (tagName) {
                self._assignBinding(obj, role, tagName, tagPath);
                self._closeAssignDialog();
            }
        });

        self._assignDialogEl.style.display = '';
        self._assignSearch.focus();
    };

    Mu20TagWarehouse.prototype._closeAssignDialog = function () {
        this._assignDialogEl.style.display = 'none';
        this._pendingAssign = null;
    };

    Mu20TagWarehouse.prototype._filterSuggestions = function (filter) {
        var self = this;
        var sugEl = self._suggestionsEl;
        sugEl.innerHTML = '';

        var discovered = self._discoveredTags || [];
        var lf = (filter || '').toLowerCase();
        var shown = 0;

        for (var i = 0; i < discovered.length && shown < 20; i++) {
            var tag = discovered[i];
            if (lf && tag.tagName.toLowerCase().indexOf(lf) < 0) continue;

            var item = _el('div', 'mu20-assign-suggestion');
            item.textContent = tag.tagName;
            if (tag.value !== undefined) {
                item.appendChild(_txt('span', 'mu20-assign-suggestion-val',
                    ' = ' + MU.formatNum(tag.value, 1)));
            }

            (function (t) {
                item.addEventListener('click', function () {
                    self._assignTagName.value = t.tagName;
                    var allSug = sugEl.querySelectorAll('.mu20-assign-suggestion');
                    for (var x = 0; x < allSug.length; x++) allSug[x].classList.remove('mu20-assign-suggestion--sel');
                    item.classList.add('mu20-assign-suggestion--sel');
                });
            })(tag);

            sugEl.appendChild(item);
            shown++;
        }

        if (shown === 0) {
            sugEl.appendChild(_txt('div', 'mu20-warehouse-placeholder', '\u05D0\u05D9\u05DF \u05EA\u05D2\u05D9\u05DD \u05EA\u05D5\u05D0\u05DE\u05D9\u05DD'));
        }
    };


    // ═══════════════════════════════════════
    //  Assign / Remove / Validate
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._assignBinding = function (obj, role, tagName, tagPath) {
        var self = this;

        if (!self._userBindings[obj.id]) self._userBindings[obj.id] = {};
        self._userBindings[obj.id][role.key] = {
            tagName: tagName, tagPath: tagPath || '',
            assignedBy: 'user', assignedAt: new Date().toISOString(), status: 'ok'
        };

        // Re-merge and re-render
        self._mergeBindings();
        self._renderObjectTree();
        self._renderRoleSlots(obj);
        self._renderBindingDetail(obj, role, self._effectiveBindings[obj.id][role.key]);
        self._updateStatusBar();

        // Emit event
        if (self._bus) {
            self._bus.emit('tags:bindingChanged', {
                objectId: obj.id, objectName: obj.name, objectType: obj.type,
                roleKey: role.key, roleLabel: role.label,
                tagName: tagName, tagPath: tagPath, action: 'assign'
            });
        }
    };

    Mu20TagWarehouse.prototype._removeBinding = function (obj, role) {
        var self = this;

        if (!self._userBindings[obj.id]) self._userBindings[obj.id] = {};
        self._userBindings[obj.id][role.key] = { tagName: '', tagPath: '', cleared: true };

        self._mergeBindings();
        self._renderObjectTree();
        self._renderRoleSlots(obj);
        self._renderBindingDetail(obj, role, null);
        self._updateStatusBar();

        if (self._bus) {
            self._bus.emit('tags:bindingRemoved', {
                objectId: obj.id, objectName: obj.name,
                roleKey: role.key, roleLabel: role.label,
                tagName: '', tagPath: '', action: 'remove'
            });
        }
    };

    Mu20TagWarehouse.prototype._validateAll = function () {
        var self = this;
        var registry = self._objectRegistry;
        var totalSlots = 0, assignedSlots = 0, missingRequired = 0;
        var duplicates = [];
        var seenTags = {};

        for (var i = 0; i < registry.length; i++) {
            var obj = registry[i];
            var bindings = self._effectiveBindings[obj.id] || {};

            for (var r = 0; r < obj.roles.length; r++) {
                var role = obj.roles[r];
                totalSlots++;
                var binding = bindings[role.key];

                if (binding && binding.tagName) {
                    assignedSlots++;
                    var tagKey = binding.tagName.toLowerCase();
                    if (seenTags[tagKey]) {
                        duplicates.push({
                            tagName: binding.tagName,
                            first: seenTags[tagKey],
                            second: obj.name + ' / ' + role.label
                        });
                    } else {
                        seenTags[tagKey] = obj.name + ' / ' + role.label;
                    }
                } else if (role.required) {
                    missingRequired++;
                }
            }
        }

        var statusParts = [];
        statusParts.push(assignedSlots + '/' + totalSlots + ' \u05DE\u05E9\u05D5\u05D9\u05DB\u05D9\u05DD');
        if (missingRequired > 0) statusParts.push(missingRequired + ' \u05D7\u05D5\u05D1\u05D4 \u05D7\u05E1\u05E8\u05D9\u05DD');
        if (duplicates.length > 0) statusParts.push(duplicates.length + ' \u05DB\u05E4\u05D5\u05DC\u05D9\u05DD');

        self._statusBar.textContent = statusParts.join(' | ');

        if (self._bus) {
            self._bus.emit('tags:bindingValidated', {
                total: totalSlots, assigned: assignedSlots,
                missingRequired: missingRequired, duplicates: duplicates
            });
            self._bus.emit('log:entry', {
                level: missingRequired > 0 ? 'warn' : 'info',
                source: 'tagWarehouse',
                msg: '\u05D0\u05D9\u05DE\u05D5\u05EA: ' + statusParts.join(' | '),
                ts: new Date().toISOString()
            });
        }
    };


    // ═══════════════════════════════════════
    //  Send to Explorer
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._sendToExplorer = function (tags) {
        if (this._bus) {
            this._bus.emit('tags:openInExplorer', { tags: tags });
        }
    };


    // ═══════════════════════════════════════
    //  Helpers
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._countBindings = function (obj) {
        var bindings = this._effectiveBindings[obj.id] || {};
        var count = 0;
        for (var rk in bindings) {
            if (bindings.hasOwnProperty(rk) && bindings[rk] && bindings[rk].tagName) count++;
        }
        return count;
    };

    Mu20TagWarehouse.prototype._getBoundTags = function (obj) {
        var bindings = this._effectiveBindings[obj.id] || {};
        var roles = obj.roles;
        var result = [];
        for (var r = 0; r < roles.length; r++) {
            var b = bindings[roles[r].key];
            if (b && b.tagName) {
                result.push({
                    objectId: obj.id, objectName: obj.name,
                    roleKey: roles[r].key, roleLabel: roles[r].label,
                    tagName: b.tagName, tagPath: b.tagPath || ''
                });
            }
        }
        return result;
    };

    Mu20TagWarehouse.prototype._getBindingStatus = function (binding, role) {
        if (!binding || !binding.tagName) return role.required ? 'missing' : 'empty';
        if (binding.status === 'invalid') return 'invalid';
        if (binding.status === 'duplicate') return 'duplicate';
        return 'ok';
    };

    Mu20TagWarehouse.prototype._statusDot = function (status) {
        var cls = { ok: '--ok', missing: '--missing', invalid: '--invalid',
                    duplicate: '--duplicate', empty: '--empty' };
        var mod = cls[status] || '';
        var dot = _el('span', 'mu20-status-dot');
        if (mod) dot.classList.add('mu20-status-dot' + mod);
        return dot;
    };

    Mu20TagWarehouse.prototype._statusLabel = function (status) {
        switch (status) {
            case 'ok':        return '\u05EA\u05E7\u05D9\u05DF';
            case 'missing':   return '\u05D7\u05E1\u05E8 (\u05D7\u05D5\u05D1\u05D4)';
            case 'invalid':   return '\u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF';
            case 'duplicate': return '\u05DB\u05E4\u05D5\u05DC';
            case 'empty':     return '\u05DC\u05D0 \u05DE\u05E9\u05D5\u05D9\u05DA';
            default:          return status;
        }
    };

    Mu20TagWarehouse.prototype._getObjectStatusDot = function (obj) {
        var bindings = this._effectiveBindings[obj.id] || {};
        var hasMissingRequired = false;
        var hasAny = false;

        for (var r = 0; r < obj.roles.length; r++) {
            var role = obj.roles[r];
            var binding = bindings[role.key];
            if (binding && binding.tagName) hasAny = true;
            else if (role.required) hasMissingRequired = true;
        }

        if (hasMissingRequired) return this._statusDot('missing');
        if (hasAny) return this._statusDot('ok');
        return this._statusDot('empty');
    };

    Mu20TagWarehouse.prototype._updateStatusBar = function () {
        var self = this;
        var total = 0, assigned = 0;

        for (var i = 0; i < self._objectRegistry.length; i++) {
            var obj = self._objectRegistry[i];
            total += obj.roles.length;
            assigned += self._countBindings(obj);
        }

        self._statusBar.textContent = assigned + '/' + total + ' \u05E9\u05D9\u05D5\u05DB\u05D9\u05DD';
    };


    // ═══════════════════════════════════════
    //  Export CSV
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype._exportCsv = function () {
        var self = this;
        var rows = [];

        for (var i = 0; i < self._objectRegistry.length; i++) {
            var obj = self._objectRegistry[i];
            var bindings = self._effectiveBindings[obj.id] || {};

            for (var r = 0; r < obj.roles.length; r++) {
                var role = obj.roles[r];
                var binding = bindings[role.key] || {};

                rows.push({
                    '\u05D0\u05D5\u05D1\u05D9\u05D9\u05E7\u05D8': obj.name,
                    '\u05E1\u05D5\u05D2': obj.type,
                    '\u05EA\u05E4\u05E7\u05D9\u05D3': role.label,
                    '\u05D7\u05D5\u05D1\u05D4': role.required ? '\u05DB\u05DF' : '\u05DC\u05D0',
                    '\u05EA\u05D2 \u05DE\u05E9\u05D5\u05D9\u05DA': binding.tagName || '',
                    '\u05E0\u05EA\u05D9\u05D1': binding.tagPath || '',
                    '\u05E1\u05D8\u05D8\u05D5\u05E1': self._statusLabel(self._getBindingStatus(binding, role)),
                    '\u05E9\u05D5\u05D9\u05DA \u05E2"\u05D9': binding.assignedBy || '',
                    '\u05EA\u05D0\u05E8\u05D9\u05DA': binding.assignedAt || ''
                });
            }
        }

        MU.exportCsv(rows, 'mu20-tagWarehouse-' + MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
    };


    // ═══════════════════════════════════════
    //  setOption (live config updates)
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype.setOption = function (key, value) {
        if (key === 'defaultBindings') {
            this._defaultBindings = value || {};
            this._mergeBindings();
            this._renderObjectTree();
            if (this._selectedObject) this._renderRoleSlots(this._selectedObject);
            this._updateStatusBar();
        } else if (key === 'userBindings') {
            this._userBindings = value || {};
            this._mergeBindings();
            this._renderObjectTree();
            if (this._selectedObject) this._renderRoleSlots(this._selectedObject);
            this._updateStatusBar();
        } else if (key === 'sites') {
            this._sites = value || [];
            this._buildObjectRegistry();
            this._mergeBindings();
            this._renderObjectTree();
            this._updateStatusBar();
        } else if (key === 'allowUserRebinding') {
            this._allowRebinding = value !== false;
        }
    };


    // ═══════════════════════════════════════
    //  Destroy
    // ═══════════════════════════════════════

    Mu20TagWarehouse.prototype.destroy = function () {
        this._destroyed = true;

        if (this._bus) {
            if (this._onDataUpdated) this._bus.off('data:updated', this._onDataUpdated);
            if (this._onDemoToggle)  this._bus.off('demo:toggle', this._onDemoToggle);
            if (this._onApiReady)    this._bus.off('api:ready', this._onApiReady);
        }

        this._api = null;
        this._objectRegistry = null;
        this._effectiveBindings = null;
        this._discoveredTags = null;
        this._selectedObject = null;

        if (this._container) this._container.innerHTML = '';
    };


    // ── Expose globally ──
    window.Mu20TagWarehouse = Mu20TagWarehouse;

})();
