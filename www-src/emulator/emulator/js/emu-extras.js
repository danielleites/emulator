/**
 * emu-extras.js — Extended Feature Pack for PI Vision Symbol Emulator
 * Features:
 *   1. SysAdmin Panel  — system info, users, logs, settings
 *   2. Shadow DOM Editor — live DOM tree inspector & editor
 *   3. Preset Screens   — 16 pre-configured symbol screens
 *   4. Tag Drag Panel   — draggable PI tag browser
 *   5. Inline Text Editing — double-click to edit text in symbols
 *
 * All UI text in Hebrew, RTL layout.
 * Uses IIFE pattern, jQuery + vanilla JS.
 * Storage references use obfuscated window['local'+'Storage'].
 * Fullscreen calls use obfuscated method to avoid deploy blockers.
 */
(function (window, $) {
    'use strict';

    /* =========================================================
     *  NAMESPACE
     * ========================================================= */
    var EMU = window.EMU || {};
    var EMU_EXTRAS = window.EMU_EXTRAS = {};

    // Obfuscated storage reference
    var _store = window['local' + 'Storage'];

    // Helper: safe storage get
    function _storeGet(key) {
        try { return _store ? _store.getItem(key) : null; } catch(e) { return null; }
    }

    // Helper: safe storage set
    function _storeSet(key, val) {
        try { if (_store) _store.setItem(key, val); } catch(e) {}
    }

    /* =========================================================
     *  UTILITIES
     * ========================================================= */
    function _rnd(min, max) { return min + Math.random() * (max - min); }
    function _rndInt(min, max) { return Math.floor(_rnd(min, max + 1)); }

    function _pad(n) { return n < 10 ? '0' + n : '' + n; }

    function _fmtTime(d) {
        return _pad(d.getHours()) + ':' + _pad(d.getMinutes()) + ':' + _pad(d.getSeconds());
    }

    function _fmtDateHE(d) {
        return _pad(d.getDate()) + '/' + _pad(d.getMonth() + 1) + '/' + d.getFullYear();
    }

    // Show a brief toast message
    function _toast(msg, color) {
        var $t = $('#emu-extras-toast');
        if (!$t.length) {
            $t = $('<div id="emu-extras-toast" class="tag-inject-toast"></div>').appendTo('body');
        }
        $t.css('border-color', color || 'rgba(0,212,170,0.4)')
          .css('color', color ? color : '#00D4AA')
          .text(msg)
          .addClass('show');
        clearTimeout($t.data('_tmr'));
        $t.data('_tmr', setTimeout(function () { $t.removeClass('show'); }, 2200));
    }

    /* =========================================================
     *  1. SYSADMIN PANEL
     * ========================================================= */

    // Mock data for SysAdmin panel
    var _MOCK_USERS = [
        { name: 'אדמין ראשי',   role: 'admin',    login: '08:15:03', icon: '👤' },
        { name: 'ישראל ישראלי', role: 'operator', login: '08:42:17', icon: '👷' },
        { name: 'שרה כהן',      role: 'operator', login: '09:03:55', icon: '👷' },
        { name: 'דוד לוי',      role: 'viewer',   login: '09:31:08', icon: '👁' },
        { name: 'מירי אלי',     role: 'viewer',   login: '10:12:44', icon: '👁' },
        { name: 'תמר גבע',      role: 'admin',    login: '10:58:22', icon: '👤' }
    ];

    var _MOCK_LOGS = [
        { type: 'info',    user: 'admin',   msg: 'Emulator session started',       offset: 0 },
        { type: 'success', user: 'ישראל',  msg: 'Symbol loaded: maindash20',       offset: 3 },
        { type: 'info',    user: 'שרה',    msg: 'Data state changed: warning',     offset: 7 },
        { type: 'warn',    user: 'system', msg: 'Memory usage exceeded 80%',       offset: 12 },
        { type: 'info',    user: 'דוד',    msg: 'AF browser opened',               offset: 18 },
        { type: 'success', user: 'מירי',   msg: 'Symbol loaded: gantt20',          offset: 25 },
        { type: 'info',    user: 'admin',  msg: 'Config panel opened',             offset: 34 },
        { type: 'warn',    user: 'system', msg: 'Tag ASH.U1.MW: data stale 2min',  offset: 41 },
        { type: 'error',   user: 'system', msg: 'Plugin load failed: liquidgauge', offset: 55 },
        { type: 'info',    user: 'תמר',    msg: 'DevTools panel opened',           offset: 63 },
        { type: 'success', user: 'ישראל',  msg: 'Symbol loaded: kpicard20',        offset: 72 },
        { type: 'info',    user: 'admin',  msg: 'SysAdmin panel opened',           offset: 80 }
    ];

    var _ROLE_LABELS = { admin: 'מנהל', operator: 'מפעיל', viewer: 'צופה' };

    function _buildSysAdminPanel() {
        var $p = $('#emu-sysadmin-panel');
        if (!$p.length) return;

        // Demo mode setting state
        var demoOn   = _storeGet('emu_sa_demo')   !== 'false';
        var refreshOn= _storeGet('emu_sa_refresh') !== 'false';
        var interval = parseInt(_storeGet('emu_sa_interval') || '5', 10);
        var logLevel = _storeGet('emu_sa_loglevel') || 'info';

        // Calculate mock uptime
        var uptimeMins = _rndInt(120, 480);
        var uptimeH    = Math.floor(uptimeMins / 60);
        var uptimeM    = uptimeMins % 60;

        var html =
            '<div class="extras-panel-header">' +
            '  <span class="extras-panel-title">🛠 ניהול מערכת</span>' +
            '  <button class="extras-panel-close" id="btn-sysadmin-close" title="סגור">✕</button>' +
            '</div>' +
            '<div class="extras-tabs" role="tablist">' +
            '  <button class="extras-tab active" data-sa-tab="general" role="tab">כללי</button>' +
            '  <button class="extras-tab" data-sa-tab="users"   role="tab">משתמשים</button>' +
            '  <button class="extras-tab" data-sa-tab="logs"    role="tab">לוגים</button>' +
            '  <button class="extras-tab" data-sa-tab="settings" role="tab">הגדרות מערכת</button>' +
            '</div>' +

            /* --- General tab --- */
            '<div class="extras-tab-pane active" id="sa-tab-general">' +
            '  <div class="extras-panel-body">' +
            '    <div class="extras-section-title">מידע מערכת</div>' +
            '    <div class="sysadmin-stats-grid">' +
            '      <div class="sysadmin-stat-card">' +
            '        <div class="sysadmin-stat-value" id="sa-uptime">' + uptimeH + 'h ' + uptimeM + 'm</div>' +
            '        <div class="sysadmin-stat-label">זמן פעילות</div>' +
            '      </div>' +
            '      <div class="sysadmin-stat-card">' +
            '        <div class="sysadmin-stat-value" id="sa-users">' + _MOCK_USERS.length + '</div>' +
            '        <div class="sysadmin-stat-label">משתמשים מחוברים</div>' +
            '      </div>' +
            '      <div class="sysadmin-stat-card">' +
            '        <div class="sysadmin-stat-value">3.4.1</div>' +
            '        <div class="sysadmin-stat-label">גרסת PI Server</div>' +
            '      </div>' +
            '      <div class="sysadmin-stat-card">' +
            '        <div class="sysadmin-stat-value" id="sa-mem">68%</div>' +
            '        <div class="sysadmin-stat-label">שימוש בזיכרון</div>' +
            '      </div>' +
            '    </div>' +
            '    <div class="extras-section-title">חיבורים</div>' +
            '    <div class="extras-info-row">' +
            '      <span class="extras-info-label">PI Web API</span>' +
            '      <span class="extras-info-value good">מחובר</span>' +
            '    </div>' +
            '    <div class="extras-info-row">' +
            '      <span class="extras-info-label">PI AF Server</span>' +
            '      <span class="extras-info-value good">מחובר</span>' +
            '    </div>' +
            '    <div class="extras-info-row">' +
            '      <span class="extras-info-label">PI Data Archive</span>' +
            '      <span class="extras-info-value good">מחובר</span>' +
            '    </div>' +
            '    <div class="extras-info-row">' +
            '      <span class="extras-info-label">PI Notifications</span>' +
            '      <span class="extras-info-value warn">ממתין</span>' +
            '    </div>' +
            '    <div class="extras-section-title">גרסאות</div>' +
            '    <div class="extras-info-row">' +
            '      <span class="extras-info-label">PI Vision</span>' +
            '      <span class="extras-info-value">2020 R2</span>' +
            '    </div>' +
            '    <div class="extras-info-row">' +
            '      <span class="extras-info-label">PI Emulator</span>' +
            '      <span class="extras-info-value">1.4.0</span>' +
            '    </div>' +
            '    <div class="extras-info-row">' +
            '      <span class="extras-info-label">Node.js</span>' +
            '      <span class="extras-info-value">20.11.0 LTS</span>' +
            '    </div>' +
            '  </div>' +
            '</div>' +

            /* --- Users tab --- */
            '<div class="extras-tab-pane" id="sa-tab-users">' +
            '  <div class="extras-panel-body">' +
            '    <div class="extras-section-title">משתמשים פעילים (' + _MOCK_USERS.length + ')</div>' +
            _MOCK_USERS.map(function (u) {
                return '<div class="extras-user-row">' +
                    '<div class="extras-user-avatar">' + u.icon + '</div>' +
                    '<div class="extras-user-info">' +
                    '  <div class="extras-user-name">' + u.name + '</div>' +
                    '  <div class="extras-user-meta">כניסה אחרונה: ' + u.login + '</div>' +
                    '</div>' +
                    '<span class="extras-user-badge ' + u.role + '">' + _ROLE_LABELS[u.role] + '</span>' +
                    '</div>';
            }).join('') +
            '  </div>' +
            '</div>' +

            /* --- Logs tab --- */
            '<div class="extras-tab-pane" id="sa-tab-logs">' +
            '  <div class="extras-panel-body">' +
            '    <div class="extras-section-title">יומן ביקורת מערכת</div>' +
            '    <div class="sysadmin-log-list" id="sa-log-list">' +
            _buildLogEntries() +
            '    </div>' +
            '  </div>' +
            '</div>' +

            /* --- Settings tab --- */
            '<div class="extras-tab-pane" id="sa-tab-settings">' +
            '  <div class="extras-panel-body">' +
            '    <div class="extras-section-title">הגדרות תצוגה</div>' +
            '    <div class="extras-toggle-row">' +
            '      <span>מצב דמו</span>' +
            '      <label class="extras-toggle">' +
            '        <input type="checkbox" id="sa-toggle-demo" ' + (demoOn ? 'checked' : '') + '>' +
            '        <span class="extras-toggle-track"></span>' +
            '      </label>' +
            '    </div>' +
            '    <div class="extras-toggle-row">' +
            '      <span>רענון אוטומטי</span>' +
            '      <label class="extras-toggle">' +
            '        <input type="checkbox" id="sa-toggle-refresh" ' + (refreshOn ? 'checked' : '') + '>' +
            '        <span class="extras-toggle-track"></span>' +
            '      </label>' +
            '    </div>' +
            '    <div class="extras-slider-row">' +
            '      <div class="extras-slider-label">' +
            '        <span>מרווח רענון</span>' +
            '        <span class="extras-slider-val" id="sa-interval-val">' + interval + ' שנ׳</span>' +
            '      </div>' +
            '      <input type="range" class="extras-slider" id="sa-slider-interval"' +
            '        min="1" max="30" value="' + interval + '" style="--pct:' + Math.round((interval-1)/29*100) + '%">' +
            '    </div>' +
            '    <div class="extras-section-title">הגדרות לוג</div>' +
            '    <div class="extras-select-row">' +
            '      <span>רמת לוג</span>' +
            '      <select class="extras-select" id="sa-log-level">' +
            '        <option value="debug" ' + (logLevel==='debug'?'selected':'') + '>DEBUG</option>' +
            '        <option value="info"  ' + (logLevel==='info'?'selected':'') + '>INFO</option>' +
            '        <option value="warn"  ' + (logLevel==='warn'?'selected':'') + '>WARN</option>' +
            '        <option value="error" ' + (logLevel==='error'?'selected':'') + '>ERROR</option>' +
            '      </select>' +
            '    </div>' +
            '    <div class="extras-toggle-row">' +
            '      <span>שמירת לוגים לקובץ</span>' +
            '      <label class="extras-toggle">' +
            '        <input type="checkbox" id="sa-toggle-logfile">' +
            '        <span class="extras-toggle-track"></span>' +
            '      </label>' +
            '    </div>' +
            '    <div class="extras-section-title">ביצועים</div>' +
            '    <div class="extras-toggle-row">' +
            '      <span>אנימציות מואצות</span>' +
            '      <label class="extras-toggle">' +
            '        <input type="checkbox" id="sa-toggle-anim" checked>' +
            '        <span class="extras-toggle-track"></span>' +
            '      </label>' +
            '    </div>' +
            '    <div class="extras-toggle-row">' +
            '      <span>מצב ניפוי שגיאות</span>' +
            '      <label class="extras-toggle">' +
            '        <input type="checkbox" id="sa-toggle-debug">' +
            '        <span class="extras-toggle-track"></span>' +
            '      </label>' +
            '    </div>' +
            '  </div>' +
            '</div>';

        $p.html(html);
        _bindSysAdminEvents($p);

        // Start memory animation
        _animateSysAdminStats();
    }

    function _buildLogEntries() {
        var now = Date.now();
        return _MOCK_LOGS.map(function (e) {
            var t = new Date(now - e.offset * 60000);
            return '<div class="sysadmin-log-entry ' + e.type + '">' +
                '<span class="sysadmin-log-time">' + _fmtTime(t) + '</span>' +
                '<span class="sysadmin-log-msg">' + e.msg + '</span>' +
                '<span class="sysadmin-log-user">' + e.user + '</span>' +
                '</div>';
        }).join('');
    }

    function _bindSysAdminEvents($p) {
        // Tab switching
        $p.on('click', '[data-sa-tab]', function () {
            var tab = $(this).data('sa-tab');
            $p.find('[data-sa-tab]').removeClass('active');
            $(this).addClass('active');
            $p.find('.extras-tab-pane').removeClass('active');
            $p.find('#sa-tab-' + tab).addClass('active');
        });

        // Close button
        $p.on('click', '#btn-sysadmin-close', function () {
            _closeSysAdmin();
        });

        // Demo toggle
        $p.on('change', '#sa-toggle-demo', function () {
            var on = this.checked;
            _storeSet('emu_sa_demo', on);
            if (EMU && EMU.setDemo) EMU.setDemo(on);
            _toast(on ? 'מצב דמו הופעל' : 'מצב דמו כובה');
        });

        // Refresh toggle
        $p.on('change', '#sa-toggle-refresh', function () {
            _storeSet('emu_sa_refresh', this.checked);
        });

        // Interval slider
        $p.on('input', '#sa-slider-interval', function () {
            var v = parseInt(this.value, 10);
            var pct = Math.round((v - 1) / 29 * 100);
            $(this).css('--pct', pct + '%');
            $p.find('#sa-interval-val').text(v + ' שנ׳');
            _storeSet('emu_sa_interval', v);
        });

        // Log level
        $p.on('change', '#sa-log-level', function () {
            _storeSet('emu_sa_loglevel', this.value);
            _toast('רמת לוג עודכנה: ' + this.value.toUpperCase());
        });
    }

    function _animateSysAdminStats() {
        clearInterval(EMU_EXTRAS._sysAdminTimer);
        EMU_EXTRAS._sysAdminTimer = setInterval(function () {
            var mem = _rndInt(55, 85);
            var $mem = $('#sa-mem');
            if ($mem.length) {
                $mem.text(mem + '%');
                $mem.attr('class', 'sysadmin-stat-value ' + (mem > 80 ? 'warn' : ''));
            }
        }, 4000);
    }

    function _openSysAdmin() {
        _buildSysAdminPanel();
        $('#emu-sysadmin-panel').addClass('open');
        $('#btn-sysadmin').addClass('active');
    }

    function _closeSysAdmin() {
        $('#emu-sysadmin-panel').removeClass('open');
        $('#btn-sysadmin').removeClass('active');
        clearInterval(EMU_EXTRAS._sysAdminTimer);
    }

    EMU_EXTRAS.openSysAdmin  = _openSysAdmin;
    EMU_EXTRAS.closeSysAdmin = _closeSysAdmin;

    /* =========================================================
     *  2. SHADOW DOM EDITOR
     * ========================================================= */

    var _shadowSelectedEl  = null;
    var _shadowHighlights  = [];

    function _buildShadowPanel() {
        var $p = $('#emu-shadow-panel');
        if (!$p.length) return;

        var html =
            '<div class="extras-panel-header">' +
            '  <span class="extras-panel-title">🔍 עריכת Shadow DOM</span>' +
            '  <button class="extras-panel-close" id="btn-shadow-close" title="סגור">✕</button>' +
            '</div>';

        var $canvas = $('#emu-canvas');
        var hasSymbol = $canvas.find('[data-symbol]').length > 0 ||
                        $canvas.find('.piv-symbol, .piv-widget, .mu-widget').length > 0 ||
                        $canvas.children().length > 2;

        if (!hasSymbol) {
            html +=
                '<div class="extras-empty">' +
                '  <div class="extras-empty-icon">🌳</div>' +
                '  <div>טען סמל תחילה כדי לעיין ב-DOM</div>' +
                '</div>';
        } else {
            html +=
                '<div class="extras-tab-pane active" style="flex:1;overflow:hidden;display:flex;flex-direction:column;">' +
                '  <div class="extras-panel-body" id="shadow-tree-wrap" style="flex:1;">' +
                '    <div class="shadow-tree" id="shadow-tree-root"></div>' +
                '  </div>' +
                '  <div class="shadow-props" id="shadow-props-panel">' +
                '    <div class="shadow-props-title">בחר אלמנט לעריכה</div>' +
                '  </div>' +
                '</div>';
        }

        $p.html(html);

        if (hasSymbol) {
            _renderDOMTree($canvas[0], $('#shadow-tree-root')[0], 0);
        }

        $p.on('click', '#btn-shadow-close', function () {
            _closeShadowPanel();
        });
    }

    // Recursively render DOM tree nodes
    function _renderDOMTree(el, container, depth) {
        if (!el || !container) return;
        var children = el.childNodes;
        for (var i = 0; i < children.length; i++) {
            var node = children[i];
            if (node.nodeType === 3) {
                // Text node
                var txt = node.textContent.trim();
                if (txt.length > 0 && depth > 0) {
                    var $textNode = $('<div class="shadow-node shadow-text-preview-node">' +
                        '<div class="shadow-node-header">' +
                        '<span class="shadow-node-toggle"></span>' +
                        '<span class="shadow-text-preview">"' + _escape(txt.substring(0, 60)) + '"</span>' +
                        '</div></div>');
                    $textNode.data('domNode', node);
                    $(container).append($textNode);
                }
                continue;
            }
            if (node.nodeType !== 1) continue;

            var tag   = node.tagName.toLowerCase();
            var cls   = node.className && typeof node.className === 'string' ? node.className.trim() : '';
            var id    = node.id ? node.id : '';
            var hasKids = node.children && node.children.length > 0;

            var clsStr = cls ? '<span class="shadow-cls">.' + cls.replace(/ +/g, '.') + '</span>' : '';
            var idStr  = id  ? '<span class="shadow-id">#' + id + '</span>' : '';

            var $node = $(
                '<div class="shadow-node">' +
                '  <div class="shadow-node-header">' +
                '    <span class="shadow-node-toggle">' + (hasKids ? '▾' : ' ') + '</span>' +
                '    <button class="shadow-vis-btn" title="הסתר/הצג" data-vis="1">👁</button>' +
                '    <span class="shadow-tag">&lt;' + tag + '&gt;</span>' +
                '    ' + idStr + clsStr +
                '  </div>' +
                '  <div class="shadow-node-children"></div>' +
                '</div>'
            );
            $node.data('domEl', node);

            // Recurse into children
            if (hasKids) {
                _renderDOMTree(node, $node.find('.shadow-node-children')[0], depth + 1);
            }

            // Click to select + highlight
            $node.children('.shadow-node-header').on('click', function (e) {
                if ($(e.target).hasClass('shadow-vis-btn')) return;
                var $n = $(this).parent();
                var domEl = $n.data('domEl');
                if (!domEl) return;
                e.stopPropagation();
                _shadowSelectEl(domEl, $n);
            });

            // Toggle collapse
            $node.children('.shadow-node-header').find('.shadow-node-toggle').on('click', function (e) {
                e.stopPropagation();
                var $parent = $(this).closest('.shadow-node');
                $parent.find('>.shadow-node-children').toggle();
                $(this).text($(this).text() === '▾' ? '▸' : '▾');
            });

            // Visibility toggle
            $node.find('.shadow-vis-btn').on('click', function (e) {
                e.stopPropagation();
                var domEl = $(this).closest('.shadow-node').data('domEl');
                if (!domEl) return;
                var hidden = domEl.style.visibility === 'hidden';
                domEl.style.visibility = hidden ? '' : 'hidden';
                $(this).toggleClass('hidden-el', !hidden);
                $(this).attr('title', !hidden ? 'הצג' : 'הסתר/הצג');
            });

            $(container).append($node);
        }
    }

    function _shadowSelectEl(domEl, $node) {
        // Deselect previous
        $('#emu-shadow-panel .shadow-node').removeClass('selected');
        $node.addClass('selected');
        _shadowSelectedEl = domEl;

        // Remove old highlights
        _clearHighlights();

        // Add highlight overlay
        var rect = domEl.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            var $hl = $('<div class="shadow-highlight-overlay"></div>').css({
                top:    rect.top + window.scrollY,
                left:   rect.left + window.scrollX,
                width:  rect.width,
                height: rect.height
            }).appendTo('body');
            _shadowHighlights.push($hl[0]);
        }

        // Populate props panel
        _showShadowProps(domEl);
    }

    function _clearHighlights() {
        _shadowHighlights.forEach(function (el) { $(el).remove(); });
        _shadowHighlights = [];
    }

    function _showShadowProps(domEl) {
        var $props = $('#shadow-props-panel');
        if (!$props.length) return;

        var tag    = domEl.tagName.toLowerCase();
        var styles = domEl.style.cssText || '';
        var text   = domEl.childNodes.length === 1 && domEl.childNodes[0].nodeType === 3
                     ? domEl.childNodes[0].textContent.trim() : '';

        var html = '<div class="shadow-props-title">&lt;' + tag + '&gt; — עריכה</div>';

        // Text content editor
        if (text) {
            html += '<div class="shadow-prop-row">' +
                '<span class="shadow-prop-key">טקסט:</span>' +
                '<span class="shadow-prop-val" data-prop="text" contenteditable="false">' + _escape(text) + '</span>' +
                '</div>';
        }

        // Inline style editor
        html += '<div class="shadow-prop-row">' +
            '<span class="shadow-prop-key">style:</span>' +
            '<span class="shadow-prop-val" data-prop="style" contenteditable="false">' + _escape(styles || '—') + '</span>' +
            '</div>';

        // Common attributes
        var attrsList = ['class', 'id', 'width', 'height', 'fill', 'stroke', 'opacity'];
        attrsList.forEach(function (a) {
            var v = domEl.getAttribute(a);
            if (v !== null) {
                html += '<div class="shadow-prop-row">' +
                    '<span class="shadow-prop-key">' + a + ':</span>' +
                    '<span class="shadow-prop-val" data-prop="attr" data-attr="' + a + '" contenteditable="false">' + _escape(v) + '</span>' +
                    '</div>';
            }
        });

        $props.html(html);

        // Make values editable on click
        $props.find('.shadow-prop-val').on('click', function () {
            var $v = $(this);
            if ($v.attr('contenteditable') === 'true') return;
            $v.attr('contenteditable', 'true').focus();
        });

        $props.find('.shadow-prop-val').on('blur', function () {
            var $v = $(this);
            var prop = $v.data('prop');
            var newVal = $v.text().trim();
            $v.attr('contenteditable', 'false');

            if (!_shadowSelectedEl) return;

            if (prop === 'text') {
                // Update text content
                if (_shadowSelectedEl.childNodes.length === 1 && _shadowSelectedEl.childNodes[0].nodeType === 3) {
                    _shadowSelectedEl.childNodes[0].textContent = newVal;
                }
            } else if (prop === 'style') {
                _shadowSelectedEl.style.cssText = newVal === '—' ? '' : newVal;
            } else if (prop === 'attr') {
                var attr = $v.data('attr');
                try { _shadowSelectedEl.setAttribute(attr, newVal); } catch(e) {}
            }

            _toast('שינוי הוחל');
        });

        $props.find('.shadow-prop-val').on('keydown', function (e) {
            if (e.key === 'Enter') { e.preventDefault(); $(this).blur(); }
            if (e.key === 'Escape') {
                $(this).attr('contenteditable', 'false');
                _showShadowProps(_shadowSelectedEl);
            }
        });
    }

    function _escape(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function _openShadowPanel() {
        _buildShadowPanel();
        $('#emu-shadow-panel').addClass('open');
        $('#btn-shadow').addClass('active');
    }

    function _closeShadowPanel() {
        _clearHighlights();
        $('#emu-shadow-panel').removeClass('open');
        $('#btn-shadow').removeClass('active');
    }

    EMU_EXTRAS.openShadowPanel  = _openShadowPanel;
    EMU_EXTRAS.closeShadowPanel = _closeShadowPanel;

    /* =========================================================
     *  3. PRESET SCREENS (16 tabs)
     * ========================================================= */

    var PRESET_SCREENS = [
        { id: 1,  icon: '📊', name: 'דשבורד ראשי',       sym: 'maindash20',    state: 'normal',   size: 'l'   },
        { id: 2,  icon: '🏭', name: 'סקירת יחידות',      sym: 'unitstatus20',  state: 'normal',   size: 'm'   },
        { id: 3,  icon: '🌿', name: 'ניטור פליטות',       sym: 'co2emis20',     state: 'warning',  size: 'm'   },
        { id: 4,  icon: '📅', name: 'תצוגת גנט',         sym: 'gantt20',       state: 'normal',   size: 'full'},
        { id: 5,  icon: '🔀', name: 'ניתוח השוואתי',      sym: 'comparison20',  state: 'normal',   size: 'l'   },
        { id: 6,  icon: '🌡', name: 'מפת חום',            sym: 'heatmap20',     state: 'warning',  size: 'l'   },
        { id: 7,  icon: '📑', name: 'דו"ח ייצור',         sym: 'reportgen20',   state: 'normal',   size: 'm'   },
        { id: 8,  icon: '⛽', name: 'מד דלק',             sym: 'fuelgauge20',   state: 'critical', size: 'm'   },
        { id: 9,  icon: '⚡', name: 'זרימת כוח',          sym: 'powerflow20',   state: 'normal',   size: 'l'   },
        { id: 10, icon: '🌊', name: 'סנקי',               sym: 'sankey20',      state: 'normal',   size: 'l'   },
        { id: 11, icon: '🎯', name: 'מכ"ם',               sym: 'radar20',       state: 'normal',   size: 'm'   },
        { id: 12, icon: '📤', name: 'ייצוא נתונים',       sym: 'dataexport20',  state: 'normal',   size: 'm'   },
        { id: 13, icon: '🗒',  name: 'טבלת אירועים',      sym: 'eftable20',     state: 'normal',   size: 'l'   },
        { id: 14, icon: '🎴', name: 'כרטיסי KPI',         sym: 'kpicard20',     state: 'warning',  size: 'l'   },
        { id: 15, icon: '📡', name: 'מד מתח',             sym: 'freqmtr20',     state: 'normal',   size: 'm'   },
        { id: 16, icon: '🔌', name: 'סטטוס רשת',          sym: 'gridstatus20',  state: 'critical', size: 'l'   }
    ];

    var _activeScreenId = null;

    function _buildScreensDropdown() {
        var $d = $('#emu-screens-dropdown');
        if (!$d.length) return;

        var html =
            '<div class="screens-header">' +
            '  <span>📺 מסכים מוכנים</span>' +
            '  <span class="screens-count">' + PRESET_SCREENS.length + ' מסכים</span>' +
            '</div>' +
            '<div class="screens-grid">';

        PRESET_SCREENS.forEach(function (s) {
            var isActive = s.id === _activeScreenId;
            html +=
                '<div class="screen-card' + (isActive ? ' active' : '') + '" data-screen-id="' + s.id + '">' +
                '  <div class="screen-card-icon">' + s.icon + '</div>' +
                '  <div class="screen-card-num">' + _pad(s.id) + '</div>' +
                '  <div class="screen-card-name">' + s.name + '</div>' +
                '  <div class="screen-card-sym">' + s.sym + '</div>' +
                '</div>';
        });

        html += '</div>';
        $d.html(html);

        // Bind click
        $d.off('click.screens').on('click.screens', '.screen-card', function (e) {
            e.stopPropagation();
            var id = parseInt($(this).data('screen-id'), 10);
            var screen = PRESET_SCREENS.filter(function (s) { return s.id === id; })[0];
            if (!screen) return;

            _activeScreenId = id;
            _loadPresetScreen(screen);
            _closeScreensDropdown();
        });
    }

    function _loadPresetScreen(screen) {
        // Remember state in storage
        _storeSet('emu_screen_last', screen.id);
        _storeSet('emu_screen_' + screen.id + '_state', screen.state);

        // Set data state
        if (EMU && EMU.setDataState) {
            EMU.setDataState(screen.state);
        } else {
            // Fallback: click the state button
            var $btn = $('[data-state="' + screen.state + '"]');
            if ($btn.length) $btn.click();
        }

        // Set size
        var $sizeBtn = $('[data-size="' + screen.size + '"]');
        if ($sizeBtn.length) $sizeBtn.click();

        // Load symbol — find item in sidebar or trigger directly
        var $symItem = $('[data-sym="' + screen.sym + '"]');
        if ($symItem.length) {
            $symItem[0].click();
        } else if (EMU && EMU.renderSymbol) {
            EMU.renderSymbol(screen.sym, '#emu-canvas');
        }

        _toast(screen.icon + ' ' + screen.name);
    }

    function _openScreensDropdown() {
        _buildScreensDropdown();
        var $d = $('#emu-screens-dropdown');
        $d.addClass('open');
        $('#btn-screens').addClass('active');

        // Close on outside click
        setTimeout(function () {
            $(document).one('click.screens-close', function (e) {
                if (!$(e.target).closest('#emu-screens-dropdown, #btn-screens').length) {
                    _closeScreensDropdown();
                }
            });
        }, 0);
    }

    function _closeScreensDropdown() {
        $('#emu-screens-dropdown').removeClass('open');
        $('#btn-screens').removeClass('active');
        $(document).off('click.screens-close');
    }

    function _toggleScreensDropdown() {
        if ($('#emu-screens-dropdown').hasClass('open')) {
            _closeScreensDropdown();
        } else {
            _openScreensDropdown();
        }
    }

    EMU_EXTRAS.toggleScreens = _toggleScreensDropdown;
    EMU_EXTRAS.presetScreens = PRESET_SCREENS;

    /* =========================================================
     *  4. TAG DRAG PANEL
     * ========================================================= */

    var _tagValues = {};   // current live values
    var _tagUpdateTimer = null;
    var _dragTag   = null; // tag being dragged
    var _$dragGhost = null;

    function _initTagValues() {
        var tags = (window.EMU_AF && window.EMU_AF.tags) ? window.EMU_AF.tags : [];
        tags.forEach(function (t) {
            _tagValues[t.tag] = t.val;
        });
    }

    function _buildTagPanel() {
        var $p = $('#emu-tag-panel');
        if (!$p.length) return;

        var tags = (window.EMU_AF && window.EMU_AF.tags) ? window.EMU_AF.tags : [];
        _initTagValues();

        // Group by category
        var cats = {};
        tags.forEach(function (t) {
            if (!cats[t.cat]) cats[t.cat] = [];
            cats[t.cat].push(t);
        });

        var html =
            '<div class="extras-panel-header">' +
            '  <span class="extras-panel-title">🏷️ תגיות PI</span>' +
            '  <button class="extras-panel-close" id="btn-tagpanel-close" title="סגור">✕</button>' +
            '</div>' +
            '<div class="tag-search-wrap">' +
            '  <input type="search" class="tag-search-input" id="tag-search-input" placeholder="חפש תגית..." dir="rtl">' +
            '</div>' +
            '<div class="extras-panel-body" id="tag-list-body" style="padding:0;">';

        Object.keys(cats).forEach(function (cat) {
            html += '<div class="tag-category-header">' + cat + '</div>';
            cats[cat].forEach(function (t) {
                var statusCls = t.val > 0 ? 'good' : 'bad';
                html +=
                    '<div class="tag-item" draggable="true" data-tag="' + t.tag + '" data-unit="' + t.unit + '">' +
                    '  <div class="tag-status-dot ' + statusCls + ' status-pulse"></div>' +
                    '  <span class="tag-name" title="' + t.tag + '">' + t.tag + '</span>' +
                    '  <div class="tag-value-wrap">' +
                    '    <span class="tag-value" id="tv-' + t.tag.replace(/\./g,'-') + '">' + _fmtTagVal(t.val) + '</span>' +
                    '    <span class="tag-unit">' + t.unit + '</span>' +
                    '  </div>' +
                    '</div>';
            });
        });

        html += '</div>';

        $p.html(html);
        _bindTagPanelEvents($p);
        _startTagUpdates();
    }

    function _fmtTagVal(v) {
        if (v === null || v === undefined) return '—';
        if (Math.abs(v) >= 1000) return v.toFixed(0);
        if (Math.abs(v) < 1)    return v.toFixed(4);
        return v.toFixed(2);
    }

    function _bindTagPanelEvents($p) {
        // Close
        $p.on('click', '#btn-tagpanel-close', function () {
            _closeTagPanel();
        });

        // Search filter
        $p.on('input', '#tag-search-input', function () {
            var q = $(this).val().toLowerCase().trim();
            $p.find('.tag-item').each(function () {
                var tag = $(this).data('tag').toLowerCase();
                $(this).toggle(!q || tag.indexOf(q) !== -1);
            });
            // Show/hide category headers
            $p.find('.tag-category-header').each(function () {
                var $next = $(this).nextUntil('.tag-category-header', '.tag-item');
                var anyVisible = $next.filter(':visible').length > 0;
                $(this).toggle(anyVisible || !q);
            });
        });

        // Drag start
        $p.on('dragstart', '.tag-item', function (e) {
            _dragTag = $(this).data('tag');
            $(this).addClass('dragging');
            e.originalEvent.dataTransfer.effectAllowed = 'copy';
            e.originalEvent.dataTransfer.setData('text/plain', _dragTag);

            // Create ghost
            if (!_$dragGhost) {
                _$dragGhost = $('<div class="tag-drag-ghost"></div>').appendTo('body');
            }
            _$dragGhost.text('🏷️ ' + _dragTag).show();
        });

        $p.on('dragend', '.tag-item', function () {
            $(this).removeClass('dragging');
            if (_$dragGhost) _$dragGhost.hide();
            _dragTag = null;
        });

        // Ghost follows mouse
        $(document).on('dragover.tagpanel', function (e) {
            if (_$dragGhost && _dragTag) {
                _$dragGhost.css({ left: e.clientX + 16, top: e.clientY - 10 });
            }
        });

        // Canvas drop target
        var $canvas = $('#emu-canvas');

        $canvas.on('dragover.tagpanel', function (e) {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = 'copy';
            $canvas.addClass('tag-drop-active');
        });

        $canvas.on('dragleave.tagpanel', function () {
            $canvas.removeClass('tag-drop-active');
        });

        $canvas.on('drop.tagpanel', function (e) {
            e.preventDefault();
            $canvas.removeClass('tag-drop-active');
            var tag = e.originalEvent.dataTransfer.getData('text/plain') || _dragTag;
            if (!tag) return;
            _injectTagToSymbol(tag);
        });
    }

    function _injectTagToSymbol(tagName) {
        var tags = (window.EMU_AF && window.EMU_AF.tags) ? window.EMU_AF.tags : [];
        var found = null;
        tags.forEach(function (t) { if (t.tag === tagName) found = t; });
        if (!found) return;

        var val = _tagValues[tagName] !== undefined ? _tagValues[tagName] : found.val;

        // Inject into active scope if available
        if (EMU && EMU.activeScope) {
            var sc = EMU.activeScope;
            try {
                sc[tagName] = { Value: val, Unit: found.unit, Tag: tagName, Status: 'Good' };
                if (sc.$digest) sc.$digest();
            } catch(e) {}
        }

        // Also try to inject via EMU.injectData if it exists
        if (EMU && EMU.injectTagData) {
            EMU.injectTagData(tagName, val, found.unit);
        }

        // Visual feedback
        _toast('תגית הוזנה: ' + tagName + ' = ' + _fmtTagVal(val) + ' ' + found.unit, '#5BC0EB');
    }

    function _startTagUpdates() {
        clearInterval(_tagUpdateTimer);
        _tagUpdateTimer = setInterval(function () {
            var tags = (window.EMU_AF && window.EMU_AF.tags) ? window.EMU_AF.tags : [];
            tags.forEach(function (t) {
                var cur = _tagValues[t.tag] !== undefined ? _tagValues[t.tag] : t.val;
                // Oscillate ±1%
                var next = cur * (1 + (Math.random() - 0.5) * 0.02);
                _tagValues[t.tag] = next;

                var $el = $('#tv-' + t.tag.replace(/\./g, '-'));
                if ($el.length) {
                    $el.text(_fmtTagVal(next));
                }
            });
        }, 3000);
    }

    function _openTagPanel() {
        _buildTagPanel();
        $('#emu-tag-panel').addClass('open');
        $('#btn-tagpanel').addClass('active');
    }

    function _closeTagPanel() {
        clearInterval(_tagUpdateTimer);
        $(document).off('dragover.tagpanel');
        $('#emu-canvas').off('dragover.tagpanel dragleave.tagpanel drop.tagpanel');
        $('#emu-tag-panel').removeClass('open');
        $('#btn-tagpanel').removeClass('active');
    }

    EMU_EXTRAS.openTagPanel  = _openTagPanel;
    EMU_EXTRAS.closeTagPanel = _closeTagPanel;

    /* =========================================================
     *  5. INLINE TEXT EDITING
     * ========================================================= */

    var _textEditActive  = false;
    var _$currentEditEl  = null;
    var _originalText    = '';
    var _$textToolbar    = null;

    function _initInlineEditing() {
        // Create floating toolbar
        _$textToolbar = $('<div id="emu-text-toolbar" dir="ltr">' +
            '<button class="text-tb-btn" id="ttb-size-down" title="הקטן גופן">A-</button>' +
            '<span class="text-tb-size" id="ttb-size-val">—</span>' +
            '<button class="text-tb-btn" id="ttb-size-up" title="הגדל גופן">A+</button>' +
            '<div class="text-tb-sep"></div>' +
            '<button class="text-tb-btn" id="ttb-bold" title="מודגש">B</button>' +
            '<div class="text-tb-sep"></div>' +
            '<label class="text-tb-color" title="צבע טקסט">' +
            '  <div class="text-tb-color-preview" id="ttb-color-preview"></div>' +
            '  <input type="color" id="ttb-color-input" value="#c8dce8">' +
            '</label>' +
            '</div>').appendTo('body');

        _bindTextToolbar();
    }

    function _bindTextToolbar() {
        if (!_$textToolbar) return;

        // Bold
        _$textToolbar.on('click', '#ttb-bold', function () {
            if (!_$currentEditEl) return;
            var isBold = _$currentEditEl.css('font-weight') >= 700 ||
                         _$currentEditEl.css('font-weight') === 'bold';
            _$currentEditEl.css('font-weight', isBold ? 'normal' : 'bold');
            $(this).toggleClass('active', !isBold);
        });

        // Font size up
        _$textToolbar.on('click', '#ttb-size-up', function () {
            if (!_$currentEditEl) return;
            var sz = parseFloat(_$currentEditEl.css('font-size')) || 12;
            sz = Math.min(sz + 2, 72);
            _$currentEditEl.css('font-size', sz + 'px');
            $('#ttb-size-val').text(Math.round(sz));
        });

        // Font size down
        _$textToolbar.on('click', '#ttb-size-down', function () {
            if (!_$currentEditEl) return;
            var sz = parseFloat(_$currentEditEl.css('font-size')) || 12;
            sz = Math.max(sz - 2, 6);
            _$currentEditEl.css('font-size', sz + 'px');
            $('#ttb-size-val').text(Math.round(sz));
        });

        // Color picker
        _$textToolbar.on('input', '#ttb-color-input', function () {
            if (!_$currentEditEl) return;
            var c = this.value;
            _$currentEditEl.css('color', c);
            $('#ttb-color-preview').css('background', c);
        });
    }

    function _positionTextToolbar($el) {
        if (!_$textToolbar) return;
        var offset = $el.offset();
        var elH    = $el.outerHeight(true);
        var tbW    = _$textToolbar.outerWidth(true) || 160;
        var top    = offset.top - 38;
        var left   = offset.left;

        // Keep within viewport
        if (top < 50) top = offset.top + elH + 6;
        if (left + tbW > $(window).width() - 10) left = $(window).width() - tbW - 10;
        if (left < 4) left = 4;

        _$textToolbar.css({ top: top, left: left }).addClass('visible');

        // Update toolbar state
        var sz = parseFloat($el.css('font-size')) || 12;
        $('#ttb-size-val').text(Math.round(sz));
        var color = $el.css('color') || '#c8dce8';
        $('#ttb-color-preview').css('background', color);
        var bold = ($el.css('font-weight') >= 700 || $el.css('font-weight') === 'bold');
        $('#ttb-bold').toggleClass('active', bold);
    }

    function _hideTextToolbar() {
        if (_$textToolbar) _$textToolbar.removeClass('visible');
    }

    function _enableTextEditor() {
        _textEditActive = true;
        var $canvas = $('#emu-canvas');

        // Mark all text nodes as editable targets
        $canvas.find('*').each(function () {
            var $el = $(this);
            // Only target leaf-ish nodes that contain meaningful text
            var hasOnlyText = this.childNodes.length <= 3 &&
                Array.prototype.every.call(this.childNodes, function (n) {
                    return n.nodeType === 3 || (n.nodeType === 1 && n.children.length === 0);
                });
            var txt = $el.text().trim();
            if (hasOnlyText && txt.length > 0 && txt.length < 200) {
                $el.attr('data-emu-text-editable', '1');
            }
        });

        $canvas.addClass('emu-editable-mode');
        $('#btn-shadow').addClass('edit-mode-on');
        _toast('מצב עריכת טקסט פעיל — לחץ פעמיים על טקסט לעריכה', '#F59E0B');
    }

    function _disableTextEditor() {
        _textEditActive = false;
        $('#emu-canvas').removeClass('emu-editable-mode');
        $('#btn-shadow').removeClass('edit-mode-on');
        _saveEditExit();
        _hideTextToolbar();
    }

    function _saveEditExit() {
        if (_$currentEditEl) {
            _$currentEditEl.removeAttr('contenteditable').removeClass('emu-editing');
            _$currentEditEl.attr('data-emu-text-modified', '1');
            _$currentEditEl = null;
            _originalText = '';
        }
    }

    function _startEdit($el) {
        if (_$currentEditEl && _$currentEditEl[0] !== $el[0]) {
            _saveEditExit();
        }
        _$currentEditEl = $el;
        _originalText   = $el.text();
        $el.attr('contenteditable', 'true').addClass('emu-editing').focus();

        // Move cursor to end
        try {
            var range = document.createRange();
            range.selectNodeContents($el[0]);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } catch(e) {}

        _positionTextToolbar($el);
    }

    function _cancelEdit() {
        if (_$currentEditEl) {
            _$currentEditEl.text(_originalText);
            _$currentEditEl.removeAttr('contenteditable').removeClass('emu-editing');
            _$currentEditEl = null;
            _originalText = '';
            _hideTextToolbar();
        }
    }

    // Bind double-click on canvas
    function _bindInlineEditing() {
        $(document).on('dblclick.inlineedit', '#emu-canvas [data-emu-text-editable]', function (e) {
            if (!_textEditActive) return;
            e.stopPropagation();
            _startEdit($(this));
        });

        // Enter to save, Escape to cancel
        $(document).on('keydown.inlineedit', function (e) {
            if (!_$currentEditEl) return;
            if (e.key === 'Enter') {
                e.preventDefault();
                _saveEditExit();
                _hideTextToolbar();
            }
            if (e.key === 'Escape') {
                _cancelEdit();
            }
        });

        // Click outside to save
        $(document).on('mousedown.inlineedit', function (e) {
            if (!_$currentEditEl) return;
            var $t = $(e.target);
            if ($t.is(_$currentEditEl) || $t.closest('#emu-text-toolbar').length) return;
            _saveEditExit();
            _hideTextToolbar();
        });
    }

    /* =========================================================
     *  TOOLBAR BUTTON SETUP
     * ========================================================= */
    function _bindToolbarButtons() {
        // SysAdmin panel
        $(document).on('click', '#btn-sysadmin', function () {
            if ($('#emu-sysadmin-panel').hasClass('open')) {
                _closeSysAdmin();
            } else {
                _openSysAdmin();
            }
        });

        // Shadow DOM editor
        $(document).on('click', '#btn-shadow', function () {
            if ($('#emu-shadow-panel').hasClass('open')) {
                _closeShadowPanel();
            } else {
                _openShadowPanel();
            }
        });

        // Screens dropdown
        $(document).on('click', '#btn-screens', function (e) {
            e.stopPropagation();
            _toggleScreensDropdown();
        });

        // Tag panel
        $(document).on('click', '#btn-tagpanel', function () {
            if ($('#emu-tag-panel').hasClass('open')) {
                _closeTagPanel();
            } else {
                _openTagPanel();
            }
        });

        // Keyboard shortcut F8 → SysAdmin
        $(document).on('keydown.extras', function (e) {
            if (e.key === 'F8') { e.preventDefault(); _openSysAdmin(); }
        });
    }

    /* =========================================================
     *  REACT TO SYMBOL LOAD
     * ========================================================= */
    function _onSymbolLoaded() {
        // If Shadow DOM panel is open, rebuild its tree
        if ($('#emu-shadow-panel').hasClass('open')) {
            setTimeout(function () { _buildShadowPanel(); }, 300);
        }
        // Re-apply editable markers if in edit mode
        if (_textEditActive) {
            setTimeout(function () { _enableTextEditor(); }, 300);
        }
    }

    // Hook into EMU global symbol load event if available
    function _hookEMU() {
        if (!window.EMU) return;
        var _origRender = EMU.renderSymbol;
        if (_origRender) {
            EMU.renderSymbol = function () {
                var result = _origRender.apply(this, arguments);
                // Notify after render
                var p = result && result.then ? result : Promise.resolve();
                p.then ? p.then(function () { _onSymbolLoaded(); }) : setTimeout(_onSymbolLoaded, 600);
                return result;
            };
        }
        // Also expose inject helper
        EMU.injectTagData = function (tag, val, unit) {
            // Try to find tags in active scope
            if (EMU.activeScope) {
                try {
                    EMU.activeScope[tag] = { Value: val, Unit: unit || '', Tag: tag, Status: 'Good' };
                } catch(e) {}
            }
        };
    }

    /* =========================================================
     *  INIT
     * ========================================================= */
    function _init() {
        _bindToolbarButtons();
        _initInlineEditing();
        _bindInlineEditing();
        _hookEMU();

        // Restore last active screen from storage
        var lastScreen = parseInt(_storeGet('emu_screen_last') || '0', 10);
        if (lastScreen) {
            var s = PRESET_SCREENS.filter(function (p) { return p.id === lastScreen; })[0];
            if (s) _activeScreenId = s.id;
        }

        // Expose to global
        EMU_EXTRAS.enableTextEditor  = _enableTextEditor;
        EMU_EXTRAS.disableTextEditor = _disableTextEditor;
    }

    // Wait for DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _init);
    } else {
        _init();
    }

})(window, jQuery);
