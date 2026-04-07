/**
 * ================================================================
 *  mu20-forecast.js  --  3-Tier Quota Depletion Forecast Plugin
 * ================================================================
 *  Displays per-unit forecast table, Canvas chart with cumulative
 *  consumption projection, and TTE (Time To Exhaustion) countdown.
 *
 *  Forecast tiers (computed by Worker):
 *    Tier A  Seasonal blend (LY profile weights)
 *    Tier B  Linear regression on this-year monthly[]
 *    Tier C  Simple daily-rate fallback
 *
 *  Ported from MM20 forecast panel (jQuery --> vanilla ES5).
 *  Version : ULT.1.4  |  ES5 only
 * ================================================================
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-forecast] MU20 core not loaded'); return; }

    // ── Constants ──────────────────────────────────────

    var COLORS = [
        '#4ECDC4', '#FF6B6B', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
    ];

    var URGENCY = {
        critical: { cls: 'mu20-fc-badge--critical', color: '#EB5757', threshold: 30 },
        warning:  { cls: 'mu20-fc-badge--warning',  color: '#F2994A', threshold: 90 },
        ok:       { cls: 'mu20-fc-badge--ok',        color: '#6FCF97', threshold: Infinity }
    };

    var CHART_BG      = '#1a1a2e';
    var GRID_COLOR    = 'rgba(255,255,255,0.06)';
    var CHART_PADDING = { top: 24, right: 20, bottom: 42, left: 54 };
    var TTE_INTERVAL  = 60000; // 60s

    // Hebrew labels (Unicode escapes)
    var LBL = {
        forecast:  '\u05EA\u05D7\u05D6\u05D9\u05EA',
        days:      '\u05D9\u05DE\u05D9\u05DD',
        site:      '\u05D0\u05EA\u05E8',
        unit:      '\u05D9\u05D7\u05D9\u05D3\u05D4',
        quota:     '\u05DE\u05DB\u05E1\u05D4',
        used:      '\u05E9\u05D9\u05DE\u05D5\u05E9',
        remaining: '\u05E0\u05D5\u05EA\u05E8',
        urgency:   '\u05D3\u05D7\u05D9\u05E4\u05D5\u05EA',
        tier:      '\u05E9\u05DB\u05D1\u05D4',
        quotaEnd:  '\u05EA\u05D5\u05DD \u05DE\u05DB\u05E1\u05D4',
        exportCsv: '\u05D9\u05E6\u05D0 CSV',
        selectSite:'\u05D1\u05D7\u05E8 \u05D0\u05EA\u05E8',
        noData:    '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD',
        tte:       '\u05D6\u05DE\u05DF \u05DC\u05EA\u05D5\u05DD \u05DE\u05DB\u05E1\u05D4',
        daysShort: '\u05D9',
        hoursShort:'\u05E9',
        minsShort: '\u05D3'
    };

    // Hebrew month abbreviations
    var MONTHS_HEB = [
        '\u05D9\u05E0\u05D5', '\u05E4\u05D1\u05E8', '\u05DE\u05E8\u05E5',
        '\u05D0\u05E4\u05E8', '\u05DE\u05D0\u05D9', '\u05D9\u05D5\u05E0',
        '\u05D9\u05D5\u05DC', '\u05D0\u05D5\u05D2', '\u05E1\u05E4\u05D8',
        '\u05D0\u05D5\u05E7', '\u05E0\u05D5\u05D1', '\u05D3\u05E6\u05DE'
    ];

    // Tier display labels
    var TIER_LABELS = {
        seasonal: 'Seasonal (A)',
        linear:   'Linear (B)',
        daily:    'Daily-rate (C)'
    };

    // Table column definitions
    var TABLE_COLS = [
        { key: 'siteName',     label: LBL.site,      sortable: true  },
        { key: 'unitName',     label: LBL.unit,       sortable: true  },
        { key: 'quota',        label: LBL.quota,      sortable: true  },
        { key: 'used',         label: LBL.used,       sortable: true  },
        { key: 'remaining',    label: LBL.remaining,  sortable: true  },
        { key: 'forecastDate', label: LBL.quotaEnd,   sortable: true  },
        { key: 'daysLeft',     label: LBL.days,       sortable: true  },
        { key: 'urgencyLabel', label: LBL.urgency,    sortable: true  },
        { key: 'tierLabel',    label: LBL.tier,       sortable: true  }
    ];


    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════

    /**
     * @param {ShadowRoot} shadowRoot
     * @param {HTMLElement} containerEl
     * @param {Object} options  - { config, sites, worker, api, scriptBase }
     * @param {Object} bus
     */
    function Mu20Forecast(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._opts      = options || {};
        self._bus       = bus;
        self._destroyed = false;

        // State
        self._forecastRows = [];      // processed forecast data rows
        self._forecastMap  = {};      // unitKey -> Worker forecast result
        self._renderState  = null;    // latest data:updated renderState
        self._sortCol      = 'daysLeft';
        self._sortAsc      = true;
        self._selectedSite = '';      // site ID for chart
        self._isDemo       = false;

        // DOM references
        self._tableBody    = null;
        self._canvasEl     = null;
        self._canvasCtx    = null;
        self._siteSelect   = null;
        self._tteWrap      = null;
        self._countEl      = null;

        // Timers / animation
        self._tteTimer     = null;
        self._rafId        = null;

        // Bus handler references for cleanup
        self._onDataUpdated    = null;
        self._onForecastResult = null;
        self._onDemoToggle     = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('forecast', 'constructor', e);
            MU.shield.renderFallback(self._container, 'forecast', e);
        }
    }


    // ═══════════════════════════════════════
    //  DOM Helpers
    // ═══════════════════════════════════════

    function _el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text !== undefined && text !== null) e.textContent = text;
        return e;
    }

    function _classifyUrgency(daysLeft, critDays, warnDays) {
        if (daysLeft === null || daysLeft === undefined) return 'ok';
        if (daysLeft <= (critDays || URGENCY.critical.threshold)) return 'critical';
        if (daysLeft <= (warnDays || URGENCY.warning.threshold)) return 'warning';
        return 'ok';
    }

    function _formatNum(n, decimals) {
        if (n === null || n === undefined || isNaN(n)) return '--';
        var d = (decimals !== undefined) ? decimals : 0;
        return Number(n).toFixed(d);
    }

    function _pad2(n) {
        return n < 10 ? '0' + n : '' + n;
    }


    // ═══════════════════════════════════════
    //  Mount DOM
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._mount = function () {
        var self = this;
        var c = self._container;
        c.classList.add('mu20-forecast-root');
        c.setAttribute('dir', 'rtl');

        // ── Header bar ──
        var header = _el('div', 'mu20-fc-header');

        var title = _el('span', 'mu20-fc-title', LBL.forecast);
        header.appendChild(title);

        // Count badge
        self._countEl = _el('span', 'mu20-fc-count', '0');
        header.appendChild(self._countEl);

        // Spacer
        var spacer = _el('span', null);
        spacer.style.flex = '1';
        header.appendChild(spacer);

        // Site selector for chart
        self._siteSelect = document.createElement('select');
        self._siteSelect.className = 'mu20-fc-site-select';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = LBL.selectSite;
        self._siteSelect.appendChild(defaultOpt);
        self._siteSelect.addEventListener('change', function () {
            self._selectedSite = this.value;
            self._drawChart();
        });
        header.appendChild(self._siteSelect);

        // CSV export
        var csvBtn = _el('button', 'mu20-btn', LBL.exportCsv);
        csvBtn.addEventListener('click', function () { self._exportCsv(); });
        header.appendChild(csvBtn);

        c.appendChild(header);

        // ── Main layout: left = table + TTE, right = chart ──
        var main = _el('div', 'mu20-fc-main');

        // Left panel
        var leftPanel = _el('div', 'mu20-fc-left');

        // TTE countdown section
        self._tteWrap = _el('div', 'mu20-fc-tte-wrap');
        if (self._opts.showTteCountdown === false) self._tteWrap.style.display = 'none';
        leftPanel.appendChild(self._tteWrap);

        // Table scroll container
        var scrollWrap = _el('div', 'mu20-fc-scroll');
        scrollWrap.style.cssText = 'overflow:auto; flex:1;';

        var table = document.createElement('table');
        table.className = 'mu20-table mu20-fc-table';

        // Table header
        var thead = document.createElement('thead');
        var headerRow = document.createElement('tr');

        for (var h = 0; h < TABLE_COLS.length; h++) {
            (function (col, idx) {
                var th = document.createElement('th');
                th.textContent = col.label;
                th.style.cursor = col.sortable ? 'pointer' : 'default';
                th.style.userSelect = 'none';
                th.setAttribute('data-col', col.key);
                if (col.sortable) {
                    th.addEventListener('click', function () {
                        if (self._sortCol === col.key) {
                            self._sortAsc = !self._sortAsc;
                        } else {
                            self._sortCol = col.key;
                            self._sortAsc = true;
                        }
                        self._renderTable();
                    });
                }
                headerRow.appendChild(th);
            })(TABLE_COLS[h], h);
        }

        thead.appendChild(headerRow);
        table.appendChild(thead);

        self._tableBody = document.createElement('tbody');
        table.appendChild(self._tableBody);

        scrollWrap.appendChild(table);
        leftPanel.appendChild(scrollWrap);

        main.appendChild(leftPanel);

        // Right panel (chart)
        var rightPanel = _el('div', 'mu20-fc-right');

        self._canvasEl = document.createElement('canvas');
        self._canvasEl.className = 'mu20-fc-canvas';
        self._canvasEl.width = 520;
        self._canvasEl.height = 320;
        self._canvasCtx = self._canvasEl.getContext('2d');
        rightPanel.appendChild(self._canvasEl);

        // Legend container below canvas
        self._legendEl = _el('div', 'mu20-fc-legend');
        rightPanel.appendChild(self._legendEl);

        main.appendChild(rightPanel);

        c.appendChild(main);

        // ── Apply inline styles (minimal — theme comes from parent CSS) ──
        self._applyStyles();

        // ── Bus subscriptions ──
        if (self._bus) {
            self._onDataUpdated = function (payload) {
                if (self._destroyed) return;
                self._handleDataUpdated(payload);
            };
            self._bus.on('data:updated', self._onDataUpdated, self);

            self._onForecastResult = function (payload) {
                if (self._destroyed) return;
                self._handleForecastResult(payload);
            };
            self._bus.on('forecast:updated', self._onForecastResult, self);

            self._onDemoToggle = function (d) {
                if (self._destroyed) return;
                // H-3 fix: d is {enabled: bool}, not a boolean directly
                self._isDemo = !!(d && d.enabled);
            };
            self._bus.on('demo:toggle', self._onDemoToggle, self);
        }

        // ── TTE countdown timer ──
        self._startTteTimer();
    };


    // ═══════════════════════════════════════
    //  Inline styles (dark-theme compatible)
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._applyStyles = function () {
        var c = this._container;
        c.style.cssText = 'display:flex; flex-direction:column; height:100%; font-family:inherit; color:#e0e0e0;';

        var header = c.querySelector('.mu20-fc-header');
        if (header) {
            header.style.cssText = 'display:flex; align-items:center; gap:8px; padding:6px 10px; ' +
                'border-bottom:1px solid rgba(255,255,255,0.08); flex-shrink:0;';
        }

        var mainEl = c.querySelector('.mu20-fc-main');
        if (mainEl) {
            mainEl.style.cssText = 'display:flex; flex:1; overflow:hidden; gap:6px; padding:4px;';
        }

        var left = c.querySelector('.mu20-fc-left');
        if (left) {
            left.style.cssText = 'flex:1; display:flex; flex-direction:column; overflow:hidden; min-width:0;';
        }

        var right = c.querySelector('.mu20-fc-right');
        if (right) {
            right.style.cssText = 'width:540px; flex-shrink:0; display:flex; flex-direction:column; ' +
                'align-items:center; padding:4px;';
        }

        if (this._tteWrap) {
            this._tteWrap.style.cssText = 'display:flex; flex-wrap:wrap; gap:6px; padding:4px 0; flex-shrink:0;';
        }

        if (this._siteSelect) {
            this._siteSelect.style.cssText = 'background:#2a2a3e; color:#e0e0e0; border:1px solid rgba(255,255,255,0.15); ' +
                'border-radius:4px; padding:3px 8px; font-size:12px; direction:rtl;';
        }

        if (this._legendEl) {
            this._legendEl.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; padding:6px 4px; ' +
                'font-size:11px; justify-content:center;';
        }
    };


    // ═══════════════════════════════════════
    //  Handle data:updated (from Worker RENDER_STATE)
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._handleDataUpdated = function (payload) {
        var self = this;
        if (!payload || !payload.renderState) return;

        self._renderState = payload.renderState;
        var sites = (self._opts && self._opts.sites) || MU.SITES;
        var worker = self._opts && self._opts.worker;

        // Populate site selector if empty
        self._populateSiteSelector(sites);

        // Request forecasts from Worker for each unit
        if (worker) {
            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                for (var u = 0; u < site.units.length; u++) {
                    var unitKey = site.id + '_u' + u;
                    var rs = payload.renderState[unitKey];
                    if (!rs) continue;

                    worker.postMessage({
                        type: 'FORECAST_3TIER',
                        payload: {
                            unitKey:   unitKey,
                            total:     rs.hours || 0,
                            quota:     rs.quota || 0,
                            monthly:   rs.monthly || null,
                            // H-2: monthlyLY (last-year monthly profile) requires a dedicated
                            // PI Web API summary call for prior-year data. Until that pipeline
                            // is built, Tier A (seasonal blend) is inactive — falls to Tier B.
                            // TODO: orchestrator should fetch prior-year monthly summary and
                            // emit via bus 'forecast:monthlyLY' or include in canonical payload.
                            monthlyLY: (self._monthlyLYData && self._monthlyLYData[unitKey]) || null
                        }
                    });
                }
            }
        }

        // Rebuild rows from current state (forecast results arrive async)
        self._rebuildRows();
    };


    // ═══════════════════════════════════════
    //  Handle forecast:updated (from Worker FORECAST_RESULT)
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._handleForecastResult = function (payload) {
        if (!payload || !payload.unitKey) return;
        this._forecastMap[payload.unitKey] = payload;
        this._rebuildRows();
    };


    // ═══════════════════════════════════════
    //  Populate site selector dropdown
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._populateSiteSelector = function (sites) {
        var sel = this._siteSelect;
        if (!sel || !sites) return;

        // Only populate once (check if we already have options beyond the default)
        if (sel.options.length > 1) return;

        for (var i = 0; i < sites.length; i++) {
            var opt = document.createElement('option');
            opt.value = sites[i].id;
            opt.textContent = sites[i].name;
            sel.appendChild(opt);
        }

        // Auto-select first site
        if (sites.length > 0 && !this._selectedSite) {
            this._selectedSite = sites[0].id;
            sel.value = sites[0].id;
        }
    };


    // ═══════════════════════════════════════
    //  Rebuild forecast rows from state
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._rebuildRows = function () {
        var self = this;
        var sites = (self._opts && self._opts.sites) || MU.SITES;
        var rs = self._renderState;
        if (!rs) return;

        var rows = [];

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            for (var u = 0; u < site.units.length; u++) {
                var unitKey = site.id + '_u' + u;
                var unitData = rs[unitKey];
                if (!unitData) continue;

                var fc = self._forecastMap[unitKey] || {};
                var quota = unitData.quota || 0;
                var used = unitData.hours || 0;
                var remaining = Math.max(0, quota - used);
                var pct = quota > 0 ? (used / quota) * 100 : 0;

                // Determine best forecast date and tier
                var forecastTs = fc.seasonal || fc.linear || null;
                var tierKey = fc.tier || null;
                var daysLeft = fc.daysLeft;
                if (daysLeft === undefined || daysLeft === null) {
                    daysLeft = null;
                }

                var urgency = _classifyUrgency(daysLeft, self._opts.forecastCritDays, self._opts.forecastWarnDays);

                var row = {
                    unitKey:      unitKey,
                    siteId:       site.id,
                    siteName:     site.name,
                    unitName:     site.units[u],
                    quota:        quota,
                    used:         used,
                    remaining:    remaining,
                    pct:          pct,
                    forecastTs:   forecastTs,
                    forecastDate: forecastTs ? MU.formatDate(new Date(forecastTs), 'date') : '--',
                    daysLeft:     daysLeft,
                    urgency:      urgency,
                    urgencyLabel: urgency,
                    tierKey:      tierKey,
                    tierLabel:    tierKey ? (TIER_LABELS[tierKey] || tierKey) : '--',
                    monthly:      unitData.monthly || null,
                    seasonal:     fc.seasonal || null,
                    linear:       fc.linear || null,
                    ewma:         fc.ewma || null
                };

                rows.push(row);
            }
        }

        self._forecastRows = rows;
        self._renderTable();
        self._renderTteCountdowns();
        self._drawChart();

        // Update count badge
        if (self._countEl) {
            self._countEl.textContent = String(rows.length);
        }

        // Notify dispatch plugin with processed rows
        if (self._bus) {
            self._bus.emit('forecast:rows', {
                rows: rows,
                ts: new Date().toISOString()
            });
        }
    };


    // ═══════════════════════════════════════
    //  Sort helper
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._sortRows = function (rows) {
        var col = this._sortCol;
        var asc = this._sortAsc;

        rows.sort(function (a, b) {
            var va = a[col];
            var vb = b[col];

            // Null handling: push nulls to end
            if (va === null || va === undefined) va = asc ? Infinity : -Infinity;
            if (vb === null || vb === undefined) vb = asc ? Infinity : -Infinity;

            if (typeof va === 'string') {
                va = va.toLowerCase();
                vb = (vb || '').toString().toLowerCase();
                if (va < vb) return asc ? -1 : 1;
                if (va > vb) return asc ? 1 : -1;
                return 0;
            }

            return asc ? (va - vb) : (vb - va);
        });

        return rows;
    };


    // ═══════════════════════════════════════
    //  Render table
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._renderTable = function () {
        var self = this;
        var tbody = self._tableBody;
        if (!tbody) return;

        // Clear
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        var rows = self._forecastRows.slice();
        self._sortRows(rows);

        if (rows.length === 0) {
            var emptyRow = document.createElement('tr');
            var emptyTd = document.createElement('td');
            emptyTd.setAttribute('colspan', String(TABLE_COLS.length));
            emptyTd.textContent = LBL.noData;
            emptyTd.style.textAlign = 'center';
            emptyTd.style.padding = '20px';
            emptyTd.style.color = 'rgba(255,255,255,0.4)';
            emptyRow.appendChild(emptyTd);
            tbody.appendChild(emptyRow);
            return;
        }

        for (var i = 0; i < rows.length; i++) {
            self._appendTableRow(rows[i]);
        }

        // Update sort indicators in header
        self._updateSortIndicators();
    };


    // ═══════════════════════════════════════
    //  Append single table row
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._appendTableRow = function (row) {
        var self = this;
        var tr = document.createElement('tr');
        tr.style.cursor = 'pointer';

        tr.addEventListener('click', function () {
            if (self._bus) {
                self._bus.emit('unit:selected', { unitKey: row.unitKey, siteId: row.siteId });
            }
            // Switch chart to this site
            if (self._siteSelect && row.siteId) {
                self._selectedSite = row.siteId;
                self._siteSelect.value = row.siteId;
                self._drawChart();
            }
        });

        // Site name
        var tdSite = _el('td', null, row.siteName);
        tr.appendChild(tdSite);

        // Unit name
        var tdUnit = _el('td', null, row.unitName);
        tr.appendChild(tdUnit);

        // Quota
        var tdQuota = _el('td', null, _formatNum(row.quota, 0));
        tdQuota.style.textAlign = 'left';
        tr.appendChild(tdQuota);

        // Used
        var tdUsed = _el('td', null, _formatNum(row.used, 0));
        tdUsed.style.textAlign = 'left';
        tr.appendChild(tdUsed);

        // Remaining
        var tdRem = _el('td', null, _formatNum(row.remaining, 0));
        tdRem.style.textAlign = 'left';
        tr.appendChild(tdRem);

        // Forecast date
        var tdDate = _el('td', null, row.forecastDate);
        tr.appendChild(tdDate);

        // Days left
        var tdDays = _el('td', null, row.daysLeft !== null ? String(row.daysLeft) : '--');
        tdDays.style.textAlign = 'left';
        tr.appendChild(tdDays);

        // Urgency badge
        var tdUrg = document.createElement('td');
        var badge = _el('span', 'mu20-fc-badge', row.urgencyLabel);
        var urgInfo = URGENCY[row.urgency] || URGENCY.ok;
        badge.classList.add(urgInfo.cls);
        badge.style.cssText = 'display:inline-block; padding:2px 8px; border-radius:10px; ' +
            'font-size:11px; font-weight:600; color:#fff; background:' + urgInfo.color + ';';
        tdUrg.appendChild(badge);
        tr.appendChild(tdUrg);

        // Tier
        var tdTier = _el('td', null, row.tierLabel);
        tdTier.style.fontSize = '11px';
        tdTier.style.opacity = '0.7';
        tr.appendChild(tdTier);

        this._tableBody.appendChild(tr);
    };


    // ═══════════════════════════════════════
    //  Sort indicators in thead
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._updateSortIndicators = function () {
        var c = this._container;
        if (!c) return;
        var ths = c.querySelectorAll('.mu20-fc-table thead th');
        for (var i = 0; i < ths.length; i++) {
            var colKey = ths[i].getAttribute('data-col');
            if (colKey === this._sortCol) {
                ths[i].style.color = '#4ECDC4';
                ths[i].textContent = TABLE_COLS[i].label + (this._sortAsc ? ' \u25B2' : ' \u25BC');
            } else {
                ths[i].style.color = '';
                ths[i].textContent = TABLE_COLS[i].label;
            }
        }
    };


    // ═══════════════════════════════════════
    //  TTE Countdown display
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._renderTteCountdowns = function () {
        var wrap = this._tteWrap;
        if (!wrap) return;

        // Clear
        while (wrap.firstChild) wrap.removeChild(wrap.firstChild);

        var rows = this._forecastRows;
        var criticalUnits = [];

        var warnThresh = this._opts.forecastWarnDays || URGENCY.warning.threshold;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].daysLeft !== null && rows[i].daysLeft <= warnThresh) {
                criticalUnits.push(rows[i]);
            }
        }

        if (criticalUnits.length === 0) {
            var empty = _el('div', 'mu20-fc-tte-empty');
            empty.style.cssText = 'color:rgba(255,255,255,0.3); font-size:12px; padding:4px;';
            empty.textContent = LBL.tte + ': --';
            wrap.appendChild(empty);
            return;
        }

        // Sort by daysLeft ascending (most critical first)
        criticalUnits.sort(function (a, b) {
            return (a.daysLeft || 0) - (b.daysLeft || 0);
        });

        for (var j = 0; j < criticalUnits.length; j++) {
            var row = criticalUnits[j];
            var card = this._createTteCard(row);
            wrap.appendChild(card);
        }
    };

    Mu20Forecast.prototype._createTteCard = function (row) {
        var urgInfo = URGENCY[row.urgency] || URGENCY.ok;

        var card = _el('div', 'mu20-fc-tte-card');
        card.style.cssText = 'display:inline-flex; flex-direction:column; align-items:center; ' +
            'padding:6px 10px; border-radius:6px; min-width:100px; ' +
            'background:rgba(255,255,255,0.04); border:1px solid ' + urgInfo.color + '44;';

        var nameEl = _el('div', null, row.unitName);
        nameEl.style.cssText = 'font-size:11px; color:rgba(255,255,255,0.6); margin-bottom:3px; ' +
            'max-width:120px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;';
        card.appendChild(nameEl);

        var countdown = _el('div', 'mu20-fc-tte-value');
        countdown.setAttribute('data-unit-key', row.unitKey);
        countdown.style.cssText = 'font-size:16px; font-weight:700; color:' + urgInfo.color + '; ' +
            'font-variant-numeric:tabular-nums;';
        countdown.textContent = this._formatTte(row.daysLeft);
        card.appendChild(countdown);

        var labelEl = _el('div', null, LBL.tte);
        labelEl.style.cssText = 'font-size:10px; color:rgba(255,255,255,0.35); margin-top:2px;';
        card.appendChild(labelEl);

        return card;
    };

    Mu20Forecast.prototype._formatTte = function (daysLeft) {
        if (daysLeft === null || daysLeft === undefined) return '--';
        if (daysLeft <= 0) return '0' + LBL.daysShort;

        var days = Math.floor(daysLeft);
        var fracHours = (daysLeft - days) * 24;
        var hours = Math.floor(fracHours);
        var mins = Math.floor((fracHours - hours) * 60);

        return days + LBL.daysShort + ':' + _pad2(hours) + LBL.hoursShort + ':' + _pad2(mins) + LBL.minsShort;
    };

    Mu20Forecast.prototype._startTteTimer = function () {
        var self = this;
        if (self._tteTimer) return;

        self._tteTimer = setInterval(function () {
            if (self._destroyed) return;
            self._updateTteDisplays();
        }, TTE_INTERVAL);
    };

    Mu20Forecast.prototype._updateTteDisplays = function () {
        var wrap = this._tteWrap;
        if (!wrap) return;

        var els = wrap.querySelectorAll('.mu20-fc-tte-value');
        for (var i = 0; i < els.length; i++) {
            var unitKey = els[i].getAttribute('data-unit-key');
            if (!unitKey) continue;

            // Find the row
            for (var j = 0; j < this._forecastRows.length; j++) {
                if (this._forecastRows[j].unitKey === unitKey) {
                    var row = this._forecastRows[j];
                    // Recalculate daysLeft from forecastTs
                    if (row.forecastTs) {
                        var now = new Date();
                        var remaining = (row.forecastTs - now.getTime()) / 86400000;
                        row.daysLeft = Math.max(0, remaining);
                        row.urgency = _classifyUrgency(row.daysLeft, this._opts.forecastCritDays, this._opts.forecastWarnDays);
                        els[i].textContent = this._formatTte(row.daysLeft);
                    }
                    break;
                }
            }
        }
    };


    // ═══════════════════════════════════════
    //  Canvas Chart — Cumulative consumption
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._drawChart = function () {
        var self = this;
        if (self._destroyed) return;

        // Cancel any pending rAF
        if (self._rafId) {
            cancelAnimationFrame(self._rafId);
            self._rafId = null;
        }

        self._rafId = requestAnimationFrame(function () {
            self._rafId = null;
            self._renderChart();
        });
    };

    Mu20Forecast.prototype._renderChart = function () {
        var self = this;
        var canvas = self._canvasEl;
        var ctx = self._canvasCtx;
        if (!canvas || !ctx) return;

        var siteId = self._selectedSite;
        var sites = (self._opts && self._opts.sites) || MU.SITES;

        // Find selected site definition
        var siteDef = null;
        for (var s = 0; s < sites.length; s++) {
            if (sites[s].id === siteId) { siteDef = sites[s]; break; }
        }

        // Resize canvas to container
        var parent = canvas.parentElement;
        if (parent) {
            canvas.width = parent.clientWidth || 520;
            canvas.height = parent.clientHeight - 40 || 320;
        }

        var w = canvas.width;
        var h = canvas.height;
        var pad = CHART_PADDING;
        var plotW = w - pad.left - pad.right;
        var plotH = h - pad.top - pad.bottom;

        // Clear
        ctx.fillStyle = CHART_BG;
        ctx.fillRect(0, 0, w, h);

        if (!siteDef || !self._renderState) {
            // No data placeholder
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(LBL.noData, w / 2, h / 2);
            self._clearLegend();
            return;
        }

        // Collect unit data for this site
        var unitPlots = [];
        var maxQuota = 0;
        var maxCumul = 0;

        for (var u = 0; u < siteDef.units.length; u++) {
            var unitKey = siteDef.id + '_u' + u;
            var rs = self._renderState[unitKey];
            if (!rs || !rs.monthly) continue;

            var monthly = rs.monthly;
            var quota = rs.quota || 0;
            var fc = self._forecastMap[unitKey] || {};

            // Build cumulative array
            var cumul = [];
            var running = 0;
            for (var m = 0; m < 12; m++) {
                running += (monthly[m] || 0);
                cumul.push(running);
            }

            // Find last month with actual data
            var lastDataMonth = -1;
            for (var ld = 11; ld >= 0; ld--) {
                if (monthly[ld] > 0) { lastDataMonth = ld; break; }
            }

            // Determine forecast month from forecastTs
            var forecastMonth = null;
            var forecastTs = fc.seasonal || fc.linear || null;
            if (forecastTs) {
                var fcDate = new Date(forecastTs);
                forecastMonth = fcDate.getMonth();
            }

            if (quota > maxQuota) maxQuota = quota;
            if (running > maxCumul) maxCumul = running;

            unitPlots.push({
                unitKey:       unitKey,
                unitName:      siteDef.units[u],
                monthly:       monthly,
                cumul:         cumul,
                quota:         quota,
                lastDataMonth: lastDataMonth,
                forecastMonth: forecastMonth,
                forecastTs:    forecastTs,
                color:         COLORS[u % COLORS.length]
            });
        }

        if (unitPlots.length === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.3)';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(LBL.noData, w / 2, h / 2);
            self._clearLegend();
            return;
        }

        // Y-axis max: round up to nice number
        var yMax = Math.max(maxQuota, maxCumul) * 1.1;
        if (yMax <= 0) yMax = 100;
        yMax = Math.ceil(yMax / 100) * 100;

        // ── Grid lines ──
        ctx.strokeStyle = GRID_COLOR;
        ctx.lineWidth = 1;
        var gridSteps = 5;
        for (var g = 0; g <= gridSteps; g++) {
            var gy = pad.top + plotH - (g / gridSteps) * plotH;
            ctx.beginPath();
            ctx.moveTo(pad.left, gy);
            ctx.lineTo(pad.left + plotW, gy);
            ctx.stroke();

            // Y-axis labels
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'right';
            var yVal = (g / gridSteps) * yMax;
            ctx.fillText(_formatNum(yVal, 0), pad.left - 6, gy + 3);
        }

        // ── X-axis month labels ──
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.font = '10px sans-serif';
        for (var mx = 0; mx < 12; mx++) {
            var xPos = pad.left + ((mx + 0.5) / 12) * plotW;
            ctx.fillText(MONTHS_HEB[mx], xPos, h - pad.bottom + 16);

            // Vertical grid
            ctx.strokeStyle = GRID_COLOR;
            ctx.beginPath();
            ctx.moveTo(pad.left + (mx / 12) * plotW, pad.top);
            ctx.lineTo(pad.left + (mx / 12) * plotW, pad.top + plotH);
            ctx.stroke();
        }

        // ── Draw each unit ──
        for (var p = 0; p < unitPlots.length; p++) {
            self._drawUnitPlot(ctx, unitPlots[p], pad, plotW, plotH, yMax);
        }

        // ── Legend ──
        self._renderLegend(unitPlots);
    };


    // ═══════════════════════════════════════
    //  Draw single unit plot on canvas
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._drawUnitPlot = function (ctx, plot, pad, plotW, plotH, yMax) {
        var color = plot.color;
        var cumul = plot.cumul;
        var quota = plot.quota;
        var lastM = plot.lastDataMonth;

        // Helper: month index -> pixel X (center of month bar)
        function xOf(m) { return pad.left + ((m + 0.5) / 12) * plotW; }
        // Value -> pixel Y
        function yOf(v) { return pad.top + plotH - (v / yMax) * plotH; }

        // ── Quota line (horizontal dashed) ──
        if (quota > 0) {
            var yQ = yOf(quota);
            ctx.save();
            ctx.strokeStyle = color + '55';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(pad.left, yQ);
            ctx.lineTo(pad.left + plotW, yQ);
            ctx.stroke();
            ctx.restore();
        }

        // ── Cumulative area fill ──
        if (lastM >= 0) {
            ctx.save();
            ctx.fillStyle = color + '18';
            ctx.beginPath();
            ctx.moveTo(xOf(0), yOf(0));
            for (var a = 0; a <= lastM; a++) {
                ctx.lineTo(xOf(a), yOf(cumul[a]));
            }
            ctx.lineTo(xOf(lastM), yOf(0));
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        // ── Cumulative solid line ──
        if (lastM >= 0) {
            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 2;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(xOf(0), yOf(cumul[0]));
            for (var l = 1; l <= lastM; l++) {
                ctx.lineTo(xOf(l), yOf(cumul[l]));
            }
            ctx.stroke();

            // Data dots
            for (var d = 0; d <= lastM; d++) {
                ctx.beginPath();
                ctx.arc(xOf(d), yOf(cumul[d]), 2.5, 0, Math.PI * 2);
                ctx.fillStyle = color;
                ctx.fill();
            }
            ctx.restore();
        }

        // ── Forecast extension (dashed line to quota) ──
        if (lastM >= 0 && quota > 0 && plot.forecastMonth !== null &&
            plot.forecastMonth > lastM && cumul[lastM] < quota) {

            var fX = xOf(plot.forecastMonth);
            var yQuota = yOf(quota);

            ctx.save();
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(xOf(lastM), yOf(cumul[lastM]));
            ctx.lineTo(fX, yQuota);
            ctx.stroke();
            ctx.restore();

            // Forecast dot with glow
            ctx.save();
            ctx.shadowColor = color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(fX, yQuota, 4, 0, Math.PI * 2);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.restore();

            // Forecast dot outline
            ctx.beginPath();
            ctx.arc(fX, yQuota, 4, 0, Math.PI * 2);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.stroke();
        }
    };


    // ═══════════════════════════════════════
    //  Legend below chart
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._renderLegend = function (unitPlots) {
        var el = this._legendEl;
        if (!el) return;
        while (el.firstChild) el.removeChild(el.firstChild);

        for (var i = 0; i < unitPlots.length; i++) {
            var plot = unitPlots[i];
            var item = _el('div', 'mu20-fc-legend-item');
            item.style.cssText = 'display:inline-flex; align-items:center; gap:4px;';

            var dot = _el('span', null);
            dot.style.cssText = 'width:8px; height:8px; border-radius:50%; display:inline-block; ' +
                'background:' + plot.color + ';';
            item.appendChild(dot);

            var name = _el('span', null, plot.unitName);
            name.style.color = 'rgba(255,255,255,0.6)';
            item.appendChild(name);

            if (plot.forecastTs) {
                var dateStr = MU.formatDate(new Date(plot.forecastTs), 'date');
                var dateLbl = _el('span', null, '(' + dateStr + ')');
                dateLbl.style.cssText = 'color:rgba(255,255,255,0.35); font-size:10px;';
                item.appendChild(dateLbl);
            }

            el.appendChild(item);
        }
    };

    Mu20Forecast.prototype._clearLegend = function () {
        var el = this._legendEl;
        if (!el) return;
        while (el.firstChild) el.removeChild(el.firstChild);
    };


    // ═══════════════════════════════════════
    //  CSV Export
    // ═══════════════════════════════════════

    Mu20Forecast.prototype._exportCsv = function () {
        var rows = [];
        for (var i = 0; i < this._forecastRows.length; i++) {
            var r = this._forecastRows[i];
            rows.push({
                '\u05D0\u05EA\u05E8': r.siteName,
                '\u05D9\u05D7\u05D9\u05D3\u05D4': r.unitName,
                '\u05DE\u05DB\u05E1\u05D4': r.quota,
                '\u05E9\u05D9\u05DE\u05D5\u05E9': _formatNum(r.used, 0),
                '\u05E0\u05D5\u05EA\u05E8': _formatNum(r.remaining, 0),
                '%': _formatNum(r.pct, 1),
                '\u05EA\u05D5\u05DD \u05DE\u05DB\u05E1\u05D4': r.forecastDate,
                '\u05D9\u05DE\u05D9\u05DD': r.daysLeft !== null ? r.daysLeft : '',
                '\u05D3\u05D7\u05D9\u05E4\u05D5\u05EA': r.urgencyLabel,
                '\u05E9\u05DB\u05D1\u05D4': r.tierLabel
            });
        }
        MU.exportCsv(rows, 'mu20-forecast-' + MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: update
    // ═══════════════════════════════════════

    Mu20Forecast.prototype.update = function (data) {
        // Data arrives via bus 'data:updated' event.
        // The orchestrator may also call update() directly with renderState.
        if (data && data.renderState) {
            this._handleDataUpdated(data);
        }
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: onResize
    // ═══════════════════════════════════════

    Mu20Forecast.prototype.onResize = function () {
        this._drawChart();
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: onTabActivated
    // ═══════════════════════════════════════

    Mu20Forecast.prototype.onTabActivated = function () {
        // Redraw chart (canvas may have been hidden)
        this._drawChart();
        // Restart TTE timer if needed
        this._startTteTimer();
        // Update TTE displays immediately
        this._updateTteDisplays();
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: setOption
    // ═══════════════════════════════════════

    Mu20Forecast.prototype.setOption = function (key, value) {
        var self = this;
        if (self._destroyed) return;
        self._opts[key] = value;

        // Re-classify urgency when thresholds change
        if (key === 'forecastCritDays' || key === 'forecastWarnDays') {
            for (var i = 0; i < self._forecastRows.length; i++) {
                var row = self._forecastRows[i];
                row.urgency = _classifyUrgency(row.daysLeft, self._opts.forecastCritDays, self._opts.forecastWarnDays);
            }
            self._renderTable();
            self._renderTteCountdowns();
        }

        // Toggle TTE countdown visibility
        if (key === 'showTteCountdown' && self._tteWrap) {
            self._tteWrap.style.display = value ? '' : 'none';
        }
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: destroy
    // ═══════════════════════════════════════

    Mu20Forecast.prototype.destroy = function () {
        this._destroyed = true;

        // Clear TTE timer
        if (this._tteTimer) {
            clearInterval(this._tteTimer);
            this._tteTimer = null;
        }

        // Cancel rAF
        if (this._rafId) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        // Unsubscribe bus events
        if (this._bus) {
            if (this._onDataUpdated) this._bus.off('data:updated', this._onDataUpdated);
            if (this._onForecastResult) this._bus.off('forecast:updated', this._onForecastResult);
            if (this._onDemoToggle) this._bus.off('demo:toggle', this._onDemoToggle);
        }

        // Null DOM refs
        this._tableBody    = null;
        this._canvasEl     = null;
        this._canvasCtx    = null;
        this._siteSelect   = null;
        this._tteWrap      = null;
        this._countEl      = null;
        this._legendEl     = null;
        this._forecastRows = null;
        this._forecastMap  = null;
        this._renderState  = null;
        this._bus          = null;
        this._opts         = null;

        // Clear container
        while (this._container.firstChild) {
            this._container.removeChild(this._container.firstChild);
        }
    };


    // ── Export ──
    window.Mu20Forecast = Mu20Forecast;

})();
