/**
 * ═══════════════════════════════════════════════════════
 *  mu20-reports.js  —  Reports Tab Plugin (MU20)
 * ═══════════════════════════════════════════════════════
 *  Report generator: template selector, HTML preview,
 *  PDF via window.print(), CSV export, SVG capacity
 *  bar chart, API-backed monthly & annual reports.
 *
 *  Ported from mm20-reports.js (jQuery → vanilla ES5).
 *  Version: ULT.1.5  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-reports] MU20 core not loaded'); return; }

    // ── Fallback constants (if core hasn't defined them) ──

    var REPORT_TEMPLATES = MU.REPORT_TEMPLATES || [
        { id: 'monthly',          name: '\u05D3\u05D5\u05D7 \u05D7\u05D5\u05D3\u05E9\u05D9' },
        { id: 'critical',         name: '\u05D9\u05D7\u05D9\u05D3\u05D5\u05EA \u05E7\u05E8\u05D9\u05D8\u05D9\u05D5\u05EA' },
        { id: 'annual',           name: '\u05D3\u05D5\u05D7 \u05E9\u05E0\u05EA\u05D9' },
        { id: 'guard',            name: '\u05DE\u05E9\u05DE\u05E8\u05D5\u05EA' },
        { id: 'custom',           name: '\u05DE\u05D5\u05EA\u05D0\u05DD \u05D0\u05D9\u05E9\u05D9\u05EA' },
        { id: 'monthlyBreakdown', name: '\u05E4\u05D9\u05E8\u05D5\u05D8 \u05D7\u05D5\u05D3\u05E9\u05D9' },
        { id: 'yoy',              name: '\u05D4\u05E9\u05D5\u05D5\u05D0\u05D4 \u05E9\u05E0\u05EA\u05D9\u05EA' },
        { id: 'daily',            name: '\u05E1\u05D9\u05DB\u05D5\u05DD \u05D9\u05D5\u05DE\u05D9' },
        { id: 'weekly',           name: '\u05E1\u05D9\u05DB\u05D5\u05DD \u05E9\u05D1\u05D5\u05E2\u05D9' },
        { id: 'fuel',             name: '\u05EA\u05DE\u05D4\u05D9\u05DC \u05D3\u05DC\u05E7' },
        { id: 'n1contingency',    name: 'N-1 \u05D2\u05D9\u05D1\u05D5\u05D9' }
    ];

    var GROUPING_OPTIONS = MU.GROUPING_OPTIONS || [
        { id: 'site',   name: '\u05DC\u05E4\u05D9 \u05D0\u05EA\u05E8' },
        { id: 'status', name: '\u05DC\u05E4\u05D9 \u05E1\u05D8\u05D8\u05D5\u05E1' },
        { id: 'fuel',   name: '\u05DC\u05E4\u05D9 \u05D3\u05DC\u05E7' },
        { id: 'region', name: '\u05DC\u05E4\u05D9 \u05D0\u05D6\u05D5\u05E8' },
        { id: 'owner',  name: '\u05DC\u05E4\u05D9 \u05D1\u05E2\u05DC\u05D9\u05DD' }
    ];

    var REPORT_COLS = MU.REPORT_COLS || [
        { id: 'site',    label: '\u05D0\u05EA\u05E8',              def: true  },
        { id: 'unit',    label: '\u05D9\u05D7\u05D9\u05D3\u05D4',  def: true  },
        { id: 'status',  label: '\u05E1\u05D8\u05D8\u05D5\u05E1',  def: true  },
        { id: 'hours',   label: '\u05E9\u05E2\u05D5\u05EA',        def: true  },
        { id: 'quota',   label: '\u05DE\u05DB\u05E1\u05D4',        def: true  },
        { id: 'pct',     label: '% \u05E0\u05D9\u05E6\u05D5\u05DC', def: true  },
        { id: 'fuel',    label: '\u05D3\u05DC\u05E7',              def: false },
        { id: 'region',  label: '\u05D0\u05D6\u05D5\u05E8',        def: false },
        { id: 'totalLY', label: '\u05E9\u05E0\u05D4 \u05E7\u05D5\u05D3\u05DE\u05EA', def: false },
        { id: 'diff',    label: '\u05D4\u05E4\u05E8\u05E9',        def: false },
        { id: 'diffPct', label: '\u05D4\u05E4\u05E8\u05E9 %',      def: false },
        { id: 'rate',         label: '\u05E7\u05E6\u05D1 \u05D9\u05D5\u05DE\u05D9',       def: false },
        { id: 'monthly',      label: '\u05D7\u05D5\u05D3\u05E9\u05D9\u05DD',          def: false },
        { id: 'siteHoursYtd', label: '\u05E9\u05E2\u05D5\u05EA \u05E9\u05E0\u05EA\u05D9', def: true },
        { id: 'owner',        label: '\u05D1\u05E2\u05DC\u05D9\u05DD',                def: false }
    ];

    var STATUS_LABELS = MU.STATUS_LABELS || {};


    // ═══════════════════════════════════════
    //  Helpers
    // ═══════════════════════════════════════

    /** Create element with className */
    function _el(tag, className, text) {
        var node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    /** Clear children */
    function _empty(el) {
        while (el.firstChild) el.removeChild(el.firstChild);
    }

    /** Format date string yyyy-mm-dd from Date */
    function _isoDate(d) {
        return d.getFullYear() + '-' +
            ('0' + (d.getMonth() + 1)).slice(-2) + '-' +
            ('0' + d.getDate()).slice(-2);
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
    function Mu20Reports(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._opts      = options || {};
        self._bus       = bus;
        self._destroyed = false;
        self._api       = self._opts.api || null;

        // Option defaults
        if (!self._opts.template) self._opts.template = 'monthly';
        if (!self._opts.grouping) self._opts.grouping = 'site';
        if (!self._opts.dateStart) self._opts.dateStart = '';
        if (!self._opts.dateEnd)   self._opts.dateEnd   = '';

        // State
        self._reportRows        = null;
        self._templateBtns      = {};
        self._groupSelect       = null;
        self._dateStartInput    = null;
        self._dateEndInput      = null;
        self._previewEl         = null;
        self._apiReadyListener  = null;
        self._dataListener      = null;
        self._siteDefs          = null;
        self._renderState       = null;

        // YoY cache
        self._yoyCache = null;
        self._yoyLoading = false;

        // Saved Templates
        self._savedTemplates = (self._opts.savedTemplates || []).slice();
        self._onSaveTemplates = self._opts.onSaveTemplates || null;
        self._maxTemplates = 20;
        self._templateSelect = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('reports', 'constructor', e);
            MU.shield.renderFallback(self._container, 'reports', e);
        }
    }


    // ═══════════════════════════════════════
    //  Mount DOM
    // ═══════════════════════════════════════

    Mu20Reports.prototype._mount = function () {
        var self = this;
        var c = self._container;
        c.classList.add('mu20-reports-root');

        // ── Bus listeners ──
        if (self._bus && !self._api) {
            self._apiReadyListener = function (apiInstance) {
                self._api = apiInstance;
            };
            self._bus.on('api:ready', self._apiReadyListener);
        }

        if (self._bus) {
            self._dataListener = function (newData) {
                // Canonical payload normalization — reports needs rawSites
                self._opts.data = (newData && newData.rawSites) ? newData.rawSites : newData;
                if (newData && newData.siteDefs) self._siteDefs = newData.siteDefs;
                if (newData && newData.renderState) self._renderState = newData.renderState;
            };
            self._bus.on('data:updated', self._dataListener);

            // Sync date range with PI Vision timebar
            if (self._opts.syncWithDisplayTime) {
                self._timeRangeListener = function (range) {
                    if (!range || !range.start || !range.end) return;
                    var s = new Date(range.start);
                    var e = new Date(range.end);
                    if (isNaN(s.getTime()) || isNaN(e.getTime())) return;
                    var startStr = _isoDate(s);
                    var endStr   = _isoDate(e);
                    var changed = false;
                    if (self._dateStartInput && self._dateStartInput.value !== startStr) {
                        self._dateStartInput.value = startStr;
                        changed = true;
                    }
                    if (self._dateEndInput && self._dateEndInput.value !== endStr) {
                        self._dateEndInput.value = endStr;
                        changed = true;
                    }
                    if (changed) self._generatePreview();
                };
                self._bus.on('time:rangeChanged', self._timeRangeListener);
            }
        }

        // ── Layout: sidebar + preview ──
        var panel = _el('div', 'mu20-report-panel');

        // ──────── Sidebar ────────
        var sidebar = _el('div', 'mu20-report-sidebar');

        var sidebarTitle = _el('div', null, '\u05EA\u05D1\u05E0\u05D9\u05EA \u05D3\u05D5\u05D7');
        sidebarTitle.style.fontWeight = '600';
        sidebarTitle.style.marginBottom = '8px';
        sidebar.appendChild(sidebarTitle);

        // Template buttons
        var templates = REPORT_TEMPLATES;
        for (var i = 0; i < templates.length; i++) {
            (function (tmpl) {
                var btn = _el('button', 'mu20-report-btn', tmpl.name);
                if (self._opts.template === tmpl.id) {
                    btn.classList.add('mu20-report-btn--active');
                }
                btn.addEventListener('click', function () {
                    self._opts.template = tmpl.id;
                    self._updateTemplateBtns();
                    self._generatePreview();
                });
                self._templateBtns[tmpl.id] = btn;
                sidebar.appendChild(btn);
            })(templates[i]);
        }

        // ── Grouping selector ──
        var groupTitle = _el('div', null, '\u05E7\u05D9\u05D1\u05D5\u05E5');
        groupTitle.style.fontWeight = '600';
        groupTitle.style.marginTop = '12px';
        groupTitle.style.marginBottom = '4px';
        sidebar.appendChild(groupTitle);

        self._groupSelect = document.createElement('select');
        self._groupSelect.className = 'mu20-hm-select';
        self._groupSelect.style.width = '100%';

        var groups = GROUPING_OPTIONS;
        for (var g = 0; g < groups.length; g++) {
            var opt = document.createElement('option');
            opt.value = groups[g].id;
            opt.textContent = groups[g].name;
            self._groupSelect.appendChild(opt);
        }
        self._groupSelect.value = self._opts.grouping;
        self._groupSelect.addEventListener('change', function () {
            self._opts.grouping = this.value;
            self._generatePreview();
        });
        sidebar.appendChild(self._groupSelect);

        // ── Date range picker ──
        var dateTitle = _el('div', null, '\u05D8\u05D5\u05D5\u05D7 \u05EA\u05D0\u05E8\u05D9\u05DB\u05D9\u05DD');
        dateTitle.style.fontWeight = '600';
        dateTitle.style.marginTop = '12px';
        dateTitle.style.marginBottom = '4px';
        sidebar.appendChild(dateTitle);

        var dateWrap = _el('div', 'mu20-report-date-range');

        // Default: last 30 days
        var now = new Date();
        var thirtyAgo = new Date(now.getTime() - 30 * 86400000);
        var defStart = self._opts.dateStart || _isoDate(thirtyAgo);
        var defEnd   = self._opts.dateEnd   || _isoDate(now);

        var labelFrom = _el('label', null, '\u05DE:');
        labelFrom.style.fontSize = '10px';
        labelFrom.style.color = '#8899AA';
        dateWrap.appendChild(labelFrom);

        self._dateStartInput = document.createElement('input');
        self._dateStartInput.className = 'mu20-search-input';
        self._dateStartInput.type = 'date';
        self._dateStartInput.setAttribute('dir', 'ltr');
        self._dateStartInput.style.width = '100%';
        self._dateStartInput.value = defStart;
        dateWrap.appendChild(self._dateStartInput);

        var labelTo = _el('label', null, '\u05E2\u05D3:');
        labelTo.style.fontSize = '10px';
        labelTo.style.color = '#8899AA';
        labelTo.style.marginTop = '2px';
        dateWrap.appendChild(labelTo);

        self._dateEndInput = document.createElement('input');
        self._dateEndInput.className = 'mu20-search-input';
        self._dateEndInput.type = 'date';
        self._dateEndInput.setAttribute('dir', 'ltr');
        self._dateEndInput.style.width = '100%';
        self._dateEndInput.style.marginTop = '4px';
        self._dateEndInput.value = defEnd;
        dateWrap.appendChild(self._dateEndInput);

        sidebar.appendChild(dateWrap);

        // ── Action buttons ──
        var spacer = _el('div');
        spacer.style.marginTop = '12px';
        sidebar.appendChild(spacer);

        var genBtn = _el('button', 'mu20-report-btn', '\u05D9\u05E6\u05E8 \u05D3\u05D5\u05D7');
        genBtn.style.background = 'var(--mu20-accent, #5BC0EB)';
        genBtn.style.color = '#000';
        genBtn.style.fontWeight = '600';
        genBtn.addEventListener('click', function () { self._generatePreview(); });
        sidebar.appendChild(genBtn);

        var csvBtn = _el('button', 'mu20-report-btn', '\u05D9\u05E6\u05D5\u05D0 CSV');
        csvBtn.addEventListener('click', function () { self._exportCsv(); });
        sidebar.appendChild(csvBtn);

        var pdfBtn = _el('button', 'mu20-report-btn', '\u05D9\u05E6\u05D5\u05D0 PDF');
        pdfBtn.addEventListener('click', function () { self._exportPdf(); });
        sidebar.appendChild(pdfBtn);

        // ── Saved Templates bar ──
        var templateBar = self._buildTemplateBar();
        sidebar.appendChild(templateBar);

        panel.appendChild(sidebar);

        // ──────── Preview area ────────
        self._previewEl = _el('div', 'mu20-report-preview');
        var placeholder = _el('div', 'mu20-tags-placeholder',
            '\u05D1\u05D7\u05E8 \u05EA\u05D1\u05E0\u05D9\u05EA \u05D5\u05DC\u05D7\u05E5 "\u05D9\u05E6\u05E8 \u05D3\u05D5\u05D7"');
        self._previewEl.appendChild(placeholder);
        panel.appendChild(self._previewEl);

        c.appendChild(panel);
    };


    // ═══════════════════════════════════════
    //  Generate report preview
    // ═══════════════════════════════════════

    Mu20Reports.prototype._generatePreview = function () {
        var self = this;
        if (self._destroyed) return;

        var sites = self._opts.sites || MU.SITES;
        var data  = self._opts.data;

        if (!data && self._opts.demoMode) {
            data = MU.demo ? MU.demo.generateSites(sites) : null;
        }
        if (!data) {
            _empty(self._previewEl);
            var ph = _el('div', 'mu20-tags-placeholder',
                '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D3\u05D5\u05D7');
            self._previewEl.appendChild(ph);
            return;
        }

        // YoY: trigger fetch if needed, then re-render
        if (self._opts.template === 'yoy' && !self._yoyCache) {
            self._fetchYoYData(function () { self._generatePreview(); });
            return;
        }

        // Template-specific columns
        var cols = self._getTemplateCols();
        var grouping = self._opts.grouping;
        var nowStr = MU.formatDate(new Date());

        // Read date range from inputs
        if (self._dateStartInput) self._opts.dateStart = self._dateStartInput.value;
        if (self._dateEndInput)   self._opts.dateEnd   = self._dateEndInput.value;

        // Build report rows (N-1 builder for contingency template)
        var rows;
        if (self._opts.template === 'n1contingency') {
            rows = self._buildN1Rows(sites, data);
        } else {
            rows = self._buildRows(sites, data);
        }

        // Group rows
        if (grouping !== 'site' && grouping !== 'owner') {
            rows = self._groupRows(rows, grouping);
        }

        // Build HTML table
        var html = '<div dir="rtl" style="font-family:inherit;">';
        html += '<h3 style="margin:0 0 8px;">\u05D3\u05D5\u05D7 ' + self._getTemplateName() + '</h3>';
        html += '<p style="font-size:10px; color:#8899AA;">\u05E0\u05D5\u05E6\u05E8: ' + MU.escapeHtml(nowStr) + '</p>';
        html += '<table class="mu20-log-table" style="width:100%;">';
        html += '<thead><tr>';
        for (var c2 = 0; c2 < cols.length; c2++) {
            html += '<th>' + MU.escapeHtml(cols[c2].label || cols[c2].id) + '</th>';
        }
        html += '</tr></thead><tbody>';

        if (grouping === 'owner') {
            // Owner grouping: header rows + subtotals per owner
            var ownerGroups = self._groupByOwner(rows);
            var byOwner = ownerGroups.byOwner;
            var ownerLabels = ownerGroups.ownerLabels;
            var allGroupedRows = [];

            for (var ownerKey in byOwner) {
                if (!byOwner.hasOwnProperty(ownerKey)) continue;
                var groupRows = byOwner[ownerKey];
                var ownerLabel = ownerLabels[ownerKey] || ownerKey;

                // Owner header row
                html += '<tr style="background:#2C3E50; font-weight:600;">';
                html += '<td colspan="' + cols.length + '">' +
                    MU.escapeHtml(ownerLabel) + ' (' + groupRows.length + ' \u05E9\u05D5\u05E8\u05D5\u05EA)' +
                    '</td></tr>';

                // Data rows for this owner
                for (var gr = 0; gr < groupRows.length; gr++) {
                    html += '<tr>';
                    for (var gcc = 0; gcc < cols.length; gcc++) {
                        var gval = groupRows[gr][cols[gcc].id];
                        html += '<td>' + MU.escapeHtml(gval !== undefined ? String(gval) : '--') + '</td>';
                    }
                    html += '</tr>';
                    allGroupedRows.push(groupRows[gr]);
                }

                // Subtotal row for this owner
                var subtotalHours = 0;
                var subtotalQuota = 0;
                var countUnits = groupRows.length;
                for (var st = 0; st < groupRows.length; st++) {
                    var h = parseFloat(String(groupRows[st].hours).replace(/,/g, ''));
                    var q = parseFloat(String(groupRows[st].quota).replace(/,/g, ''));
                    if (!isNaN(h)) subtotalHours += h;
                    if (!isNaN(q)) subtotalQuota += q;
                }
                var subtotalPct = subtotalQuota > 0 ? (subtotalHours / subtotalQuota * 100) : 0;

                html += '<tr style="background:#1A252F; font-weight:600; border-top:1px solid #5BC0EB;">';
                for (var sc = 0; sc < cols.length; sc++) {
                    var colId = cols[sc].id;
                    var sval = '';
                    if (colId === 'site') {
                        sval = '\u05E1\u05D4\u05F4\u05DB ' + MU.escapeHtml(ownerLabel);
                    } else if (colId === 'unit') {
                        sval = countUnits + ' \u05D9\u05D7\u05D9\u05D3\u05D5\u05EA';
                    } else if (colId === 'hours') {
                        sval = MU.formatNum(subtotalHours, 0);
                    } else if (colId === 'quota') {
                        sval = MU.formatNum(subtotalQuota, 0);
                    } else if (colId === 'pct') {
                        sval = MU.formatNum(subtotalPct, 1) + '%';
                    }
                    html += '<td>' + sval + '</td>';
                }
                html += '</tr>';
            }
            // Replace rows with grouped order for export
            rows = allGroupedRows;
        } else {
            // Standard (non-owner) rendering
            for (var r = 0; r < rows.length; r++) {
                html += '<tr>';
                for (var cc = 0; cc < cols.length; cc++) {
                    var val = rows[r][cols[cc].id];
                    html += '<td>' + MU.escapeHtml(val !== undefined ? String(val) : '--') + '</td>';
                }
                html += '</tr>';
            }
        }

        html += '</tbody></table>';

        // SVG capacity bar chart
        html += self._buildSvgChart(sites, data);

        html += '</div>';

        _empty(self._previewEl);
        self._previewEl.innerHTML = html;

        // Store for export
        self._reportRows = rows;
    };


    // ─────────────────────────────────────
    //  Build standard rows
    // ─────────────────────────────────────

    Mu20Reports.prototype._buildRows = function (sites, data) {
        var self = this;
        var renderState = self._renderState;
        var rows = [];
        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            var siteData = data[site.id];
            if (!siteData) continue;

            // Resolve siteHoursYtd from renderState (site-level AF rollup)
            var siteHoursYtd = null;
            if (renderState) {
                // siteHoursYtd is the same for all units of a site; grab from first available
                for (var ui = 0; ui < site.units.length; ui++) {
                    var unitKey = site.id + '_u' + ui;
                    var rs = renderState[unitKey];
                    if (rs && rs.siteHoursYtd !== undefined && rs.siteHoursYtd !== null) {
                        siteHoursYtd = rs.siteHoursYtd;
                        break;
                    }
                }
            }

            for (var u = 0; u < site.units.length; u++) {
                var ud = siteData[u];
                rows.push({
                    site:         site.name,
                    siteId:       site.id,
                    unit:         site.units[u],
                    status:       ud ? (STATUS_LABELS[ud.status] || ud.status || '--') : '--',
                    hours:        ud ? MU.formatNum(ud.hours, 0) : '--',
                    quota:        ud ? MU.formatNum(ud.quota, 0) : '--',
                    pct:          ud ? MU.formatNum(ud.pct, 1) + '%' : '--',
                    fuel:         site.fuel,
                    region:       site.region,
                    owner:        site.owner || '',
                    ownerLabel:   site.ownerLabel || site.owner || '',
                    siteHoursYtd: siteHoursYtd !== null ? MU.formatNum(siteHoursYtd, 0) + ' \u05E9\u05E2\u05D5\u05EA' : '--'
                });

                // YoY enrichment
                var yoyKey = site.id + '_u' + u;
                var yoyHours = self._yoyCache && self._yoyCache[yoyKey];
                var currentHours = ud ? ud.hours : null;
                var lastRow = rows[rows.length - 1];
                if (yoyHours !== undefined && yoyHours !== null) {
                    lastRow.totalLY = MU.formatNum(yoyHours, 0);
                    if (currentHours !== null && currentHours !== undefined) {
                        var diffVal = currentHours - yoyHours;
                        lastRow.diff = MU.formatNum(diffVal, 0);
                        lastRow.diffPct = yoyHours > 0 ? MU.formatNum((diffVal / yoyHours) * 100, 1) + '%' : '\u2014';
                    } else {
                        lastRow.diff = '\u2014';
                        lastRow.diffPct = '\u2014';
                    }
                } else {
                    lastRow.totalLY = '\u2014';
                    lastRow.diff = '\u2014';
                    lastRow.diffPct = '\u2014';
                }
            }
        }
        return rows;
    };


    // ─────────────────────────────────────
    //  Group rows by key
    // ─────────────────────────────────────

    Mu20Reports.prototype._groupRows = function (rows, grouping) {
        rows.sort(function (a, b) {
            var ka = a[grouping] || '';
            var kb = b[grouping] || '';
            return ka.localeCompare(kb);
        });
        return rows;
    };


    // ─────────────────────────────────────
    //  Group rows by owner with headers & subtotals
    // ─────────────────────────────────────

    Mu20Reports.prototype._groupByOwner = function (rows) {
        var sites = this._opts.sites || MU.SITES;
        var siteDefs = this._siteDefs || sites;

        // Build owner lookup from siteDefs array
        var ownerBySiteId = {};
        var ownerLabelBySiteId = {};
        if (siteDefs && siteDefs.length) {
            for (var i = 0; i < siteDefs.length; i++) {
                var sd = siteDefs[i];
                if (sd && sd.id) {
                    ownerBySiteId[sd.id] = sd.owner || 'UNKNOWN';
                    ownerLabelBySiteId[sd.id] = sd.ownerLabel || sd.owner || 'UNKNOWN';
                }
            }
        }

        // Also check rows themselves (they carry owner from _buildRows)
        var byOwner = {};
        var ownerLabels = {};
        for (var r = 0; r < rows.length; r++) {
            var row = rows[r];
            var owner = row.owner || ownerBySiteId[row.siteId] || 'UNKNOWN';
            var label = row.ownerLabel || ownerLabelBySiteId[row.siteId] || owner;
            if (!byOwner[owner]) {
                byOwner[owner] = [];
                ownerLabels[owner] = label;
            }
            byOwner[owner].push(row);
        }

        return { byOwner: byOwner, ownerLabels: ownerLabels };
    };


    // ─────────────────────────────────────
    //  Template name lookup
    // ─────────────────────────────────────

    Mu20Reports.prototype._getTemplateName = function () {
        var templates = REPORT_TEMPLATES;
        for (var i = 0; i < templates.length; i++) {
            if (templates[i].id === this._opts.template) return templates[i].name;
        }
        return this._opts.template;
    };


    // ─────────────────────────────────────
    //  Template-specific column sets
    // ─────────────────────────────────────

    Mu20Reports.prototype._getTemplateCols = function () {
        var tmpl = this._opts.template;
        var cols = REPORT_COLS;

        var templateCols = {
            daily:   ['site', 'unit', 'hours', 'quota', 'pct', 'status'],
            weekly:  ['site', 'unit', 'hours', 'pct', 'status'],
            monthly: null,   // null = all default cols
            fuel:    ['site', 'fuel', 'hours', 'pct'],
            yoy:     ['site', 'unit', 'hours', 'quota', 'pct', 'totalLY', 'diff', 'diffPct']
        };

        var allowed = templateCols[tmpl];
        if (!allowed) return cols;   // show all

        var filtered = [];
        for (var i = 0; i < cols.length; i++) {
            if (allowed.indexOf(cols[i].id) >= 0) {
                filtered.push(cols[i]);
            }
        }
        return filtered.length ? filtered : cols;
    };


    // ─────────────────────────────────────
    //  Update template button active state
    // ─────────────────────────────────────

    Mu20Reports.prototype._updateTemplateBtns = function () {
        var active = this._opts.template;
        for (var key in this._templateBtns) {
            if (this._templateBtns.hasOwnProperty(key)) {
                var btn = this._templateBtns[key];
                if (key === active) {
                    btn.classList.add('mu20-report-btn--active');
                } else {
                    btn.classList.remove('mu20-report-btn--active');
                }
            }
        }
    };


    // ─────────────────────────────────────
    //  N-1 Contingency Report Builder
    // ─────────────────────────────────────

    Mu20Reports.prototype._buildN1Rows = function (sites, data) {
        var rows = [];
        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            var siteData = data[site.id];
            if (!siteData) continue;

            // Find largest unit hours
            var maxHours   = 0;
            var maxUnit    = '';
            var totalHours = 0;
            for (var u = 0; u < site.units.length; u++) {
                var ud = siteData[u];
                if (!ud) continue;
                totalHours += (ud.hours || 0);
                if ((ud.hours || 0) > maxHours) {
                    maxHours = ud.hours || 0;
                    maxUnit  = site.units[u];
                }
            }
            var remaining  = totalHours - maxHours;
            var remainPct  = totalHours > 0 ? Math.round((remaining / totalHours) * 100) : 0;
            var risk       = remainPct < 50
                ? '\u05D2\u05D1\u05D5\u05D4'
                : (remainPct < 75 ? '\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9' : '\u05E0\u05DE\u05D5\u05DA');

            rows.push({
                site:   site.name,
                unit:   maxUnit + ' (\u05D2\u05D3\u05D5\u05DC \u05D1\u05D9\u05D5\u05EA\u05E8)',
                hours:  MU.formatNum(maxHours, 0),
                quota:  MU.formatNum(remaining, 0),
                pct:    remainPct + '%',
                status: risk
            });
        }
        return rows;
    };


    // ═══════════════════════════════════════
    //  SVG Capacity Bar Chart
    // ═══════════════════════════════════════

    Mu20Reports.prototype._buildSvgChart = function (sites, data) {
        if (!data) return '';

        var barH   = 18;
        var gap    = 4;
        var maxW   = 300;
        var labels = [];
        var values = [];
        var maxVal = 1;

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            var sd   = data[site.id];
            if (!sd) continue;

            var totalPct = 0;
            var cnt      = 0;
            for (var u = 0; u < site.units.length; u++) {
                var ud = sd[u];
                if (ud && ud.pct !== undefined) {
                    totalPct += ud.pct;
                    cnt++;
                }
            }
            var avg = cnt > 0 ? totalPct / cnt : 0;
            labels.push(site.name);
            values.push(avg);
            if (avg > maxVal) maxVal = avg;
        }

        if (!labels.length) return '';

        var svgH = labels.length * (barH + gap) + 30;
        var svg  = '<div style="margin-top:12px;">' +
            '<div style="font-weight:600; margin-bottom:4px;">' +
            '\u05E0\u05D9\u05E6\u05D5\u05DC \u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05DC\u05E4\u05D9 \u05D0\u05EA\u05E8</div>' +
            '<svg width="100%" height="' + svgH + '" viewBox="0 0 420 ' + svgH +
            '" style="font-size:10px; font-family:inherit;">';

        for (var i = 0; i < labels.length; i++) {
            var y     = i * (barH + gap) + 10;
            var w     = maxVal > 0 ? Math.round((values[i] / maxVal) * maxW) : 0;
            var color = values[i] >= 90 ? '#E74C3C' : (values[i] >= 70 ? '#F39C12' : '#2ECC71');

            svg += '<text x="415" y="' + (y + 13) + '" text-anchor="end" fill="#8899AA">' +
                MU.escapeHtml(labels[i]) + '</text>';
            svg += '<rect x="5" y="' + y + '" width="' + w + '" height="' + barH +
                '" rx="2" fill="' + color + '" opacity="0.8" />';
            svg += '<text x="' + (w + 10) + '" y="' + (y + 13) +
                '" fill="#ECF0F1" font-size="10">' + MU.formatNum(values[i], 1) + '%</text>';
        }

        svg += '</svg></div>';
        return svg;
    };


    // ═══════════════════════════════════════
    //  Export CSV
    // ═══════════════════════════════════════

    Mu20Reports.prototype._exportCsv = function () {
        if (!this._reportRows || !this._reportRows.length) {
            this._generatePreview();
        }
        if (this._reportRows) {
            var dateStr = MU.formatDate(new Date(), 'date');
            var filename = 'mu20-report-' + dateStr.replace(/\//g, '-') + '.csv';
            MU.exportCsv(this._reportRows, filename);
        }
    };


    // ═══════════════════════════════════════
    //  Export PDF (via print dialog)
    // ═══════════════════════════════════════

    Mu20Reports.prototype._exportPdf = function () {
        var self = this;
        if (!self._previewEl) return;

        var printWin = window.open('', '_blank', 'width=800,height=600');
        if (!printWin) return;

        // Stage 7 tech-debt cleanup: replaced `printWin.document.write(...)`
        // with a Blob URL navigation. document.write is SPA-unsafe and was
        // one of the four call sites flagged in the security migration plan.
        var content = self._previewEl.innerHTML;
        var html =
            '<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">' +
            '<title>\u05D3\u05D5\u05D7 \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA</title>' +
            '<style>' +
            'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; ' +
            'direction: rtl; padding: 20px; }' +
            'table { width: 100%; border-collapse: collapse; }' +
            'th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: right; }' +
            'th { background: #f0f0f0; font-weight: 600; }' +
            '</style></head><body>' + content + '</body></html>';
        var blob = new Blob([html], { type: 'text/html' });
        var url = URL.createObjectURL(blob);
        printWin.location.href = url;
        // Print after the new document has parsed.
        printWin.addEventListener('load', function () {
            try { printWin.focus(); printWin.print(); } catch (e) {}
            setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 5000);
        });
    };


    // ═══════════════════════════════════════════════════════
    //  API-Backed Monthly Report
    // ═══════════════════════════════════════════════════════

    Mu20Reports.prototype._fetchMonthlyReport = function (site, unit, unitIdx, callback) {
        var self = this;

        if (!self._api) {
            if (callback) callback(null);
            return;
        }

        // Get the hours attribute WebId for this unit
        var hoursAttrName = unit + '_Hours';

        var resolveCallback = function (webId) {
            if (!webId) {
                if (callback) callback(null);
                return;
            }

            // Calculate month boundaries
            var now        = new Date();
            var monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            var monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

            var getRecordedCallback = function (recordedData) {
                if (!recordedData || !recordedData.length) {
                    if (callback) callback(null);
                    return;
                }

                // Calculate metrics from recorded data
                var totalHours = 0;
                var dailyHours = {};
                var allValues  = [];

                for (var i = 0; i < recordedData.length; i++) {
                    var record = recordedData[i];
                    if (record && record.Value !== undefined) {
                        var val = parseFloat(record.Value);
                        if (!isNaN(val)) {
                            totalHours += val;
                            allValues.push(val);

                            // Group by day
                            var timestamp = record.Timestamp;
                            if (timestamp) {
                                var dateStr = timestamp.substring(0, 10);
                                if (!dailyHours[dateStr]) dailyHours[dateStr] = 0;
                                dailyHours[dateStr] += val;
                            }
                        }
                    }
                }

                // Find peak day
                var peakDay   = '';
                var peakHours = 0;
                for (var day in dailyHours) {
                    if (dailyHours.hasOwnProperty(day) && dailyHours[day] > peakHours) {
                        peakHours = dailyHours[day];
                        peakDay   = day;
                    }
                }

                // Calculate daily average
                var dayKeys      = [];
                for (var dk in dailyHours) {
                    if (dailyHours.hasOwnProperty(dk)) dayKeys.push(dk);
                }
                var daysWithData = dayKeys.length;
                var avgDailyRate = daysWithData > 0 ? totalHours / daysWithData : 0;

                // Find min/max
                var minVal = allValues.length > 0 ? Math.min.apply(null, allValues) : 0;
                var maxVal = allValues.length > 0 ? Math.max.apply(null, allValues) : 0;

                // Build report object
                var report = {
                    site:         site,
                    unit:         unit,
                    totalHours:   totalHours,
                    peakDay:      peakDay,
                    peakHours:    peakHours,
                    avgDailyRate: avgDailyRate,
                    minValue:     minVal,
                    maxValue:     maxVal,
                    recordCount:  recordedData.length,
                    timestamp:    MU.formatDate(new Date())
                };

                if (callback) callback(report);
            };

            // Call PI Web API to get recorded values (1000 = max values)
            self._api.getRecorded(webId, monthStart, monthEnd, 1000, getRecordedCallback);
        };

        // Resolve the attribute WebId
        MU.resolveAttributeWebId(site, hoursAttrName, resolveCallback);
    };


    // ═══════════════════════════════════════════════════════
    //  API-Backed Annual Summary
    // ═══════════════════════════════════════════════════════

    Mu20Reports.prototype._fetchAnnualSummary = function (site, callback) {
        var self = this;

        if (!self._api) {
            if (callback) callback(null);
            return;
        }

        var sites   = self._opts.sites || MU.SITES;
        var siteObj = null;
        for (var s = 0; s < sites.length; s++) {
            if (sites[s].id === site || sites[s].name === site) {
                siteObj = sites[s];
                break;
            }
        }

        if (!siteObj || !siteObj.units || !siteObj.units.length) {
            if (callback) callback(null);
            return;
        }

        // Aggregate 12 months for all units
        var unitCount      = siteObj.units.length;
        var completedUnits = 0;
        var unitSummaries  = [];

        var checkComplete = function () {
            completedUnits++;
            if (completedUnits === unitCount) {
                var annualReport = {
                    site:          site,
                    month:         new Date().getMonth() + 1,
                    year:          new Date().getFullYear(),
                    totalUnits:    unitCount,
                    unitSummaries: unitSummaries,
                    timestamp:     MU.formatDate(new Date())
                };
                if (callback) callback(annualReport);
            }
        };

        // Fetch 12 months of data for each unit
        for (var u = 0; u < unitCount; u++) {
            (function (unitIdx, unitName) {
                var monthlyReportCallback = function (monthlyData) {
                    if (monthlyData) {
                        unitSummaries.push(monthlyData);
                    }
                    checkComplete();
                };
                self._fetchMonthlyReport(site, unitName, unitIdx, monthlyReportCallback);
            })(u, siteObj.units[u]);
        }
    };


    // ═══════════════════════════════════════════════════════
    //  Enhanced CSV Export with PI Timestamps
    // ═══════════════════════════════════════════════════════

    Mu20Reports.prototype._exportCsvWithApi = function (callback) {
        var self = this;

        // If no API or no data, fall back to standard export
        if (!self._api || !self._reportRows || !self._reportRows.length) {
            if (callback) callback(null);
            self._exportCsv();
            return;
        }

        // Augment report rows with API-backed timestamps if available
        var enrichedRows = [];
        for (var i = 0; i < self._reportRows.length; i++) {
            var row = self._reportRows[i];
            var enrichedRow = {};
            for (var key in row) {
                if (row.hasOwnProperty(key)) {
                    enrichedRow[key] = row[key];
                }
            }
            if (!enrichedRow.timestamp) {
                enrichedRow.timestamp = MU.formatDate(new Date());
            }
            enrichedRows.push(enrichedRow);
        }

        var filename = 'mu20-report-api-' +
            MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv';
        MU.exportCsv(enrichedRows, filename);

        if (callback) callback(true);
    };


    // ═══════════════════════════════════════
    //  Plugin contract: update
    // ═══════════════════════════════════════

    /**
     * @param {Object} payload - canonical { rawSites, renderState, siteDefs, ts }
     *                           OR legacy { [siteId]: { [unitIdx]: {...} } }
     */
    Mu20Reports.prototype.update = function (payload) {
        if (this._destroyed) return;
        // Canonical payload normalization — reports needs rawSites
        this._opts.data = (payload && payload.rawSites) ? payload.rawSites : payload;
        // Store siteDefs (with owner info) and renderState (with siteHoursYtd)
        if (payload && payload.siteDefs) this._siteDefs = payload.siteDefs;
        if (payload && payload.renderState) this._renderState = payload.renderState;
        // Data updated — don't auto-regenerate preview;
        // user clicks "generate" to refresh.
    };


    // ═══════════════════════════════════════
    //  Plugin contract: onResize
    // ═══════════════════════════════════════

    Mu20Reports.prototype.onResize = function () {
        // SVG chart is width:100% and viewBox-based,
        // so it scales automatically. No action needed.
    };


    // ═══════════════════════════════════════
    //  Plugin contract: onTabActivated
    // ═══════════════════════════════════════

    Mu20Reports.prototype.onTabActivated = function () {
        // Optional — nothing needed on tab switch.
    };


    // ═══════════════════════════════════════
    //  Plugin contract: setOption
    // ═══════════════════════════════════════

    Mu20Reports.prototype.setOption = function (key, value) {
        if (this._destroyed) return;

        this._opts[key] = value;

        if (key === 'template') {
            this._updateTemplateBtns();
        } else if (key === 'api') {
            this._api = value;
        }
    };


    // ═══════════════════════════════════════
    //  Plugin contract: destroy
    // ═══════════════════════════════════════

    Mu20Reports.prototype.destroy = function () {
        var self = this;
        self._destroyed    = true;
        self._reportRows   = null;
        self._api          = null;
        self._siteDefs     = null;
        self._renderState  = null;

        // Clean up bus listeners
        if (self._bus) {
            if (self._apiReadyListener) {
                self._bus.off('api:ready', self._apiReadyListener);
                self._apiReadyListener = null;
            }
            if (self._dataListener) {
                self._bus.off('data:updated', self._dataListener);
                self._dataListener = null;
            }
            if (self._timeRangeListener) {
                self._bus.off('time:rangeChanged', self._timeRangeListener);
                self._timeRangeListener = null;
            }
        }

        // Tear down template button references
        self._templateBtns = {};
        self._groupSelect      = null;
        self._dateStartInput   = null;
        self._dateEndInput     = null;
        self._previewEl        = null;

        // Clear container
        _empty(self._container);
        self._container.classList.remove('mu20-reports-root');
    };


    // ═══════════════════════════════════════
    //  Year-over-Year (YoY)
    // ═══════════════════════════════════════

    Mu20Reports.prototype._fetchYoYData = function (callback) {
        var self = this;
        if (self._yoyCache) { callback(self._yoyCache); return; }
        if (self._yoyLoading) return;
        if (!self._api) { callback({}); return; }

        self._yoyLoading = true;
        var prevYear = new Date().getFullYear() - 1;
        var startTime = '01-Jan-' + prevYear;
        var endTime = '31-Dec-' + prevYear;
        var cache = {};
        var pending = 0;
        var sites = self._siteDefs || self._opts.sites || [];

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            for (var u = 0; u < site.units.length; u++) {
                var unitKey = site.id + '_u' + u;
                var rs = self._renderState && self._renderState[unitKey];
                if (!rs || !rs._hoursWebId) continue;
                pending++;
                (function (key, webId) {
                    self._api._get('/streams/' + encodeURIComponent(webId) +
                        '/recorded?startTime=' + encodeURIComponent(endTime) +
                        '&endTime=' + encodeURIComponent(endTime) +
                        '&maxCount=1&retrievalMode=AtOrBefore', function (err, data) {
                        if (!err && data && data.Items && data.Items.length) {
                            var val = data.Items[0].Value;
                            if (typeof val === 'number' && isFinite(val)) {
                                cache[key] = val;
                            }
                        }
                        pending--;
                        if (pending <= 0) {
                            self._yoyCache = cache;
                            self._yoyLoading = false;
                            callback(cache);
                        }
                    });
                })(unitKey, rs._hoursWebId);
            }
        }

        if (pending === 0) {
            self._yoyCache = cache;
            self._yoyLoading = false;
            callback(cache);
        }
    };


    // ═══════════════════════════════════════
    //  Saved Templates
    // ═══════════════════════════════════════

    Mu20Reports.prototype._buildTemplateBar = function () {
        var self = this;
        var bar = _el('div', 'mu20-rpt-template-bar');
        bar.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:8px;flex-wrap:wrap;';

        // Save button
        var saveBtn = _el('button', 'mu20-rpt-btn', '\uD83D\uDCBE \u05E9\u05DE\u05D5\u05E8 \u05EA\u05D1\u05E0\u05D9\u05EA');
        saveBtn.style.cssText = 'font-size:11px;padding:3px 8px;cursor:pointer;border:1px solid #30363d;background:#161b22;color:#c9d1d9;border-radius:4px;';
        saveBtn.addEventListener('click', function () { self._saveCurrentTemplate(); });
        bar.appendChild(saveBtn);

        // Template selector
        var select = _el('select', 'mu20-rpt-template-select');
        select.style.cssText = 'font-size:11px;padding:2px 6px;background:#161b22;color:#c9d1d9;border:1px solid #30363d;border-radius:4px;min-width:120px;';
        var defaultOpt = _el('option', '', '\u2014 \u05EA\u05D1\u05E0\u05D9\u05EA \u05E9\u05DE\u05D5\u05E8\u05D4 \u2014');
        defaultOpt.value = '';
        select.appendChild(defaultOpt);
        for (var i = 0; i < self._savedTemplates.length; i++) {
            var opt = _el('option', '', self._savedTemplates[i].name);
            opt.value = String(i);
            select.appendChild(opt);
        }
        select.addEventListener('change', function () {
            var idx = parseInt(select.value, 10);
            if (!isNaN(idx) && self._savedTemplates[idx]) {
                self._loadTemplate(self._savedTemplates[idx]);
            }
        });
        bar.appendChild(select);

        // Delete button
        var delBtn = _el('button', 'mu20-rpt-btn', '\u2715');
        delBtn.title = '\u05DE\u05D7\u05E7 \u05EA\u05D1\u05E0\u05D9\u05EA \u05E0\u05D1\u05D7\u05E8\u05EA';
        delBtn.style.cssText = 'font-size:11px;padding:3px 6px;cursor:pointer;border:1px solid #30363d;background:#161b22;color:#f85149;border-radius:4px;';
        delBtn.addEventListener('click', function () {
            var idx = parseInt(select.value, 10);
            if (!isNaN(idx)) self._deleteTemplate(idx);
        });
        bar.appendChild(delBtn);

        self._templateSelect = select;
        return bar;
    };

    Mu20Reports.prototype._saveCurrentTemplate = function () {
        if (this._savedTemplates.length >= this._maxTemplates) {
            alert('\u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD ' + this._maxTemplates + ' \u05EA\u05D1\u05E0\u05D9\u05D5\u05EA');
            return;
        }
        var name = prompt('\u05E9\u05DD \u05D4\u05EA\u05D1\u05E0\u05D9\u05EA:');
        if (!name || !name.replace(/^\s+|\s+$/g, '')) return;

        var tmpl = {
            id: 'tmpl_' + Date.now(),
            name: name.replace(/^\s+|\s+$/g, ''),
            reportType: this._opts.template || 'monthly',
            grouping: this._opts.grouping || 'site'
        };
        this._savedTemplates.push(tmpl);
        this._persistTemplates();
        this._refreshTemplateSelect();
    };

    Mu20Reports.prototype._loadTemplate = function (tmpl) {
        if (tmpl.reportType) {
            this._opts.template = tmpl.reportType;
            this._updateTemplateBtns();
        }
        if (tmpl.grouping && this._groupSelect) {
            this._groupSelect.value = tmpl.grouping;
            this._opts.grouping = tmpl.grouping;
        }
        this._generatePreview();
    };

    Mu20Reports.prototype._deleteTemplate = function (idx) {
        if (idx < 0 || idx >= this._savedTemplates.length) return;
        this._savedTemplates.splice(idx, 1);
        this._persistTemplates();
        this._refreshTemplateSelect();
    };

    Mu20Reports.prototype._persistTemplates = function () {
        if (this._onSaveTemplates) {
            this._onSaveTemplates(this._savedTemplates.slice());
        }
    };

    Mu20Reports.prototype._refreshTemplateSelect = function () {
        var select = this._templateSelect;
        if (!select) return;
        while (select.options.length > 1) select.remove(1);
        for (var i = 0; i < this._savedTemplates.length; i++) {
            var opt = _el('option', '', this._savedTemplates[i].name);
            opt.value = String(i);
            select.appendChild(opt);
        }
        select.value = '';
    };


    // ═══════════════════════════════════════
    //  Export
    // ═══════════════════════════════════════

    window.Mu20Reports = Mu20Reports;

})();
