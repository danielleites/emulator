/**
 * mm20-unitEvents.js — Unit Event Log (Event Frames from AF)
 * ═══════════════════════════════════════════════════════════
 * jQuery widget: mm20.mm20UnitEvents
 *
 * Displays Event Frames from PI AF for a selected production unit.
 * Synchronizes with bus events: unit:eventsRequested, time:rangeChanged,
 * site:selected, unit:selected.
 *
 * Uses MM.PIWebAPI.getEventFrames() (already in mm20-core.js).
 *
 * Version: 20.1.R1-QA15
 * ES5 only
 */
(function (root, $) {
    'use strict';

    if (!root.MM20 || !$.widget) return;

    var MM = root.MM20;

    $.widget('mm20.mm20UnitEvents', {

        // ── Options ──
        options: {
            bus:                null,
            api:                null,
            sites:              null,
            demoMode:           false,
            useDisplayTime:     true,
            showOnlyOpen:       false,
            defaultFilter:      'all',
            maxEvents:          200,
            unitEventBindings:  {}
        },

        // ── State ──
        _destroyed:         false,
        _fetchGen:          0,
        _currentSiteId:     '',
        _currentSiteName:   '',
        _currentUnitIdx:    null,
        _currentUnitName:   '',
        _currentWebId:      '',
        _currentPath:       '',
        _dateStart:         '',
        _dateEnd:           '',
        _filter:            'all',
        _events:            null,
        _loading:           false,

        // ── DOM refs ──
        _$header:       null,
        _$title:        null,
        _$subtitle:     null,
        _$toolbar:      null,
        _$filterSelect: null,
        _$refreshBtn:   null,
        _$body:         null,
        _$status:       null,
        _$tableWrap:    null,
        _$countBadge:   null,

        // ── Bus listener refs (for cleanup) ──
        _onEventsRequested: null,
        _onTimeRange:       null,
        _onSiteSelected:    null,
        _onUnitSelected:    null,

        // ═══════════════════════════════════
        //  _create
        // ═══════════════════════════════════
        _create: function () {
            var self = this;

            self._destroyed = false;
            self._events = [];
            self._filter = self.options.defaultFilter || 'all';

            self.element
                .empty()
                .addClass('mm20-events-root');

            self._buildLayout();
            self._bindBusListeners();
            self._renderAll();
        },

        // ═══════════════════════════════════
        //  Layout
        // ═══════════════════════════════════
        _buildLayout: function () {
            var self = this;

            // Header
            self._$header   = $('<div class="mm20-events-header"></div>');
            self._$title    = $('<div class="mm20-events-title"></div>').text('\u05D9\u05D5\u05DE\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD');
            self._$subtitle = $('<div class="mm20-events-subtitle"></div>').text('\u05D1\u05D7\u05E8 \u05D9\u05D7\u05D9\u05D3\u05D4 \u05DC\u05D4\u05E6\u05D2\u05EA \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD');
            self._$header.append(self._$title).append(self._$subtitle);

            // Toolbar
            self._$toolbar = $('<div class="mm20-events-toolbar"></div>');

            var $filterWrap  = $('<div class="mm20-events-filter-wrap"></div>');
            var $filterLabel = $('<label class="mm20-events-filter-label"></label>').text('\u05E1\u05D9\u05E0\u05D5\u05DF:');
            self._$filterSelect = $(
                '<select class="mm20-events-filter">' +
                    '<option value="all">\u05D4\u05DB\u05D5\u05DC</option>' +
                    '<option value="open">\u05E4\u05EA\u05D5\u05D7\u05D9\u05DD \u05D1\u05DC\u05D1\u05D3</option>' +
                    '<option value="closed">\u05E1\u05D2\u05D5\u05E8\u05D9\u05DD \u05D1\u05DC\u05D1\u05D3</option>' +
                '</select>'
            ).val(self._filter);
            $filterWrap.append($filterLabel).append(self._$filterSelect);

            self._$refreshBtn = $('<button type="button" class="mm20-events-btn mm20-events-btn--refresh"></button>')
                .text('\u05E8\u05E2\u05E0\u05DF');

            self._$countBadge = $('<span class="mm20-events-count"></span>');

            self._$toolbar
                .append($filterWrap)
                .append(self._$refreshBtn)
                .append(self._$countBadge);

            // Body
            self._$body      = $('<div class="mm20-events-body"></div>');
            self._$status    = $('<div class="mm20-events-status"></div>');
            self._$tableWrap = $('<div class="mm20-events-table-wrap"></div>');
            self._$body.append(self._$status).append(self._$tableWrap);

            // Assemble
            self.element
                .append(self._$header)
                .append(self._$toolbar)
                .append(self._$body);

            // Events
            self._$filterSelect.on('change.mm20events', function () {
                self._filter = this.value || 'all';
                self._renderAll();
                if (self.options.bus) {
                    self.options.bus.emit('events:filterChanged', {
                        filter: self._filter,
                        siteId: self._currentSiteId,
                        unitIdx: self._currentUnitIdx
                    });
                }
            });

            self._$refreshBtn.on('click.mm20events', function () {
                self._loadEvents();
            });
        },

        // ═══════════════════════════════════
        //  Bus listeners
        // ═══════════════════════════════════
        _bindBusListeners: function () {
            var self = this;
            var bus  = self.options.bus;
            if (!bus) return;

            // unit:eventsRequested — primary trigger from siteGrid button
            self._onEventsRequested = function (d) {
                if (!d || self._destroyed) return;
                self._currentSiteId   = d.siteId   || '';
                self._currentSiteName = d.siteName  || '';
                self._currentUnitIdx  = (d.unitIdx !== undefined && d.unitIdx !== null) ? d.unitIdx : null;
                self._currentUnitName = d.unitName  || '';
                self._currentWebId    = d.eventElementWebId  || '';
                self._currentPath     = d.eventElementPath   || '';
                self._resolveEventSource();
                self._loadEvents();
            };

            // time:rangeChanged — re-fetch when display time changes
            self._onTimeRange = function (range) {
                if (!self.options.useDisplayTime || !range || self._destroyed) return;
                self._dateStart = range.start || '';
                self._dateEnd   = range.end   || '';
                if (self._currentUnitIdx !== null) {
                    self._loadEvents();
                }
            };

            // site:selected — clear unit context
            self._onSiteSelected = function (d) {
                if (self._destroyed) return;
                if (d && d.siteId !== self._currentSiteId) {
                    self._currentSiteId   = d.siteId   || '';
                    self._currentSiteName = d.siteName  || '';
                    self._currentUnitIdx  = null;
                    self._currentUnitName = '';
                    self._currentWebId    = '';
                    self._currentPath     = '';
                    self._events = [];
                    self._renderAll();
                }
            };

            // unit:selected — can auto-load events if already on events tab
            self._onUnitSelected = function (d) {
                if (self._destroyed || !d) return;
                self._currentSiteId   = d.siteId   || self._currentSiteId;
                self._currentSiteName = d.siteName  || self._currentSiteName;
                self._currentUnitIdx  = d.unitIdx;
                self._currentUnitName = d.unitName  || '';
                self._currentWebId    = d.eventElementWebId || '';
                self._currentPath     = d.eventElementPath  || '';
                self._resolveEventSource();
                // Don't auto-load here — only load on explicit eventsRequested or tab focus
            };

            bus.on('unit:eventsRequested', self._onEventsRequested);
            bus.on('time:rangeChanged',    self._onTimeRange);
            bus.on('site:selected',        self._onSiteSelected);
            bus.on('unit:selected',        self._onUnitSelected);
        },

        // ═══════════════════════════════════
        //  Resolve event source
        // ═══════════════════════════════════
        _resolveEventSource: function () {
            var self     = this;
            var bindings = self.options.unitEventBindings || {};
            var siteMap, unitMap;

            // Already have WebId — nothing to resolve
            if (self._currentWebId) return;

            // Try UnitEventBindings config lookup
            siteMap = bindings[self._currentSiteId];
            if (!siteMap) return;

            unitMap = siteMap[String(self._currentUnitIdx)] || siteMap[self._currentUnitIdx] || null;
            if (unitMap) {
                self._currentWebId = unitMap.eventElementWebId || '';
                self._currentPath  = unitMap.eventElementPath  || '';
            }
        },

        // ═══════════════════════════════════
        //  Load events from PI Web API
        // ═══════════════════════════════════
        _loadEvents: function () {
            var self = this;
            var api  = self.options.api;
            var startIso, endIso, gen;

            if (self._destroyed) return;

            self._events = [];
            self._loading = true;
            self._renderStatus('\u05D8\u05D5\u05E2\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD...');

            // ── Guards ──
            if (self._currentUnitIdx === null || self._currentUnitIdx === undefined) {
                self._loading = false;
                self._renderEmptyState('\u05DC\u05D0 \u05E0\u05D1\u05D7\u05E8\u05D4 \u05D9\u05D7\u05D9\u05D3\u05D4.');
                return;
            }

            if (!api) {
                self._loading = false;
                self._renderErrorState('API \u05DC\u05D0 \u05D6\u05DE\u05D9\u05DF.');
                return;
            }

            // Resolve WebId from path if needed
            if (!self._currentWebId && self._currentPath) {
                self._resolvePathToWebId(function () {
                    if (!self._destroyed) self._loadEvents();
                });
                return;
            }

            if (!self._currentWebId) {
                self._loading = false;
                self._renderErrorState('\u05DC\u05D0 \u05D4\u05D5\u05D2\u05D3\u05E8 \u05DE\u05E7\u05D5\u05E8 \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05DC\u05D9\u05D7\u05D9\u05D3\u05D4.');
                return;
            }

            if (typeof api._detectBase === 'function') api._detectBase();
            if (!api._base) {
                self._loading = false;
                self._renderErrorState('PI Web API \u05DC\u05D0 \u05DE\u05D7\u05D5\u05D1\u05E8.');
                return;
            }

            if (typeof api.getEventFrames !== 'function') {
                self._loading = false;
                self._renderErrorState('API \u05DC\u05D0 \u05EA\u05D5\u05DE\u05DA \u05D1\u05E9\u05DC\u05D9\u05E4\u05EA Event Frames.');
                return;
            }

            // ── Date range ──
            startIso = self._dateStart || '*-30d';
            endIso   = self._dateEnd   || '*';

            // ── Fetch generation (discard stale responses) ──
            gen = ++self._fetchGen;

            // ── Demo mode ──
            if (self.options.demoMode) {
                self._events = self._generateDemoEvents();
                self._loading = false;
                self._renderAll();
                return;
            }

            api.getEventFrames(self._currentWebId, startIso, endIso, self.options.maxEvents, function (err, items) {
                if (self._destroyed) return;
                if (gen !== self._fetchGen) return;  // stale

                self._loading = false;

                if (err) {
                    self._renderErrorState('\u05E9\u05D2\u05D9\u05D0\u05D4 \u05D1\u05E9\u05DC\u05D9\u05E4\u05EA \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD: ' + (err.text || err.message || ''));
                    return;
                }

                self._events = self._parseItems(items || []);
                self._renderAll();
            });
        },

        // ═══════════════════════════════════
        //  Resolve AF path to WebId
        // ═══════════════════════════════════
        _resolvePathToWebId: function (cb) {
            var self = this;
            var api  = self.options.api;

            if (!api || typeof api.getByPath !== 'function') {
                cb && cb();
                return;
            }

            api.getByPath(self._currentPath, function (err, data) {
                if (self._destroyed) return;
                if (!err && data && data.WebId) {
                    self._currentWebId = data.WebId;
                }
                cb && cb();
            });
        },

        // ═══════════════════════════════════
        //  Parse API response
        // ═══════════════════════════════════
        _parseItems: function (items) {
            var out = [];
            var i, item, startDate, endDate, isOpen;

            for (i = 0; i < items.length; i++) {
                item      = items[i];
                startDate = item.StartTime ? new Date(item.StartTime) : null;
                endDate   = item.EndTime   ? new Date(item.EndTime)   : null;
                isOpen    = !item.EndTime || item.EndTime === '9999-12-31T23:59:59Z';

                out.push({
                    webId:        item.WebId       || '',
                    name:         item.Name        || '',
                    templateName: item.TemplateName || '',
                    categoryName: item.CategoryNames && item.CategoryNames.length ? item.CategoryNames[0] : '',
                    startTime:    item.StartTime    || '',
                    endTime:      item.EndTime      || '',
                    startDate:    startDate,
                    endDate:      endDate,
                    isOpen:       isOpen,
                    severity:     item.Severity     || '',
                    acknowledged: !!item.AcknowledgedBy,
                    path:         item.Path         || ''
                });
            }

            return out;
        },

        // ═══════════════════════════════════
        //  Demo mode data
        // ═══════════════════════════════════
        _generateDemoEvents: function () {
            var now   = new Date();
            var names = [
                '\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4 \u05DE\u05EA\u05D5\u05DB\u05E0\u05E0\u05EA',
                '\u05E2\u05E6\u05D9\u05E8\u05D4 \u05DC\u05D0 \u05DE\u05EA\u05D5\u05DB\u05E0\u05E0\u05EA',
                '\u05D4\u05D7\u05DC\u05E4\u05EA \u05E9\u05DE\u05DF',
                '\u05D1\u05D3\u05D9\u05E7\u05D4 \u05EA\u05E7\u05D5\u05E4\u05EA\u05D9\u05EA',
                '\u05D4\u05E4\u05E2\u05DC\u05D4 \u05D7\u05D5\u05D6\u05E8\u05EA',
                '\u05E2\u05E6\u05D9\u05E8\u05D4 \u05D7\u05D9\u05E8\u05D5\u05DD'
            ];
            var templates = ['\u05EA\u05D7\u05D6\u05D5\u05E7\u05D4', '\u05D0\u05D9\u05E8\u05D5\u05E2 \u05D4\u05E4\u05E2\u05DC\u05D4', '\u05D1\u05D3\u05D9\u05E7\u05D4'];
            var out = [];
            var i, hrs, start, end, isOpen;

            for (i = 0; i < 8; i++) {
                hrs    = Math.floor(Math.random() * 720) + 1;
                start  = new Date(now.getTime() - hrs * 3600000);
                isOpen = i < 2;
                end    = isOpen ? null : new Date(start.getTime() + (Math.floor(Math.random() * 48) + 1) * 3600000);

                out.push({
                    webId:        'DEMO-EF-' + i,
                    name:         names[i % names.length],
                    templateName: templates[i % templates.length],
                    categoryName: '',
                    startTime:    start.toISOString(),
                    endTime:      end ? end.toISOString() : '',
                    startDate:    start,
                    endDate:      end,
                    isOpen:       isOpen,
                    severity:     i < 1 ? 'High' : '',
                    acknowledged: i > 3,
                    path:         ''
                });
            }

            return out;
        },

        // ═══════════════════════════════════
        //  Filtering
        // ═══════════════════════════════════
        _getFilteredEvents: function () {
            var self = this;
            var rows = self._events || [];

            if (self.options.showOnlyOpen) {
                rows = rows.filter(function (r) { return r.isOpen; });
            } else if (self._filter === 'open') {
                rows = rows.filter(function (r) { return r.isOpen; });
            } else if (self._filter === 'closed') {
                rows = rows.filter(function (r) { return !r.isOpen; });
            }

            return rows;
        },

        // ═══════════════════════════════════
        //  Render
        // ═══════════════════════════════════
        _renderAll: function () {
            var self = this;
            var rows;

            if (self._destroyed) return;

            self._renderHeader();

            if (self._loading) {
                self._renderStatus('\u05D8\u05D5\u05E2\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD...');
                return;
            }

            if (!self._currentUnitName) {
                self._renderEmptyState('\u05D1\u05D7\u05E8 \u05D9\u05D7\u05D9\u05D3\u05D4 \u05DB\u05D3\u05D9 \u05DC\u05D4\u05E6\u05D9\u05D2 \u05D9\u05D5\u05DE\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD.');
                return;
            }

            rows = self._getFilteredEvents();

            if (!rows.length) {
                self._renderEmptyState('\u05DC\u05D0 \u05E0\u05DE\u05E6\u05D0\u05D5 \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05D1\u05D8\u05D5\u05D5\u05D7 \u05D4\u05D6\u05DE\u05DF \u05E9\u05E0\u05D1\u05D7\u05E8.');
                return;
            }

            self._$countBadge.text(rows.length + ' \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD');
            self._renderTable(rows);
        },

        _renderHeader: function () {
            var self = this;
            var rangeText = '';

            if (self._dateStart || self._dateEnd) {
                rangeText = ' | ' + (self._dateStart || '?') + ' \u2013 ' + (self._dateEnd || '?');
            }

            self._$title.text(
                '\u05D9\u05D5\u05DE\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD' +
                (self._currentUnitName ? ' \u2014 ' + self._currentUnitName : '')
            );
            self._$subtitle.text((self._currentSiteName || '') + rangeText);
        },

        _renderStatus: function (text) {
            var self = this;
            self._$status
                .empty()
                .removeClass('mm20-events-status--error mm20-events-status--empty')
                .text(text || '');
            self._$tableWrap.empty();
            self._$countBadge.text('');
        },

        _renderEmptyState: function (text) {
            var self = this;
            self._$status
                .empty()
                .removeClass('mm20-events-status--error')
                .addClass('mm20-events-status--empty')
                .text(text || '\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D4\u05E6\u05D2\u05D4.');
            self._$tableWrap.empty();
            self._$countBadge.text('');
        },

        _renderErrorState: function (text) {
            var self = this;
            self._$status
                .empty()
                .removeClass('mm20-events-status--empty')
                .addClass('mm20-events-status--error')
                .text(text || '\u05D0\u05D9\u05E8\u05E2\u05D4 \u05E9\u05D2\u05D9\u05D0\u05D4.');
            self._$tableWrap.empty();
            self._$countBadge.text('');
            self._loading = false;
        },

        // ═══════════════════════════════════
        //  Table
        // ═══════════════════════════════════
        _renderTable: function (rows) {
            var self   = this;
            var $table = $('<table class="mm20-events-table"></table>');
            var $thead = $('<thead></thead>');
            var $hRow  = $('<tr></tr>');
            var $tbody = $('<tbody></tbody>');
            var cols   = ['\u05D0\u05D9\u05E8\u05D5\u05E2', '\u05D4\u05EA\u05D7\u05DC\u05D4', '\u05E1\u05D9\u05D5\u05DD', '\u05DE\u05E9\u05DA', '\u05E1\u05D8\u05D8\u05D5\u05E1', '\u05EA\u05D1\u05E0\u05D9\u05EA', '\u05E4\u05E2\u05D5\u05DC\u05D5\u05EA'];
            var i;

            self._$status.empty().removeClass('mm20-events-status--error mm20-events-status--empty');

            for (i = 0; i < cols.length; i++) {
                $hRow.append($('<th></th>').text(cols[i]));
            }
            $thead.append($hRow);

            for (i = 0; i < rows.length; i++) {
                $tbody.append(self._renderRow(rows[i]));
            }

            $table.append($thead).append($tbody);
            self._$tableWrap.empty().append($table);
        },

        _renderRow: function (row) {
            var self = this;
            var $tr  = $('<tr></tr>');
            var $actions = $('<td class="mm20-events-actions"></td>');

            // Severity highlight
            if (row.severity === 'High' || row.severity === 'Critical') {
                $tr.addClass('mm20-events-row--high');
            }

            // Open event highlight
            if (row.isOpen) {
                $tr.addClass('mm20-events-row--open');
            }

            // Action: open trend for event timerange
            var $trendBtn = $('<button type="button" class="mm20-events-link-btn" title="Trend"></button>')
                .text('\u05D8\u05E8\u05E0\u05D3');
            $trendBtn.on('click.mm20events', function () {
                if (self.options.bus) {
                    self.options.bus.emit('events:openTrendRequested', {
                        eventName: row.name,
                        startTime: row.startTime,
                        endTime:   row.endTime || new Date().toISOString(),
                        siteId:    self._currentSiteId,
                        unitName:  self._currentUnitName
                    });
                }
            });

            // Action: open report for event
            var $reportBtn = $('<button type="button" class="mm20-events-link-btn" title="\u05D3\u05D5\u05D7"></button>')
                .text('\u05D3\u05D5\u05D7');
            $reportBtn.on('click.mm20events', function () {
                if (self.options.bus) {
                    self.options.bus.emit('events:openReportRequested', {
                        eventName: row.name,
                        startTime: row.startTime,
                        endTime:   row.endTime || new Date().toISOString(),
                        siteId:    self._currentSiteId,
                        unitName:  self._currentUnitName
                    });
                }
            });

            $actions.append($trendBtn).append($reportBtn);

            // Status badge
            var statusText = row.isOpen ? '\u05E4\u05EA\u05D5\u05D7' : '\u05E1\u05D2\u05D5\u05E8';
            var $statusBadge = $('<span class="mm20-events-badge"></span>')
                .addClass(row.isOpen ? 'mm20-events-badge--open' : 'mm20-events-badge--closed')
                .text(statusText);

            $tr
                .append($('<td></td>').text(row.name || ''))
                .append($('<td></td>').text(self._fmtDate(row.startDate)))
                .append($('<td></td>').text(row.isOpen ? '\u2014' : self._fmtDate(row.endDate)))
                .append($('<td></td>').text(self._fmtDuration(row.startDate, row.endDate)))
                .append($('<td></td>').append($statusBadge))
                .append($('<td></td>').text(row.templateName || row.categoryName || ''))
                .append($actions);

            return $tr;
        },

        // ═══════════════════════════════════
        //  Formatters
        // ═══════════════════════════════════
        _fmtDate: function (d) {
            if (!d || isNaN(d.getTime())) return '';
            var dd   = ('0' + d.getDate()).slice(-2);
            var mm   = ('0' + (d.getMonth() + 1)).slice(-2);
            var yyyy = d.getFullYear();
            var hh   = ('0' + d.getHours()).slice(-2);
            var mi   = ('0' + d.getMinutes()).slice(-2);
            return dd + '/' + mm + '/' + yyyy + ' ' + hh + ':' + mi;
        },

        _fmtDuration: function (start, end) {
            var now, diffMs, mins, hrs, days;
            if (!start || isNaN(start.getTime())) return '';
            now    = end && !isNaN(end.getTime()) ? end : new Date();
            diffMs = Math.max(0, now.getTime() - start.getTime());
            mins   = Math.floor(diffMs / 60000);
            hrs    = Math.floor(mins / 60);
            days   = Math.floor(hrs / 24);
            mins   = mins % 60;
            hrs    = hrs % 24;

            if (days > 0) return days + '\u05D9 ' + hrs + '\u05E9 ' + mins + '\u05D3';
            if (hrs > 0)  return hrs + '\u05E9 ' + mins + '\u05D3';
            return mins + '\u05D3';
        },

        // ═══════════════════════════════════
        //  Destroy
        // ═══════════════════════════════════
        _destroy: function () {
            var self = this;
            var bus  = self.options.bus;

            self._destroyed = true;

            // Unbind bus listeners
            if (bus) {
                if (self._onEventsRequested) bus.off('unit:eventsRequested', self._onEventsRequested);
                if (self._onTimeRange)       bus.off('time:rangeChanged',    self._onTimeRange);
                if (self._onSiteSelected)    bus.off('site:selected',        self._onSiteSelected);
                if (self._onUnitSelected)    bus.off('unit:selected',        self._onUnitSelected);
            }

            // Null listener refs
            self._onEventsRequested = null;
            self._onTimeRange       = null;
            self._onSiteSelected    = null;
            self._onUnitSelected    = null;

            // Unbind DOM events
            if (self._$filterSelect) self._$filterSelect.off('.mm20events');
            if (self._$refreshBtn)   self._$refreshBtn.off('.mm20events');

            // Null DOM refs
            self._$header       = null;
            self._$title        = null;
            self._$subtitle     = null;
            self._$toolbar      = null;
            self._$filterSelect = null;
            self._$refreshBtn   = null;
            self._$body         = null;
            self._$status       = null;
            self._$tableWrap    = null;
            self._$countBadge   = null;

            // Null data
            self._events = null;

            self.element
                .empty()
                .removeClass('mm20-events-root');
        }
    });

})(window, window.jQuery);
