/**
 * ═══════════════════════════════════════════════════════
 *  WowGridRenderer  —  ES6 Render Engine
 * ═══════════════════════════════════════════════════════
 *  Pure Vanilla JS replacement for $.widget('mm20.mm20SiteGrid')
 *  Zero jQuery • CSS Variable rendering • rAF batching
 *  Shadow DOM compatible • GPU-composited transitions
 *
 *  Version : WOW 100.0
 *  Requires: wow-data-worker.js (Web Worker companion)
 * ═══════════════════════════════════════════════════════
 */


// QA17-FIX: Worker guard — skip if running inside a Web Worker context
if (typeof WorkerGlobalScope !== 'undefined' || typeof importScripts !== 'undefined') {
    // Worker context — renderer belongs in main thread only, bail out
} else {
(function (self) {
'use strict';

class WowGridRenderer {

    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════

    /**
     * @param {ShadowRoot} shadowRoot - Shadow DOM root for CSS isolation
     * @param {Object} options - Configuration (thresholds, display, etc.)
     * @param {Object} [bus] - MM20.createBus() signal bus instance
     */
    constructor(shadowRoot, options, bus) {
        this._root = shadowRoot;
        this._bus = bus || null;
        this._destroyed = false;

        // ── Options (with defaults) ──
        this._opts = Object.assign({
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
        }, options || {});

        // ── DOM element maps (O(1) lookup) ──
        this._siteCards   = new Map();  // siteId → { card, header, body }
        this._unitRows    = new Map();  // unitKey → { row, name, fill, label, tte, fav, spark, annot, gear }
        this._sortBtns    = new Map();  // sortKey → button
        this._filterBtns  = new Map();  // filterKey → button

        // ── State ──
        this._statusFilter = { ok: true, warn: true, critical: true };
        this._filterText   = '';
        this._lastData     = null;   // latest processed data from Worker
        this._dataVer      = 0;
        this._sortCache    = null;   // { order, dataVer, arr[] }
        this._rAF          = null;   // requestAnimationFrame handle

        // ── Modals (created lazily) ──
        this._gearOverlay     = null;
        this._gearUnitKey     = null;
        this._siteGearOverlay = null;
        this._siteGearId      = null;

        // ── Search overlay ──
        this._searchOverlay = null;

        // ── Tooltip ──
        this._tooltipEl    = null;
        this._tooltipTimer = null;

        // ── Sensitivity bar ──
        this._sensitivityEl = null;

        // ── Keyboard shortcut ──
        this._onKeyDown = this._handleKeyDown.bind(this);
        document.addEventListener('keydown', this._onKeyDown);
    }


    // ═══════════════════════════════════════
    //  mount() — Build entire DOM scaffold
    // ═══════════════════════════════════════

    mount(sites) {
        if (this._destroyed) return;
        const root = this._root;
        sites = sites || this._opts.sites || [];
        this._opts.sites = sites;

        // ── Container ──
        const container = this._el('div', 'wow-grid-root');
        container.setAttribute('dir', 'rtl');

        // ── Toolbar: search + sort ──
        const toolbar = this._el('div', 'wow-toolbar');

        const searchInput = this._el('input', 'wow-search-input');
        searchInput.type = 'text';
        searchInput.placeholder = '\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D9\u05D7\u05D9\u05D3\u05D4...';
        searchInput.dir = 'rtl';
        searchInput.addEventListener('input', () => {
            this._filterText = searchInput.value;
            this._applyFilter();
        });
        toolbar.appendChild(searchInput);
        this._searchInput = searchInput;

        // Sort buttons
        const sortDefs = [
            { key: 'name',   label: '\u05E9\u05DD' },
            { key: 'pct',    label: '% \u05E0\u05D9\u05E6\u05D5\u05DC' },
            { key: 'hours',  label: '\u05E9\u05E2\u05D5\u05EA' },
            { key: 'tte',    label: 'TTE' },
            { key: 'status', label: '\u05E1\u05D8\u05D8\u05D5\u05E1' }
        ];
        for (const sd of sortDefs) {
            const btn = this._el('button', 'wow-sort-btn');
            btn.textContent = sd.label;
            if (this._opts.sortOrder === sd.key) btn.classList.add('wow-sort-btn--active');
            btn.addEventListener('click', () => {
                this._opts.sortOrder = sd.key;
                this._updateSortBtns();
                this._sortAndRender();
            });
            this._sortBtns.set(sd.key, btn);
            toolbar.appendChild(btn);
        }

        // Ctrl+K search trigger button
        const searchTrigger = this._el('button', 'wow-search-trigger');
        searchTrigger.textContent = '\u2315';
        searchTrigger.title = 'Ctrl+K \u05D7\u05D9\u05E4\u05D5\u05E9 \u05D2\u05DC\u05D5\u05D1\u05DC\u05D9';
        searchTrigger.addEventListener('click', () => this.showSearch());
        toolbar.appendChild(searchTrigger);

        container.appendChild(toolbar);

        // ── Status Filter Bar ──
        const filterBar = this._el('div', 'wow-status-filter-bar');
        const filterDefs = [
            { key: 'all',      label: '\u05D4\u05DB\u05DC',   css: '' },
            { key: 'ok',       label: '\u05EA\u05E7\u05D9\u05DF',  css: 'wow-filter-ok' },
            { key: 'warn',     label: '\u05D0\u05D6\u05D4\u05E8\u05D4', css: 'wow-filter-warn' },
            { key: 'critical', label: '\u05E7\u05E8\u05D9\u05D8\u05D9', css: 'wow-filter-crit' }
        ];
        for (const fd of filterDefs) {
            const fbtn = this._el('button', 'wow-filter-btn');
            fbtn.textContent = fd.label;
            if (fd.css) fbtn.classList.add(fd.css);
            if (fd.key === 'all') fbtn.classList.add('wow-filter-btn--active');
            fbtn.addEventListener('click', () => {
                if (fd.key === 'all') {
                    this._statusFilter = { ok: true, warn: true, critical: true };
                } else {
                    this._statusFilter[fd.key] = !this._statusFilter[fd.key];
                }
                this._updateFilterBtns();
                this._applyStatusFilter();
            });
            this._filterBtns.set(fd.key, fbtn);
            filterBar.appendChild(fbtn);
        }
        container.appendChild(filterBar);

        // ── Sensitivity Matrix ──
        this._sensitivityEl = this._el('div', 'wow-sensitivity');
        this._sensitivityEl.dir = 'rtl';
        container.appendChild(this._sensitivityEl);

        // ── Cards Container ──
        this._cardsContainer = this._el('div', 'wow-cards-container');
        container.appendChild(this._cardsContainer);

        // Build site cards
        this._buildCards(sites);

        // ── Global Search Overlay ──
        this._buildSearchOverlay(container);

        // ── Gear Modals (unit + site) ──
        this._buildGearModal(container);
        this._buildSiteGearModal(container);

        // ── Tooltip ──
        this._tooltipEl = this._el('div', 'wow-unit-tooltip');
        this._tooltipEl.style.display = 'none';
        container.appendChild(this._tooltipEl);

        // ── Bus subscriptions ──
        if (this._bus) {
            this._busHandlers = {
                'search:query': (d) => d.open ? this.showSearch() : this._hideSearch(),
                'demo:toggle':  (d) => { this._opts.demoMode = d.enabled; }
            };
            for (const [ch, fn] of Object.entries(this._busHandlers)) {
                this._bus.on(ch, fn, this);
            }
        }

        // Mount into Shadow DOM
        root.appendChild(container);
        this._container = container;

        // Show skeleton state
        this._showSkeleton();
    }


    // ═══════════════════════════════════════
    //  update() — CSS Variable batch render
    // ═══════════════════════════════════════

    /**
     * Receives pre-computed render state from Worker.
     * All math is done — we only do DOM updates via CSS Variables.
     * @param {Object} processedData - { [unitKey]: { pct, status, value, barColor, tte, hours, quota, ts } }
     */
    update(processedData) {
        if (this._destroyed || !processedData) return;

        this._lastData = processedData;
        this._dataVer++;

        // Cancel any pending rAF to avoid double-painting
        if (this._rAF) cancelAnimationFrame(this._rAF);

        this._rAF = requestAnimationFrame(() => {
            this._batchUpdate(processedData);
            this._rAF = null;
        });
    }

    /** @private — Actual DOM update inside rAF */
    _batchUpdate(data) {
        if (this._destroyed) return;

        // Remove skeleton if first real update
        this._hideSkeleton();

        const sites = this._opts.sites;
        const decimals = this._opts.decimals;

        // Build site-level data lookup for status filter + sensitivity
        const siteDataMap = {};

        for (const site of sites) {
            const siteData = {};
            for (let u = 0; u < site.units.length; u++) {
                const unitKey = this._unitKey(site.id, u);
                const ud = data[unitKey];
                const els = this._unitRows.get(unitKey);
                if (!els) continue;

                if (!ud) {
                    // No data — reset to defaults
                    els.fill.style.setProperty('--bar-width', '0%');
                    els.fill.className = 'wow-quota-bar-fill wow-quota-bar-fill--ok';
                    els.label.textContent = '--';
                    els.tte.textContent = '--';
                    els.tte.classList.remove('wow-tte-badge--low');
                    siteData[u] = { status: 'ok' };
                    continue;
                }

                // ── GPU-composited CSS Variable updates ──
                const pct = Math.min(ud.pct || 0, 100);
                els.fill.style.setProperty('--bar-width', pct + '%');

                // Status class swap (single className write, no read-modify-write)
                els.fill.className = 'wow-quota-bar-fill wow-quota-bar-fill--' + (ud.status || 'ok');

                // Label
                els.label.textContent = this._fmtNum(ud.pct || 0, decimals) + '%';

                // TTE badge
                if (ud.tte !== undefined && ud.tte !== Infinity && ud.tte !== null) {
                    const tteHrs = Math.round(ud.tte);
                    els.tte.textContent = tteHrs + 'h';
                    els.tte.classList.toggle('wow-tte-badge--low', tteHrs < 168);
                } else {
                    els.tte.textContent = '\u221E';
                    els.tte.classList.remove('wow-tte-badge--low');
                }

                siteData[u] = ud;
            }
            siteDataMap[site.id] = siteData;
        }

        // Store structured data for sort / filter / tooltip
        this._siteDataMap = siteDataMap;

        // Update sensitivity matrix
        this._updateSensitivity(siteDataMap);

        // Re-apply filters
        this._applyStatusFilter();
    }


    // ═══════════════════════════════════════
    //  updateSparkline() — SVG path from Worker
    // ═══════════════════════════════════════

    updateSparkline(payload) {
        if (this._destroyed) return;
        const { unitKey, svgPath } = payload;
        const els = this._unitRows.get(unitKey);
        if (!els || !els.spark) return;
        const polyline = els.spark.querySelector('polyline');
        if (polyline) polyline.setAttribute('points', svgPath);
    }


    // ═══════════════════════════════════════
    //  updateSensitivity() — Sensitivity Matrix
    // ═══════════════════════════════════════

    _updateSensitivity(siteDataMap) {
        if (!this._sensitivityEl) return;
        const sites = this._opts.sites;
        let totalMW = 0, warnMW = 0, critMW = 0;
        let totalUnits = 0, okUnits = 0, warnUnits = 0, critUnits = 0;

        for (const site of sites) {
            const sd = siteDataMap[site.id] || {};
            for (let u = 0; u < site.units.length; u++) {
                totalUnits++;
                const unitKey = this._unitKey(site.id, u);
                const us = this._opts.unitSettings[unitKey];
                const mw = (us && us.maxMW) ? us.maxMW : 100;
                totalMW += mw;
                const ud = sd[u];
                const status = (ud && ud.status) ? ud.status : 'ok';
                if (status === 'critical') { critUnits++; critMW += mw; }
                else if (status === 'warn') { warnUnits++; warnMW += mw; }
                else { okUnits++; }
            }
        }

        this._sensitivityEl.innerHTML =
            '<div class="wow-sens-grid">' +
                '<div class="wow-sens-cell wow-sens-total">' +
                    '<div class="wow-sens-value">' + totalMW + '</div>' +
                    '<div class="wow-sens-label">MW \u05E1\u05D4\u05F4\u05DB</div>' +
                '</div>' +
                '<div class="wow-sens-cell wow-sens-ok">' +
                    '<div class="wow-sens-value">' + okUnits + '</div>' +
                    '<div class="wow-sens-label">\u05EA\u05E7\u05D9\u05DF</div>' +
                '</div>' +
                '<div class="wow-sens-cell wow-sens-warn">' +
                    '<div class="wow-sens-value">' + warnUnits + '</div>' +
                    '<div class="wow-sens-label">\u05D0\u05D6\u05D4\u05E8\u05D4</div>' +
                '</div>' +
                '<div class="wow-sens-cell wow-sens-crit">' +
                    '<div class="wow-sens-value">' + critUnits + '</div>' +
                    '<div class="wow-sens-label">\u05E7\u05E8\u05D9\u05D8\u05D9</div>' +
                '</div>' +
                '<div class="wow-sens-cell">' +
                    '<div class="wow-sens-value">' + warnMW + '</div>' +
                    '<div class="wow-sens-label">MW \u05D1\u05E1\u05D9\u05DB\u05D5\u05DF</div>' +
                '</div>' +
                '<div class="wow-sens-cell wow-sens-crit">' +
                    '<div class="wow-sens-value">' + critMW + '</div>' +
                    '<div class="wow-sens-label">MW \u05E7\u05E8\u05D9\u05D8\u05D9</div>' +
                '</div>' +
            '</div>';
    }


    // ═══════════════════════════════════════
    //  sort() — Reorder cards (DOM reappend)
    // ═══════════════════════════════════════

    sort(order) {
        this._opts.sortOrder = order;
        this._updateSortBtns();
        this._sortAndRender();
    }

    _sortAndRender() {
        const sites = this._opts.sites;
        const data = this._siteDataMap || {};
        const order = this._opts.sortOrder;

        // Cache hit check
        const cache = this._sortCache;
        if (cache && cache.order === order && cache.dataVer === this._dataVer && cache.arr) {
            for (const id of cache.arr) {
                const sc = this._siteCards.get(id);
                if (sc && sc.card) this._cardsContainer.appendChild(sc.card);
            }
            return;
        }

        // Build sortable array
        const sortable = [];
        for (const site of sites) {
            const sd = data[site.id] || {};
            let avgPct = 0, totalHours = 0, minTte = Infinity, worstStatus = 0;
            const count = site.units.length;
            for (let u = 0; u < count; u++) {
                const ud = sd[u];
                if (ud) {
                    avgPct += (ud.pct || 0);
                    totalHours += (ud.hours || 0);
                    if (ud.tte < minTte) minTte = ud.tte;
                    const sv = ud.status === 'critical' ? 2 : ud.status === 'warn' ? 1 : 0;
                    if (sv > worstStatus) worstStatus = sv;
                }
            }
            avgPct = count > 0 ? avgPct / count : 0;
            sortable.push({ id: site.id, name: site.name, avgPct, totalHours, minTte, worstStatus });
        }

        // Sort
        sortable.sort((a, b) => {
            switch (order) {
                case 'pct':    return b.avgPct - a.avgPct;
                case 'hours':  return b.totalHours - a.totalHours;
                case 'tte':    return a.minTte - b.minTte;
                case 'status': return b.worstStatus - a.worstStatus;
                default:       return a.name.localeCompare(b.name, 'he');
            }
        });

        // Re-order DOM + cache
        const sortedIds = [];
        for (const item of sortable) {
            sortedIds.push(item.id);
            const sc = this._siteCards.get(item.id);
            if (sc && sc.card) this._cardsContainer.appendChild(sc.card);
        }
        this._sortCache = { order, dataVer: this._dataVer, arr: sortedIds };
    }


    // ═══════════════════════════════════════
    //  filter() — Text + Status filtering
    // ═══════════════════════════════════════

    filter(text, statusFilter) {
        if (text !== undefined) this._filterText = text;
        if (statusFilter) this._statusFilter = statusFilter;
        this._applyFilter();
        this._applyStatusFilter();
    }

    _applyFilter() {
        const term = (this._filterText || '').toLowerCase();
        const sites = this._opts.sites;
        for (const site of sites) {
            const sc = this._siteCards.get(site.id);
            if (!sc) continue;
            let anyVisible = false;
            for (let u = 0; u < site.units.length; u++) {
                const unitKey = this._unitKey(site.id, u);
                const els = this._unitRows.get(unitKey);
                if (!els) continue;
                const match = !term ||
                    site.name.toLowerCase().includes(term) ||
                    site.units[u].toLowerCase().includes(term) ||
                    site.id.toLowerCase().includes(term);
                els.row.style.display = match ? '' : 'none';
                if (match) anyVisible = true;
            }
            sc.card.style.display = anyVisible ? '' : 'none';
        }
    }

    _applyStatusFilter() {
        const sf = this._statusFilter;
        if (!sf) return;
        const data = this._siteDataMap || {};
        const sites = this._opts.sites;
        const term = (this._filterText || '').toLowerCase();

        for (const site of sites) {
            const sd = data[site.id] || {};
            const sc = this._siteCards.get(site.id);
            if (!sc) continue;
            let anyVisible = false;
            for (let u = 0; u < site.units.length; u++) {
                const unitKey = this._unitKey(site.id, u);
                const els = this._unitRows.get(unitKey);
                if (!els) continue;
                const ud = sd[u];
                const status = (ud && ud.status) ? ud.status : 'ok';
                let visible = !!sf[status];
                if (visible && term) {
                    visible = site.name.toLowerCase().includes(term) ||
                              site.units[u].toLowerCase().includes(term);
                }
                els.row.style.display = visible ? '' : 'none';
                if (visible) anyVisible = true;
            }
            sc.card.style.display = anyVisible ? '' : 'none';
        }
    }


    // ═══════════════════════════════════════
    //  Gear Modal — Unit Settings
    // ═══════════════════════════════════════

    openGearModal(unitKey, siteId, unitIdx, unitName) {
        if (this._destroyed || !this._gearOverlay) return;
        this._gearUnitKey = unitKey;
        const settings = this._opts.unitSettings[unitKey] || {};
        const overlay = this._gearOverlay;

        overlay.querySelector('.wow-gear-title').textContent = '\u2699 \u05D4\u05D2\u05D3\u05E8\u05D5\u05EA: ' + unitName;
        overlay.querySelector('.wow-gf-displayName').value  = settings.displayName || '';
        overlay.querySelector('.wow-gf-tagPath').value      = settings.tagPath || '';
        overlay.querySelector('.wow-gf-maxMW').value        = settings.maxMW || '';
        overlay.querySelector('.wow-gf-quotaPct').value     = settings.quotaPct || '';
        overlay.querySelector('.wow-gf-fuelType').value     = settings.fuelType || '';
        overlay.querySelector('.wow-gf-warnThreshold').value = settings.warnThreshold || '';
        overlay.querySelector('.wow-gf-critThreshold').value = settings.critThreshold || '';
        overlay.querySelector('.wow-gf-notes').value         = settings.notes || '';

        overlay.style.display = 'flex';
        overlay.querySelector('.wow-gf-displayName').focus();
    }

    _closeGearModal() {
        if (this._gearOverlay) this._gearOverlay.style.display = 'none';
        this._gearUnitKey = null;
    }

    _saveGearModal() {
        if (!this._gearUnitKey || !this._gearOverlay) return;
        const o = this._gearOverlay;
        const key = this._gearUnitKey;
        const settings = {
            displayName:   o.querySelector('.wow-gf-displayName').value.trim(),
            tagPath:       o.querySelector('.wow-gf-tagPath').value.trim(),
            maxMW:         parseFloat(o.querySelector('.wow-gf-maxMW').value) || 0,
            quotaPct:      parseFloat(o.querySelector('.wow-gf-quotaPct').value) || 0,
            fuelType:      o.querySelector('.wow-gf-fuelType').value,
            warnThreshold: parseFloat(o.querySelector('.wow-gf-warnThreshold').value) || 0,
            critThreshold: parseFloat(o.querySelector('.wow-gf-critThreshold').value) || 0,
            notes:         o.querySelector('.wow-gf-notes').value.trim()
        };
        this._opts.unitSettings[key] = settings;
        if (this._bus) this._bus.emit('unit:settings', { unitKey: key, settings });
        this._closeGearModal();
    }


    // ═══════════════════════════════════════
    //  Gear Modal — Site Settings
    // ═══════════════════════════════════════

    openSiteGearModal(siteId, siteName) {
        if (this._destroyed || !this._siteGearOverlay) return;
        this._siteGearId = siteId;
        const settings = (this._opts.siteSettings || {})[siteId] || {};
        const overlay = this._siteGearOverlay;

        overlay.querySelector('.wow-gear-title').textContent = '\u2699 \u05D0\u05EA\u05E8: ' + siteName;
        overlay.querySelector('.wow-sgf-displayName').value = settings.displayName || '';
        overlay.querySelector('.wow-sgf-tagPath').value     = settings.tagPath || '';
        overlay.querySelector('.wow-sgf-maxMW').value       = settings.maxMW || '';
        overlay.querySelector('.wow-sgf-notes').value       = settings.notes || '';

        overlay.style.display = 'flex';
        overlay.querySelector('.wow-sgf-displayName').focus();
    }

    _closeSiteGearModal() {
        if (this._siteGearOverlay) this._siteGearOverlay.style.display = 'none';
        this._siteGearId = null;
    }

    _saveSiteGearModal() {
        if (!this._siteGearId || !this._siteGearOverlay) return;
        const o = this._siteGearOverlay;
        const sid = this._siteGearId;
        const settings = {
            displayName: o.querySelector('.wow-sgf-displayName').value.trim(),
            tagPath:     o.querySelector('.wow-sgf-tagPath').value.trim(),
            maxMW:       parseFloat(o.querySelector('.wow-sgf-maxMW').value) || 0,
            notes:       o.querySelector('.wow-sgf-notes').value.trim()
        };
        if (!this._opts.siteSettings) this._opts.siteSettings = {};
        this._opts.siteSettings[sid] = settings;
        if (this._bus) this._bus.emit('site:settings', { siteId: sid, settings });
        this._closeSiteGearModal();
    }


    // ═══════════════════════════════════════
    //  Global Search (Ctrl+K)
    // ═══════════════════════════════════════

    showSearch() {
        if (!this._searchOverlay) return;
        this._searchOverlay.style.display = 'flex';
        const input = this._searchOverlay.querySelector('.wow-gsearch-input');
        if (input) { input.value = ''; input.focus(); }
        const results = this._searchOverlay.querySelector('.wow-gsearch-results');
        if (results) results.innerHTML = '';
    }

    _hideSearch() {
        if (this._searchOverlay) this._searchOverlay.style.display = 'none';
    }

    _updateSearchResults(term) {
        const container = this._searchOverlay.querySelector('.wow-gsearch-results');
        container.innerHTML = '';
        if (!term || term.length < 1) return;
        term = term.toLowerCase();

        const sites = this._opts.sites;
        const results = [];
        for (const site of sites) {
            for (let u = 0; u < site.units.length; u++) {
                const unitName = site.units[u];
                if (site.name.toLowerCase().includes(term) ||
                    unitName.toLowerCase().includes(term) ||
                    site.id.toLowerCase().includes(term)) {
                    results.push({ siteId: site.id, unitIdx: u, siteName: site.name, unitName });
                }
            }
            if (results.length >= 20) break;
        }

        results.forEach((res, idx) => {
            const item = this._el('div', 'wow-gsearch-item');
            item.textContent = res.siteName + ' \u2014 ' + res.unitName;
            if (idx === 0) item.classList.add('wow-gsearch-item--focused');
            item.addEventListener('click', () => {
                this._hideSearch();
                const unitKey = this._unitKey(res.siteId, res.unitIdx);
                const els = this._unitRows.get(unitKey);
                const sc = this._siteCards.get(res.siteId);
                if (els && sc) {
                    sc.card.style.display = '';
                    els.row.style.display = '';
                    els.row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    els.row.classList.add('wow-highlight');
                    setTimeout(() => els.row.classList.remove('wow-highlight'), 2000);
                }
                if (this._bus) {
                    this._bus.emit('unit:selected', {
                        siteId: res.siteId, unitIdx: res.unitIdx, unitName: res.unitName
                    });
                }
            });
            container.appendChild(item);
        });
    }

    _moveSearchFocus(dir) {
        const container = this._searchOverlay.querySelector('.wow-gsearch-results');
        const items = container.querySelectorAll('.wow-gsearch-item');
        if (!items.length) return;
        let idx = -1;
        items.forEach((it, i) => { if (it.classList.contains('wow-gsearch-item--focused')) idx = i; });
        items.forEach(it => it.classList.remove('wow-gsearch-item--focused'));
        let next = idx + dir;
        if (next < 0) next = items.length - 1;
        if (next >= items.length) next = 0;
        items[next].classList.add('wow-gsearch-item--focused');
    }


    // ═══════════════════════════════════════
    //  Skeleton Loading State
    // ═══════════════════════════════════════

    _showSkeleton() {
        if (!this._cardsContainer) return;
        // Add shimmer class to all bar fills
        this._unitRows.forEach(els => {
            els.fill.classList.add('wow-skeleton-shimmer');
            els.label.textContent = '';
            els.tte.textContent = '';
        });
    }

    _hideSkeleton() {
        this._unitRows.forEach(els => {
            els.fill.classList.remove('wow-skeleton-shimmer');
        });
    }


    // ═══════════════════════════════════════
    //  Tooltip
    // ═══════════════════════════════════════

    _showTooltipDelayed(e, siteId, unitIdx, unitName) {
        this._hideTooltip();
        this._tooltipTimer = setTimeout(() => {
            this._showTooltip(e, siteId, unitIdx, unitName);
        }, 200);
    }

    _showTooltip(e, siteId, unitIdx, unitName) {
        if (this._destroyed || !this._tooltipEl) return;
        const sd = (this._siteDataMap || {})[siteId] || {};
        const ud = sd[unitIdx] || {};
        const us = (this._opts.unitSettings || {})[this._unitKey(siteId, unitIdx)] || {};

        let html = '<strong>' + this._escHtml(unitName) + '</strong>';
        if (ud.hours !== undefined)  html += '<br>\u05E9\u05E2\u05D5\u05EA: ' + this._fmtNum(ud.hours, 1);
        if (ud.quota !== undefined)  html += '<br>\u05DE\u05DB\u05E1\u05D4: ' + this._fmtNum(ud.quota, 1);
        if (ud.pct !== undefined)    html += '<br>% \u05E0\u05D9\u05E6\u05D5\u05DC: ' + this._fmtNum(ud.pct, 1) + '%';
        if (ud.tte !== undefined && ud.tte !== Infinity) html += '<br>TTE: ' + Math.round(ud.tte) + 'h';
        if (us.fuelType)  html += '<br>\u05D3\u05DC\u05E7: ' + us.fuelType;
        if (us.maxMW)     html += '<br>MW \u05DE\u05E8\u05D1\u05D9: ' + us.maxMW;

        this._tooltipEl.innerHTML = html;
        this._tooltipEl.style.display = 'block';

        const rect = this._container.getBoundingClientRect();
        let left = e.clientX - rect.left + 12;
        let top  = e.clientY - rect.top - 10;
        if (left + 200 > rect.width) left = rect.width - 210;
        if (top < 0) top = 5;
        this._tooltipEl.style.left = left + 'px';
        this._tooltipEl.style.top  = top + 'px';
    }

    _hideTooltip() {
        if (this._tooltipTimer) { clearTimeout(this._tooltipTimer); this._tooltipTimer = null; }
        if (this._tooltipEl) this._tooltipEl.style.display = 'none';
    }


    // ═══════════════════════════════════════
    //  destroy() — Full cleanup
    // ═══════════════════════════════════════

    destroy() {
        this._destroyed = true;

        // Cancel pending rAF
        if (this._rAF) { cancelAnimationFrame(this._rAF); this._rAF = null; }

        // Tooltip timer
        if (this._tooltipTimer) { clearTimeout(this._tooltipTimer); this._tooltipTimer = null; }

        // Global keydown
        document.removeEventListener('keydown', this._onKeyDown);

        // Bus cleanup
        if (this._bus && this._busHandlers) {
            for (const [ch, fn] of Object.entries(this._busHandlers)) {
                this._bus.off(ch, fn);
            }
            this._busHandlers = null;
        }

        // Clear maps
        this._siteCards.clear();
        this._unitRows.clear();
        this._sortBtns.clear();
        this._filterBtns.clear();

        // Clear DOM
        if (this._container && this._container.parentNode) {
            this._container.parentNode.removeChild(this._container);
        }

        // Nullify refs
        this._container = null;
        this._cardsContainer = null;
        this._sensitivityEl = null;
        this._tooltipEl = null;
        this._gearOverlay = null;
        this._siteGearOverlay = null;
        this._searchOverlay = null;
        this._sortCache = null;
        this._lastData = null;
        this._siteDataMap = null;
    }


    // ═══════════════════════════════════════
    //  PRIVATE: DOM builders
    // ═══════════════════════════════════════

    _buildCards(sites) {
        this._cardsContainer.innerHTML = '';
        this._siteCards.clear();
        this._unitRows.clear();

        for (const site of sites) {
            const card = this._el('div', 'wow-site-card');
            card.dataset.site = site.id;

            // ── Header ──
            const header = this._el('div', 'wow-site-header');
            const nameSpan = this._el('span', 'wow-site-name');
            nameSpan.textContent = site.name;
            const metaSpan = this._el('span', 'wow-site-meta');
            metaSpan.innerHTML = '<span>' + this._escHtml(site.region) + '</span>' +
                '<span>' + this._escHtml(site.fuel) + '</span>' +
                '<span>' + site.units.length + ' \u05D9\u05D7\u05D9\u05D3\u05D5\u05EA</span>';
            header.appendChild(nameSpan);
            header.appendChild(metaSpan);

            // Site gear button
            const siteGearBtn = this._el('button', 'wow-gear-btn wow-site-gear-btn');
            siteGearBtn.title = '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D0\u05EA\u05E8';
            siteGearBtn.textContent = '\u2699';
            siteGearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openSiteGearModal(site.id, site.name);
            });
            header.addEventListener('click', () => {
                if (this._bus) this._bus.emit('site:selected', { siteId: site.id, siteName: site.name });
            });
            header.appendChild(siteGearBtn);
            card.appendChild(header);

            // ── Body (unit rows) ──
            const body = this._el('div', 'wow-site-body');

            for (let u = 0; u < site.units.length; u++) {
                const unitKey = this._unitKey(site.id, u);
                const row = this._el('div', 'wow-unit-row');
                row.dataset.unit = unitKey;

                // Favorite
                const favBtn = this._el('button', 'wow-fav-btn');
                favBtn.title = '\u05DE\u05D5\u05E2\u05D3\u05E3';
                favBtn.textContent = this._opts.favorites[unitKey] ? '\u2605' : '\u2606';
                if (this._opts.favorites[unitKey]) favBtn.classList.add('wow-fav-btn--active');
                favBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this._toggleFavorite(unitKey, favBtn);
                });

                // Unit name
                const uName = this._el('span', 'wow-unit-name');
                uName.textContent = site.units[u];

                // Quota bar
                const barWrap = this._el('div', 'wow-quota-bar-wrap');
                const barFill = this._el('div', 'wow-quota-bar-fill wow-quota-bar-fill--ok');
                const barLabel = this._el('span', 'wow-quota-label');
                barLabel.textContent = '--';
                barWrap.appendChild(barFill);
                barWrap.appendChild(barLabel);

                // TTE badge
                const tteBadge = this._el('span', 'wow-tte-badge');
                tteBadge.textContent = '--';

                // Sparkline SVG
                let sparkSvg = null;
                if (this._opts.showSparklines) {
                    sparkSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                    sparkSvg.setAttribute('class', 'wow-sparkline');
                    sparkSvg.setAttribute('viewBox', '0 0 60 16');
                    sparkSvg.setAttribute('preserveAspectRatio', 'none');
                    const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
                    polyline.setAttribute('points', '');
                    sparkSvg.appendChild(polyline);
                }

                // Annotation button
                const annotBtn = this._el('button', 'wow-annot-btn');
                annotBtn.title = '\u05D4\u05E2\u05E8\u05D5\u05EA';
                annotBtn.textContent = '\u270E';
                if (this._opts.annotations[unitKey] && this._opts.annotations[unitKey].length) {
                    annotBtn.classList.add('wow-annot-btn--has-notes');
                }

                // Unit gear button
                const gearBtn = this._el('button', 'wow-gear-btn');
                gearBtn.title = '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D9\u05D7\u05D9\u05D3\u05D4';
                gearBtn.textContent = '\u2699';
                gearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.openGearModal(unitKey, site.id, u, site.units[u]);
                });

                // Assemble row
                row.appendChild(favBtn);
                row.appendChild(uName);
                row.appendChild(barWrap);
                row.appendChild(tteBadge);
                if (sparkSvg) row.appendChild(sparkSvg);
                row.appendChild(annotBtn);
                row.appendChild(gearBtn);

                // Click to select unit
                row.addEventListener('click', () => {
                    if (this._bus) {
                        this._bus.emit('unit:selected', {
                            siteId: site.id, unitIdx: u, unitName: site.units[u]
                        });
                    }
                });

                // Double-click to open trend
                row.addEventListener('dblclick', (e) => {
                    e.preventDefault();
                    const us = (this._opts.unitSettings || {})[unitKey];
                    const tagPath = us ? us.tagPath : '';
                    if (!tagPath) return;
                    const base = this._opts.trendBaseUrl || '';
                    if (base) {
                        window.open(base + '/#/Displays/Trend/' + encodeURIComponent(tagPath), '_blank');
                    }
                });

                // Hover tooltip
                row.addEventListener('mouseenter', (e) => this._showTooltipDelayed(e, site.id, u, site.units[u]));
                row.addEventListener('mouseleave', () => this._hideTooltip());

                body.appendChild(row);

                // Store references in Map
                this._unitRows.set(unitKey, {
                    row, name: uName, fill: barFill, label: barLabel,
                    tte: tteBadge, fav: favBtn, spark: sparkSvg, annot: annotBtn, gear: gearBtn
                });
            }

            card.appendChild(body);
            this._cardsContainer.appendChild(card);
            this._siteCards.set(site.id, { card, header, body });
        }
    }

    _buildSearchOverlay(parent) {
        const overlay = this._el('div', 'wow-gsearch-overlay');
        overlay.style.display = 'none';
        const modal = this._el('div', 'wow-gsearch-modal');
        const input = this._el('input', 'wow-gsearch-input');
        input.type = 'text';
        input.placeholder = 'Ctrl+K \u05D7\u05D9\u05E4\u05D5\u05E9 \u05DE\u05D4\u05D9\u05E8...';
        input.dir = 'rtl';
        const results = this._el('div', 'wow-gsearch-results');

        input.addEventListener('input', () => this._updateSearchResults(input.value));
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this._hideSearch();
            else if (e.key === 'Enter') {
                const focused = results.querySelector('.wow-gsearch-item--focused');
                if (focused) focused.click();
            }
            else if (e.key === 'ArrowDown') { e.preventDefault(); this._moveSearchFocus(1); }
            else if (e.key === 'ArrowUp')   { e.preventDefault(); this._moveSearchFocus(-1); }
        });

        overlay.addEventListener('click', (e) => { if (e.target === overlay) this._hideSearch(); });

        modal.appendChild(input);
        modal.appendChild(results);
        overlay.appendChild(modal);
        parent.appendChild(overlay);
        this._searchOverlay = overlay;
    }

    _buildGearModal(parent) {
        const overlay = this._el('div', 'wow-gear-overlay');
        overlay.style.display = 'none';
        overlay.innerHTML =
            '<div class="wow-gear-modal" dir="rtl">' +
                '<div class="wow-gear-header">' +
                    '<span class="wow-gear-title"></span>' +
                    '<button class="wow-gear-close">\u2715</button>' +
                '</div>' +
                '<div class="wow-gear-body">' +
                    '<div class="wow-gear-field"><label>\u05E9\u05DD \u05EA\u05E6\u05D5\u05D2\u05D4:</label><input class="wow-input wow-gf-displayName" type="text" placeholder="\u05E9\u05DD \u05D7\u05DC\u05D5\u05E4\u05D9..." /></div>' +
                    '<div class="wow-gear-field"><label>\u05E0\u05EA\u05D9\u05D1 AF:</label><input class="wow-input wow-gf-tagPath" type="text" dir="ltr" placeholder="\\\\AF\\Server\\DB\\...|Attr" /></div>' +
                    '<div class="wow-gear-row">' +
                        '<div class="wow-gear-field wow-gear-half"><label>MW \u05DE\u05E8\u05D1\u05D9:</label><input class="wow-input wow-gf-maxMW" type="number" min="0" step="1" /></div>' +
                        '<div class="wow-gear-field wow-gear-half"><label>% \u05DE\u05DB\u05E1\u05D4:</label><input class="wow-input wow-gf-quotaPct" type="number" min="0" max="100" step="0.1" /></div>' +
                    '</div>' +
                    '<div class="wow-gear-field"><label>\u05E1\u05D5\u05D2 \u05D3\u05DC\u05E7:</label>' +
                        '<select class="wow-input wow-gf-fuelType">' +
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
                    '<div class="wow-gear-row">' +
                        '<div class="wow-gear-field wow-gear-half"><label>\u05E1\u05E3 \u05D0\u05D6\u05D4\u05E8\u05D4 (%):</label><input class="wow-input wow-gf-warnThreshold" type="number" min="0" max="100" step="1" /></div>' +
                        '<div class="wow-gear-field wow-gear-half"><label>\u05E1\u05E3 \u05E7\u05E8\u05D9\u05D8\u05D9 (%):</label><input class="wow-input wow-gf-critThreshold" type="number" min="0" max="100" step="1" /></div>' +
                    '</div>' +
                    '<div class="wow-gear-field"><label>\u05D4\u05E2\u05E8\u05D5\u05EA:</label><textarea class="wow-input wow-gf-notes" rows="3" placeholder="\u05D4\u05E2\u05E8\u05D5\u05EA \u05D7\u05D5\u05E4\u05E9\u05D9\u05D5\u05EA..."></textarea></div>' +
                '</div>' +
                '<div class="wow-gear-footer">' +
                    '<button class="wow-btn wow-btn--ok wow-gear-save">\u05E9\u05DE\u05D5\u05E8</button>' +
                    '<button class="wow-btn wow-btn--cancel wow-gear-cancel">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                '</div>' +
            '</div>';

        overlay.querySelector('.wow-gear-close').addEventListener('click', () => this._closeGearModal());
        overlay.querySelector('.wow-gear-cancel').addEventListener('click', () => this._closeGearModal());
        overlay.querySelector('.wow-gear-save').addEventListener('click', () => this._saveGearModal());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeGearModal(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeGearModal(); });

        parent.appendChild(overlay);
        this._gearOverlay = overlay;
    }

    _buildSiteGearModal(parent) {
        const overlay = this._el('div', 'wow-gear-overlay wow-site-gear-overlay');
        overlay.style.display = 'none';
        overlay.innerHTML =
            '<div class="wow-gear-modal" dir="rtl">' +
                '<div class="wow-gear-header">' +
                    '<span class="wow-gear-title"></span>' +
                    '<button class="wow-gear-close">\u2715</button>' +
                '</div>' +
                '<div class="wow-gear-body">' +
                    '<div class="wow-gear-field"><label>\u05E9\u05DD \u05EA\u05E6\u05D5\u05D2\u05D4:</label><input class="wow-input wow-sgf-displayName" type="text" /></div>' +
                    '<div class="wow-gear-field"><label>\u05E0\u05EA\u05D9\u05D1 AF \u05D1\u05E1\u05D9\u05E1:</label><input class="wow-input wow-sgf-tagPath" type="text" dir="ltr" placeholder="\\\\AF\\Server\\DB\\Plants\\Site" /></div>' +
                    '<div class="wow-gear-field"><label>MW \u05DE\u05E8\u05D1\u05D9 \u05D0\u05EA\u05E8:</label><input class="wow-input wow-sgf-maxMW" type="number" min="0" step="1" /></div>' +
                    '<div class="wow-gear-field"><label>\u05D4\u05E2\u05E8\u05D5\u05EA:</label><textarea class="wow-input wow-sgf-notes" rows="3"></textarea></div>' +
                '</div>' +
                '<div class="wow-gear-footer">' +
                    '<button class="wow-btn wow-btn--ok wow-sgear-save">\u05E9\u05DE\u05D5\u05E8</button>' +
                    '<button class="wow-btn wow-btn--cancel wow-sgear-cancel">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                '</div>' +
            '</div>';

        overlay.querySelector('.wow-gear-close').addEventListener('click', () => this._closeSiteGearModal());
        overlay.querySelector('.wow-sgear-cancel').addEventListener('click', () => this._closeSiteGearModal());
        overlay.querySelector('.wow-sgear-save').addEventListener('click', () => this._saveSiteGearModal());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this._closeSiteGearModal(); });
        overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') this._closeSiteGearModal(); });

        parent.appendChild(overlay);
        this._siteGearOverlay = overlay;
    }


    // ═══════════════════════════════════════
    //  PRIVATE: Helpers
    // ═══════════════════════════════════════

    /** Create element with className(s) */
    _el(tag, cls) {
        const el = document.createElement(tag);
        if (cls) el.className = cls;
        return el;
    }

    /** Generate unit key (matches MM.unitKey pattern) */
    _unitKey(siteId, unitIdx) {
        return siteId + '_u' + unitIdx;
    }

    /** Format number with fixed decimals */
    _fmtNum(val, decimals) {
        return (typeof val === 'number') ? val.toFixed(decimals) : '--';
    }

    /** HTML-escape text */
    _escHtml(str) {
        if (!str) return '';
        return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    _toggleFavorite(unitKey, btnEl) {
        const favs = this._opts.favorites;
        if (favs[unitKey]) {
            delete favs[unitKey];
            btnEl.classList.remove('wow-fav-btn--active');
            btnEl.textContent = '\u2606';
        } else {
            favs[unitKey] = true;
            btnEl.classList.add('wow-fav-btn--active');
            btnEl.textContent = '\u2605';
        }
        if (this._bus) this._bus.emit('favorites:changed', { favorites: favs });
    }

    _updateSortBtns() {
        const active = this._opts.sortOrder;
        this._sortBtns.forEach((btn, key) => {
            btn.classList.toggle('wow-sort-btn--active', key === active);
        });
    }

    _updateFilterBtns() {
        const sf = this._statusFilter;
        const allOn = sf.ok && sf.warn && sf.critical;
        this._filterBtns.forEach((btn, key) => {
            if (key === 'all') btn.classList.toggle('wow-filter-btn--active', allOn);
            else btn.classList.toggle('wow-filter-btn--active', !!sf[key]);
        });
    }

    _handleKeyDown(e) {
        // Ctrl+K / Cmd+K → Global search
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            this.showSearch();
        }
    }
}

// Export for use in sym-mugbalot-wow.js
if (typeof window !== 'undefined') {
    window.WowGridRenderer = WowGridRenderer;
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
