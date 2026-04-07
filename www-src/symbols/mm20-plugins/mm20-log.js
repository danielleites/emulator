/**
 * ═══════════════════════════════════════════════════════
 *  mm20-log.js  —  System Log Widget
 * ═══════════════════════════════════════════════════════
 *  Log table, level filter, CSV export, auto-scroll.
 *  Receives bus events + error shield entries.
 *
 *  jQuery widget: mm20.logViewer
 *  Version: 20.0.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-log] MM20 core not loaded'); return; }

    $.widget('mm20.mm20LogViewer', {

        options: {
            bus:        null,
            maxEntries: 500
        },

        _entries: null,
        _filter: 'all',    // 'all' | 'warn' | 'error'
        _channelFilter: 'all',  // D7: bus channel filter
        _destroyed: false,

        // ═══════════════════════════════════════
        //  _create
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;
            self._entries = [];

            try {
                var el = self.element;
                el.addClass('mm20-log-root');

                // ── Toolbar ──
                var toolbar = $('<div class="mm20-toolbar"></div>');
                toolbar.append($('<span style="font-weight:600;">\u05DC\u05D5\u05D2 \u05DE\u05E2\u05E8\u05DB\u05EA</span>'));

                // Filter buttons
                var filters = [
                    { key: 'all',   label: '\u05D4\u05DB\u05DC' },
                    { key: 'warn',  label: '\u05D0\u05D6\u05D4\u05E8\u05D5\u05EA+' },
                    { key: 'error', label: '\u05E9\u05D2\u05D9\u05D0\u05D5\u05EA' }
                ];
                self._filterBtns = {};
                for (var i = 0; i < filters.length; i++) {
                    (function (f) {
                        var btn = $('<button class="mm20-sort-btn"></button>').text(f.label);
                        if (self._filter === f.key) btn.addClass('mm20-sort-btn--active');
                        btn.on('click', function () {
                            self._filter = f.key;
                            self._updateFilterBtns();
                            self._renderAll();
                        });
                        self._filterBtns[f.key] = btn;
                        toolbar.append(btn);
                    })(filters[i]);
                }

                // D7: Channel filter dropdown
                self._channelSelect = $('<select class="mm20-hm-select" style="margin-right:8px; font-size:10px;"></select>');
                var channels = [
                    { id: 'all',            label: '\u05DB\u05DC \u05D4\u05E2\u05E8\u05D5\u05E6\u05D9\u05DD' },
                    { id: 'orchestrator',   label: 'orchestrator' },
                    { id: 'alerts',         label: 'alerts' },
                    { id: 'siteGrid',       label: 'siteGrid' },
                    { id: 'heatmap',        label: 'heatmap' },
                    { id: 'reports',        label: 'reports' },
                    { id: 'tags',           label: 'tags' },
                    { id: 'afbuild',        label: 'afbuild' }
                ];
                for (var ch = 0; ch < channels.length; ch++) {
                    self._channelSelect.append($('<option></option>').val(channels[ch].id).text(channels[ch].label));
                }
                self._channelSelect.on('change', function () {
                    self._channelFilter = this.value;
                    self._renderAll();
                });
                toolbar.append(self._channelSelect);

                // CSV export button
                var csvBtn = $('<button class="mm20-sort-btn">\u05D9\u05E6\u05D5\u05D0 CSV</button>');
                csvBtn.on('click', function () { self._exportCsv(); });
                toolbar.append(csvBtn);

                // Clear button
                var clearBtn = $('<button class="mm20-sort-btn">\u05E0\u05E7\u05D4</button>');
                clearBtn.on('click', function () { self._clear(); });
                toolbar.append(clearBtn);

                // Count badge
                self._countBadge = $('<span class="mm20-version-badge" style="margin-right:8px;">0</span>');
                toolbar.append(self._countBadge);

                el.append(toolbar);

                // ── Log table ──
                var tableWrap = $('<div style="flex:1;overflow:auto;"></div>');
                self._table = $('<table class="mm20-log-table"><thead><tr>' +
                    '<th>\u05E9\u05E2\u05D4</th>' +
                    '<th>\u05E8\u05DE\u05D4</th>' +
                    '<th>\u05DE\u05E7\u05D5\u05E8</th>' +
                    '<th>\u05D4\u05D5\u05D3\u05E2\u05D4</th>' +
                    '</tr></thead><tbody></tbody></table>');
                self._tbody = self._table.find('tbody');
                tableWrap.append(self._table);
                el.append(tableWrap);
                self._tableWrap = tableWrap;

                // ── Bus subscription ──
                var bus = self.options.bus;
                if (bus) {
                    self._onLogEntry = function (entry) {
                        self._addEntry(entry);
                    };
                    bus.on('log:entry', self._onLogEntry, self);
                }

            } catch (e) {
                MM.shield.log('logViewer', '_create', e);
                MM.shield.renderFallback(self.element, 'logViewer', e);
            }
        },


        // ─────────────────────────────────────
        //  Add a log entry
        // ─────────────────────────────────────

        _addEntry: function (entry) {
            if (this._destroyed) return;

            this._entries.push(entry);
            if (this._entries.length > this.options.maxEntries) {
                this._entries.shift();
            }

            // If entry passes filter, render it
            if (this._passesFilter(entry)) {
                this._renderRow(entry);
            }

            this._countBadge.text(this._entries.length);
        },

        _passesFilter: function (entry) {
            // Level filter
            if (this._filter === 'warn' && entry.level !== 'warn' && entry.level !== 'error') return false;
            if (this._filter === 'error' && entry.level !== 'error') return false;
            // D7: Channel filter
            if (this._channelFilter && this._channelFilter !== 'all') {
                var src = (entry.source || '').toLowerCase();
                if (src.indexOf(this._channelFilter.toLowerCase()) < 0) return false;
            }
            return true;
        },

        _renderRow: function (entry) {
            var levelClass = 'mm20-log-level--' + (entry.level || 'info');
            var row = $('<tr></tr>');
            row.append($('<td></td>').text(MM.formatDate(entry.ts, 'time')).css('white-space', 'nowrap'));
            row.append($('<td class="' + levelClass + '"></td>').text(entry.level || 'info'));
            row.append($('<td></td>').text(entry.source || ''));
            row.append($('<td></td>').text(entry.msg || ''));
            this._tbody.append(row);

            // Auto-scroll to bottom
            var wrap = this._tableWrap[0];
            if (wrap) wrap.scrollTop = wrap.scrollHeight;
        },


        // ─────────────────────────────────────
        //  Render all (after filter change)
        // ─────────────────────────────────────

        _renderAll: function () {
            this._tbody.empty();
            for (var i = 0; i < this._entries.length; i++) {
                if (this._passesFilter(this._entries[i])) {
                    this._renderRow(this._entries[i]);
                }
            }
        },

        _updateFilterBtns: function () {
            for (var key in this._filterBtns) {
                if (this._filterBtns.hasOwnProperty(key)) {
                    this._filterBtns[key].toggleClass('mm20-sort-btn--active', key === this._filter);
                }
            }
        },


        // ─────────────────────────────────────
        //  Export CSV
        // ─────────────────────────────────────

        _exportCsv: function () {
            var rows = [];
            for (var i = 0; i < this._entries.length; i++) {
                var e = this._entries[i];
                rows.push({
                    '\u05E9\u05E2\u05D4': MM.formatDate(e.ts, 'time'),
                    '\u05E8\u05DE\u05D4': e.level || 'info',
                    '\u05DE\u05E7\u05D5\u05E8': e.source || '',
                    '\u05D4\u05D5\u05D3\u05E2\u05D4': e.msg || ''
                });
            }
            MM.exportCsv(rows, 'mm20-log-' + MM.formatDate(new Date(), 'date').replace(/\//g, '-') + '.csv');
        },


        // ─────────────────────────────────────
        //  Clear log
        // ─────────────────────────────────────

        _clear: function () {
            this._entries = [];
            this._tbody.empty();
            this._countBadge.text('0');
        },


        // ═══════════════════════════════════════
        //  _destroy
        // ═══════════════════════════════════════

        _destroy: function () {
            this._destroyed = true;

            var bus = this.options.bus;
            if (bus && this._onLogEntry) {
                bus.off('log:entry', this._onLogEntry);
            }

            this._entries = null;
            this.element.empty().removeClass('mm20-log-root');
        }
    });

})(window.jQuery);
