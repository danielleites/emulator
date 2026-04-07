/**
 * ═══════════════════════════════════════════════════════
 *  mm20-tags.js  —  Tag Management Tab Widget
 * ═══════════════════════════════════════════════════════
 *  Displays a registry of all AF tags being monitored,
 *  with status, last value, search/filter, and sort.
 *
 *  jQuery widget: mm20.mm20Tags
 *  Version: 20.1.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-tags] MM20 core not loaded'); return; }

    $.widget('mm20.mm20Tags', {

        options: {
            bus:      null,
            api:      null,    // PI Web API client from orchestrator
            sites:    null,
            data:     null,
            demoMode: false,
            staleSec: 300,
            filterText: '',
            sortCol:    'site',
            sortAsc:    true
        },

        _registry:  null,  // array of tag objects
        _tableEl:   null,
        _filterEl:  null,
        _countEl:   null,
        _previewEl: null,  // live value preview popup
        _api:       null,  // local API ref
        _destroyed: false,

        // ═══════════════════════════════════════
        //  _create
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;
            self._registry = [];

            try {
                var el = self.element;
                el.addClass('mm20-tags-root');

                // ── Controls bar ──
                var controls = $('<div class="mm20-tags-controls"></div>');

                self._filterEl = $('<input class="mm20-search-input" type="text" placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05EA\u05D2\u05D9\u05DD..." dir="rtl" style="width:200px;" />');
                self._filterEl.on('input', function () {
                    self.options.filterText = this.value;
                    self._renderTable();
                });
                controls.append(self._filterEl);

                self._countEl = $('<span class="mm20-tags-count"></span>');
                controls.append(self._countEl);

                var exportBtn = $('<button class="mm20-btn" style="margin-right:auto;">\u05D9\u05E6\u05D0 CSV</button>');
                exportBtn.on('click', function () { self._exportCsv(); });
                controls.append(exportBtn);

                // Validate All Tags button (API-powered)
                var validateBtn = $('<button class="mm20-btn mm20-tags-validate" style="margin-right:8px;">\u2714 \u05D0\u05DE\u05EA \u05EA\u05D2\u05D9\u05DD</button>');
                validateBtn.on('click', function () { self._validateAllTags(); });
                controls.append(validateBtn);

                el.append(controls);

                // ── Table container ──
                self._tableEl = $('<div class="mm20-tags-table-wrap" style="overflow:auto; flex:1;"></div>');
                el.append(self._tableEl);

                // ── Live preview popup (hidden by default) ──
                self._previewEl = $(
                    '<div class="mm20-tags-preview" dir="rtl" style="display:none; position:absolute; ' +
                    'background:#0F2940; border:1px solid #5BC0EB; border-radius:6px; padding:10px; z-index:100; ' +
                    'min-width:200px; box-shadow:0 4px 12px rgba(0,0,0,0.5);">' +
                        '<div class="mm20-preview-title" style="font-weight:600; margin-bottom:4px;"></div>' +
                        '<div class="mm20-preview-value" style="font-size:18px; font-variant-numeric:tabular-nums;"></div>' +
                        '<div class="mm20-preview-ts" style="font-size:10px; color:#8899AA; margin-top:4px;"></div>' +
                        '<div class="mm20-preview-quality" style="font-size:10px; margin-top:2px;"></div>' +
                    '</div>'
                );
                el.append(self._previewEl);

                // ── Bus subscriptions ──
                var bus = self.options.bus;
                if (bus) {
                    self._onDataUpdated = function (d) {
                        if (d && d.sites) {
                            self.options.data = d.sites;
                            self._buildRegistry();
                            self._renderTable();
                        }
                    };
                    bus.on('data:updated', self._onDataUpdated, self);

                    self._onDemoToggle = function (d) {
                        self.options.demoMode = d.enabled;
                    };
                    bus.on('demo:toggle', self._onDemoToggle, self);

                    // Listen for API ready
                    self._onApiReady = function (api) {
                        self._api = api;
                    };
                    bus.on('api:ready', self._onApiReady, self);
                }

                // If API already provided in options
                if (self.options.api) {
                    self._api = self.options.api;
                }

                // ── Initial render ──
                if (self.options.demoMode) {
                    self._generateDemoTags();
                }
                self._renderTable();

            } catch (e) {
                MM.shield.log('tags', '_create', e);
                MM.shield.renderFallback(self.element, 'tags', e);
            }
        },


        // ─────────────────────────────────────
        //  Build registry from parsed data
        // ─────────────────────────────────────

        _buildRegistry: function () {
            var self = this;
            var sites = self.options.sites || MM.SITES;
            var data = self.options.data;
            if (!data) return;

            var registry = [];
            var now = new Date().getTime();
            var staleSec = self.options.staleSec || 300;

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = data[site.id];
                if (!siteData) continue;

                for (var u = 0; u < site.units.length; u++) {
                    var unitData = siteData[u];
                    if (!unitData) continue;

                    // Generate tag entries for each attribute
                    var attrs = ['hours', 'quota', 'pct'];
                    var attrLabels = {
                        hours: '\u05E9\u05E2\u05D5\u05EA',
                        quota: '\u05DE\u05DB\u05E1\u05D4',
                        pct:   '% \u05E0\u05D9\u05E6\u05D5\u05DC'
                    };

                    for (var a = 0; a < attrs.length; a++) {
                        var attr = attrs[a];
                        var val = unitData[attr];
                        var ts = unitData.ts;
                        var tsMs = ts ? new Date(ts).getTime() : 0;
                        var ageSec = tsMs ? (now - tsMs) / 1000 : Infinity;
                        var status = ageSec > staleSec ? 'stale' : (val !== undefined && val !== null ? 'good' : 'bad');

                        registry.push({
                            key: MM.unitKey(site.id, u) + '_' + attr,
                            siteId: site.id,
                            siteName: site.name,
                            unitName: site.units[u],
                            unitIdx: u,
                            attrName: attrLabels[attr] || attr,
                            attrKey: attr,
                            afPath: (site.id + '\\' + site.units[u] + '|' + attr),
                            status: status,
                            lastValue: (val !== undefined && val !== null) ? val : null,
                            lastUpdate: ts || null
                        });
                    }
                }
            }

            self._registry = registry;
        },


        // ─────────────────────────────────────
        //  Generate demo tags
        // ─────────────────────────────────────

        _generateDemoTags: function () {
            var self = this;
            var sites = self.options.sites || MM.SITES;
            var demoData = MM.demo.generateSites(sites);
            self.options.data = demoData;
            self._buildRegistry();
        },


        // ─────────────────────────────────────
        //  Render table
        // ─────────────────────────────────────

        _renderTable: function () {
            var self = this;
            var container = self._tableEl;
            container.empty();

            var registry = self._registry || [];
            var filter = (self.options.filterText || '').toLowerCase();

            // Filter
            var filtered = [];
            for (var i = 0; i < registry.length; i++) {
                var tag = registry[i];
                if (filter) {
                    var haystack = (tag.siteName + ' ' + tag.unitName + ' ' + tag.attrName + ' ' + tag.afPath + ' ' + tag.status).toLowerCase();
                    if (haystack.indexOf(filter) < 0) continue;
                }
                filtered.push(tag);
            }

            // Sort
            var sortCol = self.options.sortCol;
            var sortAsc = self.options.sortAsc;
            filtered.sort(function (a, b) {
                var va, vb;
                switch (sortCol) {
                    case 'site':   va = a.siteName; vb = b.siteName; break;
                    case 'unit':   va = a.unitName; vb = b.unitName; break;
                    case 'attr':   va = a.attrName; vb = b.attrName; break;
                    case 'value':  va = a.lastValue || 0; vb = b.lastValue || 0; break;
                    case 'status': va = a.status; vb = b.status; break;
                    case 'path':   va = a.afPath; vb = b.afPath; break;
                    default:       va = a.siteName; vb = b.siteName;
                }
                if (typeof va === 'string') {
                    var cmp = va.localeCompare(vb);
                    return sortAsc ? cmp : -cmp;
                }
                return sortAsc ? (va - vb) : (vb - va);
            });

            // Update count
            self._countEl.text(filtered.length + ' / ' + registry.length + ' \u05EA\u05D2\u05D9\u05DD');

            if (!filtered.length) {
                container.html('<div class="mm20-tags-placeholder" dir="rtl">\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05EA\u05D2\u05D9\u05DD</div>');
                return;
            }

            // Build table
            var table = $('<table class="mm20-log-table mm20-tags-table"></table>');

            // Header
            var cols = [
                { key: 'site',   label: '\u05D0\u05EA\u05E8' },
                { key: 'unit',   label: '\u05D9\u05D7\u05D9\u05D3\u05D4' },
                { key: 'attr',   label: '\u05DE\u05D0\u05E4\u05D9\u05D9\u05DF' },
                { key: 'value',  label: '\u05E2\u05E8\u05DA' },
                { key: 'status', label: '\u05E1\u05D8\u05D8\u05D5\u05E1' },
                { key: 'path',   label: '\u05E0\u05EA\u05D9\u05D1 AF' },
                { key: 'webid',  label: 'WebId' }
            ];

            var thead = $('<thead><tr></tr></thead>');
            var headerRow = thead.find('tr');
            for (var c = 0; c < cols.length; c++) {
                (function (col) {
                    var th = $('<th style="cursor:pointer;"></th>').text(col.label);
                    if (self.options.sortCol === col.key) {
                        th.append(sortAsc ? ' \u25B2' : ' \u25BC');
                    }
                    th.on('click', function () {
                        if (self.options.sortCol === col.key) {
                            self.options.sortAsc = !self.options.sortAsc;
                        } else {
                            self.options.sortCol = col.key;
                            self.options.sortAsc = true;
                        }
                        self._renderTable();
                    });
                    headerRow.append(th);
                })(cols[c]);
            }
            table.append(thead);

            // Body
            var tbody = $('<tbody></tbody>');
            var statusLabels = { good: '\u05EA\u05E7\u05D9\u05DF', stale: '\u05D9\u05E9\u05DF', bad: '\u05E9\u05D2\u05D9\u05D0\u05D4' };
            var statusClasses = { good: 'mm20-tag-good', stale: 'mm20-tag-stale', bad: 'mm20-tag-bad' };

            for (var r = 0; r < filtered.length; r++) {
                var t = filtered[r];
                var tr = $('<tr></tr>');
                tr.append($('<td></td>').text(t.siteName));
                tr.append($('<td></td>').text(t.unitName));
                tr.append($('<td></td>').text(t.attrName));
                tr.append($('<td style="font-variant-numeric:tabular-nums;"></td>').text(
                    t.lastValue !== null ? MM.formatNum(t.lastValue, 1) : '--'
                ));
                tr.append(
                    $('<td></td>').append(
                        $('<span class="mm20-tag-badge ' + (statusClasses[t.status] || '') + '"></span>')
                            .text(statusLabels[t.status] || t.status)
                    )
                );
                tr.append($('<td class="mm20-tag-path"></td>').text(t.afPath));

                // WebId column (truncated)
                var webIdText = t.webId ? t.webId.substring(0, 12) + '...' : '\u2014';
                tr.append($('<td class="mm20-tag-webid" style="font-size:10px; color:#8899AA; max-width:80px; overflow:hidden;"></td>')
                    .text(webIdText).attr('title', t.webId || ''));

                // Click to select tag → emit + live preview
                (function (tag, rowEl) {
                    rowEl.on('click', function (ev) {
                        var bus = self.options.bus;
                        if (bus) {
                            bus.emit('tag:selected', {
                                siteId: tag.siteId,
                                unitIdx: tag.unitIdx,
                                attr: tag.attrKey
                            });
                        }
                        // Highlight selected row
                        tbody.find('tr').removeClass('mm20-tag-selected');
                        $(this).addClass('mm20-tag-selected');

                        // Live preview via API (if available)
                        if (self._api && tag.webId) {
                            self._showLivePreview(tag, ev);
                        }
                    });
                })(t, tr);

                tbody.append(tr);
            }

            table.append(tbody);
            container.append(table);
        },


        // ─────────────────────────────────────
        //  API: Validate All Tags
        // ─────────────────────────────────────

        /**
         * Validate every tag by resolving its AF path via PI Web API.
         * Updates status to good/bad/stale and caches WebIds.
         */
        _validateAllTags: function () {
            var self = this;
            if (!self._api) {
                var bus = self.options.bus;
                if (bus) bus.emit('log:entry', { level: 'warn', source: 'tags', msg: '\u05D0\u05D9\u05DF API \u05DC\u05D0\u05D9\u05DE\u05D5\u05EA \u05EA\u05D2\u05D9\u05DD', ts: new Date().toISOString() });
                return;
            }

            var registry = self._registry || [];
            if (!registry.length) return;

            var done = 0, valid = 0, invalid = 0;
            self._countEl.text('\u05DE\u05D0\u05DE\u05EA...');

            for (var i = 0; i < registry.length; i++) {
                (function (tag) {
                    var fullPath = tag.afPath;
                    if (!fullPath || fullPath.indexOf('|') < 0) {
                        done++;
                        tag.apiStatus = 'skip';
                        if (done === registry.length) self._onValidationDone(valid, invalid);
                        return;
                    }

                    // Resolve attribute path
                    MM.resolveAttributeWebId(fullPath, self._api, function (err, webId) {
                        done++;
                        if (err) {
                            invalid++;
                            tag.apiStatus = 'invalid';
                            tag.webId = '';
                        } else {
                            valid++;
                            tag.apiStatus = 'valid';
                            tag.webId = webId;

                            // Also fetch current value
                            self._api.getStreamValue(webId, function (err2, data) {
                                if (!err2 && data) {
                                    var sv = MM.AF.safeVal(data, 1);
                                    tag.lastValue = sv.numeric;
                                    tag.apiValue = sv.display;
                                    tag.status = sv.good ? (MM.AF.isStale(data, self.options.staleSec) ? 'stale' : 'good') : 'bad';
                                    tag.lastUpdate = data.Timestamp || tag.lastUpdate;
                                }
                                // Re-render on last tag
                                if (done === registry.length) {
                                    self._onValidationDone(valid, invalid);
                                }
                            });
                            return; // skip onDone until getStreamValue finishes
                        }

                        if (done === registry.length) {
                            self._onValidationDone(valid, invalid);
                        }
                    });
                })(registry[i]);
            }
        },

        _onValidationDone: function (valid, invalid) {
            this._renderTable();
            this._countEl.text(
                this._registry.length + ' \u05EA\u05D2\u05D9\u05DD  |  ' +
                valid + ' \u2705  ' + invalid + ' \u274C'
            );
        },


        // ─────────────────────────────────────
        //  API: Live Value Preview
        // ─────────────────────────────────────

        /**
         * Show a popup with the live value of a tag from API.
         */
        _showLivePreview: function (tag, ev) {
            var self = this;
            if (!self._api || !tag.webId) {
                self._previewEl.hide();
                return;
            }

            self._previewEl.find('.mm20-preview-title').text(tag.siteName + ' / ' + tag.unitName + ' / ' + tag.attrName);
            self._previewEl.find('.mm20-preview-value').text('\u05D8\u05D5\u05E2\u05DF...');
            self._previewEl.find('.mm20-preview-ts').text('');
            self._previewEl.find('.mm20-preview-quality').text('');

            // Position near click
            var offset = self.element.offset();
            self._previewEl.css({
                display: 'block',
                top: (ev.pageY - offset.top + 10) + 'px',
                right: '10px'
            });

            self._api.getStreamValue(tag.webId, function (err, data) {
                if (self._destroyed) return;
                if (err) {
                    self._previewEl.find('.mm20-preview-value').text('\u274C \u05E9\u05D2\u05D9\u05D0\u05D4');
                    return;
                }
                var sv = MM.AF.safeVal(data, 2);
                self._previewEl.find('.mm20-preview-value').text(sv.display).css('color', sv.good ? '#2ECC71' : '#E74C3C');
                self._previewEl.find('.mm20-preview-ts').text(data.Timestamp ? new Date(data.Timestamp).toLocaleString() : '');
                self._previewEl.find('.mm20-preview-quality').text(sv.good ? '\u2705 \u05EA\u05E7\u05D9\u05DF' : '\u274C \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF');

                // Auto-hide after 5s
                setTimeout(function () { self._previewEl.fadeOut(200); }, 5000);
            });
        },


        // ─────────────────────────────────────
        //  Export CSV
        // ─────────────────────────────────────

        _exportCsv: function () {
            var self = this;
            var rows = [];
            var registry = self._registry || [];
            for (var i = 0; i < registry.length; i++) {
                var t = registry[i];
                rows.push({
                    '\u05D0\u05EA\u05E8': t.siteName,
                    '\u05D9\u05D7\u05D9\u05D3\u05D4': t.unitName,
                    '\u05DE\u05D0\u05E4\u05D9\u05D9\u05DF': t.attrName,
                    '\u05E2\u05E8\u05DA': t.lastValue !== null ? t.lastValue : '',
                    '\u05E1\u05D8\u05D8\u05D5\u05E1': t.status,
                    '\u05E0\u05EA\u05D9\u05D1 AF': t.afPath,
                    '\u05E2\u05D3\u05DB\u05D5\u05DF \u05D0\u05D7\u05E8\u05D5\u05DF': t.lastUpdate || ''
                });
            }
            MM.exportCsv(rows, 'mm20-tags-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
        },


        // ═══════════════════════════════════════
        //  _setOption
        // ═══════════════════════════════════════

        _setOption: function (key, value) {
            this._super(key, value);

            if (key === 'data') {
                this._buildRegistry();
                this._renderTable();
            } else if (key === 'filterText' || key === 'sortCol' || key === 'sortAsc') {
                this._renderTable();
            }
        },


        // ═══════════════════════════════════════
        //  _destroy
        // ═══════════════════════════════════════

        _destroy: function () {
            this._destroyed = true;

            var bus = this.options.bus;
            if (bus) {
                if (this._onDataUpdated) bus.off('data:updated', this._onDataUpdated);
                if (this._onDemoToggle)  bus.off('demo:toggle', this._onDemoToggle);
                if (this._onApiReady)    bus.off('api:ready', this._onApiReady);
            }

            this._api = null;
            this._registry = null;
            this.element.empty().removeClass('mm20-tags-root');
        }
    });

})(window.jQuery);
