/**
 * ================================================================
 *  Mugbalot Ultimate Monitor (MU20) -- Site Grid Plugin
 * ================================================================
 *  Site cards, unit rows, quota bars, TTE badges, sparklines,
 *  favorites, sort, filter, global search, gear modals.
 *
 *  Ported from WowGridRenderer (ES6) to MU20 plugin contract (ES5).
 *  Zero jQuery -- CSS Variable rendering -- rAF batching
 *  Shadow DOM compatible -- GPU-composited transitions
 *
 *  Plugin contract:
 *    constructor(shadowRoot, containerEl, options, bus)
 *    update(data)          -- render with rAF batch
 *    updateSparkline(p)    -- SVG polyline from Worker
 *    onResize()            -- optional container resize
 *    onTabActivated()      -- redraw after display:none -> block
 *    destroy()             -- mandatory full cleanup
 *
 *  Version : ULT.1.4
 *  ES5 only (PI Vision convention)
 * ================================================================
 */
(function () {
    'use strict';

    // =============================================================
    //  Constructor
    // =============================================================

    /**
     * @param {ShadowRoot} shadowRoot  - Shadow DOM root for CSS isolation
     * @param {HTMLElement} containerEl - Mount point inside shadow root
     * @param {Object}  options        - Configuration (thresholds, display, etc.)
     * @param {Object}  [bus]          - MU20.createBus() signal bus instance
     */
    function Mu20SiteGrid(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._root = shadowRoot;
        self._containerEl = containerEl;
        self._bus = bus || null;
        self._destroyed = false;

        // -- Options (with defaults) --
        var defaults = {
            sites:          [],
            favorites:      {},
            sortOrder:      'name',
            warnPct:        70,
            critPct:        90,
            showSparklines: true,
            decimals:       1,
            annotations:    {},
            unitSettings:   {},
            siteSettings:   {},
            trendBaseUrl:   '',
            demoMode:       false
        };
        var opts = {};
        var key;
        for (key in defaults) {
            if (defaults.hasOwnProperty(key)) {
                opts[key] = defaults[key];
            }
        }
        var src = options || {};
        for (key in src) {
            if (src.hasOwnProperty(key)) {
                opts[key] = src[key];
            }
        }
        self._opts = opts;

        // -- DOM element maps (O(1) lookup) --
        self._siteCards  = {};   // siteId -> { card, header, body }
        self._unitRows   = {};   // unitKey -> { row, name, fill, label, tte, fav, spark, annot, gear }
        self._sortBtns   = {};   // sortKey -> button
        self._filterBtns = {};   // filterKey -> button

        // -- State --
        self._statusFilter = { ok: true, warn: true, critical: true };
        self._filterText   = '';
        self._lastData     = null;
        self._dataVer      = 0;
        self._sortCache    = null;   // { order, dataVer, arr[] }
        self._rAF          = null;
        self._siteDataMap  = null;

        // -- Count-up animation state --
        self._animTimers   = {};   // unitKey -> { raf, start, from, to, el }

        // -- Modals (created lazily) --
        self._gearOverlay     = null;
        self._gearUnitKey     = null;
        self._siteGearOverlay = null;
        self._siteGearId      = null;

        // -- Search overlay --
        self._searchOverlay = null;
        self._searchInput   = null;

        // -- Tooltip --
        self._tooltipEl    = null;
        self._tooltipTimer = null;

        // -- Sensitivity bar --
        self._sensitivityEl = null;

        // -- Cards container --
        self._cardsContainer = null;

        // -- Root container (the mu20-grid-root we create) --
        self._container = null;

        // -- Last known container size for onResize() --
        self._lastWidth  = 0;
        self._lastHeight = 0;

        // -- Keyboard shortcut --
        // FIX #10: Removed document-level keydown listener.
        //          Keyboard shortcuts are handled by orchestrator on shell element.
        //          Plugin receives bus events for search:query instead.
        self._onKeyDown = null;

        // -- Bus subscriptions --
        self._busHandlers = null;

        // Mount DOM
        self.mount(opts.sites);
    }


    // =============================================================
    //  mount() -- Build entire DOM scaffold
    // =============================================================

    Mu20SiteGrid.prototype.mount = function (sites) {
        var self = this;
        if (self._destroyed) return;
        sites = sites || self._opts.sites || [];
        self._opts.sites = sites;

        // -- Container --
        var container = self._el('div', 'mu20-grid-root');
        container.setAttribute('dir', 'rtl');
        container.style.position = 'relative';

        // -- Toolbar: search + sort --
        var toolbar = self._el('div', 'mu20-search-bar');

        var searchInput = self._el('input', 'mu20-search-input');
        searchInput.type = 'text';
        searchInput.placeholder = '\u05D7\u05D9\u05E4\u05D5\u05E9...';
        searchInput.dir = 'rtl';
        searchInput.addEventListener('input', function () {
            self._filterText = searchInput.value;
            self._applyFilter();
        });
        toolbar.appendChild(searchInput);
        self._searchInput = searchInput;

        // Sort buttons
        var sortDefs = [
            { key: 'name',         label: '\u05E9\u05DD' },
            { key: 'pct',          label: '\u05E0\u05D9\u05E6\u05D5\u05DC %' },
            { key: 'hours',        label: '\u05E9\u05E2\u05D5\u05EA' },
            { key: 'hoursLeft',    label: '\u05E0\u05D5\u05EA\u05E8\u05D5' },
            { key: 'siteHoursYtd', label: '\u05E9\u05E2\u05D5\u05EA \u05E9\u05E0\u05EA\u05D9' },
            { key: 'tte',          label: 'TTE' },
            { key: 'status',       label: '\u05E1\u05D8\u05D8\u05D5\u05E1' }
        ];
        var i;
        for (i = 0; i < sortDefs.length; i++) {
            (function (sd) {
                var btn = self._el('button', 'mu20-sort-btn');
                btn.textContent = sd.label;
                if (self._opts.sortOrder === sd.key) {
                    btn.className += ' mu20-sort-btn--active';
                }
                btn.addEventListener('click', function () {
                    self._opts.sortOrder = sd.key;
                    self._updateSortBtns();
                    self._sortAndRender();
                });
                self._sortBtns[sd.key] = btn;
                toolbar.appendChild(btn);
            })(sortDefs[i]);
        }

        // Ctrl+K search trigger button
        var searchTrigger = self._el('button', 'mu20-sort-btn');
        searchTrigger.textContent = '\u2315';
        searchTrigger.title = 'Ctrl+K \u05D7\u05D9\u05E4\u05D5\u05E9 \u05D2\u05DC\u05D5\u05D1\u05DC\u05D9';
        searchTrigger.addEventListener('click', function () { self.showSearch(); });
        toolbar.appendChild(searchTrigger);

        container.appendChild(toolbar);

        // -- Status Filter Bar --
        var filterBar = self._el('div', 'mu20-status-filter-bar');
        var filterDefs = [
            { key: 'all',      label: '\u05D4\u05DB\u05DC',   css: '' },
            { key: 'ok',       label: '\u05EA\u05E7\u05D9\u05DF',  css: 'mu20-filter-ok' },
            { key: 'warn',     label: '\u05D0\u05D6\u05D4\u05E8\u05D4', css: 'mu20-filter-warn' },
            { key: 'critical', label: '\u05E7\u05E8\u05D9\u05D8\u05D9', css: 'mu20-filter-crit' }
        ];
        for (i = 0; i < filterDefs.length; i++) {
            (function (fd) {
                var fbtn = self._el('button', 'mu20-filter-btn');
                fbtn.textContent = fd.label;
                if (fd.css) fbtn.className += ' ' + fd.css;
                if (fd.key === 'all') fbtn.className += ' mu20-filter-btn--active';
                fbtn.addEventListener('click', function () {
                    if (fd.key === 'all') {
                        self._statusFilter = { ok: true, warn: true, critical: true };
                    } else {
                        self._statusFilter[fd.key] = !self._statusFilter[fd.key];
                    }
                    self._updateFilterBtns();
                    self._applyStatusFilter();
                });
                self._filterBtns[fd.key] = fbtn;
                filterBar.appendChild(fbtn);
            })(filterDefs[i]);
        }
        container.appendChild(filterBar);

        // -- Owner Filter Chips --
        self._ownerChips = {};
        self._ownerFilter = (self._opts.OwnerFilter) || 'all';
        var ownerBar = self._el('div', 'mu20-owner-filter');
        ownerBar.setAttribute('dir', 'rtl');
        var ownerDefs = [
            { key: 'all',     label: '\u05D4\u05DB\u05DC' },
            { key: 'hhi',     label: '\u05D7\u05D7\u05F4\u05D9' },
            { key: 'private', label: '\u05E4\u05E8\u05D8\u05D9' }
        ];
        for (i = 0; i < ownerDefs.length; i++) {
            (function (od) {
                var chip = self._el('button', 'mu20-chip');
                var chipLabel = document.createTextNode(od.label + ' ');
                chip.appendChild(chipLabel);
                if (od.key !== 'all') {
                    var countSpan = self._el('span', 'mu20-chip-count');
                    countSpan.textContent = '0';
                    chip.appendChild(countSpan);
                }
                if (self._ownerFilter === od.key) {
                    chip.className += ' mu20-chip--active';
                }
                chip.addEventListener('click', function () {
                    self._ownerFilter = od.key;
                    self._opts.OwnerFilter = od.key;
                    self._updateOwnerChips();
                    self._applyOwnerFilter();
                });
                self._ownerChips[od.key] = chip;
                ownerBar.appendChild(chip);
            })(ownerDefs[i]);
        }
        self._ownerBar = ownerBar;
        container.appendChild(ownerBar);

        // -- Sensitivity Matrix --
        self._sensitivityEl = self._el('div', 'mu20-sensitivity');
        self._sensitivityEl.dir = 'rtl';
        container.appendChild(self._sensitivityEl);

        // -- Cards Container --
        self._cardsContainer = self._el('div', 'mu20-grid');
        container.appendChild(self._cardsContainer);

        // Build site cards
        self._buildCards(sites);

        // -- Global Search Overlay --
        self._buildSearchOverlay(container);

        // -- Gear Modals (unit + site) --
        self._buildGearModal(container);
        self._buildSiteGearModal(container);

        // -- Tooltip --
        self._tooltipEl = self._el('div', 'mu20-tooltip');
        self._tooltipEl.style.display = 'none';
        self._tooltipEl.style.position = 'absolute';
        container.appendChild(self._tooltipEl);

        // -- Bus subscriptions --
        if (self._bus) {
            self._busHandlers = {};

            // Note: search:query is handled by orchestrator's shell-level overlay.
            // siteGrid only responds to search:highlight for card scrolling/flash.

            self._busHandlers['demo:toggle'] = function (d) {
                self._opts.demoMode = d.enabled;
            };
            self._bus.on('demo:toggle', self._busHandlers['demo:toggle'], self);

            self._busHandlers['unit:selected'] = function (d) {
                if (d && d.siteId !== undefined && d.unitIdx !== undefined) {
                    self._scrollToUnit(d.siteId, d.unitIdx);
                }
            };
            self._bus.on('unit:selected', self._busHandlers['unit:selected'], self);

            self._busHandlers['search:highlight'] = function (info) {
                var card = self._container.querySelector(
                    '[data-site="' + info.siteId + '"][data-unit="' + info.siteId + '_u' + info.unitIdx + '"]');
                if (!card) {
                    // Try finding the unit row directly
                    card = self._container.querySelector('[data-unit="' + info.siteId + '_u' + info.unitIdx + '"]');
                }
                if (!card) return;
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                card.classList.add('mu20-highlight-flash');
                setTimeout(function () { card.classList.remove('mu20-highlight-flash'); }, 2000);
            };
            self._bus.on('search:highlight', self._busHandlers['search:highlight'], self);
        }

        // Mount into containerEl
        self._containerEl.appendChild(container);
        self._container = container;

        // Record initial size
        self._lastWidth  = self._containerEl.offsetWidth  || 0;
        self._lastHeight = self._containerEl.offsetHeight || 0;

        // Show skeleton state
        self._showSkeleton();
    };


    // =============================================================
    //  update() -- CSS Variable batch render
    // =============================================================

    /**
     * Receives canonical payload from orchestrator.
     * Extracts renderState (pre-computed by Worker) and does DOM updates via CSS Variables.
     * @param {Object} payload - canonical { rawSites, renderState, siteDefs, ts }
     *                           OR legacy { [unitKey]: {...} } for backward compat
     */
    Mu20SiteGrid.prototype.update = function (payload) {
        var self = this;
        if (self._destroyed || !payload) return;

        // Canonical payload normalization
        var processedData = payload.renderState || payload;
        self._lastData = processedData;
        self._dataVer++;

        // Cancel any pending rAF to avoid double-painting
        if (self._rAF) { cancelAnimationFrame(self._rAF); }

        self._rAF = requestAnimationFrame(function () {
            self._batchUpdate(processedData);
            self._rAF = null;
        });
    };


    // =============================================================
    //  _batchUpdate() -- Actual DOM update inside rAF
    // =============================================================

    Mu20SiteGrid.prototype._batchUpdate = function (data) {
        var self = this;
        if (self._destroyed) return;

        // Remove skeleton if first real update
        self._hideSkeleton();

        var sites = self._opts.sites;
        var decimals = self._opts.decimals;

        // Build site-level data lookup for status filter + sensitivity
        var siteDataMap = {};
        var s, u, site, siteData, unitKey, ud, els, pct, tteHrs;

        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            siteData = {};
            for (u = 0; u < site.units.length; u++) {
                unitKey = self._unitKey(site.id, u);
                ud = data[unitKey];
                els = self._unitRows[unitKey];
                if (!els) continue;

                if (!ud) {
                    // No data -- reset to defaults
                    els.fill.style.setProperty('--bar-width', '0%');
                    els.fill.className = 'mu20-quota-bar__fill mu20-quota-bar__fill--ok';
                    els.label.textContent = '--';
                    els.tte.textContent = '--';
                    self._removeClass(els.tte, 'mu20-tte-badge--low');
                    siteData[u] = { status: 'ok' };
                    continue;
                }

                // -- GPU-composited CSS Variable updates --
                pct = Math.min(ud.pct || 0, 100);
                els.fill.style.setProperty('--bar-width', pct + '%');

                // Status class swap (single className write)
                els.fill.className = 'mu20-quota-bar__fill mu20-quota-bar__fill--' + (ud.status || 'ok');

                // Highlight units over quota threshold
                if (self._opts.highlightOverQuota && pct >= (self._opts.critPct || 90) && els.row) {
                    self._addClass(els.row, 'mu20-unit--over-quota');
                } else if (els.row) {
                    self._removeClass(els.row, 'mu20-unit--over-quota');
                }

                // Count-up animation for percentage label
                self._animateCountUp(unitKey, els.label, ud.pct || 0, decimals);

                // TTE badge
                if (ud.tte !== undefined && ud.tte !== Infinity && ud.tte !== null) {
                    tteHrs = Math.round(ud.tte);
                    els.tte.textContent = tteHrs + 'h';
                    if (tteHrs < 168) {
                        self._addClass(els.tte, 'mu20-tte-badge--low');
                    } else {
                        self._removeClass(els.tte, 'mu20-tte-badge--low');
                    }
                } else {
                    els.tte.textContent = '\u221E';
                    self._removeClass(els.tte, 'mu20-tte-badge--low');
                }

                // -- Designation badge --
                if (els.desBadge) {
                    var desVal = ud.designation;
                    if (desVal && (desVal.display || desVal)) {
                        els.desBadge.textContent = desVal.display || desVal;
                        els.desBadge.style.display = '';
                    } else {
                        els.desBadge.style.display = 'none';
                    }
                }

                // -- Hours left --
                if (els.hoursLeft) {
                    if (ud.hoursLeft && !ud.noQuota) {
                        els.hoursLeft.textContent = '\u05E0\u05D5\u05EA\u05E8\u05D5: ' + (ud.hoursLeft.display || ud.hoursLeft) + ' \u05E9\u05E2\u05D5\u05EA';
                        els.hoursLeft.style.display = '';
                    } else {
                        els.hoursLeft.style.display = 'none';
                    }
                }

                // -- Runtime formatted tooltip on hours label --
                if (ud.runtimeFormatted) {
                    els.label.title = ud.runtimeFormatted.display || ud.runtimeFormatted;
                } else {
                    els.label.title = '';
                }

                // -- noQuota / stale styling --
                var cardRef = self._siteCards[site.id];
                if (ud.noQuota && cardRef) {
                    self._addClass(cardRef.card, 'mu20-no-quota');
                }
                if (ud.stale && cardRef) {
                    self._addClass(cardRef.card, 'mu20-stale');
                    // Add stale icon to header if not already there
                    if (!cardRef._staleIcon) {
                        var staleIcon = self._el('span', 'mu20-stale-icon');
                        staleIcon.textContent = '\u26A0';
                        staleIcon.title = '\u05E2\u05D5\u05D3\u05DB\u05DF \u05DC\u05D0\u05D7\u05E8\u05D5\u05E0\u05D4: ' + (ud.staleAge || '?') + ' \u05D3\u05E7\u05D5\u05EA';
                        cardRef.header.appendChild(staleIcon);
                        cardRef._staleIcon = staleIcon;
                    }
                }

                siteData[u] = ud;
            }
            siteDataMap[site.id] = siteData;
        }

        // Store structured data for sort / filter / tooltip
        self._siteDataMap = siteDataMap;

        // Update sensitivity matrix
        self._updateSensitivity(siteDataMap);

        // Update owner chip counts
        self._updateOwnerCounts();

        // Re-apply filters
        self._applyStatusFilter();
        self._applyOwnerFilter();
    };


    // =============================================================
    //  Count-up Animation (300ms rAF based)
    // =============================================================

    Mu20SiteGrid.prototype._animateCountUp = function (unitKey, labelEl, toVal, decimals) {
        var self = this;
        var existing = self._animTimers[unitKey];

        // Parse current displayed value as "from"
        var currentText = labelEl.textContent || '';
        var fromVal = parseFloat(currentText);
        if (isNaN(fromVal)) fromVal = 0;

        // If no meaningful change, just set directly
        var diff = Math.abs(toVal - fromVal);
        if (diff < 0.05) {
            labelEl.textContent = self._fmtNum(toVal, decimals) + '%';
            return;
        }

        // Cancel any running animation for this unit
        if (existing && existing.raf) {
            cancelAnimationFrame(existing.raf);
        }

        var duration = 300; // ms
        var startTime = -1;
        var from = fromVal;
        var to = toVal;

        function step(timestamp) {
            if (self._destroyed) return;
            if (startTime < 0) startTime = timestamp;
            var elapsed = timestamp - startTime;
            var progress = Math.min(elapsed / duration, 1);
            // easeOutQuad
            var ease = 1 - (1 - progress) * (1 - progress);
            var current = from + (to - from) * ease;
            labelEl.textContent = self._fmtNum(current, decimals) + '%';
            if (progress < 1) {
                self._animTimers[unitKey] = { raf: requestAnimationFrame(step), from: from, to: to, el: labelEl };
            } else {
                labelEl.textContent = self._fmtNum(to, decimals) + '%';
                self._animTimers[unitKey] = null;
            }
        }

        self._animTimers[unitKey] = { raf: requestAnimationFrame(step), from: from, to: to, el: labelEl };
    };


    // =============================================================
    //  updateSparkline() -- SVG path from Worker
    // =============================================================

    Mu20SiteGrid.prototype.updateSparkline = function (payload) {
        var self = this;
        if (self._destroyed) return;
        var unitKey = payload.unitKey;
        var svgPath = payload.svgPath;
        var els = self._unitRows[unitKey];
        if (!els || !els.spark) return;
        var polyline = els.spark.querySelector('polyline');
        if (polyline) polyline.setAttribute('points', svgPath);
    };


    // =============================================================
    //  _updateSensitivity() -- Aggregation Display
    // =============================================================

    Mu20SiteGrid.prototype._updateSensitivity = function (siteDataMap) {
        var self = this;
        if (!self._sensitivityEl) return;
        var sites = self._opts.sites;
        var totalMW = 0, warnMW = 0, critMW = 0;
        var totalUnits = 0, okUnits = 0, warnUnits = 0, critUnits = 0;
        var s, u, site, sd, unitKey, us, mw, ud, status;

        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            sd = siteDataMap[site.id] || {};
            for (u = 0; u < site.units.length; u++) {
                totalUnits++;
                unitKey = self._unitKey(site.id, u);
                us = self._opts.unitSettings[unitKey];
                mw = (us && us.maxMW) ? us.maxMW : 100;
                totalMW += mw;
                ud = sd[u];
                status = (ud && ud.status) ? ud.status : 'ok';
                if (status === 'critical') { critUnits++; critMW += mw; }
                else if (status === 'warn') { warnUnits++; warnMW += mw; }
                else { okUnits++; }
            }
        }

        // innerHTML is safe here: only numbers from our own computation
        self._sensitivityEl.innerHTML =
            '<div class="mu20-sens-grid">' +
                '<div class="mu20-sens-cell mu20-sens-total">' +
                    '<div class="mu20-sens-value">' + totalMW + '</div>' +
                    '<div class="mu20-sens-label">MW \u05E1\u05D4\u05F4\u05DB</div>' +
                '</div>' +
                '<div class="mu20-sens-cell mu20-sens-ok">' +
                    '<div class="mu20-sens-value">' + okUnits + '</div>' +
                    '<div class="mu20-sens-label">\u05EA\u05E7\u05D9\u05DF</div>' +
                '</div>' +
                '<div class="mu20-sens-cell mu20-sens-warn">' +
                    '<div class="mu20-sens-value">' + warnUnits + '</div>' +
                    '<div class="mu20-sens-label">\u05D0\u05D6\u05D4\u05E8\u05D4</div>' +
                '</div>' +
                '<div class="mu20-sens-cell mu20-sens-crit">' +
                    '<div class="mu20-sens-value">' + critUnits + '</div>' +
                    '<div class="mu20-sens-label">\u05E7\u05E8\u05D9\u05D8\u05D9</div>' +
                '</div>' +
                '<div class="mu20-sens-cell">' +
                    '<div class="mu20-sens-value">' + warnMW + '</div>' +
                    '<div class="mu20-sens-label">MW \u05D1\u05E1\u05D9\u05DB\u05D5\u05DF</div>' +
                '</div>' +
                '<div class="mu20-sens-cell mu20-sens-crit">' +
                    '<div class="mu20-sens-value">' + critMW + '</div>' +
                    '<div class="mu20-sens-label">MW \u05E7\u05E8\u05D9\u05D8\u05D9</div>' +
                '</div>' +
            '</div>';
    };


    // =============================================================
    //  sort() -- Reorder cards (DOM reappend)
    // =============================================================

    Mu20SiteGrid.prototype.sort = function (order) {
        this._opts.sortOrder = order;
        this._updateSortBtns();
        this._sortAndRender();
    };

    Mu20SiteGrid.prototype._sortAndRender = function () {
        var self = this;
        var sites = self._opts.sites;
        var data  = self._siteDataMap || {};
        var order = self._opts.sortOrder;

        // Cache hit check
        var cache = self._sortCache;
        if (cache && cache.order === order && cache.dataVer === self._dataVer && cache.arr) {
            var ci;
            for (ci = 0; ci < cache.arr.length; ci++) {
                var sc = self._siteCards[cache.arr[ci]];
                if (sc && sc.card) self._cardsContainer.appendChild(sc.card);
            }
            return;
        }

        // Build sortable array
        var sortable = [];
        var s, u, site, sd, avgPct, totalHours, totalHoursLeft, minTte, worstStatus, count, ud, sv, hlVal, siteHoursYtd;

        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            sd = data[site.id] || {};
            avgPct = 0;
            totalHours = 0;
            totalHoursLeft = 0;
            minTte = Infinity;
            worstStatus = 0;
            siteHoursYtd = null;
            count = site.units.length;
            for (u = 0; u < count; u++) {
                ud = sd[u];
                if (ud) {
                    avgPct += (ud.pct || 0);
                    totalHours += (ud.hours || 0);
                    hlVal = ud.hoursLeft;
                    if (hlVal) {
                        totalHoursLeft += (typeof hlVal === 'number' ? hlVal : (parseFloat(hlVal.display || hlVal) || 0));
                    }
                    if (ud.tte < minTte) minTte = ud.tte;
                    sv = ud.status === 'critical' ? 2 : ud.status === 'warn' ? 1 : 0;
                    if (sv > worstStatus) worstStatus = sv;
                    // Grab siteHoursYtd from first unit that has it (site-level value)
                    if (siteHoursYtd === null && ud.siteHoursYtd !== undefined && ud.siteHoursYtd !== null) {
                        siteHoursYtd = typeof ud.siteHoursYtd === 'object' ? ud.siteHoursYtd.numeric : parseFloat(ud.siteHoursYtd);
                    }
                }
            }
            avgPct = count > 0 ? avgPct / count : 0;
            sortable.push({
                id: site.id,
                name: site.name,
                avgPct: avgPct,
                totalHours: totalHours,
                totalHoursLeft: totalHoursLeft,
                minTte: minTte,
                worstStatus: worstStatus,
                siteHoursYtd: isFinite(siteHoursYtd) ? siteHoursYtd : 0
            });
        }

        // Sort
        sortable.sort(function (a, b) {
            switch (order) {
                case 'pct':          return b.avgPct - a.avgPct;
                case 'hours':        return b.totalHours - a.totalHours;
                case 'tte':          return a.minTte - b.minTte;
                case 'status':       return b.worstStatus - a.worstStatus;
                case 'hoursLeft':    return a.totalHoursLeft - b.totalHoursLeft;
                case 'siteHoursYtd': return b.siteHoursYtd - a.siteHoursYtd;
                default:             return a.name.localeCompare(b.name, 'he');
            }
        });

        // Re-order DOM + cache
        var sortedIds = [];
        var si, item;
        for (si = 0; si < sortable.length; si++) {
            item = sortable[si];
            sortedIds.push(item.id);
            var scx = self._siteCards[item.id];
            if (scx && scx.card) self._cardsContainer.appendChild(scx.card);
        }
        self._sortCache = { order: order, dataVer: self._dataVer, arr: sortedIds };
    };


    // =============================================================
    //  filter() -- Text + Status filtering
    // =============================================================

    Mu20SiteGrid.prototype.filter = function (text, statusFilter) {
        if (text !== undefined) this._filterText = text;
        if (statusFilter) this._statusFilter = statusFilter;
        this._applyFilter();
        this._applyStatusFilter();
    };

    Mu20SiteGrid.prototype._applyFilter = function () {
        var self = this;
        var term = (self._filterText || '').toLowerCase();
        var sites = self._opts.sites;
        var s, u, site, sc, anyVisible, unitKey, els, match;

        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            sc = self._siteCards[site.id];
            if (!sc) continue;
            anyVisible = false;
            for (u = 0; u < site.units.length; u++) {
                unitKey = self._unitKey(site.id, u);
                els = self._unitRows[unitKey];
                if (!els) continue;
                match = !term ||
                    site.name.toLowerCase().indexOf(term) >= 0 ||
                    site.units[u].toLowerCase().indexOf(term) >= 0 ||
                    site.id.toLowerCase().indexOf(term) >= 0;
                els.row.style.display = match ? '' : 'none';
                if (match) anyVisible = true;
            }
            sc.card.style.display = anyVisible ? '' : 'none';
        }
    };

    Mu20SiteGrid.prototype._applyStatusFilter = function () {
        var self = this;
        var sf = self._statusFilter;
        if (!sf) return;
        var data  = self._siteDataMap || {};
        var sites = self._opts.sites;
        var term  = (self._filterText || '').toLowerCase();
        var s, u, site, sd, sc, anyVisible, unitKey, els, ud, status, visible;

        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            sd = data[site.id] || {};
            sc = self._siteCards[site.id];
            if (!sc) continue;
            anyVisible = false;
            for (u = 0; u < site.units.length; u++) {
                unitKey = self._unitKey(site.id, u);
                els = self._unitRows[unitKey];
                if (!els) continue;
                ud = sd[u];
                status = (ud && ud.status) ? ud.status : 'ok';
                visible = !!sf[status];
                if (visible && term) {
                    visible = site.name.toLowerCase().indexOf(term) >= 0 ||
                              site.units[u].toLowerCase().indexOf(term) >= 0;
                }
                els.row.style.display = visible ? '' : 'none';
                if (visible) anyVisible = true;
            }
            sc.card.style.display = anyVisible ? '' : 'none';
        }
    };


    // =============================================================
    //  Gear Modal -- Unit Settings
    // =============================================================

    Mu20SiteGrid.prototype.openGearModal = function (unitKey, siteId, unitIdx, unitName) {
        var self = this;
        if (self._destroyed || !self._gearOverlay) return;
        self._gearUnitKey = unitKey;
        var settings = self._opts.unitSettings[unitKey] || {};
        var overlay = self._gearOverlay;

        overlay.querySelector('.mu20-gear-title').textContent = '\u2699 \u05D4\u05D2\u05D3\u05E8\u05D5\u05EA: ' + unitName;
        overlay.querySelector('.mu20-gf-displayName').value   = settings.displayName || '';
        overlay.querySelector('.mu20-gf-tagPath').value       = settings.tagPath || '';
        overlay.querySelector('.mu20-gf-maxMW').value         = settings.maxMW || '';
        overlay.querySelector('.mu20-gf-quotaPct').value      = settings.quotaPct || '';
        overlay.querySelector('.mu20-gf-fuelType').value      = settings.fuelType || '';
        overlay.querySelector('.mu20-gf-warnThreshold').value = settings.warnThreshold || '';
        overlay.querySelector('.mu20-gf-critThreshold').value = settings.critThreshold || '';
        overlay.querySelector('.mu20-gf-notes').value         = settings.notes || '';

        overlay.style.display = 'flex';
        overlay.querySelector('.mu20-gf-displayName').focus();
    };

    Mu20SiteGrid.prototype._closeGearModal = function () {
        if (this._gearOverlay) this._gearOverlay.style.display = 'none';
        this._gearUnitKey = null;
    };

    Mu20SiteGrid.prototype._saveGearModal = function () {
        var self = this;
        if (!self._gearUnitKey || !self._gearOverlay) return;
        var o   = self._gearOverlay;
        var key = self._gearUnitKey;
        var settings = {
            displayName:   o.querySelector('.mu20-gf-displayName').value.trim(),
            tagPath:       o.querySelector('.mu20-gf-tagPath').value.trim(),
            maxMW:         parseFloat(o.querySelector('.mu20-gf-maxMW').value) || 0,
            quotaPct:      parseFloat(o.querySelector('.mu20-gf-quotaPct').value) || 0,
            fuelType:      o.querySelector('.mu20-gf-fuelType').value,
            warnThreshold: parseFloat(o.querySelector('.mu20-gf-warnThreshold').value) || 0,
            critThreshold: parseFloat(o.querySelector('.mu20-gf-critThreshold').value) || 0,
            notes:         o.querySelector('.mu20-gf-notes').value.trim()
        };
        self._opts.unitSettings[key] = settings;
        if (self._bus) self._bus.emit('unit:settings', { unitKey: key, settings: settings });
        self._closeGearModal();
    };


    // =============================================================
    //  Gear Modal -- Site Settings
    // =============================================================

    Mu20SiteGrid.prototype.openSiteGearModal = function (siteId, siteName) {
        var self = this;
        if (self._destroyed || !self._siteGearOverlay) return;
        self._siteGearId = siteId;
        var settings = (self._opts.siteSettings || {})[siteId] || {};
        var overlay = self._siteGearOverlay;

        overlay.querySelector('.mu20-gear-title').textContent = '\u2699 \u05D0\u05EA\u05E8: ' + siteName;
        overlay.querySelector('.mu20-sgf-displayName').value  = settings.displayName || '';
        overlay.querySelector('.mu20-sgf-tagPath').value      = settings.tagPath || '';
        overlay.querySelector('.mu20-sgf-maxMW').value        = settings.maxMW || '';
        overlay.querySelector('.mu20-sgf-notes').value        = settings.notes || '';

        overlay.style.display = 'flex';
        overlay.querySelector('.mu20-sgf-displayName').focus();
    };

    Mu20SiteGrid.prototype._closeSiteGearModal = function () {
        if (this._siteGearOverlay) this._siteGearOverlay.style.display = 'none';
        this._siteGearId = null;
    };

    Mu20SiteGrid.prototype._saveSiteGearModal = function () {
        var self = this;
        if (!self._siteGearId || !self._siteGearOverlay) return;
        var o   = self._siteGearOverlay;
        var sid = self._siteGearId;
        var settings = {
            displayName: o.querySelector('.mu20-sgf-displayName').value.trim(),
            tagPath:     o.querySelector('.mu20-sgf-tagPath').value.trim(),
            maxMW:       parseFloat(o.querySelector('.mu20-sgf-maxMW').value) || 0,
            notes:       o.querySelector('.mu20-sgf-notes').value.trim()
        };
        if (!self._opts.siteSettings) self._opts.siteSettings = {};
        self._opts.siteSettings[sid] = settings;
        if (self._bus) self._bus.emit('site:settings', { siteId: sid, settings: settings });
        self._closeSiteGearModal();
    };


    // =============================================================
    //  Global Search (Ctrl+K)
    // =============================================================

    Mu20SiteGrid.prototype.showSearch = function () {
        if (!this._searchOverlay) return;
        this._searchOverlay.style.display = 'flex';
        var input = this._searchOverlay.querySelector('.mu20-search-modal__input');
        if (input) { input.value = ''; input.focus(); }
        var results = this._searchOverlay.querySelector('.mu20-search-results');
        if (results) results.innerHTML = '';
    };

    Mu20SiteGrid.prototype._hideSearch = function () {
        if (this._searchOverlay) this._searchOverlay.style.display = 'none';
    };

    Mu20SiteGrid.prototype._updateSearchResults = function (term) {
        var self = this;
        var container = self._searchOverlay.querySelector('.mu20-search-results');
        container.innerHTML = '';
        if (!term || term.length < 1) return;
        term = term.toLowerCase();

        var sites = self._opts.sites;
        var results = [];
        var s, u, site, unitName;
        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            for (u = 0; u < site.units.length; u++) {
                unitName = site.units[u];
                if (site.name.toLowerCase().indexOf(term) >= 0 ||
                    unitName.toLowerCase().indexOf(term) >= 0 ||
                    site.id.toLowerCase().indexOf(term) >= 0) {
                    results.push({ siteId: site.id, unitIdx: u, siteName: site.name, unitName: unitName });
                }
            }
            if (results.length >= 20) break;
        }

        var ri;
        for (ri = 0; ri < results.length; ri++) {
            (function (res, idx) {
                var item = self._el('div', 'mu20-search-item');
                item.textContent = res.siteName + ' \u2014 ' + res.unitName;
                if (idx === 0) item.className += ' mu20-search-item--focused';
                item.addEventListener('click', function () {
                    self._hideSearch();
                    var unitKey = self._unitKey(res.siteId, res.unitIdx);
                    var els = self._unitRows[unitKey];
                    var sc  = self._siteCards[res.siteId];
                    if (els && sc) {
                        sc.card.style.display = '';
                        els.row.style.display = '';
                        els.row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        self._addClass(els.row, 'mu20-highlight');
                        setTimeout(function () { self._removeClass(els.row, 'mu20-highlight'); }, 2000);
                    }
                    if (self._bus) {
                        self._bus.emit('unit:selected', {
                            siteId: res.siteId, unitIdx: res.unitIdx, unitName: res.unitName
                        });
                    }
                });
                container.appendChild(item);
            })(results[ri], ri);
        }
    };

    Mu20SiteGrid.prototype._moveSearchFocus = function (dir) {
        var self = this;
        var container = self._searchOverlay.querySelector('.mu20-search-results');
        var items = container.querySelectorAll('.mu20-search-item');
        if (!items.length) return;
        var idx = -1;
        var i;
        for (i = 0; i < items.length; i++) {
            if (self._hasClass(items[i], 'mu20-search-item--focused')) idx = i;
        }
        for (i = 0; i < items.length; i++) {
            self._removeClass(items[i], 'mu20-search-item--focused');
        }
        var next = idx + dir;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        self._addClass(items[next], 'mu20-search-item--focused');
    };

    Mu20SiteGrid.prototype._scrollToUnit = function (siteId, unitIdx) {
        var self = this;
        var unitKey = self._unitKey(siteId, unitIdx);
        var els = self._unitRows[unitKey];
        var sc  = self._siteCards[siteId];
        if (els && sc) {
            sc.card.style.display = '';
            els.row.style.display = '';
            els.row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            self._addClass(els.row, 'mu20-highlight');
            setTimeout(function () { self._removeClass(els.row, 'mu20-highlight'); }, 2000);
        }
    };


    // =============================================================
    //  Skeleton Loading State
    // =============================================================

    Mu20SiteGrid.prototype._showSkeleton = function () {
        var self = this;
        if (!self._cardsContainer) return;
        var key;
        for (key in self._unitRows) {
            if (self._unitRows.hasOwnProperty(key)) {
                var els = self._unitRows[key];
                self._addClass(els.fill, 'mu20-skeleton-shimmer');
                els.label.textContent = '';
                els.tte.textContent = '';
            }
        }
    };

    Mu20SiteGrid.prototype._hideSkeleton = function () {
        var self = this;
        var key;
        for (key in self._unitRows) {
            if (self._unitRows.hasOwnProperty(key)) {
                self._removeClass(self._unitRows[key].fill, 'mu20-skeleton-shimmer');
            }
        }
    };


    // =============================================================
    //  Tooltip
    // =============================================================

    Mu20SiteGrid.prototype._showTooltipDelayed = function (e, siteId, unitIdx, unitName) {
        var self = this;
        self._hideTooltip();
        self._tooltipTimer = setTimeout(function () {
            self._showTooltip(e, siteId, unitIdx, unitName);
        }, 200);
    };

    Mu20SiteGrid.prototype._showTooltip = function (e, siteId, unitIdx, unitName) {
        var self = this;
        if (self._destroyed || !self._tooltipEl) return;
        var sd = (self._siteDataMap || {})[siteId] || {};
        var ud = sd[unitIdx] || {};
        var us = (self._opts.unitSettings || {})[self._unitKey(siteId, unitIdx)] || {};

        var html = '<strong>' + self._escHtml(unitName) + '</strong>';
        if (ud.hours !== undefined)  html += '<br>\u05E9\u05E2\u05D5\u05EA: ' + self._fmtNum(ud.hours, 1);
        if (ud.quota !== undefined)  html += '<br>\u05DE\u05DB\u05E1\u05D4: ' + self._fmtNum(ud.quota, 1);
        if (ud.pct !== undefined)    html += '<br>\u05E0\u05D9\u05E6\u05D5\u05DC: ' + self._fmtNum(ud.pct, 1) + '%';
        if (ud.tte !== undefined && ud.tte !== Infinity) html += '<br>TTE: ' + Math.round(ud.tte) + 'h';
        if (us.fuelType)  html += '<br>\u05D3\u05DC\u05E7: ' + us.fuelType;
        if (us.maxMW)     html += '<br>MW \u05DE\u05E8\u05D1\u05D9: ' + us.maxMW;

        self._tooltipEl.innerHTML = html;
        self._tooltipEl.style.display = 'block';

        var rect = self._container.getBoundingClientRect();
        var left = e.clientX - rect.left + 12;
        var top  = e.clientY - rect.top - 10;
        if (left + 200 > rect.width) left = rect.width - 210;
        if (top < 0) top = 5;
        self._tooltipEl.style.left = left + 'px';
        self._tooltipEl.style.top  = top + 'px';
    };

    Mu20SiteGrid.prototype._hideTooltip = function () {
        if (this._tooltipTimer) { clearTimeout(this._tooltipTimer); this._tooltipTimer = null; }
        if (this._tooltipEl) this._tooltipEl.style.display = 'none';
    };


    // =============================================================
    //  onResize() -- Container resize handler
    // =============================================================

    Mu20SiteGrid.prototype.onResize = function () {
        var self = this;
        if (self._destroyed || !self._containerEl) return;

        var newW = self._containerEl.offsetWidth  || 0;
        var newH = self._containerEl.offsetHeight || 0;

        // Only re-sort/filter if size changed significantly (> 50px delta)
        var dw = Math.abs(newW - self._lastWidth);
        var dh = Math.abs(newH - self._lastHeight);

        if (dw > 50 || dh > 50) {
            self._lastWidth  = newW;
            self._lastHeight = newH;
            self._sortCache = null;  // invalidate sort cache
            self._sortAndRender();
            self._applyStatusFilter();
        }
    };


    // =============================================================
    //  onTabActivated() -- Re-render after display:none -> block
    // =============================================================

    Mu20SiteGrid.prototype.onTabActivated = function () {
        var self = this;
        if (self._destroyed) return;

        // Re-render with last known data to fix canvas/scroll after hidden
        if (self._lastData) {
            self._batchUpdate(self._lastData);
        }

        // Update container size tracking
        if (self._containerEl) {
            self._lastWidth  = self._containerEl.offsetWidth  || 0;
            self._lastHeight = self._containerEl.offsetHeight || 0;
        }
    };


    // =============================================================
    //  setOption() -- Live config update
    // =============================================================

    Mu20SiteGrid.prototype.setOption = function (key, value) {
        var self = this;
        if (self._destroyed) return;
        self._opts[key] = value;
        // Re-render on display-affecting changes
        if (key === 'sortOrder' || key === 'showSparklines' || key === 'showTte' ||
            key === 'showQuota' || key === 'decimals' || key === 'warnPct' || key === 'critPct' ||
            key === 'useThousandsSep' || key === 'highlightOverQuota') {
            if (self._lastData) self._batchUpdate(self._lastData);
        }
        // Toggle fav buttons visibility
        if (key === 'favoritesEnabled') {
            var display = value === false ? 'none' : '';
            for (var uk in self._unitRows) {
                if (self._unitRows.hasOwnProperty(uk) && self._unitRows[uk].fav) {
                    self._unitRows[uk].fav.style.display = display;
                }
            }
        }
    };


    // =============================================================
    //  destroy() -- Full cleanup
    // =============================================================

    Mu20SiteGrid.prototype.destroy = function () {
        var self = this;
        self._destroyed = true;

        // Cancel pending rAF
        if (self._rAF) { cancelAnimationFrame(self._rAF); self._rAF = null; }

        // Cancel count-up animations
        var ak;
        for (ak in self._animTimers) {
            if (self._animTimers.hasOwnProperty(ak) && self._animTimers[ak] && self._animTimers[ak].raf) {
                cancelAnimationFrame(self._animTimers[ak].raf);
            }
        }
        self._animTimers = {};

        // Tooltip timer
        if (self._tooltipTimer) { clearTimeout(self._tooltipTimer); self._tooltipTimer = null; }

        // FIX #10: keydown is now handled by orchestrator on shell
        // (no document listener to remove)

        // Bus cleanup
        if (self._bus && self._busHandlers) {
            var ch;
            for (ch in self._busHandlers) {
                if (self._busHandlers.hasOwnProperty(ch)) {
                    self._bus.off(ch, self._busHandlers[ch]);
                }
            }
            self._busHandlers = null;
        }

        // Clear maps
        self._siteCards  = {};
        self._unitRows   = {};
        self._sortBtns   = {};
        self._filterBtns = {};

        // Clear DOM
        if (self._container && self._container.parentNode) {
            self._container.parentNode.removeChild(self._container);
        }

        // Nullify refs
        self._container       = null;
        self._containerEl     = null;
        self._cardsContainer  = null;
        self._sensitivityEl   = null;
        self._tooltipEl       = null;
        self._gearOverlay     = null;
        self._siteGearOverlay = null;
        self._searchOverlay   = null;
        self._searchInput     = null;
        self._sortCache       = null;
        self._lastData        = null;
        self._siteDataMap     = null;
        self._ownerChips      = null;
        self._ownerBar        = null;
        self._siteDefs        = null;
    };


    // =============================================================
    //  PRIVATE: DOM Builders
    // =============================================================

    /**
     * _buildCards -- Create site cards and unit rows
     */
    Mu20SiteGrid.prototype._buildCards = function (sites) {
        var self = this;
        self._cardsContainer.textContent = '';
        self._siteCards = {};
        self._unitRows  = {};
        self._siteDefs  = sites;

        var s, u, site, card, header, nameSpan, metaSpan, metaR, metaF, metaU;
        var siteGearBtn, body, unitKey, row, favBtn, uName, barWrap, barFill;
        var barLabel, tteBadge, sparkSvg, polyline, annotBtn, gearBtn, ownerBadge;

        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            card = self._el('div', 'mu20-card');
            card.setAttribute('data-site', site.id);

            // -- Header --
            header = self._el('div', 'mu20-card__header');
            nameSpan = self._el('span', 'mu20-card__name');
            nameSpan.textContent = site.name;

            // Meta info (small text after name)
            metaSpan = self._el('span', 'mu20-card__meta');
            metaR = self._el('span', '');
            metaR.textContent = site.region || '';
            metaF = self._el('span', '');
            metaF.textContent = site.fuel || '';
            metaU = self._el('span', '');
            metaU.textContent = site.units.length + ' \u05D9\u05D7\u05D9\u05D3\u05D5\u05EA';
            metaSpan.appendChild(metaR);
            metaSpan.appendChild(metaF);
            metaSpan.appendChild(metaU);

            header.appendChild(nameSpan);
            header.appendChild(metaSpan);

            // Site gear button
            siteGearBtn = self._el('button', 'mu20-gear-btn mu20-site-gear-btn');
            siteGearBtn.title = '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D0\u05EA\u05E8';
            siteGearBtn.textContent = '\u2699';
            (function (sid, sname) {
                siteGearBtn.addEventListener('click', function (e) {
                    e.stopPropagation();
                    self.openSiteGearModal(sid, sname);
                });
                header.addEventListener('click', function () {
                    if (self._bus) self._bus.emit('site:selected', { siteId: sid, siteName: sname });
                });
            })(site.id, site.name);
            header.appendChild(siteGearBtn);

            // Owner badge
            ownerBadge = self._el('span', 'mu20-owner-badge mu20-owner-badge--' + (site.owner || 'unknown').toLowerCase());
            ownerBadge.textContent = site.ownerLabel || '';
            header.appendChild(ownerBadge);

            card.appendChild(header);

            // -- Body (unit rows) --
            body = self._el('div', 'mu20-card__body');

            for (u = 0; u < site.units.length; u++) {
                unitKey = self._unitKey(site.id, u);
                row = self._el('div', 'mu20-unit');
                row.setAttribute('data-unit', unitKey);

                // Favorite (visible only when FavoritesEnabled)
                favBtn = self._el('button', 'mu20-fav-btn');
                favBtn.title = '\u05DE\u05D5\u05E2\u05D3\u05E3';
                favBtn.textContent = self._opts.favorites[unitKey] ? '\u2605' : '\u2606';
                if (self._opts.favorites[unitKey]) {
                    favBtn.className += ' mu20-fav-btn--active';
                }
                if (self._opts.favoritesEnabled === false) {
                    favBtn.style.display = 'none';
                }
                (function (key, btn) {
                    btn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        self._toggleFavorite(key, btn);
                    });
                })(unitKey, favBtn);

                // Unit name
                uName = self._el('span', 'mu20-unit__name');
                uName.textContent = site.units[u];

                // Quota bar
                barWrap = self._el('div', 'mu20-quota-bar');
                barFill = self._el('div', 'mu20-quota-bar__fill mu20-quota-bar__fill--ok');
                barLabel = self._el('span', 'mu20-unit__pct');
                barLabel.textContent = '--';
                barWrap.appendChild(barFill);
                barWrap.appendChild(barLabel);

                // TTE badge
                tteBadge = self._el('span', 'mu20-tte-badge');
                tteBadge.textContent = '--';

                // Sparkline SVG
                sparkSvg = null;
                if (self._opts.showSparklines) {
                    sparkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    sparkSvg.setAttribute('class', 'mu20-sparkline');
                    sparkSvg.setAttribute('viewBox', '0 0 60 16');
                    sparkSvg.setAttribute('preserveAspectRatio', 'none');
                    polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                    polyline.setAttribute('points', '');
                    sparkSvg.appendChild(polyline);
                }

                // Annotation button
                annotBtn = self._el('button', 'mu20-annot-btn');
                annotBtn.title = '\u05D4\u05E2\u05E8\u05D5\u05EA';
                annotBtn.textContent = '\u270E';
                if (self._opts.annotations[unitKey] && self._opts.annotations[unitKey].length) {
                    annotBtn.className += ' mu20-annot-btn--has-notes';
                }

                // Unit gear button
                gearBtn = self._el('button', 'mu20-gear-btn');
                gearBtn.title = '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D9\u05D7\u05D9\u05D3\u05D4';
                gearBtn.textContent = '\u2699';
                (function (key, sid, uidx, uname) {
                    gearBtn.addEventListener('click', function (e) {
                        e.stopPropagation();
                        self.openGearModal(key, sid, uidx, uname);
                    });
                })(unitKey, site.id, u, site.units[u]);

                // Unit events button (QA15)
                var evtBtn = null;
                if (self._opts.enableUnitEvents !== false) {
                    evtBtn = self._el('button', 'mu20-unit-evt-btn');
                    evtBtn.textContent = '\u23F1';
                    evtBtn.title = '\u05D4\u05E6\u05D2 \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD';
                    evtBtn.style.cssText = 'font-size:10px;cursor:pointer;background:none;border:1px solid #30363d;border-radius:3px;padding:1px 4px;color:#8b949e;';
                    (function (sid, uidx) {
                        evtBtn.addEventListener('click', function (e) {
                            e.stopPropagation();
                            self._bus.emit('unit:eventsRequested', { siteId: sid, unitIdx: uidx });
                        });
                    })(site.id, u);
                }

                // Designation badge placeholder (populated during update)
                var desBadge = self._el('span', 'mu20-designation');
                desBadge.style.display = 'none';

                // Hours-left placeholder (populated during update)
                var hlDiv = self._el('div', 'mu20-hours-left');
                hlDiv.style.display = 'none';

                // Assemble row
                row.appendChild(desBadge);
                row.appendChild(favBtn);
                row.appendChild(uName);
                row.appendChild(barWrap);
                row.appendChild(tteBadge);
                row.appendChild(hlDiv);
                if (sparkSvg) row.appendChild(sparkSvg);
                row.appendChild(annotBtn);
                if (evtBtn) row.appendChild(evtBtn);
                row.appendChild(gearBtn);

                // Click to select unit
                (function (sid, uidx, uname, uKey) {
                    row.addEventListener('click', function () {
                        if (self._bus) {
                            self._bus.emit('unit:selected', {
                                siteId: sid, unitIdx: uidx, unitName: uname
                            });
                        }
                    });
                    // Double-click to open trend
                    row.addEventListener('dblclick', function (e) {
                        e.preventDefault();
                        var usettings = (self._opts.unitSettings || {})[uKey];
                        var tagPath = usettings ? usettings.tagPath : '';
                        if (!tagPath) return;
                        var base = self._opts.trendBaseUrl || '';
                        if (base) {
                            window.open(base + '/#/Displays/Trend/' + encodeURIComponent(tagPath), '_blank');
                        }
                    });
                    // Hover tooltip
                    row.addEventListener('mouseenter', function (e) {
                        self._showTooltipDelayed(e, sid, uidx, uname);
                    });
                    row.addEventListener('mouseleave', function () {
                        self._hideTooltip();
                    });
                })(site.id, u, site.units[u], unitKey);

                body.appendChild(row);

                // Store references in map
                self._unitRows[unitKey] = {
                    row:         row,
                    name:        uName,
                    fill:        barFill,
                    label:       barLabel,
                    tte:         tteBadge,
                    fav:         favBtn,
                    spark:       sparkSvg,
                    annot:       annotBtn,
                    gear:        gearBtn,
                    desBadge:    desBadge,
                    hoursLeft:   hlDiv
                };
            }

            card.appendChild(body);
            self._cardsContainer.appendChild(card);
            self._siteCards[site.id] = { card: card, header: header, body: body };
        }
    };


    /**
     * _buildSearchOverlay -- Ctrl+K global search
     */
    Mu20SiteGrid.prototype._buildSearchOverlay = function (parent) {
        var self = this;
        var overlay = self._el('div', 'mu20-sg-search-overlay');
        overlay.style.display = 'none';

        var modal = self._el('div', 'mu20-search-modal');
        var input = self._el('input', 'mu20-search-modal__input');
        input.type = 'text';
        input.placeholder = 'Ctrl+K \u05D7\u05D9\u05E4\u05D5\u05E9 \u05DE\u05D4\u05D9\u05E8...';
        input.dir = 'rtl';
        var results = self._el('div', 'mu20-search-results');

        input.addEventListener('input', function () { self._updateSearchResults(input.value); });
        input.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                self._hideSearch();
            } else if (e.key === 'Enter') {
                var focused = results.querySelector('.mu20-search-item--focused');
                if (focused) focused.click();
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                self._moveSearchFocus(1);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                self._moveSearchFocus(-1);
            }
        });

        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) self._hideSearch();
        });

        modal.appendChild(input);
        modal.appendChild(results);
        overlay.appendChild(modal);
        parent.appendChild(overlay);
        self._searchOverlay = overlay;
    };


    /**
     * _buildGearModal -- Unit settings modal
     */
    Mu20SiteGrid.prototype._buildGearModal = function (parent) {
        var self = this;
        var overlay = self._el('div', 'mu20-gear-overlay');
        overlay.style.display = 'none';

        // Using innerHTML for the modal scaffold (controlled, XSS-safe template with labels only)
        overlay.innerHTML =
            '<div class="mu20-gear-modal" dir="rtl">' +
                '<div class="mu20-gear-header">' +
                    '<span class="mu20-gear-title"></span>' +
                    '<button class="mu20-gear-close">\u2715</button>' +
                '</div>' +
                '<div class="mu20-gear-body">' +
                    '<div class="mu20-gear-field"><label>\u05E9\u05DD \u05EA\u05E6\u05D5\u05D2\u05D4:</label><input class="mu20-input mu20-gf-displayName" type="text" placeholder="\u05E9\u05DD \u05D7\u05DC\u05D5\u05E4\u05D9..." /></div>' +
                    '<div class="mu20-gear-field"><label>\u05E0\u05EA\u05D9\u05D1 AF:</label><input class="mu20-input mu20-gf-tagPath" type="text" dir="ltr" placeholder="\\\\AF\\Server\\DB\\...|Attr" /></div>' +
                    '<div class="mu20-gear-row">' +
                        '<div class="mu20-gear-field mu20-gear-half"><label>MW \u05DE\u05E8\u05D1\u05D9:</label><input class="mu20-input mu20-gf-maxMW" type="number" min="0" step="1" /></div>' +
                        '<div class="mu20-gear-field mu20-gear-half"><label>% \u05DE\u05DB\u05E1\u05D4:</label><input class="mu20-input mu20-gf-quotaPct" type="number" min="0" max="100" step="0.1" /></div>' +
                    '</div>' +
                    '<div class="mu20-gear-field"><label>\u05E1\u05D5\u05D2 \u05D3\u05DC\u05E7:</label>' +
                        '<select class="mu20-input mu20-gf-fuelType">' +
                            '<option value="">\u2014 \u05DC\u05D0 \u05E0\u05D1\u05D7\u05E8 \u2014</option>' +
                            '<option value="gas">\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9</option>' +
                            '<option value="coal">\u05E4\u05D7\u05DD</option>' +
                            '<option value="solar">\u05E1\u05D5\u05DC\u05D0\u05E8\u05D9</option>' +
                            '<option value="wind">\u05E8\u05D5\u05D7</option>' +
                            '<option value="diesel">\u05D3\u05D9\u05D6\u05DC</option>' +
                            '<option value="ccgt">CCGT</option>' +
                            '<option value="steam">\u05E7\u05D9\u05D8\u05D5\u05E8</option>' +
                        '</select>' +
                    '</div>' +
                    '<div class="mu20-gear-row">' +
                        '<div class="mu20-gear-field mu20-gear-half"><label>\u05E1\u05E3 \u05D0\u05D6\u05D4\u05E8\u05D4 (%):</label><input class="mu20-input mu20-gf-warnThreshold" type="number" min="0" max="100" step="1" /></div>' +
                        '<div class="mu20-gear-field mu20-gear-half"><label>\u05E1\u05E3 \u05E7\u05E8\u05D9\u05D8\u05D9 (%):</label><input class="mu20-input mu20-gf-critThreshold" type="number" min="0" max="100" step="1" /></div>' +
                    '</div>' +
                    '<div class="mu20-gear-field"><label>\u05D4\u05E2\u05E8\u05D5\u05EA:</label><textarea class="mu20-input mu20-gf-notes" rows="3" placeholder="\u05D4\u05E2\u05E8\u05D5\u05EA \u05D7\u05D5\u05E4\u05E9\u05D9\u05D5\u05EA..."></textarea></div>' +
                '</div>' +
                '<div class="mu20-gear-footer">' +
                    '<button class="mu20-btn mu20-btn--ok mu20-gear-save">\u05E9\u05DE\u05D5\u05E8</button>' +
                    '<button class="mu20-btn mu20-btn--cancel mu20-gear-cancel">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                '</div>' +
            '</div>';

        overlay.querySelector('.mu20-gear-close').addEventListener('click', function () { self._closeGearModal(); });
        overlay.querySelector('.mu20-gear-cancel').addEventListener('click', function () { self._closeGearModal(); });
        overlay.querySelector('.mu20-gear-save').addEventListener('click', function () { self._saveGearModal(); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) self._closeGearModal(); });
        overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') self._closeGearModal(); });

        parent.appendChild(overlay);
        self._gearOverlay = overlay;
    };


    /**
     * _buildSiteGearModal -- Site settings modal
     */
    Mu20SiteGrid.prototype._buildSiteGearModal = function (parent) {
        var self = this;
        var overlay = self._el('div', 'mu20-gear-overlay mu20-site-gear-overlay');
        overlay.style.display = 'none';

        overlay.innerHTML =
            '<div class="mu20-gear-modal" dir="rtl">' +
                '<div class="mu20-gear-header">' +
                    '<span class="mu20-gear-title"></span>' +
                    '<button class="mu20-gear-close">\u2715</button>' +
                '</div>' +
                '<div class="mu20-gear-body">' +
                    '<div class="mu20-gear-field"><label>\u05E9\u05DD \u05EA\u05E6\u05D5\u05D2\u05D4:</label><input class="mu20-input mu20-sgf-displayName" type="text" /></div>' +
                    '<div class="mu20-gear-field"><label>\u05E0\u05EA\u05D9\u05D1 AF \u05D1\u05E1\u05D9\u05E1:</label><input class="mu20-input mu20-sgf-tagPath" type="text" dir="ltr" placeholder="\\\\AF\\Server\\DB\\Plants\\Site" /></div>' +
                    '<div class="mu20-gear-field"><label>MW \u05DE\u05E8\u05D1\u05D9 \u05D0\u05EA\u05E8:</label><input class="mu20-input mu20-sgf-maxMW" type="number" min="0" step="1" /></div>' +
                    '<div class="mu20-gear-field"><label>\u05D4\u05E2\u05E8\u05D5\u05EA:</label><textarea class="mu20-input mu20-sgf-notes" rows="3"></textarea></div>' +
                '</div>' +
                '<div class="mu20-gear-footer">' +
                    '<button class="mu20-btn mu20-btn--ok mu20-sgear-save">\u05E9\u05DE\u05D5\u05E8</button>' +
                    '<button class="mu20-btn mu20-btn--cancel mu20-sgear-cancel">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                '</div>' +
            '</div>';

        overlay.querySelector('.mu20-gear-close').addEventListener('click', function () { self._closeSiteGearModal(); });
        overlay.querySelector('.mu20-sgear-cancel').addEventListener('click', function () { self._closeSiteGearModal(); });
        overlay.querySelector('.mu20-sgear-save').addEventListener('click', function () { self._saveSiteGearModal(); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) self._closeSiteGearModal(); });
        overlay.addEventListener('keydown', function (e) { if (e.key === 'Escape') self._closeSiteGearModal(); });

        parent.appendChild(overlay);
        self._siteGearOverlay = overlay;
    };


    // =============================================================
    //  PRIVATE: Helpers
    // =============================================================

    /** Create element with className(s) */
    Mu20SiteGrid.prototype._el = function (tag, cls) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        return el;
    };

    /** Generate unit key (matches MU20.unitKey pattern) */
    Mu20SiteGrid.prototype._unitKey = function (siteId, unitIdx) {
        return siteId + '_u' + unitIdx;
    };

    /** Format number with fixed decimals */
    Mu20SiteGrid.prototype._fmtNum = function (val, decimals) {
        if (typeof val !== 'number') return '--';
        var str = val.toFixed(decimals);
        if (this._opts.useThousandsSep) {
            var parts = str.split('.');
            parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
            return parts.join('.');
        }
        return str;
    };

    /** HTML-escape text */
    Mu20SiteGrid.prototype._escHtml = function (str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };

    /** Add CSS class (legacy compatible) */
    Mu20SiteGrid.prototype._addClass = function (el, cls) {
        if (!el) return;
        if (el.classList) {
            el.classList.add(cls);
        } else if ((' ' + el.className + ' ').indexOf(' ' + cls + ' ') < 0) {
            el.className += ' ' + cls;
        }
    };

    /** Remove CSS class (legacy compatible) */
    Mu20SiteGrid.prototype._removeClass = function (el, cls) {
        if (!el) return;
        if (el.classList) {
            el.classList.remove(cls);
        } else {
            el.className = (' ' + el.className + ' ').replace(' ' + cls + ' ', ' ').trim();
        }
    };

    /** Check CSS class (legacy compatible) */
    Mu20SiteGrid.prototype._hasClass = function (el, cls) {
        if (!el) return false;
        if (el.classList) return el.classList.contains(cls);
        return (' ' + el.className + ' ').indexOf(' ' + cls + ' ') >= 0;
    };

    /** Toggle favorite state */
    Mu20SiteGrid.prototype._toggleFavorite = function (unitKey, btnEl) {
        var self = this;
        var favs = self._opts.favorites;
        if (favs[unitKey]) {
            delete favs[unitKey];
            self._removeClass(btnEl, 'mu20-fav-btn--active');
            btnEl.textContent = '\u2606';
        } else {
            favs[unitKey] = true;
            self._addClass(btnEl, 'mu20-fav-btn--active');
            btnEl.textContent = '\u2605';
        }
        if (self._bus) self._bus.emit('favorites:changed', { favorites: favs });
    };

    /** Update sort button active states */
    Mu20SiteGrid.prototype._updateSortBtns = function () {
        var self = this;
        var active = self._opts.sortOrder;
        var key;
        for (key in self._sortBtns) {
            if (self._sortBtns.hasOwnProperty(key)) {
                if (key === active) {
                    self._addClass(self._sortBtns[key], 'mu20-sort-btn--active');
                } else {
                    self._removeClass(self._sortBtns[key], 'mu20-sort-btn--active');
                }
            }
        }
    };

    /** Update filter button active states */
    Mu20SiteGrid.prototype._updateFilterBtns = function () {
        var self = this;
        var sf = self._statusFilter;
        var allOn = sf.ok && sf.warn && sf.critical;
        var key;
        for (key in self._filterBtns) {
            if (self._filterBtns.hasOwnProperty(key)) {
                if (key === 'all') {
                    if (allOn) self._addClass(self._filterBtns[key], 'mu20-filter-btn--active');
                    else self._removeClass(self._filterBtns[key], 'mu20-filter-btn--active');
                } else {
                    if (sf[key]) self._addClass(self._filterBtns[key], 'mu20-filter-btn--active');
                    else self._removeClass(self._filterBtns[key], 'mu20-filter-btn--active');
                }
            }
        }
    };

    /** Handle Ctrl+K keyboard shortcut */
    Mu20SiteGrid.prototype._handleKeyDown = function (e) {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.showSearch();
        }
    };


    // =============================================================
    //  Owner Filter Logic
    // =============================================================

    /** Update owner chip active states */
    Mu20SiteGrid.prototype._updateOwnerChips = function () {
        var self = this;
        var active = self._ownerFilter || 'all';
        var key;
        for (key in self._ownerChips) {
            if (self._ownerChips.hasOwnProperty(key)) {
                if (key === active) {
                    self._addClass(self._ownerChips[key], 'mu20-chip--active');
                } else {
                    self._removeClass(self._ownerChips[key], 'mu20-chip--active');
                }
            }
        }
    };

    /** Update owner chip count badges */
    Mu20SiteGrid.prototype._updateOwnerCounts = function () {
        var self = this;
        var sites = self._siteDefs || self._opts.sites || [];
        var counts = { hhi: 0, 'private': 0 };
        var s, site, owner;
        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            owner = (site.owner || '').toLowerCase();
            if (owner === 'hhi') counts.hhi++;
            else if (owner === 'private') counts['private']++;
        }
        var key, chip, countEl;
        for (key in self._ownerChips) {
            if (self._ownerChips.hasOwnProperty(key) && key !== 'all') {
                chip = self._ownerChips[key];
                countEl = chip.querySelector('.mu20-chip-count');
                if (countEl) {
                    countEl.textContent = (counts[key] || 0).toString();
                }
            }
        }
    };

    /** Apply owner filter to cards */
    Mu20SiteGrid.prototype._applyOwnerFilter = function () {
        var self = this;
        var filter = self._ownerFilter || 'all';
        var sites = self._siteDefs || self._opts.sites || [];
        var s, site, sc, owner;
        for (s = 0; s < sites.length; s++) {
            site = sites[s];
            sc = self._siteCards[site.id];
            if (!sc) continue;
            if (filter === 'all') {
                sc.card.style.display = '';
            } else {
                owner = (site.owner || '').toLowerCase();
                sc.card.style.display = (owner === filter) ? '' : 'none';
            }
        }
    };


    // =============================================================
    //  Window Export
    // =============================================================

    window.Mu20SiteGrid = Mu20SiteGrid;

})();
