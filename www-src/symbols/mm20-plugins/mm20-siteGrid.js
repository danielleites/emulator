/**
 * ═══════════════════════════════════════════════════════
 *  mm20-siteGrid.js  —  Realtime Tab Widget
 * ═══════════════════════════════════════════════════════
 *  Site cards, unit rows, quota bars, TTE badges,
 *  sparklines, favorites, sort, filter, global search,
 *  unit gear modal (B4).
 *
 *  jQuery widget: mm20.siteGrid
 *  Version: 20.1.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-siteGrid] MM20 core not loaded'); return; }

    $.widget('mm20.mm20SiteGrid', {

        options: {
            bus:            null,
            sites:          null,
            data:           null,
            demoMode:       false,
            favorites:      {},
            sortOrder:      'name',
            warnPct:        70,
            critPct:        90,
            showSparklines: true,
            decimals:       1,
            annotations:    {},
            filterText:     '',
            unitSettings:   {},   // B4: { unitKey: { displayName, tagPath, maxMW, quotaPct, fuelType, warnThreshold, critThreshold, notes } }
            siteSettings:   {},   // C1: { siteId: { displayName, tagPath, maxMW, notes } }
            trendBaseUrl:   '',   // C2: base URL for PI Vision trend links
            api:            null,  // PI Web API instance (MM20.PIWebAPI)
            unitEventBindings: {} // QA15: { siteId: { unitIdx: { eventElementWebId, eventElementPath } } }
        },

        // ── DOM References (created once) ──
        _els: null,        // { siteId: { card, header, body, units: { idx: {row, name, bar, fill, label, tte, fav, spark, gear} } } }
        _toolbarEl: null,
        _searchInput: null,
        _sortBtns: null,
        _gsearchOverlay: null,
        _gearModal: null,          // B4: reusable unit gear modal overlay
        _gearModalUnitKey: null,   // B4: currently editing unit key
        _siteGearModal: null,      // C1: reusable site gear modal
        _siteGearSiteId: null,     // C1: currently editing site id
        _statusFilter: null,       // C3: { ok: true, warn: true, critical: true }
        _filterBtns: null,         // C3: DOM button refs
        _sensitivityEl: null,      // C4: sensitivity matrix container
        _tooltipEl: null,          // C6: unit hover tooltip
        _tooltipTimer: null,       // C6: hover delay timer
        _sortCache: null,          // C5: { order: '', dataVer: 0, arr: [] }
        _dataVer: 0,               // C5: incremented on each data update
        _api: null,                // PI Web API instance
        _onApiReady: null,         // Bus listener for api:ready event
        _sparkCache: null,         // { unitKey: { data: points, fetchedAt } } — 5min TTL
        _rateCache: null,          // { unitKey: { rate: number, fetchedAt } } — 2min TTL
        _destroyed: false,

        // ═══════════════════════════════════════
        //  _create — Build entire DOM structure
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;
            self._sparkCache = {};
            self._rateCache = {};

            try {
                var el = self.element;
                el.addClass('mm20-site-grid-root');
                self._els = {};

                // ── Toolbar: search + sort buttons ──
                var toolbar = $('<div class="mm20-toolbar"></div>');

                self._searchInput = $('<input class="mm20-search-input" type="text" placeholder="\u05D7\u05D9\u05E4\u05D5\u05E9 \u05D9\u05D7\u05D9\u05D3\u05D4..." dir="rtl" />');
                self._searchInput.on('input', function () {
                    self.options.filterText = this.value;
                    self._applyFilter();
                });
                toolbar.append(self._searchInput);

                // Sort buttons
                var sortDefs = [
                    { key: 'name',   label: '\u05E9\u05DD' },
                    { key: 'pct',    label: '% \u05E0\u05D9\u05E6\u05D5\u05DC' },
                    { key: 'hours',  label: '\u05E9\u05E2\u05D5\u05EA' },
                    { key: 'tte',    label: 'TTE' },
                    { key: 'status', label: '\u05E1\u05D8\u05D8\u05D5\u05E1' }
                ];
                self._sortBtns = {};
                for (var i = 0; i < sortDefs.length; i++) {
                    (function (sd) {
                        var btn = $('<button class="mm20-sort-btn"></button>').text(sd.label);
                        if (self.options.sortOrder === sd.key) btn.addClass('mm20-sort-btn--active');
                        btn.on('click', function () {
                            self.options.sortOrder = sd.key;
                            self._updateSortBtns();
                            self._sortAndRender();
                        });
                        self._sortBtns[sd.key] = btn;
                        toolbar.append(btn);
                    })(sortDefs[i]);
                }

                el.append(toolbar);
                self._toolbarEl = toolbar;

                // ── C3: Status Filter Buttons ──
                self._statusFilter = { ok: true, warn: true, critical: true };
                var filterBar = $('<div class="mm20-status-filter-bar"></div>');
                self._filterBtns = {};
                var filterDefs = [
                    { key: 'all',      label: '\u05D4\u05DB\u05DC' },
                    { key: 'ok',       label: '\u05EA\u05E7\u05D9\u05DF',  cssClass: 'mm20-filter-ok' },
                    { key: 'warn',     label: '\u05D0\u05D6\u05D4\u05E8\u05D4', cssClass: 'mm20-filter-warn' },
                    { key: 'critical', label: '\u05E7\u05E8\u05D9\u05D8\u05D9', cssClass: 'mm20-filter-crit' }
                ];
                for (var fi = 0; fi < filterDefs.length; fi++) {
                    (function (fd) {
                        var fbtn = $('<button class="mm20-filter-btn"></button>').text(fd.label);
                        if (fd.cssClass) fbtn.addClass(fd.cssClass);
                        if (fd.key === 'all') fbtn.addClass('mm20-filter-btn--active');
                        fbtn.on('click', function () {
                            if (fd.key === 'all') {
                                self._statusFilter = { ok: true, warn: true, critical: true };
                            } else {
                                // Toggle individual filter
                                self._statusFilter[fd.key] = !self._statusFilter[fd.key];
                            }
                            self._updateFilterBtns();
                            self._applyStatusFilter();
                        });
                        self._filterBtns[fd.key] = fbtn;
                        filterBar.append(fbtn);
                    })(filterDefs[fi]);
                }
                el.append(filterBar);

                // ── C4: Sensitivity Matrix ──
                self._sensitivityEl = $('<div class="mm20-sensitivity" dir="rtl"></div>');
                el.append(self._sensitivityEl);

                // ── Site Cards Container ──
                self._cardsContainer = $('<div class="mm20-cards-container"></div>');
                el.append(self._cardsContainer);

                // Build site cards
                var sites = self.options.sites || MM.SITES;
                self._buildCards(sites);

                // ── Global Search Overlay (hidden) ──
                self._buildSearchOverlay();

                // ── B4: Unit Gear Modal (hidden, reusable) ──
                self._buildGearModal();

                // ── C1: Site Gear Modal (hidden, reusable) ──
                self._buildSiteGearModal();

                // ── C6: Unit Hover Tooltip ──
                self._tooltipEl = $('<div class="mm20-unit-tooltip" style="display:none;position:absolute;"></div>');
                el.css('position', 'relative');
                el.append(self._tooltipEl);

                // ── Bus subscriptions ──
                var bus = self.options.bus;
                if (bus) {
                    self._onSearchQuery = function (d) {
                        if (d.open) self._showSearch();
                        else self._hideSearch();
                    };
                    bus.on('search:query', self._onSearchQuery, self);

                    self._onDemoToggle = function (d) {
                        self.options.demoMode = d.enabled;
                    };
                    bus.on('demo:toggle', self._onDemoToggle, self);

                    // Listen for PI Web API readiness
                    self._onApiReady = function (d) {
                        if (d && d.api) {
                            self._api = d.api;
                        }
                    };
                    bus.on('api:ready', self._onApiReady, self);
                }

                // Also use api if provided directly in options
                if (self.options.api) {
                    self._api = self.options.api;
                }

                // Seed demo data if needed
                if (self.options.demoMode && !self.options.data) {
                    self.options.data = MM.demo.generateSites(sites);
                    self._refreshData();
                }

            } catch (e) {
                MM.shield.log('siteGrid', '_create', e);
                MM.shield.renderFallback(self.element, 'siteGrid', e);
            }
        },


        // ─────────────────────────────────────
        //  Build site cards (DOM structure)
        // ─────────────────────────────────────

        _buildCards: function (sites) {
            var self = this;
            self._cardsContainer.empty();
            self._els = {};

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var card = $('<div class="mm20-site-card" data-site="' + site.id + '"></div>');

                // Header
                var header = $('<div class="mm20-site-header"></div>');
                var nameSpan = $('<span class="mm20-site-name"></span>').text(site.name);
                var metaSpan = $('<span class="mm20-site-meta"></span>');
                metaSpan.append($('<span></span>').text(site.region));
                metaSpan.append($('<span></span>').text(site.fuel));
                metaSpan.append($('<span></span>').text(site.units.length + ' \u05D9\u05D7\u05D9\u05D3\u05D5\u05EA'));
                header.append(nameSpan).append(metaSpan);

                // C1: Site gear button
                var siteGearBtn = $('<button class="mm20-gear-btn mm20-site-gear-btn" title="\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D0\u05EA\u05E8">\u2699</button>');
                (function (sid, sname) {
                    siteGearBtn.on('click', function (e) {
                        e.stopPropagation();
                        self._openSiteGearModal(sid, sname);
                    });
                    // Click to select site
                    header.on('click', function () {
                        if (self.options.bus) {
                            self.options.bus.emit('site:selected', { siteId: sid, siteName: sname });
                        }
                    });
                })(site.id, site.name);
                header.append(siteGearBtn);

                card.append(header);

                // Body (unit rows)
                var body = $('<div class="mm20-site-body"></div>');
                var unitEls = {};

                for (var u = 0; u < site.units.length; u++) {
                    var unitKey = MM.unitKey(site.id, u);
                    var row = $('<div class="mm20-unit-row" data-unit="' + unitKey + '"></div>');

                    // Favorite button
                    var favBtn = $('<button class="mm20-fav-btn" title="\u05DE\u05D5\u05E2\u05D3\u05E3">\u2606</button>');
                    if (self.options.favorites[unitKey]) favBtn.addClass('mm20-fav-btn--active').text('\u2605');
                    (function (key, btn) {
                        btn.on('click', function (e) {
                            e.stopPropagation();
                            self._toggleFavorite(key, btn);
                        });
                    })(unitKey, favBtn);

                    // Unit name
                    var uName = $('<span class="mm20-unit-name"></span>').text(site.units[u]);

                    // Quota bar
                    var barWrap = $('<div class="mm20-quota-bar-wrap"></div>');
                    var barFill = $('<div class="mm20-quota-bar-fill mm20-quota-bar-fill--ok"></div>').css('width', '0%');
                    var barLabel = $('<span class="mm20-quota-label"></span>').text('--');
                    barWrap.append(barFill).append(barLabel);

                    // TTE badge
                    var tteBadge = $('<span class="mm20-tte-badge"></span>').text('--');

                    // Sparkline SVG
                    var sparkSvg = null;
                    if (self.options.showSparklines) {
                        sparkSvg = $('<svg class="mm20-sparkline" viewBox="0 0 60 16" preserveAspectRatio="none"><polyline points=""></polyline></svg>');
                    }

                    // Annotation button
                    var annotBtn = $('<button class="mm20-annot-btn" title="\u05D4\u05E2\u05E8\u05D5\u05EA">\u270E</button>');
                    if (self.options.annotations[unitKey] && self.options.annotations[unitKey].length) {
                        annotBtn.addClass('mm20-annot-btn--has-notes');
                    }

                    // QA15: Events button (unit event log from AF)
                    var eventsBtn = $('<button class="mm20-events-unit-btn" title="\u05D9\u05D5\u05DE\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD">\uD83D\uDCCB</button>');
                    (function (siteId, siteName, unitIdx, unitName) {
                        eventsBtn.on('click', function (e) {
                            e.stopPropagation();
                            if (self.options.bus) {
                                // QA15-fix: resolve eventElement from UnitEventBindings
                                var bindings = self.options.unitEventBindings || {};
                                var siteMap  = bindings[siteId] || {};
                                var unitMap  = siteMap[String(unitIdx)] || siteMap[unitIdx] || {};
                                self.options.bus.emit('unit:eventsRequested', {
                                    siteId:   siteId,
                                    siteName: siteName,
                                    unitIdx:  unitIdx,
                                    unitName: unitName,
                                    eventElementWebId: unitMap.eventElementWebId || '',
                                    eventElementPath:  unitMap.eventElementPath  || ''
                                });
                            }
                        });
                    })(site.id, site.name, u, site.units[u]);

                    // B4: Gear button (unit settings modal)
                    var gearBtn = $('<button class="mm20-gear-btn" title="\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D9\u05D7\u05D9\u05D3\u05D4">\u2699</button>');
                    (function (key, siteId, unitIdx, unitName) {
                        gearBtn.on('click', function (e) {
                            e.stopPropagation();
                            self._openGearModal(key, siteId, unitIdx, unitName);
                        });
                    })(unitKey, site.id, u, site.units[u]);

                    // Assemble row
                    row.append(favBtn).append(uName).append(barWrap).append(tteBadge);
                    if (sparkSvg) row.append(sparkSvg);
                    row.append(eventsBtn).append(annotBtn).append(gearBtn);

                    // Click to select unit + C2 double-click to trend + C6 hover tooltip
                    (function (sid, uidx, uname, uKey) {
                        row.on('click', function () {
                            if (self.options.bus) {
                                self.options.bus.emit('unit:selected', { siteId: sid, unitIdx: uidx, unitName: uname });
                            }
                        });
                        // C2: Double-click to open trend
                        row.on('dblclick', function (e) {
                            e.preventDefault();
                            var us = (self.options.unitSettings || {})[uKey];
                            var tagPath = us ? us.tagPath : '';
                            if (!tagPath) return; // no tag configured → no-op
                            var base = self.options.trendBaseUrl || '';
                            if (base) {
                                window.open(base + '/#/Displays/Trend/' + encodeURIComponent(tagPath), '_blank');
                            }
                        });
                        // C6: Hover tooltip
                        row.on('mouseenter', function (e) {
                            self._showTooltipDelayed(e, sid, uidx, uname);
                        });
                        row.on('mouseleave', function () {
                            self._hideTooltip();
                        });
                    })(site.id, u, site.units[u], unitKey);

                    body.append(row);

                    unitEls[u] = {
                        row:    row,
                        name:   uName,
                        bar:    barWrap,
                        fill:   barFill,
                        label:  barLabel,
                        tte:    tteBadge,
                        fav:    favBtn,
                        spark:  sparkSvg,
                        annot:  annotBtn,
                        gear:   gearBtn
                    };
                }

                card.append(body);
                self._cardsContainer.append(card);

                self._els[site.id] = {
                    card:   card,
                    header: header,
                    body:   body,
                    units:  unitEls
                };
            }
        },


        // ─────────────────────────────────────
        //  Data refresh (update DOM, don't rebuild)
        // ─────────────────────────────────────

        _refreshData: function () {
            var self = this;
            var data = self.options.data;
            if (!data) return;

            // C5: Invalidate sort cache on data update
            self._dataVer = (self._dataVer || 0) + 1;

            var sites = self.options.sites || MM.SITES;
            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = data[site.id];
                var siteEls = self._els[site.id];
                if (!siteEls) continue;

                for (var u = 0; u < site.units.length; u++) {
                    var uData = siteData ? siteData[u] : null;
                    var uEls = siteEls.units[u];
                    if (!uEls) continue;

                    if (!uData) {
                        uEls.fill.css('width', '0%')
                            .removeClass('mm20-quota-bar-fill--warn mm20-quota-bar-fill--critical')
                            .addClass('mm20-quota-bar-fill--ok');
                        uEls.label.text('--');
                        uEls.tte.text('--').removeClass('mm20-tte-badge--low');
                        continue;
                    }

                    // Quota bar
                    var pct = uData.pct || 0;
                    var clampedPct = Math.min(pct, 100);
                    uEls.fill.css('width', clampedPct + '%');
                    uEls.fill.removeClass('mm20-quota-bar-fill--ok mm20-quota-bar-fill--warn mm20-quota-bar-fill--critical');
                    var status = MM.getStatus(pct, self.options.warnPct, self.options.critPct);
                    uEls.fill.addClass('mm20-quota-bar-fill--' + status);

                    // Label
                    uEls.label.text(MM.formatNum(pct, self.options.decimals) + '%');

                    // TTE
                    if (uData.tte !== undefined && uData.tte !== Infinity) {
                        var tteHrs = Math.round(uData.tte);
                        uEls.tte.text(tteHrs + 'h');
                        if (tteHrs < 168) { // < 1 week
                            uEls.tte.addClass('mm20-tte-badge--low');
                        } else {
                            uEls.tte.removeClass('mm20-tte-badge--low');
                        }
                    } else {
                        uEls.tte.text('\u221E');
                        uEls.tte.removeClass('mm20-tte-badge--low');
                    }

                    // Sparkline
                    if (uEls.spark && uData.monthly && uData.monthly.length) {
                        self._renderSparkline(uEls.spark, uData.monthly);
                    }
                }
            }

            // C4: Update sensitivity matrix
            self._updateSensitivity();
            // C3: Re-apply status filter after data refresh
            self._applyStatusFilter();
        },


        // ─────────────────────────────────────
        //  Sparkline SVG polyline
        // ─────────────────────────────────────

        _renderSparkline: function (svgEl, monthly) {
            var points = [];
            var max = 1;
            for (var i = 0; i < monthly.length; i++) {
                if (monthly[i].value > max) max = monthly[i].value;
            }
            for (var j = 0; j < monthly.length; j++) {
                var x = Math.round((j / Math.max(monthly.length - 1, 1)) * 60);
                var y = Math.round(16 - (monthly[j].value / max) * 14);
                points.push(x + ',' + y);
            }
            var polyline = svgEl.find('polyline');
            if (polyline.length) {
                polyline.attr('points', points.join(' '));
            }
        },


        // ─────────────────────────────────────
        //  Favorites toggle
        // ─────────────────────────────────────

        _toggleFavorite: function (unitKey, btnEl) {
            var favs = this.options.favorites;
            if (favs[unitKey]) {
                delete favs[unitKey];
                btnEl.removeClass('mm20-fav-btn--active').text('\u2606');
            } else {
                favs[unitKey] = true;
                btnEl.addClass('mm20-fav-btn--active').text('\u2605');
            }
            if (this.options.bus) {
                this.options.bus.emit('favorites:changed', { favorites: favs });
            }
        },


        // ─────────────────────────────────────
        //  Sort
        // ─────────────────────────────────────

        _updateSortBtns: function () {
            var active = this.options.sortOrder;
            for (var key in this._sortBtns) {
                if (this._sortBtns.hasOwnProperty(key)) {
                    this._sortBtns[key].toggleClass('mm20-sort-btn--active', key === active);
                }
            }
        },

        _sortAndRender: function () {
            var self = this;
            var sites = self.options.sites || MM.SITES;
            var data = self.options.data || {};
            var order = self.options.sortOrder;

            // C5: Check sort cache
            var cache = self._sortCache;
            if (cache && cache.order === order && cache.dataVer === self._dataVer && cache.arr) {
                // Cache hit — just re-order DOM
                for (var ci = 0; ci < cache.arr.length; ci++) {
                    var cel = self._els[cache.arr[ci]];
                    if (cel && cel.card) self._cardsContainer.append(cel.card);
                }
                return;
            }

            // Build sortable list of site-level aggregates
            var sortable = [];
            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = data[site.id] || {};
                var avgPct = 0, totalHours = 0, minTte = Infinity, worstStatus = 0;
                var count = site.units.length;

                for (var u = 0; u < count; u++) {
                    var ud = siteData[u];
                    if (ud) {
                        avgPct += (ud.pct || 0);
                        totalHours += (ud.hours || 0);
                        if (ud.tte < minTte) minTte = ud.tte;
                        var sv = ud.status === 'critical' ? 2 : ud.status === 'warn' ? 1 : 0;
                        if (sv > worstStatus) worstStatus = sv;
                    }
                }
                avgPct = count > 0 ? avgPct / count : 0;

                sortable.push({
                    id: site.id, name: site.name,
                    avgPct: avgPct, totalHours: totalHours,
                    minTte: minTte, worstStatus: worstStatus
                });
            }

            // Sort
            sortable.sort(function (a, b) {
                switch (order) {
                    case 'pct':    return b.avgPct - a.avgPct;
                    case 'hours':  return b.totalHours - a.totalHours;
                    case 'tte':    return a.minTte - b.minTte;
                    case 'status': return b.worstStatus - a.worstStatus;
                    default:       return a.name.localeCompare(b.name);
                }
            });

            // Re-order DOM + C5: build cache
            var sortedIds = [];
            for (var i = 0; i < sortable.length; i++) {
                sortedIds.push(sortable[i].id);
                var el = self._els[sortable[i].id];
                if (el && el.card) {
                    self._cardsContainer.append(el.card);
                }
            }
            self._sortCache = { order: order, dataVer: self._dataVer, arr: sortedIds };
        },


        // ─────────────────────────────────────
        //  Filter
        // ─────────────────────────────────────

        _applyFilter: function () {
            var term = (this.options.filterText || '').toLowerCase();
            var sites = this.options.sites || MM.SITES;

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteEls = this._els[site.id];
                if (!siteEls) continue;

                var anyVisible = false;
                for (var u = 0; u < site.units.length; u++) {
                    var unitEl = siteEls.units[u];
                    if (!unitEl) continue;
                    var match = !term ||
                        site.name.toLowerCase().indexOf(term) >= 0 ||
                        site.units[u].toLowerCase().indexOf(term) >= 0 ||
                        site.id.toLowerCase().indexOf(term) >= 0;
                    unitEl.row.toggle(match);
                    if (match) anyVisible = true;
                }
                siteEls.card.toggle(anyVisible);
            }
        },


        // ─────────────────────────────────────
        //  Global Search Overlay
        // ─────────────────────────────────────

        _buildSearchOverlay: function () {
            var self = this;

            self._gsearchOverlay = $('<div class="mm20-gsearch-overlay" style="display:none;"></div>');
            var modal = $('<div class="mm20-gsearch-modal"></div>');
            self._gsearchInput = $('<input class="mm20-gsearch-input" type="text" placeholder="Ctrl+K \u05D7\u05D9\u05E4\u05D5\u05E9 \u05DE\u05D4\u05D9\u05E8..." dir="rtl" />');
            self._gsearchResults = $('<div class="mm20-gsearch-results"></div>');

            self._gsearchInput.on('input', function () {
                self._updateSearchResults(this.value);
            });

            self._gsearchInput.on('keydown', function (e) {
                if (e.keyCode === 27) { // Escape
                    self._hideSearch();
                } else if (e.keyCode === 13) { // Enter
                    var focused = self._gsearchResults.find('.mm20-gsearch-item--focused');
                    if (focused.length) focused.trigger('click');
                } else if (e.keyCode === 40) { // Arrow down
                    e.preventDefault();
                    self._moveSearchFocus(1);
                } else if (e.keyCode === 38) { // Arrow up
                    e.preventDefault();
                    self._moveSearchFocus(-1);
                }
            });

            // Close on overlay click
            self._gsearchOverlay.on('click', function (e) {
                if (e.target === self._gsearchOverlay[0]) self._hideSearch();
            });

            modal.append(self._gsearchInput).append(self._gsearchResults);
            self._gsearchOverlay.append(modal);
            self.element.append(self._gsearchOverlay);
        },

        _showSearch: function () {
            this._gsearchOverlay.show();
            this._gsearchInput.val('').focus();
            this._gsearchResults.empty();
        },

        _hideSearch: function () {
            this._gsearchOverlay.hide();
        },

        _updateSearchResults: function (term) {
            var self = this;
            var container = self._gsearchResults;
            container.empty();

            if (!term || term.length < 1) return;
            term = term.toLowerCase();

            var sites = self.options.sites || MM.SITES;
            var results = [];

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                for (var u = 0; u < site.units.length; u++) {
                    var unitName = site.units[u];
                    if (site.name.toLowerCase().indexOf(term) >= 0 ||
                        unitName.toLowerCase().indexOf(term) >= 0 ||
                        site.id.toLowerCase().indexOf(term) >= 0) {
                        results.push({ siteId: site.id, unitIdx: u, siteName: site.name, unitName: unitName });
                    }
                }
                if (results.length >= 20) break; // cap results
            }

            for (var r = 0; r < results.length; r++) {
                (function (res, idx) {
                    var item = $('<div class="mm20-gsearch-item"></div>')
                        .text(res.siteName + ' \u2014 ' + res.unitName);
                    if (idx === 0) item.addClass('mm20-gsearch-item--focused');
                    item.on('click', function () {
                        self._hideSearch();
                        // Scroll to the unit and highlight
                        var unitKey = MM.unitKey(res.siteId, res.unitIdx);
                        var siteEls = self._els[res.siteId];
                        if (siteEls && siteEls.units[res.unitIdx]) {
                            var row = siteEls.units[res.unitIdx].row;
                            siteEls.card.show();
                            row.show();
                            row[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
                            row.css('background', 'rgba(91,192,235,0.2)');
                            setTimeout(function () { row.css('background', ''); }, 2000);
                        }
                        if (self.options.bus) {
                            self.options.bus.emit('unit:selected', {
                                siteId: res.siteId, unitIdx: res.unitIdx, unitName: res.unitName
                            });
                        }
                    });
                    container.append(item);
                })(results[r], r);
            }
        },

        _moveSearchFocus: function (dir) {
            var items = this._gsearchResults.find('.mm20-gsearch-item');
            if (!items.length) return;
            var curr = items.filter('.mm20-gsearch-item--focused');
            var idx = items.index(curr);
            items.removeClass('mm20-gsearch-item--focused');
            var next = idx + dir;
            if (next < 0) next = items.length - 1;
            if (next >= items.length) next = 0;
            $(items[next]).addClass('mm20-gsearch-item--focused');
        },


        // ─────────────────────────────────────
        //  B4: Unit Gear Modal
        // ─────────────────────────────────────

        _buildGearModal: function () {
            var self = this;
            var $ = window.jQuery;

            self._gearModal = $('<div class="mm20-gear-overlay" style="display:none;"></div>');
            var modal = $(
                '<div class="mm20-gear-modal" dir="rtl">' +
                    '<div class="mm20-gear-header">' +
                        '<span class="mm20-gear-title"></span>' +
                        '<button class="mm20-gear-close">\u2715</button>' +
                    '</div>' +
                    '<div class="mm20-gear-body">' +
                        '<div class="mm20-gear-field">' +
                            '<label>\u05E9\u05DD \u05EA\u05E6\u05D5\u05D2\u05D4:</label>' +
                            '<input class="mm20-search-input mm20-gf-displayName" type="text" placeholder="\u05E9\u05DD \u05D7\u05DC\u05D5\u05E4\u05D9..." />' +
                        '</div>' +
                        '<div class="mm20-gear-field">' +
                            '<label>\u05E0\u05EA\u05D9\u05D1 AF:</label>' +
                            '<input class="mm20-search-input mm20-gf-tagPath" type="text" dir="ltr" placeholder="\\\\AF\\Server\\DB\\...|Attr" />' +
                        '</div>' +
                        '<div class="mm20-gear-row">' +
                            '<div class="mm20-gear-field mm20-gear-half">' +
                                '<label>MW \u05DE\u05E8\u05D1\u05D9:</label>' +
                                '<input class="mm20-search-input mm20-gf-maxMW" type="number" min="0" step="1" />' +
                            '</div>' +
                            '<div class="mm20-gear-field mm20-gear-half">' +
                                '<label>% \u05DE\u05DB\u05E1\u05D4:</label>' +
                                '<input class="mm20-search-input mm20-gf-quotaPct" type="number" min="0" max="100" step="0.1" />' +
                            '</div>' +
                        '</div>' +
                        '<div class="mm20-gear-field">' +
                            '<label>\u05E1\u05D5\u05D2 \u05D3\u05DC\u05E7:</label>' +
                            '<select class="mm20-search-input mm20-gf-fuelType">' +
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
                        '<div class="mm20-gear-row">' +
                            '<div class="mm20-gear-field mm20-gear-half">' +
                                '<label>\u05E1\u05E3 \u05D0\u05D6\u05D4\u05E8\u05D4 (%):</label>' +
                                '<input class="mm20-search-input mm20-gf-warnThreshold" type="number" min="0" max="100" step="1" />' +
                            '</div>' +
                            '<div class="mm20-gear-field mm20-gear-half">' +
                                '<label>\u05E1\u05E3 \u05E7\u05E8\u05D9\u05D8\u05D9 (%):</label>' +
                                '<input class="mm20-search-input mm20-gf-critThreshold" type="number" min="0" max="100" step="1" />' +
                            '</div>' +
                        '</div>' +
                        '<div class="mm20-gear-field">' +
                            '<label>\u05D4\u05E2\u05E8\u05D5\u05EA:</label>' +
                            '<textarea class="mm20-search-input mm20-gf-notes" rows="3" placeholder="\u05D4\u05E2\u05E8\u05D5\u05EA \u05D7\u05D5\u05E4\u05E9\u05D9\u05D5\u05EA..."></textarea>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mm20-gear-footer">' +
                        '<button class="mm20-btn mm20-btn--ok mm20-gear-save">\u05E9\u05DE\u05D5\u05E8</button>' +
                        '<button class="mm20-btn mm20-btn--cancel mm20-gear-cancel">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                    '</div>' +
                '</div>'
            );

            // Wire close / cancel
            modal.find('.mm20-gear-close').on('click', function () { self._closeGearModal(); });
            modal.find('.mm20-gear-cancel').on('click', function () { self._closeGearModal(); });

            // Wire save
            modal.find('.mm20-gear-save').on('click', function () { self._saveGearModal(); });

            // Close on overlay click
            self._gearModal.on('click', function (e) {
                if (e.target === self._gearModal[0]) self._closeGearModal();
            });

            // Escape to close
            self._gearModal.on('keydown', function (e) {
                if (e.keyCode === 27) self._closeGearModal();
            });

            self._gearModal.append(modal);
            self.element.append(self._gearModal);
        },

        _openGearModal: function (unitKey, siteId, unitIdx, unitName) {
            var self = this;
            if (self._destroyed) return;

            try {
                self._gearModalUnitKey = unitKey;
                var settings = self.options.unitSettings[unitKey] || {};
                var modal = self._gearModal;

                // Set title
                modal.find('.mm20-gear-title').text('\u2699 \u05D4\u05D2\u05D3\u05E8\u05D5\u05EA: ' + unitName);

                // Populate fields
                modal.find('.mm20-gf-displayName').val(settings.displayName || '');
                modal.find('.mm20-gf-tagPath').val(settings.tagPath || '');
                modal.find('.mm20-gf-maxMW').val(settings.maxMW || '');
                modal.find('.mm20-gf-quotaPct').val(settings.quotaPct || '');
                modal.find('.mm20-gf-fuelType').val(settings.fuelType || '');
                modal.find('.mm20-gf-warnThreshold').val(settings.warnThreshold || '');
                modal.find('.mm20-gf-critThreshold').val(settings.critThreshold || '');
                modal.find('.mm20-gf-notes').val(settings.notes || '');

                // Show
                modal.show();
                modal.find('.mm20-gf-displayName').focus();
            } catch (e) {
                MM.shield.log('siteGrid', '_openGearModal', e);
            }
        },

        _closeGearModal: function () {
            if (this._gearModal) this._gearModal.hide();
            this._gearModalUnitKey = null;
        },

        _saveGearModal: function () {
            var self = this;
            if (!self._gearModalUnitKey) return;

            try {
                var modal = self._gearModal;
                var key = self._gearModalUnitKey;

                var settings = {
                    displayName:   modal.find('.mm20-gf-displayName').val().trim(),
                    tagPath:       modal.find('.mm20-gf-tagPath').val().trim(),
                    maxMW:         parseFloat(modal.find('.mm20-gf-maxMW').val()) || 0,
                    quotaPct:      parseFloat(modal.find('.mm20-gf-quotaPct').val()) || 0,
                    fuelType:      modal.find('.mm20-gf-fuelType').val(),
                    warnThreshold: parseFloat(modal.find('.mm20-gf-warnThreshold').val()) || 0,
                    critThreshold: parseFloat(modal.find('.mm20-gf-critThreshold').val()) || 0,
                    notes:         modal.find('.mm20-gf-notes').val().trim()
                };

                // Save to options map
                if (!self.options.unitSettings) self.options.unitSettings = {};
                self.options.unitSettings[key] = settings;

                // Emit via bus
                var bus = self.options.bus;
                if (bus) {
                    bus.emit('unit:settings', { unitKey: key, settings: settings });
                }

                self._closeGearModal();
            } catch (e) {
                MM.shield.log('siteGrid', '_saveGearModal', e);
            }
        },


        // ─────────────────────────────────────
        //  C1: Site Gear Modal
        // ─────────────────────────────────────

        _buildSiteGearModal: function () {
            var self = this;
            var $ = window.jQuery;

            self._siteGearModal = $('<div class="mm20-gear-overlay" style="display:none;"></div>');
            var modal = $(
                '<div class="mm20-gear-modal" dir="rtl">' +
                    '<div class="mm20-gear-header">' +
                        '<span class="mm20-gear-title"></span>' +
                        '<button class="mm20-gear-close">\u2715</button>' +
                    '</div>' +
                    '<div class="mm20-gear-body">' +
                        '<div class="mm20-gear-field">' +
                            '<label>\u05E9\u05DD \u05EA\u05E6\u05D5\u05D2\u05D4:</label>' +
                            '<input class="mm20-search-input mm20-sgf-displayName" type="text" />' +
                        '</div>' +
                        '<div class="mm20-gear-field">' +
                            '<label>\u05E0\u05EA\u05D9\u05D1 AF \u05D1\u05E1\u05D9\u05E1:</label>' +
                            '<input class="mm20-search-input mm20-sgf-tagPath" type="text" dir="ltr" placeholder="\\\\AF\\Server\\DB\\Plants\\Site" />' +
                        '</div>' +
                        '<div class="mm20-gear-field">' +
                            '<label>MW \u05DE\u05E8\u05D1\u05D9 \u05D0\u05EA\u05E8:</label>' +
                            '<input class="mm20-search-input mm20-sgf-maxMW" type="number" min="0" step="1" />' +
                        '</div>' +
                        '<div class="mm20-gear-field">' +
                            '<label>\u05D4\u05E2\u05E8\u05D5\u05EA:</label>' +
                            '<textarea class="mm20-search-input mm20-sgf-notes" rows="3"></textarea>' +
                        '</div>' +
                    '</div>' +
                    '<div class="mm20-gear-footer">' +
                        '<button class="mm20-btn mm20-btn--ok mm20-sgear-save">\u05E9\u05DE\u05D5\u05E8</button>' +
                        '<button class="mm20-btn mm20-btn--cancel mm20-sgear-cancel">\u05D1\u05D9\u05D8\u05D5\u05DC</button>' +
                    '</div>' +
                '</div>'
            );

            modal.find('.mm20-gear-close').on('click', function () { self._closeSiteGearModal(); });
            modal.find('.mm20-sgear-cancel').on('click', function () { self._closeSiteGearModal(); });
            modal.find('.mm20-sgear-save').on('click', function () { self._saveSiteGearModal(); });

            self._siteGearModal.on('click', function (e) {
                if (e.target === self._siteGearModal[0]) self._closeSiteGearModal();
            });
            self._siteGearModal.on('keydown', function (e) {
                if (e.keyCode === 27) self._closeSiteGearModal();
            });

            self._siteGearModal.append(modal);
            self.element.append(self._siteGearModal);
        },

        _openSiteGearModal: function (siteId, siteName) {
            var self = this;
            if (self._destroyed) return;
            try {
                self._siteGearSiteId = siteId;
                var settings = (self.options.siteSettings || {})[siteId] || {};
                var modal = self._siteGearModal;
                modal.find('.mm20-gear-title').text('\u2699 \u05D0\u05EA\u05E8: ' + siteName);
                modal.find('.mm20-sgf-displayName').val(settings.displayName || '');
                modal.find('.mm20-sgf-tagPath').val(settings.tagPath || '');
                modal.find('.mm20-sgf-maxMW').val(settings.maxMW || '');
                modal.find('.mm20-sgf-notes').val(settings.notes || '');
                modal.show();
                modal.find('.mm20-sgf-displayName').focus();
            } catch (e) {
                MM.shield.log('siteGrid', '_openSiteGearModal', e);
            }
        },

        _closeSiteGearModal: function () {
            if (this._siteGearModal) this._siteGearModal.hide();
            this._siteGearSiteId = null;
        },

        _saveSiteGearModal: function () {
            var self = this;
            if (!self._siteGearSiteId) return;
            try {
                var modal = self._siteGearModal;
                var sid = self._siteGearSiteId;
                var settings = {
                    displayName: modal.find('.mm20-sgf-displayName').val().trim(),
                    tagPath:     modal.find('.mm20-sgf-tagPath').val().trim(),
                    maxMW:       parseFloat(modal.find('.mm20-sgf-maxMW').val()) || 0,
                    notes:       modal.find('.mm20-sgf-notes').val().trim()
                };
                if (!self.options.siteSettings) self.options.siteSettings = {};
                self.options.siteSettings[sid] = settings;
                if (self.options.bus) {
                    self.options.bus.emit('site:settings', { siteId: sid, settings: settings });
                }
                self._closeSiteGearModal();
            } catch (e) {
                MM.shield.log('siteGrid', '_saveSiteGearModal', e);
            }
        },


        // ─────────────────────────────────────
        //  C3: Status Filter
        // ─────────────────────────────────────

        _updateFilterBtns: function () {
            var sf = this._statusFilter;
            var allOn = sf.ok && sf.warn && sf.critical;
            if (this._filterBtns.all) this._filterBtns.all.toggleClass('mm20-filter-btn--active', allOn);
            if (this._filterBtns.ok)  this._filterBtns.ok.toggleClass('mm20-filter-btn--active', sf.ok);
            if (this._filterBtns.warn) this._filterBtns.warn.toggleClass('mm20-filter-btn--active', sf.warn);
            if (this._filterBtns.critical) this._filterBtns.critical.toggleClass('mm20-filter-btn--active', sf.critical);
        },

        _applyStatusFilter: function () {
            var self = this;
            var sf = self._statusFilter;
            if (!sf) return;
            var data = self.options.data || {};
            var sites = self.options.sites || MM.SITES;

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = data[site.id] || {};
                var siteEls = self._els[site.id];
                if (!siteEls) continue;

                var anyVisible = false;
                for (var u = 0; u < site.units.length; u++) {
                    var uEls = siteEls.units[u];
                    if (!uEls) continue;
                    var ud = siteData[u];
                    var status = (ud && ud.status) ? ud.status : 'ok';
                    var visible = !!sf[status];
                    // Also respect text filter
                    if (visible && self.options.filterText) {
                        var term = self.options.filterText.toLowerCase();
                        visible = site.name.toLowerCase().indexOf(term) >= 0 ||
                                  site.units[u].toLowerCase().indexOf(term) >= 0;
                    }
                    uEls.row.toggle(visible);
                    if (visible) anyVisible = true;
                }
                siteEls.card.toggle(anyVisible);
            }
        },


        // ─────────────────────────────────────
        //  C4: Sensitivity Matrix
        // ─────────────────────────────────────

        _updateSensitivity: function () {
            var self = this;
            if (!self._sensitivityEl) return;
            var data = self.options.data || {};
            var sites = self.options.sites || MM.SITES;

            var totalMW = 0, onlineMW = 0, warnMW = 0, critMW = 0;
            var totalUnits = 0, okUnits = 0, warnUnits = 0, critUnits = 0;

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = data[site.id] || {};
                for (var u = 0; u < site.units.length; u++) {
                    totalUnits++;
                    var ud = siteData[u];
                    // Estimate MW from unitSettings or use fallback
                    var us = (self.options.unitSettings || {})[MM.unitKey(site.id, u)];
                    var mw = us && us.maxMW ? us.maxMW : 100; // fallback 100 MW
                    totalMW += mw;
                    if (!ud) { okUnits++; onlineMW += mw; continue; }
                    var status = ud.status || 'ok';
                    if (status === 'critical') { critUnits++; critMW += mw; }
                    else if (status === 'warn') { warnUnits++; warnMW += mw; }
                    else { okUnits++; }
                    onlineMW += mw;
                }
            }

            self._sensitivityEl.html(
                '<div class="mm20-sens-grid">' +
                    '<div class="mm20-sens-cell mm20-sens-total">' +
                        '<div class="mm20-sens-value">' + totalMW + '</div>' +
                        '<div class="mm20-sens-label">MW \u05E1\u05D4\u05F4\u05DB</div>' +
                    '</div>' +
                    '<div class="mm20-sens-cell mm20-sens-ok">' +
                        '<div class="mm20-sens-value">' + okUnits + '</div>' +
                        '<div class="mm20-sens-label">\u05EA\u05E7\u05D9\u05DF</div>' +
                    '</div>' +
                    '<div class="mm20-sens-cell mm20-sens-warn">' +
                        '<div class="mm20-sens-value">' + warnUnits + '</div>' +
                        '<div class="mm20-sens-label">\u05D0\u05D6\u05D4\u05E8\u05D4</div>' +
                    '</div>' +
                    '<div class="mm20-sens-cell mm20-sens-crit">' +
                        '<div class="mm20-sens-value">' + critUnits + '</div>' +
                        '<div class="mm20-sens-label">\u05E7\u05E8\u05D9\u05D8\u05D9</div>' +
                    '</div>' +
                    '<div class="mm20-sens-cell">' +
                        '<div class="mm20-sens-value">' + warnMW + '</div>' +
                        '<div class="mm20-sens-label">MW \u05D1\u05E1\u05D9\u05DB\u05D5\u05DF</div>' +
                    '</div>' +
                    '<div class="mm20-sens-cell mm20-sens-crit">' +
                        '<div class="mm20-sens-value">' + critMW + '</div>' +
                        '<div class="mm20-sens-label">MW \u05E7\u05E8\u05D9\u05D8\u05D9</div>' +
                    '</div>' +
                '</div>'
            );
        },


        // ─────────────────────────────────────
        //  C6: Unit Hover Tooltip
        // ─────────────────────────────────────

        _showTooltipDelayed: function (e, siteId, unitIdx, unitName) {
            var self = this;
            self._hideTooltip();
            self._tooltipTimer = setTimeout(function () {
                self._showTooltip(e, siteId, unitIdx, unitName);
            }, 200);
        },

        _showTooltip: function (e, siteId, unitIdx, unitName) {
            var self = this;
            if (self._destroyed || !self._tooltipEl) return;

            var data = self.options.data || {};
            var siteData = data[siteId] || {};
            var ud = siteData[unitIdx] || {};
            var us = (self.options.unitSettings || {})[MM.unitKey(siteId, unitIdx)] || {};

            var lines = [
                '<strong>' + MM.escapeHtml(unitName) + '</strong>'
            ];
            if (ud.hours !== undefined)  lines.push('\u05E9\u05E2\u05D5\u05EA: ' + MM.formatNum(ud.hours, 1));
            if (ud.quota !== undefined)  lines.push('\u05DE\u05DB\u05E1\u05D4: ' + MM.formatNum(ud.quota, 1));
            if (ud.pct !== undefined)    lines.push('% \u05E0\u05D9\u05E6\u05D5\u05DC: ' + MM.formatNum(ud.pct, 1) + '%');
            if (ud.tte !== undefined && ud.tte !== Infinity) lines.push('TTE: ' + Math.round(ud.tte) + 'h');
            if (us.fuelType)             lines.push('\u05D3\u05DC\u05E7: ' + us.fuelType);
            if (us.maxMW)                lines.push('MW \u05DE\u05E8\u05D1\u05D9: ' + us.maxMW);
            if (ud.ts)                   lines.push('\u05E2\u05D3\u05DB\u05D5\u05DF: ' + MM.formatDate(new Date(ud.ts), 'time'));

            self._tooltipEl.html(lines.join('<br>')).show();

            // Position relative to container
            var rect = self.element[0].getBoundingClientRect();
            var left = e.clientX - rect.left + 12;
            var top  = e.clientY - rect.top - 10;
            // Keep within bounds
            if (left + 200 > rect.width) left = rect.width - 210;
            if (top < 0) top = 5;
            self._tooltipEl.css({ left: left + 'px', top: top + 'px' });
        },

        _hideTooltip: function () {
            if (this._tooltipTimer) { clearTimeout(this._tooltipTimer); this._tooltipTimer = null; }
            if (this._tooltipEl) this._tooltipEl.hide();
        },


        // ═══════════════════════════════════════
        //  PI Web API Integration: Sparklines
        // ═══════════════════════════════════════

        _fetchSparkline: function (unitKey, attrWebId) {
            var self = this;
            if (!self._api || !attrWebId) return;

            try {
                // Check cache first (TTL: 5 minutes)
                var cached = self._sparkCache[unitKey];
                if (cached && (Date.now() - cached.fetchedAt) < 300000) {
                    return; // Cache fresh, skip fetch
                }

                // Fetch 24-hour recorded data with 24 intervals
                self._api.getRecorded(attrWebId, '*-24h', '*', 24, function (err, data) {
                    if (err) {
                        MM.shield.log('siteGrid', '_fetchSparkline', err);
                        return;
                    }
                    if (!data || !Array.isArray(data)) return;

                    try {
                        // Convert to sparkline format: { x: timestamp, y: value }
                        var points = [];
                        for (var i = 0; i < data.length; i++) {
                            var pt = data[i];
                            if (pt && pt.Timestamp && pt.Value !== null && pt.Value !== undefined) {
                                points.push({
                                    x: new Date(pt.Timestamp).getTime(),
                                    y: parseFloat(pt.Value)
                                });
                            }
                        }

                        // Store in cache
                        self._sparkCache[unitKey] = {
                            data: points,
                            fetchedAt: Date.now()
                        };

                        // Trigger re-render of unit cell if it exists
                        var unitRow = $('[data-unit="' + unitKey + '"]');
                        if (unitRow.length > 0) {
                            var sparkEl = unitRow.find('.mm20-unit-sparkline');
                            if (sparkEl.length > 0) {
                                // Emit signal to re-render sparkline
                                if (self.options.bus) {
                                    self.options.bus.emit('sparkline:updated', {
                                        unitKey: unitKey,
                                        points: points
                                    });
                                }
                            }
                        }
                    } catch (innerErr) {
                        MM.shield.log('siteGrid', '_fetchSparkline:parse', innerErr);
                    }
                });
            } catch (e) {
                MM.shield.log('siteGrid', '_fetchSparkline:outer', e);
            }
        },


        // ═══════════════════════════════════════
        //  PI Web API Integration: Regression Rate
        // ═══════════════════════════════════════

        _calcRegressionRate: function (unitKey, attrWebId) {
            var self = this;
            if (!self._api || !attrWebId) return;

            try {
                // Check cache first (TTL: 2 minutes)
                var cached = self._rateCache[unitKey];
                if (cached && (Date.now() - cached.fetchedAt) < 120000) {
                    return; // Cache fresh, skip calculation
                }

                // Fetch 1-hour recorded data with 12 intervals
                self._api.getRecorded(attrWebId, '*-1h', '*', 12, function (err, data) {
                    if (err) {
                        MM.shield.log('siteGrid', '_calcRegressionRate', err);
                        return;
                    }
                    if (!data || !Array.isArray(data) || data.length < 2) return;

                    try {
                        // Build point array: { x: time in ms, y: value }
                        var points = [];
                        for (var i = 0; i < data.length; i++) {
                            var pt = data[i];
                            if (pt && pt.Timestamp && pt.Value !== null && pt.Value !== undefined) {
                                points.push({
                                    x: new Date(pt.Timestamp).getTime(),
                                    y: parseFloat(pt.Value)
                                });
                            }
                        }

                        if (points.length < 2) return;

                        // Simple linear regression: y = a + bx, solve for b (slope)
                        var n = points.length;
                        var sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
                        for (var j = 0; j < n; j++) {
                            var x = points[j].x;
                            var y = points[j].y;
                            sumX += x;
                            sumY += y;
                            sumXY += x * y;
                            sumX2 += x * x;
                        }

                        var slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);

                        // Convert slope to rate per hour (slope is per millisecond)
                        var ratePerHour = slope * (1000 * 60 * 60); // ms to hours

                        // Store in cache
                        self._rateCache[unitKey] = {
                            rate: ratePerHour,
                            fetchedAt: Date.now()
                        };

                        // Emit signal if rate display exists
                        if (self.options.bus) {
                            self.options.bus.emit('rate:calculated', {
                                unitKey: unitKey,
                                ratePerHour: ratePerHour
                            });
                        }
                    } catch (innerErr) {
                        MM.shield.log('siteGrid', '_calcRegressionRate:regression', innerErr);
                    }
                });
            } catch (e) {
                MM.shield.log('siteGrid', '_calcRegressionRate:outer', e);
            }
        },


        // ═══════════════════════════════════════
        //  _setOption — React to option changes
        // ═══════════════════════════════════════

        _setOption: function (key, value) {
            this._super(key, value);

            if (key === 'data') {
                this._refreshData();
            } else if (key === 'sortOrder') {
                this._updateSortBtns();
                this._sortAndRender();
            } else if (key === 'filterText') {
                this._applyFilter();
            } else if (key === 'sites') {
                this._buildCards(value || MM.SITES);
                this._refreshData();
            } else if (key === 'warnPct' || key === 'critPct') {
                this._refreshData();
            } else if (key === 'unitSettings') {
                // B4: external settings push (e.g., from config import)
            } else if (key === 'api') {
                this._api = value;
            }
        },


        // ═══════════════════════════════════════
        //  _destroy — Cleanup
        // ═══════════════════════════════════════

        _destroy: function () {
            this._destroyed = true;

            // Unsubscribe bus
            var bus = this.options.bus;
            if (bus) {
                if (this._onSearchQuery) bus.off('search:query', this._onSearchQuery);
                if (this._onDemoToggle) bus.off('demo:toggle', this._onDemoToggle);
                if (this._onApiReady) bus.off('api:ready', this._onApiReady);
            }

            // Remove event listeners
            if (this._searchInput) this._searchInput.off();
            if (this._gsearchOverlay) this._gsearchOverlay.off();
            if (this._gsearchInput) this._gsearchInput.off();
            if (this._gearModal) this._gearModal.off();
            if (this._siteGearModal) this._siteGearModal.off();

            // C6: Clear tooltip timer
            if (this._tooltipTimer) { clearTimeout(this._tooltipTimer); this._tooltipTimer = null; }

            // Clear caches and API
            this._sparkCache = null;
            this._rateCache = null;
            this._api = null;

            // Clear DOM refs
            this._els = null;
            this._sortBtns = null;
            this._filterBtns = null;
            this._gearModal = null;
            this._gearModalUnitKey = null;
            this._siteGearModal = null;
            this._siteGearSiteId = null;
            this._sensitivityEl = null;
            this._tooltipEl = null;
            this._sortCache = null;
            this.element.empty().removeClass('mm20-site-grid-root');
        }
    });

})(window.jQuery);
