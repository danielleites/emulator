/**
 * ═══════════════════════════════════════════════════════
 *  mu20-heatmap.js  —  Heatmap Tab Plugin (MU20)
 * ═══════════════════════════════════════════════════════
 *  Monthly color-coded matrix (units x months),
 *  metric selector, color scale, tooltip, click-through.
 *
 *  Ported from mm20-heatmap.js (jQuery widget -> vanilla ES5).
 *  Version: ULT.1.4  |  ES5 only
 *
 *  Plugin contract:
 *    constructor(shadowRoot, containerEl, options, bus)
 *    update(data)        — process new data snapshot
 *    onResize()          — redraw after container resize
 *    onTabActivated()    — redraw after display:none->block
 *    destroy()           — mandatory: cleanup everything
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-heatmap] MU20 core not loaded'); return; }

    var CACHE_TTL     = 60 * 60 * 1000;  // 1 hour
    var FETCH_MONTHLY = 365;
    var FETCH_DAYHOUR = 672;             // 4 * 7 * 24
    var TIP_DX = 10;

    // Hebrew day names (Sun-Sat) — used by _fetchDayHourData
    var DAYS_HE = [
        '\u05E8\u05D0\u05E9\u05D5\u05DF', '\u05E9\u05E0\u05D9',
        '\u05E9\u05DC\u05D9\u05E9\u05D9', '\u05E8\u05D1\u05D9\u05E2\u05D9',
        '\u05D7\u05DE\u05D9\u05E9\u05D9', '\u05E9\u05D9\u05E9\u05D9',
        '\u05E9\u05D1\u05EA'
    ];

    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════
    function Mu20Heatmap(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._bus       = bus || null;
        self._destroyed = false;

        // Options with defaults
        var defaults = {
            sites: null, data: null, demoMode: false,
            metric: 'hours', siteFilter: '', api: null
        };
        var opts = {}, key;
        for (key in defaults) {
            if (defaults.hasOwnProperty(key)) opts[key] = defaults[key];
        }
        var src = options || {};
        for (key in src) {
            if (src.hasOwnProperty(key)) opts[key] = src[key];
        }
        self._opts = opts;

        self._api             = opts.api || null;
        self._monthlyCache    = {};
        self._dayHourCache    = {};
        self._cacheTimestamps = {};
        self._gridEl       = null;
        self._tooltipEl    = null;
        self._metricSelect = null;
        self._siteInput    = null;
        self._onApiReady     = null;
        self._onSiteSelected = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('heatmap', 'constructor', e);
            MU.shield.renderFallback(self._container, 'heatmap', e);
        }
    }

    // ═══════════════════════════════════════
    //  _mount — build static DOM
    // ═══════════════════════════════════════
    Mu20Heatmap.prototype._mount = function () {
        var self = this;
        var c   = self._container;
        var bus = self._bus;
        c.classList.add('mu20-heatmap-root');

        // Bus: api:ready
        if (bus) {
            self._onApiReady = function (api) {
                if (api && !self._api) self._api = api;
            };
            bus.on('api:ready', self._onApiReady);
        }

        // ── Controls bar ──
        var controls = document.createElement('div');
        controls.className = 'mu20-hm-controls';

        var lbl1 = document.createElement('span');
        lbl1.textContent = '\u05DE\u05D3\u05D3:';
        controls.appendChild(lbl1);

        self._metricSelect = document.createElement('select');
        self._metricSelect.className = 'mu20-hm-select';
        var metricOpts = [
            { v: 'hours', t: '\u05E9\u05E2\u05D5\u05EA' },
            { v: 'quota', t: '\u05DE\u05DB\u05E1\u05D4' },
            { v: 'pct',   t: '% \u05E0\u05D9\u05E6\u05D5\u05DC' }
        ];
        for (var mi = 0; mi < metricOpts.length; mi++) {
            var o = document.createElement('option');
            o.value = metricOpts[mi].v;
            o.textContent = metricOpts[mi].t;
            self._metricSelect.appendChild(o);
        }
        self._metricSelect.value = self._opts.metric;
        self._metricSelect.addEventListener('change', function () {
            self._opts.metric = this.value;
            self._render();
        });
        controls.appendChild(self._metricSelect);

        var lbl2 = document.createElement('span');
        lbl2.style.marginRight = '16px';
        lbl2.textContent = '\u05E1\u05D9\u05E0\u05D5\u05DF:';
        controls.appendChild(lbl2);

        self._siteInput = document.createElement('input');
        self._siteInput.className   = 'mu20-search-input';
        self._siteInput.type        = 'text';
        self._siteInput.style.width = '120px';
        self._siteInput.placeholder = '\u05D4\u05DB\u05DC';
        self._siteInput.dir         = 'rtl';
        self._siteInput.value       = self._opts.siteFilter;
        self._siteInput.addEventListener('input', function () {
            self._opts.siteFilter = this.value;
            self._render();
        });
        controls.appendChild(self._siteInput);
        c.appendChild(controls);

        // ── Grid scroll container ──
        self._gridEl = document.createElement('div');
        self._gridEl.className      = 'mu20-hm-scroll';
        self._gridEl.style.overflow = 'auto';
        self._gridEl.style.flex     = '1';
        c.appendChild(self._gridEl);

        // ── Color legend ──
        var legend = document.createElement('div');
        legend.className = 'mu20-hm-legend';
        var sLow = document.createElement('span');
        sLow.textContent = '\u05E0\u05DE\u05D5\u05DA';
        legend.appendChild(sLow);
        var bar = document.createElement('div');
        bar.className = 'mu20-hm-legend-bar';
        legend.appendChild(bar);
        var sHi = document.createElement('span');
        sHi.textContent = '\u05D2\u05D1\u05D5\u05D4';
        legend.appendChild(sHi);
        c.appendChild(legend);

        // ── Tooltip ──
        self._tooltipEl = document.createElement('div');
        self._tooltipEl.className = 'mu20-tooltip';
        var ts = self._tooltipEl.style;
        ts.display = 'none'; ts.position = 'absolute'; ts.zIndex = '200';
        ts.background = '#0F2940'; ts.border = '1px solid #5BC0EB';
        ts.borderRadius = '4px'; ts.padding = '4px 8px';
        ts.fontSize = '11px'; ts.color = '#ECF0F1'; ts.pointerEvents = 'none';
        c.style.position = 'relative';
        c.appendChild(self._tooltipEl);

        // Bus: site:selected
        if (bus) {
            self._onSiteSelected = function (d) {
                self._opts.siteFilter = d.siteId;
                self._siteInput.value = d.siteId;
                self._render();
            };
            bus.on('site:selected', self._onSiteSelected);
        }

        self._render();
    };

    // ═══════════════════════════════════════
    //  _fetchMonthlyData  (12 months, cache 1h)
    // ═══════════════════════════════════════
    Mu20Heatmap.prototype._fetchMonthlyData = function (pctWebId, unitKey, callback) {
        var self = this;
        if (!self._api) return callback(null, []);

        var ck  = 'monthly_' + unitKey;
        var now = Date.now();
        if (self._monthlyCache[unitKey] && self._cacheTimestamps[ck] &&
            (now - self._cacheTimestamps[ck]) < CACHE_TTL) {
            return callback(null, self._monthlyCache[unitKey]);
        }

        self._api.getRecorded(pctWebId, '*-12mo', '*', FETCH_MONTHLY, function (err, records) {
            if (err) {
                MU.shield.log('heatmap', '_fetchMonthlyData', 'API error: ' + err);
                return callback(err, []);
            }
            var bins = {}, m;
            for (m = 0; m < 12; m++) bins[m] = { sum: 0, count: 0, avg: 0 };

            if (records && records.length) {
                for (var i = 0; i < records.length; i++) {
                    var rec = records[i];
                    if (!rec.Timestamp) continue;
                    var mo  = new Date(rec.Timestamp).getMonth();
                    var val = parseFloat(rec.Value);
                    if (!isNaN(val)) { bins[mo].sum += val; bins[mo].count++; }
                }
            }
            var result = [];
            for (m = 0; m < 12; m++) {
                var b = bins[m];
                if (b.count > 0) b.avg = b.sum / b.count;
                result.push({ month: m, value: b.avg, hours: b.avg,
                              quota: b.avg, pct: b.avg, count: b.count });
            }
            self._monthlyCache[unitKey] = result;
            self._cacheTimestamps[ck]   = now;
            callback(null, result);
        });
    };

    // ═══════════════════════════════════════
    //  _fetchDayHourData  (4 weeks, 7x24 grid)
    // ═══════════════════════════════════════
    Mu20Heatmap.prototype._fetchDayHourData = function (hoursWebId, unitKey, callback) {
        var self = this;
        if (!self._api) return callback(null, null);

        var ck  = 'dayHour_' + unitKey;
        var now = Date.now();
        if (self._dayHourCache[unitKey] && self._cacheTimestamps[ck] &&
            (now - self._cacheTimestamps[ck]) < CACHE_TTL) {
            return callback(null, self._dayHourCache[unitKey]);
        }

        self._api.getRecorded(hoursWebId, '*-4w', '*', FETCH_DAYHOUR, function (err, records) {
            if (err) {
                MU.shield.log('heatmap', '_fetchDayHourData', 'API error: ' + err);
                return callback(err, null);
            }
            var grid = [], d, h;
            for (d = 0; d < 7; d++) {
                grid[d] = [];
                for (h = 0; h < 24; h++) grid[d][h] = { sum: 0, count: 0, avg: 0 };
            }
            if (records && records.length) {
                for (var i = 0; i < records.length; i++) {
                    var rec = records[i];
                    if (!rec.Timestamp) continue;
                    var dt  = new Date(rec.Timestamp);
                    var dow = dt.getDay();
                    var hr  = dt.getHours();
                    var val = parseFloat(rec.Value);
                    if (!isNaN(val)) { grid[dow][hr].sum += val; grid[dow][hr].count++; }
                }
            }
            var matrix = [];
            for (d = 0; d < 7; d++) {
                matrix[d] = [];
                for (h = 0; h < 24; h++) {
                    var cell = grid[d][h];
                    if (cell.count > 0) cell.avg = cell.sum / cell.count;
                    matrix[d][h] = { day: d, hour: h, value: cell.avg, count: cell.count };
                }
            }
            self._dayHourCache[unitKey] = matrix;
            self._cacheTimestamps[ck]   = now;
            callback(null, matrix);
        });
    };

    // ═══════════════════════════════════════
    //  _render — build heatmap table
    // ═══════════════════════════════════════
    Mu20Heatmap.prototype._render = function () {
        var self   = this;
        var gridEl = self._gridEl;
        if (!gridEl || self._destroyed) return;

        while (gridEl.firstChild) gridEl.removeChild(gridEl.firstChild);

        var sites  = self._opts.sites || MU.SITES;
        var data   = self._opts.data;
        var metric = self._opts.metric;
        var filter = (self._opts.siteFilter || '').toLowerCase();

        if (!data && self._opts.demoMode) data = MU.demo.generateSites(sites);
        if (!data) {
            var ph = document.createElement('div');
            ph.className   = 'mu20-tags-placeholder';
            ph.textContent = '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD';
            gridEl.appendChild(ph);
            return;
        }

        // Build table
        var table = document.createElement('table');
        table.className = 'mu20-log-table';
        table.style.borderCollapse = 'separate';
        table.style.borderSpacing  = '2px';

        // Header — months
        var thead = document.createElement('thead');
        var htr   = document.createElement('tr');
        var thU   = document.createElement('th');
        thU.style.minWidth = '100px';
        thU.textContent    = '\u05D9\u05D7\u05D9\u05D3\u05D4';
        htr.appendChild(thU);
        for (var m = 0; m < 12; m++) {
            var thM = document.createElement('th');
            thM.style.width     = '30px';
            thM.style.textAlign = 'center';
            thM.style.fontSize  = '10px';
            thM.textContent     = MU.MONTHS_HE[m];
            htr.appendChild(thM);
        }
        thead.appendChild(htr);
        table.appendChild(thead);

        // Body — one row per unit
        var tbody     = document.createElement('tbody');
        var globalMax = self._getGlobalMax(sites, data, metric);

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            if (filter && site.id.toLowerCase().indexOf(filter) < 0 &&
                site.name.toLowerCase().indexOf(filter) < 0) continue;

            var sd = data[site.id];
            if (!sd) continue;

            for (var u = 0; u < site.units.length; u++) {
                var ud = sd[u];
                if (!ud) continue;

                var tr = document.createElement('tr');
                var tdN = document.createElement('td');
                tdN.style.fontSize   = '11px';
                tdN.style.whiteSpace = 'nowrap';
                tdN.textContent      = site.units[u];
                tr.appendChild(tdN);

                var monthly = ud.monthly || [];
                for (var mm = 0; mm < 12; mm++) {
                    var val   = self._getMetricValue(monthly[mm], ud, metric);
                    var color = self._valueToColor(val, globalMax);
                    var td = document.createElement('td');
                    td.className        = 'mu20-hm-cell';
                    td.style.background = color;
                    td.style.cursor     = 'pointer';
                    td.setAttribute('data-val',   val);
                    td.setAttribute('data-unit',  site.units[u]);
                    td.setAttribute('data-month', MU.MONTHS_HE[mm]);
                    self._attachCellEvents(td, val, site.units[u],
                                           MU.MONTHS_HE[mm], site.id, u);
                    tr.appendChild(td);
                }
                tbody.appendChild(tr);
            }
        }
        table.appendChild(tbody);
        gridEl.appendChild(table);
    };

    // ─────────────────────────────────────
    //  _attachCellEvents — tooltip + click-through
    // ─────────────────────────────────────
    Mu20Heatmap.prototype._attachCellEvents = function (td, val, unitName, monthName, siteId, unitIdx) {
        var self = this;
        td.addEventListener('mouseenter', function (e) {
            var r = self._container.getBoundingClientRect();
            self._tooltipEl.textContent   = unitName + ' | ' + monthName + ': ' + MU.formatNum(val, 0);
            self._tooltipEl.style.left    = (e.clientX - r.left + TIP_DX) + 'px';
            self._tooltipEl.style.top     = (e.clientY - r.top - 20) + 'px';
            self._tooltipEl.style.display = '';
        });
        td.addEventListener('mousemove', function (e) {
            var r = self._container.getBoundingClientRect();
            self._tooltipEl.style.left = (e.clientX - r.left + TIP_DX) + 'px';
            self._tooltipEl.style.top  = (e.clientY - r.top - 20) + 'px';
        });
        td.addEventListener('mouseleave', function () {
            self._tooltipEl.style.display = 'none';
        });
        td.addEventListener('click', function () {
            if (self._bus) {
                self._bus.emit('unit:selected', { siteId: siteId, unitIdx: unitIdx });
                self._bus.emit('tab:changed',   { tab: 'realtime' });
            }
        });
    };

    // ═══════════════════════════════════════
    //  _getMetricValue
    // ═══════════════════════════════════════
    Mu20Heatmap.prototype._getMetricValue = function (monthEntry, unitData, metric) {
        if (!monthEntry && !unitData) return 0;
        if (monthEntry) {
            if (metric === 'hours' && monthEntry.hours !== undefined) return monthEntry.hours;
            if (metric === 'quota' && monthEntry.quota !== undefined) return monthEntry.quota;
            if (metric === 'pct'   && monthEntry.pct   !== undefined) return monthEntry.pct;
            if (monthEntry.value !== undefined) return monthEntry.value;
        }
        if (unitData) {
            if (metric === 'hours') return unitData.hours || 0;
            if (metric === 'quota') return unitData.quota || 0;
            if (metric === 'pct')   return unitData.pct   || 0;
        }
        return 0;
    };

    // ═══════════════════════════════════════
    //  _getGlobalMax — normalize color scale
    // ═══════════════════════════════════════
    Mu20Heatmap.prototype._getGlobalMax = function (sites, data, metric) {
        var self = this, max = 1;
        for (var s = 0; s < sites.length; s++) {
            var sd = data[sites[s].id];
            if (!sd) continue;
            for (var u = 0; u < sites[s].units.length; u++) {
                var ud = sd[u];
                if (!ud) continue;
                var monthly = ud.monthly || [];
                for (var m = 0; m < monthly.length; m++) {
                    var v = self._getMetricValue(monthly[m], ud, metric);
                    if (v > max) max = v;
                }
            }
        }
        return max;
    };

    // ═══════════════════════════════════════
    //  _valueToColor — green->yellow->red
    // ═══════════════════════════════════════
    Mu20Heatmap.prototype._valueToColor = function (val, max) {
        if (max <= 0) return 'rgba(255,255,255,0.1)';
        var ratio = Math.min(val / max, 1);
        var r, g, b, t;
        if (ratio < 0.5) {
            t = ratio * 2;
            r = Math.round(46  + (243 - 46)  * t);
            g = Math.round(204 + (156 - 204) * t);
            b = Math.round(113 + (18  - 113) * t);
        } else {
            t = (ratio - 0.5) * 2;
            r = Math.round(243 + (231 - 243) * t);
            g = Math.round(156 + (76  - 156) * t);
            b = Math.round(18  + (60  - 18)  * t);
        }
        return 'rgb(' + r + ',' + g + ',' + b + ')';
    };

    // ═══════════════════════════════════════
    //  Public API
    // ═══════════════════════════════════════

    /** Receive new data snapshot and re-render. */
    /**
     * @param {Object} payload - canonical { rawSites, renderState, siteDefs, ts }
     *                           OR legacy { [siteId]: { [unitIdx]: {...} } }
     */
    Mu20Heatmap.prototype.update = function (payload) {
        if (this._destroyed) return;
        if (payload !== undefined) {
            // Canonical payload normalization — heatmap needs rawSites
            this._opts.data = payload.rawSites || payload;
        }
        this._render();
    };

    /** Update a single option; re-render if relevant. */
    Mu20Heatmap.prototype.setOption = function (key, value) {
        var self = this;
        self._opts[key] = value;
        if (key === 'api' && value) self._api = value;
        if (key === 'data' || key === 'metric' || key === 'siteFilter') self._render();
        if (key === 'metric' && self._metricSelect) self._metricSelect.value = value;
        if (key === 'siteFilter' && self._siteInput) self._siteInput.value = value;
    };

    /** Redraw after container resize. */
    Mu20Heatmap.prototype.onResize = function () {
        if (!this._destroyed) this._render();
    };

    /** Redraw after display:none -> block. */
    Mu20Heatmap.prototype.onTabActivated = function () {
        if (!this._destroyed) this._render();
    };

    // ═══════════════════════════════════════
    //  destroy — mandatory full cleanup
    // ═══════════════════════════════════════
    Mu20Heatmap.prototype.destroy = function () {
        var self = this;
        self._destroyed = true;

        var bus = self._bus;
        if (bus) {
            if (self._onSiteSelected) bus.off('site:selected', self._onSiteSelected);
            if (self._onApiReady)     bus.off('api:ready',      self._onApiReady);
        }

        self._api = null;
        self._monthlyCache    = null;
        self._dayHourCache    = null;
        self._cacheTimestamps = null;
        self._onApiReady      = null;
        self._onSiteSelected  = null;

        if (self._tooltipEl && self._tooltipEl.parentNode) {
            self._tooltipEl.parentNode.removeChild(self._tooltipEl);
        }
        self._tooltipEl = null;

        var c = self._container;
        if (c) {
            while (c.firstChild) c.removeChild(c.firstChild);
            c.classList.remove('mu20-heatmap-root');
        }
        self._gridEl       = null;
        self._metricSelect = null;
        self._siteInput    = null;
        self._container    = null;
        self._shadow       = null;
        self._bus           = null;
    };

    // ═══════════════════════════════════════
    //  Export
    // ═══════════════════════════════════════
    window.Mu20Heatmap = Mu20Heatmap;

})();
