/**
 * ═══════════════════════════════════════════════════════
 *  mm20-afbuild.js  —  AF Build Tab Widget
 * ═══════════════════════════════════════════════════════
 *  AF path configuration UI for each site/unit.
 *  Tree-like structure, editable paths, bulk prefix editor,
 *  import/export AF paths as JSON.
 *
 *  jQuery widget: mm20.mm20AfBuild
 *  Version: 20.1.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-afbuild] MM20 core not loaded'); return; }

    $.widget('mm20.mm20AfBuild', {

        options: {
            bus:          null,
            api:          null,   // MM20.PIWebAPI instance from orchestrator
            sites:        null,
            demoMode:     false,
            serverPath:   '',
            databasePath: '',
            pathMap:      null   // { 'siteId_unitIdx_attr': 'full AF path' }
        },

        _treeEl:       null,
        _bulkEl:       null,
        _crudEl:       null,  // D2: Site CRUD container
        _afBrowserEl:  null,  // AF hierarchy browser
        _searchEl:     null,  // AF search container
        _destroyed:    false,
        _api:          null,  // local API ref (set from options or bus)
        _searchTimer:  null,  // debounce timer for search

        // ═══════════════════════════════════════
        //  _create
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;

            if (!self.options.pathMap) {
                self.options.pathMap = {};
            }

            try {
                var el = self.element;
                el.addClass('mm20-afbuild-root');

                // ── Header ──
                var header = $(
                    '<div class="mm20-afbuild-header" dir="rtl">' +
                        '<span class="mm20-afbuild-title">\u05D1\u05E0\u05D9\u05D9\u05EA \u05E0\u05EA\u05D9\u05D1\u05D9 AF</span>' +
                    '</div>'
                );
                el.append(header);

                // ── Bulk prefix editor ──
                self._bulkEl = $(
                    '<div class="mm20-afbuild-bulk" dir="rtl">' +
                        '<div class="mm20-afbuild-field">' +
                            '<label>\u05E9\u05E8\u05EA AF:</label>' +
                            '<input class="mm20-search-input mm20-af-server" type="text" value="' + MM.escapeHtml(self.options.serverPath) + '" placeholder="\\\\AF\\Server" dir="ltr" style="width:200px;" />' +
                        '</div>' +
                        '<div class="mm20-afbuild-field">' +
                            '<label>\u05DE\u05E1\u05D3 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD:</label>' +
                            '<input class="mm20-search-input mm20-af-db" type="text" value="' + MM.escapeHtml(self.options.databasePath) + '" placeholder="\\Database" dir="ltr" style="width:200px;" />' +
                        '</div>' +
                        '<button class="mm20-btn mm20-af-apply">\u05D4\u05D7\u05DC \u05E2\u05DC \u05D4\u05DB\u05DC</button>' +
                        '<button class="mm20-btn" style="margin-right:8px;">\u05D9\u05D9\u05E6\u05D0 JSON</button>' +
                        '<button class="mm20-btn">\u05D9\u05D9\u05D1\u05D0 JSON</button>' +
                    '</div>'
                );

                // Wire bulk apply
                self._bulkEl.find('.mm20-af-apply').on('click', function () {
                    self.options.serverPath = self._bulkEl.find('.mm20-af-server').val();
                    self.options.databasePath = self._bulkEl.find('.mm20-af-db').val();
                    self._applyBulkPrefix();
                    self._renderTree();
                });

                // Wire export
                self._bulkEl.find('button').eq(1).on('click', function () { self._exportPaths(); });
                // Wire import
                self._bulkEl.find('button').eq(2).on('click', function () { self._importPaths(); });

                el.append(self._bulkEl);

                // ── D2: Site CRUD buttons ──
                self._crudEl = $(
                    '<div class="mm20-afbuild-crud" dir="rtl">' +
                        '<button class="mm20-btn mm20-af-add-site">\u2795 \u05D4\u05D5\u05E1\u05E3 \u05D0\u05EA\u05E8</button>' +
                    '</div>'
                );
                self._crudEl.find('.mm20-af-add-site').on('click', function () {
                    self._showSiteForm(null);
                });
                el.append(self._crudEl);

                // ── AF Browser (API-powered hierarchy) ──
                self._afBrowserEl = $(
                    '<div class="mm20-af-browser" dir="rtl" style="display:none;">' +
                        '<div class="mm20-af-browser-header">' +
                            '<span style="font-weight:600;">\u05E0\u05D9\u05D5\u05D5\u05D8 AF Server</span>' +
                            '<button class="mm20-btn mm20-af-connect">\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DC-AF</button>' +
                            '<button class="mm20-btn mm20-af-validate" style="margin-right:8px;">\u05D0\u05DE\u05EA \u05E0\u05EA\u05D9\u05D1\u05D9\u05DD</button>' +
                        '</div>' +
                        '<div class="mm20-af-search-row">' +
                            '<input class="mm20-search-input mm20-af-search-input" type="text" placeholder="\u05D7\u05E4\u05E9 elements..." dir="ltr" style="width:220px;" />' +
                            '<div class="mm20-af-search-results" style="display:none;"></div>' +
                        '</div>' +
                        '<div class="mm20-af-browser-tree" style="overflow:auto; max-height:300px; border:1px solid #1a3550; border-radius:4px; padding:4px; margin-top:4px;"></div>' +
                        '<div class="mm20-af-browser-status" style="font-size:10px; color:#8899AA; margin-top:4px;"></div>' +
                    '</div>'
                );

                // Wire AF Connect button
                self._afBrowserEl.find('.mm20-af-connect').on('click', function () {
                    self._connectAF();
                });

                // Wire Validate button
                self._afBrowserEl.find('.mm20-af-validate').on('click', function () {
                    self._validateAllPaths();
                });

                // Wire search with debounce
                self._afBrowserEl.find('.mm20-af-search-input').on('keyup', function () {
                    var query = $(this).val();
                    if (self._searchTimer) clearTimeout(self._searchTimer);
                    if (query.length < 2) {
                        self._afBrowserEl.find('.mm20-af-search-results').hide().empty();
                        return;
                    }
                    self._searchTimer = setTimeout(function () {
                        self._searchElements(query);
                    }, 300);
                });

                el.append(self._afBrowserEl);

                // ── Tree container ──
                self._treeEl = $('<div class="mm20-afbuild-tree" style="overflow:auto; flex:1;"></div>');
                el.append(self._treeEl);

                // ── Bus subscriptions ──
                var bus = self.options.bus;
                if (bus) {
                    self._onConfigChanged = function (d) {
                        if (d && d.config) {
                            if (d.config.AfServerPath !== undefined) {
                                self.options.serverPath = d.config.AfServerPath;
                                self._bulkEl.find('.mm20-af-server').val(self.options.serverPath);
                            }
                            if (d.config.AfDatabasePath !== undefined) {
                                self.options.databasePath = d.config.AfDatabasePath;
                                self._bulkEl.find('.mm20-af-db').val(self.options.databasePath);
                            }
                        }
                    };
                    bus.on('config:changed', self._onConfigChanged, self);

                    // Listen for API ready from orchestrator
                    self._onApiReady = function (api) {
                        self._api = api;
                        self._afBrowserEl.show();
                        self._afBrowserEl.find('.mm20-af-browser-status').text('\u05D7\u05D9\u05D1\u05D5\u05E8 API \u05E4\u05E2\u05D9\u05DC \u2014 \u05DC\u05D7\u05E5 "\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DC-AF" \u05DC\u05D4\u05EA\u05D7\u05DC\u05D4');
                    };
                    bus.on('api:ready', self._onApiReady, self);
                }

                // If API already provided in options
                if (self.options.api) {
                    self._api = self.options.api;
                    self._afBrowserEl.show();
                }

                // ── Initial render ──
                if (self.options.demoMode) {
                    self._generateDemoPaths();
                }
                self._renderTree();

            } catch (e) {
                MM.shield.log('afbuild', '_create', e);
                MM.shield.renderFallback(self.element, 'afbuild', e);
            }
        },


        // ─────────────────────────────────────
        //  Generate demo AF paths
        // ─────────────────────────────────────

        _generateDemoPaths: function () {
            var self = this;
            var sites = self.options.sites || MM.SITES;
            var map = {};

            self.options.serverPath = self.options.serverPath || '\\\\PI-AF-01';
            self.options.databasePath = self.options.databasePath || '\\PowerPlants';

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                for (var u = 0; u < site.units.length; u++) {
                    var attrs = ['hours', 'quota', 'pct'];
                    for (var a = 0; a < attrs.length; a++) {
                        var key = MM.unitKey(site.id, u) + '_' + attrs[a];
                        map[key] = self.options.serverPath + self.options.databasePath +
                            '\\Plants\\' + site.name + '\\' + site.units[u] + '|' + attrs[a];
                    }
                }
            }
            self.options.pathMap = map;
            self._bulkEl.find('.mm20-af-server').val(self.options.serverPath);
            self._bulkEl.find('.mm20-af-db').val(self.options.databasePath);
        },


        // ─────────────────────────────────────
        //  Apply bulk prefix to all paths
        // ─────────────────────────────────────

        _applyBulkPrefix: function () {
            var self = this;
            var sites = self.options.sites || MM.SITES;
            var server = self.options.serverPath || '';
            var db = self.options.databasePath || '';
            var map = self.options.pathMap;

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                for (var u = 0; u < site.units.length; u++) {
                    var attrs = ['hours', 'quota', 'pct'];
                    for (var a = 0; a < attrs.length; a++) {
                        var key = MM.unitKey(site.id, u) + '_' + attrs[a];
                        if (!map[key]) {
                            map[key] = server + db + '\\Plants\\' + site.name + '\\' + site.units[u] + '|' + attrs[a];
                        } else {
                            // Update prefix only — keep the tail
                            var parts = map[key].split('\\Plants\\');
                            if (parts.length > 1) {
                                map[key] = server + db + '\\Plants\\' + parts[1];
                            }
                        }
                    }
                }
            }

            // Emit path change
            var bus = self.options.bus;
            if (bus) {
                bus.emit('af:pathChanged', { pathMap: map, serverPath: server, databasePath: db });
            }
        },


        // ─────────────────────────────────────
        //  Render tree
        // ─────────────────────────────────────

        _renderTree: function () {
            var self = this;
            var container = self._treeEl;
            container.empty();

            var sites = self.options.sites || MM.SITES;
            var map = self.options.pathMap || {};

            if (!sites.length) {
                container.html('<div class="mm20-tags-placeholder" dir="rtl">\u05D0\u05D9\u05DF \u05D0\u05EA\u05E8\u05D9\u05DD \u05DE\u05D5\u05D2\u05D3\u05E8\u05D9\u05DD</div>');
                return;
            }

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];

                // Site header (collapsible) + D2 edit/remove buttons
                var siteBlock = $(
                    '<details class="mm20-af-site" open>' +
                        '<summary class="mm20-af-site-header">' +
                            '<span class="mm20-af-site-name">' + MM.escapeHtml(site.name) + '</span>' +
                            '<span class="mm20-af-site-id">(' + MM.escapeHtml(site.id) + ')</span>' +
                            '<span class="mm20-af-unit-count">' + site.units.length + ' \u05D9\u05D7\u05D9\u05D3\u05D5\u05EA</span>' +
                            '<button class="mm20-btn mm20-btn--small mm20-af-edit-site" style="margin-right:8px; font-size:10px;">\u2710</button>' +
                            '<button class="mm20-btn mm20-btn--small mm20-btn--cancel mm20-af-del-site" style="font-size:10px;">\u2716</button>' +
                        '</summary>' +
                    '</details>'
                );
                // D2: Wire edit/remove for this site
                (function (siteRef) {
                    siteBlock.find('.mm20-af-edit-site').on('click', function (ev) {
                        ev.preventDefault(); ev.stopPropagation();
                        self._showSiteForm(siteRef);
                    });
                    siteBlock.find('.mm20-af-del-site').on('click', function (ev) {
                        ev.preventDefault(); ev.stopPropagation();
                        self._removeSite(siteRef.id);
                    });
                })(site);

                // Units
                var unitsWrap = $('<div class="mm20-af-units"></div>');

                for (var u = 0; u < site.units.length; u++) {
                    var unitBlock = $('<div class="mm20-af-unit"></div>');
                    unitBlock.append($('<div class="mm20-af-unit-name"></div>').text(site.units[u]));

                    var attrs = ['hours', 'quota', 'pct'];
                    var attrLabels = { hours: '\u05E9\u05E2\u05D5\u05EA', quota: '\u05DE\u05DB\u05E1\u05D4', pct: '% \u05E0\u05D9\u05E6\u05D5\u05DC' };

                    for (var a = 0; a < attrs.length; a++) {
                        var key = MM.unitKey(site.id, u) + '_' + attrs[a];
                        var currentPath = map[key] || '';

                        var row = $('<div class="mm20-af-path-row"></div>');
                        row.append($('<span class="mm20-af-attr-label"></span>').text(attrLabels[attrs[a]]));

                        (function (pathKey) {
                            var input = $('<input class="mm20-search-input mm20-af-path-input" type="text" dir="ltr" />')
                                .val(currentPath)
                                .attr('placeholder', '\\\\AF\\Server\\DB\\...|Attribute');

                            input.on('change', function () {
                                self.options.pathMap[pathKey] = this.value;
                                // Validate
                                var valid = self._validatePath(this.value);
                                $(this).toggleClass('mm20-af-path-invalid', !valid);
                                // Emit
                                var bus = self.options.bus;
                                if (bus) bus.emit('af:pathChanged', { key: pathKey, path: this.value });
                            });

                            // Drag-to-bind: accept AF attribute drops
                            input[0].addEventListener('dragover', function (ev) { ev.preventDefault(); });
                            input[0].addEventListener('drop', function (ev) {
                                ev.preventDefault();
                                var dt = ev.dataTransfer;
                                var afPath = dt.getData('application/x-af-path');
                                var afWebId = dt.getData('application/x-af-webid');
                                if (afPath) {
                                    input.val(afPath).css('border-color', '#5BC0EB');
                                    self.options.pathMap[pathKey] = afPath;
                                    // Cache WebId if available
                                    if (afWebId && afPath) {
                                        MM._webIdCache[afPath] = { webId: afWebId, ts: Date.now() };
                                    }
                                    var bus = self.options.bus;
                                    if (bus) bus.emit('af:pathChanged', { key: pathKey, path: afPath, webId: afWebId });
                                    setTimeout(function () { input.css('border-color', ''); }, 1500);
                                }
                            });

                            // Initial validation
                            if (currentPath && !self._validatePath(currentPath)) {
                                input.addClass('mm20-af-path-invalid');
                            }

                            row.append(input);
                        })(key);

                        unitBlock.append(row);
                    }

                    unitsWrap.append(unitBlock);
                }

                siteBlock.append(unitsWrap);
                container.append(siteBlock);
            }
        },


        // ─────────────────────────────────────
        //  Validate AF path pattern
        // ─────────────────────────────────────

        _validatePath: function (path) {
            if (!path) return true; // empty is ok (unconfigured)
            // Basic pattern: must start with \\ and contain |
            return path.indexOf('\\\\') === 0 && path.indexOf('|') > 0;
        },


        // ─────────────────────────────────────
        //  Export / Import paths as JSON
        // ─────────────────────────────────────

        _exportPaths: function () {
            var self = this;
            var exportData = {
                version: MM.VERSION,
                serverPath: self.options.serverPath,
                databasePath: self.options.databasePath,
                paths: self.options.pathMap || {}
            };
            var json = JSON.stringify(exportData, null, 2);
            var blob = new Blob([json], { type: 'application/json' });
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = 'mm20-af-paths-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.json';
            a.click();
            setTimeout(function () { URL.revokeObjectURL(url); }, 100);
        },

        _importPaths: function () {
            var self = this;
            var input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';
            input.onchange = function () {
                if (!input.files || !input.files[0]) return;
                var reader = new FileReader();
                reader.onload = function (e) {
                    try {
                        var data = JSON.parse(e.target.result);
                        if (data.paths) {
                            self.options.pathMap = data.paths;
                        }
                        if (data.serverPath) {
                            self.options.serverPath = data.serverPath;
                            self._bulkEl.find('.mm20-af-server').val(data.serverPath);
                        }
                        if (data.databasePath) {
                            self.options.databasePath = data.databasePath;
                            self._bulkEl.find('.mm20-af-db').val(data.databasePath);
                        }
                        self._renderTree();
                        var bus = self.options.bus;
                        if (bus) bus.emit('af:pathChanged', { pathMap: self.options.pathMap });
                    } catch (err) {
                        MM.shield.log('afbuild', '_importPaths', err);
                    }
                };
                reader.readAsText(input.files[0]);
            };
            input.click();
        },


        // ─────────────────────────────────────
        //  D2: Site CRUD
        // ─────────────────────────────────────

        /**
         * Show inline form for adding/editing a custom site.
         * @param {Object|null} existingSite - null for new, object for edit
         */
        _showSiteForm: function (existingSite) {
            var self = this;
            var isEdit = !!existingSite;
            var title = isEdit ? '\u05E2\u05E8\u05D5\u05DA \u05D0\u05EA\u05E8' : '\u05D4\u05D5\u05E1\u05E3 \u05D0\u05EA\u05E8 \u05D7\u05D3\u05E9';

            // Remove any existing form
            self.element.find('.mm20-af-site-form').remove();

            var form = $(
                '<div class="mm20-af-site-form" dir="rtl">' +
                    '<div style="font-weight:600; margin-bottom:6px;">' + title + '</div>' +
                    '<div class="mm20-afbuild-field">' +
                        '<label>\u05DE\u05D6\u05D4\u05D4 \u05D0\u05EA\u05E8:</label>' +
                        '<input class="mm20-search-input mm20-af-sid" type="text" value="' + MM.escapeHtml(isEdit ? existingSite.id : '') + '" placeholder="SITE01" dir="ltr" style="width:100px;" ' + (isEdit ? 'readonly' : '') + '/>' +
                    '</div>' +
                    '<div class="mm20-afbuild-field">' +
                        '<label>\u05E9\u05DD:</label>' +
                        '<input class="mm20-search-input mm20-af-sname" type="text" value="' + MM.escapeHtml(isEdit ? existingSite.name : '') + '" placeholder="\u05E9\u05DD \u05D4\u05D0\u05EA\u05E8" dir="rtl" style="width:150px;" />' +
                    '</div>' +
                    '<div class="mm20-afbuild-field">' +
                        '<label>\u05D0\u05D6\u05D5\u05E8:</label>' +
                        '<input class="mm20-search-input mm20-af-sregion" type="text" value="' + MM.escapeHtml(isEdit ? (existingSite.region || '') : '') + '" dir="rtl" style="width:100px;" />' +
                    '</div>' +
                    '<div class="mm20-afbuild-field">' +
                        '<label>\u05D3\u05DC\u05E7:</label>' +
                        '<select class="mm20-hm-select mm20-af-sfuel">' +
                            '<option value="gas">\u05D2\u05D6</option>' +
                            '<option value="coal">\u05E4\u05D7\u05DD</option>' +
                            '<option value="solar">\u05E1\u05D5\u05DC\u05D0\u05E8\u05D9</option>' +
                            '<option value="wind">\u05E8\u05D5\u05D7</option>' +
                            '<option value="CCGT">CCGT</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="mm20-afbuild-field">' +
                        '<label>\u05D9\u05D7\u05D9\u05D3\u05D5\u05EA (\u05E4\u05E1\u05D9\u05E7):</label>' +
                        '<input class="mm20-search-input mm20-af-sunits" type="text" value="' + MM.escapeHtml(isEdit ? existingSite.units.join(', ') : '') + '" placeholder="\u05D9\u05D7\u05D9\u05D3\u05D4 1, \u05D9\u05D7\u05D9\u05D3\u05D4 2" dir="rtl" style="width:220px;" />' +
                    '</div>' +
                    '<div style="margin-top:6px;">' +
                        '<button class="mm20-btn mm20-btn--ok mm20-af-save-site">\u05E9\u05DE\u05D5\u05E8</button>' +
                        '<button class="mm20-btn mm20-btn--cancel mm20-af-cancel-site" style="margin-right:6px;">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                    '</div>' +
                '</div>'
            );

            if (isEdit && existingSite.fuel) {
                form.find('.mm20-af-sfuel').val(existingSite.fuel);
            }

            // Wire save
            form.find('.mm20-af-save-site').on('click', function () {
                self._saveSiteForm(form, isEdit ? existingSite.id : null);
            });
            form.find('.mm20-af-cancel-site').on('click', function () {
                form.remove();
            });

            self._crudEl.after(form);
        },

        _saveSiteForm: function (form, editId) {
            var self = this;
            try {
                var id = form.find('.mm20-af-sid').val().trim();
                var name = form.find('.mm20-af-sname').val().trim();
                var region = form.find('.mm20-af-sregion').val().trim();
                var fuel = form.find('.mm20-af-sfuel').val();
                var unitsStr = form.find('.mm20-af-sunits').val().trim();

                if (!id || !name) return;

                var units = unitsStr.split(',').map(function (u) { return u.trim(); }).filter(function (u) { return u.length > 0; });
                if (!units.length) units = [name + ' \u05D9\u05D7 1'];

                var siteObj = { id: id, name: name, region: region, fuel: fuel, units: units };

                // Get or init custom sites
                var sites = self.options.sites || [];
                var customCopy = [];
                for (var i = 0; i < sites.length; i++) {
                    customCopy.push(sites[i]);
                }

                if (editId) {
                    // Update existing
                    for (var e = 0; e < customCopy.length; e++) {
                        if (customCopy[e].id === editId) {
                            customCopy[e] = siteObj;
                            break;
                        }
                    }
                } else {
                    // Check for duplicate ID
                    for (var d = 0; d < customCopy.length; d++) {
                        if (customCopy[d].id === id) return; // duplicate
                    }
                    customCopy.push(siteObj);
                }

                self.options.sites = customCopy;
                self._renderTree();
                form.remove();

                // Emit to orchestrator
                var bus = self.options.bus;
                if (bus) {
                    bus.emit('config:changed', { customSites: customCopy });
                }
            } catch (err) {
                MM.shield.log('afbuild', '_saveSiteForm', err);
            }
        },

        _removeSite: function (siteId) {
            var self = this;
            if (!MM.confirmDialog) {
                // Fallback: use native confirm
                if (!confirm('\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05D4\u05D0\u05EA\u05E8?')) return;
            }
            var sites = self.options.sites || [];
            var filtered = [];
            for (var i = 0; i < sites.length; i++) {
                if (sites[i].id !== siteId) filtered.push(sites[i]);
            }
            self.options.sites = filtered;
            self._renderTree();

            var bus = self.options.bus;
            if (bus) {
                bus.emit('config:changed', { customSites: filtered });
            }
        },


        // ─────────────────────────────────────
        //  AF Browser: Connect & Browse Hierarchy
        // ─────────────────────────────────────

        /**
         * Connect to AF Server — load servers list, then auto-expand
         * first server → first database.
         */
        _connectAF: function () {
            var self = this;
            if (!self._api) {
                self._afStatus('\u05D0\u05D9\u05DF \u05D7\u05D9\u05D1\u05D5\u05E8 PI Web API');
                return;
            }

            self._afStatus('\u05DE\u05EA\u05D7\u05D1\u05E8...');
            var tree = self._afBrowserEl.find('.mm20-af-browser-tree');
            tree.empty();

            self._api.getServers(function (err, data) {
                if (self._destroyed) return;
                if (err) {
                    self._afStatus('\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D7\u05D9\u05D1\u05D5\u05E8: ' + (err.text || err.status));
                    return;
                }
                var items = (data && data.Items) ? data.Items : [];
                if (!items.length) {
                    self._afStatus('\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05E9\u05E8\u05EA\u05D9 AF');
                    return;
                }
                self._afStatus('\u05E0\u05DE\u05E6\u05D0\u05D5 ' + items.length + ' \u05E9\u05E8\u05EA\u05D9\u05DD');

                for (var i = 0; i < items.length; i++) {
                    var node = self._createTreeNode(items[i].Name, items[i].WebId, 'server', 0);
                    tree.append(node);
                }
            });
        },

        /**
         * Create a clickable tree node for the AF browser.
         * @param {string} name
         * @param {string} webId
         * @param {string} type - 'server'|'database'|'element'|'attribute'
         * @param {number} depth - indentation level
         * @returns {jQuery}
         */
        _createTreeNode: function (name, webId, type, depth) {
            var self = this;
            var icons = { server: '\uD83D\uDDA5', database: '\uD83D\uDDC3', element: '\uD83D\uDCC1', attribute: '\uD83C\uDFF7' };
            var icon = icons[type] || '\u25CF';

            var node = $(
                '<div class="mm20-af-node" data-webid="' + MM.escapeHtml(webId) + '" data-type="' + type + '" ' +
                'style="padding:2px 4px; padding-right:' + (depth * 16 + 4) + 'px; cursor:pointer; ' +
                'border-radius:3px; font-size:12px; white-space:nowrap;" dir="ltr">' +
                    '<span class="mm20-af-toggle" style="display:inline-block; width:14px; text-align:center;">' +
                        (type !== 'attribute' ? '\u25B6' : '') +
                    '</span>' +
                    '<span style="margin:0 4px;">' + icon + '</span>' +
                    '<span class="mm20-af-node-name">' + MM.escapeHtml(name) + '</span>' +
                '</div>'
            );

            // Hover effect
            node.on('mouseenter', function () { $(this).css('background', '#1a3550'); });
            node.on('mouseleave', function () { $(this).css('background', ''); });

            // Click to expand children or preview attribute
            node.on('click', function (ev) {
                ev.stopPropagation();
                if (type === 'attribute') {
                    self._previewAttribute(webId, name, node);
                    return;
                }
                // Toggle expand
                var toggle = node.find('.mm20-af-toggle');
                var isExpanded = toggle.text() === '\u25BC';
                if (isExpanded) {
                    // Collapse: remove children
                    node.nextUntil('.mm20-af-node').remove();
                    var childClass = '.mm20-af-child-of-' + webId.replace(/[^a-zA-Z0-9]/g, '_');
                    $(childClass).remove();
                    toggle.text('\u25B6');
                    return;
                }
                toggle.text('\u25BC');
                self._expandNode(webId, type, depth + 1, node);
            });

            // Make attribute nodes draggable for drag-to-bind
            if (type === 'attribute') {
                node.attr('draggable', 'true');
                node.on('dragstart', function (ev) {
                    var dt = ev.originalEvent.dataTransfer;
                    dt.setData('text/plain', webId);
                    dt.setData('application/x-af-name', name);
                    dt.setData('application/x-af-webid', webId);
                    // Build full path from ancestors
                    var fullPath = self._buildPathFromNode(node);
                    dt.setData('application/x-af-path', fullPath);
                });
            }

            return node;
        },

        /**
         * Expand a tree node — load children from API.
         */
        _expandNode: function (parentWebId, parentType, depth, afterEl) {
            var self = this;
            if (!self._api) return;

            var insertAfter = afterEl;

            if (parentType === 'server') {
                // Load databases
                self._api.getDatabases(parentWebId, function (err, data) {
                    if (err || !data || !data.Items) return;
                    for (var i = 0; i < data.Items.length; i++) {
                        var child = self._createTreeNode(data.Items[i].Name, data.Items[i].WebId, 'database', depth);
                        insertAfter.after(child);
                        insertAfter = child;
                    }
                });
            } else if (parentType === 'database') {
                // Load top-level elements
                self._api.getDatabaseElements(parentWebId, function (err, data) {
                    if (err || !data || !data.Items) return;
                    for (var i = 0; i < data.Items.length; i++) {
                        var child = self._createTreeNode(data.Items[i].Name, data.Items[i].WebId, 'element', depth);
                        insertAfter.after(child);
                        insertAfter = child;
                    }
                });
            } else if (parentType === 'element') {
                // Load child elements + attributes in parallel
                self._api.getElements(parentWebId, function (err, data) {
                    if (err || !data || !data.Items) return;
                    for (var i = 0; i < data.Items.length; i++) {
                        var child = self._createTreeNode(data.Items[i].Name, data.Items[i].WebId, 'element', depth);
                        insertAfter.after(child);
                        insertAfter = child;
                    }
                    // Then load attributes
                    self._api.getAttributes(parentWebId, function (err2, data2) {
                        if (err2 || !data2 || !data2.Items) return;
                        for (var j = 0; j < data2.Items.length; j++) {
                            var attrNode = self._createTreeNode(data2.Items[j].Name, data2.Items[j].WebId, 'attribute', depth);
                            insertAfter.after(attrNode);
                            insertAfter = attrNode;
                        }
                    });
                });
            }
        },

        /**
         * Preview an attribute's current value via API.
         */
        _previewAttribute: function (webId, name, nodeEl) {
            var self = this;
            if (!self._api) return;

            self._api.getStreamValue(webId, function (err, data) {
                if (err) {
                    nodeEl.find('.mm20-af-node-name').text(name + '  [\u2716 \u05E9\u05D2\u05D9\u05D0\u05D4]');
                    return;
                }
                var val = data;
                if (val && val.Value !== undefined) {
                    var display = (typeof val.Value === 'object' && val.Value !== null && val.Value.Value !== undefined)
                        ? val.Value.Value : val.Value;
                    var ts = val.Timestamp ? new Date(val.Timestamp).toLocaleTimeString() : '';
                    nodeEl.find('.mm20-af-node-name').text(
                        name + '  [' + display + (ts ? ' @ ' + ts : '') + ']'
                    );
                    nodeEl.css('color', (val.Good !== false) ? '#2ECC71' : '#E74C3C');
                }
            });
        },

        /**
         * Build a full AF path string by traversing up from a node
         * (best-effort using node names visible in tree).
         */
        _buildPathFromNode: function (nodeEl) {
            var parts = [];
            var current = nodeEl;
            while (current && current.length && current.hasClass('mm20-af-node')) {
                var name = current.find('.mm20-af-node-name').first().text().split('  [')[0]; // strip preview
                var type = current.attr('data-type');
                parts.unshift(name);
                current = current.prev('.mm20-af-node');
                // Simple heuristic: walk backwards to find parent at lower depth
                // This is approximate — for full accuracy, WebId lookup is needed
            }
            if (parts.length >= 3) {
                // server\db\elem...|attr
                var server = parts[0];
                var db = parts[1];
                var elems = parts.slice(2, parts.length - 1);
                var attr = parts[parts.length - 1];
                return '\\\\' + server + '\\' + db + (elems.length ? '\\' + elems.join('\\') : '') + '|' + attr;
            }
            return parts.join('\\');
        },


        // ─────────────────────────────────────
        //  AF Browser: Search Elements
        // ─────────────────────────────────────

        _searchElements: function (query) {
            var self = this;
            if (!self._api) return;

            var resultsEl = self._afBrowserEl.find('.mm20-af-search-results');
            resultsEl.empty().show().html('<div style="color:#8899AA; font-size:11px;">\u05DE\u05D7\u05E4\u05E9...</div>');

            // Need a database WebId — use first visible database in tree, or resolve from serverPath+dbPath
            var dbPath = (self.options.serverPath || '') + (self.options.databasePath || '');
            if (!dbPath || dbPath.length < 4) {
                resultsEl.html('<div style="color:#F39C12; font-size:11px;">\u05D4\u05D2\u05D3\u05E8 \u05E9\u05E8\u05EA + \u05DE\u05E1\u05D3 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05EA\u05D7\u05D9\u05DC\u05D4</div>');
                return;
            }

            // Resolve database WebId then search
            MM.resolveWebId(dbPath, self._api, function (err, dbWebId) {
                if (err || !dbWebId) {
                    resultsEl.html('<div style="color:#E74C3C; font-size:11px;">\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05DE\u05E6\u05D5\u05D0 \u05D0\u05EA \u05D4\u05DE\u05E1\u05D3</div>');
                    return;
                }
                self._api.searchElements(dbWebId, query, 20, function (err2, data) {
                    if (self._destroyed) return;
                    if (err2 || !data || !data.Items) {
                        resultsEl.html('<div style="color:#8899AA; font-size:11px;">\u05D0\u05D9\u05DF \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA</div>');
                        return;
                    }
                    resultsEl.empty();
                    for (var i = 0; i < data.Items.length; i++) {
                        var item = data.Items[i];
                        var row = $(
                            '<div class="mm20-af-search-result" style="padding:3px 6px; cursor:pointer; font-size:11px; border-bottom:1px solid #1a3550;" dir="ltr">' +
                                '<strong>' + MM.escapeHtml(item.Name) + '</strong>' +
                                '<span style="color:#8899AA; margin-left:8px;">' + MM.escapeHtml(item.Path || '') + '</span>' +
                            '</div>'
                        );
                        row.on('mouseenter', function () { $(this).css('background', '#1a3550'); });
                        row.on('mouseleave', function () { $(this).css('background', ''); });

                        // Click to expand in tree
                        (function (webId, itemName) {
                            row.on('click', function () {
                                var tree = self._afBrowserEl.find('.mm20-af-browser-tree');
                                var node = self._createTreeNode(itemName, webId, 'element', 0);
                                tree.prepend(node);
                                resultsEl.hide();
                                self._afBrowserEl.find('.mm20-af-search-input').val('');
                            });
                        })(item.WebId, item.Name);

                        resultsEl.append(row);
                    }
                    if (!data.Items.length) {
                        resultsEl.html('<div style="color:#8899AA; font-size:11px;">\u05D0\u05D9\u05DF \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA</div>');
                    }
                });
            });
        },


        // ─────────────────────────────────────
        //  AF Browser: Validate All Paths
        // ─────────────────────────────────────

        /**
         * Validate all configured paths by calling api.getByPath()
         * for each one. Mark valid ✅ and invalid ❌.
         */
        _validateAllPaths: function () {
            var self = this;
            if (!self._api) {
                self._afStatus('\u05D0\u05D9\u05DF \u05D7\u05D9\u05D1\u05D5\u05E8 API \u05DC\u05D0\u05D9\u05DE\u05D5\u05EA');
                return;
            }

            var map = self.options.pathMap || {};
            var keys = [];
            for (var k in map) {
                if (map.hasOwnProperty(k) && map[k]) keys.push(k);
            }

            if (!keys.length) {
                self._afStatus('\u05D0\u05D9\u05DF \u05E0\u05EA\u05D9\u05D1\u05D9\u05DD \u05DC\u05D0\u05D9\u05DE\u05D5\u05EA');
                return;
            }

            self._afStatus('\u05DE\u05D0\u05DE\u05EA ' + keys.length + ' \u05E0\u05EA\u05D9\u05D1\u05D9\u05DD...');
            var done = 0, valid = 0, invalid = 0;

            for (var i = 0; i < keys.length; i++) {
                (function (pathKey) {
                    var fullPath = map[pathKey];
                    // Find corresponding input in tree
                    var inputs = self._treeEl.find('.mm20-af-path-input');

                    self._api.getByPath(fullPath, function (err, data) {
                        done++;
                        if (err) {
                            invalid++;
                            // Mark input red
                            inputs.filter(function () { return $(this).val() === fullPath; })
                                .addClass('mm20-af-path-invalid')
                                .css('border-color', '#E74C3C');
                        } else {
                            valid++;
                            // Cache the WebId
                            if (data && data.WebId) {
                                MM._webIdCache[fullPath] = { webId: data.WebId, ts: Date.now() };
                            }
                            inputs.filter(function () { return $(this).val() === fullPath; })
                                .removeClass('mm20-af-path-invalid')
                                .css('border-color', '#2ECC71');
                        }

                        if (done === keys.length) {
                            self._afStatus('\u05D0\u05D9\u05DE\u05D5\u05EA \u05D4\u05D5\u05E9\u05DC\u05DD: ' + valid + ' \u2705  ' + invalid + ' \u274C');
                            var bus = self.options.bus;
                            if (bus) bus.emit('af:validated', { total: keys.length, valid: valid, invalid: invalid });
                        }
                    });
                })(keys[i]);
            }
        },

        /**
         * Set AF browser status text.
         */
        _afStatus: function (text) {
            if (this._afBrowserEl) {
                this._afBrowserEl.find('.mm20-af-browser-status').text(text);
            }
        },


        // ═══════════════════════════════════════
        //  _setOption
        // ═══════════════════════════════════════

        _setOption: function (key, value) {
            this._super(key, value);
            if (key === 'sites' || key === 'pathMap') {
                this._renderTree();
            }
            if (key === 'api') {
                this._api = value;
                if (this._afBrowserEl && value) this._afBrowserEl.show();
            }
        },


        // ═══════════════════════════════════════
        //  _destroy
        // ═══════════════════════════════════════

        _destroy: function () {
            this._destroyed = true;

            if (this._searchTimer) {
                clearTimeout(this._searchTimer);
                this._searchTimer = null;
            }

            var bus = this.options.bus;
            if (bus) {
                if (this._onConfigChanged) bus.off('config:changed', this._onConfigChanged);
                if (this._onApiReady) bus.off('api:ready', this._onApiReady);
            }

            this._api = null;
            this.element.empty().removeClass('mm20-afbuild-root');
        }
    });

})(window.jQuery);
