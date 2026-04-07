/**
 * ================================================================
 *  mu20-event-frames.js  --  Event Frames Plugin (MU20)
 * ================================================================
 *  Displays event frames in two views:
 *    - Timeline: horizontal bars grouped by unit
 *    - Table: sortable table with start/end/duration
 *
 *  Bus events consumed:
 *    eventframes:updated  { frames: [], stats: {} }
 *
 *  Features:
 *    - Toggle between timeline and table views
 *    - Active (open) event frames pulsing highlight
 *    - RTL Hebrew UI
 *    - Duration formatting
 *    - Grouped timeline by unit
 *
 *  Version: ULT.1.0  |  ES5 only
 * ================================================================
 */
(function () {
    'use strict';

    var VIEW_TIMELINE = 'timeline';
    var VIEW_TABLE = 'table';

    function Mu20EventFrames(container, bus, options) {
        this._container = container;
        this._bus = bus;
        this._options = options || {};
        this._view = VIEW_TIMELINE;
        this._frames = [];
        this._stats = {};
        this._filterSiteId = null;
        this._filterUnitIdx = null;
        this._rendered = false;

        // Unit event filter listener (QA15)
        var self = this;
        this._onEfFilterUnit = function (info) {
            self._filterSiteId = info.siteId;
            self._filterUnitIdx = info.unitIdx;
            if (self._rendered) self._applyFilter();
        };
        if (this._bus) {
            this._bus.on('eventframes:filterUnit', this._onEfFilterUnit);
        }

        this._init();
    }

    Mu20EventFrames.prototype._init = function () {
        var root = document.createElement('div');
        root.className = 'mu20-ef-root';
        root.dir = 'rtl';

        // Toggle bar
        var toggleBar = document.createElement('div');
        toggleBar.className = 'mu20-ef-toggle-bar';

        var btnTimeline = document.createElement('button');
        btnTimeline.className = 'mu20-chip mu20-chip--active';
        btnTimeline.textContent = '\u05E6\u05D9\u05E8 \u05D6\u05DE\u05DF';
        btnTimeline.setAttribute('data-view', VIEW_TIMELINE);

        var btnTable = document.createElement('button');
        btnTable.className = 'mu20-chip';
        btnTable.textContent = '\u05D8\u05D1\u05DC\u05D4';
        btnTable.setAttribute('data-view', VIEW_TABLE);

        var self = this;
        var _onToggle = function (e) {
            var btn = e.target;
            while (btn && !btn.getAttribute('data-view')) btn = btn.parentElement;
            if (!btn) return;
            self._view = btn.getAttribute('data-view');
            var chips = toggleBar.querySelectorAll('.mu20-chip');
            for (var i = 0; i < chips.length; i++) {
                if (chips[i] === btn) chips[i].classList.add('mu20-chip--active');
                else chips[i].classList.remove('mu20-chip--active');
            }
            self._render();
        };
        this._onToggle = _onToggle;
        toggleBar.addEventListener('click', _onToggle);

        toggleBar.appendChild(btnTimeline);
        toggleBar.appendChild(btnTable);

        this._content = document.createElement('div');
        this._content.className = 'mu20-ef-content';
        this._toggleBar = toggleBar;

        root.appendChild(toggleBar);
        root.appendChild(this._content);
        this._container.appendChild(root);
        this._root = root;

        // Listen for event frame data
        var onEfUpdate = function (data) {
            self._frames = data.frames || [];
            self._stats = data.stats || {};
            self._render();
        };
        this._onEfUpdate = onEfUpdate;
        this._bus.on('eventframes:updated', onEfUpdate);
    };

    Mu20EventFrames.prototype._render = function () {
        if (this._view === VIEW_TABLE) {
            this._renderTable();
        } else {
            this._renderTimeline();
        }
        this._rendered = true;
    };

    Mu20EventFrames.prototype._renderTimeline = function () {
        var c = this._content;
        while (c.firstChild) c.removeChild(c.firstChild);

        if (!this._frames.length) {
            var empty = document.createElement('div');
            empty.className = 'mu20-ef-empty';
            empty.textContent = '\u05D0\u05D9\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05D1\u05D8\u05D5\u05D5\u05D7';
            c.appendChild(empty);
            return;
        }

        // Group by unit
        var byUnit = {};
        var i, f, key;
        for (i = 0; i < this._frames.length; i++) {
            f = this._frames[i];
            key = f.unitName || f.unitKey;
            if (!byUnit[key]) byUnit[key] = [];
            byUnit[key].push(f);
        }

        var now = Date.now();
        var daysBack = (this._options.EventFrameDays || 30) * 86400000;
        var earliest = now - daysBack;
        var range = now - earliest;

        for (var unit in byUnit) {
            if (!byUnit.hasOwnProperty(unit)) continue;
            var row = document.createElement('div');
            row.className = 'mu20-ef-timeline-row';

            var label = document.createElement('div');
            label.className = 'mu20-ef-timeline-label';
            label.textContent = unit;

            var track = document.createElement('div');
            track.className = 'mu20-ef-timeline-track';

            var events = byUnit[unit];
            for (var j = 0; j < events.length; j++) {
                var ev = events[j];
                var startMs = new Date(ev.startTime).getTime();
                var endMs = ev.endTime ? new Date(ev.endTime).getTime() : now;
                var left = Math.max(0, (startMs - earliest) / range * 100);
                var width = Math.min(100 - left, (endMs - startMs) / range * 100);

                var bar = document.createElement('div');
                bar.className = 'mu20-ef-bar' + (ev.endTime ? '' : ' mu20-ef-bar--active');
                bar.style.right = left + '%';
                bar.style.width = Math.max(0.5, width) + '%';
                bar.title = unit + '\n' +
                    '\u05D4\u05EA\u05D7\u05DC\u05D4: ' + new Date(ev.startTime).toLocaleString('he-IL') + '\n' +
                    (ev.endTime ? '\u05E1\u05D9\u05D5\u05DD: ' + new Date(ev.endTime).toLocaleString('he-IL') : '\u05E4\u05E2\u05D9\u05DC \u05DB\u05E2\u05EA');
                track.appendChild(bar);
            }

            row.appendChild(label);
            row.appendChild(track);
            c.appendChild(row);
        }
    };

    Mu20EventFrames.prototype._renderTable = function () {
        var c = this._content;
        while (c.firstChild) c.removeChild(c.firstChild);

        if (!this._frames.length) {
            var empty = document.createElement('div');
            empty.className = 'mu20-ef-empty';
            empty.textContent = '\u05D0\u05D9\u05DF \u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD \u05D1\u05D8\u05D5\u05D5\u05D7';
            c.appendChild(empty);
            return;
        }

        var table = document.createElement('table');
        table.className = 'mu20-table mu20-ef-table';

        var thead = document.createElement('thead');
        var headerRow = document.createElement('tr');
        var headers = ['\u05D9\u05D7\u05D9\u05D3\u05D4', '\u05D0\u05EA\u05E8', '\u05D4\u05EA\u05D7\u05DC\u05D4', '\u05E1\u05D9\u05D5\u05DD', '\u05DE\u05E9\u05DA', '\u05D7\u05D5\u05D3\u05E9'];
        for (var h = 0; h < headers.length; h++) {
            var th = document.createElement('th');
            th.textContent = headers[h];
            headerRow.appendChild(th);
        }
        thead.appendChild(headerRow);
        table.appendChild(thead);

        var tbody = document.createElement('tbody');
        var sorted = this._frames.slice().sort(function (a, b) {
            return new Date(b.startTime) - new Date(a.startTime);
        });

        for (var i = 0; i < sorted.length; i++) {
            var f = sorted[i];
            var tr = document.createElement('tr');
            if (!f.endTime) tr.classList.add('mu20-ef-row--active');

            var cells = [
                f.unitName || '\u2014',
                f.siteName || '\u2014',
                new Date(f.startTime).toLocaleString('he-IL'),
                f.endTime ? new Date(f.endTime).toLocaleString('he-IL') : '\uD83D\uDFE2 \u05E4\u05E2\u05D9\u05DC',
                _formatDuration(f.startTime, f.endTime),
                f.month ? String(f.month) : '\u2014'
            ];

            for (var ci = 0; ci < cells.length; ci++) {
                var td = document.createElement('td');
                td.textContent = cells[ci];
                tr.appendChild(td);
            }
            tbody.appendChild(tr);
        }
        table.appendChild(tbody);
        c.appendChild(table);
    };

    function _formatDuration(start, end) {
        var ms = (end ? new Date(end) : new Date()) - new Date(start);
        var h = Math.floor(ms / 3600000);
        var m = Math.floor((ms % 3600000) / 60000);
        return h + '\u05E9 ' + m + '\u05D3';
    }

    Mu20EventFrames.prototype.update = function () {};

    Mu20EventFrames.prototype.setOption = function (key, val) {
        this._options[key] = val;
    };

    /** Filter display by site/unit (QA15) */
    Mu20EventFrames.prototype._applyFilter = function () {
        // Re-render with filter applied — highlight matching unit rows
        var rows = this._container.querySelectorAll('.mu20-ef-row, .mu20-ef-tl-group');
        for (var i = 0; i < rows.length; i++) {
            var rowSite = rows[i].getAttribute('data-site');
            var rowUnit = rows[i].getAttribute('data-unit');
            if (this._filterSiteId && rowSite) {
                var match = rowSite === this._filterSiteId &&
                    (this._filterUnitIdx === null || this._filterUnitIdx === undefined ||
                     rowUnit === String(this._filterUnitIdx));
                rows[i].style.opacity = match ? '1' : '0.3';
            } else {
                rows[i].style.opacity = '1';
            }
        }
    };

    Mu20EventFrames.prototype.destroy = function () {
        if (this._toggleBar) this._toggleBar.removeEventListener('click', this._onToggle);
        if (this._bus && this._onEfUpdate) this._bus.off('eventframes:updated', this._onEfUpdate);
        if (this._bus && this._onEfFilterUnit) this._bus.off('eventframes:filterUnit', this._onEfFilterUnit);
        while (this._container.firstChild) this._container.removeChild(this._container.firstChild);
        this._frames = [];
        this._stats = {};
    };

    window.Mu20EventFrames = Mu20EventFrames;
})();
