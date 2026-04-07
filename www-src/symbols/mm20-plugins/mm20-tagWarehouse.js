/**
 * ═══════════════════════════════════════════════════════
 *  mm20-tagWarehouse.js  —  Smart Tag Warehouse Widget
 * ═══════════════════════════════════════════════════════
 *  Manages tag-to-object bindings inside the symbol.
 *  Shows which tag is assigned to which role for each
 *  site/unit/widget object.
 *
 *  Three-panel layout:
 *    [Object Tree]  [Role Slots]  [Binding Details]
 *
 *  jQuery widget: mm20.mm20TagWarehouse
 *  Version: 20.1.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-tagWarehouse] MM20 core not loaded'); return; }


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


    $.widget('mm20.mm20TagWarehouse', {

        options: {
            bus:               null,
            api:               null,
            sites:             null,
            demoMode:          false,
            defaultBindings:   {},   // developer-owned
            userBindings:      {},   // user overrides
            allowUserRebinding: true
        },

        _objectRegistry: null,
        _effectiveBindings: null,
        _selectedObject: null,
        _discoveredTags: null,     // tags discovered from data flow

        // DOM refs
        _treeEl:    null,
        _slotsEl:   null,
        _detailEl:  null,
        _statusBar: null,
        _destroyed: false,


        // ═══════════════════════════════════════
        //  _create
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;
            self._objectRegistry = [];
            self._effectiveBindings = {};
            self._discoveredTags = [];

            try {
                var el = self.element;
                el.addClass('mm20-warehouse-root');

                // ── Header bar ──
                var header = $('<div class="mm20-warehouse-header" dir="rtl"></div>');
                header.append('<span class="mm20-warehouse-title">\u05DE\u05D7\u05E1\u05DF \u05EA\u05D2\u05D9\u05DD \u05D7\u05DB\u05DD</span>');

                self._statusBar = $('<span class="mm20-warehouse-status"></span>');
                header.append(self._statusBar);

                var validateBtn = $('<button class="mm20-btn mm20-warehouse-validate">\u2714 \u05D0\u05DE\u05EA \u05E9\u05D9\u05D5\u05DB\u05D9\u05DD</button>');
                validateBtn.on('click', function () { self._validateAll(); });
                header.append(validateBtn);

                var exportBtn = $('<button class="mm20-btn">\u05D9\u05E6\u05D0 CSV</button>');
                exportBtn.on('click', function () { self._exportCsv(); });
                header.append(exportBtn);

                el.append(header);

                // ── Three-panel layout ──
                var panels = $('<div class="mm20-warehouse-panels" dir="rtl"></div>');

                // Panel 1: Object Tree
                self._treeEl = $('<div class="mm20-warehouse-tree"></div>');
                self._treeEl.append('<div class="mm20-warehouse-panel-title">\u05D0\u05D5\u05D1\u05D9\u05D9\u05E7\u05D8\u05D9\u05DD</div>');
                panels.append(self._treeEl);

                // Panel 2: Role Slots
                self._slotsEl = $('<div class="mm20-warehouse-slots"></div>');
                self._slotsEl.append('<div class="mm20-warehouse-panel-title">\u05EA\u05E4\u05E7\u05D9\u05D3\u05D9\u05DD / Slots</div>');
                panels.append(self._slotsEl);

                // Panel 3: Binding Details
                self._detailEl = $('<div class="mm20-warehouse-detail"></div>');
                self._detailEl.append('<div class="mm20-warehouse-panel-title">\u05E4\u05E8\u05D8\u05D9 \u05E9\u05D9\u05D5\u05DA</div>');
                panels.append(self._detailEl);

                el.append(panels);

                // ── Assign dialog (hidden) ──
                self._assignDialog = $(
                    '<div class="mm20-warehouse-assign-dialog" dir="rtl" style="display:none;">' +
                        '<div class="mm20-assign-backdrop"></div>' +
                        '<div class="mm20-assign-content">' +
                            '<div class="mm20-assign-header">\u05E9\u05D9\u05D9\u05DA \u05EA\u05D2</div>' +
                            '<input class="mm20-search-input mm20-assign-search" type="text" placeholder="\u05D7\u05E4\u05E9 \u05EA\u05D2 \u05DC\u05E4\u05D9 \u05E9\u05DD / \u05E0\u05EA\u05D9\u05D1..." dir="rtl" />' +
                            '<div class="mm20-assign-suggestions"></div>' +
                            '<div class="mm20-assign-manual">' +
                                '<div style="font-size:11px; color:#8899AA; margin:8px 0 4px;">\u05D0\u05D5 \u05D4\u05D6\u05DF \u05D9\u05D3\u05E0\u05D9\u05EA:</div>' +
                                '<input class="mm20-search-input mm20-assign-tagname" type="text" placeholder="\u05E9\u05DD \u05EA\u05D2 \u05DE\u05DC\u05D0..." dir="ltr" />' +
                                '<input class="mm20-search-input mm20-assign-tagpath" type="text" placeholder="\u05E0\u05EA\u05D9\u05D1 AF (\u05D0\u05D5\u05E4\u05E6\u05D9\u05D5\u05E0\u05DC\u05D9)..." dir="ltr" />' +
                            '</div>' +
                            '<div class="mm20-assign-actions">' +
                                '<button class="mm20-btn mm20-assign-ok">\u05E9\u05D9\u05D9\u05DA</button>' +
                                '<button class="mm20-btn mm20-assign-cancel">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>'
                );
                el.append(self._assignDialog);

                // Dialog events
                self._assignDialog.find('.mm20-assign-backdrop').on('click', function () { self._closeAssignDialog(); });
                self._assignDialog.find('.mm20-assign-cancel').on('click', function () { self._closeAssignDialog(); });
                self._assignDialog.find('.mm20-assign-search').on('input', function () { self._filterSuggestions(this.value); });

                // ── Bus subscriptions ──
                var bus = self.options.bus;
                if (bus) {
                    self._onDataUpdated = function (d) {
                        if (d && d.sites) {
                            self._discoverTagsFromData(d.sites);
                        }
                    };
                    bus.on('data:updated', self._onDataUpdated, self);

                    self._onDemoToggle = function (d) {
                        if (d) self.options.demoMode = d.enabled;
                    };
                    bus.on('demo:toggle', self._onDemoToggle, self);

                    self._onApiReady = function (api) {
                        self._api = api;
                    };
                    bus.on('api:ready', self._onApiReady, self);
                }

                if (self.options.api) {
                    self._api = self.options.api;
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

            } catch (e) {
                MM.shield.log('tagWarehouse', '_create', e);
                MM.shield.renderFallback(self.element, '\u05DE\u05D7\u05E1\u05DF \u05EA\u05D2\u05D9\u05DD', e);
            }
        },


        // ─────────────────────────────────────
        //  Build object registry from sites
        // ─────────────────────────────────────

        _buildObjectRegistry: function () {
            var self = this;
            var sites = self.options.sites || MM.SITES || [];
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
                        id: MM.unitKey(site.id, u),
                        siteId: site.id,
                        unitIdx: u,
                        name: units[u],
                        icon: '\u2699',
                        roles: ROLE_DEFS.unit
                    });
                }
            }

            self._objectRegistry = registry;
        },


        // ─────────────────────────────────────
        //  Merge default + user bindings
        // ─────────────────────────────────────

        _mergeBindings: function () {
            var self = this;
            var defaults = self.options.defaultBindings || {};
            var user = self.options.userBindings || {};
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
                                // Simple format: just tag name
                                effective[objKey][rk] = {
                                    tagName: binding,
                                    tagPath: '',
                                    assignedBy: 'developer',
                                    assignedAt: '',
                                    status: 'ok'
                                };
                            } else if (binding && typeof binding === 'object') {
                                effective[objKey][rk] = $.extend({}, binding);
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
                                    tagName: uBinding,
                                    tagPath: '',
                                    assignedBy: 'user',
                                    assignedAt: new Date().toISOString(),
                                    status: 'ok'
                                };
                            } else if (uBinding && typeof uBinding === 'object') {
                                effective[uKey][urk] = $.extend({}, uBinding);
                                if (!effective[uKey][urk].assignedBy) {
                                    effective[uKey][urk].assignedBy = 'user';
                                }
                            }
                        }
                    }
                }
            }

            self._effectiveBindings = effective;
        },


        // ─────────────────────────────────────
        //  Discover tags from data flow
        // ─────────────────────────────────────

        _discoverTagsFromData: function (sitesData) {
            var self = this;
            var sites = self.options.sites || MM.SITES || [];
            var discovered = [];

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = sitesData[site.id];
                if (!siteData) continue;

                var units = site.units || [];
                for (var u = 0; u < units.length; u++) {
                    var unitData = siteData[u];
                    if (!unitData) continue;

                    var objId = MM.unitKey(site.id, u);

                    // Auto-discover attributes that have values
                    var attrMap = {
                        hours: 'productionTag',
                        power: 'powerTag',
                        temperature: 'temperatureTag',
                        efficiency: 'efficiencyTag',
                        emissions: 'emissionsTag'
                    };

                    for (var attr in attrMap) {
                        if (attrMap.hasOwnProperty(attr) && unitData[attr] !== undefined && unitData[attr] !== null && unitData[attr] !== 0) {
                            discovered.push({
                                objectId: objId,
                                roleKey: attrMap[attr],
                                tagName: site.id + '.' + units[u] + '.' + attr,
                                value: unitData[attr],
                                ts: unitData.ts
                            });
                        }
                    }
                }
            }

            self._discoveredTags = discovered;
        },


        // ─────────────────────────────────────
        //  Render Object Tree (Panel 1)
        // ─────────────────────────────────────

        _renderObjectTree: function () {
            var self = this;
            var treeEl = self._treeEl;

            // Keep title, remove rest
            treeEl.find('.mm20-warehouse-tree-list').remove();

            var list = $('<div class="mm20-warehouse-tree-list"></div>');
            var registry = self._objectRegistry;

            for (var i = 0; i < registry.length; i++) {
                var obj = registry[i];

                // Site separator
                if (obj.type === 'site') {
                    var siteHeader = $('<div class="mm20-warehouse-tree-site"></div>');
                    siteHeader.text(obj.icon + ' ' + obj.name);
                    list.append(siteHeader);
                }

                var item = $('<div class="mm20-warehouse-tree-item"></div>');
                item.attr('data-obj-id', obj.id);

                // Status dot
                var statusDot = self._getObjectStatusDot(obj);
                item.append(statusDot);

                // Label
                var label = obj.type === 'site' ? obj.name : '  ' + obj.icon + ' ' + obj.name;
                item.append($('<span></span>').text(label));

                // Binding count badge
                var bindingCount = self._countBindings(obj);
                var totalRoles = obj.roles.length;
                var badge = $('<span class="mm20-warehouse-badge"></span>');
                badge.text(bindingCount + '/' + totalRoles);
                if (bindingCount === totalRoles) {
                    badge.addClass('mm20-warehouse-badge--ok');
                } else if (bindingCount > 0) {
                    badge.addClass('mm20-warehouse-badge--partial');
                } else {
                    badge.addClass('mm20-warehouse-badge--empty');
                }
                item.append(badge);

                // Click handler
                (function (obj, itemEl) {
                    itemEl.on('click', function () {
                        self._treeEl.find('.mm20-warehouse-tree-item').removeClass('mm20-warehouse-tree-item--active');
                        itemEl.addClass('mm20-warehouse-tree-item--active');
                        self._selectObject(obj);
                    });
                })(obj, item);

                // Mark first as active
                if (self._selectedObject && self._selectedObject.id === obj.id) {
                    item.addClass('mm20-warehouse-tree-item--active');
                }

                list.append(item);
            }

            treeEl.append(list);
        },


        // ─────────────────────────────────────
        //  Select Object — render slots + details
        // ─────────────────────────────────────

        _selectObject: function (obj) {
            var self = this;
            self._selectedObject = obj;
            self._renderRoleSlots(obj);
            self._detailEl.find('.mm20-warehouse-detail-content').remove();
            self._detailEl.append('<div class="mm20-warehouse-detail-content mm20-warehouse-placeholder">\u05D1\u05D7\u05E8 \u05EA\u05E4\u05E7\u05D9\u05D3 \u05DC\u05E6\u05E4\u05D9\u05D9\u05D4 \u05D1\u05E4\u05E8\u05D8\u05D9\u05DD</div>');
        },


        // ─────────────────────────────────────
        //  Render Role Slots (Panel 2)
        // ─────────────────────────────────────

        _renderRoleSlots: function (obj) {
            var self = this;
            var slotsEl = self._slotsEl;

            slotsEl.find('.mm20-warehouse-slots-list').remove();

            var list = $('<div class="mm20-warehouse-slots-list"></div>');
            var roles = obj.roles;
            var bindings = self._effectiveBindings[obj.id] || {};

            for (var r = 0; r < roles.length; r++) {
                var role = roles[r];
                var binding = bindings[role.key] || null;

                var slot = $('<div class="mm20-warehouse-slot"></div>');
                slot.attr('data-role-key', role.key);

                // Status indicator
                var status = self._getBindingStatus(binding, role);
                var statusIcon = self._statusIcon(status);
                slot.append($('<span class="mm20-warehouse-slot-status"></span>').append(statusIcon));

                // Role label
                var roleLabel = $('<span class="mm20-warehouse-slot-label"></span>');
                roleLabel.text(role.label);
                if (role.required) {
                    roleLabel.append($('<span class="mm20-warehouse-required"></span>').text(' *'));
                }
                slot.append(roleLabel);

                // Tag name (or empty)
                var tagDisplay = $('<span class="mm20-warehouse-slot-tag"></span>');
                if (binding && binding.tagName) {
                    tagDisplay.text(binding.tagName);
                    tagDisplay.addClass('mm20-warehouse-slot-tag--assigned');
                } else {
                    tagDisplay.text('\u05DC\u05D0 \u05DE\u05E9\u05D5\u05D9\u05DA');
                    tagDisplay.addClass('mm20-warehouse-slot-tag--empty');
                }
                slot.append(tagDisplay);

                // Source badge
                if (binding && binding.assignedBy) {
                    var srcBadge = $('<span class="mm20-warehouse-src-badge"></span>');
                    srcBadge.text(binding.assignedBy === 'developer' ? 'DEV' : 'USER');
                    srcBadge.addClass(binding.assignedBy === 'developer' ? 'mm20-warehouse-src--dev' : 'mm20-warehouse-src--user');
                    slot.append(srcBadge);
                }

                // Click to show details
                (function (roleObj, bindingObj, slotEl) {
                    slotEl.on('click', function () {
                        slotsEl.find('.mm20-warehouse-slot').removeClass('mm20-warehouse-slot--active');
                        slotEl.addClass('mm20-warehouse-slot--active');
                        self._renderBindingDetail(obj, roleObj, bindingObj);
                    });
                })(role, binding, slot);

                list.append(slot);
            }

            slotsEl.append(list);
        },


        // ─────────────────────────────────────
        //  Render Binding Detail (Panel 3)
        // ─────────────────────────────────────

        _renderBindingDetail: function (obj, role, binding) {
            var self = this;
            var detailEl = self._detailEl;

            detailEl.find('.mm20-warehouse-detail-content').remove();

            var content = $('<div class="mm20-warehouse-detail-content"></div>');

            // Header
            content.append($('<div class="mm20-warehouse-detail-role"></div>').text(role.label));
            content.append($('<div class="mm20-warehouse-detail-obj"></div>').text(obj.name + ' (' + obj.type + ')'));

            if (binding && binding.tagName) {
                // ── Assigned binding details ──
                var table = $('<table class="mm20-warehouse-detail-table"></table>');
                var rows = [
                    ['\u05E9\u05DD \u05EA\u05D2', binding.tagName],
                    ['\u05E0\u05EA\u05D9\u05D1', binding.tagPath || '\u2014'],
                    ['\u05E1\u05D8\u05D8\u05D5\u05E1', self._statusLabel(self._getBindingStatus(binding, role))],
                    ['\u05E9\u05D5\u05D9\u05DA \u05E2"\u05D9', binding.assignedBy === 'developer' ? '\u05DE\u05E4\u05EA\u05D7' : '\u05DE\u05E9\u05EA\u05DE\u05E9'],
                    ['\u05EA\u05D0\u05E8\u05D9\u05DA', binding.assignedAt ? new Date(binding.assignedAt).toLocaleString() : '\u2014']
                ];
                for (var i = 0; i < rows.length; i++) {
                    var tr = $('<tr></tr>');
                    tr.append($('<td class="mm20-warehouse-detail-key"></td>').text(rows[i][0]));
                    tr.append($('<td class="mm20-warehouse-detail-val"></td>').text(rows[i][1]));
                    table.append(tr);
                }
                content.append(table);

                // ── Actions ──
                var actions = $('<div class="mm20-warehouse-detail-actions"></div>');

                // Replace
                if (self.options.allowUserRebinding) {
                    var replaceBtn = $('<button class="mm20-btn mm20-btn-sm">\u05D4\u05D7\u05DC\u05E3</button>');
                    replaceBtn.on('click', function () { self._openAssignDialog(obj, role); });
                    actions.append(replaceBtn);
                }

                // Remove
                if (self.options.allowUserRebinding) {
                    var removeBtn = $('<button class="mm20-btn mm20-btn-sm mm20-btn-danger">\u05D4\u05E1\u05E8</button>');
                    removeBtn.on('click', function () { self._removeBinding(obj, role); });
                    actions.append(removeBtn);
                }

                // Open in Explorer
                var exploreBtn = $('<button class="mm20-btn mm20-btn-sm mm20-btn-accent">\u05E4\u05EA\u05D7 \u05D1\u05D7\u05D5\u05E7\u05E8</button>');
                exploreBtn.on('click', function () {
                    self._sendToExplorer([{
                        objectId: obj.id,
                        objectName: obj.name,
                        roleKey: role.key,
                        roleLabel: role.label,
                        tagName: binding.tagName,
                        tagPath: binding.tagPath || ''
                    }]);
                });
                actions.append(exploreBtn);

                // Copy path
                if (binding.tagPath) {
                    var copyBtn = $('<button class="mm20-btn mm20-btn-sm">\u05D4\u05E2\u05EA\u05E7 \u05E0\u05EA\u05D9\u05D1</button>');
                    copyBtn.on('click', function () {
                        try {
                            var ta = document.createElement('textarea');
                            ta.value = binding.tagPath;
                            document.body.appendChild(ta);
                            ta.select();
                            document.execCommand('copy');
                            document.body.removeChild(ta);
                            copyBtn.text('\u2705');
                            setTimeout(function () { copyBtn.text('\u05D4\u05E2\u05EA\u05E7 \u05E0\u05EA\u05D9\u05D1'); }, 1500);
                        } catch (e) { /* clipboard not available */ }
                    });
                    actions.append(copyBtn);
                }

                content.append(actions);

            } else {
                // ── No binding ──
                content.append('<div class="mm20-warehouse-detail-empty">\u05DC\u05D0 \u05DE\u05E9\u05D5\u05D9\u05DA \u05EA\u05D2 \u05DC\u05EA\u05E4\u05E7\u05D9\u05D3 \u05D6\u05D4</div>');

                if (self.options.allowUserRebinding) {
                    var assignBtn = $('<button class="mm20-btn mm20-btn-accent">\u05E9\u05D9\u05D9\u05DA \u05EA\u05D2</button>');
                    assignBtn.on('click', function () { self._openAssignDialog(obj, role); });
                    content.append(assignBtn);
                }
            }

            // ── Explore all bound tags for this object ──
            var boundTags = self._getBoundTags(obj);
            if (boundTags.length > 1) {
                var exploreAllBtn = $('<button class="mm20-btn mm20-btn-sm" style="margin-top:12px;">\u05E4\u05EA\u05D7 \u05D0\u05EA \u05DB\u05DC \u05D4\u05EA\u05D2\u05D9\u05DD \u05D1\u05D7\u05D5\u05E7\u05E8 (' + boundTags.length + ')</button>');
                exploreAllBtn.on('click', function () { self._sendToExplorer(boundTags); });
                content.append(exploreAllBtn);
            }

            detailEl.append(content);
        },


        // ─────────────────────────────────────
        //  Assign Dialog
        // ─────────────────────────────────────

        _pendingAssign: null,

        _openAssignDialog: function (obj, role) {
            var self = this;
            self._pendingAssign = { obj: obj, role: role };

            // Clear inputs
            self._assignDialog.find('.mm20-assign-search').val('');
            self._assignDialog.find('.mm20-assign-tagname').val('');
            self._assignDialog.find('.mm20-assign-tagpath').val('');
            self._assignDialog.find('.mm20-assign-header').text('\u05E9\u05D9\u05D9\u05DA \u05EA\u05D2 \u2014 ' + role.label + ' \u2014 ' + obj.name);

            // Build suggestions from discovered tags
            self._filterSuggestions('');

            // OK button
            self._assignDialog.find('.mm20-assign-ok').off('click').on('click', function () {
                var tagName = self._assignDialog.find('.mm20-assign-tagname').val().replace(/^\s+|\s+$/g, '');
                var tagPath = self._assignDialog.find('.mm20-assign-tagpath').val().replace(/^\s+|\s+$/g, '');
                if (tagName) {
                    self._assignBinding(obj, role, tagName, tagPath);
                    self._closeAssignDialog();
                }
            });

            self._assignDialog.show();
            self._assignDialog.find('.mm20-assign-search').focus();
        },

        _closeAssignDialog: function () {
            this._assignDialog.hide();
            this._pendingAssign = null;
        },

        _filterSuggestions: function (filter) {
            var self = this;
            var sugEl = self._assignDialog.find('.mm20-assign-suggestions');
            sugEl.empty();

            var discovered = self._discoveredTags || [];
            var lf = (filter || '').toLowerCase();

            var shown = 0;
            for (var i = 0; i < discovered.length && shown < 20; i++) {
                var tag = discovered[i];
                if (lf && tag.tagName.toLowerCase().indexOf(lf) < 0) continue;

                var item = $('<div class="mm20-assign-suggestion"></div>');
                item.text(tag.tagName);
                if (tag.value !== undefined) {
                    item.append($('<span class="mm20-assign-suggestion-val"></span>').text(' = ' + MM.formatNum(tag.value, 1)));
                }

                (function (t) {
                    item.on('click', function () {
                        self._assignDialog.find('.mm20-assign-tagname').val(t.tagName);
                        sugEl.find('.mm20-assign-suggestion').removeClass('mm20-assign-suggestion--sel');
                        $(this).addClass('mm20-assign-suggestion--sel');
                    });
                })(tag);

                sugEl.append(item);
                shown++;
            }

            if (shown === 0) {
                sugEl.append('<div class="mm20-warehouse-placeholder">\u05D0\u05D9\u05DF \u05EA\u05D2\u05D9\u05DD \u05EA\u05D5\u05D0\u05DE\u05D9\u05DD</div>');
            }
        },


        // ─────────────────────────────────────
        //  Assign / Remove / Validate
        // ─────────────────────────────────────

        _assignBinding: function (obj, role, tagName, tagPath) {
            var self = this;

            // Store in user bindings
            if (!self.options.userBindings[obj.id]) {
                self.options.userBindings[obj.id] = {};
            }
            self.options.userBindings[obj.id][role.key] = {
                tagName: tagName,
                tagPath: tagPath || '',
                assignedBy: 'user',
                assignedAt: new Date().toISOString(),
                status: 'ok'
            };

            // Re-merge and re-render
            self._mergeBindings();
            self._renderObjectTree();
            self._renderRoleSlots(obj);
            self._renderBindingDetail(obj, role, self._effectiveBindings[obj.id][role.key]);
            self._updateStatusBar();

            // Emit event
            var bus = self.options.bus;
            if (bus) {
                bus.emit('tags:bindingChanged', {
                    objectId: obj.id,
                    objectName: obj.name,
                    objectType: obj.type,
                    roleKey: role.key,
                    roleLabel: role.label,
                    tagName: tagName,
                    tagPath: tagPath,
                    action: 'assign'
                });
            }
        },

        _removeBinding: function (obj, role) {
            var self = this;

            // Mark as explicitly cleared — sentinel prevents _mergeBindings
            // from restoring the developer default
            if (!self.options.userBindings[obj.id]) {
                self.options.userBindings[obj.id] = {};
            }
            self.options.userBindings[obj.id][role.key] = { tagName: '', tagPath: '', cleared: true };

            // Re-merge and re-render
            self._mergeBindings();
            self._renderObjectTree();
            self._renderRoleSlots(obj);
            self._renderBindingDetail(obj, role, null);
            self._updateStatusBar();

            // Emit event
            var bus = self.options.bus;
            if (bus) {
                bus.emit('tags:bindingRemoved', {
                    objectId: obj.id,
                    objectName: obj.name,
                    roleKey: role.key,
                    roleLabel: role.label,
                    tagName: '',
                    tagPath: '',
                    action: 'remove'
                });
            }
        },

        _validateAll: function () {
            var self = this;
            var registry = self._objectRegistry;
            var totalSlots = 0;
            var assignedSlots = 0;
            var missingRequired = 0;
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

                        // Check for duplicates
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

            // Update status
            var statusParts = [];
            statusParts.push(assignedSlots + '/' + totalSlots + ' \u05DE\u05E9\u05D5\u05D9\u05DB\u05D9\u05DD');
            if (missingRequired > 0) {
                statusParts.push(missingRequired + ' \u05D7\u05D5\u05D1\u05D4 \u05D7\u05E1\u05E8\u05D9\u05DD');
            }
            if (duplicates.length > 0) {
                statusParts.push(duplicates.length + ' \u05DB\u05E4\u05D5\u05DC\u05D9\u05DD');
            }

            self._statusBar.text(statusParts.join(' | '));

            // Emit validation result
            var bus = self.options.bus;
            if (bus) {
                bus.emit('tags:bindingValidated', {
                    total: totalSlots,
                    assigned: assignedSlots,
                    missingRequired: missingRequired,
                    duplicates: duplicates
                });
                bus.emit('log:entry', {
                    level: missingRequired > 0 ? 'warn' : 'info',
                    source: 'tagWarehouse',
                    msg: '\u05D0\u05D9\u05DE\u05D5\u05EA: ' + statusParts.join(' | '),
                    ts: new Date().toISOString()
                });
            }
        },


        // ─────────────────────────────────────
        //  Send to Explorer
        // ─────────────────────────────────────

        _sendToExplorer: function (tags) {
            var bus = this.options.bus;
            if (bus) {
                bus.emit('tags:openInExplorer', { tags: tags });
            }
        },


        // ─────────────────────────────────────
        //  Helper: count bindings
        // ─────────────────────────────────────

        _countBindings: function (obj) {
            var bindings = this._effectiveBindings[obj.id] || {};
            var count = 0;
            for (var rk in bindings) {
                if (bindings.hasOwnProperty(rk) && bindings[rk] && bindings[rk].tagName) {
                    count++;
                }
            }
            return count;
        },

        _getBoundTags: function (obj) {
            var bindings = this._effectiveBindings[obj.id] || {};
            var roles = obj.roles;
            var result = [];
            for (var r = 0; r < roles.length; r++) {
                var b = bindings[roles[r].key];
                if (b && b.tagName) {
                    result.push({
                        objectId: obj.id,
                        objectName: obj.name,
                        roleKey: roles[r].key,
                        roleLabel: roles[r].label,
                        tagName: b.tagName,
                        tagPath: b.tagPath || ''
                    });
                }
            }
            return result;
        },


        // ─────────────────────────────────────
        //  Status helpers
        // ─────────────────────────────────────

        _getBindingStatus: function (binding, role) {
            if (!binding || !binding.tagName) {
                return role.required ? 'missing' : 'empty';
            }
            if (binding.status === 'invalid') return 'invalid';
            if (binding.status === 'duplicate') return 'duplicate';
            return 'ok';
        },

        _statusIcon: function (status) {
            var cls = { ok: '--ok', missing: '--missing', invalid: '--invalid',
                        duplicate: '--duplicate', empty: '--empty' };
            var mod = cls[status] || '';
            return $('<span class="mm20-status-dot"></span>').addClass(mod ? 'mm20-status-dot' + mod : '');
        },

        _statusLabel: function (status) {
            switch (status) {
                case 'ok':        return '\u05EA\u05E7\u05D9\u05DF';
                case 'missing':   return '\u05D7\u05E1\u05E8 (\u05D7\u05D5\u05D1\u05D4)';
                case 'invalid':   return '\u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF';
                case 'duplicate': return '\u05DB\u05E4\u05D5\u05DC';
                case 'empty':     return '\u05DC\u05D0 \u05DE\u05E9\u05D5\u05D9\u05DA';
                default:          return status;
            }
        },

        _getObjectStatusDot: function (obj) {
            var bindings = this._effectiveBindings[obj.id] || {};
            var hasMissingRequired = false;
            var hasAny = false;

            for (var r = 0; r < obj.roles.length; r++) {
                var role = obj.roles[r];
                var binding = bindings[role.key];
                if (binding && binding.tagName) {
                    hasAny = true;
                } else if (role.required) {
                    hasMissingRequired = true;
                }
            }

            if (hasMissingRequired) return this._statusIcon('missing');
            if (hasAny) return this._statusIcon('ok');
            return this._statusIcon('empty');
        },


        // ─────────────────────────────────────
        //  Status bar
        // ─────────────────────────────────────

        _updateStatusBar: function () {
            var self = this;
            var total = 0;
            var assigned = 0;

            for (var i = 0; i < self._objectRegistry.length; i++) {
                var obj = self._objectRegistry[i];
                total += obj.roles.length;
                assigned += self._countBindings(obj);
            }

            self._statusBar.text(assigned + '/' + total + ' \u05E9\u05D9\u05D5\u05DB\u05D9\u05DD');
        },


        // ─────────────────────────────────────
        //  Export CSV
        // ─────────────────────────────────────

        _exportCsv: function () {
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

            MM.exportCsv(rows, 'mm20-tagWarehouse-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
        },


        // ═══════════════════════════════════════
        //  _setOption
        // ═══════════════════════════════════════

        _setOption: function (key, value) {
            this._super(key, value);

            if (key === 'defaultBindings' || key === 'userBindings') {
                this._mergeBindings();
                this._renderObjectTree();
                if (this._selectedObject) {
                    this._renderRoleSlots(this._selectedObject);
                }
                this._updateStatusBar();
            } else if (key === 'sites') {
                this._buildObjectRegistry();
                this._mergeBindings();
                this._renderObjectTree();
                this._updateStatusBar();
            }
        },


        // ═══════════════════════════════════════
        //  _destroy
        // ═══════════════════════════════════════

        _destroy: function () {
            this._destroyed = true;

            var bus = this.options.bus;
            if (bus) {
                if (this._onDataUpdated) bus.off('data:updated', this._onDataUpdated, this);
                if (this._onDemoToggle)  bus.off('demo:toggle', this._onDemoToggle, this);
                if (this._onApiReady)    bus.off('api:ready', this._onApiReady, this);
            }

            this._api = null;
            this._objectRegistry = null;
            this._effectiveBindings = null;
            this._discoveredTags = null;
            this._selectedObject = null;
            this.element.empty().removeClass('mm20-warehouse-root');
        }
    });

})(window.jQuery);
