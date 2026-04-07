/**
 * emu-devtools.js — PI Vision Emulator Developer Tools Panel
 * Console, Network, Elements, AF tabs — F12 toggle
 */
(function (window, $) {
    'use strict';

    var EMU_DEVTOOLS = window.EMU_DEVTOOLS = {};
    var _activeTab = 'console';
    var _consolePaused = false;
    var _networkFilter = '';
    var _consoleFilter = '';

    /* =========================================================
     *  PANEL STRUCTURE
     * ========================================================= */
    function _buildPanel() {
        var $panel = $('#emu-devtools-panel');
        if (!$panel.length) return;

        $panel.html(
            '<div class="devtools-inner">' +
            '  <div class="devtools-tabs">' +
            '    <button class="devtools-tab active" data-tab="console">קונסול</button>' +
            '    <button class="devtools-tab" data-tab="network">רשת</button>' +
            '    <button class="devtools-tab" data-tab="elements">אלמנטים</button>' +
            '    <button class="devtools-tab" data-tab="af">AF</button>' +
            '    <div class="devtools-spacer"></div>' +
            '    <div class="devtools-actions">' +
            '      <button id="dt-btn-clear" title="Ctrl+L">🗑 נקה</button>' +
            '      <button id="dt-btn-close" title="F12">✕</button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="devtools-tab-body">' +
            '    <div class="devtools-content active" id="dt-console">' +
            '      <div class="dt-toolbar" dir="rtl">' +
            '        <input type="text" class="dt-filter-input" id="dt-console-filter" placeholder="סנן לוגים...">' +
            '        <label><input type="checkbox" id="dt-show-log" checked> log</label>' +
            '        <label><input type="checkbox" id="dt-show-warn" checked> warn</label>' +
            '        <label><input type="checkbox" id="dt-show-error" checked> error</label>' +
            '        <label><input type="checkbox" id="dt-show-info" checked> info</label>' +
            '      </div>' +
            '      <div class="dt-log-list" id="dt-log-list" dir="ltr"></div>' +
            '      <div class="dt-cmd-bar">' +
            '        <span class="dt-prompt">></span>' +
            '        <input type="text" class="dt-cmd-input" id="dt-cmd-input" placeholder="הרץ JavaScript...">' +
            '      </div>' +
            '    </div>' +
            '    <div class="devtools-content" id="dt-network">' +
            '      <div class="dt-toolbar" dir="rtl">' +
            '        <input type="text" class="dt-filter-input" id="dt-net-filter" placeholder="סנן לפי URL...">' +
            '        <button id="dt-net-clear">נקה</button>' +
            '      </div>' +
            '      <table class="dt-net-table" id="dt-net-table">' +
            '        <thead><tr><th>שיטה</th><th>URL</th><th>סטטוס</th><th>זמן</th><th>גודל</th><th>מועד</th></tr></thead>' +
            '        <tbody id="dt-net-tbody"></tbody>' +
            '      </table>' +
            '    </div>' +
            '    <div class="devtools-content" id="dt-elements">' +
            '      <div class="dt-elements-info" id="dt-elements-info" dir="rtl">בחר סמל להצגת מידע</div>' +
            '    </div>' +
            '    <div class="devtools-content" id="dt-af">' +
            '      <div class="dt-af-info" dir="rtl" id="dt-af-info">' +
            '        <h4>חיבור PI Web API</h4>' +
            '        <table class="dt-af-table">' +
            '          <tr><td>שרת PI</td><td class="af-val ok">PISERVER01 ✓</td></tr>' +
            '          <tr><td>שרת AF</td><td class="af-val ok">AFSERVER01 ✓</td></tr>' +
            '          <tr><td>גרסת PI Web API</td><td class="af-val">2025.1.0</td></tr>' +
            '          <tr><td>מצב</td><td class="af-val ok">מחובר (Mock)</td></tr>' +
            '          <tr><td>תגובה ממוצעת</td><td class="af-val">12ms</td></tr>' +
            '        </table>' +
            '        <h4>אתרים</h4>' +
            '        <ul class="dt-sites-list">' +
            '          <li>🏭 אשקלון (ASH) — 2,250 MW</li>' +
            '          <li>🏭 חדרה (HAD) — 2,590 MW</li>' +
            '          <li>🏭 אורות רבין (ORT) — 2,590 MW</li>' +
            '          <li>🏭 רוטנברג (RUT) — 2,250 MW</li>' +
            '          <li>🏭 רידינג (RDG) — 604 MW</li>' +
            '        </ul>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="devtools-resize-handle" id="dt-resize"></div>' +
            '</div>'
        );

        // Tab switching
        $panel.on('click', '.devtools-tab', function () {
            $panel.find('.devtools-tab').removeClass('active');
            $(this).addClass('active');
            $panel.find('.devtools-content').removeClass('active');
            $('#dt-' + $(this).data('tab')).addClass('active');
            _activeTab = $(this).data('tab');
            if (_activeTab === 'network') _renderNetwork();
            if (_activeTab === 'console') _renderConsole();
        });

        // Clear button
        $('#dt-btn-clear').on('click', _clearActive);
        $('#dt-net-clear').on('click', function () { window.__networkLog && (window.__networkLog.length = 0); _renderNetwork(); });

        // Close
        $('#dt-btn-close').on('click', function () { $panel.removeClass('open'); });

        // Command bar
        var _cmdHistory = [];
        var _cmdIdx = -1;
        $('#dt-cmd-input').on('keydown', function (e) {
            if (e.key === 'Enter') {
                var cmd = $(this).val().trim();
                if (!cmd) return;
                _cmdHistory.unshift(cmd);
                _cmdIdx = -1;
                $(this).val('');
                _execCommand(cmd);
            } else if (e.key === 'ArrowUp') {
                if (_cmdIdx < _cmdHistory.length - 1) _cmdIdx++;
                $(this).val(_cmdHistory[_cmdIdx] || '');
            } else if (e.key === 'ArrowDown') {
                if (_cmdIdx > 0) _cmdIdx--;
                else _cmdIdx = -1;
                $(this).val(_cmdIdx >= 0 ? _cmdHistory[_cmdIdx] : '');
            }
        });

        // Filter inputs
        $('#dt-console-filter').on('input', function () { _consoleFilter = $(this).val().toLowerCase(); _renderConsole(); });
        $('#dt-net-filter').on('input', function () { _networkFilter = $(this).val().toLowerCase(); _renderNetwork(); });

        // Keyboard
        $(document).on('keydown', function (e) {
            if (e.ctrlKey && e.key === 'l') { e.preventDefault(); _clearActive(); }
        });

        // Resize handle
        _initResize();

        // Start rendering
        _renderConsole();
        _startAutoRefresh();
    }

    function _execCommand(cmd) {
        var result;
        var level = 'log';
        try {
            result = eval(cmd); // eslint-disable-line
            if (result === undefined) result = 'undefined';
        } catch (e) {
            result = String(e);
            level = 'error';
        }
        // Add to console log
        var logs = window.__consoleLogs || [];
        logs.push({ level: level, msg: '> ' + cmd, ts: Date.now(), count: 1, isCmd: true });
        if (result !== undefined && result !== null) {
            logs.push({ level: 'log', msg: String(typeof result === 'object' ? JSON.stringify(result, null, 2) : result), ts: Date.now(), count: 1 });
        }
        _renderConsole();
    }

    /* =========================================================
     *  CONSOLE TAB
     * ========================================================= */
    function _renderConsole() {
        var $list = $('#dt-log-list');
        if (!$list.length) return;
        var logs = window.__consoleLogs || [];
        var showLog   = $('#dt-show-log').prop('checked') !== false;
        var showWarn  = $('#dt-show-warn').prop('checked') !== false;
        var showError = $('#dt-show-error').prop('checked') !== false;
        var showInfo  = $('#dt-show-info').prop('checked') !== false;

        var filtered = logs.filter(function (e) {
            if (e.level === 'log'   && !showLog)   return false;
            if (e.level === 'warn'  && !showWarn)  return false;
            if (e.level === 'error' && !showError) return false;
            if (e.level === 'info'  && !showInfo)  return false;
            if (_consoleFilter && e.msg.toLowerCase().indexOf(_consoleFilter) < 0) return false;
            return true;
        });

        var html = filtered.slice(-200).map(function (e) {
            var cls = 'dt-log dt-log-' + e.level;
            if (e.isCmd) cls += ' dt-log-cmd';
            var ts = new Date(e.ts).toLocaleTimeString('he-IL');
            var cnt = e.count > 1 ? '<span class="dt-log-count">' + e.count + '</span>' : '';
            var msg = _escapeHtml(e.msg);
            return '<div class="' + cls + '">' + cnt + '<span class="dt-log-ts">' + ts + '</span><span class="dt-log-msg">' + msg + '</span></div>';
        }).join('');

        var scrolledToBottom = $list[0].scrollTop + $list[0].clientHeight >= $list[0].scrollHeight - 20;
        $list.html(html || '<div class="dt-empty">אין הודעות</div>');
        if (scrolledToBottom) $list.scrollTop($list[0].scrollHeight);
    }

    /* =========================================================
     *  NETWORK TAB
     * ========================================================= */
    function _renderNetwork() {
        var $tbody = $('#dt-net-tbody');
        if (!$tbody.length) return;
        var logs = window.__networkLog || [];
        var filtered = logs.filter(function (e) {
            return !_networkFilter || e.url.toLowerCase().indexOf(_networkFilter) >= 0;
        });

        var html = filtered.slice(-100).map(function (e) {
            var statusCls = e.status >= 400 || e.status === 0 ? 'net-err' : (e.status >= 300 ? 'net-warn' : 'net-ok');
            var mock = e.mock ? '<span class="net-mock">mock</span>' : '';
            var ts = new Date(e.ts).toLocaleTimeString('he-IL');
            var url = e.url.length > 60 ? '...' + e.url.slice(-57) : e.url;
            return '<tr class="' + statusCls + '">' +
                '<td>' + (e.method || 'GET') + '</td>' +
                '<td title="' + _escapeHtml(e.url) + '">' + _escapeHtml(url) + mock + '</td>' +
                '<td>' + (e.status || 0) + '</td>' +
                '<td>' + (e.time ? e.time + 'ms' : '-') + '</td>' +
                '<td>' + (e.size ? Math.ceil(e.size / 1024) + ' KB' : '-') + '</td>' +
                '<td>' + ts + '</td>' +
                '</tr>';
        }).join('');

        $tbody.html(html || '<tr><td colspan="6" class="dt-empty">אין בקשות</td></tr>');
    }

    /* =========================================================
     *  ELEMENTS TAB
     * ========================================================= */
    function _updateElements(container, symName) {
        var $info = $('#dt-elements-info');
        if (!$info.length) return;

        var domCount = container ? container.querySelectorAll('*').length : 0;
        var hasShadow = container ? container.querySelectorAll('[class*="shadow"]').length : 0;
        var scriptCount = container ? container.querySelectorAll('script').length : 0;

        var def = window.PIVisualization && window.PIVisualization.symbolCatalog.getSymbol(symName);
        var cfg;
        try { cfg = def && def.getDefaultConfig ? def.getDefaultConfig() : {}; } catch(e) { cfg = {}; }
        cfg = cfg || {};

        var html = '<div dir="rtl"><h4>סמל: ' + symName + '</h4>' +
            '<table class="dt-el-table">' +
            '<tr><td>שם תצוגה</td><td>' + ((def && def.displayName) || symName) + '</td></tr>' +
            '<tr><td>DataShape</td><td>' + (cfg.DataShape || 'Value') + '</td></tr>' +
            '<tr><td>גובה ברירת מחדל</td><td>' + (cfg.Height || '-') + ' px</td></tr>' +
            '<tr><td>רוחב ברירת מחדל</td><td>' + (cfg.Width || '-') + ' px</td></tr>' +
            '<tr><td>אלמנטי DOM</td><td>' + domCount + '</td></tr>' +
            '<tr><td>Shadow DOM</td><td>' + (hasShadow ? 'כן (' + hasShadow + ')' : 'לא') + '</td></tr>' +
            '<tr><td>סקריפטים</td><td>' + scriptCount + '</td></tr>' +
            '</table>';

        // Show outerHTML snippet
        if (container) {
            var snippet = container.outerHTML || '';
            if (snippet.length > 500) snippet = snippet.slice(0, 500) + '...';
            html += '<details><summary>HTML Snippet</summary><pre class="dt-snippet">' + _escapeHtml(snippet) + '</pre></details>';
        }

        html += '</div>';
        $info.html(html);
    }
    EMU_DEVTOOLS.updateElements = _updateElements;

    /* =========================================================
     *  CONSOLE CALLBACK
     * ========================================================= */
    window.__EMU_CONSOLE_CALLBACK = function (entry) {
        if (_activeTab === 'console' && $('#emu-devtools-panel').hasClass('open')) {
            _renderConsole();
        }
    };

    window.__EMU_NETWORK_CALLBACK = function (entry) {
        if (_activeTab === 'network' && $('#emu-devtools-panel').hasClass('open')) {
            _renderNetwork();
        }
    };

    /* =========================================================
     *  HELPERS
     * ========================================================= */
    function _clearActive() {
        if (_activeTab === 'console') { window.__consoleLogs && (window.__consoleLogs.length = 0); _renderConsole(); }
        if (_activeTab === 'network') { window.__networkLog && (window.__networkLog.length = 0); _renderNetwork(); }
    }

    function _escapeHtml(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    function _startAutoRefresh() {
        setInterval(function () {
            if (!$('#emu-devtools-panel').hasClass('open')) return;
            if (_activeTab === 'console') _renderConsole();
            if (_activeTab === 'network') _renderNetwork();
        }, 2000);
    }

    /* =========================================================
     *  RESIZE HANDLE
     * ========================================================= */
    function _initResize() {
        var $panel = $('#emu-devtools-panel');
        var $handle = $('#dt-resize');
        var _dragging = false;
        var _startY, _startH;

        $handle.on('mousedown', function (e) {
            _dragging = true;
            _startY = e.clientY;
            _startH = $panel.height();
            $('body').css('user-select', 'none');
        });
        $(document).on('mousemove', function (e) {
            if (!_dragging) return;
            var dy = _startY - e.clientY;
            var newH = Math.max(120, Math.min(600, _startH + dy));
            $panel.css('height', newH + 'px');
        });
        $(document).on('mouseup', function () {
            if (_dragging) { _dragging = false; $('body').css('user-select', ''); }
        });
    }

    /* =========================================================
     *  INIT
     * ========================================================= */
    $(document).ready(function () {
        _buildPanel();
    });

})(window, jQuery);
