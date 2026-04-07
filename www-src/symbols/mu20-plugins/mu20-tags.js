/**
 * ═══════════════════════════════════════════════════════
 *  mu20-tags.js  —  Tag Registry Plugin (MU20)
 * ═══════════════════════════════════════════════════════
 *  Displays a registry of all AF tags being monitored,
 *  with status badges, search/filter, column sort,
 *  live API preview, validate-all, and CSV export.
 *
 *  Ported from mm20-tags.js (jQuery widget → vanilla ES5).
 *  Version: ULT.1.6  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-tags] MU20 core not loaded'); return; }

    // ── Constants ──
    var COLUMNS = [
        { key: 'site',   label: '\u05D0\u05EA\u05E8' },
        { key: 'unit',   label: '\u05D9\u05D7\u05D9\u05D3\u05D4' },
        { key: 'attr',   label: '\u05DE\u05D0\u05E4\u05D9\u05D9\u05DF' },
        { key: 'value',  label: '\u05E2\u05E8\u05DA' },
        { key: 'status', label: '\u05E1\u05D8\u05D8\u05D5\u05E1' },
        { key: 'path',   label: '\u05E0\u05EA\u05D9\u05D1 AF' },
        { key: 'webid',  label: 'WebId' }
    ];
    var STATUS_LABELS  = { good: '\u05EA\u05E7\u05D9\u05DF', stale: '\u05D9\u05E9\u05DF', bad: '\u05E9\u05D2\u05D9\u05D0\u05D4' };
    var STATUS_CLASSES = { good: 'mu20-tag-good', stale: 'mu20-tag-stale', bad: 'mu20-tag-bad' };
    var ATTR_KEYS   = ['hours', 'quota', 'pct'];
    var ATTR_LABELS = { hours: '\u05E9\u05E2\u05D5\u05EA', quota: '\u05DE\u05DB\u05E1\u05D4', pct: '% \u05E0\u05D9\u05E6\u05D5\u05DC' };

    /** Helper: create element with className */
    function _el(tag, cls, css) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (css) e.style.cssText = css;
        return e;
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
    // QA17-FIX3: Pin storage key
    var PINS_STORAGE_KEY = 'mu20_pinned_tags';

    function Mu20Tags(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._opts      = options || {};
        self._bus       = bus;
        self._registry  = [];
        self._destroyed = false;
        self._filterText = self._opts.filterText || '';
        self._sortCol    = self._opts.sortCol    || 'site';
        self._sortAsc    = self._opts.sortAsc !== undefined ? self._opts.sortAsc : true;
        self._staleSec   = self._opts.staleSec   || 300;
        self._demoMode   = !!self._opts.demoMode;
        self._api        = self._opts.api || null;
        self._showPinnedOnly = false;  // QA17-FIX3
        self._pinnedSet  = self._loadPins();  // QA17-FIX3
        self._tableEl = self._filterEl = self._countEl = self._previewEl = self._tbody = null;

        try { self._mount(); } catch (e) {
            MU.shield.log('tags', 'constructor', e);
            MU.shield.renderFallback(self._container, 'tags', e);
        }
    }

    // ═══════════════════════════════════════
    //  QA17-FIX3: Pin Persistence (storage)
    // ═══════════════════════════════════════

    Mu20Tags.prototype._pinKey = function (siteId, unitIdx, attr) {
        return siteId + ':' + unitIdx + ':' + attr;
    };

    Mu20Tags.prototype._isPinned = function (siteId, unitIdx, attr) {
        return !!this._pinnedSet[this._pinKey(siteId, unitIdx, attr)];
    };

    Mu20Tags.prototype._togglePin = function (tag) {
        var key = this._pinKey(tag.siteId, tag.unitIdx, tag.attrKey);
        if (this._pinnedSet[key]) {
            delete this._pinnedSet[key];
            tag.pinned = false;
        } else {
            this._pinnedSet[key] = true;
            tag.pinned = true;
        }
        this._savePins();
    };

    Mu20Tags.prototype._loadPins = function () {
        try {
            var raw = null;
            return raw ? JSON.parse(raw) : {};
        } catch (e) { return {}; }
    };

    Mu20Tags.prototype._savePins = function () {
        try {
            void 0;
        } catch (e) { /* quota/disabled */ }
    };

    // ═══════════════════════════════════════
    //  Mount DOM
    // ═══════════════════════════════════════

    Mu20Tags.prototype._mount = function () {
        var self = this;
        var c = self._container;
        c.classList.add('mu20-tags-root');

        // ── Controls bar ──
        var controls = _el('div', 'mu20-tags-controls');

        self._filterEl = _el('input', 'mu20-search-input');
        self._filterEl.type = 'text';
        self._filterEl.placeholder = '\u05D7\u05D9\u05E4\u05D5\u05E9 \u05EA\u05D2\u05D9\u05DD...';
        self._filterEl.setAttribute('dir', 'rtl');
        self._filterEl.style.width = '200px';
        self._filterEl.addEventListener('input', function () {
            self._filterText = this.value;
            self._renderTable();
        });
        controls.appendChild(self._filterEl);

        self._countEl = _el('span', 'mu20-tags-count');
        controls.appendChild(self._countEl);

        var exportBtn = _el('button', 'mu20-btn', 'margin-right:auto;');
        exportBtn.textContent = '\u05D9\u05E6\u05D0 CSV';
        exportBtn.addEventListener('click', function () { self._exportCsv(); });
        controls.appendChild(exportBtn);

        var validateBtn = _el('button', 'mu20-btn mu20-tags-validate', 'margin-right:8px;');
        validateBtn.textContent = '\u2714 \u05D0\u05DE\u05EA \u05EA\u05D2\u05D9\u05DD';
        validateBtn.addEventListener('click', function () { self._validateAllTags(); });
        controls.appendChild(validateBtn);

        // QA17-FIX3: Pin filter toggle
        self._pinBtn = _el('button', 'mu20-btn mu20-tags-pin-filter', 'margin-right:8px;');
        self._pinBtn.textContent = '\uD83D\uDCCC \u05DE\u05E7\u05D5\u05D1\u05E2\u05D9\u05DD';
        self._pinBtn.addEventListener('click', function () {
            self._showPinnedOnly = !self._showPinnedOnly;
            self._pinBtn.style.borderColor = self._showPinnedOnly ? '#58a6ff' : '';
            self._pinBtn.style.color = self._showPinnedOnly ? '#58a6ff' : '';
            self._renderTable();
        });
        controls.appendChild(self._pinBtn);

        c.appendChild(controls);

        // ── Table container ──
        self._tableEl = _el('div', 'mu20-tags-table-wrap', 'overflow:auto; flex:1;');
        c.appendChild(self._tableEl);

        // ── Live preview popup (hidden) ──
        self._previewEl = _el('div', 'mu20-tags-preview',
            'display:none; position:absolute; background:#0F2940; ' +
            'border:1px solid #5BC0EB; border-radius:6px; padding:10px; ' +
            'z-index:100; min-width:200px; box-shadow:0 4px 12px rgba(0,0,0,0.5);');
        self._previewEl.setAttribute('dir', 'rtl');

        self._previewEl.appendChild(_el('div', 'mu20-preview-title', 'font-weight:600; margin-bottom:4px;'));
        self._previewEl.appendChild(_el('div', 'mu20-preview-value', 'font-size:18px; font-variant-numeric:tabular-nums;'));
        self._previewEl.appendChild(_el('div', 'mu20-preview-ts', 'font-size:10px; color:#8899AA; margin-top:4px;'));
        self._previewEl.appendChild(_el('div', 'mu20-preview-quality', 'font-size:10px; margin-top:2px;'));
        c.appendChild(self._previewEl);

        // ── Bus subscriptions ──
        if (self._bus) {
            self._onDataUpdated = function (d) {
                if (self._destroyed) return;
                // Canonical payload normalization — rawSites or legacy sites
                var siteData = (d && d.rawSites) ? d.rawSites
                             : (d && d.sites)    ? d.sites
                             : null;
                if (siteData) {
                    self._opts.data = siteData;
                    self._buildRegistry();
                    self._renderTable();
                }
            };
            self._bus.on('data:updated', self._onDataUpdated, self);

            self._onDemoToggle = function (d) { self._demoMode = d.enabled; };
            self._bus.on('demo:toggle', self._onDemoToggle, self);

            self._onApiReady = function (api) { self._api = api; };
            self._bus.on('api:ready', self._onApiReady, self);
        }

        if (self._opts.api) self._api = self._opts.api;

        // ── Initial render ──
        if (self._demoMode) self._generateDemoTags();
        self._renderTable();
    };

    // ═══════════════════════════════════════
    //  Build registry from parsed data
    // ═══════════════════════════════════════

    Mu20Tags.prototype._buildRegistry = function () {
        var self = this;
        var sites = self._opts.sites || MU.SITES;
        var data  = self._opts.data;
        if (!data) return;

        var registry = [];
        var now      = new Date().getTime();
        var staleSec = self._staleSec;

        for (var s = 0; s < sites.length; s++) {
            var site     = sites[s];
            var siteData = data[site.id];
            if (!siteData) continue;

            for (var u = 0; u < site.units.length; u++) {
                var unitData = siteData[u];
                if (!unitData) continue;

                for (var a = 0; a < ATTR_KEYS.length; a++) {
                    var attr   = ATTR_KEYS[a];
                    var raw    = unitData[attr];

                    // QA17-FIX4: Unwrap safeVal objects from canonical payload.
                    // Canonical payload: { numeric, display, good, isDigitalState }
                    // Legacy/demo:       plain number
                    var val, isGood, ts;
                    if (raw && typeof raw === 'object' && raw.numeric !== undefined) {
                        val    = raw.numeric;
                        isGood = raw.good !== false;
                        ts     = unitData.ts || raw.ts || null;
                    } else {
                        val    = raw;
                        isGood = (val !== undefined && val !== null);
                        ts     = unitData.ts || null;
                    }

                    var tsMs   = ts ? new Date(ts).getTime() : 0;
                    var ageSec = tsMs ? (now - tsMs) / 1000 : Infinity;
                    var status = !isGood ? 'bad'
                        : (ageSec > staleSec ? 'stale' : 'good');

                    registry.push({
                        key: MU.unitKey(site.id, u) + '_' + attr,
                        siteId: site.id, siteName: site.name,
                        unitName: site.units[u], unitIdx: u,
                        attrName: ATTR_LABELS[attr] || attr, attrKey: attr,
                        afPath: site.id + '\\' + site.units[u] + '|' + attr,
                        status: status,
                        lastValue: (val !== undefined && val !== null) ? val : null,
                        lastUpdate: ts,
                        webId: '', apiStatus: '', apiValue: '',
                        pinned: self._isPinned(site.id, u, attr)  // QA17-FIX3
                    });
                }
            }
        }
        self._registry = registry;
    };

    // ── Generate demo tags ──
    Mu20Tags.prototype._generateDemoTags = function () {
        var sites    = this._opts.sites || MU.SITES;
        var demoData = MU.demo.generateSites(sites);
        this._opts.data = demoData;
        this._buildRegistry();
    };

    // ═══════════════════════════════════════
    //  Render table
    // ═══════════════════════════════════════

    Mu20Tags.prototype._renderTable = function () {
        var self      = this;
        var container = self._tableEl;
        if (!container) return;

        while (container.firstChild) container.removeChild(container.firstChild);

        var registry = self._registry || [];
        var filter   = (self._filterText || '').toLowerCase();

        // Filter
        var filtered = [];
        var showPinned = self._showPinnedOnly;  // QA17-FIX3
        for (var i = 0; i < registry.length; i++) {
            var tag = registry[i];
            // QA17-FIX3: Pin filter
            if (showPinned && !tag.pinned) continue;
            if (filter) {
                var hay = (tag.siteName + ' ' + tag.unitName + ' ' +
                    tag.attrName + ' ' + tag.afPath + ' ' + tag.status).toLowerCase();
                if (hay.indexOf(filter) < 0) continue;
            }
            filtered.push(tag);
        }

        // Sort — QA17-FIX3: pinned items float to top
        var sortCol = self._sortCol;
        var sortAsc = self._sortAsc;
        filtered.sort(function (a, b) {
            // Pinned items always first
            if (a.pinned && !b.pinned) return -1;
            if (!a.pinned && b.pinned) return 1;
            var va, vb;
            switch (sortCol) {
                case 'site':   va = a.siteName; vb = b.siteName; break;
                case 'unit':   va = a.unitName; vb = b.unitName; break;
                case 'attr':   va = a.attrName; vb = b.attrName; break;
                case 'value':  va = a.lastValue || 0; vb = b.lastValue || 0; break;
                case 'status': va = a.status; vb = b.status; break;
                case 'path':   va = a.afPath; vb = b.afPath; break;
                default:       va = a.siteName; vb = b.siteName;
            }
            if (typeof va === 'string') { var cmp = va.localeCompare(vb); return sortAsc ? cmp : -cmp; }
            return sortAsc ? (va - vb) : (vb - va);
        });

        // Count badge
        self._countEl.textContent = filtered.length + ' / ' + registry.length + ' \u05EA\u05D2\u05D9\u05DD';

        // Empty state
        if (!filtered.length) {
            var ph = _el('div', 'mu20-tags-placeholder');
            ph.setAttribute('dir', 'rtl');
            ph.textContent = '\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05EA\u05D2\u05D9\u05DD';
            container.appendChild(ph);
            return;
        }

        // Table
        var table = _el('table', 'mu20-log-table mu20-tags-table');

        // Header
        var thead     = document.createElement('thead');
        var headerRow = document.createElement('tr');

        // QA17-FIX3: Pin column header
        var thPin = document.createElement('th');
        thPin.textContent = '\uD83D\uDCCC';
        thPin.style.width = '30px';
        thPin.style.textAlign = 'center';
        headerRow.appendChild(thPin);

        for (var c = 0; c < COLUMNS.length; c++) {
            (function (col) {
                var th = document.createElement('th');
                th.style.cursor = 'pointer';
                th.textContent  = col.label + (self._sortCol === col.key ? (sortAsc ? ' \u25B2' : ' \u25BC') : '');
                th.addEventListener('click', function () {
                    if (self._sortCol === col.key) { self._sortAsc = !self._sortAsc; }
                    else { self._sortCol = col.key; self._sortAsc = true; }
                    self._renderTable();
                });
                headerRow.appendChild(th);
            })(COLUMNS[c]);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Body
        var tbody = document.createElement('tbody');
        self._tbody = tbody;

        for (var r = 0; r < filtered.length; r++) {
            var t  = filtered[r];
            var tr = document.createElement('tr');

            // QA17-FIX3: Pin toggle cell
            var tdPin = _el('td', '', 'text-align:center; cursor:pointer; font-size:14px;');
            tdPin.textContent = t.pinned ? '\uD83D\uDCCC' : '\u25CB';
            tdPin.title = t.pinned ? '\u05D1\u05D8\u05DC \u05E7\u05D9\u05D1\u05D5\u05E2' : '\u05E7\u05D1\u05E2 \u05EA\u05D2';
            (function (tag, pinCell) {
                pinCell.addEventListener('click', function (ev) {
                    ev.stopPropagation();
                    self._togglePin(tag);
                    pinCell.textContent = tag.pinned ? '\uD83D\uDCCC' : '\u25CB';
                    pinCell.title = tag.pinned ? '\u05D1\u05D8\u05DC \u05E7\u05D9\u05D1\u05D5\u05E2' : '\u05E7\u05D1\u05E2 \u05EA\u05D2';
                });
            })(t, tdPin);
            tr.appendChild(tdPin);

            var tdSite = document.createElement('td'); tdSite.textContent = t.siteName; tr.appendChild(tdSite);
            var tdUnit = document.createElement('td'); tdUnit.textContent = t.unitName; tr.appendChild(tdUnit);
            var tdAttr = document.createElement('td'); tdAttr.textContent = t.attrName; tr.appendChild(tdAttr);

            var tdVal = _el('td', '', 'font-variant-numeric:tabular-nums;');
            tdVal.textContent = t.lastValue !== null ? MU.formatNum(t.lastValue, 1) : '--';
            tr.appendChild(tdVal);

            var tdStatus = document.createElement('td');
            var badge = _el('span', 'mu20-tag-badge' + (STATUS_CLASSES[t.status] ? ' ' + STATUS_CLASSES[t.status] : ''));
            badge.textContent = STATUS_LABELS[t.status] || t.status;
            tdStatus.appendChild(badge);
            tr.appendChild(tdStatus);

            var tdPath = _el('td', 'mu20-tag-path'); tdPath.textContent = t.afPath; tr.appendChild(tdPath);

            var tdWid = _el('td', 'mu20-tag-webid', 'font-size:10px; color:#8899AA; max-width:80px; overflow:hidden;');
            tdWid.textContent = t.webId ? t.webId.substring(0, 12) + '...' : '\u2014';
            tdWid.title = t.webId || '';
            tr.appendChild(tdWid);

            // Row click: emit + highlight + live preview
            (function (tag, rowEl) {
                rowEl.addEventListener('click', function (ev) {
                    if (self._bus) {
                        self._bus.emit('tag:selected', { siteId: tag.siteId, unitIdx: tag.unitIdx, attr: tag.attrKey });
                    }
                    var rows = tbody.querySelectorAll('tr');
                    for (var k = 0; k < rows.length; k++) rows[k].classList.remove('mu20-tag-selected');
                    rowEl.classList.add('mu20-tag-selected');
                    if (self._api && tag.webId) self._showLivePreview(tag, ev);
                });
            })(t, tr);

            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        container.appendChild(table);
    };

    // ═══════════════════════════════════════
    //  API: Validate All Tags
    // ═══════════════════════════════════════

    Mu20Tags.prototype._validateAllTags = function () {
        var self = this;
        if (!self._api) {
            if (self._bus) self._bus.emit('log:entry', {
                level: 'warn', source: 'tags',
                msg: '\u05D0\u05D9\u05DF API \u05DC\u05D0\u05D9\u05DE\u05D5\u05EA \u05EA\u05D2\u05D9\u05DD',
                ts: new Date().toISOString()
            });
            return;
        }

        var registry = self._registry || [];
        if (!registry.length) return;

        var done = 0, valid = 0, invalid = 0;
        self._countEl.textContent = '\u05DE\u05D0\u05DE\u05EA...';

        // M-4 fix: done++ only in terminal branches to prevent race condition.
        // Previously done++ fired on resolveWebId completion but getStreamValue
        // was still pending, causing _onValidationDone to fire multiple times.
        for (var i = 0; i < registry.length; i++) {
            (function (tag) {
                var fullPath = tag.afPath;
                if (!fullPath || fullPath.indexOf('|') < 0) {
                    done++; tag.apiStatus = 'skip';
                    if (done === registry.length) self._onValidationDone(valid, invalid);
                    return;
                }

                MU.resolveAttributeWebId(fullPath, self._api, function (err, webId) {
                    if (err) {
                        invalid++; tag.apiStatus = 'invalid'; tag.webId = '';
                        done++;
                        if (done === registry.length) self._onValidationDone(valid, invalid);
                    } else {
                        valid++; tag.apiStatus = 'valid'; tag.webId = webId;
                        // Fetch current value — done++ deferred until getStreamValue completes
                        self._api.getStreamValue(webId, function (err2, data) {
                            if (!err2 && data) {
                                var sv = MU.AF.safeVal(data, 1);
                                tag.lastValue  = sv.numeric;
                                tag.apiValue   = sv.display;
                                tag.status     = sv.good
                                    ? (MU.AF.isStale(data, self._staleSec) ? 'stale' : 'good') : 'bad';
                                tag.lastUpdate = data.Timestamp || tag.lastUpdate;
                            }
                            done++;
                            if (done === registry.length) self._onValidationDone(valid, invalid);
                        });
                    }
                });
            })(registry[i]);
        }
    };

    Mu20Tags.prototype._onValidationDone = function (valid, invalid) {
        this._renderTable();
        this._countEl.textContent =
            this._registry.length + ' \u05EA\u05D2\u05D9\u05DD  |  ' +
            valid + ' \u2705  ' + invalid + ' \u274C';
    };

    // ═══════════════════════════════════════
    //  API: Live Value Preview
    // ═══════════════════════════════════════

    Mu20Tags.prototype._showLivePreview = function (tag, ev) {
        var self = this;
        if (!self._api || !tag.webId) { self._previewEl.style.display = 'none'; return; }

        var titleEl   = self._previewEl.querySelector('.mu20-preview-title');
        var valueEl   = self._previewEl.querySelector('.mu20-preview-value');
        var tsEl      = self._previewEl.querySelector('.mu20-preview-ts');
        var qualityEl = self._previewEl.querySelector('.mu20-preview-quality');

        titleEl.textContent   = tag.siteName + ' / ' + tag.unitName + ' / ' + tag.attrName;
        valueEl.textContent   = '\u05D8\u05D5\u05E2\u05DF...';
        valueEl.style.color   = '';
        tsEl.textContent      = '';
        qualityEl.textContent = '';

        // Position near click
        var rect = self._container.getBoundingClientRect();
        self._previewEl.style.display = 'block';
        self._previewEl.style.top     = (ev.clientY - rect.top + 10) + 'px';
        self._previewEl.style.right   = '10px';

        self._api.getStreamValue(tag.webId, function (err, data) {
            if (self._destroyed) return;
            if (err) { valueEl.textContent = '\u274C \u05E9\u05D2\u05D9\u05D0\u05D4'; return; }

            var sv = MU.AF.safeVal(data, 2);
            valueEl.textContent = sv.display;
            valueEl.style.color = sv.good ? '#2ECC71' : '#E74C3C';
            tsEl.textContent = data.Timestamp ? new Date(data.Timestamp).toLocaleString() : '';
            qualityEl.textContent = sv.good
                ? '\u2705 \u05EA\u05E7\u05D9\u05DF' : '\u274C \u05DC\u05D0 \u05EA\u05E7\u05D9\u05DF';

            // Auto-hide after 5s with fade
            setTimeout(function () {
                if (self._destroyed || !self._previewEl) return;
                self._previewEl.style.transition = 'opacity 200ms ease';
                self._previewEl.style.opacity = '0';
                setTimeout(function () {
                    if (self._destroyed || !self._previewEl) return;
                    self._previewEl.style.display    = 'none';
                    self._previewEl.style.opacity    = '1';
                    self._previewEl.style.transition = '';
                }, 200);
            }, 5000);
        });
    };

    // ═══════════════════════════════════════
    //  Export CSV
    // ═══════════════════════════════════════

    Mu20Tags.prototype._exportCsv = function () {
        var rows = [];
        var registry = this._registry || [];
        for (var i = 0; i < registry.length; i++) {
            var t = registry[i];
            rows.push({
                '\u05D0\u05EA\u05E8':             t.siteName,
                '\u05D9\u05D7\u05D9\u05D3\u05D4': t.unitName,
                '\u05DE\u05D0\u05E4\u05D9\u05D9\u05DF': t.attrName,
                '\u05E2\u05E8\u05DA':             t.lastValue !== null ? t.lastValue : '',
                '\u05E1\u05D8\u05D8\u05D5\u05E1': t.status,
                '\u05E0\u05EA\u05D9\u05D1 AF':    t.afPath,
                '\u05E2\u05D3\u05DB\u05D5\u05DF \u05D0\u05D7\u05E8\u05D5\u05DF': t.lastUpdate || ''
            });
        }
        MU.exportCsv(rows, 'mu20-tags-' + MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
    };

    // ═══════════════════════════════════════
    //  Plugin Contract
    // ═══════════════════════════════════════

    /** Called by orchestrator when new data arrives. */
    /**
     * @param {Object} payload - canonical { rawSites, renderState, siteDefs, ts }
     *                           OR legacy { sites: {...} }
     */
    Mu20Tags.prototype.update = function (payload) {
        if (this._destroyed) return;
        // Canonical payload normalization — tags needs rawSites
        var siteData = null;
        if (payload && payload.rawSites) {
            siteData = payload.rawSites;
        } else if (payload && payload.sites) {
            siteData = payload.sites;   // legacy
        }
        if (siteData) {
            this._opts.data = siteData;
            this._buildRegistry();
            this._renderTable();
        }
    };

    Mu20Tags.prototype.onResize = function () {
        // Table is flex-based — no manual resize needed
    };

    Mu20Tags.prototype.onTabActivated = function () {
        this._renderTable();
    };

    Mu20Tags.prototype.destroy = function () {
        this._destroyed = true;

        if (this._bus) {
            if (this._onDataUpdated) this._bus.off('data:updated', this._onDataUpdated);
            if (this._onDemoToggle)  this._bus.off('demo:toggle',  this._onDemoToggle);
            if (this._onApiReady)    this._bus.off('api:ready',    this._onApiReady);
        }

        this._api = this._registry = this._tableEl = null;
        this._filterEl = this._countEl = this._previewEl = this._tbody = this._bus = null;

        while (this._container.firstChild) this._container.removeChild(this._container.firstChild);
        this._container.classList.remove('mu20-tags-root');
    };

    // ── Export ──
    window.Mu20Tags = Mu20Tags;

})();
