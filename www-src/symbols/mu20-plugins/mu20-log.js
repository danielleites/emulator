/**
 * ═══════════════════════════════════════════════════════
 *  mu20-log.js  —  Log Viewer Plugin (MU20)
 * ═══════════════════════════════════════════════════════
 *  Displays a scrollable log table with level/channel
 *  filtering, CSV export, and auto-scroll.
 *
 *  Ported from mm20-log.js (jQuery → vanilla ES5).
 *  Version: ULT.1.4  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-log] MU20 core not loaded'); return; }

    // ── Constants ──
    var MAX_ENTRIES = 500;
    var LEVEL_CLASSES = {
        info:  'mu20-log-info',
        warn:  'mu20-log-warn',
        error: 'mu20-log-error'
    };

    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════

    /**
     * @param {ShadowRoot} shadowRoot
     * @param {HTMLElement} containerEl
     * @param {Object} options
     * @param {Object} bus
     */
    function Mu20Log(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow     = shadowRoot;
        self._container  = containerEl;
        self._opts       = options || {};
        self._bus        = bus;
        self._entries    = [];
        self._destroyed  = false;
        self._filterLevel   = 'all';       // all | warn | error
        self._filterChannel = '';          // '' = all channels
        self._autoScroll    = true;

        // DOM references
        self._tableBody  = null;
        self._countEl    = null;
        self._scrollWrap = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('log', 'constructor', e);
            MU.shield.renderFallback(self._container, 'log', e);
        }
    }


    // ═══════════════════════════════════════
    //  Mount DOM
    // ═══════════════════════════════════════

    Mu20Log.prototype._mount = function () {
        var self = this;
        var c = self._container;
        c.classList.add('mu20-log-root');
        c.setAttribute('dir', 'rtl');

        // ── Controls bar ──
        var controls = document.createElement('div');
        controls.className = 'mu20-log-controls';

        // Level filter buttons
        var levels = [
            { key: 'all',   label: '\u05D4\u05DB\u05DC' },
            { key: 'warn',  label: '\u05D0\u05D6\u05D4\u05E8\u05D5\u05EA' },
            { key: 'error', label: '\u05E9\u05D2\u05D9\u05D0\u05D5\u05EA' }
        ];
        self._levelBtns = {};

        for (var i = 0; i < levels.length; i++) {
            (function (lvl) {
                var btn = document.createElement('button');
                btn.className = 'mu20-btn mu20-log-level-btn';
                btn.textContent = lvl.label;
                if (lvl.key === self._filterLevel) btn.classList.add('mu20-btn--active');
                btn.addEventListener('click', function () {
                    self._filterLevel = lvl.key;
                    self._updateLevelBtns();
                    self._renderTable();
                });
                self._levelBtns[lvl.key] = btn;
                controls.appendChild(btn);
            })(levels[i]);
        }

        // Channel filter dropdown
        var channelSel = document.createElement('select');
        channelSel.className = 'mu20-log-channel-select';
        var defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = '\u05DB\u05DC \u05D4\u05DE\u05E7\u05D5\u05E8\u05D5\u05EA';
        channelSel.appendChild(defaultOpt);
        channelSel.addEventListener('change', function () {
            self._filterChannel = this.value;
            self._renderTable();
        });
        self._channelSel = channelSel;
        controls.appendChild(channelSel);

        // Count badge
        self._countEl = document.createElement('span');
        self._countEl.className = 'mu20-log-count';
        self._countEl.textContent = '0';
        controls.appendChild(self._countEl);

        // Spacer
        var spacer = document.createElement('span');
        spacer.style.flex = '1';
        controls.appendChild(spacer);

        // Clear button
        var clearBtn = document.createElement('button');
        clearBtn.className = 'mu20-btn';
        clearBtn.textContent = '\u05E0\u05E7\u05D4';
        clearBtn.addEventListener('click', function () {
            self._entries = [];
            self._renderTable();
        });
        controls.appendChild(clearBtn);

        // CSV export button
        var csvBtn = document.createElement('button');
        csvBtn.className = 'mu20-btn';
        csvBtn.textContent = '\u05D9\u05E6\u05D0 CSV';
        csvBtn.style.marginRight = '6px';
        csvBtn.addEventListener('click', function () { self._exportCsv(); });
        controls.appendChild(csvBtn);

        c.appendChild(controls);

        // ── Table ──
        self._scrollWrap = document.createElement('div');
        self._scrollWrap.className = 'mu20-log-scroll';
        self._scrollWrap.style.cssText = 'overflow:auto; flex:1;';

        var table = document.createElement('table');
        table.className = 'mu20-table mu20-log-table';

        // Header
        var thead = document.createElement('thead');
        var headerRow = document.createElement('tr');
        var cols = ['\u05E9\u05E2\u05D4', '\u05E8\u05DE\u05D4', '\u05DE\u05E7\u05D5\u05E8', '\u05D4\u05D5\u05D3\u05E2\u05D4'];
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
            self._onLogEntry = function (entry) {
                if (self._destroyed) return;
                self._addEntry(entry);
            };
            self._bus.on('log:entry', self._onLogEntry, self);
        }
    };


    // ═══════════════════════════════════════
    //  Add entry
    // ═══════════════════════════════════════

    Mu20Log.prototype._addEntry = function (entry) {
        var self = this;
        if (!entry) return;

        var e = {
            ts:      entry.ts || new Date().toISOString(),
            level:   entry.level || 'info',
            source:  entry.source || '',
            msg:     entry.msg || entry.message || ''
        };

        self._entries.push(e);

        // Trim if over limit
        var maxEntries = self._opts.maxLogEntries || MAX_ENTRIES;
        if (self._entries.length > maxEntries) {
            self._entries = self._entries.slice(self._entries.length - maxEntries);
        }

        // Update channel dropdown if new source
        self._ensureChannel(e.source);

        // Check if visible with current filter
        if (self._passesFilter(e)) {
            self._appendRow(e);
        }

        // Update count
        self._countEl.textContent = String(self._entries.length);

        // Auto-scroll
        if (self._autoScroll && self._scrollWrap) {
            self._scrollWrap.scrollTop = self._scrollWrap.scrollHeight;
        }
    };


    // ═══════════════════════════════════════
    //  Filter helpers
    // ═══════════════════════════════════════

    Mu20Log.prototype._passesFilter = function (e) {
        // Level filter
        if (this._filterLevel === 'warn' && e.level === 'info') return false;
        if (this._filterLevel === 'error' && e.level !== 'error') return false;

        // Channel filter
        if (this._filterChannel && e.source !== this._filterChannel) return false;

        return true;
    };

    Mu20Log.prototype._ensureChannel = function (source) {
        if (!source || !this._channelSel) return;
        // Check if option already exists
        var opts = this._channelSel.options;
        for (var i = 0; i < opts.length; i++) {
            if (opts[i].value === source) return;
        }
        var opt = document.createElement('option');
        opt.value = source;
        opt.textContent = source;
        this._channelSel.appendChild(opt);
    };

    Mu20Log.prototype._updateLevelBtns = function () {
        var keys = ['all', 'warn', 'error'];
        for (var i = 0; i < keys.length; i++) {
            var btn = this._levelBtns[keys[i]];
            if (btn) {
                if (keys[i] === this._filterLevel) {
                    btn.classList.add('mu20-btn--active');
                } else {
                    btn.classList.remove('mu20-btn--active');
                }
            }
        }
    };


    // ═══════════════════════════════════════
    //  Render table (full re-render)
    // ═══════════════════════════════════════

    Mu20Log.prototype._renderTable = function () {
        var self = this;
        var tbody = self._tableBody;
        if (!tbody) return;

        // Clear
        while (tbody.firstChild) tbody.removeChild(tbody.firstChild);

        var filtered = [];
        for (var i = 0; i < self._entries.length; i++) {
            if (self._passesFilter(self._entries[i])) {
                filtered.push(self._entries[i]);
            }
        }

        for (var j = 0; j < filtered.length; j++) {
            self._appendRow(filtered[j]);
        }

        self._countEl.textContent = String(self._entries.length);
    };


    // ═══════════════════════════════════════
    //  Append single row
    // ═══════════════════════════════════════

    Mu20Log.prototype._appendRow = function (entry) {
        var tbody = this._tableBody;
        if (!tbody) return;

        var tr = document.createElement('tr');
        var levelCls = LEVEL_CLASSES[entry.level] || '';
        if (levelCls) tr.classList.add(levelCls);

        // Time
        var tdTime = document.createElement('td');
        tdTime.className = 'mu20-log-ts';
        var d = new Date(entry.ts);
        tdTime.textContent = ('0' + d.getHours()).slice(-2) + ':' +
                             ('0' + d.getMinutes()).slice(-2) + ':' +
                             ('0' + d.getSeconds()).slice(-2);
        tr.appendChild(tdTime);

        // Level
        var tdLevel = document.createElement('td');
        tdLevel.className = 'mu20-log-level';
        var levelLabels = { info: 'INFO', warn: 'WARN', error: 'ERROR' };
        tdLevel.textContent = levelLabels[entry.level] || entry.level;
        tr.appendChild(tdLevel);

        // Source
        var tdSource = document.createElement('td');
        tdSource.className = 'mu20-log-source';
        tdSource.textContent = entry.source || '';
        tr.appendChild(tdSource);

        // Message
        var tdMsg = document.createElement('td');
        tdMsg.className = 'mu20-log-msg';
        tdMsg.textContent = entry.msg || '';
        tr.appendChild(tdMsg);

        tbody.appendChild(tr);
    };


    // ═══════════════════════════════════════
    //  Export CSV
    // ═══════════════════════════════════════

    Mu20Log.prototype._exportCsv = function () {
        var rows = [];
        for (var i = 0; i < this._entries.length; i++) {
            var e = this._entries[i];
            rows.push({
                '\u05E9\u05E2\u05D4': e.ts,
                '\u05E8\u05DE\u05D4': e.level,
                '\u05DE\u05E7\u05D5\u05E8': e.source,
                '\u05D4\u05D5\u05D3\u05E2\u05D4': e.msg
            });
        }
        MU.exportCsv(rows, 'mu20-log-' + MU.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
    };


    // ═══════════════════════════════════════
    //  Plugin Contract: update / onResize / onTabActivated / destroy
    // ═══════════════════════════════════════

    Mu20Log.prototype.update = function () {
        // Log entries arrive via bus, not data pipeline — no-op here
    };

    Mu20Log.prototype.onResize = function () {
        // No canvas to resize
    };

    Mu20Log.prototype.onTabActivated = function () {
        // Auto-scroll to bottom on tab switch
        if (this._autoScroll && this._scrollWrap) {
            this._scrollWrap.scrollTop = this._scrollWrap.scrollHeight;
        }
    };

    Mu20Log.prototype.destroy = function () {
        this._destroyed = true;

        if (this._bus) {
            if (this._onLogEntry) this._bus.off('log:entry', this._onLogEntry);
        }

        this._entries = null;
        this._tableBody = null;
        this._scrollWrap = null;
        this._channelSel = null;
        this._countEl = null;
        this._levelBtns = null;
        this._bus = null;

        while (this._container.firstChild) {
            this._container.removeChild(this._container.firstChild);
        }
    };


    // ── Export ──
    window.Mu20Log = Mu20Log;

})();
