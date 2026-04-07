/**
 * ═══════════════════════════════════════════════════════
 *  mm20-tagExplorer.js  —  Tag Explorer Widget
 * ═══════════════════════════════════════════════════════
 *  Interactive tag investigation: pick tags, choose
 *  visualization, analyze relationships.
 *
 *  Four chart modes (MVP):
 *    Trend Overlay | Scatter X/Y | Summary Table | Correlation Heatmap
 *
 *  jQuery widget: mm20.mm20TagExplorer
 *  Version: 20.1.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-tagExplorer] MM20 core not loaded'); return; }


    $.widget('mm20.mm20TagExplorer', {

        options: {
            bus:             null,
            api:             null,
            sites:           null,
            demoMode:        false,
            defaultChart:    'trend',
            defaultAggregation: 'avg',
            defaultSampleInterval: '5m',
            maxTags:         8,
            savedState:      null,
            onStateChange:   null
        },

        // State
        _selectedTags:   null,   // [{ tagName, objectName, roleLabel, tagPath }]
        _chartType:      'trend',
        _dateStart:      null,
        _dateEnd:        null,
        _siteId:         '',
        _unitIdx:        null,
        _fetchGen:       0,     // generation counter for async fetch
        _lastAligned:    null,  // last aligned result (for CSV export)
        _destroyed:      false,

        // DOM refs
        _contextBar: null,
        _tagBar:     null,
        _chartBar:   null,
        _outputEl:   null,
        _canvasEl:   null,
        _summaryEl:  null,
        _kpiBar:     null,


        // ═══════════════════════════════════════
        //  _create
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;
            self._selectedTags = [];
            self._chartType = self.options.defaultChart || 'trend';

            try {
                var el = self.element;
                el.addClass('mm20-explorer-root');

                // ── 1. Context Bar ──
                self._contextBar = $('<div class="mm20-explorer-context" dir="rtl"></div>');
                self._contextBar.append(
                    '<span class="mm20-explorer-context-label">\u05D7\u05E7\u05E8 \u05EA\u05D2\u05D9\u05DD</span>'
                );

                // Time range display
                self._timeDisplay = $('<span class="mm20-explorer-time"></span>');
                self._contextBar.append(self._timeDisplay);

                // Site/Unit display
                self._contextDisplay = $('<span class="mm20-explorer-site"></span>');
                self._contextBar.append(self._contextDisplay);

                // Refresh button
                var refreshBtn = $('<button class="mm20-btn mm20-btn-sm">\u05E8\u05E2\u05E0\u05DF</button>');
                refreshBtn.on('click', function () { self._runAnalysis(); });
                self._contextBar.append(refreshBtn);

                // Export button
                var exportBtn = $('<button class="mm20-btn mm20-btn-sm">\u05D9\u05E6\u05D0</button>');
                exportBtn.on('click', function () { self._exportCurrentView(); });
                self._contextBar.append(exportBtn);

                el.append(self._contextBar);

                // ── 2. Tag Selection Bar ──
                self._tagBar = $('<div class="mm20-explorer-tags" dir="rtl"></div>');
                self._tagBar.append('<span class="mm20-explorer-tags-label">\u05EA\u05D2\u05D9\u05DD \u05E0\u05D1\u05D7\u05E8\u05D9\u05DD:</span>');
                self._tagListEl = $('<div class="mm20-explorer-tag-list"></div>');
                self._tagBar.append(self._tagListEl);

                // Add tag button
                var addTagBtn = $('<button class="mm20-btn mm20-btn-sm mm20-btn-accent">+ \u05D4\u05D5\u05E1\u05E3 \u05EA\u05D2</button>');
                addTagBtn.on('click', function () { self._openAddTagDialog(); });
                self._tagBar.append(addTagBtn);

                // Clear all
                var clearBtn = $('<button class="mm20-btn mm20-btn-sm">\u05E0\u05E7\u05D4 \u05D4\u05DB\u05DC</button>');
                clearBtn.on('click', function () {
                    self._selectedTags = [];
                    self._renderTagList();
                    self._clearOutput();
                });
                self._tagBar.append(clearBtn);

                el.append(self._tagBar);

                // ── 3. Chart Type Selector ──
                self._chartBar = $('<div class="mm20-explorer-chartbar" dir="rtl"></div>');
                // QA14-FIX: replaced ES6 \u{xxxx} with ES5-safe surrogate pairs
                var chartTypes = [
                    { key: 'trend',   label: 'Trend',   icon: '\uD83D\uDCC8', minTags: 1 },
                    { key: 'scatter', label: 'Scatter',  icon: '\u2022\u2022', minTags: 2, maxTags: 2 },
                    { key: 'table',   label: '\u05D8\u05D1\u05DC\u05D4',   icon: '\uD83D\uDCCA', minTags: 1 },
                    { key: 'heatmap', label: 'Heatmap', icon: '\u2588\u2588', minTags: 2 }
                ];

                for (var c = 0; c < chartTypes.length; c++) {
                    (function (ct) {
                        var btn = $('<button class="mm20-explorer-chart-btn"></button>');
                        btn.attr('data-chart', ct.key);
                        btn.text(ct.icon + ' ' + ct.label);
                        if (ct.key === self._chartType) {
                            btn.addClass('mm20-explorer-chart-btn--active');
                        }
                        btn.on('click', function () {
                            // Validate tag count
                            var tagCount = self._selectedTags.length;
                            if (ct.minTags && tagCount < ct.minTags) {
                                self._showMessage('\u05E0\u05D3\u05E8\u05E9\u05D9\u05DD \u05DC\u05E4\u05D7\u05D5\u05EA ' + ct.minTags + ' \u05EA\u05D2\u05D9\u05DD \u05DC\u05EA\u05E6\u05D5\u05D2\u05D4 \u05D6\u05D5');
                                return;
                            }
                            if (ct.maxTags && tagCount > ct.maxTags) {
                                self._showMessage(ct.label + ' \u05EA\u05D5\u05DE\u05DA \u05E2\u05D3 ' + ct.maxTags + ' \u05EA\u05D2\u05D9\u05DD');
                                return;
                            }
                            self._chartType = ct.key;
                            self._chartBar.find('.mm20-explorer-chart-btn').removeClass('mm20-explorer-chart-btn--active');
                            btn.addClass('mm20-explorer-chart-btn--active');
                            self._runAnalysis();
                        });
                        self._chartBar.append(btn);
                    })(chartTypes[c]);
                }
                el.append(self._chartBar);

                // ── 4. Output Area ──
                self._outputEl = $('<div class="mm20-explorer-output"></div>');

                // KPI bar
                self._kpiBar = $('<div class="mm20-explorer-kpi" dir="rtl"></div>');
                self._outputEl.append(self._kpiBar);

                // Canvas for charts
                self._canvasEl = $('<canvas class="mm20-explorer-canvas" width="800" height="400"></canvas>');
                self._outputEl.append(self._canvasEl);

                // Summary / table area
                self._summaryEl = $('<div class="mm20-explorer-summary" dir="rtl"></div>');
                self._outputEl.append(self._summaryEl);

                el.append(self._outputEl);

                // ── Add tag dialog (hidden) ──
                self._addTagDialog = $(
                    '<div class="mm20-explorer-add-dialog" dir="rtl" style="display:none;">' +
                        '<div class="mm20-assign-backdrop"></div>' +
                        '<div class="mm20-assign-content">' +
                            '<div class="mm20-assign-header">\u05D4\u05D5\u05E1\u05E3 \u05EA\u05D2 \u05DC\u05D7\u05E7\u05E8</div>' +
                            '<input class="mm20-search-input mm20-addtag-search" type="text" placeholder="\u05D7\u05E4\u05E9 \u05EA\u05D2..." dir="rtl" />' +
                            '<div class="mm20-addtag-list"></div>' +
                            '<div class="mm20-assign-actions">' +
                                '<button class="mm20-btn mm20-addtag-cancel">\u05E1\u05D2\u05D5\u05E8</button>' +
                            '</div>' +
                        '</div>' +
                    '</div>'
                );
                el.append(self._addTagDialog);
                self._addTagDialog.find('.mm20-assign-backdrop').on('click', function () { self._addTagDialog.hide(); });
                self._addTagDialog.find('.mm20-addtag-cancel').on('click', function () { self._addTagDialog.hide(); });

                // ── Bus subscriptions ──
                var bus = self.options.bus;
                if (bus) {
                    // Tags from Warehouse
                    self._onOpenInExplorer = function (d) {
                        if (d && d.tags && d.tags.length) {
                            self._selectedTags = d.tags.slice(0, self.options.maxTags);
                            self._renderTagList();
                            // Auto-select chart type based on tag count
                            self._autoSelectChart();
                            self._runAnalysis();
                        }
                    };
                    bus.on('tags:openInExplorer', self._onOpenInExplorer, self);

                    // Time sync
                    self._onTimeChanged = function (d) {
                        if (d) {
                            self._dateStart = d.start || null;
                            self._dateEnd = d.end || null;
                            self._updateTimeDisplay();
                            // QA14: Re-run if tags already selected
                            if (self._selectedTags.length > 0) {
                                self._runAnalysis();
                            }
                        }
                    };
                    bus.on('time:rangeChanged', self._onTimeChanged, self);

                    // QA14-FIX: Site/Unit context sync
                    self._onSiteSelected = function (d) {
                        if (d) {
                            self._siteId = d.siteId || '';
                            self._updateContextDisplay();
                        }
                    };
                    bus.on('site:selected', self._onSiteSelected, self);

                    self._onUnitSelected = function (d) {
                        if (d) {
                            self._unitIdx = (d.unitIdx != null) ? d.unitIdx : null;
                            self._updateContextDisplay();
                        }
                    };
                    bus.on('unit:selected', self._onUnitSelected, self);

                    // Demo toggle
                    self._onDemoToggle = function (d) {
                        if (d) self.options.demoMode = d.enabled;
                    };
                    bus.on('demo:toggle', self._onDemoToggle, self);

                    // API ready
                    self._onApiReady = function (api) {
                        self._api = api;
                    };
                    bus.on('api:ready', self._onApiReady, self);
                }

                if (self.options.api) {
                    self._api = self.options.api;
                }

                // Restore saved state if available
                var saved = self.options.savedState;
                if (saved && typeof saved === 'object') {
                    if (saved.selectedTags && saved.selectedTags.length) {
                        self._selectedTags = saved.selectedTags;
                    }
                    if (saved.chartType) {
                        self._chartType = saved.chartType;
                    }
                    if (saved.dateStart) self._dateStart = saved.dateStart;
                    if (saved.dateEnd)   self._dateEnd   = saved.dateEnd;
                }

                // Initial render
                self._renderTagList();
                self._clearOutput();
                self._updateTimeDisplay();

            } catch (e) {
                MM.shield.log('tagExplorer', '_create', e);
                MM.shield.renderFallback(self.element, '\u05D7\u05D5\u05E7\u05E8 \u05EA\u05D2\u05D9\u05DD', e);
            }
        },


        // ─────────────────────────────────────
        //  State persistence
        // ─────────────────────────────────────

        _saveState: function () {
            if (typeof this.options.onStateChange !== 'function') return;
            var state = {
                selectedTags: [],
                chartType:    this._chartType,
                dateStart:    this._dateStart || null,
                dateEnd:      this._dateEnd   || null
            };
            // Save tag references (without cached data)
            for (var i = 0; i < this._selectedTags.length; i++) {
                var t = this._selectedTags[i];
                state.selectedTags.push({
                    tagName:    t.tagName    || '',
                    objectName: t.objectName || '',
                    roleLabel:  t.roleLabel  || '',
                    tagPath:    t.tagPath    || '',
                    webId:      t.webId      || ''
                });
            }
            this.options.onStateChange(state);
        },


        // ─────────────────────────────────────
        //  Tag List rendering
        // ─────────────────────────────────────

        _renderTagList: function () {
            var self = this;
            self._tagListEl.empty();

            if (!self._selectedTags.length) {
                self._tagListEl.append(
                    '<span class="mm20-explorer-no-tags">\u05D0\u05D9\u05DF \u05EA\u05D2\u05D9\u05DD \u05E0\u05D1\u05D7\u05E8\u05D9\u05DD \u2014 \u05D4\u05D5\u05E1\u05E3 \u05EA\u05D2\u05D9\u05DD \u05D0\u05D5 \u05E9\u05DC\u05D7 \u05DE\u05D4\u05DE\u05D7\u05E1\u05DF</span>'
                );
                return;
            }

            var TA = MM.TagAnalysis;

            for (var i = 0; i < self._selectedTags.length; i++) {
                (function (tag, idx) {
                    var chip = $('<span class="mm20-explorer-tag-chip"></span>');
                    chip.css('border-left-color', TA.getColor(idx));
                    chip.text(tag.tagName || tag.roleLabel || 'tag-' + idx);

                    // Remove button
                    var removeBtn = $('<span class="mm20-explorer-tag-remove">\u00D7</span>');
                    removeBtn.on('click', function (e) {
                        e.stopPropagation();
                        self._selectedTags.splice(idx, 1);
                        self._renderTagList();
                        if (self._selectedTags.length > 0) {
                            self._runAnalysis();
                        } else {
                            self._clearOutput();
                            self._saveState();
                        }
                    });
                    chip.append(removeBtn);

                    self._tagListEl.append(chip);
                })(self._selectedTags[i], i);
            }
        },


        // ─────────────────────────────────────
        //  Add Tag Dialog
        // ─────────────────────────────────────

        _openAddTagDialog: function () {
            var self = this;

            if (self._selectedTags.length >= self.options.maxTags) {
                self._showMessage('\u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD ' + self.options.maxTags + ' \u05EA\u05D2\u05D9\u05DD');
                return;
            }

            var listEl = self._addTagDialog.find('.mm20-addtag-list');
            listEl.empty();

            var attrs = ['hours', 'quota', 'pct', 'power', 'temperature', 'efficiency', 'emissions'];
            var attrLabels = {
                hours: '\u05E9\u05E2\u05D5\u05EA', quota: '\u05DE\u05DB\u05E1\u05D4', pct: '\u05D0\u05D7\u05D5\u05D6',
                power: '\u05D4\u05E1\u05E4\u05DA', temperature: '\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4',
                efficiency: '\u05E0\u05E6\u05D9\u05DC\u05D5\u05EA', emissions: '\u05E4\u05DC\u05D9\u05D8\u05D5\u05EA'
            };

            // Build candidate list
            var contextTags = [];  // Tags matching current site/unit context
            var otherTags   = [];  // All other available tags
            var sites = self.options.sites || MM.SITES;
            var activeSiteId = self._siteId || '';
            var activeUnitIdx = self._unitIdx;

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteUnits = site.units || [];
                for (var u = 0; u < siteUnits.length; u++) {
                    for (var a = 0; a < attrs.length; a++) {
                        var tagName = site.id + '.' + siteUnits[u] + '.' + attrs[a];
                        var label = site.name + ' / ' + siteUnits[u] + ' / ' + (attrLabels[attrs[a]] || attrs[a]);

                        // Check if already selected
                        var alreadySelected = false;
                        for (var t = 0; t < self._selectedTags.length; t++) {
                            if (self._selectedTags[t].tagName === tagName) {
                                alreadySelected = true;
                                break;
                            }
                        }
                        if (alreadySelected) continue;

                        var entry = { tagName: tagName, label: label };

                        // Context match: same site, and if unit is selected — same unit
                        var siteMatch = activeSiteId && site.id === activeSiteId;
                        var unitMatch = siteMatch && (activeUnitIdx === null || activeUnitIdx === undefined || u === activeUnitIdx);
                        if (unitMatch) {
                            contextTags.push(entry);
                        } else {
                            otherTags.push(entry);
                        }
                    }
                }
            }

            // Helper to create clickable tag item
            function appendTagItem(entry) {
                (function (tn, lbl) {
                    var item = $('<div class="mm20-assign-suggestion"></div>').text(lbl);
                    item.on('click', function () {
                        self._selectedTags.push({
                            tagName: tn,
                            objectName: lbl,
                            roleLabel: lbl,
                            tagPath: ''
                        });
                        self._addTagDialog.hide();
                        self._renderTagList();
                        self._autoSelectChart();
                        self._runAnalysis();
                    });
                    listEl.append(item);
                })(entry.tagName, entry.label);
            }

            // Show context-matching tags first (with header if applicable)
            if (contextTags.length > 0 && otherTags.length > 0) {
                listEl.append('<div class="mm20-addtag-section-header" style="padding:4px 8px; font-size:11px; color:#5BC0EB; border-bottom:1px solid #2a3a4a;">\u05EA\u05D2\u05D9\u05DD \u05D1\u05D4\u05E7\u05E9\u05E8 \u05E0\u05D5\u05DB\u05D7\u05D9</div>');
                for (var ci = 0; ci < contextTags.length; ci++) {
                    appendTagItem(contextTags[ci]);
                }
                listEl.append('<div class="mm20-addtag-section-header" style="padding:4px 8px; font-size:11px; color:#8899AA; border-bottom:1px solid #2a3a4a; margin-top:6px;">\u05EA\u05D2\u05D9\u05DD \u05E0\u05D5\u05E1\u05E4\u05D9\u05DD</div>');
                for (var oi = 0; oi < otherTags.length; oi++) {
                    appendTagItem(otherTags[oi]);
                }
            } else {
                // No context or no split needed — show all
                var allTags = contextTags.concat(otherTags);
                for (var ai = 0; ai < allTags.length; ai++) {
                    appendTagItem(allTags[ai]);
                }
            }

            // Search filter
            self._addTagDialog.find('.mm20-addtag-search').off('input').on('input', function () {
                var filter = this.value.toLowerCase();
                listEl.find('.mm20-assign-suggestion').each(function () {
                    var text = $(this).text().toLowerCase();
                    $(this).toggle(text.indexOf(filter) >= 0);
                });
            }).val('');

            self._addTagDialog.show();
            self._addTagDialog.find('.mm20-addtag-search').focus();
        },


        // ─────────────────────────────────────
        //  Auto-select chart type
        // ─────────────────────────────────────

        _autoSelectChart: function () {
            var count = this._selectedTags.length;
            if (count === 1) {
                this._chartType = 'trend';
            } else if (count === 2) {
                this._chartType = 'scatter';
            } else if (count >= 3) {
                this._chartType = 'heatmap';
            }
            this._chartBar.find('.mm20-explorer-chart-btn').removeClass('mm20-explorer-chart-btn--active');
            this._chartBar.find('[data-chart="' + this._chartType + '"]').addClass('mm20-explorer-chart-btn--active');
        },


        // ─────────────────────────────────────
        //  Run Analysis
        // ─────────────────────────────────────

        _runAnalysis: function () {
            var self = this;
            if (self._destroyed) return;

            // Persist state on every analysis run
            self._saveState();

            if (!self._selectedTags.length) {
                self._clearOutput();
                return;
            }

            var TA = MM.TagAnalysis;
            if (!TA) {
                self._showMessage('TagAnalysis module not loaded');
                return;
            }

            // Build series from available data
            // QA14: In live mode, _buildSeriesFromData returns [] and triggers
            //       async fetch — _renderAfterFetch handles rendering.
            var seriesList = self._buildSeriesFromData();

            if (!seriesList.length) {
                // If live mode, fetch is in-flight — don't show "no data" yet
                if (!self.options.demoMode && self._api) return;
                self._showMessage('\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05EA\u05D2\u05D9\u05DD \u05E9\u05E0\u05D1\u05D7\u05E8\u05D5');
                return;
            }

            // Synchronous path (demo mode) — align and render
            var aligned = TA.alignSeries(seriesList, 0);
            self._lastAligned = aligned;
            self._renderKPI(aligned.series);

            switch (self._chartType) {
                case 'trend':   self._renderTrend(aligned); break;
                case 'scatter': self._renderScatter(aligned); break;
                case 'table':   self._renderSummaryTable(aligned.series); break;
                case 'heatmap': self._renderHeatmap(aligned.series); break;
                default:        self._renderTrend(aligned);
            }
        },


        // ─────────────────────────────────────
        //  Build series from data
        // ─────────────────────────────────────
        // QA14-FIX: real PI data in live mode, demo series only when demoMode

        _buildSeriesFromData: function () {
            var self = this;
            var seriesList = [];

            if (self.options.demoMode || !self._api) {
                // Demo mode or no API available — use synthetic data
                for (var i = 0; i < self._selectedTags.length; i++) {
                    var tag = self._selectedTags[i];
                    var data = self._generateDemoSeries(tag, i);
                    seriesList.push({
                        name: tag.roleLabel || tag.tagName || 'Series ' + (i + 1),
                        data: data
                    });
                }
                return seriesList;
            }

            // Live mode — fetch from PI Web API
            self._fetchRealData();
            // Return empty — _fetchRealData is async and will call _renderAfterFetch
            return [];
        },

        /**
         * Fetch real PI data for selected tags via PI Web API.
         * Uses getRecordedValues with the current date range.
         */
        _fetchRealData: function () {
            var self = this;
            var api = self._api;
            if (!api) return;
            // Ensure base URL is resolved
            if (typeof api._detectBase === 'function') api._detectBase();
            if (!api._base) return;
            var gen = ++self._fetchGen;

            var endTime   = self._dateEnd   ? new Date(self._dateEnd).toISOString()   : '*';
            var startTime = self._dateStart ? new Date(self._dateStart).toISOString() : '*-24h';

            var pending = self._selectedTags.length;
            var results = [];
            var failed  = 0;

            if (pending === 0) return;

            // Show loading state
            self._showMessage('\u05D8\u05D5\u05E2\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD...');

            for (var i = 0; i < self._selectedTags.length; i++) {
                (function (tag, idx) {
                    var seriesName = tag.roleLabel || tag.tagName || 'Series ' + (idx + 1);
                    var emptyResult = { name: seriesName, data: [] };

                    if (!tag.tagName && !tag.tagPath) {
                        results[idx] = emptyResult;
                        pending--;
                        if (pending <= 0) self._renderAfterFetch(results, gen);
                        return;
                    }

                    // Step 1: Resolve tag to WebId via MM.PIWebAPI.resolveTag
                    api.resolveTag(tag, function (err, webId) {
                        if (err || !webId) {
                            MM.debug('tagExplorer', 'resolveTag failed for ' + (tag.tagName || tag.tagPath), err);
                            failed++;
                            results[idx] = emptyResult;
                            pending--;
                            if (pending <= 0) self._renderAfterFetch(results, gen);
                            return;
                        }

                        // Cache the WebId on the tag for future use
                        tag.webId = webId;

                        // Step 2: Fetch recorded values via the proper wrapper
                        api.getRecorded(webId, startTime, endTime, 2000, function (err2, items) {
                            if (err2) {
                                MM.debug('tagExplorer', 'getRecorded failed for ' + seriesName, err2);
                                failed++;
                                results[idx] = emptyResult;
                            } else {
                                var points = [];
                                for (var p = 0; p < items.length; p++) {
                                    var item = items[p];
                                    if (item.Good === false) continue;
                                    var val = item.Value;
                                    if (val !== null && val !== undefined && typeof val === 'object') {
                                        val = val.Value !== undefined ? val.Value : null;
                                    }
                                    var numVal = parseFloat(val);
                                    if (!isNaN(numVal)) {
                                        points.push({ ts: item.Timestamp, val: numVal });
                                    }
                                }
                                results[idx] = { name: seriesName, data: points };
                            }
                            pending--;
                            if (pending <= 0) self._renderAfterFetch(results, gen);
                        });
                    });
                })(self._selectedTags[i], i);
            }
        },

        /**
         * Render chart after async PI data fetch completes.
         */
        _renderAfterFetch: function (results, gen) {
            var self = this;
            if (self._destroyed) return;
            // Discard stale responses from superseded fetches
            if (gen !== undefined && gen !== self._fetchGen) return;

            var TA = MM.TagAnalysis;
            if (!TA) return;

            // Filter out empty results
            var seriesList = [];
            for (var i = 0; i < results.length; i++) {
                if (results[i]) seriesList.push(results[i]);
            }

            if (!seriesList.length) {
                self._showMessage('\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05EA\u05D2\u05D9\u05DD \u05E9\u05E0\u05D1\u05D7\u05E8\u05D5');
                return;
            }

            // Check if all data arrays are empty
            var totalPoints = 0;
            for (var j = 0; j < seriesList.length; j++) {
                totalPoints += seriesList[j].data.length;
            }
            if (totalPoints === 0) {
                self._showMessage('\u05DC\u05D0 \u05D4\u05EA\u05E7\u05D1\u05DC\u05D5 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DE\u05D4-PI \u05DC\u05EA\u05D2\u05D9\u05DD \u05E9\u05E0\u05D1\u05D7\u05E8\u05D5');
                return;
            }

            var aligned = TA.alignSeries(seriesList, 0);
            self._lastAligned = aligned;
            self._renderKPI(aligned.series);

            switch (self._chartType) {
                case 'trend':   self._renderTrend(aligned); break;
                case 'scatter': self._renderScatter(aligned); break;
                case 'table':   self._renderSummaryTable(aligned.series); break;
                case 'heatmap': self._renderHeatmap(aligned.series); break;
                default:        self._renderTrend(aligned);
            }
        },

        /**
         * Generate demo time series for a tag (demoMode only).
         * QA14-FIX: Respects current date range instead of always 24h.
         */
        _generateDemoSeries: function (tag, seriesIdx) {
            var self = this;
            var points = [];
            var now = new Date();
            // QA14-FIX: use actual date range when set
            var end   = self._dateEnd   ? new Date(self._dateEnd)   : now;
            var start = self._dateStart ? new Date(self._dateStart) : new Date(end.getTime() - 24 * 60 * 60 * 1000);
            var rangMs = end.getTime() - start.getTime();
            // Adaptive interval: aim for ~288 points (like 24h at 5min)
            var interval = Math.max(60000, Math.floor(rangMs / 288));

            // Use tag name as seed for consistent data
            var seed = 0;
            var name = tag.tagName || '';
            for (var c = 0; c < name.length; c++) {
                seed += name.charCodeAt(c);
            }
            seed = (seed + seriesIdx * 137) % 1000;

            var base = 50 + (seed % 200);
            var amplitude = 10 + (seed % 30);

            for (var t = start.getTime(); t <= end.getTime(); t += interval) {
                var noise = ((seed * 9301 + 49297) % 233280) / 233280;
                seed = (seed * 9301 + 49297) % 233280;
                var val = base + amplitude * Math.sin(t / (3600000 * 6)) + (noise - 0.5) * amplitude * 0.5;
                points.push({ ts: new Date(t).toISOString(), val: Math.round(val * 10) / 10 });
            }

            return points;
        },


        // ─────────────────────────────────────
        //  KPI Bar
        // ─────────────────────────────────────

        _renderKPI: function (alignedSeries) {
            var self = this;
            var TA = MM.TagAnalysis;
            self._kpiBar.empty();

            if (!alignedSeries || !alignedSeries.length) return;

            for (var i = 0; i < alignedSeries.length; i++) {
                var s = alignedSeries[i];
                var stats = TA.calcStats(s.values);
                var color = TA.getColor(i);

                var kpi = $('<div class="mm20-explorer-kpi-item"></div>');
                kpi.css('border-top-color', color);
                kpi.append($('<div class="mm20-kpi-name"></div>').attr('title', s.name).text(self._truncate(s.name, 20)));
                kpi.append('<div class="mm20-kpi-row"><span>\u05DE\u05D9\u05E0\'</span><span>' + MM.formatNum(stats.min, 1) + '</span></div>');
                kpi.append('<div class="mm20-kpi-row"><span>\u05DE\u05E7\u05E1\'</span><span>' + MM.formatNum(stats.max, 1) + '</span></div>');
                kpi.append('<div class="mm20-kpi-row"><span>\u05DE\u05DE\u05D5\u05E6\u05E2</span><span>' + MM.formatNum(stats.avg, 1) + '</span></div>');
                kpi.append('<div class="mm20-kpi-row"><span>\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA</span><span>' + stats.count + '</span></div>');

                self._kpiBar.append(kpi);
            }

            // Show correlation score for 2 tags
            if (alignedSeries.length === 2) {
                var r = TA.correlation(alignedSeries[0].values, alignedSeries[1].values);
                var corrKpi = $('<div class="mm20-explorer-kpi-item mm20-kpi-corr"></div>');
                corrKpi.append('<div class="mm20-kpi-name">\u05E7\u05D5\u05E8\u05DC\u05E6\u05D9\u05D4</div>');
                corrKpi.append('<div class="mm20-kpi-value">' + (isNaN(r) ? 'N/A' : r.toFixed(3)) + '</div>');
                if (!isNaN(r)) {
                    corrKpi.css('border-top-color', TA.correlationColor(r));
                }
                self._kpiBar.append(corrKpi);
            }
        },


        // ═══════════════════════════════════════
        //  Chart Renderers
        // ═══════════════════════════════════════


        // ── Trend Overlay ──

        _renderTrend: function (aligned) {
            var self = this;
            var TA = MM.TagAnalysis;
            var canvas = self._canvasEl[0];
            var ctx = canvas.getContext('2d');

            // Resize canvas to container
            self._resizeCanvas();
            var W = canvas.width;
            var H = canvas.height;
            var pad = { top: 20, right: 20, bottom: 40, left: 60 };

            // Clear
            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#0a1628';
            ctx.fillRect(0, 0, W, H);

            if (!aligned.series.length || !aligned.timestamps.length) return;

            var plotW = W - pad.left - pad.right;
            var plotH = H - pad.top - pad.bottom;

            // Find global Y range
            var globalMin = Infinity, globalMax = -Infinity;
            for (var s = 0; s < aligned.series.length; s++) {
                var st = TA.calcStats(aligned.series[s].values);
                if (st.min < globalMin) globalMin = st.min;
                if (st.max > globalMax) globalMax = st.max;
            }
            if (globalMin === globalMax) { globalMin -= 1; globalMax += 1; }
            var yRange = globalMax - globalMin;
            globalMin -= yRange * 0.05;
            globalMax += yRange * 0.05;
            yRange = globalMax - globalMin;

            // Time range
            var tMin = aligned.timestamps[0];
            var tMax = aligned.timestamps[aligned.timestamps.length - 1];
            var tRange = tMax - tMin || 1;

            // Draw grid
            ctx.strokeStyle = '#1a2d44';
            ctx.lineWidth = 1;
            var ySteps = 5;
            for (var gy = 0; gy <= ySteps; gy++) {
                var yVal = globalMin + (yRange * gy / ySteps);
                var yPx = pad.top + plotH - (plotH * gy / ySteps);
                ctx.beginPath();
                ctx.moveTo(pad.left, yPx);
                ctx.lineTo(W - pad.right, yPx);
                ctx.stroke();

                // Y label
                ctx.fillStyle = '#8899AA';
                ctx.font = '10px Segoe UI';
                ctx.textAlign = 'right';
                ctx.fillText(MM.formatNum(yVal, 1), pad.left - 4, yPx + 3);
            }

            // Time labels
            var tSteps = Math.min(6, aligned.timestamps.length);
            ctx.textAlign = 'center';
            for (var gt = 0; gt <= tSteps; gt++) {
                var tIdx = Math.floor(gt * (aligned.timestamps.length - 1) / tSteps);
                var tPx = pad.left + (plotW * gt / tSteps);
                var d = new Date(aligned.timestamps[tIdx]);
                ctx.fillStyle = '#8899AA';
                ctx.fillText(d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(), tPx, H - pad.bottom + 15);
            }

            // Draw series
            for (var si = 0; si < aligned.series.length; si++) {
                var series = aligned.series[si];
                var color = TA.getColor(si);
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                var started = false;

                for (var p = 0; p < aligned.timestamps.length; p++) {
                    var val = series.values[p];
                    if (val === null || val === undefined) continue;

                    var x = pad.left + ((aligned.timestamps[p] - tMin) / tRange) * plotW;
                    var y = pad.top + plotH - ((val - globalMin) / yRange) * plotH;

                    if (!started) {
                        ctx.moveTo(x, y);
                        started = true;
                    } else {
                        ctx.lineTo(x, y);
                    }
                }
                ctx.stroke();
            }

            // Legend
            self._renderLegend(ctx, aligned.series, W, pad);
            self._canvasEl.show();
            self._summaryEl.hide();
        },


        // ── Scatter ──

        _renderScatter: function (aligned) {
            var self = this;
            var TA = MM.TagAnalysis;
            var canvas = self._canvasEl[0];
            var ctx = canvas.getContext('2d');

            self._resizeCanvas();
            var W = canvas.width;
            var H = canvas.height;
            var pad = { top: 20, right: 20, bottom: 50, left: 60 };

            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#0a1628';
            ctx.fillRect(0, 0, W, H);

            if (aligned.series.length < 2) {
                self._showMessage('Scatter \u05D3\u05D5\u05E8\u05E9 2 \u05EA\u05D2\u05D9\u05DD \u05D1\u05D3\u05D9\u05D5\u05E7');
                return;
            }

            var xVals = aligned.series[0].values;
            var yVals = aligned.series[1].values;
            var model = TA.buildScatterModel(xVals, yVals, aligned.series[0].name, aligned.series[1].name);

            var plotW = W - pad.left - pad.right;
            var plotH = H - pad.top - pad.bottom;

            var xMin = model.xStats.min - model.xStats.range * 0.05;
            var xMax = model.xStats.max + model.xStats.range * 0.05;
            var yMin = model.yStats.min - model.yStats.range * 0.05;
            var yMax = model.yStats.max + model.yStats.range * 0.05;
            var xRange = xMax - xMin || 1;
            var yRange = yMax - yMin || 1;

            // Grid
            ctx.strokeStyle = '#1a2d44';
            ctx.lineWidth = 1;
            for (var gx = 0; gx <= 5; gx++) {
                var xPx = pad.left + plotW * gx / 5;
                ctx.beginPath(); ctx.moveTo(xPx, pad.top); ctx.lineTo(xPx, H - pad.bottom); ctx.stroke();
                ctx.fillStyle = '#8899AA'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center';
                ctx.fillText(MM.formatNum(xMin + xRange * gx / 5, 1), xPx, H - pad.bottom + 15);
            }
            for (var gy = 0; gy <= 5; gy++) {
                var yPx = pad.top + plotH - plotH * gy / 5;
                ctx.beginPath(); ctx.moveTo(pad.left, yPx); ctx.lineTo(W - pad.right, yPx); ctx.stroke();
                ctx.fillStyle = '#8899AA'; ctx.textAlign = 'right';
                ctx.fillText(MM.formatNum(yMin + yRange * gy / 5, 1), pad.left - 4, yPx + 3);
            }

            // Points
            ctx.fillStyle = TA.getColor(0);
            for (var p = 0; p < model.points.length; p++) {
                var pt = model.points[p];
                var x = pad.left + ((pt.x - xMin) / xRange) * plotW;
                var y = pad.top + plotH - ((pt.y - yMin) / yRange) * plotH;
                ctx.beginPath();
                ctx.arc(x, y, 3, 0, Math.PI * 2);
                ctx.fill();
            }

            // Axis labels
            ctx.fillStyle = '#CCC';
            ctx.font = '11px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText(model.xName, pad.left + plotW / 2, H - 5);
            ctx.save();
            ctx.translate(12, pad.top + plotH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.fillText(model.yName, 0, 0);
            ctx.restore();

            // Correlation text
            var rText = 'r = ' + (isNaN(model.correlation) ? 'N/A' : model.correlation.toFixed(3));
            ctx.fillStyle = '#FFF';
            ctx.font = '12px Segoe UI';
            ctx.textAlign = 'right';
            ctx.fillText(rText, W - pad.right - 5, pad.top + 15);

            self._canvasEl.show();
            self._summaryEl.hide();
        },


        // ── Summary Table ──

        _renderSummaryTable: function (alignedSeries) {
            var self = this;
            var TA = MM.TagAnalysis;
            var model = TA.buildSummaryTable(alignedSeries);

            self._canvasEl.hide();
            self._summaryEl.show().empty();

            var table = $('<table class="mm20-log-table mm20-explorer-table"></table>');

            // Header
            var cols = [
                '\u05EA\u05D2', 'Min', 'Max', 'Avg', 'Std',
                '\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA', '\u05D7\u05E1\u05E8\u05D9\u05DD', '\u05D8\u05D5\u05D5\u05D7'
            ];
            var thead = $('<thead><tr></tr></thead>');
            var headerRow = thead.find('tr');
            for (var c = 0; c < cols.length; c++) {
                headerRow.append($('<th></th>').text(cols[c]));
            }
            table.append(thead);

            // Body
            var tbody = $('<tbody></tbody>');
            for (var r = 0; r < model.length; r++) {
                var row = model[r];
                var color = TA.getColor(r);
                var tr = $('<tr></tr>');
                tr.append($('<td></td>').append(
                    $('<span></span>').css({ 'border-left': '3px solid ' + color, 'padding-right': '6px' }).text(row.name)
                ));
                tr.append($('<td style="font-variant-numeric:tabular-nums;"></td>').text(MM.formatNum(row.min, 1)));
                tr.append($('<td style="font-variant-numeric:tabular-nums;"></td>').text(MM.formatNum(row.max, 1)));
                tr.append($('<td style="font-variant-numeric:tabular-nums;"></td>').text(MM.formatNum(row.avg, 1)));
                tr.append($('<td style="font-variant-numeric:tabular-nums;"></td>').text(MM.formatNum(row.std, 2)));
                tr.append($('<td></td>').text(row.count));
                tr.append($('<td></td>').text(row.missing));
                tr.append($('<td style="font-variant-numeric:tabular-nums;"></td>').text(MM.formatNum(row.range, 1)));
                tbody.append(tr);
            }
            table.append(tbody);
            self._summaryEl.append(table);
        },


        // ── Correlation Heatmap ──

        _renderHeatmap: function (alignedSeries) {
            var self = this;
            var TA = MM.TagAnalysis;
            var canvas = self._canvasEl[0];
            var ctx = canvas.getContext('2d');

            self._resizeCanvas();
            var W = canvas.width;
            var H = canvas.height;

            ctx.clearRect(0, 0, W, H);
            ctx.fillStyle = '#0a1628';
            ctx.fillRect(0, 0, W, H);

            var model = TA.correlationMatrix(alignedSeries);
            var n = model.names.length;

            if (n < 2) {
                self._showMessage('Heatmap \u05D3\u05D5\u05E8\u05E9 \u05DC\u05E4\u05D7\u05D5\u05EA 2 \u05EA\u05D2\u05D9\u05DD');
                return;
            }

            var labelW = 120;
            var cellSize = Math.min(
                (W - labelW - 40) / n,
                (H - labelW - 40) / n,
                80
            );
            var gridX = labelW + 10;
            var gridY = labelW + 10;

            // Column labels (top, rotated)
            ctx.save();
            ctx.fillStyle = '#CCC';
            ctx.font = '10px Segoe UI';
            ctx.textAlign = 'right';
            for (var ci = 0; ci < n; ci++) {
                var cx = gridX + ci * cellSize + cellSize / 2;
                ctx.save();
                ctx.translate(cx, gridY - 5);
                ctx.rotate(-Math.PI / 4);
                ctx.fillText(self._truncate(model.names[ci], 15), 0, 0);
                ctx.restore();
            }
            ctx.restore();

            // Row labels (left)
            ctx.fillStyle = '#CCC';
            ctx.font = '10px Segoe UI';
            ctx.textAlign = 'right';
            for (var ri = 0; ri < n; ri++) {
                ctx.fillText(self._truncate(model.names[ri], 15), gridX - 5, gridY + ri * cellSize + cellSize / 2 + 4);
            }

            // Cells
            for (var row = 0; row < n; row++) {
                for (var col = 0; col < n; col++) {
                    var r = model.matrix[row][col];
                    var x = gridX + col * cellSize;
                    var y = gridY + row * cellSize;

                    ctx.fillStyle = TA.correlationColor(r);
                    ctx.fillRect(x, y, cellSize - 2, cellSize - 2);

                    // Value text
                    ctx.fillStyle = '#FFF';
                    ctx.font = '11px Segoe UI';
                    ctx.textAlign = 'center';
                    ctx.fillText(isNaN(r) ? '-' : r.toFixed(2), x + cellSize / 2 - 1, y + cellSize / 2 + 4);
                }
            }

            self._canvasEl.show();
            self._summaryEl.hide();
        },


        // ─────────────────────────────────────
        //  Chart helpers
        // ─────────────────────────────────────

        _renderLegend: function (ctx, series, W, pad) {
            var TA = MM.TagAnalysis;
            var x = pad.left + 10;
            var y = pad.top + 10;

            for (var i = 0; i < series.length; i++) {
                ctx.fillStyle = TA.getColor(i);
                ctx.fillRect(x, y + i * 16, 12, 10);
                ctx.fillStyle = '#CCC';
                ctx.font = '10px Segoe UI';
                ctx.textAlign = 'left';
                ctx.fillText(this._truncate(series[i].name, 30), x + 16, y + i * 16 + 9);
            }
        },

        _resizeCanvas: function () {
            var canvas = this._canvasEl[0];
            var container = this._outputEl;
            var w = container.width() || 800;
            var h = Math.max(300, container.height() - 100);
            canvas.width = w;
            canvas.height = h;
        },


        // ─────────────────────────────────────
        //  Export
        // ─────────────────────────────────────

        _exportCurrentView: function () {
            var self = this;

            if (self._chartType === 'table') {
                // Export as CSV
                self._exportTableCsv();
            } else {
                // Export canvas as image
                self._exportCanvasImage();
            }
        },

        _exportTableCsv: function () {
            var self = this;
            if (!self._lastAligned || !self._lastAligned.series || !self._lastAligned.series.length) return;

            var TA = MM.TagAnalysis;
            var model = TA.buildSummaryTable(self._lastAligned.series);

            var rows = [];
            for (var i = 0; i < model.length; i++) {
                var m = model[i];
                rows.push({
                    '\u05EA\u05D2': m.name,
                    'Min': m.min,
                    'Max': m.max,
                    'Avg': m.avg,
                    'Std': m.std,
                    '\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA': m.count,
                    '\u05D7\u05E1\u05E8\u05D9\u05DD': m.missing,
                    '\u05D8\u05D5\u05D5\u05D7': m.range
                });
            }
            MM.exportCsv(rows, 'mm20-explorer-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
        },

        _exportCanvasImage: function () {
            var canvas = this._canvasEl[0];
            try {
                var dataUrl = canvas.toDataURL('image/png');
                var a = document.createElement('a');
                a.href = dataUrl;
                a.download = 'mm20-explorer-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.png';
                a.click();
            } catch (e) {
                // Canvas export not supported
            }
        },


        // ─────────────────────────────────────
        //  UI Helpers
        // ─────────────────────────────────────

        _clearOutput: function () {
            this._kpiBar.empty();
            var canvas = this._canvasEl[0];
            var ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0a1628';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#556677';
            ctx.font = '14px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText('\u05D1\u05D7\u05E8 \u05EA\u05D2\u05D9\u05DD \u05DC\u05D4\u05EA\u05D7\u05DC\u05D4', canvas.width / 2, canvas.height / 2);
            this._summaryEl.empty().hide();
            this._canvasEl.show();
        },

        _showMessage: function (msg) {
            var canvas = this._canvasEl[0];
            var ctx = canvas.getContext('2d');
            this._resizeCanvas();
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#0a1628';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#F39C12';
            ctx.font = '14px Segoe UI';
            ctx.textAlign = 'center';
            ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
            this._canvasEl.show();
            this._summaryEl.hide();
        },

        _updateTimeDisplay: function () {
            if (this._dateStart && this._dateEnd) {
                var s = new Date(this._dateStart);
                var e = new Date(this._dateEnd);
                this._timeDisplay.text(
                    s.toLocaleDateString() + ' ' + s.toLocaleTimeString() +
                    ' \u2014 ' +
                    e.toLocaleDateString() + ' ' + e.toLocaleTimeString()
                );
            } else {
                this._timeDisplay.text('\u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA 24 \u05E9\u05E2\u05D5\u05EA');
            }
        },

        // QA14-FIX: display current site/unit context
        _updateContextDisplay: function () {
            if (!this._contextDisplay) return;
            var parts = [];
            if (this._siteId) {
                var sites = this.options.sites || MM.SITES;
                for (var i = 0; i < sites.length; i++) {
                    if (sites[i].id === this._siteId) {
                        parts.push(sites[i].name);
                        if (this._unitIdx != null && sites[i].units[this._unitIdx]) {
                            parts.push(sites[i].units[this._unitIdx]);
                        }
                        break;
                    }
                }
            }
            this._contextDisplay.text(parts.length ? parts.join(' / ') : '');
        },

        _truncate: function (str, maxLen) {
            if (!str) return '';
            return str.length > maxLen ? str.substring(0, maxLen - 2) + '..' : str;
        },


        // ═══════════════════════════════════════
        //  _destroy
        // ═══════════════════════════════════════

        _destroy: function () {
            this._destroyed = true;

            var bus = this.options.bus;
            if (bus) {
                if (this._onOpenInExplorer) bus.off('tags:openInExplorer', this._onOpenInExplorer, this);
                if (this._onTimeChanged)    bus.off('time:rangeChanged', this._onTimeChanged, this);
                if (this._onSiteSelected)   bus.off('site:selected', this._onSiteSelected, this);
                if (this._onUnitSelected)   bus.off('unit:selected', this._onUnitSelected, this);
                if (this._onDemoToggle)     bus.off('demo:toggle', this._onDemoToggle, this);
                if (this._onApiReady)       bus.off('api:ready', this._onApiReady, this);
            }

            this._api = null;
            this._selectedTags = null;
            this._lastAligned = null;

            // Release DOM refs
            this._contextBar = null;
            this._tagBar = null;
            this._chartBar = null;
            this._outputEl = null;
            this._canvasEl = null;
            this._summaryEl = null;
            this._kpiBar = null;
            this._timeDisplay = null;
            this._contextDisplay = null;
            this._tagListEl = null;
            this._addTagDialog = null;

            this.element.empty().removeClass('mm20-explorer-root');
        }
    });

})(window.jQuery);
