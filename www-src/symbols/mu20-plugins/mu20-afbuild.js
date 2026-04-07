/**
 * ═══════════════════════════════════════════════════════
 *  mu20-afbuild.js  —  AF Build Tab Plugin (MU20)
 * ═══════════════════════════════════════════════════════
 *  AF path configuration UI for each site/unit.
 *  Tree-like structure, editable paths, bulk prefix editor,
 *  import/export AF paths as JSON.
 *
 *  Ported from mm20-afbuild.js (jQuery → vanilla ES5).
 *  Version: ULT.1.4  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-afbuild] MU20 core not loaded'); return; }

    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════

    /**
     * @param {ShadowRoot} shadowRoot
     * @param {HTMLElement} containerEl
     * @param {Object} options
     * @param {Object} bus
     */
    function Mu20AfBuild(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._opts      = options || {};
        self._bus       = bus;

        // Internal state
        self._treeEl       = null;
        self._bulkEl       = null;
        self._crudEl       = null;
        self._afBrowserEl  = null;
        self._searchEl     = null;
        self._destroyed    = false;
        self._api          = self._opts.api || null;
        self._searchTimer  = null;
        self._onConfigChanged = null;
        self._onApiReady      = null;

        // Defaults
        if (!self._opts.pathMap) self._opts.pathMap = {};
        if (!self._opts.serverPath) self._opts.serverPath = '';
        if (!self._opts.databasePath) self._opts.databasePath = '';
        if (!self._opts.sites) self._opts.sites = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('afbuild', 'constructor', e);
            MU.shield.renderFallback(self._container, 'afbuild', e);
        }
    }

    // ═══════════════════════════════════════
    //  _mount  —  Build the entire DOM
    // ═══════════════════════════════════════

    Mu20AfBuild.prototype._mount = function () {
        var self = this;
        var root = self._container;
        root.classList.add('mu20-afbuild-root');

        // ── Header ──
        var header = document.createElement('div');
        header.className = 'mu20-afbuild-header';
        header.setAttribute('dir', 'rtl');

        var titleSpan = document.createElement('span');
        titleSpan.className = 'mu20-afbuild-title';
        titleSpan.textContent = '\u05D1\u05E0\u05D9\u05D9\u05EA \u05E0\u05EA\u05D9\u05D1\u05D9 AF';
        header.appendChild(titleSpan);
        root.appendChild(header);

        // ── Bulk prefix editor ──
        self._bulkEl = self._buildBulkEditor();
        root.appendChild(self._bulkEl);

        // ── D2: Site CRUD buttons ──
        self._crudEl = self._buildCrudBar();
        root.appendChild(self._crudEl);

        // ── AF Browser (API-powered hierarchy) ──
        self._afBrowserEl = self._buildAfBrowser();
        root.appendChild(self._afBrowserEl);

        // ── Tree container ──
        self._treeEl = document.createElement('div');
        self._treeEl.className = 'mu20-afbuild-tree';
        self._treeEl.style.overflow = 'auto';
        self._treeEl.style.flex = '1';
        root.appendChild(self._treeEl);

        // ── Bus subscriptions ──
        if (self._bus) {
            self._onConfigChanged = function (d) {
                if (d && d.config) {
                    if (d.config.AfServerPath !== undefined) {
                        self._opts.serverPath = d.config.AfServerPath;
                        var srvInput = self._bulkEl.querySelector('.mu20-af-server');
                        if (srvInput) srvInput.value = self._opts.serverPath;
                    }
                    if (d.config.AfDatabasePath !== undefined) {
                        self._opts.databasePath = d.config.AfDatabasePath;
                        var dbInput = self._bulkEl.querySelector('.mu20-af-db');
                        if (dbInput) dbInput.value = self._opts.databasePath;
                    }
                }
            };
            self._bus.on('config:changed', self._onConfigChanged, self);

            self._onApiReady = function (api) {
                self._api = api;
                self._afBrowserEl.style.display = '';
                var statusEl = self._afBrowserEl.querySelector('.mu20-af-browser-status');
                if (statusEl) {
                    statusEl.textContent = '\u05D7\u05D9\u05D1\u05D5\u05E8 API \u05E4\u05E2\u05D9\u05DC \u2014 \u05DC\u05D7\u05E5 "\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DC-AF" \u05DC\u05D4\u05EA\u05D7\u05DC\u05D4';
                }
            };
            self._bus.on('api:ready', self._onApiReady, self);
        }

        // If API already provided in options
        if (self._api) {
            self._afBrowserEl.style.display = '';
        }

        // ── Initial render ──
        if (self._opts.demoMode) {
            self._generateDemoPaths();
        }
        self._renderTree();
    };

    // ─────────────────────────────────────
    //  Build bulk prefix editor
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._buildBulkEditor = function () {
        var self = this;

        var bulk = document.createElement('div');
        bulk.className = 'mu20-afbuild-bulk';
        bulk.setAttribute('dir', 'rtl');

        // Server field
        var srvField = document.createElement('div');
        srvField.className = 'mu20-afbuild-field';
        var srvLabel = document.createElement('label');
        srvLabel.textContent = '\u05E9\u05E8\u05EA AF:';
        var srvInput = document.createElement('input');
        srvInput.className = 'mu20-search-input mu20-af-server';
        srvInput.type = 'text';
        // M-6 fix: DOM .value is plain text, escapeHtml corrupts paths with '&'
        srvInput.value = self._opts.serverPath || '';
        srvInput.placeholder = '\\\\AF\\Server';
        srvInput.setAttribute('dir', 'ltr');
        srvInput.style.width = '200px';
        srvField.appendChild(srvLabel);
        srvField.appendChild(srvInput);
        bulk.appendChild(srvField);

        // Database field
        var dbField = document.createElement('div');
        dbField.className = 'mu20-afbuild-field';
        var dbLabel = document.createElement('label');
        dbLabel.textContent = '\u05DE\u05E1\u05D3 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD:';
        var dbInput = document.createElement('input');
        dbInput.className = 'mu20-search-input mu20-af-db';
        dbInput.type = 'text';
        dbInput.value = self._opts.databasePath || '';
        dbInput.placeholder = '\\Database';
        dbInput.setAttribute('dir', 'ltr');
        dbInput.style.width = '200px';
        dbField.appendChild(dbLabel);
        dbField.appendChild(dbInput);
        bulk.appendChild(dbField);

        // Apply button
        var applyBtn = document.createElement('button');
        applyBtn.className = 'mu20-btn mu20-af-apply';
        applyBtn.textContent = '\u05D4\u05D7\u05DC \u05E2\u05DC \u05D4\u05DB\u05DC';
        applyBtn.addEventListener('click', function () {
            self._opts.serverPath = self._bulkEl.querySelector('.mu20-af-server').value;
            self._opts.databasePath = self._bulkEl.querySelector('.mu20-af-db').value;
            self._applyBulkPrefix();
            self._renderTree();
        });
        bulk.appendChild(applyBtn);

        // Export button
        var exportBtn = document.createElement('button');
        exportBtn.className = 'mu20-btn';
        exportBtn.style.marginRight = '8px';
        exportBtn.textContent = '\u05D9\u05D9\u05E6\u05D0 JSON';
        exportBtn.addEventListener('click', function () { self._exportPaths(); });
        bulk.appendChild(exportBtn);

        // Import button
        var importBtn = document.createElement('button');
        importBtn.className = 'mu20-btn';
        importBtn.textContent = '\u05D9\u05D9\u05D1\u05D0 JSON';
        importBtn.addEventListener('click', function () { self._importPaths(); });
        bulk.appendChild(importBtn);

        return bulk;
    };

    // ─────────────────────────────────────
    //  Build CRUD bar
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._buildCrudBar = function () {
        var self = this;

        var crud = document.createElement('div');
        crud.className = 'mu20-afbuild-crud';
        crud.setAttribute('dir', 'rtl');

        var addBtn = document.createElement('button');
        addBtn.className = 'mu20-btn mu20-af-add-site';
        addBtn.textContent = '\u2795 \u05D4\u05D5\u05E1\u05E3 \u05D0\u05EA\u05E8';
        addBtn.addEventListener('click', function () {
            self._showSiteForm(null);
        });
        crud.appendChild(addBtn);

        return crud;
    };

    // ─────────────────────────────────────
    //  Build AF browser panel
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._buildAfBrowser = function () {
        var self = this;

        var browser = document.createElement('div');
        browser.className = 'mu20-af-browser';
        browser.setAttribute('dir', 'rtl');
        browser.style.display = 'none';

        // Header row
        var bHeader = document.createElement('div');
        bHeader.className = 'mu20-af-browser-header';

        var bTitle = document.createElement('span');
        bTitle.style.fontWeight = '600';
        bTitle.textContent = '\u05E0\u05D9\u05D5\u05D5\u05D8 AF Server';
        bHeader.appendChild(bTitle);

        var connectBtn = document.createElement('button');
        connectBtn.className = 'mu20-btn mu20-af-connect';
        connectBtn.textContent = '\u05D4\u05EA\u05D7\u05D1\u05E8 \u05DC-AF';
        connectBtn.addEventListener('click', function () { self._connectAF(); });
        bHeader.appendChild(connectBtn);

        var validateBtn = document.createElement('button');
        validateBtn.className = 'mu20-btn mu20-af-validate';
        validateBtn.style.marginRight = '8px';
        validateBtn.textContent = '\u05D0\u05DE\u05EA \u05E0\u05EA\u05D9\u05D1\u05D9\u05DD';
        validateBtn.addEventListener('click', function () { self._validateAllPaths(); });
        bHeader.appendChild(validateBtn);
        browser.appendChild(bHeader);

        // Search row
        var searchRow = document.createElement('div');
        searchRow.className = 'mu20-af-search-row';

        var searchInput = document.createElement('input');
        searchInput.className = 'mu20-search-input mu20-af-search-input';
        searchInput.type = 'text';
        searchInput.placeholder = '\u05D7\u05E4\u05E9 elements...';
        searchInput.setAttribute('dir', 'ltr');
        searchInput.style.width = '220px';
        searchInput.addEventListener('keyup', function () {
            var query = searchInput.value;
            if (self._searchTimer) clearTimeout(self._searchTimer);
            var resultsEl = browser.querySelector('.mu20-af-search-results');
            if (query.length < 2) {
                resultsEl.style.display = 'none';
                while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);
                return;
            }
            self._searchTimer = setTimeout(function () {
                self._searchElements(query);
            }, 300);
        });
        searchRow.appendChild(searchInput);

        var searchResults = document.createElement('div');
        searchResults.className = 'mu20-af-search-results';
        searchResults.style.display = 'none';
        searchRow.appendChild(searchResults);
        browser.appendChild(searchRow);

        // Tree container
        var bTree = document.createElement('div');
        bTree.className = 'mu20-af-browser-tree';
        bTree.style.overflow = 'auto';
        bTree.style.maxHeight = '300px';
        bTree.style.border = '1px solid #1a3550';
        bTree.style.borderRadius = '4px';
        bTree.style.padding = '4px';
        bTree.style.marginTop = '4px';
        browser.appendChild(bTree);

        // Status line
        var bStatus = document.createElement('div');
        bStatus.className = 'mu20-af-browser-status';
        bStatus.style.fontSize = '10px';
        bStatus.style.color = '#8899AA';
        bStatus.style.marginTop = '4px';
        browser.appendChild(bStatus);

        return browser;
    };


    // ─────────────────────────────────────
    //  Generate demo AF paths
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._generateDemoPaths = function () {
        var self = this;
        var sites = self._opts.sites || MU.SITES;
        var map = {};

        self._opts.serverPath = self._opts.serverPath || '\\\\PI-AF-01';
        self._opts.databasePath = self._opts.databasePath || '\\PowerPlants';

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            for (var u = 0; u < site.units.length; u++) {
                var attrs = ['hours', 'quota', 'pct'];
                for (var a = 0; a < attrs.length; a++) {
                    var key = MU.unitKey(site.id, u) + '_' + attrs[a];
                    map[key] = self._opts.serverPath + self._opts.databasePath +
                        '\\Plants\\' + site.name + '\\' + site.units[u] + '|' + attrs[a];
                }
            }
        }
        self._opts.pathMap = map;

        var srvInput = self._bulkEl.querySelector('.mu20-af-server');
        if (srvInput) srvInput.value = self._opts.serverPath;
        var dbInput = self._bulkEl.querySelector('.mu20-af-db');
        if (dbInput) dbInput.value = self._opts.databasePath;
    };


    // ─────────────────────────────────────
    //  Apply bulk prefix to all paths
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._applyBulkPrefix = function () {
        var self = this;
        var sites = self._opts.sites || MU.SITES;
        var server = self._opts.serverPath || '';
        var db = self._opts.databasePath || '';
        var map = self._opts.pathMap;

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            for (var u = 0; u < site.units.length; u++) {
                var attrs = ['hours', 'quota', 'pct'];
                for (var a = 0; a < attrs.length; a++) {
                    var key = MU.unitKey(site.id, u) + '_' + attrs[a];
                    if (!map[key]) {
                        map[key] = server + db + '\\Plants\\' + site.name +
                            '\\' + site.units[u] + '|' + attrs[a];
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
        if (self._bus) {
            self._bus.emit('af:pathChanged', {
                pathMap: map, serverPath: server, databasePath: db
            });
        }
    };


    // ─────────────────────────────────────
    //  Render tree
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._renderTree = function () {
        var self = this;
        var container = self._treeEl;
        while (container.firstChild) container.removeChild(container.firstChild);

        var sites = self._opts.sites || MU.SITES;
        var map = self._opts.pathMap || {};

        if (!sites.length) {
            var placeholder = document.createElement('div');
            placeholder.className = 'mu20-tags-placeholder';
            placeholder.setAttribute('dir', 'rtl');
            placeholder.textContent = '\u05D0\u05D9\u05DF \u05D0\u05EA\u05E8\u05D9\u05DD \u05DE\u05D5\u05D2\u05D3\u05E8\u05D9\u05DD';
            container.appendChild(placeholder);
            return;
        }

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];

            // Site header (collapsible) + D2 edit/remove buttons
            var details = document.createElement('details');
            details.className = 'mu20-af-site';
            details.setAttribute('open', '');

            var summary = document.createElement('summary');
            summary.className = 'mu20-af-site-header';

            var nameSpan = document.createElement('span');
            nameSpan.className = 'mu20-af-site-name';
            nameSpan.textContent = site.name;
            summary.appendChild(nameSpan);

            var idSpan = document.createElement('span');
            idSpan.className = 'mu20-af-site-id';
            idSpan.textContent = '(' + site.id + ')';
            summary.appendChild(idSpan);

            var countSpan = document.createElement('span');
            countSpan.className = 'mu20-af-unit-count';
            countSpan.textContent = site.units.length + ' \u05D9\u05D7\u05D9\u05D3\u05D5\u05EA';
            summary.appendChild(countSpan);

            var editBtn = document.createElement('button');
            editBtn.className = 'mu20-btn mu20-btn--small mu20-af-edit-site';
            editBtn.style.marginRight = '8px';
            editBtn.style.fontSize = '10px';
            editBtn.textContent = '\u2710';
            summary.appendChild(editBtn);

            var delBtn = document.createElement('button');
            delBtn.className = 'mu20-btn mu20-btn--small mu20-btn--cancel mu20-af-del-site';
            delBtn.style.fontSize = '10px';
            delBtn.textContent = '\u2716';
            summary.appendChild(delBtn);

            details.appendChild(summary);

            // Wire edit/remove for this site (closure)
            (function (siteRef, editEl, delEl) {
                editEl.addEventListener('click', function (ev) {
                    ev.preventDefault(); ev.stopPropagation();
                    self._showSiteForm(siteRef);
                });
                delEl.addEventListener('click', function (ev) {
                    ev.preventDefault(); ev.stopPropagation();
                    self._removeSite(siteRef.id);
                });
            })(site, editBtn, delBtn);

            // Units
            var unitsWrap = document.createElement('div');
            unitsWrap.className = 'mu20-af-units';

            for (var u = 0; u < site.units.length; u++) {
                var unitBlock = document.createElement('div');
                unitBlock.className = 'mu20-af-unit';

                var unitName = document.createElement('div');
                unitName.className = 'mu20-af-unit-name';
                unitName.textContent = site.units[u];
                unitBlock.appendChild(unitName);

                var attrs = ['hours', 'quota', 'pct'];
                var attrLabels = {
                    hours: '\u05E9\u05E2\u05D5\u05EA',
                    quota: '\u05DE\u05DB\u05E1\u05D4',
                    pct:   '% \u05E0\u05D9\u05E6\u05D5\u05DC'
                };

                for (var a = 0; a < attrs.length; a++) {
                    var key = MU.unitKey(site.id, u) + '_' + attrs[a];
                    var currentPath = map[key] || '';

                    var row = document.createElement('div');
                    row.className = 'mu20-af-path-row';

                    var attrLabel = document.createElement('span');
                    attrLabel.className = 'mu20-af-attr-label';
                    attrLabel.textContent = attrLabels[attrs[a]];
                    row.appendChild(attrLabel);

                    // Path input — closure for pathKey binding
                    (function (pathKey, pathVal) {
                        var input = document.createElement('input');
                        input.className = 'mu20-search-input mu20-af-path-input';
                        input.type = 'text';
                        input.setAttribute('dir', 'ltr');
                        input.placeholder = '\\\\AF\\Server\\DB\\...|Attribute';
                        input.value = pathVal;

                        input.addEventListener('change', function () {
                            self._opts.pathMap[pathKey] = this.value;
                            var valid = self._validatePath(this.value);
                            if (valid) {
                                this.classList.remove('mu20-af-path-invalid');
                            } else {
                                this.classList.add('mu20-af-path-invalid');
                            }
                            if (self._bus) {
                                self._bus.emit('af:pathChanged', {
                                    key: pathKey, path: this.value
                                });
                            }
                        });

                        // Drag-to-bind: accept AF attribute drops
                        input.addEventListener('dragover', function (ev) { ev.preventDefault(); });
                        input.addEventListener('drop', function (ev) {
                            ev.preventDefault();
                            var dt = ev.dataTransfer;
                            var afPath = dt.getData('application/x-af-path');
                            var afWebId = dt.getData('application/x-af-webid');
                            if (afPath) {
                                input.value = afPath;
                                input.style.borderColor = '#5BC0EB';
                                self._opts.pathMap[pathKey] = afPath;
                                if (afWebId && afPath) {
                                    MU.cacheWebId(afPath, afWebId);
                                }
                                if (self._bus) {
                                    self._bus.emit('af:pathChanged', {
                                        key: pathKey, path: afPath, webId: afWebId
                                    });
                                }
                                setTimeout(function () { input.style.borderColor = ''; }, 1500);
                            }
                        });

                        // Initial validation
                        if (pathVal && !self._validatePath(pathVal)) {
                            input.classList.add('mu20-af-path-invalid');
                        }

                        row.appendChild(input);
                    })(key, currentPath);

                    unitBlock.appendChild(row);
                }

                unitsWrap.appendChild(unitBlock);
            }

            details.appendChild(unitsWrap);
            container.appendChild(details);
        }
    };


    // ─────────────────────────────────────
    //  Validate AF path pattern
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._validatePath = function (path) {
        if (!path) return true; // empty is ok (unconfigured)
        return path.indexOf('\\\\') === 0 && path.indexOf('|') > 0;
    };


    // ─────────────────────────────────────
    //  Export / Import paths as JSON
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._exportPaths = function () {
        var self = this;
        var exportData = {
            version: MU.VERSION,
            serverPath: self._opts.serverPath,
            databasePath: self._opts.databasePath,
            paths: self._opts.pathMap || {}
        };
        var json = JSON.stringify(exportData, null, 2);
        var blob = new Blob([json], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'mu20-af-paths-' +
            MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.json';
        a.click();
        setTimeout(function () { URL.revokeObjectURL(url); }, 100);
    };

    Mu20AfBuild.prototype._importPaths = function () {
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
                        self._opts.pathMap = data.paths;
                    }
                    if (data.serverPath) {
                        self._opts.serverPath = data.serverPath;
                        var srvEl = self._bulkEl.querySelector('.mu20-af-server');
                        if (srvEl) srvEl.value = data.serverPath;
                    }
                    if (data.databasePath) {
                        self._opts.databasePath = data.databasePath;
                        var dbEl = self._bulkEl.querySelector('.mu20-af-db');
                        if (dbEl) dbEl.value = data.databasePath;
                    }
                    self._renderTree();
                    if (self._bus) {
                        self._bus.emit('af:pathChanged', { pathMap: self._opts.pathMap });
                    }
                } catch (err) {
                    MU.shield.log('afbuild', '_importPaths', err);
                }
            };
            reader.readAsText(input.files[0]);
        };
        input.click();
    };


    // ─────────────────────────────────────
    //  D2: Site CRUD
    // ─────────────────────────────────────

    /**
     * Show inline form for adding/editing a custom site.
     * @param {Object|null} existingSite - null for new, object for edit
     */
    Mu20AfBuild.prototype._showSiteForm = function (existingSite) {
        var self = this;
        var isEdit = !!existingSite;
        var title = isEdit
            ? '\u05E2\u05E8\u05D5\u05DA \u05D0\u05EA\u05E8'
            : '\u05D4\u05D5\u05E1\u05E3 \u05D0\u05EA\u05E8 \u05D7\u05D3\u05E9';

        // Remove any existing form
        var oldForm = self._container.querySelector('.mu20-af-site-form');
        if (oldForm) oldForm.parentNode.removeChild(oldForm);

        var form = document.createElement('div');
        form.className = 'mu20-af-site-form';
        form.setAttribute('dir', 'rtl');

        // Title
        var formTitle = document.createElement('div');
        formTitle.style.fontWeight = '600';
        formTitle.style.marginBottom = '6px';
        formTitle.textContent = title;
        form.appendChild(formTitle);

        // Site ID field
        var sidField = document.createElement('div');
        sidField.className = 'mu20-afbuild-field';
        var sidLabel = document.createElement('label');
        sidLabel.textContent = '\u05DE\u05D6\u05D4\u05D4 \u05D0\u05EA\u05E8:';
        var sidInput = document.createElement('input');
        sidInput.className = 'mu20-search-input mu20-af-sid';
        sidInput.type = 'text';
        sidInput.value = isEdit ? existingSite.id : '';
        sidInput.placeholder = 'SITE01';
        sidInput.setAttribute('dir', 'ltr');
        sidInput.style.width = '100px';
        if (isEdit) sidInput.setAttribute('readonly', 'readonly');
        sidField.appendChild(sidLabel);
        sidField.appendChild(sidInput);
        form.appendChild(sidField);

        // Name field
        var snameField = document.createElement('div');
        snameField.className = 'mu20-afbuild-field';
        var snameLabel = document.createElement('label');
        snameLabel.textContent = '\u05E9\u05DD:';
        var snameInput = document.createElement('input');
        snameInput.className = 'mu20-search-input mu20-af-sname';
        snameInput.type = 'text';
        snameInput.value = isEdit ? existingSite.name : '';
        snameInput.placeholder = '\u05E9\u05DD \u05D4\u05D0\u05EA\u05E8';
        snameInput.setAttribute('dir', 'rtl');
        snameInput.style.width = '150px';
        snameField.appendChild(snameLabel);
        snameField.appendChild(snameInput);
        form.appendChild(snameField);

        // Region field
        var sregField = document.createElement('div');
        sregField.className = 'mu20-afbuild-field';
        var sregLabel = document.createElement('label');
        sregLabel.textContent = '\u05D0\u05D6\u05D5\u05E8:';
        var sregInput = document.createElement('input');
        sregInput.className = 'mu20-search-input mu20-af-sregion';
        sregInput.type = 'text';
        sregInput.value = isEdit ? (existingSite.region || '') : '';
        sregInput.setAttribute('dir', 'rtl');
        sregInput.style.width = '100px';
        sregField.appendChild(sregLabel);
        sregField.appendChild(sregInput);
        form.appendChild(sregField);

        // Fuel select
        var sfuelField = document.createElement('div');
        sfuelField.className = 'mu20-afbuild-field';
        var sfuelLabel = document.createElement('label');
        sfuelLabel.textContent = '\u05D3\u05DC\u05E7:';
        var sfuelSelect = document.createElement('select');
        sfuelSelect.className = 'mu20-hm-select mu20-af-sfuel';
        var fuelOptions = [
            { value: 'gas',   text: '\u05D2\u05D6' },
            { value: 'coal',  text: '\u05E4\u05D7\u05DD' },
            { value: 'solar', text: '\u05E1\u05D5\u05DC\u05D0\u05E8\u05D9' },
            { value: 'wind',  text: '\u05E8\u05D5\u05D7' },
            { value: 'CCGT',  text: 'CCGT' }
        ];
        for (var f = 0; f < fuelOptions.length; f++) {
            var opt = document.createElement('option');
            opt.value = fuelOptions[f].value;
            opt.textContent = fuelOptions[f].text;
            sfuelSelect.appendChild(opt);
        }
        if (isEdit && existingSite.fuel) sfuelSelect.value = existingSite.fuel;
        sfuelField.appendChild(sfuelLabel);
        sfuelField.appendChild(sfuelSelect);
        form.appendChild(sfuelField);

        // Units field
        var sunitsField = document.createElement('div');
        sunitsField.className = 'mu20-afbuild-field';
        var sunitsLabel = document.createElement('label');
        sunitsLabel.textContent = '\u05D9\u05D7\u05D9\u05D3\u05D5\u05EA (\u05E4\u05E1\u05D9\u05E7):';
        var sunitsInput = document.createElement('input');
        sunitsInput.className = 'mu20-search-input mu20-af-sunits';
        sunitsInput.type = 'text';
        sunitsInput.value = isEdit ? existingSite.units.join(', ') : '';
        sunitsInput.placeholder = '\u05D9\u05D7\u05D9\u05D3\u05D4 1, \u05D9\u05D7\u05D9\u05D3\u05D4 2';
        sunitsInput.setAttribute('dir', 'rtl');
        sunitsInput.style.width = '220px';
        sunitsField.appendChild(sunitsLabel);
        sunitsField.appendChild(sunitsInput);
        form.appendChild(sunitsField);

        // Action buttons
        var btnRow = document.createElement('div');
        btnRow.style.marginTop = '6px';

        var saveBtn = document.createElement('button');
        saveBtn.className = 'mu20-btn mu20-btn--ok mu20-af-save-site';
        saveBtn.textContent = '\u05E9\u05DE\u05D5\u05E8';
        saveBtn.addEventListener('click', function () {
            self._saveSiteForm(form, isEdit ? existingSite.id : null);
        });
        btnRow.appendChild(saveBtn);

        var cancelBtn = document.createElement('button');
        cancelBtn.className = 'mu20-btn mu20-btn--cancel mu20-af-cancel-site';
        cancelBtn.style.marginRight = '6px';
        cancelBtn.textContent = '\u05D1\u05D9\u05D8\u05D5\u05DC';
        cancelBtn.addEventListener('click', function () {
            if (form.parentNode) form.parentNode.removeChild(form);
        });
        btnRow.appendChild(cancelBtn);
        form.appendChild(btnRow);

        // Insert form after CRUD bar
        self._crudEl.parentNode.insertBefore(form, self._crudEl.nextSibling);
    };

    Mu20AfBuild.prototype._saveSiteForm = function (formEl, editId) {
        var self = this;
        try {
            var id = formEl.querySelector('.mu20-af-sid').value.trim();
            var name = formEl.querySelector('.mu20-af-sname').value.trim();
            var region = formEl.querySelector('.mu20-af-sregion').value.trim();
            var fuel = formEl.querySelector('.mu20-af-sfuel').value;
            var unitsStr = formEl.querySelector('.mu20-af-sunits').value.trim();

            if (!id || !name) return;

            var rawUnits = unitsStr.split(',');
            var units = [];
            for (var i = 0; i < rawUnits.length; i++) {
                var trimmed = rawUnits[i].replace(/^\s+|\s+$/g, '');
                if (trimmed.length > 0) units.push(trimmed);
            }
            if (!units.length) units = [name + ' \u05D9\u05D7 1'];

            var siteObj = { id: id, name: name, region: region, fuel: fuel, units: units };

            var sites = self._opts.sites || [];
            var customCopy = [];
            for (var c = 0; c < sites.length; c++) {
                customCopy.push(sites[c]);
            }

            if (editId) {
                for (var e = 0; e < customCopy.length; e++) {
                    if (customCopy[e].id === editId) {
                        customCopy[e] = siteObj;
                        break;
                    }
                }
            } else {
                for (var d = 0; d < customCopy.length; d++) {
                    if (customCopy[d].id === id) return; // duplicate
                }
                customCopy.push(siteObj);
            }

            self._opts.sites = customCopy;
            self._renderTree();
            if (formEl.parentNode) formEl.parentNode.removeChild(formEl);

            if (self._bus) {
                self._bus.emit('config:changed', { customSites: customCopy });
            }
        } catch (err) {
            MU.shield.log('afbuild', '_saveSiteForm', err);
        }
    };

    Mu20AfBuild.prototype._removeSite = function (siteId) {
        var self = this;
        if (MU.confirmDialog) {
            // Use themed confirm if available
            MU.confirmDialog('\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05D4\u05D0\u05EA\u05E8?', function (yes) {
                if (yes) self._doRemoveSite(siteId);
            });
        } else {
            if (!confirm('\u05D4\u05D0\u05DD \u05DC\u05DE\u05D7\u05D5\u05E7 \u05D0\u05EA \u05D4\u05D0\u05EA\u05E8?')) return;
            self._doRemoveSite(siteId);
        }
    };

    Mu20AfBuild.prototype._doRemoveSite = function (siteId) {
        var self = this;
        var sites = self._opts.sites || [];
        var filtered = [];
        for (var i = 0; i < sites.length; i++) {
            if (sites[i].id !== siteId) filtered.push(sites[i]);
        }
        self._opts.sites = filtered;
        self._renderTree();

        if (self._bus) {
            self._bus.emit('config:changed', { customSites: filtered });
        }
    };


    // ─────────────────────────────────────
    //  AF Browser: Connect & Browse Hierarchy
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._connectAF = function () {
        var self = this;
        if (!self._api) {
            self._afStatus('\u05D0\u05D9\u05DF \u05D7\u05D9\u05D1\u05D5\u05E8 PI Web API');
            return;
        }

        self._afStatus('\u05DE\u05EA\u05D7\u05D1\u05E8...');
        var tree = self._afBrowserEl.querySelector('.mu20-af-browser-tree');
        while (tree.firstChild) tree.removeChild(tree.firstChild);

        self._api.getServers(function (err, data) {
            if (self._destroyed) return;
            if (err) {
                self._afStatus('\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05D7\u05D9\u05D1\u05D5\u05E8: ' +
                    (err.text || err.status));
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
                tree.appendChild(node);
            }
        });
    };


    // ─────────────────────────────────────
    //  Create a tree node for the AF browser
    // ─────────────────────────────────────

    /**
     * @param {string} name
     * @param {string} webId
     * @param {string} type  - 'server'|'database'|'element'|'attribute'
     * @param {number} depth - indentation level
     * @returns {HTMLElement}
     */
    Mu20AfBuild.prototype._createTreeNode = function (name, webId, type, depth) {
        var self = this;
        var icons = {
            server:    '\uD83D\uDDA5',
            database:  '\uD83D\uDDC3',
            element:   '\uD83D\uDCC1',
            attribute: '\uD83C\uDFF7'
        };
        var icon = icons[type] || '\u25CF';

        var node = document.createElement('div');
        node.className = 'mu20-af-node';
        node.setAttribute('data-webid', webId);
        node.setAttribute('data-type', type);
        node.setAttribute('dir', 'ltr');
        node.style.padding = '2px 4px';
        node.style.paddingRight = (depth * 16 + 4) + 'px';
        node.style.cursor = 'pointer';
        node.style.borderRadius = '3px';
        node.style.fontSize = '12px';
        node.style.whiteSpace = 'nowrap';

        var toggleSpan = document.createElement('span');
        toggleSpan.className = 'mu20-af-toggle';
        toggleSpan.style.display = 'inline-block';
        toggleSpan.style.width = '14px';
        toggleSpan.style.textAlign = 'center';
        toggleSpan.textContent = (type !== 'attribute') ? '\u25B6' : '';
        node.appendChild(toggleSpan);

        var iconSpan = document.createElement('span');
        iconSpan.style.margin = '0 4px';
        iconSpan.textContent = icon;
        node.appendChild(iconSpan);

        var nameSpan = document.createElement('span');
        nameSpan.className = 'mu20-af-node-name';
        nameSpan.textContent = name;
        node.appendChild(nameSpan);

        // Hover effect
        node.addEventListener('mouseenter', function () { this.style.background = '#1a3550'; });
        node.addEventListener('mouseleave', function () { this.style.background = ''; });

        // Click to expand children or preview attribute
        node.addEventListener('click', function (ev) {
            ev.stopPropagation();
            if (type === 'attribute') {
                self._previewAttribute(webId, name, node);
                return;
            }
            // Toggle expand
            var isExpanded = toggleSpan.textContent === '\u25BC';
            if (isExpanded) {
                // Collapse: remove child nodes that were inserted after this node
                self._removeChildNodes(node, depth);
                toggleSpan.textContent = '\u25B6';
                return;
            }
            toggleSpan.textContent = '\u25BC';
            self._expandNode(webId, type, depth + 1, node);
        });

        // Make attribute nodes draggable for drag-to-bind
        if (type === 'attribute') {
            node.setAttribute('draggable', 'true');
            node.addEventListener('dragstart', function (ev) {
                var dt = ev.dataTransfer;
                dt.setData('text/plain', webId);
                dt.setData('application/x-af-name', name);
                dt.setData('application/x-af-webid', webId);
                var fullPath = self._buildPathFromNode(node);
                dt.setData('application/x-af-path', fullPath);
            });
        }

        return node;
    };


    // ─────────────────────────────────────
    //  Remove child nodes below a parent (collapse)
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._removeChildNodes = function (parentNode, parentDepth) {
        // Remove all subsequent siblings that have a deeper indent
        var next = parentNode.nextElementSibling;
        while (next) {
            var nextDepth = parseInt(next.style.paddingRight, 10);
            var parentPad = parentDepth * 16 + 4;
            // If next node has higher indent, it's a child — remove it
            if (nextDepth > parentPad) {
                var toRemove = next;
                next = next.nextElementSibling;
                toRemove.parentNode.removeChild(toRemove);
            } else {
                break;
            }
        }
    };


    // ─────────────────────────────────────
    //  Expand node — load children from API
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._expandNode = function (parentWebId, parentType, depth, afterEl) {
        var self = this;
        if (!self._api) return;

        var insertAfter = afterEl;

        var _insertNode = function (child) {
            if (insertAfter.nextSibling) {
                insertAfter.parentNode.insertBefore(child, insertAfter.nextSibling);
            } else {
                insertAfter.parentNode.appendChild(child);
            }
            insertAfter = child;
        };

        if (parentType === 'server') {
            self._api.getDatabases(parentWebId, function (err, data) {
                if (err || !data || !data.Items) return;
                for (var i = 0; i < data.Items.length; i++) {
                    var child = self._createTreeNode(data.Items[i].Name, data.Items[i].WebId, 'database', depth);
                    _insertNode(child);
                }
            });

        } else if (parentType === 'database') {
            self._api.getDatabaseElements(parentWebId, function (err, data) {
                if (err || !data || !data.Items) return;
                for (var i = 0; i < data.Items.length; i++) {
                    var child = self._createTreeNode(data.Items[i].Name, data.Items[i].WebId, 'element', depth);
                    _insertNode(child);
                }
            });

        } else if (parentType === 'element') {
            self._api.getElements(parentWebId, function (err, data) {
                if (err || !data || !data.Items) return;
                for (var i = 0; i < data.Items.length; i++) {
                    var child = self._createTreeNode(data.Items[i].Name, data.Items[i].WebId, 'element', depth);
                    _insertNode(child);
                }
                // Then load attributes
                self._api.getAttributes(parentWebId, function (err2, data2) {
                    if (err2 || !data2 || !data2.Items) return;
                    for (var j = 0; j < data2.Items.length; j++) {
                        var attrNode = self._createTreeNode(data2.Items[j].Name, data2.Items[j].WebId, 'attribute', depth);
                        _insertNode(attrNode);
                    }
                });
            });
        }
    };


    // ─────────────────────────────────────
    //  Preview attribute current value
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._previewAttribute = function (webId, name, nodeEl) {
        var self = this;
        if (!self._api) return;

        self._api.getStreamValue(webId, function (err, data) {
            var nameEl = nodeEl.querySelector('.mu20-af-node-name');
            if (!nameEl) return;

            if (err) {
                nameEl.textContent = name + '  [\u2716 \u05E9\u05D2\u05D9\u05D0\u05D4]';
                return;
            }
            var val = data;
            if (val && val.Value !== undefined) {
                var display = (typeof val.Value === 'object' && val.Value !== null &&
                    val.Value.Value !== undefined) ? val.Value.Value : val.Value;
                var ts = val.Timestamp
                    ? new Date(val.Timestamp).toLocaleTimeString() : '';
                nameEl.textContent = name + '  [' + display +
                    (ts ? ' @ ' + ts : '') + ']';
                nodeEl.style.color = (val.Good !== false) ? '#2ECC71' : '#E74C3C';
            }
        });
    };


    // ─────────────────────────────────────
    //  Build path from node ancestors
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._buildPathFromNode = function (nodeEl) {
        var parts = [];
        var current = nodeEl;
        while (current && current.classList && current.classList.contains('mu20-af-node')) {
            var nameEl = current.querySelector('.mu20-af-node-name');
            if (nameEl) {
                var rawName = nameEl.textContent.split('  [')[0]; // strip preview
                parts.unshift(rawName);
            }
            current = current.previousElementSibling;
        }
        if (parts.length >= 3) {
            var server = parts[0];
            var db = parts[1];
            var elems = parts.slice(2, parts.length - 1);
            var attr = parts[parts.length - 1];
            return '\\\\' + server + '\\' + db +
                (elems.length ? '\\' + elems.join('\\') : '') + '|' + attr;
        }
        return parts.join('\\');
    };


    // ─────────────────────────────────────
    //  AF Browser: Search Elements
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._searchElements = function (query) {
        var self = this;
        if (!self._api) return;

        var resultsEl = self._afBrowserEl.querySelector('.mu20-af-search-results');
        while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);
        resultsEl.style.display = '';

        var loadingDiv = document.createElement('div');
        loadingDiv.style.color = '#8899AA';
        loadingDiv.style.fontSize = '11px';
        loadingDiv.textContent = '\u05DE\u05D7\u05E4\u05E9...';
        resultsEl.appendChild(loadingDiv);

        var dbPath = (self._opts.serverPath || '') + (self._opts.databasePath || '');
        if (!dbPath || dbPath.length < 4) {
            while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);
            var warnDiv = document.createElement('div');
            warnDiv.style.color = '#F39C12';
            warnDiv.style.fontSize = '11px';
            warnDiv.textContent = '\u05D4\u05D2\u05D3\u05E8 \u05E9\u05E8\u05EA + \u05DE\u05E1\u05D3 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05EA\u05D7\u05D9\u05DC\u05D4';
            resultsEl.appendChild(warnDiv);
            return;
        }

        MU.resolveWebId(dbPath, self._api, function (err, dbWebId) {
            if (err || !dbWebId) {
                while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);
                var errDiv = document.createElement('div');
                errDiv.style.color = '#E74C3C';
                errDiv.style.fontSize = '11px';
                errDiv.textContent = '\u05DC\u05D0 \u05E0\u05D9\u05EA\u05DF \u05DC\u05DE\u05E6\u05D5\u05D0 \u05D0\u05EA \u05D4\u05DE\u05E1\u05D3';
                resultsEl.appendChild(errDiv);
                return;
            }

            self._api.searchElements(dbWebId, query, 20, function (err2, data) {
                if (self._destroyed) return;
                while (resultsEl.firstChild) resultsEl.removeChild(resultsEl.firstChild);

                if (err2 || !data || !data.Items || !data.Items.length) {
                    var emptyDiv = document.createElement('div');
                    emptyDiv.style.color = '#8899AA';
                    emptyDiv.style.fontSize = '11px';
                    emptyDiv.textContent = '\u05D0\u05D9\u05DF \u05EA\u05D5\u05E6\u05D0\u05D5\u05EA';
                    resultsEl.appendChild(emptyDiv);
                    return;
                }

                for (var i = 0; i < data.Items.length; i++) {
                    var item = data.Items[i];
                    var row = document.createElement('div');
                    row.className = 'mu20-af-search-result';
                    row.style.padding = '3px 6px';
                    row.style.cursor = 'pointer';
                    row.style.fontSize = '11px';
                    row.style.borderBottom = '1px solid #1a3550';
                    row.setAttribute('dir', 'ltr');

                    var strong = document.createElement('strong');
                    strong.textContent = item.Name;
                    row.appendChild(strong);

                    var pathSpan = document.createElement('span');
                    pathSpan.style.color = '#8899AA';
                    pathSpan.style.marginLeft = '8px';
                    pathSpan.textContent = item.Path || '';
                    row.appendChild(pathSpan);

                    row.addEventListener('mouseenter', function () {
                        this.style.background = '#1a3550';
                    });
                    row.addEventListener('mouseleave', function () {
                        this.style.background = '';
                    });

                    // Click to add element to tree (closure)
                    (function (wId, iName) {
                        row.addEventListener('click', function () {
                            var tree = self._afBrowserEl.querySelector('.mu20-af-browser-tree');
                            var node = self._createTreeNode(iName, wId, 'element', 0);
                            if (tree.firstChild) {
                                tree.insertBefore(node, tree.firstChild);
                            } else {
                                tree.appendChild(node);
                            }
                            resultsEl.style.display = 'none';
                            var sInput = self._afBrowserEl.querySelector('.mu20-af-search-input');
                            if (sInput) sInput.value = '';
                        });
                    })(item.WebId, item.Name);

                    resultsEl.appendChild(row);
                }
            });
        });
    };


    // ─────────────────────────────────────
    //  AF Browser: Validate All Paths
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._validateAllPaths = function () {
        var self = this;
        if (!self._api) {
            self._afStatus('\u05D0\u05D9\u05DF \u05D7\u05D9\u05D1\u05D5\u05E8 API \u05DC\u05D0\u05D9\u05DE\u05D5\u05EA');
            return;
        }

        var map = self._opts.pathMap || {};
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

        var allInputs = self._treeEl.querySelectorAll('.mu20-af-path-input');

        for (var i = 0; i < keys.length; i++) {
            (function (pathKey) {
                var fullPath = map[pathKey];

                self._api.getByPath(fullPath, function (err, data) {
                    done++;
                    // Find matching inputs by value
                    for (var n = 0; n < allInputs.length; n++) {
                        if (allInputs[n].value === fullPath) {
                            if (err) {
                                allInputs[n].classList.add('mu20-af-path-invalid');
                                allInputs[n].style.borderColor = '#E74C3C';
                            } else {
                                allInputs[n].classList.remove('mu20-af-path-invalid');
                                allInputs[n].style.borderColor = '#2ECC71';
                            }
                        }
                    }

                    if (err) {
                        invalid++;
                    } else {
                        valid++;
                        if (data && data.WebId) {
                            MU.cacheWebId(fullPath, data.WebId);
                        }
                    }

                    if (done === keys.length) {
                        self._afStatus('\u05D0\u05D9\u05DE\u05D5\u05EA \u05D4\u05D5\u05E9\u05DC\u05DD: ' +
                            valid + ' \u2705  ' + invalid + ' \u274C');
                        if (self._bus) {
                            self._bus.emit('af:validated', {
                                total: keys.length, valid: valid, invalid: invalid
                            });
                        }
                    }
                });
            })(keys[i]);
        }
    };


    // ─────────────────────────────────────
    //  AF status text helper
    // ─────────────────────────────────────

    Mu20AfBuild.prototype._afStatus = function (text) {
        if (this._afBrowserEl) {
            var el = this._afBrowserEl.querySelector('.mu20-af-browser-status');
            if (el) el.textContent = text;
        }
    };


    // ─────────────────────────────────────
    //  setOption (replaces jQuery _setOption)
    // ─────────────────────────────────────

    Mu20AfBuild.prototype.setOption = function (key, value) {
        this._opts[key] = value;
        if (key === 'sites' || key === 'pathMap') {
            this._renderTree();
        }
        if (key === 'api') {
            this._api = value;
            if (this._afBrowserEl && value) {
                this._afBrowserEl.style.display = '';
            }
        }
    };


    // ═══════════════════════════════════════
    //  Plugin contract methods
    // ═══════════════════════════════════════

    Mu20AfBuild.prototype.update = function () {
        // no-op — AF build is configuration-only, not data-driven
    };

    Mu20AfBuild.prototype.onResize = function () {
        // optional — no special resize logic needed
    };

    Mu20AfBuild.prototype.onTabActivated = function () {
        // optional — could refresh tree if needed
    };


    // ═══════════════════════════════════════
    //  destroy
    // ═══════════════════════════════════════

    Mu20AfBuild.prototype.destroy = function () {
        this._destroyed = true;

        if (this._searchTimer) {
            clearTimeout(this._searchTimer);
            this._searchTimer = null;
        }

        if (this._bus) {
            if (this._onConfigChanged) this._bus.off('config:changed', this._onConfigChanged);
            if (this._onApiReady) this._bus.off('api:ready', this._onApiReady);
        }

        this._api = null;

        var root = this._container;
        while (root.firstChild) root.removeChild(root.firstChild);
        root.classList.remove('mu20-afbuild-root');

        this._treeEl      = null;
        this._bulkEl      = null;
        this._crudEl      = null;
        this._afBrowserEl = null;
        this._searchEl    = null;
    };


    // ═══════════════════════════════════════
    //  Export
    // ═══════════════════════════════════════

    window.Mu20AfBuild = Mu20AfBuild;

})();
