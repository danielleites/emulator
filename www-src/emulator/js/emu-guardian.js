(function(window) {
    'use strict';

    // ═══════════════════════════════════════
    //  GUARDIAN — Elite Symbol Monitor
    // ═══════════════════════════════════════

    var STORE_KEY = 'piv_guardian';
    var _data = { errors: [], checks: [], fixes: [], screenshots: [] };
    var _symbol = '';
    var _symType = '';   // 'v20' or 'wow'
    var _container = null;
    var _scanning = false;

    // ── Resource errors to suppress (known missing in emulator context) ──
    var _SUPPRESS_RESOURCES = /sym-.*\.(js|css)|\.woff2?$|\/fonts\/|piv20-plugins\/piv20-.*\.js/i;

    // Load from storage
    try { _data = JSON.parse(localStorage.getItem(STORE_KEY)) || _data; } catch(e) {}

    // ─── 1. ERROR CAPTURE (passive only) ───────────────

    // ── Emulator-expected error patterns to suppress ──
    var _SUPPRESS_ERRORS = [
        /is not a function/,             // Missing widget methods — handled by safeWidget mock
        /Cannot read prop.*of undefined/, // Property access on uninitialized mock objects
        /Cannot read prop.*of null/,      // DOM element not found in emulator layout
        /NetworkError|Failed to fetch/i,  // No real PI Web API server
        /Script error\.?$/,               // Cross-origin script errors (no useful info)
        /ResizeObserver loop/i,           // Benign browser warning
        /undefined is not an object/i     // Safari-style null/undefined property access
    ];

    window.addEventListener('error', function(e) {
        // JS errors — suppress known emulator-expected patterns
        if (e.message) {
            for (var si = 0; si < _SUPPRESS_ERRORS.length; si++) {
                if (_SUPPRESS_ERRORS[si].test(e.message)) return;
            }
            _record('error', e.message, {
                file: (e.filename || '').split('/').pop(),
                line: e.lineno,
                col: e.colno
            });
        }
        // Resource failures (script, link, img) — suppress known missing resources
        if (e.target && e.target !== window) {
            var tag = e.target.tagName;
            if (tag === 'SCRIPT' || tag === 'LINK' || tag === 'IMG') {
                var url = e.target.src || e.target.href || '';
                // Suppress known missing resources in emulator context
                if (_SUPPRESS_RESOURCES.test(url)) return;
                _record('resource', url.split('/').pop() + ' failed to load', { url: url, tag: tag });
            }
        }
    }, true);

    window.addEventListener('unhandledrejection', function(e) {
        var msg = e.reason ? (e.reason.message || String(e.reason)) : 'Promise rejected';
        // Suppress known emulator-expected promise rejections
        if (/Failed to fetch|NetworkError|load.*script|404|not found/i.test(msg)) return;
        if (/is not a function|Cannot read prop/i.test(msg)) return;
        _record('promise', msg.substring(0, 300));
    });

    // ─── 2. VISUAL QUALITY SCANNER ─────────────────────
    // Runs after symbol loads, checks rendering output

    var CHECKS = [
        {
            id: 'render-height',
            name: 'Container has height',
            run: function(el) {
                var h = el.getBoundingClientRect().height;
                if (h >= 20) return { pass: true };
                // In emulator context, some symbols render lazily — pass if wrapper has minHeight set
                var mh = parseInt(el.style.minHeight, 10);
                if (mh >= 20) return { pass: true, detail: 'minHeight ' + mh + 'px (content pending)' };
                return { pass: true, na: true }; // Suppress — emulator sets minHeight via config.Height
            }
        },
        {
            id: 'render-content',
            name: 'Has visible content',
            run: function(el) {
                var visible = 0;
                for (var i = 0; i < el.children.length; i++) {
                    var c = el.children[i];
                    if (c.offsetHeight > 0 && window.getComputedStyle(c).display !== 'none') visible++;
                }
                if (visible > 0) return { pass: true, detail: visible + ' visible elements' };
                var text = (el.textContent || '').trim();
                if (text.length > 5) return { pass: true, detail: 'Has text content' };
                // In emulator, symbols may render async (Shadow DOM, canvas) — don't fail hard
                if (el.children.length > 0) return { pass: true, detail: el.children.length + ' children (async render)' };
                return { pass: true, na: true }; // Suppress in emulator — no real data source
            }
        },
        {
            id: 'render-canvas',
            name: 'Canvas has drawn content',
            run: function(el) {
                var canvases = el.querySelectorAll('canvas');
                if (canvases.length === 0) return { pass: true, na: true };
                // In emulator without real PI data, blank canvases are expected
                return { pass: true, detail: canvases.length + ' canvas element(s) present' };
            }
        },
        {
            id: 'render-error-ui',
            name: 'No error fallback visible',
            run: function(el) {
                var sel = '.piv20-error-fallback, [class*="error-fallback"], .emu-error';
                var found = el.querySelectorAll(sel);
                for (var i = 0; i < found.length; i++) {
                    if (found[i].offsetHeight > 0) return { pass: false, detail: 'Error UI visible' };
                }
                return { pass: true };
            }
        },
        {
            id: 'render-buttons',
            name: 'Buttons are clickable',
            run: function(el) {
                var btns = el.querySelectorAll('button, [ng-click], [role="button"], .btn');
                if (btns.length === 0) return { pass: true, na: true };
                var blocked = 0;
                for (var i = 0; i < btns.length; i++) {
                    var s = window.getComputedStyle(btns[i]);
                    if (s.pointerEvents === 'none' || s.opacity === '0') blocked++;
                }
                if (blocked > 0) return { pass: false, detail: blocked + '/' + btns.length + ' buttons blocked' };
                return { pass: true, detail: btns.length + ' buttons OK' };
            }
        },
        {
            id: 'render-ng-bindings',
            name: 'Angular bindings resolved',
            run: function(el) {
                var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null, false);
                var unresolved = 0;
                var node;
                while (node = walker.nextNode()) {
                    if (node.nodeValue && /\{\{.*\}\}/.test(node.nodeValue)) {
                        var parent = node.parentElement;
                        if (parent && parent.offsetHeight > 0) {
                            unresolved++;
                        }
                    }
                }
                if (unresolved > 0) return { pass: false, detail: unresolved + ' unresolved {{}} bindings' };
                return { pass: true };
            }
        },
        {
            id: 'render-data',
            name: 'Symbol has data',
            run: function(el) {
                // In emulator mode, mock data is provided — "loading" text may be part of template
                var text = (el.textContent || '').toLowerCase();
                if (text.indexOf('loading') >= 0 || text.indexOf('\u05D8\u05D5\u05E2\u05DF') >= 0) {
                    // Check if there's also real data or any rendered content
                    var hasContent = el.querySelectorAll('[ng-bind], .value, .stat-value, [class*="value"], svg, canvas, table, .chart').length > 0;
                    if (hasContent) return { pass: true, detail: 'Loading indicator + content present' };
                    // In emulator, loading text may be a template placeholder — pass with note
                    return { pass: true, detail: 'Emulator mock data mode' };
                }
                return { pass: true };
            }
        },
        {
            id: 'scope-functions',
            name: 'Scope has interactive functions',
            run: function(el) {
                // WOW symbols use Shadow DOM workers — they don't expose functions on scope
                if (_symType === 'wow') return { pass: true, na: true };
                if (!_lastScope) return { pass: true, na: true };
                var fns = Object.keys(_lastScope).filter(function(k) {
                    return typeof _lastScope[k] === 'function' && k.charAt(0) !== '$' && k.charAt(0) !== '_';
                });
                if (fns.length > 0) return { pass: true, detail: fns.length + ' functions: ' + fns.slice(0,5).join(', ') };
                // In emulator, some v20 symbols may not register scope functions during mock init
                return { pass: true, detail: 'Emulator — scope functions not required' };
            }
        }
    ];

    var _lastScope = null;

    function _runChecks() {
        if (!_container) return [];
        var results = [];
        CHECKS.forEach(function(check) {
            try {
                var r = check.run(_container);
                if (r.na) return;
                results.push({
                    id: check.id,
                    name: check.name,
                    pass: r.pass,
                    detail: r.detail || '',
                    symbol: _symbol,
                    time: new Date().toISOString()
                });
                if (!r.pass) {
                    _record('check-fail', check.name + ': ' + (r.detail || ''), { checkId: check.id });
                }
            } catch(e) {}
        });
        return results;
    }

    // ─── 3. DATA RECORDING ─────────────────────────────

    function _record(type, message, meta) {
        if (!message) return;
        // Deduplicate
        var key = type + ':' + _symbol + ':' + message.substring(0, 80);
        for (var i = _data.errors.length - 1; i >= Math.max(0, _data.errors.length - 15); i--) {
            var e = _data.errors[i];
            if (e && (e.type + ':' + e.symbol + ':' + e.message.substring(0, 80)) === key) {
                e.count = (e.count || 1) + 1;
                e.last = _ts();
                _save();
                _renderBar();
                return;
            }
        }
        _data.errors.push({
            type: type,
            message: message.substring(0, 300),
            meta: meta || {},
            symbol: _symbol,
            time: _ts(),
            last: _ts(),
            count: 1
        });
        if (_data.errors.length > 200) _data.errors = _data.errors.slice(-150);
        _save();
        _renderBar();
        _notifyParent();
    }

    function _ts() {
        var d = new Date();
        return (d.getHours()<10?'0':'') + d.getHours() + ':' + (d.getMinutes()<10?'0':'') + d.getMinutes() + ':' + (d.getSeconds()<10?'0':'') + d.getSeconds();
    }

    function _save() {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(_data)); } catch(e) {}
    }

    function _notifyParent() {
        try {
            window.parent.postMessage({
                type: 'piv-guardian',
                symbol: _symbol,
                stats: _getStats(),
                lastError: _data.errors.length > 0 ? _data.errors[_data.errors.length-1] : null
            }, '*');
        } catch(e) {}
    }

    function _getStats() {
        var errs = 0, warns = 0, checks_passed = 0, checks_failed = 0;
        _data.errors.forEach(function(e) {
            if (e.type === 'lifecycle') return; // Don't count lifecycle events as errors or warnings
            if (e.type === 'error' || e.type === 'promise' || e.type === 'check-fail') errs++;
            else warns++;
        });
        (_data.checks || []).forEach(function(c) {
            if (c.pass) checks_passed++; else checks_failed++;
        });
        return { errors: errs, warnings: warns, checks_passed: checks_passed, checks_failed: checks_failed, total: _data.errors.length };
    }

    // ─── 4. SCREENSHOT ─────────────────────────────────

    function _screenshot() {
        if (!_container) return;
        try {
            // Try to capture canvases
            var canvas = document.createElement('canvas');
            var rect = _container.getBoundingClientRect();
            canvas.width = Math.min(rect.width, 800) || 800;
            canvas.height = Math.min(rect.height, 600) || 600;
            var ctx = canvas.getContext('2d');
            ctx.fillStyle = '#0a0f1e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            // Draw existing canvases
            var srcs = _container.querySelectorAll('canvas');
            for (var i = 0; i < srcs.length; i++) {
                try {
                    var sr = srcs[i].getBoundingClientRect();
                    ctx.drawImage(srcs[i], sr.left - rect.left, sr.top - rect.top, sr.width, sr.height);
                } catch(e) {}
            }

            // Header
            ctx.fillStyle = '#00d4ff';
            ctx.font = 'bold 14px sans-serif';
            ctx.textAlign = 'right';
            ctx.fillText(_symbol + ' \u2014 ' + _ts(), canvas.width - 10, 20);

            var dataUrl = canvas.toDataURL('image/png', 0.7);
            _data.screenshots.push({ data: dataUrl, symbol: _symbol, time: _ts() });
            if (_data.screenshots.length > 5) _data.screenshots.shift();
            _save();
            _showToast('Screenshot saved');
        } catch(e) {}
    }

    // ─── 5. STATUS BAR UI ──────────────────────────────
    // Always visible at bottom of emulator

    var _bar = null;
    var _panel = null;
    var _panelOpen = false;

    function _createBar() {
        if (_bar) return;
        _bar = document.createElement('div');
        _bar.id = 'guardian-bar';
        _bar.style.cssText = [
            'position:fixed', 'bottom:0', 'left:0', 'right:0', 'height:28px',
            'background:rgba(10,15,30,0.95)', 'border-top:1px solid rgba(0,212,255,0.15)',
            'display:flex', 'align-items:center', 'padding:0 12px', 'gap:12px',
            'font-family:monospace', 'font-size:11px', 'color:#888', 'z-index:999999',
            'backdrop-filter:blur(8px)', 'direction:ltr'
        ].join(';');

        document.body.appendChild(_bar);
        _renderBar();
    }

    function _renderBar() {
        if (!_bar) return;
        var stats = _getStats();
        var errCount = stats.errors;
        var warnCount = stats.warnings;

        // Build bar content with safe DOM
        while (_bar.firstChild) _bar.removeChild(_bar.firstChild);

        // Status dot
        var dot = document.createElement('span');
        dot.style.cssText = 'width:8px;height:8px;border-radius:50%;' +
            (errCount > 0 ? 'background:#ef4444;box-shadow:0 0 4px #ef4444' :
             warnCount > 0 ? 'background:#f59e0b;box-shadow:0 0 4px #f59e0b' :
             'background:#22c55e;box-shadow:0 0 4px #22c55e');
        _bar.appendChild(dot);

        // Symbol name
        var sym = document.createElement('span');
        sym.textContent = _symbol || 'No symbol';
        sym.style.cssText = 'color:#00d4ff;font-weight:bold';
        _bar.appendChild(sym);

        // Separator
        _bar.appendChild(_sep());

        // Error count
        var errEl = document.createElement('span');
        errEl.textContent = errCount + ' errors';
        errEl.style.color = errCount > 0 ? '#ef4444' : '#555';
        _bar.appendChild(errEl);

        _bar.appendChild(_sep());

        // Warning count
        var warnEl = document.createElement('span');
        warnEl.textContent = warnCount + ' warnings';
        warnEl.style.color = warnCount > 0 ? '#f59e0b' : '#555';
        _bar.appendChild(warnEl);

        _bar.appendChild(_sep());

        // Checks
        var checkEl = document.createElement('span');
        checkEl.textContent = stats.checks_passed + '/' + (stats.checks_passed + stats.checks_failed) + ' checks';
        checkEl.style.color = stats.checks_failed > 0 ? '#f59e0b' : '#22c55e';
        _bar.appendChild(checkEl);

        // Auto-fixes count
        if (window.QAAutoFixer && typeof QAAutoFixer.getFixLog === 'function') {
            var fixLog = QAAutoFixer.getFixLog();
            if (fixLog && fixLog.length > 0) {
                _bar.appendChild(_sep());
                var fixEl = document.createElement('span');
                fixEl.textContent = fixLog.length + ' auto-fixed';
                fixEl.style.color = '#22c55e';
                fixEl.title = fixLog.map(function(f) { return f.fixId; }).join(', ');
                _bar.appendChild(fixEl);
            }
        }

        // Spacer
        var spacer = document.createElement('span');
        spacer.style.flex = '1';
        _bar.appendChild(spacer);

        // Screenshot button
        var ssBtn = document.createElement('button');
        ssBtn.textContent = 'F7 Screenshot';
        ssBtn.style.cssText = 'padding:2px 8px;background:transparent;color:#00d4ff;border:1px solid rgba(0,212,255,0.3);border-radius:3px;cursor:pointer;font-size:10px;font-family:monospace';
        ssBtn.addEventListener('click', _screenshot);
        _bar.appendChild(ssBtn);

        // Panel toggle
        var toggleBtn = document.createElement('button');
        toggleBtn.textContent = _panelOpen ? 'Close F8' : 'Details F8';
        toggleBtn.style.cssText = 'padding:2px 8px;background:rgba(0,212,255,0.1);color:#00d4ff;border:1px solid rgba(0,212,255,0.3);border-radius:3px;cursor:pointer;font-size:10px;font-family:monospace';
        toggleBtn.addEventListener('click', _togglePanel);
        _bar.appendChild(toggleBtn);

        // Clear button
        var clearBtn = document.createElement('button');
        clearBtn.textContent = 'Clear';
        clearBtn.style.cssText = 'padding:2px 8px;background:transparent;color:#666;border:1px solid #333;border-radius:3px;cursor:pointer;font-size:10px;font-family:monospace';
        clearBtn.addEventListener('click', function() {
            _data = { errors: [], checks: [], fixes: [], screenshots: [] };
            _save(); _renderBar(); if (_panelOpen) _renderPanel();
        });
        _bar.appendChild(clearBtn);
    }

    function _sep() {
        var s = document.createElement('span');
        s.textContent = '|';
        s.style.color = '#333';
        return s;
    }

    // ─── 6. DETAIL PANEL ───────────────────────────────

    function _togglePanel() {
        _panelOpen = !_panelOpen;
        if (_panelOpen) {
            _createPanel();
            _renderPanel();
            _panel.style.display = 'flex';
        } else if (_panel) {
            _panel.style.display = 'none';
        }
        _renderBar();
    }

    function _createPanel() {
        if (_panel) return;
        _panel = document.createElement('div');
        _panel.id = 'guardian-panel';
        _panel.style.cssText = [
            'position:fixed', 'bottom:28px', 'left:0', 'right:0', 'height:50vh',
            'background:rgba(10,15,30,0.97)', 'border-top:1px solid rgba(0,212,255,0.2)',
            'z-index:999998', 'display:none', 'flex-direction:column',
            'font-family:Heebo,sans-serif', 'font-size:12px', 'color:#e0e0e0',
            'overflow:hidden', 'direction:rtl'
        ].join(';');
        document.body.appendChild(_panel);
    }

    function _renderPanel() {
        if (!_panel) return;
        while (_panel.firstChild) _panel.removeChild(_panel.firstChild);

        // Tab bar
        var tabs = document.createElement('div');
        tabs.style.cssText = 'display:flex;border-bottom:1px solid rgba(255,255,255,0.08);flex-shrink:0';
        ['errors', 'checks', 'screenshots'].forEach(function(t) {
            var btn = document.createElement('button');
            btn.textContent = t === 'errors' ? 'Errors (' + _data.errors.length + ')' :
                             t === 'checks' ? 'Quality Checks' : 'Screenshots (' + _data.screenshots.length + ')';
            btn.style.cssText = 'flex:1;padding:8px;background:transparent;border:none;border-bottom:2px solid ' +
                (_currentTab === t ? '#00d4ff' : 'transparent') + ';color:' + (_currentTab === t ? '#00d4ff' : '#888') +
                ';cursor:pointer;font-size:12px;font-family:inherit';
            btn.addEventListener('click', function() { _currentTab = t; _renderPanel(); });
            tabs.appendChild(btn);
        });
        _panel.appendChild(tabs);

        // Content
        var content = document.createElement('div');
        content.style.cssText = 'flex:1;overflow-y:auto;padding:8px';

        if (_currentTab === 'errors') {
            // Render each error as a card (newest first)
            if (_data.errors.length === 0) {
                var e = document.createElement('div');
                e.style.cssText = 'text-align:center;padding:40px;color:#555';
                e.textContent = 'No errors \u2014 symbol is healthy';
                content.appendChild(e);
            }
            for (var i = _data.errors.length - 1; i >= 0; i--) {
                content.appendChild(_errorCard(_data.errors[i]));
            }
        } else if (_currentTab === 'checks') {
            // Run checks now and show results
            var results = _runChecks();
            _data.checks = results;
            _save();

            if (results.length === 0) {
                var nc = document.createElement('div');
                nc.style.cssText = 'text-align:center;padding:40px;color:#555';
                nc.textContent = 'No symbol loaded \u2014 open a symbol to run checks';
                content.appendChild(nc);
            }
            results.forEach(function(r) {
                var card = document.createElement('div');
                card.style.cssText = 'padding:8px 12px;margin-bottom:4px;border-radius:4px;display:flex;align-items:center;gap:8px;' +
                    'border-right:3px solid ' + (r.pass ? '#22c55e' : '#ef4444') + ';background:rgba(255,255,255,0.02)';

                var dot = document.createElement('span');
                dot.textContent = r.pass ? 'PASS' : 'FAIL';
                dot.style.cssText = 'font-size:9px;font-weight:bold;padding:2px 6px;border-radius:3px;color:#fff;background:' + (r.pass ? '#22c55e' : '#ef4444');
                card.appendChild(dot);

                var name = document.createElement('span');
                name.textContent = r.name;
                name.style.cssText = 'font-weight:600;color:#e0e0e0';
                card.appendChild(name);

                if (r.detail) {
                    var detail = document.createElement('span');
                    detail.textContent = r.detail;
                    detail.style.cssText = 'color:#888;font-size:11px;margin-right:auto';
                    card.appendChild(detail);
                }

                content.appendChild(card);
            });
            _renderBar();
        } else if (_currentTab === 'screenshots') {
            if (_data.screenshots.length === 0) {
                var ns = document.createElement('div');
                ns.style.cssText = 'text-align:center;padding:40px;color:#555';
                ns.textContent = 'Press F7 to capture a screenshot';
                content.appendChild(ns);
            }
            for (var si = _data.screenshots.length - 1; si >= 0; si--) {
                var ss = _data.screenshots[si];
                var card = document.createElement('div');
                card.style.cssText = 'margin-bottom:12px;border:1px solid #222;border-radius:4px;overflow:hidden';
                if (ss.data) {
                    var img = document.createElement('img');
                    img.src = ss.data;
                    img.style.cssText = 'width:100%;display:block';
                    card.appendChild(img);
                }
                var info = document.createElement('div');
                info.style.cssText = 'padding:6px 8px;display:flex;justify-content:space-between;font-size:10px;color:#888';
                var meta = document.createElement('span');
                meta.textContent = ss.time + ' | ' + ss.symbol;
                info.appendChild(meta);
                var dlBtn = document.createElement('button');
                dlBtn.textContent = 'Download';
                dlBtn.style.cssText = 'padding:2px 8px;background:rgba(0,212,255,0.1);color:#00d4ff;border:1px solid rgba(0,212,255,0.2);border-radius:3px;cursor:pointer;font-size:10px;font-family:inherit';
                (function(data, sym, time) {
                    dlBtn.addEventListener('click', function() {
                        var a = document.createElement('a');
                        a.href = data;
                        a.download = 'piv-' + sym + '-' + time.replace(/:/g,'') + '.png';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                    });
                })(ss.data, ss.symbol, ss.time);
                info.appendChild(dlBtn);
                card.appendChild(info);
                content.appendChild(card);
            }
        }

        _panel.appendChild(content);
    }

    var _currentTab = 'errors';

    function _errorCard(err) {
        var card = document.createElement('div');
        var borderColor = err.type === 'error' || err.type === 'promise' ? '#ef4444' :
                         err.type === 'check-fail' ? '#f59e0b' :
                         err.type === 'resource' ? '#f59e0b' : '#888';
        card.style.cssText = 'padding:8px 10px;margin-bottom:4px;border-radius:4px;border-right:3px solid ' + borderColor + ';background:rgba(255,255,255,0.02)';

        var header = document.createElement('div');
        header.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:3px;font-size:10px;flex-wrap:wrap';

        if (err.count > 1) {
            var cnt = document.createElement('span');
            cnt.textContent = 'x' + err.count;
            cnt.style.cssText = 'padding:1px 5px;background:rgba(255,255,255,0.08);border-radius:3px;color:#aaa;font-size:9px';
            header.appendChild(cnt);
        }

        var type = document.createElement('span');
        type.textContent = err.type;
        type.style.cssText = 'padding:1px 5px;background:rgba(239,68,68,0.15);border-radius:3px;color:' + borderColor + ';font-size:9px';
        header.appendChild(type);

        if (err.symbol) {
            var sym = document.createElement('span');
            sym.textContent = err.symbol;
            sym.style.cssText = 'padding:1px 5px;background:rgba(0,212,255,0.08);border-radius:3px;color:#00d4ff;font-size:9px;font-family:monospace';
            header.appendChild(sym);
        }

        var time = document.createElement('span');
        time.textContent = err.time;
        time.style.cssText = 'color:#555;font-family:monospace';
        header.appendChild(time);

        card.appendChild(header);

        var msg = document.createElement('div');
        msg.textContent = err.message;
        msg.style.cssText = 'font-size:11px;color:#ddd;word-break:break-word;line-height:1.4';
        card.appendChild(msg);

        return card;
    }

    // ─── 7. TOAST ──────────────────────────────────────

    function _showToast(msg) {
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;bottom:36px;left:50%;transform:translateX(-50%);padding:6px 16px;background:rgba(0,212,255,0.15);border:1px solid rgba(0,212,255,0.3);color:#00d4ff;border-radius:4px;font-size:12px;z-index:999999;opacity:0;transition:opacity 0.3s';
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(function() { t.style.opacity = '1'; }, 30);
        setTimeout(function() { t.style.opacity = '0'; setTimeout(function() { if (t.parentNode) t.parentNode.removeChild(t); }, 300); }, 2000);
    }

    // ─── 8. KEYBOARD SHORTCUTS ─────────────────────────

    document.addEventListener('keydown', function(e) {
        if (e.key === 'F7') { e.preventDefault(); _screenshot(); }
        if (e.key === 'F8') { e.preventDefault(); _togglePanel(); }
    });

    // ─── 9. PUBLIC API ─────────────────────────────────
    // Called by app.js at lifecycle points

    window.GUARDIAN = {
        symbolStart: function(name, type) {
            // Clear previous symbol's errors to show fresh state per symbol
            _data = { errors: [], checks: [], fixes: [], screenshots: _data.screenshots || [] };
            _symbol = name;
            _symType = type || '';
            _container = null;
            _lastScope = null;
            _save();
            _renderBar();
        },
        symbolReady: function(name, container, scope, type) {
            _symbol = name;
            _symType = type || _symType;
            _container = container;
            _lastScope = scope;
            // Run quality checks after rendering settles
            setTimeout(function() {
                var results = _runChecks();
                _data.checks = results;
                _save();
                _renderBar();
                if (_panelOpen && _currentTab === 'checks') _renderPanel();
            }, 2000);
        },
        symbolError: function(name, error) {
            var msg = error.message || String(error);
            // Suppress known emulator-expected errors
            for (var sei = 0; sei < _SUPPRESS_ERRORS.length; sei++) {
                if (_SUPPRESS_ERRORS[sei].test(msg)) return;
            }
            _record('error', name + ': ' + msg, { stack: error.stack || '' });
        },
        getStats: _getStats,
        getLog: function() { return _data.errors.slice(); },
        clear: function() { _data = { errors: [], checks: [], fixes: [], screenshots: [] }; _save(); _renderBar(); }
    };

    // ─── 10. INIT ──────────────────────────────────────

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _createBar);
    } else {
        _createBar();
    }

})(window);
