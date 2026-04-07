/**
 * ================================================================
 *  mu20-dispatch.js  --  Dispatch Optimization Plugin (MU20)
 * ================================================================
 *  Displays a sorted dispatch table showing which power units
 *  are safest to dispatch (run), based on remaining quota
 *  headroom and MW capacity.
 *
 *  Score algorithm:  (1 - pct/100) * 60 + min(mw/600, 1) * 40
 *  Higher score = safer to dispatch.
 *
 *  Features:
 *    - Dispatch table sorted by score (highest first)
 *    - Colored score bars (green / orange / red)
 *    - Urgency badges (critical / warning / ok)
 *    - Filter by status, minimum MW, search text
 *    - Summary bar (total MW, avg score, at-risk count)
 *    - CSV export
 *    - Click-to-select emits unit:selected on bus
 *
 *  Ported from v10 dispatch logic to MU20 plugin contract (ES5).
 *  Version: ULT.1.4  |  ES5 only
 * ================================================================
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-dispatch] MU20 core not loaded'); return; }

    // ── Score color thresholds ──
    var COLOR_SAFE    = '#27AE60';
    var COLOR_CAUTION = '#F2994A';
    var COLOR_AVOID   = '#EB5757';

    // ── Urgency badge colors ──
    var URGENCY_COLORS = {
        critical: '#EB5757',
        warning:  '#F2994A',
        ok:       '#6FCF97'
    };

    // ── Status labels (Hebrew) ──
    var STATUS_LABELS = {
        ok:       '\u05EA\u05E7\u05D9\u05DF',
        warn:     '\u05D0\u05D6\u05D4\u05E8\u05D4',
        critical: '\u05E7\u05E8\u05D9\u05D8\u05D9',
        flt:      '\u05EA\u05E7\u05DC\u05D4',
        mnt:      '\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4'
    };

    // ── Urgency labels (Hebrew) ──
    var URGENCY_LABELS = {
        critical: '\u05E7\u05E8\u05D9\u05D8\u05D9',
        warning:  '\u05D0\u05D6\u05D4\u05E8\u05D4',
        ok:       '\u05EA\u05E7\u05D9\u05DF'
    };


    // ═══════════════════════════════════════
    //  Dispatch Score Algorithm
    // ═══════════════════════════════════════

    function dispatchScore(u) {
        if (u.pct >= 90) return 0;
        return Math.round((1 - u.pct / 100) * 60 + Math.min(u.mw / 600, 1) * 40);
    }

    function scoreColor(score) {
        if (score >= 70) return COLOR_SAFE;
        if (score >= 40) return COLOR_CAUTION;
        return COLOR_AVOID;
    }

    function forecastUrgency(u, critDays, warnDays) {
        if (u.daysLeft < (critDays || 30)) return 'critical';
        if (u.daysLeft < (warnDays || 90)) return 'warning';
        return 'ok';
    }

    function forecastLabel(u) {
        if (!u.forecastDate) return '--';
        return MU.formatDate(u.forecastDate, 'date');
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
    function Mu20Dispatch(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._opts      = options || {};
        self._bus       = bus;
        self._destroyed = false;

        // State
        self._dispatchList   = [];
        self._allUnits       = [];
        self._filterStatus   = '';        // '' = show all
        self._filterMinMw    = self._opts.dispatchMinMW || 0;
        self._filterSearch   = '';
        self._demoMode       = false;

        // DOM references
        self._tableBody      = null;
        self._summaryMw      = null;
        self._summaryScore   = null;
        self._summaryRisk    = null;
        self._scrollWrap     = null;
        self._statusSelect   = null;
        self._mwInput        = null;
        self._searchInput    = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('dispatch', 'constructor', e);
            MU.shield.renderFallback(self._container, 'dispatch', e);
        }
    }


    // ═══════════════════════════════════════
    //  Mount DOM
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._mount = function () {
        var self = this;
        var c = self._container;
        c.classList.add('mu20-dispatch-root');
        c.setAttribute('dir', 'rtl');

        // ── Summary bar ──
        var summary = document.createElement('div');
        summary.className = 'mu20-disp-summary';

        self._summaryMw = self._createSummaryCard(
            'MW \u05E1\u05D4"\u05DB', '0'
        );
        summary.appendChild(self._summaryMw.wrap);

        self._summaryScore = self._createSummaryCard(
            '\u05E0\u05D9\u05E7\u05D5\u05D3 \u05DE\u05DE\u05D5\u05E6\u05E2', '0'
        );
        summary.appendChild(self._summaryScore.wrap);

        self._summaryRisk = self._createSummaryCard(
            '\u05D9\u05D7\u05D9\u05D3\u05D5\u05EA \u05D1\u05E1\u05D9\u05DB\u05D5\u05DF', '0'
        );
        summary.appendChild(self._summaryRisk.wrap);

        c.appendChild(summary);

        // ── Controls bar ──
        var controls = document.createElement('div');
        controls.className = 'mu20-disp-controls';

        // Status filter dropdown
        var statusLabel = document.createElement('label');
        statusLabel.className = 'mu20-disp-label';
        statusLabel.textContent = '\u05E1\u05D8\u05D8\u05D5\u05E1:';

        var statusSel = document.createElement('select');
        statusSel.className = 'mu20-disp-select';
        var statusOpts = [
            { value: '',    text: '\u05D4\u05DB\u05DC' },
            { value: 'flt', text: '\u05DC\u05DC\u05D0 \u05EA\u05E7\u05DC\u05D4' },
            { value: 'mnt', text: '\u05DC\u05DC\u05D0 \u05EA\u05D7\u05D6\u05D5\u05E7\u05D4' }
        ];
        for (var i = 0; i < statusOpts.length; i++) {
            var opt = document.createElement('option');
            opt.value = statusOpts[i].value;
            opt.textContent = statusOpts[i].text;
            statusSel.appendChild(opt);
        }
        statusSel.addEventListener('change', function () {
            self._filterStatus = this.value;
            self._computeAndRender();
        });
        self._statusSelect = statusSel;
        statusLabel.appendChild(statusSel);
        controls.appendChild(statusLabel);

        // Min MW filter
        var mwLabel = document.createElement('label');
        mwLabel.className = 'mu20-disp-label';
        mwLabel.textContent = 'MW \u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD:';

        var mwInput = document.createElement('input');
        mwInput.className = 'mu20-disp-input';
        mwInput.type = 'number';
        mwInput.value = '0';
        mwInput.min = '0';
        mwInput.style.width = '70px';
        mwInput.addEventListener('input', function () {
            self._filterMinMw = parseFloat(this.value) || 0;
            self._computeAndRender();
        });
        self._mwInput = mwInput;
        mwLabel.appendChild(mwInput);
        controls.appendChild(mwLabel);

        // Search input
        var searchLabel = document.createElement('label');
        searchLabel.className = 'mu20-disp-label';
        searchLabel.textContent = '\u05D7\u05D9\u05E4\u05D5\u05E9:';

        var searchInput = document.createElement('input');
        searchInput.className = 'mu20-disp-input';
        searchInput.type = 'text';
        searchInput.placeholder = '\u05D0\u05EA\u05E8 / \u05D9\u05D7\u05D9\u05D3\u05D4';
        searchInput.style.width = '120px';
        var searchTimer = null;
        searchInput.addEventListener('input', function () {
            var val = this.value;
            if (searchTimer) clearTimeout(searchTimer);
            searchTimer = setTimeout(function () {
                self._filterSearch = val.toLowerCase();
                self._computeAndRender();
            }, 200);
        });
        self._searchInput = searchInput;
        searchLabel.appendChild(searchInput);
        controls.appendChild(searchLabel);

        // Spacer
        var spacer = document.createElement('span');
        spacer.style.flex = '1';
        controls.appendChild(spacer);

        // CSV export button
        var csvBtn = document.createElement('button');
        csvBtn.className = 'mu20-btn';
        csvBtn.textContent = '\u05D9\u05E6\u05D0 CSV';
        csvBtn.addEventListener('click', function () { self._exportCsv(); });
        controls.appendChild(csvBtn);

        c.appendChild(controls);

        // ── Table ──
        self._scrollWrap = document.createElement('div');
        self._scrollWrap.className = 'mu20-disp-scroll';
        self._scrollWrap.style.cssText = 'overflow:auto; flex:1;';

        var table = document.createElement('table');
        table.className = 'mu20-table mu20-disp-table';

        var thead = document.createElement('thead');
        var headerRow = document.createElement('tr');
        var cols = [
            '#',
            '\u05D0\u05EA\u05E8',
            '\u05D9\u05D7\u05D9\u05D3\u05D4',
            'MW',
            '\u05DE\u05DB\u05E1\u05D4 %',
            '\u05E0\u05D9\u05E7\u05D5\u05D3',
            '\u05EA\u05D7\u05D6\u05D9\u05EA',
            '\u05D3\u05D7\u05D9\u05E4\u05D5\u05EA',
            '\u05E1\u05D8\u05D8\u05D5\u05E1'
        ];
        for (var h = 0; h < cols.length; h++) {
            var th = document.createElement('th');
            th.textContent = cols[h];
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        self._tableBody = document.createElement('tbody');
        table.appendChild(self._tableBody);
        self._scrollWrap.appendChild(table);
        c.appendChild(self._scrollWrap);

        // ── Bus subscriptions ──
        if (self._bus) {
            self._onDataUpdated = function (data) {
                if (self._destroyed) return;
                self.update(data);
            };
            self._bus.on('data:updated', self._onDataUpdated, self);

            self._onForecastUpdated = function (data) {
                if (self._destroyed) return;
                // H-6 fix: use forecast:rows (aggregated all-units summary)
                // instead of forecast:updated (single-unit per call)
                if (data && data.rows) {
                    self._forecastData = data.rows;
                } else if (data) {
                    self._forecastData = data;
                }
                self._computeAndRender();
            };
            self._bus.on('forecast:rows', self._onForecastUpdated, self);

            self._onDemoToggle = function (d) {
                self._demoMode = d.enabled;
            };
            self._bus.on('demo:toggle', self._onDemoToggle, self);
        }
    };


    // ═══════════════════════════════════════
    //  Create summary card helper
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._createSummaryCard = function (label, value) {
        var wrap = document.createElement('div');
        wrap.className = 'mu20-disp-summary-card';

        var labelEl = document.createElement('div');
        labelEl.className = 'mu20-disp-summary-label';
        labelEl.textContent = label;
        wrap.appendChild(labelEl);

        var valueEl = document.createElement('div');
        valueEl.className = 'mu20-disp-summary-value';
        valueEl.textContent = value;
        wrap.appendChild(valueEl);

        return { wrap: wrap, valueEl: valueEl };
    };


    // ═══════════════════════════════════════
    //  update(data) — Plugin contract
    // ═══════════════════════════════════════

    /**
     * @param {Object} payload - canonical { rawSites, renderState, siteDefs, ts }
     *                           OR legacy { [siteId]: { [unitIdx]: {...} } }
     */
    Mu20Dispatch.prototype.update = function (payload) {
        if (this._destroyed) return;
        // Canonical payload normalization — dispatch needs rawSites
        if (payload !== undefined) {
            this._lastData = (payload && payload.rawSites) ? payload.rawSites : payload;
        }
        this._buildUnitList();
        this._computeAndRender();
    };


    // ═══════════════════════════════════════
    //  Build flat unit list from site data
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._buildUnitList = function () {
        var self = this;
        var data = self._lastData;
        if (!data) return;

        var sites = self._opts.sites || MU.SITES || [];
        var units = [];

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            var siteData = data[site.id];
            if (!siteData) continue;

            for (var u = 0; u < site.units.length; u++) {
                var ud = siteData[u];
                if (!ud) continue;

                // Extract plain numbers from AF wrapper objects (C-2 fix)
                var pct = MU.toNum(ud.pct);
                var hours = MU.toNum(ud.hours);
                var quota = MU.toNum(ud.quota);
                var tte = (ud.tte !== undefined && ud.tte !== Infinity) ? MU.toNum(ud.tte, Infinity) : Infinity;
                var daysLeft = (tte !== Infinity) ? Math.round(tte / 24) : 999;

                // Derive forecast date from TTE
                var forecastDate = null;
                if (tte !== Infinity && tte > 0) {
                    forecastDate = new Date(Date.now() + tte * 3600000);
                }

                // Derive status string (may be AF wrapper or plain string)
                var rawSt = ud.status;
                var st = (rawSt && typeof rawSt === 'object' && rawSt.display) ? rawSt.display : (rawSt || 'ok');
                // Map status to short codes for filter matching
                if (st === 'critical' && pct >= 90) st = 'critical';

                // MW capacity from options site settings or default
                var mw = 0;
                var uk = MU.unitKey(site.id, u);
                if (self._opts.unitSettings && self._opts.unitSettings[uk]) {
                    mw = self._opts.unitSettings[uk].mw || 0;
                } else if (site.mw) {
                    mw = site.mw;
                } else if (ud.mw !== undefined) {
                    mw = MU.toNum(ud.mw);
                } else {
                    // Estimate from site region / fuel defaults
                    mw = self._estimateMw(site);
                }

                units.push({
                    siteId:       site.id,
                    siteName:     site.name,
                    unitIdx:      u,
                    unitName:     site.units[u],
                    mw:           mw,
                    pct:          pct,
                    hours:        hours,
                    quota:        quota,
                    tte:          tte,
                    daysLeft:     daysLeft,
                    forecastDate: forecastDate,
                    st:           st
                });
            }
        }

        self._allUnits = units;
    };


    // ═══════════════════════════════════════
    //  Estimate MW for a site (fallback)
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._estimateMw = function (site) {
        var fuel = site.fuel || '';
        // Default MW by fuel type (rough estimates)
        if (fuel.indexOf('\u05E4\u05D7\u05DD') >= 0) return 550;  // coal
        if (fuel.indexOf('\u05D2\u05D6') >= 0)   return 350;      // gas
        if (fuel.indexOf('\u05E1\u05D5\u05DC\u05E8') >= 0) return 50; // solar
        return 200;
    };


    // ═══════════════════════════════════════
    //  Compute dispatch list and render
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._computeAndRender = function () {
        var self = this;
        if (self._destroyed) return;

        var units = self._allUnits;
        if (!units || !units.length) return;

        // Filter out excluded statuses
        var filtered = [];
        for (var i = 0; i < units.length; i++) {
            var u = units[i];

            // Status exclusion filter (user-selected from dropdown)
            if (self._filterStatus === 'flt' && u.st === 'flt') continue;
            if (self._filterStatus === 'mnt' && u.st === 'mnt') continue;

            // Default dispatch filter: exclude faulted and maintenance (configurable)
            var excludeFltMnt = self._opts.dispatchExcludeFltMnt !== undefined
                ? self._opts.dispatchExcludeFltMnt : true;
            if (excludeFltMnt && (u.st === 'flt' || u.st === 'mnt')) continue;

            // Min MW filter
            if (u.mw < self._filterMinMw) continue;

            // Search filter
            if (self._filterSearch) {
                var searchTarget = (u.siteName + ' ' + u.unitName).toLowerCase();
                if (searchTarget.indexOf(self._filterSearch) < 0) continue;
            }

            filtered.push(u);
        }

        // Compute dispatch list with scores
        var list = [];
        for (var j = 0; j < filtered.length; j++) {
            var unit = filtered[j];
            list.push({
                unit:    unit,
                score:   dispatchScore(unit),
                forecast: forecastLabel(unit),
                urgency: forecastUrgency(unit, self._opts.forecastCritDays, self._opts.forecastWarnDays)
            });
        }

        // Sort by score descending
        list.sort(function (a, b) { return b.score - a.score; });

        self._dispatchList = list;

        // Update summary
        self._updateSummary(list);

        // Render table
        self._renderTable(list);
    };


    // ═══════════════════════════════════════
    //  Update summary bar
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._updateSummary = function (list) {
        var totalMw = 0;
        var totalScore = 0;
        var riskCount = 0;

        for (var i = 0; i < list.length; i++) {
            totalMw += list[i].unit.mw;
            totalScore += list[i].score;
            if (list[i].score < 40) riskCount++;
        }

        var avgScore = list.length > 0 ? Math.round(totalScore / list.length) : 0;

        if (this._summaryMw) {
            this._summaryMw.valueEl.textContent = String(Math.round(totalMw));
        }
        if (this._summaryScore) {
            this._summaryScore.valueEl.textContent = String(avgScore);
        }
        if (this._summaryRisk) {
            this._summaryRisk.valueEl.textContent = String(riskCount);
            this._summaryRisk.valueEl.style.color = riskCount > 0 ? COLOR_AVOID : '';
        }
    };


    // ═══════════════════════════════════════
    //  Render dispatch table
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._renderTable = function (list) {
        var self = this;
        var tbody = self._tableBody;
        if (!tbody) return;

        // Clear
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        if (!list || !list.length) {
            var emptyRow = document.createElement('tr');
            var emptyTd = document.createElement('td');
            emptyTd.colSpan = 9;
            emptyTd.style.textAlign = 'center';
            emptyTd.style.padding = '20px';
            emptyTd.textContent = '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD';
            emptyRow.appendChild(emptyTd);
            tbody.appendChild(emptyRow);
            return;
        }

        for (var i = 0; i < list.length; i++) {
            self._appendRow(list[i], i + 1);
        }
    };


    // ═══════════════════════════════════════
    //  Append single row
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._appendRow = function (item, rank) {
        var self = this;
        var tbody = self._tableBody;
        if (!tbody) return;

        var u = item.unit;
        var score = item.score;
        var sColor = scoreColor(score);

        var tr = document.createElement('tr');
        tr.className = 'mu20-disp-row';
        tr.style.cursor = 'pointer';

        // Click handler — emit unit:selected
        (function (unitData) {
            tr.addEventListener('click', function () {
                if (self._bus) {
                    self._bus.emit('unit:selected', {
                        siteId:   unitData.siteId,
                        unitIdx:  unitData.unitIdx,
                        unitName: unitData.unitName
                    });
                    self._bus.emit('log:entry', {
                        level:  'info',
                        source: 'dispatch',
                        msg:    '\u05E0\u05D1\u05D7\u05E8: ' + unitData.siteName + ' - ' + unitData.unitName
                    });
                }
            });
        })(u);

        // #
        var tdRank = document.createElement('td');
        tdRank.className = 'mu20-disp-rank';
        tdRank.textContent = String(rank);
        tr.appendChild(tdRank);

        // Site name
        var tdSite = document.createElement('td');
        tdSite.className = 'mu20-disp-site';
        tdSite.textContent = u.siteName;
        tr.appendChild(tdSite);

        // Unit name
        var tdUnit = document.createElement('td');
        tdUnit.className = 'mu20-disp-unit';
        tdUnit.textContent = u.unitName;
        tr.appendChild(tdUnit);

        // MW
        var tdMw = document.createElement('td');
        tdMw.className = 'mu20-disp-mw';
        tdMw.textContent = String(Math.round(u.mw));
        tr.appendChild(tdMw);

        // Quota %
        var tdPct = document.createElement('td');
        tdPct.className = 'mu20-disp-pct';
        tdPct.textContent = (Math.round(u.pct * 10) / 10) + '%';
        tr.appendChild(tdPct);

        // Score (bar + number)
        var tdScore = document.createElement('td');
        tdScore.className = 'mu20-disp-score-cell';

        var barWrap = document.createElement('div');
        barWrap.className = 'mu20-disp-bar-wrap';

        var bar = document.createElement('div');
        bar.className = 'mu20-disp-bar';
        bar.style.width = Math.min(score, 100) + '%';
        bar.style.backgroundColor = sColor;
        barWrap.appendChild(bar);

        var scoreNum = document.createElement('span');
        scoreNum.className = 'mu20-disp-bar-num';
        scoreNum.textContent = String(score);
        barWrap.appendChild(scoreNum);

        tdScore.appendChild(barWrap);
        tr.appendChild(tdScore);

        // Forecast date
        var tdForecast = document.createElement('td');
        tdForecast.className = 'mu20-disp-forecast';
        tdForecast.textContent = item.forecast;
        tr.appendChild(tdForecast);

        // Urgency badge
        var tdUrgency = document.createElement('td');
        tdUrgency.className = 'mu20-disp-urgency';

        var badge = document.createElement('span');
        badge.className = 'mu20-disp-badge';
        badge.style.backgroundColor = URGENCY_COLORS[item.urgency] || URGENCY_COLORS.ok;
        badge.textContent = URGENCY_LABELS[item.urgency] || item.urgency;
        tdUrgency.appendChild(badge);
        tr.appendChild(tdUrgency);

        // Status
        var tdStatus = document.createElement('td');
        tdStatus.className = 'mu20-disp-status';
        tdStatus.textContent = STATUS_LABELS[u.st] || u.st;
        tr.appendChild(tdStatus);

        // Row background tint based on score
        if (score < 40) {
            tr.style.backgroundColor = 'rgba(235, 87, 87, 0.08)';
        } else if (score < 70) {
            tr.style.backgroundColor = 'rgba(242, 153, 74, 0.06)';
        }

        tbody.appendChild(tr);
    };


    // ═══════════════════════════════════════
    //  CSV Export
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype._exportCsv = function () {
        var list = this._dispatchList;
        if (!list || !list.length) return;

        var rows = [];
        for (var i = 0; i < list.length; i++) {
            var item = list[i];
            var u = item.unit;
            rows.push({
                '#':                       i + 1,
                '\u05D0\u05EA\u05E8':      u.siteName,
                '\u05D9\u05D7\u05D9\u05D3\u05D4': u.unitName,
                'MW':                      Math.round(u.mw),
                '\u05DE\u05DB\u05E1\u05D4 %': Math.round(u.pct * 10) / 10,
                '\u05E0\u05D9\u05E7\u05D5\u05D3': item.score,
                '\u05EA\u05D7\u05D6\u05D9\u05EA': item.forecast,
                '\u05D3\u05D7\u05D9\u05E4\u05D5\u05EA': URGENCY_LABELS[item.urgency] || item.urgency,
                '\u05E1\u05D8\u05D8\u05D5\u05E1': STATUS_LABELS[u.st] || u.st
            });
        }

        MU.exportCsv(
            rows,
            'mu20-dispatch-' + MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv'
        );
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: onResize
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype.onResize = function () {
        // CSS-driven layout -- no manual resize needed
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: onTabActivated
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype.onTabActivated = function () {
        // Refresh dispatch list on tab switch
        if (!this._destroyed) {
            this._computeAndRender();
        }
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: setOption
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype.setOption = function (key, value) {
        var self = this;
        if (self._destroyed) return;
        self._opts[key] = value;

        // Re-filter and re-render on threshold / filter changes
        if (key === 'forecastCritDays' || key === 'forecastWarnDays' ||
            key === 'dispatchMinMW' || key === 'dispatchExcludeFltMnt') {

            if (key === 'dispatchMinMW') self._filterMinMw = value || 0;
            if (self._allUnits.length) self._computeAndRender();
        }
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: destroy
    // ═══════════════════════════════════════

    Mu20Dispatch.prototype.destroy = function () {
        this._destroyed = true;

        // Unsubscribe bus events
        if (this._bus) {
            if (this._onDataUpdated)     this._bus.off('data:updated',     this._onDataUpdated);
            if (this._onForecastUpdated) this._bus.off('forecast:rows', this._onForecastUpdated);
            if (this._onDemoToggle)      this._bus.off('demo:toggle',      this._onDemoToggle);
        }

        // Null DOM references
        this._dispatchList   = null;
        this._allUnits       = null;
        this._tableBody      = null;
        this._scrollWrap     = null;
        this._summaryMw      = null;
        this._summaryScore   = null;
        this._summaryRisk    = null;
        this._statusSelect   = null;
        this._mwInput        = null;
        this._searchInput    = null;
        this._lastData       = null;
        this._forecastData   = null;
        this._bus            = null;

        // Clear container
        while (this._container.firstChild) {
            this._container.removeChild(this._container.firstChild);
        }
    };


    // ── Export ──
    window.Mu20Dispatch = Mu20Dispatch;

})();
