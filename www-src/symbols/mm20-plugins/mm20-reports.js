/**
 * ═══════════════════════════════════════════════════════
 *  mm20-reports.js  —  Reports Tab Widget
 * ═══════════════════════════════════════════════════════
 *  Report generator: template selector, HTML preview,
 *  PDF via window.print(), CSV export.
 *
 *  jQuery widget: mm20.reports
 *  Version: 20.0.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-reports] MM20 core not loaded'); return; }

    $.widget('mm20.mm20Reports', {

        options: {
            bus:      null,
            sites:    null,
            data:     null,
            api:      null,    // MM20.PIWebAPI instance
            demoMode: false,
            template: 'monthly',
            grouping: 'site',
            dateStart: '',   // D4: date range start (yyyy-mm-dd)
            dateEnd:   '',   // D4: date range end
            // QA11: time sync & auto-refresh
            autoRefresh: false,          // auto-regenerate preview on data/time change
            syncSelection: false,        // filter reports by site/unit from main screen
            syncWithDisplayTime: false,  // accept time range from orchestrator
            selectedSiteId: '',
            selectedSiteName: '',
            selectedUnitIdx: -1,
            selectedUnitName: ''
        },

        _destroyed: false,
        _api: null,            // API instance reference
        _apiReadyListener: null, // Track bus listener for cleanup
        // QA11: bus listeners for time/selection sync
        _timeRangeListener: null,
        _siteSelectedListener: null,
        _unitSelectedListener: null,
        _refreshTimer: null,

        // ═══════════════════════════════════════
        //  _create
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;
            self._api = self.options.api || null;

            try {
                // Set up API ready listener if bus is available
                if (self.options.bus && !self._api) {
                    self._apiReadyListener = function (apiInstance) {
                        self._api = apiInstance;
                    };
                    self.options.bus.on('api:ready', self._apiReadyListener);
                }

                // QA11: Listen for time range and selection changes
                if (self.options.bus) {
                    self._timeRangeListener = function (range) {
                        if (!self.options.syncWithDisplayTime) return;
                        self._applyTimeRange(range.start, range.end);
                    };
                    self.options.bus.on('time:rangeChanged', self._timeRangeListener);

                    self._siteSelectedListener = function (site) {
                        if (!self.options.syncSelection) return;
                        self.options.selectedSiteId = site.id || '';
                        self.options.selectedSiteName = site.name || '';
                        self._scheduleRefresh();
                    };
                    self.options.bus.on('site:selected', self._siteSelectedListener);

                    self._unitSelectedListener = function (unit) {
                        if (!self.options.syncSelection) return;
                        self.options.selectedUnitIdx = unit.idx !== undefined ? unit.idx : -1;
                        self.options.selectedUnitName = unit.name || '';
                        self._scheduleRefresh();
                    };
                    self.options.bus.on('unit:selected', self._unitSelectedListener);
                }

                var el = self.element;
                el.addClass('mm20-reports-root');

                // ── Layout: sidebar + preview ──
                var panel = $('<div class="mm20-report-panel"></div>');

                // Sidebar
                var sidebar = $('<div class="mm20-report-sidebar"></div>');
                sidebar.append($('<div style="font-weight:600; margin-bottom:8px;">\u05EA\u05D1\u05E0\u05D9\u05EA \u05D3\u05D5\u05D7</div>'));

                // Template buttons
                var templates = MM.REPORT_TEMPLATES || [];
                self._templateBtns = {};
                for (var i = 0; i < templates.length; i++) {
                    (function (tmpl) {
                        var btn = $('<button class="mm20-report-btn"></button>').text(tmpl.name);
                        if (self.options.template === tmpl.id) btn.addClass('mm20-report-btn--active');
                        btn.on('click', function () {
                            self.options.template = tmpl.id;
                            self._updateTemplateBtns();
                            self._generatePreview();
                        });
                        self._templateBtns[tmpl.id] = btn;
                        sidebar.append(btn);
                    })(templates[i]);
                }

                // Grouping selector
                sidebar.append($('<div style="font-weight:600; margin-top:12px; margin-bottom:4px;">\u05E7\u05D9\u05D1\u05D5\u05E5</div>'));
                self._groupSelect = $('<select class="mm20-hm-select" style="width:100%;"></select>');
                var groups = MM.GROUPING_OPTIONS || [];
                for (var g = 0; g < groups.length; g++) {
                    self._groupSelect.append($('<option></option>').val(groups[g].id).text(groups[g].name));
                }
                self._groupSelect.val(self.options.grouping);
                self._groupSelect.on('change', function () {
                    self.options.grouping = this.value;
                    self._generatePreview();
                });
                sidebar.append(self._groupSelect);

                // D4: Date range picker
                sidebar.append($('<div style="font-weight:600; margin-top:12px; margin-bottom:4px;">\u05D8\u05D5\u05D5\u05D7 \u05EA\u05D0\u05E8\u05D9\u05DB\u05D9\u05DD</div>'));
                var dateWrap = $('<div class="mm20-report-date-range"></div>');
                // Default: last 30 days
                var now = new Date();
                var thirtyAgo = new Date(now.getTime() - 30 * 86400000);
                var defStart = self.options.dateStart || (thirtyAgo.getFullYear() + '-' + ('0' + (thirtyAgo.getMonth() + 1)).slice(-2) + '-' + ('0' + thirtyAgo.getDate()).slice(-2));
                var defEnd = self.options.dateEnd || (now.getFullYear() + '-' + ('0' + (now.getMonth() + 1)).slice(-2) + '-' + ('0' + now.getDate()).slice(-2));

                self._dateStart = $('<input class="mm20-search-input" type="date" dir="ltr" style="width:100%;" />').val(defStart);
                self._dateEnd = $('<input class="mm20-search-input" type="date" dir="ltr" style="width:100%; margin-top:4px;" />').val(defEnd);
                dateWrap.append($('<label style="font-size:10px; color:#8899AA;">\u05DE:</label>'));
                dateWrap.append(self._dateStart);
                dateWrap.append($('<label style="font-size:10px; color:#8899AA; margin-top:2px;">\u05E2\u05D3:</label>'));
                dateWrap.append(self._dateEnd);
                sidebar.append(dateWrap);

                // QA11: Emit time range on manual date change
                self._dateStart.on('change', function () {
                    self.options.dateStart = self._dateStart.val();
                    if (self.options.bus) {
                        self.options.bus.emit('time:rangeChanged', {
                            start: self.options.dateStart,
                            end: self.options.dateEnd || self._dateEnd.val()
                        });
                    }
                    self._scheduleRefresh();
                });
                self._dateEnd.on('change', function () {
                    self.options.dateEnd = self._dateEnd.val();
                    if (self.options.bus) {
                        self.options.bus.emit('time:rangeChanged', {
                            start: self.options.dateStart || self._dateStart.val(),
                            end: self.options.dateEnd
                        });
                    }
                    self._scheduleRefresh();
                });

                // Action buttons
                sidebar.append($('<div style="margin-top:12px;"></div>'));

                var genBtn = $('<button class="mm20-report-btn" style="background:var(--mm20-accent,#5BC0EB); color:#000; font-weight:600;">\u05D9\u05E6\u05E8 \u05D3\u05D5\u05D7</button>');
                genBtn.on('click', function () { self._generatePreview(); });
                sidebar.append(genBtn);

                var csvBtn = $('<button class="mm20-report-btn">\u05D9\u05E6\u05D5\u05D0 CSV</button>');
                csvBtn.on('click', function () { self._exportCsv(); });
                sidebar.append(csvBtn);

                var pdfBtn = $('<button class="mm20-report-btn">\u05D9\u05E6\u05D5\u05D0 PDF</button>');
                pdfBtn.on('click', function () { self._exportPdf(); });
                sidebar.append(pdfBtn);

                panel.append(sidebar);

                // Preview area
                self._previewEl = $('<div class="mm20-report-preview"></div>');
                self._previewEl.html('<div class="mm20-tags-placeholder">\u05D1\u05D7\u05E8 \u05EA\u05D1\u05E0\u05D9\u05EA \u05D5\u05DC\u05D7\u05E5 "\u05D9\u05E6\u05E8 \u05D3\u05D5\u05D7"</div>');
                panel.append(self._previewEl);

                el.append(panel);

            } catch (e) {
                MM.shield.log('reports', '_create', e);
                MM.shield.renderFallback(self.element, 'reports', e);
            }
        },


        // ─────────────────────────────────────
        //  Generate report preview
        // ─────────────────────────────────────

        _generatePreview: function () {
            var self = this;
            var sites = self.options.sites || MM.SITES;

            // QA11: Filter by selected site if syncSelection is enabled
            if (self.options.syncSelection && self.options.selectedSiteId) {
                sites = sites.filter(function (s) {
                    return s.id === self.options.selectedSiteId;
                });
            }

            var data = self.options.data;

            if (!data && self.options.demoMode) {
                data = MM.demo.generateSites(sites);
            }
            if (!data) {
                self._previewEl.html('<div class="mm20-tags-placeholder">\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D3\u05D5\u05D7</div>');
                return;
            }

            // E1: Use template-specific columns
            var cols = self._getTemplateCols();
            var grouping = self.options.grouping;
            var now = MM.formatDate(new Date());

            // D4: Read date range from inputs
            if (self._dateStart) self.options.dateStart = self._dateStart.val();
            if (self._dateEnd) self.options.dateEnd = self._dateEnd.val();

            // Build report rows (E3: use N-1 builder for contingency template)
            var rows;
            if (self.options.template === 'n1contingency') {
                rows = self._buildN1Rows(sites, data);
            } else {
                rows = self._buildRows(sites, data);
            }

            // Group rows
            if (grouping !== 'site') {
                rows = self._groupRows(rows, grouping);
            }

            // Build HTML table
            var html = '<div dir="rtl" style="font-family:inherit;">';
            html += '<h3 style="margin:0 0 8px;">\u05D3\u05D5\u05D7 ' + self._getTemplateName() + '</h3>';
            html += '<p style="font-size:10px; color:#8899AA;">\u05E0\u05D5\u05E6\u05E8: ' + now + '</p>';
            html += '<table class="mm20-log-table" style="width:100%;">';
            html += '<thead><tr>';
            for (var c = 0; c < cols.length; c++) {
                html += '<th>' + MM.escapeHtml(cols[c].label || cols[c].id) + '</th>';
            }
            html += '</tr></thead><tbody>';

            for (var r = 0; r < rows.length; r++) {
                html += '<tr>';
                for (var cc = 0; cc < cols.length; cc++) {
                    var val = rows[r][cols[cc].id];
                    html += '<td>' + MM.escapeHtml(val !== undefined ? String(val) : '--') + '</td>';
                }
                html += '</tr>';
            }

            html += '</tbody></table>';

            // D5: SVG capacity bar chart
            html += self._buildSvgChart(sites, data);

            html += '</div>';
            self._previewEl.html(html);

            // Store for export
            self._reportRows = rows;
        },

        _buildRows: function (sites, data) {
            var rows = [];
            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = data[site.id];
                if (!siteData) continue;

                for (var u = 0; u < site.units.length; u++) {
                    var ud = siteData[u];
                    rows.push({
                        site:   site.name,
                        unit:   site.units[u],
                        status: ud ? (MM.STATUS_LABELS[ud.status] || ud.status || '--') : '--',
                        hours:  ud ? MM.formatNum(ud.hours, 0) : '--',
                        quota:  ud ? MM.formatNum(ud.quota, 0) : '--',
                        pct:    ud ? MM.formatNum(ud.pct, 1) + '%' : '--',
                        fuel:   site.fuel,
                        region: site.region
                    });
                }
            }
            return rows;
        },

        _groupRows: function (rows, grouping) {
            // Sort rows by grouping key (slice to avoid mutating original)
            rows = rows.slice().sort(function (a, b) {
                var ka = a[grouping] || '';
                var kb = b[grouping] || '';
                return ka.localeCompare(kb);
            });
            return rows;
        },

        _getTemplateName: function () {
            var templates = MM.REPORT_TEMPLATES || [];
            for (var i = 0; i < templates.length; i++) {
                if (templates[i].id === this.options.template) return templates[i].name;
            }
            return this.options.template;
        },


        // ─────────────────────────────────────
        //  D5: SVG capacity bar chart
        // ─────────────────────────────────────

        _buildSvgChart: function (sites, data) {
            if (!data) return '';

            var barH = 18;
            var gap = 4;
            var maxW = 300;
            var labels = [];
            var values = [];
            var maxVal = 1;

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var sd = data[site.id];
                if (!sd) continue;
                var totalPct = 0;
                var cnt = 0;
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
            var svg = '<div style="margin-top:12px;">' +
                '<div style="font-weight:600; margin-bottom:4px;">\u05E0\u05D9\u05E6\u05D5\u05DC \u05E7\u05D9\u05D1\u05D5\u05DC\u05EA \u05DC\u05E4\u05D9 \u05D0\u05EA\u05E8</div>' +
                '<svg width="100%" height="' + svgH + '" viewBox="0 0 420 ' + svgH + '" style="font-size:10px; font-family:inherit;">';

            for (var i = 0; i < labels.length; i++) {
                var y = i * (barH + gap) + 10;
                var w = maxVal > 0 ? Math.round((values[i] / maxVal) * maxW) : 0;
                var color = values[i] >= 90 ? '#E74C3C' : (values[i] >= 70 ? '#F39C12' : '#2ECC71');

                svg += '<text x="415" y="' + (y + 13) + '" text-anchor="end" fill="#8899AA">' + MM.escapeHtml(labels[i]) + '</text>';
                svg += '<rect x="5" y="' + y + '" width="' + w + '" height="' + barH + '" rx="2" fill="' + color + '" opacity="0.8" />';
                svg += '<text x="' + (w + 10) + '" y="' + (y + 13) + '" fill="#ECF0F1" font-size="10">' + MM.formatNum(values[i], 1) + '%</text>';
            }

            svg += '</svg></div>';
            return svg;
        },


        // ─────────────────────────────────────
        //  E1: Template-specific column sets
        // ─────────────────────────────────────

        _getTemplateCols: function () {
            var tmpl = this.options.template;
            var cols = MM.REPORT_COLS || [];

            // Template column mapping
            var templateCols = {
                daily:   ['site', 'unit', 'hours', 'quota', 'pct', 'status'],
                weekly:  ['site', 'unit', 'hours', 'pct', 'status'],
                monthly: null,  // null = all default cols
                fuel:    ['site', 'fuel', 'hours', 'pct']
            };

            var allowed = templateCols[tmpl];
            if (!allowed) return cols;  // show all

            var filtered = [];
            for (var i = 0; i < cols.length; i++) {
                if (allowed.indexOf(cols[i].id) >= 0) {
                    filtered.push(cols[i]);
                }
            }
            return filtered.length ? filtered : cols;
        },


        // ─────────────────────────────────────
        //  Update template buttons
        // ─────────────────────────────────────

        _updateTemplateBtns: function () {
            var active = this.options.template;
            for (var key in this._templateBtns) {
                if (this._templateBtns.hasOwnProperty(key)) {
                    this._templateBtns[key].toggleClass('mm20-report-btn--active', key === active);
                }
            }
        },


        // ─────────────────────────────────────
        //  E3: N-1 Contingency Report Builder
        // ─────────────────────────────────────

        _buildN1Rows: function (sites, data) {
            var rows = [];
            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = data[site.id];
                if (!siteData) continue;

                // Find largest unit hours
                var maxHours = 0;
                var maxUnit = '';
                var totalHours = 0;
                for (var u = 0; u < site.units.length; u++) {
                    var ud = siteData[u];
                    if (!ud) continue;
                    totalHours += (ud.hours || 0);
                    if ((ud.hours || 0) > maxHours) {
                        maxHours = ud.hours || 0;
                        maxUnit = site.units[u];
                    }
                }
                var remaining = totalHours - maxHours;
                var remainPct = totalHours > 0 ? Math.round((remaining / totalHours) * 100) : 0;
                var risk = remainPct < 50 ? '\u05D2\u05D1\u05D5\u05D4' : (remainPct < 75 ? '\u05D1\u05D9\u05E0\u05D5\u05E0\u05D9' : '\u05E0\u05DE\u05D5\u05DA');

                rows.push({
                    site: site.name,
                    unit: maxUnit + ' (\u05D2\u05D3\u05D5\u05DC \u05D1\u05D9\u05D5\u05EA\u05E8)',
                    hours: MM.formatNum(maxHours, 0),
                    quota: MM.formatNum(remaining, 0),
                    pct: remainPct + '%',
                    status: risk
                });
            }
            return rows;
        },


        // ─────────────────────────────────────
        //  Export CSV
        // ─────────────────────────────────────

        _exportCsv: function () {
            if (!this._reportRows || !this._reportRows.length) {
                this._generatePreview();
            }
            if (this._reportRows) {
                MM.exportCsv(this._reportRows, 'mm20-report-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
            }
        },


        // ─────────────────────────────────────
        //  Export PDF (via print dialog)
        // ─────────────────────────────────────

        _exportPdf: function () {
            if (!this._previewEl) return;

            // Open print-friendly window with report content.
            // Stage 7 tech-debt cleanup: replaced `printWin.document.write(...)`
            // with a Blob URL navigation. document.write is SPA-unsafe and
            // was one of the four call sites flagged in the security plan.
            var printWin = window.open('', '_blank', 'width=800,height=600');
            if (!printWin) return;

            var content = this._previewEl.html();
            var html =
                '<!DOCTYPE html><html dir="rtl"><head><meta charset="UTF-8">' +
                '<title>\u05D3\u05D5\u05D7 \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA</title>' +
                '<style>' +
                'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12px; direction: rtl; padding: 20px; }' +
                'table { width: 100%; border-collapse: collapse; }' +
                'th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: right; }' +
                'th { background: #f0f0f0; font-weight: 600; }' +
                '</style></head><body>' + content + '</body></html>';
            var blob = new Blob([html], { type: 'text/html' });
            var url = URL.createObjectURL(blob);
            printWin.location.href = url;
            printWin.addEventListener('load', function () {
                try { printWin.focus(); printWin.print(); } catch (e) {}
                setTimeout(function () { try { URL.revokeObjectURL(url); } catch (e) {} }, 5000);
            });
        },


        // ─────────────────────────────────────
        //  QA11: Apply time range from bus
        // ─────────────────────────────────────

        _applyTimeRange: function (start, end) {
            var self = this;
            if (start && self._dateStart) {
                var d = start instanceof Date ? start : new Date(start);
                if (!isNaN(d.getTime())) {
                    var s = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
                    self._dateStart.val(s);
                    self.options.dateStart = s;
                }
            }
            if (end && self._dateEnd) {
                var d2 = end instanceof Date ? end : new Date(end);
                if (!isNaN(d2.getTime())) {
                    var e = d2.getFullYear() + '-' + ('0' + (d2.getMonth() + 1)).slice(-2) + '-' + ('0' + d2.getDate()).slice(-2);
                    self._dateEnd.val(e);
                    self.options.dateEnd = e;
                }
            }
            self._scheduleRefresh();
        },


        // ─────────────────────────────────────
        //  QA11: Debounced refresh (250ms)
        // ─────────────────────────────────────

        _scheduleRefresh: function () {
            var self = this;
            if (!self.options.autoRefresh) return;
            if (self._refreshTimer) clearTimeout(self._refreshTimer);
            self._refreshTimer = setTimeout(function () {
                self._refreshTimer = null;
                if (!self._destroyed) self._generatePreview();
            }, 250);
        },


        // ═══════════════════════════════════════
        //  _setOption
        // ═══════════════════════════════════════

        _setOption: function (key, value) {
            this._super(key, value);

            if (key === 'data') {
                // QA11: auto-refresh on data update (debounced)
                this._scheduleRefresh();
            } else if (key === 'template') {
                this._updateTemplateBtns();
                this._scheduleRefresh();
            } else if (key === 'grouping') {
                this._scheduleRefresh();
            } else if (key === 'api') {
                this._api = value;
            }
        },


        // ═══════════════════════════════════════
        //  _destroy
        // ═══════════════════════════════════════

        _destroy: function () {
            var self = this;
            self._destroyed = true;
            self._reportRows = null;
            self._api = null;

            // Clean up all bus listeners
            if (self.options.bus) {
                if (self._apiReadyListener) {
                    self.options.bus.off('api:ready', self._apiReadyListener);
                    self._apiReadyListener = null;
                }
                if (self._timeRangeListener) {
                    self.options.bus.off('time:rangeChanged', self._timeRangeListener);
                    self._timeRangeListener = null;
                }
                if (self._siteSelectedListener) {
                    self.options.bus.off('site:selected', self._siteSelectedListener);
                    self._siteSelectedListener = null;
                }
                if (self._unitSelectedListener) {
                    self.options.bus.off('unit:selected', self._unitSelectedListener);
                    self._unitSelectedListener = null;
                }
            }

            // Clear refresh debounce timer
            if (self._refreshTimer) {
                clearTimeout(self._refreshTimer);
                self._refreshTimer = null;
            }

            self.element.empty().removeClass('mm20-reports-root');
        },


        // ═══════════════════════════════════════════════════════
        //  API-Backed Monthly Report
        // ═══════════════════════════════════════════════════════

        _fetchMonthlyReport: function (site, unit, unitIdx, callback) {
            var self = this;

            // If no API available, return null callback
            if (!self._api) {
                if (callback) callback(null);
                return;
            }

            // Get the hours attribute WebId for this unit
            var hoursAttrName = unit + '_Hours';  // or whatever naming convention
            var resolveCallback = function (webId) {
                if (!webId) {
                    if (callback) callback(null);
                    return;
                }

                // QA11: Use actual date range from inputs (not hardcoded current month)
                var monthStart, monthEnd;
                if (self.options.dateStart) {
                    monthStart = new Date(self.options.dateStart + 'T00:00:00');
                } else {
                    var nowS = new Date();
                    monthStart = new Date(nowS.getFullYear(), nowS.getMonth(), 1);
                }
                if (self.options.dateEnd) {
                    monthEnd = new Date(self.options.dateEnd + 'T23:59:59');
                } else {
                    var nowE = new Date();
                    monthEnd = new Date(nowE.getFullYear(), nowE.getMonth() + 1, 0, 23, 59, 59);
                }

                // Fetch recorded values for this month
                var getRecordedCallback = function (recordedData) {
                    if (!recordedData || !recordedData.length) {
                        if (callback) callback(null);
                        return;
                    }

                    // Calculate metrics from recorded data
                    var totalHours = 0;
                    var dailyHours = {};
                    var allValues = [];

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
                    var peakDay = '';
                    var peakHours = 0;
                    for (var day in dailyHours) {
                        if (dailyHours.hasOwnProperty(day) && dailyHours[day] > peakHours) {
                            peakHours = dailyHours[day];
                            peakDay = day;
                        }
                    }

                    // Calculate daily average
                    var daysWithData = Object.keys(dailyHours).length;
                    var avgDailyRate = daysWithData > 0 ? totalHours / daysWithData : 0;

                    // Find min/max
                    var minVal = allValues.length > 0 ? Math.min.apply(null, allValues) : 0;
                    var maxVal = allValues.length > 0 ? Math.max.apply(null, allValues) : 0;

                    // Build report object
                    var report = {
                        site: site,
                        unit: unit,
                        totalHours: totalHours,
                        peakDay: peakDay,
                        peakHours: peakHours,
                        avgDailyRate: avgDailyRate,
                        minValue: minVal,
                        maxValue: maxVal,
                        recordCount: recordedData.length,
                        timestamp: MM.formatDate(new Date())
                    };

                    if (callback) callback(report);
                };

                // Call PI Web API to get recorded values (5000 max for full date range)
                self._api.getRecorded(webId, monthStart, monthEnd, 5000, getRecordedCallback);
            };

            // Resolve the attribute WebId
            MM.resolveAttributeWebId(site, hoursAttrName, resolveCallback);
        },


        // ═══════════════════════════════════════════════════════
        //  API-Backed Annual Summary
        // ═══════════════════════════════════════════════════════

        _fetchAnnualSummary: function (site, callback) {
            var self = this;

            // If no API available, return null callback
            if (!self._api) {
                if (callback) callback(null);
                return;
            }

            var sites = self.options.sites || MM.SITES;
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
            var unitCount = siteObj.units.length;
            var completedUnits = 0;
            var unitSummaries = [];

            var checkComplete = function () {
                completedUnits++;
                if (completedUnits === unitCount) {
                    // All units processed - build annual summary
                    var annualReport = {
                        site: site,
                        month: new Date().getMonth() + 1,
                        year: new Date().getFullYear(),
                        totalUnits: unitCount,
                        unitSummaries: unitSummaries,
                        timestamp: MM.formatDate(new Date())
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
        },


        // ═══════════════════════════════════════════════════════
        //  Enhanced CSV Export with PI Timestamps
        // ═══════════════════════════════════════════════════════

        _exportCsvWithApi: function (callback) {
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
                // Add timestamp field if not present
                if (!enrichedRow.timestamp) {
                    enrichedRow.timestamp = MM.formatDate(new Date());
                }
                enrichedRows.push(enrichedRow);
            }

            var filename = 'mm20-report-api-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv';
            MM.exportCsv(enrichedRows, filename);

            if (callback) callback(true);
        }
    });

})(window.jQuery);
