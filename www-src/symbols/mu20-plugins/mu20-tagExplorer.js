/**
 * ═══════════════════════════════════════════════════════
 *  mu20-tagExplorer.js  —  Tag Explorer
 * ═══════════════════════════════════════════════════════
 *  Interactive tag investigation: pick tags, choose
 *  visualization, analyze relationships.
 *
 *  Four chart modes:
 *    Trend Overlay | Scatter X/Y | Summary Table | Correlation Heatmap
 *
 *  Ported from mm20-tagExplorer.js (jQuery widget → vanilla ES5).
 *  Constructor: Mu20TagExplorer(shadowRoot, containerEl, options, bus)
 *  Depends on: MU20.TagAnalysis
 *  Version: ULT.1.6  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-tagExplorer] MU20 core not loaded'); return; }

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


    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════

    function Mu20TagExplorer(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._bus       = bus;
        self._opts      = options || {};
        self._destroyed = false;

        self._sites        = self._opts.sites || MU.SITES || [];
        self._api          = self._opts.api || null;
        self._demoMode     = !!self._opts.demoMode;
        self._maxTags      = self._opts.maxTags || 8;
        self._onStateChange = self._opts.onStateChange || null;

        // State
        self._selectedTags  = [];
        self._chartType     = self._opts.defaultChart || 'trend';
        self._dateStart     = null;
        self._dateEnd       = null;
        self._siteId        = '';
        self._unitIdx       = null;
        self._fetchGen      = 0;
        self._lastAligned   = null;

        // DOM refs
        self._contextBar = null;
        self._timeDisplay = null;
        self._contextDisplay = null;
        self._tagBar = null;
        self._tagListEl = null;
        self._chartBar = null;
        self._outputEl = null;
        self._canvasEl = null;
        self._summaryEl = null;
        self._kpiBar = null;
        self._addTagDialogEl = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('tagExplorer', 'constructor', e);
            MU.shield.renderFallback(self._container, '\u05D7\u05D5\u05E7\u05E8 \u05EA\u05D2\u05D9\u05DD', e);
        }
    }


    // ═══════════════════════════════════════
    //  Mount DOM
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._mount = function () {
        var self = this;
        var c = self._container;
        c.className = 'mu20-explorer-root';
        c.setAttribute('dir', 'rtl');

        // ── 1. Context Bar ──
        self._contextBar = _el('div', 'mu20-explorer-context');
        self._contextBar.setAttribute('dir', 'rtl');
        self._contextBar.appendChild(_txt('span', 'mu20-explorer-context-label', '\u05D7\u05E7\u05E8 \u05EA\u05D2\u05D9\u05DD'));

        self._timeDisplay = _el('span', 'mu20-explorer-time');
        self._contextBar.appendChild(self._timeDisplay);

        self._contextDisplay = _el('span', 'mu20-explorer-site');
        self._contextBar.appendChild(self._contextDisplay);

        var refreshBtn = _el('button', 'mu20-btn mu20-btn-sm');
        refreshBtn.textContent = '\u05E8\u05E2\u05E0\u05DF';
        refreshBtn.addEventListener('click', function () { self._runAnalysis(); });
        self._contextBar.appendChild(refreshBtn);

        var exportBtn = _el('button', 'mu20-btn mu20-btn-sm');
        exportBtn.textContent = '\u05D9\u05E6\u05D0';
        exportBtn.addEventListener('click', function () { self._exportCurrentView(); });
        self._contextBar.appendChild(exportBtn);

        c.appendChild(self._contextBar);

        // ── 2. Tag Selection Bar ──
        self._tagBar = _el('div', 'mu20-explorer-tags');
        self._tagBar.setAttribute('dir', 'rtl');
        self._tagBar.appendChild(_txt('span', 'mu20-explorer-tags-label', '\u05EA\u05D2\u05D9\u05DD \u05E0\u05D1\u05D7\u05E8\u05D9\u05DD:'));

        self._tagListEl = _el('div', 'mu20-explorer-tag-list');
        self._tagBar.appendChild(self._tagListEl);

        var addTagBtn = _el('button', 'mu20-btn mu20-btn-sm mu20-btn-accent');
        addTagBtn.textContent = '+ \u05D4\u05D5\u05E1\u05E3 \u05EA\u05D2';
        addTagBtn.addEventListener('click', function () { self._openAddTagDialog(); });
        self._tagBar.appendChild(addTagBtn);

        var clearBtn = _el('button', 'mu20-btn mu20-btn-sm');
        clearBtn.textContent = '\u05E0\u05E7\u05D4 \u05D4\u05DB\u05DC';
        clearBtn.addEventListener('click', function () {
            self._selectedTags = [];
            self._renderTagList();
            self._clearOutput();
        });
        self._tagBar.appendChild(clearBtn);

        c.appendChild(self._tagBar);

        // ── 3. Chart Type Selector ──
        self._chartBar = _el('div', 'mu20-explorer-chartbar');
        self._chartBar.setAttribute('dir', 'rtl');

        var chartTypes = [
            { key: 'trend',   label: 'Trend',   icon: '\uD83D\uDCC8', minTags: 1 },
            { key: 'scatter', label: 'Scatter',  icon: '\u2022\u2022', minTags: 2, maxTags: 2 },
            { key: 'table',   label: '\u05D8\u05D1\u05DC\u05D4',   icon: '\uD83D\uDCCA', minTags: 1 },
            { key: 'heatmap', label: 'Heatmap', icon: '\u2588\u2588', minTags: 2 }
        ];

        for (var ct = 0; ct < chartTypes.length; ct++) {
            (function (def) {
                var btn = _el('button', 'mu20-explorer-chart-btn');
                btn.setAttribute('data-chart', def.key);
                btn.textContent = def.icon + ' ' + def.label;
                if (def.key === self._chartType) btn.classList.add('mu20-explorer-chart-btn--active');
                btn.addEventListener('click', function () {
                    var tagCount = self._selectedTags.length;
                    if (def.minTags && tagCount < def.minTags) {
                        self._showMessage('\u05E0\u05D3\u05E8\u05E9\u05D9\u05DD \u05DC\u05E4\u05D7\u05D5\u05EA ' + def.minTags + ' \u05EA\u05D2\u05D9\u05DD \u05DC\u05EA\u05E6\u05D5\u05D2\u05D4 \u05D6\u05D5');
                        return;
                    }
                    if (def.maxTags && tagCount > def.maxTags) {
                        self._showMessage(def.label + ' \u05EA\u05D5\u05DE\u05DA \u05E2\u05D3 ' + def.maxTags + ' \u05EA\u05D2\u05D9\u05DD');
                        return;
                    }
                    self._chartType = def.key;
                    var allBtns = self._chartBar.querySelectorAll('.mu20-explorer-chart-btn');
                    for (var b = 0; b < allBtns.length; b++) allBtns[b].classList.remove('mu20-explorer-chart-btn--active');
                    btn.classList.add('mu20-explorer-chart-btn--active');
                    self._runAnalysis();
                });
                self._chartBar.appendChild(btn);
            })(chartTypes[ct]);
        }
        c.appendChild(self._chartBar);

        // ── 4. Output Area ──
        self._outputEl = _el('div', 'mu20-explorer-output');

        self._kpiBar = _el('div', 'mu20-explorer-kpi');
        self._kpiBar.setAttribute('dir', 'rtl');
        self._outputEl.appendChild(self._kpiBar);

        self._canvasEl = _el('canvas', 'mu20-explorer-canvas');
        self._canvasEl.width = 800;
        self._canvasEl.height = 400;
        self._outputEl.appendChild(self._canvasEl);

        self._summaryEl = _el('div', 'mu20-explorer-summary');
        self._summaryEl.setAttribute('dir', 'rtl');
        self._outputEl.appendChild(self._summaryEl);

        c.appendChild(self._outputEl);

        // ── Add tag dialog (hidden) ──
        self._buildAddTagDialog(c);

        // ── Bus subscriptions ──
        if (self._bus) {
            self._onOpenInExplorer = function (d) {
                if (d && d.tags && d.tags.length) {
                    self._selectedTags = d.tags.slice(0, self._maxTags);
                    self._renderTagList();
                    self._autoSelectChart();
                    self._runAnalysis();
                }
            };
            self._bus.on('tags:openInExplorer', self._onOpenInExplorer);

            self._onTimeChanged = function (d) {
                if (d) {
                    self._dateStart = d.start || null;
                    self._dateEnd = d.end || null;
                    self._updateTimeDisplay();
                    if (self._selectedTags.length > 0) self._runAnalysis();
                }
            };
            self._bus.on('time:rangeChanged', self._onTimeChanged);

            self._onSiteSelected = function (d) {
                if (d) { self._siteId = d.siteId || ''; self._updateContextDisplay(); }
            };
            self._bus.on('site:selected', self._onSiteSelected);

            self._onUnitSelected = function (d) {
                if (d) { self._unitIdx = (d.unitIdx != null) ? d.unitIdx : null; self._updateContextDisplay(); }
            };
            self._bus.on('unit:selected', self._onUnitSelected);

            self._onDemoToggle = function (d) { if (d) self._demoMode = d.enabled; };
            self._bus.on('demo:toggle', self._onDemoToggle);

            self._onApiReady = function (api) { self._api = api; };
            self._bus.on('api:ready', self._onApiReady);
        }

        // Restore saved state
        var saved = self._opts.savedState;
        if (saved && typeof saved === 'object') {
            if (saved.selectedTags && saved.selectedTags.length) self._selectedTags = saved.selectedTags;
            if (saved.chartType) self._chartType = saved.chartType;
            if (saved.dateStart) self._dateStart = saved.dateStart;
            if (saved.dateEnd)   self._dateEnd   = saved.dateEnd;
        }

        // Initial render
        self._renderTagList();
        self._clearOutput();
        self._updateTimeDisplay();
    };


    // ═══════════════════════════════════════
    //  Add Tag Dialog
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._buildAddTagDialog = function (parent) {
        var self = this;

        var dialog = _el('div', 'mu20-explorer-add-dialog');
        dialog.setAttribute('dir', 'rtl');
        dialog.style.display = 'none';

        var backdrop = _el('div', 'mu20-assign-backdrop');
        backdrop.addEventListener('click', function () { dialog.style.display = 'none'; });
        dialog.appendChild(backdrop);

        var content = _el('div', 'mu20-assign-content');
        content.appendChild(_txt('div', 'mu20-assign-header', '\u05D4\u05D5\u05E1\u05E3 \u05EA\u05D2 \u05DC\u05D7\u05E7\u05E8'));

        self._addTagSearch = _el('input', 'mu20-search-input mu20-addtag-search');
        self._addTagSearch.type = 'text';
        self._addTagSearch.placeholder = '\u05D7\u05E4\u05E9 \u05EA\u05D2...';
        self._addTagSearch.setAttribute('dir', 'rtl');
        content.appendChild(self._addTagSearch);

        self._addTagListEl = _el('div', 'mu20-addtag-list');
        content.appendChild(self._addTagListEl);

        var actions = _el('div', 'mu20-assign-actions');
        var cancelBtn = _el('button', 'mu20-btn mu20-addtag-cancel');
        cancelBtn.textContent = '\u05E1\u05D2\u05D5\u05E8';
        cancelBtn.addEventListener('click', function () { dialog.style.display = 'none'; });
        actions.appendChild(cancelBtn);
        content.appendChild(actions);

        dialog.appendChild(content);
        parent.appendChild(dialog);
        self._addTagDialogEl = dialog;
    };


    // ═══════════════════════════════════════
    //  State Persistence
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._saveState = function () {
        if (typeof this._onStateChange !== 'function') return;
        var state = {
            selectedTags: [],
            chartType: this._chartType,
            dateStart: this._dateStart || null,
            dateEnd: this._dateEnd || null
        };
        for (var i = 0; i < this._selectedTags.length; i++) {
            var t = this._selectedTags[i];
            state.selectedTags.push({
                tagName: t.tagName || '', objectName: t.objectName || '',
                roleLabel: t.roleLabel || '', tagPath: t.tagPath || '', webId: t.webId || ''
            });
        }
        this._onStateChange(state);
    };


    // ═══════════════════════════════════════
    //  Tag List Rendering
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._renderTagList = function () {
        var self = this;
        self._tagListEl.innerHTML = '';

        if (!self._selectedTags.length) {
            self._tagListEl.appendChild(_txt('span', 'mu20-explorer-no-tags',
                '\u05D0\u05D9\u05DF \u05EA\u05D2\u05D9\u05DD \u05E0\u05D1\u05D7\u05E8\u05D9\u05DD \u2014 \u05D4\u05D5\u05E1\u05E3 \u05EA\u05D2\u05D9\u05DD \u05D0\u05D5 \u05E9\u05DC\u05D7 \u05DE\u05D4\u05DE\u05D7\u05E1\u05DF'));
            return;
        }

        var TA = MU.TagAnalysis;

        for (var i = 0; i < self._selectedTags.length; i++) {
            (function (tag, idx) {
                var chip = _el('span', 'mu20-explorer-tag-chip');
                chip.style.borderLeftColor = TA.getColor(idx);
                chip.textContent = tag.tagName || tag.roleLabel || 'tag-' + idx;

                var removeBtn = _txt('span', 'mu20-explorer-tag-remove', '\u00D7');
                removeBtn.addEventListener('click', function (e) {
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
                chip.appendChild(removeBtn);
                self._tagListEl.appendChild(chip);
            })(self._selectedTags[i], i);
        }
    };


    // ═══════════════════════════════════════
    //  Add Tag Dialog
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._openAddTagDialog = function () {
        var self = this;

        if (self._selectedTags.length >= self._maxTags) {
            self._showMessage('\u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD ' + self._maxTags + ' \u05EA\u05D2\u05D9\u05DD');
            return;
        }

        var listEl = self._addTagListEl;
        listEl.innerHTML = '';

        var attrs = ['hours', 'quota', 'pct', 'power', 'temperature', 'efficiency', 'emissions'];
        var attrLabels = {
            hours: '\u05E9\u05E2\u05D5\u05EA', quota: '\u05DE\u05DB\u05E1\u05D4', pct: '\u05D0\u05D7\u05D5\u05D6',
            power: '\u05D4\u05E1\u05E4\u05DA', temperature: '\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4',
            efficiency: '\u05E0\u05E6\u05D9\u05DC\u05D5\u05EA', emissions: '\u05E4\u05DC\u05D9\u05D8\u05D5\u05EA'
        };

        var contextTags = [];
        var otherTags = [];
        var sites = self._sites;
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
                        if (self._selectedTags[t].tagName === tagName) { alreadySelected = true; break; }
                    }
                    if (alreadySelected) continue;

                    var entry = { tagName: tagName, label: label };
                    var siteMatch = activeSiteId && site.id === activeSiteId;
                    var unitMatch = siteMatch && (activeUnitIdx === null || activeUnitIdx === undefined || u === activeUnitIdx);
                    if (unitMatch) contextTags.push(entry);
                    else otherTags.push(entry);
                }
            }
        }

        function appendTagItem(entry) {
            (function (tn, lbl) {
                var item = _txt('div', 'mu20-assign-suggestion', lbl);
                item.addEventListener('click', function () {
                    self._selectedTags.push({ tagName: tn, objectName: lbl, roleLabel: lbl, tagPath: '' });
                    self._addTagDialogEl.style.display = 'none';
                    self._renderTagList();
                    self._autoSelectChart();
                    self._runAnalysis();
                });
                listEl.appendChild(item);
            })(entry.tagName, entry.label);
        }

        if (contextTags.length > 0 && otherTags.length > 0) {
            listEl.appendChild(_txt('div', 'mu20-addtag-section-header',
                '\u05EA\u05D2\u05D9\u05DD \u05D1\u05D4\u05E7\u05E9\u05E8 \u05E0\u05D5\u05DB\u05D7\u05D9'));
            listEl.lastChild.style.cssText = 'padding:4px 8px; font-size:11px; color:#5BC0EB; border-bottom:1px solid #2a3a4a;';
            for (var ci = 0; ci < contextTags.length; ci++) appendTagItem(contextTags[ci]);

            listEl.appendChild(_txt('div', 'mu20-addtag-section-header',
                '\u05EA\u05D2\u05D9\u05DD \u05E0\u05D5\u05E1\u05E4\u05D9\u05DD'));
            listEl.lastChild.style.cssText = 'padding:4px 8px; font-size:11px; color:#8899AA; border-bottom:1px solid #2a3a4a; margin-top:6px;';
            for (var oi = 0; oi < otherTags.length; oi++) appendTagItem(otherTags[oi]);
        } else {
            var allTags = contextTags.concat(otherTags);
            for (var ai = 0; ai < allTags.length; ai++) appendTagItem(allTags[ai]);
        }

        // Search filter
        self._addTagSearch.value = '';
        self._addTagSearch.oninput = function () {
            var filter = this.value.toLowerCase();
            var items = listEl.querySelectorAll('.mu20-assign-suggestion');
            for (var f = 0; f < items.length; f++) {
                items[f].style.display = items[f].textContent.toLowerCase().indexOf(filter) >= 0 ? '' : 'none';
            }
        };

        self._addTagDialogEl.style.display = '';
        self._addTagSearch.focus();
    };


    // ═══════════════════════════════════════
    //  Auto-select Chart Type
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._autoSelectChart = function () {
        var count = this._selectedTags.length;
        if (count === 1) this._chartType = 'trend';
        else if (count === 2) this._chartType = 'scatter';
        else if (count >= 3) this._chartType = 'heatmap';

        var btns = this._chartBar.querySelectorAll('.mu20-explorer-chart-btn');
        for (var b = 0; b < btns.length; b++) {
            btns[b].classList.remove('mu20-explorer-chart-btn--active');
            if (btns[b].getAttribute('data-chart') === this._chartType) {
                btns[b].classList.add('mu20-explorer-chart-btn--active');
            }
        }
    };


    // ═══════════════════════════════════════
    //  Run Analysis
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._runAnalysis = function () {
        var self = this;
        if (self._destroyed) return;
        self._saveState();

        if (!self._selectedTags.length) { self._clearOutput(); return; }

        var TA = MU.TagAnalysis;
        if (!TA) { self._showMessage('TagAnalysis module not loaded'); return; }

        var seriesList = self._buildSeriesFromData();
        if (!seriesList.length) {
            if (!self._demoMode && self._api) return; // async fetch in-flight
            self._showMessage('\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05EA\u05D2\u05D9\u05DD \u05E9\u05E0\u05D1\u05D7\u05E8\u05D5');
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
    };


    // ═══════════════════════════════════════
    //  Build Series from Data
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._buildSeriesFromData = function () {
        var self = this;
        var seriesList = [];

        if (self._demoMode || !self._api) {
            for (var i = 0; i < self._selectedTags.length; i++) {
                var tag = self._selectedTags[i];
                seriesList.push({
                    name: tag.roleLabel || tag.tagName || 'Series ' + (i + 1),
                    data: self._generateDemoSeries(tag, i)
                });
            }
            return seriesList;
        }

        // Live mode — async fetch
        self._fetchRealData();
        return [];
    };

    Mu20TagExplorer.prototype._fetchRealData = function () {
        var self = this;
        var api = self._api;
        if (!api) return;
        if (typeof api._detectBase === 'function') api._detectBase();
        if (!api._base) return;

        var gen = ++self._fetchGen;
        var endTime   = self._dateEnd   ? new Date(self._dateEnd).toISOString()   : '*';
        var startTime = self._dateStart ? new Date(self._dateStart).toISOString() : '*-24h';
        var pending = self._selectedTags.length;
        var results = [];

        if (pending === 0) return;
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

                api.resolveTag(tag, function (err, webId) {
                    if (err || !webId) {
                        results[idx] = emptyResult;
                        pending--;
                        if (pending <= 0) self._renderAfterFetch(results, gen);
                        return;
                    }
                    tag.webId = webId;

                    api.getRecorded(webId, startTime, endTime, 2000, function (err2, items) {
                        if (err2) {
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
                                if (!isNaN(numVal)) points.push({ ts: item.Timestamp, val: numVal });
                            }
                            results[idx] = { name: seriesName, data: points };
                        }
                        pending--;
                        if (pending <= 0) self._renderAfterFetch(results, gen);
                    });
                });
            })(self._selectedTags[i], i);
        }
    };

    Mu20TagExplorer.prototype._renderAfterFetch = function (results, gen) {
        var self = this;
        if (self._destroyed) return;
        if (gen !== undefined && gen !== self._fetchGen) return;

        var TA = MU.TagAnalysis;
        if (!TA) return;

        var seriesList = [];
        for (var i = 0; i < results.length; i++) {
            if (results[i]) seriesList.push(results[i]);
        }
        if (!seriesList.length) { self._showMessage('\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05EA\u05D2\u05D9\u05DD \u05E9\u05E0\u05D1\u05D7\u05E8\u05D5'); return; }

        var totalPoints = 0;
        for (var j = 0; j < seriesList.length; j++) totalPoints += seriesList[j].data.length;
        if (totalPoints === 0) { self._showMessage('\u05DC\u05D0 \u05D4\u05EA\u05E7\u05D1\u05DC\u05D5 \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DE\u05D4-PI \u05DC\u05EA\u05D2\u05D9\u05DD \u05E9\u05E0\u05D1\u05D7\u05E8\u05D5'); return; }

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
    };

    Mu20TagExplorer.prototype._generateDemoSeries = function (tag, seriesIdx) {
        var self = this;
        var points = [];
        var now = new Date();
        var end   = self._dateEnd   ? new Date(self._dateEnd)   : now;
        var start = self._dateStart ? new Date(self._dateStart) : new Date(end.getTime() - 24 * 60 * 60 * 1000);
        var rangMs = end.getTime() - start.getTime();
        var interval = Math.max(60000, Math.floor(rangMs / 288));

        var seed = 0;
        var name = tag.tagName || '';
        for (var c = 0; c < name.length; c++) seed += name.charCodeAt(c);
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
    };


    // ═══════════════════════════════════════
    //  KPI Bar
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._renderKPI = function (alignedSeries) {
        var self = this;
        var TA = MU.TagAnalysis;
        self._kpiBar.innerHTML = '';
        if (!alignedSeries || !alignedSeries.length) return;

        for (var i = 0; i < alignedSeries.length; i++) {
            var s = alignedSeries[i];
            var stats = TA.calcStats(s.values);
            var color = TA.getColor(i);

            var kpi = _el('div', 'mu20-explorer-kpi-item');
            kpi.style.borderTopColor = color;
            var nameEl = _txt('div', 'mu20-kpi-name', self._truncate(s.name, 20));
            nameEl.title = s.name;
            kpi.appendChild(nameEl);

            var rows = [
                ['\u05DE\u05D9\u05E0\'', MU.formatNum(stats.min, 1)],
                ['\u05DE\u05E7\u05E1\'', MU.formatNum(stats.max, 1)],
                ['\u05DE\u05DE\u05D5\u05E6\u05E2', MU.formatNum(stats.avg, 1)],
                ['\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA', '' + stats.count]
            ];
            for (var r = 0; r < rows.length; r++) {
                var row = _el('div', 'mu20-kpi-row');
                row.innerHTML = '<span>' + rows[r][0] + '</span><span>' + rows[r][1] + '</span>';
                kpi.appendChild(row);
            }

            self._kpiBar.appendChild(kpi);
        }

        // Correlation for 2 tags
        if (alignedSeries.length === 2) {
            var rVal = TA.correlation(alignedSeries[0].values, alignedSeries[1].values);
            var corrKpi = _el('div', 'mu20-explorer-kpi-item mu20-kpi-corr');
            corrKpi.appendChild(_txt('div', 'mu20-kpi-name', '\u05E7\u05D5\u05E8\u05DC\u05E6\u05D9\u05D4'));
            corrKpi.appendChild(_txt('div', 'mu20-kpi-value', isNaN(rVal) ? 'N/A' : rVal.toFixed(3)));
            if (!isNaN(rVal)) corrKpi.style.borderTopColor = TA.correlationColor(rVal);
            self._kpiBar.appendChild(corrKpi);
        }
    };


    // ═══════════════════════════════════════
    //  Chart Renderers
    // ═══════════════════════════════════════

    // ── Trend Overlay ──
    Mu20TagExplorer.prototype._renderTrend = function (aligned) {
        var self = this;
        var TA = MU.TagAnalysis;
        var canvas = self._canvasEl;
        var ctx = canvas.getContext('2d');

        self._resizeCanvas();
        var W = canvas.width, H = canvas.height;
        var pad = { top: 20, right: 20, bottom: 40, left: 60 };

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, W, H);

        if (!aligned.series.length || !aligned.timestamps.length) return;

        var plotW = W - pad.left - pad.right;
        var plotH = H - pad.top - pad.bottom;

        // Global Y range
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

        var tMin = aligned.timestamps[0];
        var tMax = aligned.timestamps[aligned.timestamps.length - 1];
        var tRange = tMax - tMin || 1;

        // Grid
        ctx.strokeStyle = '#1a2d44';
        ctx.lineWidth = 1;
        var ySteps = 5;
        for (var gy = 0; gy <= ySteps; gy++) {
            var yVal = globalMin + (yRange * gy / ySteps);
            var yPx = pad.top + plotH - (plotH * gy / ySteps);
            ctx.beginPath(); ctx.moveTo(pad.left, yPx); ctx.lineTo(W - pad.right, yPx); ctx.stroke();
            ctx.fillStyle = '#8899AA'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'right';
            ctx.fillText(MU.formatNum(yVal, 1), pad.left - 4, yPx + 3);
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
            ctx.strokeStyle = TA.getColor(si);
            ctx.lineWidth = 2;
            ctx.beginPath();
            var started = false;

            for (var p = 0; p < aligned.timestamps.length; p++) {
                var val = series.values[p];
                if (val === null || val === undefined) continue;
                var x = pad.left + ((aligned.timestamps[p] - tMin) / tRange) * plotW;
                var y = pad.top + plotH - ((val - globalMin) / yRange) * plotH;
                if (!started) { ctx.moveTo(x, y); started = true; }
                else ctx.lineTo(x, y);
            }
            ctx.stroke();
        }

        // Legend
        self._renderLegend(ctx, aligned.series, W, pad);
        self._canvasEl.style.display = '';
        self._summaryEl.style.display = 'none';
    };

    // ── Scatter ──
    Mu20TagExplorer.prototype._renderScatter = function (aligned) {
        var self = this;
        var TA = MU.TagAnalysis;
        var canvas = self._canvasEl;
        var ctx = canvas.getContext('2d');

        self._resizeCanvas();
        var W = canvas.width, H = canvas.height;
        var pad = { top: 20, right: 20, bottom: 50, left: 60 };

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, W, H);

        if (aligned.series.length < 2) {
            self._showMessage('Scatter \u05D3\u05D5\u05E8\u05E9 2 \u05EA\u05D2\u05D9\u05DD \u05D1\u05D3\u05D9\u05D5\u05E7');
            return;
        }

        var model = TA.buildScatterModel(aligned.series[0].values, aligned.series[1].values,
            aligned.series[0].name, aligned.series[1].name);

        var plotW = W - pad.left - pad.right;
        var plotH = H - pad.top - pad.bottom;
        var xMin = model.xStats.min - model.xStats.range * 0.05;
        var xMax = model.xStats.max + model.xStats.range * 0.05;
        var yMin = model.yStats.min - model.yStats.range * 0.05;
        var yMax = model.yStats.max + model.yStats.range * 0.05;
        var xRange = xMax - xMin || 1;
        var yRange = yMax - yMin || 1;

        // Grid
        ctx.strokeStyle = '#1a2d44'; ctx.lineWidth = 1;
        for (var gx = 0; gx <= 5; gx++) {
            var xPx = pad.left + plotW * gx / 5;
            ctx.beginPath(); ctx.moveTo(xPx, pad.top); ctx.lineTo(xPx, H - pad.bottom); ctx.stroke();
            ctx.fillStyle = '#8899AA'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'center';
            ctx.fillText(MU.formatNum(xMin + xRange * gx / 5, 1), xPx, H - pad.bottom + 15);
        }
        for (var gy = 0; gy <= 5; gy++) {
            var yPx = pad.top + plotH - plotH * gy / 5;
            ctx.beginPath(); ctx.moveTo(pad.left, yPx); ctx.lineTo(W - pad.right, yPx); ctx.stroke();
            ctx.fillStyle = '#8899AA'; ctx.textAlign = 'right';
            ctx.fillText(MU.formatNum(yMin + yRange * gy / 5, 1), pad.left - 4, yPx + 3);
        }

        // Points
        ctx.fillStyle = TA.getColor(0);
        for (var p = 0; p < model.points.length; p++) {
            var pt = model.points[p];
            var x = pad.left + ((pt.x - xMin) / xRange) * plotW;
            var y = pad.top + plotH - ((pt.y - yMin) / yRange) * plotH;
            ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        }

        // Axis labels
        ctx.fillStyle = '#CCC'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'center';
        ctx.fillText(model.xName, pad.left + plotW / 2, H - 5);
        ctx.save(); ctx.translate(12, pad.top + plotH / 2); ctx.rotate(-Math.PI / 2);
        ctx.fillText(model.yName, 0, 0); ctx.restore();

        // Correlation text
        ctx.fillStyle = '#FFF'; ctx.font = '12px Segoe UI'; ctx.textAlign = 'right';
        ctx.fillText('r = ' + (isNaN(model.correlation) ? 'N/A' : model.correlation.toFixed(3)),
            W - pad.right - 5, pad.top + 15);

        self._canvasEl.style.display = '';
        self._summaryEl.style.display = 'none';
    };

    // ── Summary Table ──
    Mu20TagExplorer.prototype._renderSummaryTable = function (alignedSeries) {
        var self = this;
        var TA = MU.TagAnalysis;
        var model = TA.buildSummaryTable(alignedSeries);

        self._canvasEl.style.display = 'none';
        self._summaryEl.style.display = '';
        self._summaryEl.innerHTML = '';

        var table = _el('table', 'mu20-log-table mu20-explorer-table');
        var cols = ['\u05EA\u05D2', 'Min', 'Max', 'Avg', 'Std', '\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA', '\u05D7\u05E1\u05E8\u05D9\u05DD', '\u05D8\u05D5\u05D5\u05D7'];

        var thead = _el('thead');
        var headerRow = _el('tr');
        for (var c = 0; c < cols.length; c++) headerRow.appendChild(_txt('th', '', cols[c]));
        thead.appendChild(headerRow);
        table.appendChild(thead);

        var tbody = _el('tbody');
        for (var r = 0; r < model.length; r++) {
            var row = model[r];
            var color = TA.getColor(r);
            var tr = _el('tr');

            // Name cell with color indicator
            var tdName = _el('td');
            var nameSpan = _txt('span', '', row.name);
            nameSpan.style.cssText = 'border-left:3px solid ' + color + '; padding-right:6px;';
            tdName.appendChild(nameSpan);
            tr.appendChild(tdName);

            var numStyle = 'font-variant-numeric:tabular-nums;';
            tr.appendChild(_txt('td', '', MU.formatNum(row.min, 1))); tr.lastChild.style.cssText = numStyle;
            tr.appendChild(_txt('td', '', MU.formatNum(row.max, 1))); tr.lastChild.style.cssText = numStyle;
            tr.appendChild(_txt('td', '', MU.formatNum(row.avg, 1))); tr.lastChild.style.cssText = numStyle;
            tr.appendChild(_txt('td', '', MU.formatNum(row.std, 2))); tr.lastChild.style.cssText = numStyle;
            tr.appendChild(_txt('td', '', '' + row.count));
            tr.appendChild(_txt('td', '', '' + row.missing));
            tr.appendChild(_txt('td', '', MU.formatNum(row.range, 1))); tr.lastChild.style.cssText = numStyle;

            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        self._summaryEl.appendChild(table);
    };

    // ── Correlation Heatmap ──
    Mu20TagExplorer.prototype._renderHeatmap = function (alignedSeries) {
        var self = this;
        var TA = MU.TagAnalysis;
        var canvas = self._canvasEl;
        var ctx = canvas.getContext('2d');

        self._resizeCanvas();
        var W = canvas.width, H = canvas.height;

        ctx.clearRect(0, 0, W, H);
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, W, H);

        var model = TA.correlationMatrix(alignedSeries);
        var n = model.names.length;

        if (n < 2) { self._showMessage('Heatmap \u05D3\u05D5\u05E8\u05E9 \u05DC\u05E4\u05D7\u05D5\u05EA 2 \u05EA\u05D2\u05D9\u05DD'); return; }

        var labelW = 120;
        var cellSize = Math.min((W - labelW - 40) / n, (H - labelW - 40) / n, 80);
        var gridX = labelW + 10;
        var gridY = labelW + 10;

        // Column labels (rotated)
        ctx.save();
        ctx.fillStyle = '#CCC'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'right';
        for (var ci = 0; ci < n; ci++) {
            var cx = gridX + ci * cellSize + cellSize / 2;
            ctx.save(); ctx.translate(cx, gridY - 5); ctx.rotate(-Math.PI / 4);
            ctx.fillText(self._truncate(model.names[ci], 15), 0, 0);
            ctx.restore();
        }
        ctx.restore();

        // Row labels
        ctx.fillStyle = '#CCC'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'right';
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

                ctx.fillStyle = '#FFF'; ctx.font = '11px Segoe UI'; ctx.textAlign = 'center';
                ctx.fillText(isNaN(r) ? '-' : r.toFixed(2), x + cellSize / 2 - 1, y + cellSize / 2 + 4);
            }
        }

        self._canvasEl.style.display = '';
        self._summaryEl.style.display = 'none';
    };


    // ═══════════════════════════════════════
    //  Chart Helpers
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._renderLegend = function (ctx, series, W, pad) {
        var TA = MU.TagAnalysis;
        var x = pad.left + 10;
        var y = pad.top + 10;

        for (var i = 0; i < series.length; i++) {
            ctx.fillStyle = TA.getColor(i);
            ctx.fillRect(x, y + i * 16, 12, 10);
            ctx.fillStyle = '#CCC'; ctx.font = '10px Segoe UI'; ctx.textAlign = 'left';
            ctx.fillText(this._truncate(series[i].name, 30), x + 16, y + i * 16 + 9);
        }
    };

    Mu20TagExplorer.prototype._resizeCanvas = function () {
        var canvas = this._canvasEl;
        var container = this._outputEl;
        var w = container.offsetWidth || 800;
        var h = Math.max(300, (container.offsetHeight || 500) - 100);
        canvas.width = w;
        canvas.height = h;
    };


    // ═══════════════════════════════════════
    //  Export
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._exportCurrentView = function () {
        if (this._chartType === 'table') this._exportTableCsv();
        else this._exportCanvasImage();
    };

    Mu20TagExplorer.prototype._exportTableCsv = function () {
        var self = this;
        if (!self._lastAligned || !self._lastAligned.series || !self._lastAligned.series.length) return;
        var TA = MU.TagAnalysis;
        var model = TA.buildSummaryTable(self._lastAligned.series);

        var rows = [];
        for (var i = 0; i < model.length; i++) {
            var m = model[i];
            rows.push({
                '\u05EA\u05D2': m.name, 'Min': m.min, 'Max': m.max, 'Avg': m.avg,
                'Std': m.std, '\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA': m.count,
                '\u05D7\u05E1\u05E8\u05D9\u05DD': m.missing, '\u05D8\u05D5\u05D5\u05D7': m.range
            });
        }
        MU.exportCsv(rows, 'mu20-explorer-' + MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
    };

    Mu20TagExplorer.prototype._exportCanvasImage = function () {
        var canvas = this._canvasEl;
        try {
            var dataUrl = canvas.toDataURL('image/png');
            var a = document.createElement('a');
            a.href = dataUrl;
            a.download = 'mu20-explorer-' + MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.png';
            a.click();
        } catch (e) { /* not supported */ }
    };


    // ═══════════════════════════════════════
    //  UI Helpers
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype._clearOutput = function () {
        this._kpiBar.innerHTML = '';
        var canvas = this._canvasEl;
        var ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#556677'; ctx.font = '14px Segoe UI'; ctx.textAlign = 'center';
        ctx.fillText('\u05D1\u05D7\u05E8 \u05EA\u05D2\u05D9\u05DD \u05DC\u05D4\u05EA\u05D7\u05DC\u05D4', canvas.width / 2, canvas.height / 2);
        this._summaryEl.innerHTML = '';
        this._summaryEl.style.display = 'none';
        this._canvasEl.style.display = '';
    };

    Mu20TagExplorer.prototype._showMessage = function (msg) {
        var canvas = this._canvasEl;
        var ctx = canvas.getContext('2d');
        this._resizeCanvas();
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0a1628';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#F39C12'; ctx.font = '14px Segoe UI'; ctx.textAlign = 'center';
        ctx.fillText(msg, canvas.width / 2, canvas.height / 2);
        this._canvasEl.style.display = '';
        this._summaryEl.style.display = 'none';
    };

    Mu20TagExplorer.prototype._updateTimeDisplay = function () {
        if (this._dateStart && this._dateEnd) {
            var s = new Date(this._dateStart);
            var e = new Date(this._dateEnd);
            this._timeDisplay.textContent =
                s.toLocaleDateString() + ' ' + s.toLocaleTimeString() +
                ' \u2014 ' + e.toLocaleDateString() + ' ' + e.toLocaleTimeString();
        } else {
            this._timeDisplay.textContent = '\u05D0\u05D7\u05E8\u05D5\u05E0\u05D5\u05EA 24 \u05E9\u05E2\u05D5\u05EA';
        }
    };

    Mu20TagExplorer.prototype._updateContextDisplay = function () {
        if (!this._contextDisplay) return;
        var parts = [];
        if (this._siteId) {
            var sites = this._sites;
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
        this._contextDisplay.textContent = parts.length ? parts.join(' / ') : '';
    };

    Mu20TagExplorer.prototype._truncate = function (str, maxLen) {
        if (!str) return '';
        return str.length > maxLen ? str.substring(0, maxLen - 2) + '..' : str;
    };


    // ═══════════════════════════════════════
    //  setOption (live config updates)
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype.setOption = function (key, value) {
        if (key === 'defaultChart') {
            this._chartType = value || 'trend';
        } else if (key === 'maxTags') {
            this._maxTags = value || 8;
        } else if (key === 'sites') {
            this._sites = value || [];
        }
    };


    // ═══════════════════════════════════════
    //  Destroy
    // ═══════════════════════════════════════

    Mu20TagExplorer.prototype.destroy = function () {
        this._destroyed = true;

        if (this._bus) {
            if (this._onOpenInExplorer) this._bus.off('tags:openInExplorer', this._onOpenInExplorer);
            if (this._onTimeChanged)    this._bus.off('time:rangeChanged', this._onTimeChanged);
            if (this._onSiteSelected)   this._bus.off('site:selected', this._onSiteSelected);
            if (this._onUnitSelected)   this._bus.off('unit:selected', this._onUnitSelected);
            if (this._onDemoToggle)     this._bus.off('demo:toggle', this._onDemoToggle);
            if (this._onApiReady)       this._bus.off('api:ready', this._onApiReady);
        }

        this._api = null;
        this._selectedTags = null;
        this._lastAligned = null;
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
        this._addTagDialogEl = null;

        if (this._container) this._container.innerHTML = '';
    };


    // ── Expose globally ──
    window.Mu20TagExplorer = Mu20TagExplorer;

})();
