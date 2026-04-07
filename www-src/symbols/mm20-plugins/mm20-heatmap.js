/**
 * ═══════════════════════════════════════════════════════
 *  mm20-heatmap.js  —  Heatmap Tab Widget
 * ═══════════════════════════════════════════════════════
 *  Monthly color-coded matrix (units × months),
 *  metric selector, color scale, tooltip.
 *
 *  jQuery widget: mm20.heatmap
 *  Version: 20.0.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-heatmap] MM20 core not loaded'); return; }

    $.widget('mm20.mm20Heatmap', {

        options: {
            bus:        null,
            sites:      null,
            data:       null,
            demoMode:   false,
            metric:     'hours',
            siteFilter: '',
            api:        null
        },

        _gridEl: null,
        _tooltipEl: null,
        _destroyed: false,
        _api: null,
        _monthlyCache: null,
        _dayHourCache: null,
        _cacheTimestamps: null,
        _onApiReady: null,

        // ═══════════════════════════════════════
        //  _create
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;
            self._monthlyCache = {};
            self._dayHourCache = {};
            self._cacheTimestamps = {};

            try {
                var el = self.element;
                el.addClass('mm20-heatmap-root');

                // ── Initialize API from options ──
                if (self.options.api) {
                    self._api = self.options.api;
                }

                // ── Listen for api:ready event on bus ──
                var bus = self.options.bus;
                if (bus) {
                    self._onApiReady = function (apiInstance) {
                        if (apiInstance && !self._api) {
                            self._api = apiInstance;
                        }
                    };
                    bus.on('api:ready', self._onApiReady);
                }

                // ── Controls ──
                var controls = $('<div class="mm20-hm-controls"></div>');

                controls.append($('<span>\u05DE\u05D3\u05D3:</span>'));
                self._metricSelect = $('<select class="mm20-hm-select"></select>');
                self._metricSelect.append('<option value="hours">\u05E9\u05E2\u05D5\u05EA</option>');
                self._metricSelect.append('<option value="quota">\u05DE\u05DB\u05E1\u05D4</option>');
                self._metricSelect.append('<option value="pct">% \u05E0\u05D9\u05E6\u05D5\u05DC</option>');
                self._metricSelect.val(self.options.metric);
                self._metricSelect.on('change', function () {
                    self.options.metric = this.value;
                    self._render();
                });
                controls.append(self._metricSelect);

                controls.append($('<span style="margin-right:16px;">\u05E1\u05D9\u05E0\u05D5\u05DF:</span>'));
                self._siteInput = $('<input class="mm20-search-input" type="text" style="width:120px;" placeholder="\u05D4\u05DB\u05DC" dir="rtl" />');
                self._siteInput.val(self.options.siteFilter);
                self._siteInput.on('input', function () {
                    self.options.siteFilter = this.value;
                    self._render();
                });
                controls.append(self._siteInput);

                el.append(controls);

                // ── Grid container ──
                self._gridEl = $('<div class="mm20-hm-scroll" style="overflow:auto; flex:1;"></div>');
                el.append(self._gridEl);

                // ── Color legend ──
                var legend = $('<div class="mm20-hm-legend"></div>');
                legend.append($('<span>\u05E0\u05DE\u05D5\u05DA</span>'));
                legend.append($('<div class="mm20-hm-legend-bar"></div>'));
                legend.append($('<span>\u05D2\u05D1\u05D5\u05D4</span>'));
                el.append(legend);

                // ── Tooltip (scoped to container, not body) ──
                self._tooltipEl = $('<div class="mm20-tooltip" style="display:none; position:absolute; z-index:200; background:#0F2940; border:1px solid #5BC0EB; border-radius:4px; padding:4px 8px; font-size:11px; color:#ECF0F1; pointer-events:none;"></div>');
                el.css('position', 'relative');  // ensure containing block
                el.append(self._tooltipEl);

                // ── Bus subscriptions (site:selected) ──
                if (bus && !self._onSiteSelected) {
                    self._onSiteSelected = function (d) {
                        self.options.siteFilter = d.siteId;
                        self._siteInput.val(d.siteId);
                        self._render();
                    };
                    bus.on('site:selected', self._onSiteSelected, self);
                }

                // ── Initial render ──
                self._render();

            } catch (e) {
                MM.shield.log('heatmap', '_create', e);
                MM.shield.renderFallback(self.element, 'heatmap', e);
            }
        },


        // ─────────────────────────────────────
        //  _fetchMonthlyData
        // ─────────────────────────────────────

        /**
         * Fetch 12 months of recorded data for a PI point.
         * Bins data by month and computes average per month.
         * Caches result with TTL of 1 hour.
         * @param {string} pctWebId - PI point WebId
         * @param {string} unitKey - Unit identifier for cache key
         * @param {function} callback - (err, monthlyData) where monthlyData is [12] array of month objects
         */
        _fetchMonthlyData: function (pctWebId, unitKey, callback) {
            var self = this;
            if (!self._api) {
                return callback(null, []);
            }

            var cacheKey = 'monthly_' + unitKey;
            var now = Date.now();
            var cacheEntry = self._cacheTimestamps[cacheKey];
            var ttl = 60 * 60 * 1000; // 1 hour

            // Check cache
            if (self._monthlyCache[unitKey] && cacheEntry && (now - cacheEntry) < ttl) {
                return callback(null, self._monthlyCache[unitKey]);
            }

            // Fetch recorded data: last 12 months, 365 points
            self._api.getRecorded(pctWebId, '*-12mo', '*', 365, function (err, records) {
                if (err) {
                    MM.shield.log('heatmap', '_fetchMonthlyData', 'API error: ' + err);
                    return callback(err, []);
                }

                // Bin by month
                var monthBins = {};
                for (var m = 0; m < 12; m++) {
                    monthBins[m] = { sum: 0, count: 0, avg: 0 };
                }

                if (records && records.length > 0) {
                    for (var i = 0; i < records.length; i++) {
                        var rec = records[i];
                        if (!rec.Timestamp) continue;

                        var date = new Date(rec.Timestamp);
                        var monthOfYear = date.getMonth(); // 0-11
                        var val = parseFloat(rec.Value);

                        if (!isNaN(val)) {
                            monthBins[monthOfYear].sum += val;
                            monthBins[monthOfYear].count += 1;
                        }
                    }
                }

                // Compute averages
                var monthlyData = [];
                for (var m = 0; m < 12; m++) {
                    var bin = monthBins[m];
                    if (bin.count > 0) {
                        bin.avg = bin.sum / bin.count;
                    }
                    monthlyData.push({
                        month: m,
                        value: bin.avg,
                        hours: bin.avg,
                        quota: bin.avg,
                        pct: bin.avg,
                        count: bin.count
                    });
                }

                // Cache result
                self._monthlyCache[unitKey] = monthlyData;
                self._cacheTimestamps[cacheKey] = now;

                callback(null, monthlyData);
            });
        },


        // ─────────────────────────────────────
        //  _fetchDayHourData
        // ─────────────────────────────────────

        /**
         * Fetch 4 weeks of recorded data for a PI point.
         * Aggregates by day-of-week (0-6) × hour (0-23).
         * Caches result with TTL of 1 hour.
         * @param {string} hoursWebId - PI point WebId
         * @param {string} unitKey - Unit identifier for cache key
         * @param {function} callback - (err, dayHourMatrix) where matrix is 7x24 grid
         */
        _fetchDayHourData: function (hoursWebId, unitKey, callback) {
            var self = this;
            if (!self._api) {
                return callback(null, null);
            }

            var cacheKey = 'dayHour_' + unitKey;
            var now = Date.now();
            var cacheEntry = self._cacheTimestamps[cacheKey];
            var ttl = 60 * 60 * 1000; // 1 hour

            // Check cache
            if (self._dayHourCache[unitKey] && cacheEntry && (now - cacheEntry) < ttl) {
                return callback(null, self._dayHourCache[unitKey]);
            }

            // Fetch recorded data: last 4 weeks, 672 points (4 * 7 * 24)
            self._api.getRecorded(hoursWebId, '*-4w', '*', 672, function (err, records) {
                if (err) {
                    MM.shield.log('heatmap', '_fetchDayHourData', 'API error: ' + err);
                    return callback(err, null);
                }

                // Initialize 7x24 grid with [dayOfWeek][hour] = { sum, count }
                var grid = [];
                for (var d = 0; d < 7; d++) {
                    grid[d] = [];
                    for (var h = 0; h < 24; h++) {
                        grid[d][h] = { sum: 0, count: 0, avg: 0 };
                    }
                }

                if (records && records.length > 0) {
                    for (var i = 0; i < records.length; i++) {
                        var rec = records[i];
                        if (!rec.Timestamp) continue;

                        var date = new Date(rec.Timestamp);
                        var dayOfWeek = date.getDay(); // 0-6 (Sun-Sat)
                        var hour = date.getHours(); // 0-23
                        var val = parseFloat(rec.Value);

                        if (!isNaN(val)) {
                            grid[dayOfWeek][hour].sum += val;
                            grid[dayOfWeek][hour].count += 1;
                        }
                    }
                }

                // Compute averages
                var dayHourMatrix = [];
                for (var d = 0; d < 7; d++) {
                    dayHourMatrix[d] = [];
                    for (var h = 0; h < 24; h++) {
                        var cell = grid[d][h];
                        if (cell.count > 0) {
                            cell.avg = cell.sum / cell.count;
                        }
                        dayHourMatrix[d][h] = {
                            day: d,
                            hour: h,
                            value: cell.avg,
                            count: cell.count
                        };
                    }
                }

                // Cache result
                self._dayHourCache[unitKey] = dayHourMatrix;
                self._cacheTimestamps[cacheKey] = now;

                callback(null, dayHourMatrix);
            });
        },


        // ─────────────────────────────────────
        //  Render heatmap grid
        // ─────────────────────────────────────

        _render: function () {
            var self = this;
            var gridEl = self._gridEl;
            gridEl.empty();

            var sites = self.options.sites || MM.SITES;
            var data = self.options.data;
            var metric = self.options.metric;
            var filter = (self.options.siteFilter || '').toLowerCase();

            // Generate demo data if needed
            if (!data && self.options.demoMode) {
                data = MM.demo.generateSites(sites);
            }
            if (!data) {
                gridEl.html('<div class="mm20-tags-placeholder">\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05DE\u05E4\u05EA \u05D7\u05D5\u05DD</div>');
                return;
            }

            // Build table
            var table = $('<table class="mm20-log-table" style="border-collapse:separate; border-spacing:2px;"></table>');

            // Header row: months
            var thead = $('<thead><tr><th style="min-width:100px;">\u05D9\u05D7\u05D9\u05D3\u05D4</th></tr></thead>');
            var headerRow = thead.find('tr');
            for (var m = 0; m < 12; m++) {
                headerRow.append($('<th style="width:30px; text-align:center; font-size:10px;"></th>').text(MM.MONTHS_HE[m]));
            }
            table.append(thead);

            // Body: one row per unit
            var tbody = $('<tbody></tbody>');
            var globalMax = self._getGlobalMax(sites, data, metric);

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                if (filter && site.id.toLowerCase().indexOf(filter) < 0 && site.name.toLowerCase().indexOf(filter) < 0) continue;

                var siteData = data[site.id];
                if (!siteData) continue;

                for (var u = 0; u < site.units.length; u++) {
                    var unitData = siteData[u];
                    if (!unitData) continue;

                    var tr = $('<tr></tr>');
                    tr.append($('<td style="font-size:11px; white-space:nowrap;"></td>').text(site.units[u]));

                    var monthly = unitData.monthly || [];
                    for (var mm = 0; mm < 12; mm++) {
                        var val = self._getMetricValue(monthly[mm], unitData, metric);
                        var color = self._valueToColor(val, globalMax);
                        var cell = $('<td class="mm20-hm-cell"></td>')
                            .css('background', color)
                            .attr('data-val', val)
                            .attr('data-unit', site.units[u])
                            .attr('data-month', MM.MONTHS_HE[mm]);

                        // Tooltip + click-through events
                        (function (v, uname, mname, sid, uidx) {
                            cell.on('mouseenter', function (e) {
                                var rect = self.element[0].getBoundingClientRect();
                                self._tooltipEl.text(uname + ' | ' + mname + ': ' + MM.formatNum(v, 0))
                                    .css({ left: (e.clientX - rect.left + 10) + 'px', top: (e.clientY - rect.top - 20) + 'px' })
                                    .show();
                            });
                            cell.on('mousemove', function (e) {
                                var rect = self.element[0].getBoundingClientRect();
                                self._tooltipEl.css({ left: (e.clientX - rect.left + 10) + 'px', top: (e.clientY - rect.top - 20) + 'px' });
                            });
                            cell.on('mouseleave', function () {
                                self._tooltipEl.hide();
                            });
                            // E2: Click-through — navigate to realtime tab and highlight unit
                            cell.on('click', function () {
                                var bus = self.options.bus;
                                if (bus) {
                                    bus.emit('unit:selected', { siteId: sid, unitIdx: uidx });
                                    bus.emit('tab:changed', { tab: 'realtime' });
                                }
                            });
                            cell.css('cursor', 'pointer');
                        })(val, site.units[u], MM.MONTHS_HE[mm], site.id, u);

                        tr.append(cell);
                    }
                    tbody.append(tr);
                }
            }

            table.append(tbody);
            gridEl.append(table);
        },


        // ─────────────────────────────────────
        //  D6: Metric value extraction
        // ─────────────────────────────────────

        /**
         * Extract the correct value based on selected metric.
         * Supports: hours, quota, pct (capacityPct), availability, efficiency.
         */
        _getMetricValue: function (monthEntry, unitData, metric) {
            if (!monthEntry && !unitData) return 0;
            // Monthly data entry (if available)
            if (monthEntry) {
                if (metric === 'hours' && monthEntry.hours !== undefined) return monthEntry.hours;
                if (metric === 'quota' && monthEntry.quota !== undefined) return monthEntry.quota;
                if (metric === 'pct' && monthEntry.pct !== undefined) return monthEntry.pct;
                if (monthEntry.value !== undefined) return monthEntry.value;
            }
            // Fallback to unit-level data for non-monthly metrics
            if (unitData) {
                if (metric === 'hours') return unitData.hours || 0;
                if (metric === 'quota') return unitData.quota || 0;
                if (metric === 'pct') return unitData.pct || 0;
            }
            return 0;
        },


        // ─────────────────────────────────────
        //  Color interpolation
        // ─────────────────────────────────────

        _getGlobalMax: function (sites, data, metric) {
            var self = this;
            var max = 1;
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
        },

        /**
         * Map value to color: green(low) → yellow(mid) → red(high).
         */
        _valueToColor: function (val, max) {
            if (max <= 0) return 'rgba(255,255,255,0.1)';
            var ratio = Math.min(val / max, 1);

            var r, g, b;
            if (ratio < 0.5) {
                // green → yellow
                var t = ratio * 2;
                r = Math.round(46 + (243 - 46) * t);
                g = Math.round(204 + (156 - 204) * t);
                b = Math.round(113 + (18 - 113) * t);
            } else {
                // yellow → red
                var t2 = (ratio - 0.5) * 2;
                r = Math.round(243 + (231 - 243) * t2);
                g = Math.round(156 + (76 - 156) * t2);
                b = Math.round(18 + (60 - 18) * t2);
            }
            return 'rgb(' + r + ',' + g + ',' + b + ')';
        },


        // ═══════════════════════════════════════
        //  _setOption
        // ═══════════════════════════════════════

        _setOption: function (key, value) {
            var self = this;
            self._super(key, value);

            if (key === 'api' && value) {
                self._api = value;
            }

            if (key === 'data' || key === 'metric' || key === 'siteFilter') {
                self._render();
            }
        },


        // ═══════════════════════════════════════
        //  _destroy
        // ═══════════════════════════════════════

        _destroy: function () {
            var self = this;
            self._destroyed = true;

            var bus = self.options.bus;
            if (bus) {
                if (self._onSiteSelected) {
                    bus.off('site:selected', self._onSiteSelected);
                }
                if (self._onApiReady) {
                    bus.off('api:ready', self._onApiReady);
                }
            }

            // Clear API reference and caches
            self._api = null;
            self._monthlyCache = null;
            self._dayHourCache = null;
            self._cacheTimestamps = null;
            self._onApiReady = null;
            self._onSiteSelected = null;

            if (self._tooltipEl) {
                self._tooltipEl.remove();
                self._tooltipEl = null;
            }

            self.element.empty().removeClass('mm20-heatmap-root');
        }
    });

})(window.jQuery);
