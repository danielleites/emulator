(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Action Hub — WOW v100
     * ═══════════════════════════════════════════════════════
     *  Two-way data entry for PI Vision:
     *  - Optimistic UI (instant feedback, zero blocking)
     *  - Vanilla JS input (no ng-model, no $digest overhead)
     *  - Native Fetch API (credentials: 'include' for Kerberos)
     *  - Write Queue + Retry (resilient on weak networks)
     *  - Real-time Input Validation (as-you-type)
     *  - Micro-interactions (button morphing + form flash)
     *  - Smart onDataUpdate (never overwrites user typing)
     *  - Permission-aware (Feature Toggling by PI Permissions)
     *
     *  Shadow DOM isolation · Hebrew RTL · wc20 config
     *  0 Angular bindings · 0ms keystroke latency
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    /* ── Executive Palette ── */
    var CLR = {
        ok:      '#00F5D4',
        warn:    '#FFCC00',
        crit:    '#FF3B30',
        accent:  '#5BC0EB',
        text:    '#ECF0F1',
        muted:   '#8899AA'
    };

    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var self   = this;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-eventwriter-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-eh-root-mount');
        if (!mountEl) {
            console.error('[WOW Action Hub] Mount element .wow-eh-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-eventwriter-wow.css';
        shadow.appendChild(linkEl);


        /* ═══ DOM Scaffold ═══ */
        function _el(tag, cls) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            return e;
        }

        /* ── Toolbar ── */
        var root       = _el('div', 'wow-eh-root');
        var toolbar    = _el('div', 'wow-eh-toolbar');
        var titleEl    = _el('span', 'wow-eh-title');
        var actions    = _el('div', 'wow-eh-toolbar-actions');

        var btnRetry   = _el('button', 'wow-eh-btn wow-eh-retry-btn');
        btnRetry.textContent = '\uD83D\uDD04 Retry';
        btnRetry.style.display = 'none';

        var queueBadge = _el('span', 'wow-eh-queue-badge');
        queueBadge.style.display = 'none';

        actions.appendChild(queueBadge);
        actions.appendChild(btnRetry);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        /* ── Stats Bar ── */
        var statsBar = _el('div', 'wow-eh-stats');

        /* ── Form Card (Glassmorphism) ── */
        var formCard = _el('div', 'wow-eh-form');

        /* Current value display */
        var currentRow   = _el('div', 'wow-eh-current');
        var currentLabel = _el('span', 'wow-eh-current-label');
        currentLabel.textContent = '\u05E2\u05E8\u05DA \u05E0\u05D5\u05DB\u05D7\u05D9:';
        var currentValue = _el('span', 'wow-eh-current-value');
        currentValue.textContent = '\u2014';
        currentRow.appendChild(currentLabel);
        currentRow.appendChild(currentValue);

        /* Input row: input + submit button */
        var inputRow  = _el('div', 'wow-eh-input-row');
        var inputField = document.createElement('input');
        inputField.className = 'wow-eh-input';
        inputField.type = 'text';
        inputField.autocomplete = 'off';
        inputField.spellcheck = false;
        inputField.placeholder = '\u05D4\u05D6\u05DF \u05E2\u05E8\u05DA \u05D7\u05D3\u05E9...';

        var submitBtn = _el('button', 'wow-eh-submit');
        submitBtn.textContent = 'Update';

        inputRow.appendChild(inputField);
        inputRow.appendChild(submitBtn);

        /* Validation message */
        var validationMsg = _el('div', 'wow-eh-validation');

        formCard.appendChild(currentRow);
        formCard.appendChild(inputRow);
        formCard.appendChild(validationMsg);

        /* ── Permission Lock Overlay ── */
        var lockOverlay = _el('div', 'wow-eh-lock');
        lockOverlay.innerHTML = '\uD83D\uDD12 \u05D0\u05D9\u05DF \u05D4\u05E8\u05E9\u05D0\u05EA \u05DB\u05EA\u05D9\u05D1\u05D4';
        lockOverlay.style.display = 'none';
        formCard.appendChild(lockOverlay);

        /* ── History ── */
        var historyWrap  = _el('div', 'wow-eh-history');
        var historyTitle = _el('div', 'wow-eh-history-title');
        historyTitle.textContent = '\u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D9\u05EA \u05DB\u05EA\u05D9\u05D1\u05D5\u05EA';
        var historyList  = _el('div', 'wow-eh-history-list');
        historyWrap.appendChild(historyTitle);
        historyWrap.appendChild(historyList);

        /* ── Skeleton ── */
        var skeleton = _el('div', 'wow-eh-skeleton');

        /* ── Footer ── */
        var footer = _el('div', 'wow-eh-footer');
        footer.textContent = 'WOW Action Hub v100 \u00B7 Optimistic UI + Background Sync';

        /* Assemble */
        root.appendChild(toolbar);
        root.appendChild(statsBar);
        root.appendChild(formCard);
        root.appendChild(historyWrap);
        root.appendChild(skeleton);
        root.appendChild(footer);
        shadow.appendChild(root);


        /* ═══ State ═══ */
        var isSubmitting       = false;
        var writeQueue         = [];
        var writeHistory       = [];
        var hasWritePermission = true;
        var currentVal         = null;
        var totalWrites        = 0;
        var successCount       = 0;
        var errorCount         = 0;
        var demoInterval       = null;
        var _pendingData       = null;
        var _dataDebounceId    = null;
        var DATA_DEBOUNCE_MS   = 100;


        /* ═══ Helpers ═══ */
        function _pad2(n) { return n < 10 ? '0' + n : '' + n; }

        function _timeStr(ts) {
            var d = new Date(ts);
            return _pad2(d.getHours()) + ':' +
                   _pad2(d.getMinutes()) + ':' +
                   _pad2(d.getSeconds());
        }


        /* ═══════════════════════════════════════════════════
         *  Real-Time Input Validation
         *  Red border appears AS the operator types
         *  — no waiting for submit click.
         * ═══════════════════════════════════════════════════ */
        function _validate(val) {
            if (!val || !val.trim()) {
                return { valid: false, msg: '' };  /* Empty = not invalid, just incomplete */
            }
            val = val.trim();

            var inputType = config.InputType || 'number';

            if (inputType === 'number') {
                var num = parseFloat(val);
                if (isNaN(num)) {
                    return { valid: false, msg: '\u05E2\u05E8\u05DA \u05DE\u05E1\u05E4\u05E8\u05D9 \u05D1\u05DC\u05D1\u05D3' };
                }
                var mn = config.MinValue;
                var mx = config.MaxValue;
                if (mn != null && !isNaN(mn) && num < mn) {
                    return { valid: false, msg: '\u05DE\u05EA\u05D7\u05EA \u05DC\u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD (' + mn + ')' };
                }
                if (mx != null && !isNaN(mx) && num > mx) {
                    return { valid: false, msg: '\u05DE\u05E2\u05DC \u05DC\u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD (' + mx + ')' };
                }
            }

            if (inputType === 'text') {
                var maxLen = config.MaxLength || 200;
                if (val.length > maxLen) {
                    return { valid: false, msg: '\u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD ' + maxLen + ' \u05EA\u05D5\u05D5\u05D9\u05DD' };
                }
            }

            return { valid: true, msg: '' };
        }


        /* ═══════════════════════════════════════════════════
         *  THE GEM: Vanilla JS Input Events
         *  Zero Angular $digest overhead on every keystroke.
         *  Native browser text input = 0ms latency.
         * ═══════════════════════════════════════════════════ */
        var _onInput = function () {
            var val = inputField.value;
            if (!val.trim()) {
                inputField.classList.remove('wow-eh-valid', 'wow-eh-invalid');
                validationMsg.textContent = '';
                validationMsg.className   = 'wow-eh-validation';
                submitBtn.disabled = !val.trim();
                return;
            }

            var result = _validate(val);
            inputField.classList.toggle('wow-eh-valid', result.valid);
            inputField.classList.toggle('wow-eh-invalid', !result.valid);
            validationMsg.textContent = result.msg;
            validationMsg.className   = 'wow-eh-validation' +
                                        (result.msg ? ' wow-eh-validation-show' : '');
            submitBtn.disabled = !result.valid || isSubmitting;
        };
        inputField.addEventListener('input', _onInput);

        /* Enter key submits */
        var _onKeydown = function (e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                _handleSubmit();
            }
        };
        inputField.addEventListener('keydown', _onKeydown);


        /* ═══════════════════════════════════════════════════
         *  THE GEM: Optimistic UI + Background Sync
         *  1. Validate instantly
         *  2. Button morphs to spinner (0ms feedback)
         *  3. fetch() fires asynchronously (non-blocking)
         *  4. On resolve: morph to ✓ / ✗
         *  5. Screen never freezes — 60fps throughout
         * ═══════════════════════════════════════════════════ */
        function _handleSubmit() {
            var val = inputField.value.trim();
            if (!val || isSubmitting) return;

            var validation = _validate(val);
            if (!validation.valid) {
                /* Shake animation on invalid submit attempt */
                inputField.classList.add('wow-eh-shake');
                setTimeout(function () {
                    inputField.classList.remove('wow-eh-shake');
                }, 400);
                return;
            }

            /* ── Immediate UI Lock (Optimistic) ── */
            isSubmitting      = true;
            inputField.disabled = true;
            submitBtn.disabled  = true;

            /* Button morphs to loading spinner */
            submitBtn.classList.add('wow-eh-loading');
            submitBtn.innerHTML = '<span class="wow-eh-spinner"></span>';

            /* ── Build PI Web API Payload ── */
            var numVal  = parseFloat(val);
            var payload = {
                Timestamp: config.WriteTimestamp || '*',
                Value:     isNaN(numVal) ? val : numVal,
                Good:      true
            };

            totalWrites++;

            /* ── Demo Mode: Simulate Write ── */
            if (config.DemoMode) {
                setTimeout(function () {
                    /* 90% success in demo */
                    if (Math.random() < 0.9) _showSuccess(val);
                    else _showError('\u05E9\u05D2\u05D9\u05D0\u05EA Demo');
                }, 600);
                return;
            }

            /* ── Real PI Web API Write ── */
            var apiBase = (config.PIWebApiUrl || '').replace(/\/+$/, '');
            var webId   = config.TargetWebId || '';

            if (!apiBase || !webId) {
                _showError('\u05D7\u05E1\u05E8 WebId \u05D0\u05D5 \u05DB\u05EA\u05D5\u05D1\u05EA API');
                return;
            }

            var url = apiBase + '/streams/' + webId + '/value';

            fetch(url, {
                method:  'POST',
                headers: {
                    'Content-Type':    'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include',   /* Kerberos/Windows Auth passthrough */
                body: JSON.stringify(payload)
            })
            .then(function (res) {
                if (res.ok || res.status === 202 || res.status === 204) {
                    _showSuccess(val);
                } else if (res.status === 401 || res.status === 403) {
                    _showError('\u05D0\u05D9\u05DF \u05D4\u05E8\u05E9\u05D0\u05D4 (HTTP ' + res.status + ')');
                    _disablePermission();
                } else {
                    throw new Error('HTTP ' + res.status);
                }
            })
            .catch(function (err) {
                _showError(err.message || 'Network Error');
                /* Add to retry queue */
                writeQueue.push({
                    payload: payload,
                    url:     url,
                    ts:      Date.now(),
                    val:     val
                });
                _updateQueueUI();
            });
        }

        submitBtn.addEventListener('click', _handleSubmit);


        /* ═══ UI State Transitions (Micro-interactions) ═══ */

        /**
         * Success: button morphs green ✓, form flashes, input clears.
         * The operator NEVER waits — feedback is instant.
         */
        function _showSuccess(val) {
            submitBtn.classList.remove('wow-eh-loading');
            submitBtn.classList.add('wow-eh-success');
            submitBtn.innerHTML = '\u2713 \u05E0\u05E9\u05DE\u05E8';

            /* Form card confirmation flash */
            formCard.classList.add('wow-eh-flash-ok');
            setTimeout(function () {
                formCard.classList.remove('wow-eh-flash-ok');
            }, 600);

            inputField.value = '';
            inputField.classList.remove('wow-eh-valid', 'wow-eh-invalid');
            validationMsg.textContent = '';
            validationMsg.className   = 'wow-eh-validation';

            successCount++;
            _addHistory(val, 'ok', '');
            _updateStats();

            setTimeout(_resetForm, 2000);
        }

        /**
         * Error: button morphs red ✗, stays visible longer.
         */
        function _showError(msg) {
            submitBtn.classList.remove('wow-eh-loading');
            submitBtn.classList.add('wow-eh-error');
            submitBtn.innerHTML = '\u2717 ' + (msg || '\u05E9\u05D2\u05D9\u05D0\u05D4');

            /* Form card error flash */
            formCard.classList.add('wow-eh-flash-err');
            setTimeout(function () {
                formCard.classList.remove('wow-eh-flash-err');
            }, 600);

            errorCount++;
            _addHistory(inputField.value.trim(), 'error', msg);
            _updateStats();

            setTimeout(_resetForm, 3000);
        }

        /**
         * Reset: button returns to "Update", input re-enabled, focus restored.
         * Continuous data entry flow — operator can type next value immediately.
         */
        function _resetForm() {
            submitBtn.className   = 'wow-eh-submit';
            submitBtn.textContent = 'Update';
            submitBtn.disabled    = false;
            inputField.disabled   = false;
            isSubmitting          = false;
            inputField.focus();
        }


        /* ═══ Write Queue + Retry ═══ */

        function _retryQueue() {
            if (writeQueue.length === 0) return;
            btnRetry.disabled = true;
            btnRetry.textContent = '\u23F3 Retrying...';

            var item = writeQueue[0];

            fetch(item.url, {
                method:  'POST',
                headers: {
                    'Content-Type':    'application/json',
                    'X-Requested-With': 'XMLHttpRequest'
                },
                credentials: 'include',
                body: JSON.stringify(item.payload)
            })
            .then(function (res) {
                if (res.ok || res.status === 202 || res.status === 204) {
                    writeQueue.shift();
                    errorCount--;
                    successCount++;
                    _updateQueueUI();
                    _updateStats();
                    /* Process next in queue */
                    if (writeQueue.length > 0) {
                        setTimeout(_retryQueue, 500);
                    }
                } else {
                    throw new Error('HTTP ' + res.status);
                }
            })
            .catch(function () {
                /* Still failing — leave in queue */
                _updateQueueUI();
            });
        }

        btnRetry.addEventListener('click', _retryQueue);

        function _updateQueueUI() {
            var n = writeQueue.length;
            btnRetry.style.display   = n > 0 ? '' : 'none';
            queueBadge.style.display = n > 0 ? '' : 'none';
            queueBadge.textContent   = n;
            btnRetry.disabled        = false;
            btnRetry.textContent     = '\uD83D\uDD04 Retry (' + n + ')';
        }


        /* ═══ Permission Handling ═══ */

        function _checkPermission() {
            if (config.DemoMode) return;
            var apiBase = (config.PIWebApiUrl || '').replace(/\/+$/, '');
            var webId   = config.TargetWebId || '';
            if (!apiBase || !webId) return;

            /* Lightweight HEAD request to check access */
            var url = apiBase + '/streams/' + webId + '/value';
            fetch(url, {
                method:      'GET',
                credentials: 'include'
            })
            .then(function (res) {
                /* If we can read, check for write via a dummy OPTIONS or rely on POST response */
                if (res.status === 401 || res.status === 403) {
                    _disablePermission();
                }
            })
            .catch(function () {
                /* Network issue — don't lock out, let POST handle it */
            });
        }

        function _disablePermission() {
            hasWritePermission     = false;
            inputField.disabled    = true;
            submitBtn.disabled     = true;
            submitBtn.textContent  = '\uD83D\uDD12';
            lockOverlay.style.display = 'flex';
        }


        /* ═══ History ═══ */

        function _addHistory(val, status, msg) {
            var limit = config.HistoryLimit || 10;
            writeHistory.unshift({
                val:    val,
                ts:     Date.now(),
                status: status,
                msg:    msg || ''
            });
            if (writeHistory.length > limit) writeHistory.pop();
            _renderHistory();
        }

        function _renderHistory() {
            if (config.ShowHistory === false) {
                historyWrap.style.display = 'none';
                return;
            }
            historyWrap.style.display = '';

            if (writeHistory.length === 0) {
                historyList.innerHTML = '<div class="wow-eh-history-empty">\u05D0\u05D9\u05DF \u05DB\u05EA\u05D9\u05D1\u05D5\u05EA \u05E2\u05D3\u05D9\u05D9\u05DF</div>';
                return;
            }

            var html = '';
            for (var i = 0; i < writeHistory.length; i++) {
                var h      = writeHistory[i];
                var icon   = h.status === 'ok' ? '\u2713' : '\u2717';
                var cls    = 'wow-eh-history-item wow-eh-history-' + h.status;
                var errTip = h.msg ? ' \u2014 ' + h.msg : '';
                html += '<div class="' + cls + '">' +
                        '<span class="wow-eh-hi-icon">' + icon + '</span>' +
                        '<span class="wow-eh-hi-val">' + h.val + '</span>' +
                        '<span class="wow-eh-hi-time">' + _timeStr(h.ts) + '</span>' +
                        (errTip ? '<span class="wow-eh-hi-err">' + errTip + '</span>' : '') +
                        '</div>';
            }
            historyList.innerHTML = html;
        }


        /* ═══ Stats Bar ═══ */

        function _updateStats() {
            var html = '';
            html += '<span class="wow-eh-stat">\u05DB\u05EA\u05D9\u05D1\u05D5\u05EA: <b>' + totalWrites + '</b></span>';
            if (successCount > 0) {
                html += '<span class="wow-eh-stat" style="color:' + CLR.ok +
                        '">\u05D4\u05E6\u05DC\u05D7\u05D5\u05EA: <b>' + successCount + '</b></span>';
            }
            if (errorCount > 0) {
                html += '<span class="wow-eh-stat" style="color:' + CLR.crit +
                        '">\u05E9\u05D2\u05D9\u05D0\u05D5\u05EA: <b>' + errorCount + '</b></span>';
            }
            if (writeQueue.length > 0) {
                html += '<span class="wow-eh-stat" style="color:' + CLR.warn +
                        '">\u05D1\u05EA\u05D5\u05E8: <b>' + writeQueue.length + '</b></span>';
            }
            statsBar.innerHTML = html;
        }


        /* ═══ Current Value Display ═══ */

        function _updateCurrentDisplay() {
            if (currentVal == null) {
                currentValue.textContent = '\u2014';
                return;
            }
            var unit = config.Unit || '';
            var dec  = config.Decimals != null ? config.Decimals : 1;
            var display;
            if (typeof currentVal === 'number' || !isNaN(parseFloat(currentVal))) {
                display = parseFloat(currentVal).toFixed(dec);
            } else {
                display = '' + currentVal;
            }
            if (unit) display += ' ' + unit;
            currentValue.textContent = display;
        }


        /* ═══ Config ═══ */

        function _applyConfig() {
            titleEl.textContent = config.Title || 'Executive Action Hub';

            var ff = config.fontFamily || 'Segoe UI';
            var fs = config.fontSize   || 12;
            root.style.setProperty('--wow-eh-font',     '"' + ff + '", Arial, sans-serif');
            root.style.setProperty('--wow-eh-font-size', fs + 'px');

            /* Input type hint */
            var inputType = config.InputType || 'number';
            if (inputType === 'number') {
                inputField.inputMode = 'decimal';
                inputField.pattern   = '[0-9.,\\-]*';
            } else {
                inputField.inputMode = 'text';
                inputField.pattern   = '';
            }

            /* Validation range hint in placeholder */
            if (inputType === 'number' && config.MinValue != null && config.MaxValue != null) {
                inputField.placeholder = config.MinValue + ' \u2013 ' + config.MaxValue +
                                         (config.Unit ? ' ' + config.Unit : '');
            }

            /* Current display label */
            var attrName = config.AttributeName || '';
            if (attrName) {
                currentLabel.textContent = attrName + ':';
            }

            _updateCurrentDisplay();
            _renderHistory();
        }

        ['Title', 'DemoMode', 'PIWebApiUrl', 'TargetWebId',
         'InputType', 'MinValue', 'MaxValue', 'Unit',
         'AttributeName', 'ShowHistory', 'HistoryLimit', 'Decimals',
         'fontFamily', 'fontSize'].forEach(function (key) {
            scope.$watch('config.' + key, function () { _applyConfig(); });
        });


        /* ═══ Demo Mode ═══ */

        function _startDemo() {
            skeleton.style.display = 'none';
            hasWritePermission = true;
            currentVal = 85.3;
            _updateCurrentDisplay();

            /* Simulate live value updates every 5 seconds */
            demoInterval = setInterval(function () {
                /* Only update if user isn't actively typing */
                if (document.activeElement !== inputField && !inputField.value) {
                    currentVal = 85 + Math.sin(Date.now() * 0.001) * 3;
                    currentVal = Math.round(currentVal * 10) / 10;
                    _updateCurrentDisplay();
                }
            }, 5000);

            /* Set demo validation range */
            if (config.MinValue == null) config.MinValue = 50;
            if (config.MaxValue == null) config.MaxValue = 120;
            if (!config.Unit)           config.Unit = '\u00B0C';
            if (!config.AttributeName)  config.AttributeName =
                '\u05D8\u05DE\u05E4\u05F3 \u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4';
            _applyConfig();
        }


        /* ═══════════════════════════════════════════════════
         *  THE GEM: Smart onDataUpdate
         *  Never overwrites user's typing. Updates the
         *  current-value display ONLY when input is idle.
         * ═══════════════════════════════════════════════════ */
        function _processData(data) {
            /* Handle both Single Value and Table formats */
            var val;
            if (data.Rows && data.Rows.length > 0) {
                val = data.Rows[0].Value;
            } else if (data.Value !== undefined) {
                val = data.Value;
            }
            if (val === undefined) return;

            skeleton.style.display = 'none';
            currentVal = val;

            /* Only update display if operator is NOT typing */
            if (document.activeElement !== inputField && !inputField.value) {
                _updateCurrentDisplay();
                inputField.placeholder = '\u05E2\u05E8\u05DA \u05E0\u05D5\u05DB\u05D7\u05D9: ' + val;
            }
        }

        self.onDataUpdate = function (data) {
            if (config.DemoMode) return;
            if (!data) return;

            _pendingData = data;

            /* Immediate on first data (remove skeleton fast) */
            if (skeleton.style.display !== 'none') {
                _processData(data);
                _pendingData = null;
                return;
            }

            /* Debounce subsequent rapid updates */
            if (!_dataDebounceId) {
                _dataDebounceId = setTimeout(function () {
                    _dataDebounceId = null;
                    if (_pendingData) {
                        _processData(_pendingData);
                        _pendingData = null;
                    }
                }, DATA_DEBOUNCE_MS);
            }
        };


        /* ═══ Init ═══ */
        _applyConfig();
        _updateStats();
        _renderHistory();

        if (config.DemoMode) {
            _startDemo();
        } else {
            _checkPermission();
        }


        /* ═══ Cleanup ═══ */
        scope.$on('$destroy', function () {
            if (demoInterval) clearInterval(demoInterval);
            clearTimeout(_dataDebounceId);
            submitBtn.removeEventListener('click', _handleSubmit);
            btnRetry.removeEventListener('click', _retryQueue);
            inputField.removeEventListener('input', _onInput);
            inputField.removeEventListener('keydown', _onKeydown);
            _pendingData = null;
            writeQueue   = null;
            writeHistory = null;
        });
    };


    /* ═══ Symbol Registration ═══ */
    PV.symbolCatalog.register({
        typeName:           'eventwriter-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05DE\u05E8\u05DB\u05D6 \u05E4\u05E2\u05D5\u05DC\u05D4 WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Single,
        getDefaultConfig: function () {
            return {
                DataShape:      'Value',
                Height:         350,
                Width:          400,
                Title:          'Executive Action Hub',
                DemoMode:       true,
                PIWebApiUrl:    '',
                TargetWebId:    '',
                AttributeName:  '',
                InputType:      'number',
                MinValue:       null,
                MaxValue:       null,
                Unit:           '',
                Decimals:       1,
                ShowHistory:    true,
                HistoryLimit:   10,
                WriteTimestamp: '*',
                fontFamily:     'Segoe UI',
                fontSize:       12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DE\u05E8\u05DB\u05D6 \u05E4\u05E2\u05D5\u05DC\u05D4 WOW'
    });

})(window.PIVisualization);
