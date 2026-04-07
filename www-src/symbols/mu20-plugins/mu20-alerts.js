/**
 * ═══════════════════════════════════════════════════════
 *  mu20-alerts.js  —  ISA-18.2 Alert Engine Plugin (MU20)
 * ═══════════════════════════════════════════════════════
 *  5 threshold types, alert state machine (ACTIVE →
 *  ACKNOWLEDGED → CLEARED, + SHELVED branch),
 *  deduplication, history, grouping, push notifications.
 *
 *  Ported from mm20-alerts.js (jQuery → vanilla ES5).
 *  Version: ULT.1.4  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function () {
    'use strict';

    var MU = window.MU20;
    if (!MU) { console.error('[mu20-alerts] MU20 core not loaded'); return; }

    // ── ISA-18.2 Alert States ──
    var STATE = {
        ACTIVE:       'active',
        ACKNOWLEDGED: 'acknowledged',
        SHELVED:      'shelved',
        CLEARED:      'cleared'
    };

    // ── Threshold Rule Types ──
    var RULE = {
        QUOTA:   'quota',
        HOURS:   'hours',
        DAILY:   'dailyRate',
        STALE:   'stale',
        MONTHLY: 'monthlyLimit'
    };

    // ── Default options ──
    var DEFAULTS = {
        sites:         null,
        data:          null,
        api:           null,
        demoMode:      false,
        quotaPct:      90,          // quota % threshold
        hoursMax:      1000,        // max operating hours
        staleSec:      300,         // stale-data seconds
        dailyRate:     0,           // MW/h rate (0 = disabled)
        monthlyLimit:  0,           // monthly hours (0 = disabled)
        shelveMinutes: 60,
        historyMax:    50,
        soundEnabled:  false,
        pushEnabled:   false,
        groupBy:       'time'       // 'time' | 'site' | 'severity'
    };

    var DEDUP_WINDOW       = 60000;   // dedup window (ms)
    var HEARTBEAT_INTERVAL = 30000;   // heartbeat tick (ms)
    var MAX_ACTIVE         = 500;     // cap on active alerts


    // ═══════════════════════════════════════
    //  Constructor
    // ═══════════════════════════════════════

    /**
     * @param {ShadowRoot} shadowRoot
     * @param {HTMLElement} containerEl
     * @param {Object} options
     * @param {Object} bus
     */
    function Mu20Alerts(shadowRoot, containerEl, options, bus) {
        var self = this;
        self._shadow    = shadowRoot;
        self._container = containerEl;
        self._bus       = bus;
        self._destroyed = false;

        // Merge options with defaults
        self._opts = {};
        var key;
        for (key in DEFAULTS) {
            if (DEFAULTS.hasOwnProperty(key)) {
                self._opts[key] = DEFAULTS[key];
            }
        }
        if (options) {
            for (key in options) {
                if (options.hasOwnProperty(key)) {
                    self._opts[key] = options[key];
                }
            }
        }

        // Internal state
        self._active   = [];
        self._history  = [];
        self._dedup    = {};
        self._lastSeen = {};
        self._audioCtx = null;
        self._api      = self._opts.api || null;
        self._heartbeatHandle = null;

        // UI state
        self._viewActive = true;

        // DOM references
        self._countBadge  = null;
        self._listEl      = null;
        self._activeBtn   = null;
        self._historyBtn  = null;
        self._groupBtnsEl = null;
        self._groupBtnEls = null;

        try {
            self._mount();
        } catch (e) {
            MU.shield.log('alerts', 'constructor', e);
            MU.shield.renderFallback(self._container, 'alerts', e);
        }
    }


    // ═══════════════════════════════════════
    //  Mount DOM
    // ═══════════════════════════════════════

    Mu20Alerts.prototype._mount = function () {
        var self = this;
        var c = self._container;
        c.classList.add('mu20-alerts-root');

        // ── Header toolbar ──
        var toolbar = document.createElement('div');
        toolbar.className = 'mu20-toolbar';

        var titleSpan = document.createElement('span');
        titleSpan.style.fontWeight = '600';
        titleSpan.textContent = '\u05DE\u05E0\u05D5\u05E2 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA (ISA-18.2)';
        toolbar.appendChild(titleSpan);

        self._countBadge = document.createElement('span');
        self._countBadge.className = 'mu20-version-badge';
        self._countBadge.style.marginRight = '8px';
        self._countBadge.textContent = '0';
        toolbar.appendChild(self._countBadge);

        // ── Grouping buttons ──
        var groupBtns = document.createElement('span');
        groupBtns.className = 'mu20-alert-group-btns';
        self._groupBtnsEl = groupBtns;

        var groups = [
            { key: 'time',     label: '\u05D6\u05DE\u05DF' },
            { key: 'site',     label: '\u05D0\u05EA\u05E8' },
            { key: 'severity', label: '\u05D7\u05D5\u05DE\u05E8\u05D4' }
        ];
        self._groupBtnEls = [];

        for (var g = 0; g < groups.length; g++) {
            (function (grp) {
                var btn = document.createElement('button');
                btn.className = 'mu20-sort-btn';
                btn.textContent = grp.label;
                if (self._opts.groupBy === grp.key) btn.classList.add('mu20-tab--active');
                btn.addEventListener('click', function () {
                    self._opts.groupBy = grp.key;
                    for (var b = 0; b < self._groupBtnEls.length; b++) {
                        self._groupBtnEls[b].classList.remove('mu20-tab--active');
                    }
                    btn.classList.add('mu20-tab--active');
                    self._renderAll();
                });
                self._groupBtnEls.push(btn);
                groupBtns.appendChild(btn);
            })(groups[g]);
        }
        toolbar.appendChild(groupBtns);

        // ── View toggle: Active / History ──
        var viewBtns = document.createElement('span');
        viewBtns.className = 'mu20-alert-view-btns';
        viewBtns.style.marginRight = 'auto';

        self._activeBtn = document.createElement('button');
        self._activeBtn.className = 'mu20-sort-btn mu20-tab--active';
        self._activeBtn.textContent = '\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA';
        self._activeBtn.addEventListener('click', function () {
            self._viewActive = true;
            self._activeBtn.classList.add('mu20-tab--active');
            self._historyBtn.classList.remove('mu20-tab--active');
            self._renderAll();
        });

        self._historyBtn = document.createElement('button');
        self._historyBtn.className = 'mu20-sort-btn';
        self._historyBtn.textContent = '\u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D4';
        self._historyBtn.addEventListener('click', function () {
            self._viewActive = false;
            self._historyBtn.classList.add('mu20-tab--active');
            self._activeBtn.classList.remove('mu20-tab--active');
            self._renderAll();
        });

        viewBtns.appendChild(self._activeBtn);
        viewBtns.appendChild(self._historyBtn);
        toolbar.appendChild(viewBtns);

        var clearBtn = document.createElement('button');
        clearBtn.className = 'mu20-sort-btn';
        clearBtn.textContent = '\u05E0\u05E7\u05D4';
        clearBtn.addEventListener('click', function () { self._clearAll(); });
        toolbar.appendChild(clearBtn);

        c.appendChild(toolbar);

        // ── Alert list container ──
        self._listEl = document.createElement('div');
        self._listEl.className = 'mu20-alert-list';
        c.appendChild(self._listEl);

        // ── Bus subscriptions ──
        self._bindBus();

        // ── Push notification permission ──
        if (self._opts.pushEnabled) self._requestNotificationPermission();

        // ── Heartbeat timer ──
        self._startHeartbeat();

        // ── Initial render ──
        self._renderAll();
    };


    // ─────────────────────────────────────
    //  Bus Subscriptions
    // ─────────────────────────────────────

    Mu20Alerts.prototype._bindBus = function () {
        var self = this;
        var bus = self._bus;
        if (!bus) return;

        self._onDemoToggle = function (d) { self._opts.demoMode = d.enabled; };
        bus.on('demo:toggle', self._onDemoToggle, self);

        self._onApiReady = function (apiObj) {
            if (apiObj && typeof apiObj === 'object') {
                self._api = apiObj;
                self._opts.api = apiObj;
            }
        };
        bus.on('api:ready', self._onApiReady, self);

        self._onApiStatus = function (status) {
            if (!status || typeof status !== 'object') return;
            var now = new Date().toISOString();
            if (status.connected === false) {
                self._fireAlert({
                    id: 'api:connection:lost',
                    unitKey: 'system', siteId: 'system',
                    ruleType: 'api-connection', level: 'critical',
                    msg: 'API \u05D2\u05DD \u05E0\u05D5\u05EA\u05E7',
                    source: 'API', ts: now
                });
            } else if (status.connected === true) {
                self._clear('api:connection:lost');
            }
        };
        bus.on('api:status', self._onApiStatus, self);

        self._onDataUpdated = function (data) {
            if (!data || typeof data !== 'object') return;
            var now = new Date().getTime();
            // Canonical payload: iterate renderState keys for heartbeat
            if (data.renderState) {
                for (var uk in data.renderState) {
                    if (data.renderState.hasOwnProperty(uk)) {
                        self._lastSeen[uk] = now;
                    }
                }
            } else if (data.unitKey) {
                // Legacy single-unit payload
                self._lastSeen[data.unitKey] = now;
            }
        };
        bus.on('data:updated', self._onDataUpdated, self);
    };


    // ─────────────────────────────────────
    //  Heartbeat-based stale detection
    // ─────────────────────────────────────

    Mu20Alerts.prototype._startHeartbeat = function () {
        var self = this;
        if (self._heartbeatHandle !== null) {
            clearInterval(self._heartbeatHandle);
            self._heartbeatHandle = null;
        }
        self._heartbeatHandle = setInterval(function () {
            if (self._destroyed) return;
            self._checkStalenessHeartbeat();
        }, HEARTBEAT_INTERVAL);
    };

    Mu20Alerts.prototype._checkStalenessHeartbeat = function () {
        var self = this;
        if (!self._lastSeen || Object.keys(self._lastSeen).length === 0) return;

        var now = new Date().getTime();
        var staleSec   = self._opts.staleSec || 300;
        var staleMs    = staleSec * 1000;
        var criticalMs = staleMs * 2;

        for (var unitKey in self._lastSeen) {
            if (!self._lastSeen.hasOwnProperty(unitKey)) continue;

            var ageMs  = now - self._lastSeen[unitKey];
            var ageSec = Math.round(ageMs / 1000);

            if (ageMs < staleMs) {
                self._clear(unitKey + ':heartbeat:stale');
                self._clear(unitKey + ':heartbeat:critical');
                continue;
            }

            var isCritical = ageMs >= criticalMs;
            var alertId = unitKey + ':heartbeat:' + (isCritical ? 'critical' : 'stale');

            if (isCritical && self._findAlertById(unitKey + ':heartbeat:stale')) {
                self._clear(unitKey + ':heartbeat:stale');
            }

            self._fireAlert({
                id: alertId,
                unitKey: unitKey, siteId: 'heartbeat',
                ruleType: isCritical ? 'heartbeat:critical' : 'heartbeat:stale',
                level: isCritical ? 'critical' : 'warn',
                msg: '\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D0 \u05DE\u05D4\u05D4 (' + ageSec + 's)',
                source: unitKey,
                ts: new Date().toISOString()
            });
        }
    };

    Mu20Alerts.prototype._findAlertById = function (alertId) {
        for (var i = 0; i < this._active.length; i++) {
            if (this._active[i].id === alertId) return this._active[i];
        }
        return null;
    };


    // ═══════════════════════════════════════
    //  Evaluate all 5 threshold rules
    // ═══════════════════════════════════════

    Mu20Alerts.prototype._evaluate = function () {
        var self = this;
        var data = self._opts.data;
        if (!data) return;

        var sites = self._opts.sites || MU.SITES;
        var now   = new Date().toISOString();

        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            var siteData = data[site.id];
            if (!siteData) continue;

            for (var u = 0; u < site.units.length; u++) {
                var ud = siteData[u];
                if (!ud) continue;

                var unitKey   = MU.unitKey(site.id, u);
                var unitLabel = site.name + ' \u2014 ' + site.units[u];

                // Extract plain numbers from AF wrapper objects (C-1 fix)
                var pct   = MU.toNum(ud.pct);
                var hours = MU.toNum(ud.hours);
                var rate  = MU.toNum(ud.rate);

                // Rule 1: Quota %
                if (pct >= self._opts.quotaPct) {
                    self._fireAlert({
                        id: unitKey + ':' + RULE.QUOTA,
                        unitKey: unitKey, siteId: site.id,
                        ruleType: RULE.QUOTA,
                        level: pct >= 95 ? 'critical' : 'warn',
                        msg: '\u05E0\u05D9\u05E6\u05D5\u05DC \u05DE\u05DB\u05E1\u05D4 ' + MU.formatNum(pct, 1) + '%',
                        source: unitLabel, ts: now
                    });
                }

                // Rule 2: Hours max
                if (self._opts.hoursMax > 0 && hours >= self._opts.hoursMax) {
                    self._fireAlert({
                        id: unitKey + ':' + RULE.HOURS,
                        unitKey: unitKey, siteId: site.id,
                        ruleType: RULE.HOURS, level: 'critical',
                        msg: '\u05D7\u05E8\u05D9\u05D2\u05D4 \u05DE\u05E9\u05E2\u05D5\u05EA \u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD (' + MU.formatNum(hours, 0) + ')',
                        source: unitLabel, ts: now
                    });
                }

                // Rule 3: Stale data — use renderState timestamp (rawSites has no .ts)
                var rsUnit = self._opts.renderState && self._opts.renderState[unitKey];
                var unitTs = rsUnit && rsUnit.ts;
                if (self._opts.staleSec > 0 && unitTs) {
                    var ageSec = (Date.now() - unitTs) / 1000;
                    if (ageSec > self._opts.staleSec) {
                        self._fireAlert({
                            id: unitKey + ':' + RULE.STALE,
                            unitKey: unitKey, siteId: site.id,
                            ruleType: RULE.STALE, level: 'warn',
                            msg: '\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DE\u05D9\u05D5\u05E9\u05E0\u05D9\u05DD (' + Math.round(ageSec) + 's)',
                            source: unitLabel, ts: now
                        });
                    }
                }

                // Rule 4: Daily rate
                if (self._opts.dailyRate > 0 && rate > 0 && rate > self._opts.dailyRate) {
                    self._fireAlert({
                        id: unitKey + ':' + RULE.DAILY,
                        unitKey: unitKey, siteId: site.id,
                        ruleType: RULE.DAILY, level: 'warn',
                        msg: '\u05E7\u05E6\u05D1 \u05D9\u05D5\u05DE\u05D9 \u05D7\u05D5\u05E8\u05D2 (' + MU.formatNum(rate, 1) + '/h)',
                        source: unitLabel, ts: now
                    });
                }

                // Rule 5: Monthly limit
                if (self._opts.monthlyLimit > 0 && hours >= self._opts.monthlyLimit) {
                    self._fireAlert({
                        id: unitKey + ':' + RULE.MONTHLY,
                        unitKey: unitKey, siteId: site.id,
                        ruleType: RULE.MONTHLY, level: 'critical',
                        msg: '\u05D7\u05E8\u05D9\u05D2\u05D4 \u05DE\u05DE\u05D2\u05D1\u05DC\u05D4 \u05D7\u05D5\u05D3\u05E9\u05D9\u05EA (' + MU.formatNum(hours, 0) + ')',
                        source: unitLabel, ts: now
                    });
                }
            }
        }
        self._renderAll();
    };


    // ═══════════════════════════════════════
    //  Fire alert with deduplication
    // ═══════════════════════════════════════

    Mu20Alerts.prototype._fireAlert = function (alert) {
        var self = this;

        // Deduplicate — don't fire same alert within 60 s
        var lastFired = self._dedup[alert.id];
        var nowMs = new Date(alert.ts).getTime();
        if (lastFired && (nowMs - lastFired) < DEDUP_WINDOW) return;
        self._dedup[alert.id] = nowMs;

        // Already active? Update in place
        for (var i = 0; i < self._active.length; i++) {
            if (self._active[i].id === alert.id) {
                self._active[i].ts    = alert.ts;
                self._active[i].msg   = alert.msg;
                self._active[i].level = alert.level;
                return;
            }
        }

        // New alert
        alert.state = STATE.ACTIVE;
        self._active.push(alert);
        if (self._active.length > MAX_ACTIVE) self._active.shift();

        // Badge
        self._countBadge.textContent = String(self._active.length);

        // Bus
        var bus = self._bus;
        if (bus) {
            bus.emit('alert:fired', alert);
            bus.emit('log:entry', {
                level: alert.level,
                source: 'alerts:' + alert.source,
                msg: '[' + alert.ruleType + '] ' + alert.msg,
                ts: alert.ts
            });
        }

        // Sound (critical only)
        if (self._opts.soundEnabled && alert.level === 'critical') {
            self._playBeep();
        }
        // Push (critical only)
        if (self._opts.pushEnabled && alert.level === 'critical') {
            self._sendPush(alert);
        }
    };


    // ═══════════════════════════════════════
    //  ISA-18.2 State Transitions
    // ═══════════════════════════════════════

    Mu20Alerts.prototype._acknowledge = function (alertId) {
        var self = this;
        for (var i = 0; i < self._active.length; i++) {
            if (self._active[i].id === alertId && self._active[i].state === STATE.ACTIVE) {
                self._active[i].state = STATE.ACKNOWLEDGED;
                self._active[i].ackTs = new Date().toISOString();
                if (self._bus) {
                    self._bus.emit('alert:ack', { id: alertId });
                    self._bus.emit('log:entry', {
                        level: 'info', source: 'alerts',
                        msg: '\u05D0\u05D5\u05E9\u05E8\u05D4: ' + self._active[i].source + ' - ' + self._active[i].msg,
                        ts: self._active[i].ackTs
                    });
                }
                break;
            }
        }
        self._renderAll();
    };

    Mu20Alerts.prototype._shelve = function (alertId) {
        var self = this;
        var durationMs = (self._opts.shelveMinutes || 60) * 60000;
        for (var i = 0; i < self._active.length; i++) {
            if (self._active[i].id === alertId) {
                self._active[i].state = STATE.SHELVED;
                self._active[i].shelveExpires = new Date(new Date().getTime() + durationMs).toISOString();
                if (self._bus) {
                    self._bus.emit('alert:shelve', { id: alertId, minutes: self._opts.shelveMinutes });
                }
                break;
            }
        }
        self._renderAll();
    };

    Mu20Alerts.prototype._clear = function (alertId) {
        var self = this;
        for (var i = self._active.length - 1; i >= 0; i--) {
            if (self._active[i].id === alertId) {
                var cleared = self._active.splice(i, 1)[0];
                cleared.state = STATE.CLEARED;
                cleared.clearedTs = new Date().toISOString();
                self._history.push(cleared);
                if (self._history.length > (self._opts.historyMax || 50)) {
                    self._history.shift();
                }
                if (self._bus) self._bus.emit('alert:cleared', { id: alertId });
                break;
            }
        }
        self._countBadge.textContent = String(self._active.length);
        self._renderAll();
    };


    // ═══════════════════════════════════════
    //  Render all alerts
    // ═══════════════════════════════════════

    Mu20Alerts.prototype._renderAll = function () {
        var self = this;
        var container = self._listEl;
        if (!container) return;

        while (container.firstChild) container.removeChild(container.firstChild);

        // Check shelved alerts for expiry
        var now = new Date().getTime();
        for (var e = 0; e < self._active.length; e++) {
            if (self._active[e].state === STATE.SHELVED && self._active[e].shelveExpires) {
                if (now >= new Date(self._active[e].shelveExpires).getTime()) {
                    self._active[e].state = STATE.ACTIVE;
                }
            }
        }

        var alerts = self._viewActive ? self._active : self._history;

        if (!alerts || !alerts.length) {
            var ph = document.createElement('div');
            ph.className = 'mu20-tags-placeholder';
            ph.style.padding = '30px';
            ph.setAttribute('dir', 'rtl');
            ph.textContent = self._viewActive
                ? '\u05D0\u05D9\u05DF \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA'
                : '\u05D0\u05D9\u05DF \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D4';
            container.appendChild(ph);
            return;
        }

        var grouped   = self._groupAlerts(alerts, self._opts.groupBy);
        var groupKeys = Object.keys(grouped);

        for (var gIdx = 0; gIdx < groupKeys.length; gIdx++) {
            var gKey  = groupKeys[gIdx];
            var group = grouped[gKey];

            if (groupKeys.length > 1) {
                var hdr = document.createElement('div');
                hdr.className = 'mu20-alert-group-header';
                hdr.textContent = gKey + ' (' + group.length + ')';
                container.appendChild(hdr);
            }

            for (var i = group.length - 1; i >= 0; i--) {
                self._renderAlertRow(container, group[i]);
            }
        }
    };


    // ─────────────────────────────────────
    //  Group alerts
    // ─────────────────────────────────────

    Mu20Alerts.prototype._groupAlerts = function (alerts, groupBy) {
        var groups = {};
        for (var i = 0; i < alerts.length; i++) {
            var a = alerts[i];
            var key;
            switch (groupBy) {
                case 'site':
                    key = a.source ? a.source.split(' \u2014 ')[0] : '\u05DC\u05D0 \u05D9\u05D3\u05D5\u05E2';
                    break;
                case 'severity':
                    key = a.level === 'critical' ? '\u05E7\u05E8\u05D9\u05D8\u05D9' : '\u05D0\u05D6\u05D4\u05E8\u05D4';
                    break;
                default:
                    key = '\u05D4\u05EA\u05E8\u05D0\u05D5\u05EA';
            }
            if (!groups[key]) groups[key] = [];
            groups[key].push(a);
        }
        return groups;
    };


    // ─────────────────────────────────────
    //  Render single alert row
    // ─────────────────────────────────────

    Mu20Alerts.prototype._renderAlertRow = function (container, alert) {
        var self = this;
        var row = document.createElement('div');
        row.className = 'mu20-alert-row';

        if (alert.level === 'critical')           row.classList.add('mu20-alert-row--critical');
        else if (alert.level === 'warn')          row.classList.add('mu20-alert-row--warn');
        if (alert.state === STATE.SHELVED)         row.classList.add('mu20-alert-row--shelved');
        if (alert.state === STATE.ACKNOWLEDGED)    row.classList.add('mu20-alert-row--ack');

        // State badge
        var stateLabels = {};
        stateLabels[STATE.ACTIVE]       = '\u05E4\u05E2\u05D9\u05DC';
        stateLabels[STATE.ACKNOWLEDGED] = '\u05D0\u05D5\u05E9\u05E8';
        stateLabels[STATE.SHELVED]      = '\u05DE\u05D5\u05E9\u05D4\u05D4';
        stateLabels[STATE.CLEARED]      = '\u05E0\u05E1\u05D2\u05E8';

        var badge = document.createElement('span');
        badge.className = 'mu20-alert-state mu20-alert-state--' + alert.state;
        badge.textContent = stateLabels[alert.state] || alert.state;
        row.appendChild(badge);

        // Rule type
        var ruleEl = document.createElement('span');
        ruleEl.className = 'mu20-alert-rule';
        ruleEl.textContent = alert.ruleType || '';
        row.appendChild(ruleEl);

        // Time
        var timeEl = document.createElement('span');
        timeEl.className = 'mu20-alert-time';
        timeEl.textContent = MU.formatDate(alert.ts, 'time');
        row.appendChild(timeEl);

        // Source
        var srcEl = document.createElement('span');
        srcEl.className = 'mu20-alert-source';
        srcEl.textContent = alert.source || '';
        row.appendChild(srcEl);

        // Message
        var msgEl = document.createElement('span');
        msgEl.className = 'mu20-alert-msg';
        msgEl.textContent = alert.msg;
        row.appendChild(msgEl);

        // Action buttons (active view only)
        if (self._viewActive) {
            var actions = document.createElement('span');
            actions.className = 'mu20-alert-actions';

            if (alert.state === STATE.ACTIVE) {
                var ackBtn = document.createElement('button');
                ackBtn.className = 'mu20-btn mu20-btn--small';
                ackBtn.textContent = '\u05D0\u05E9\u05E8';
                (function (aid) {
                    ackBtn.addEventListener('click', function (ev) {
                        ev.stopPropagation(); self._acknowledge(aid);
                    });
                })(alert.id);
                actions.appendChild(ackBtn);

                var shBtn = document.createElement('button');
                shBtn.className = 'mu20-btn mu20-btn--small';
                shBtn.textContent = '\u05D4\u05E9\u05D4\u05D4';
                (function (aid) {
                    shBtn.addEventListener('click', function (ev) {
                        ev.stopPropagation(); self._shelve(aid);
                    });
                })(alert.id);
                actions.appendChild(shBtn);
            }

            var clrBtn = document.createElement('button');
            clrBtn.className = 'mu20-btn mu20-btn--small mu20-btn--cancel';
            clrBtn.textContent = '\u05E1\u05D2\u05D5\u05E8';
            (function (aid) {
                clrBtn.addEventListener('click', function (ev) {
                    ev.stopPropagation(); self._clear(aid);
                });
            })(alert.id);
            actions.appendChild(clrBtn);

            row.appendChild(actions);
        }

        container.appendChild(row);
    };


    // ─────────────────────────────────────
    //  Clear all
    // ─────────────────────────────────────

    Mu20Alerts.prototype._clearAll = function () {
        var self = this;
        if (self._viewActive) {
            for (var i = 0; i < self._active.length; i++) {
                self._active[i].state = STATE.CLEARED;
                self._active[i].clearedTs = new Date().toISOString();
                self._history.push(self._active[i]);
            }
            self._active = [];
            while (self._history.length > (self._opts.historyMax || 50)) {
                self._history.shift();
            }
        } else {
            self._history = [];
        }
        self._countBadge.textContent = String(self._active.length);
        self._renderAll();
    };


    // ─────────────────────────────────────
    //  Sound (Web Audio API beep 880 Hz)
    // ─────────────────────────────────────

    Mu20Alerts.prototype._playBeep = function () {
        try {
            if (!this._audioCtx) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                this._audioCtx = new AC();
            }
            var ctx  = this._audioCtx;
            var osc  = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value     = 0.15;
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + 0.15);
        } catch (e) { /* Audio not available */ }
    };


    // ─────────────────────────────────────
    //  Push Notifications
    // ─────────────────────────────────────

    Mu20Alerts.prototype._requestNotificationPermission = function () {
        if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            try { Notification.requestPermission(); } catch (e) { /* Not supported */ }
        }
    };

    Mu20Alerts.prototype._sendPush = function (alert) {
        var self = this;
        try {
            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                var iconPath = (self._opts.scriptBase || '/PIVision/Scripts/app/editor/symbols/ext/') + 'icons/mu20.png';
                new Notification('\u05D4\u05EA\u05E8\u05D0\u05EA \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA', {
                    body: alert.source + ': ' + alert.msg,
                    icon: iconPath,
                    tag: alert.id
                });
            }
        } catch (e) { /* Push not supported */ }
    };


    // ═══════════════════════════════════════
    //  Plugin Contract
    // ═══════════════════════════════════════

    /**
     * @param {Object} payload - canonical { rawSites, renderState, siteDefs, ts }
     *                           OR legacy { [siteId]: { [unitIdx]: {...} } }
     */
    Mu20Alerts.prototype.update = function (payload) {
        if (this._destroyed) return;
        // Canonical payload normalization — alerts needs rawSites for rule eval
        if (payload !== undefined) {
            this._opts.data = (payload && payload.rawSites) ? payload.rawSites : payload;
            // Carry renderState for stale-data Rule 3 (timestamps live in renderState, not rawSites)
            if (payload && payload.renderState) {
                this._opts.renderState = payload.renderState;
            }
        }
        this._evaluate();
    };

    Mu20Alerts.prototype.setOption = function (key, value) {
        if (this._destroyed) return;
        this._opts[key] = value;
        if (key === 'data') {
            this._evaluate();
        } else if (key === 'pushEnabled' && value) {
            this._requestNotificationPermission();
        } else if (key === 'api' && value && typeof value === 'object') {
            this._api = value;
        }
    };

    Mu20Alerts.prototype.onResize = function () {
        // CSS-driven layout — nothing to do
    };

    Mu20Alerts.prototype.onTabActivated = function () {
        if (!this._destroyed) this._renderAll();
    };

    Mu20Alerts.prototype.getActive = function () {
        return this._active ? this._active.slice() : [];
    };

    Mu20Alerts.prototype.getHistory = function () {
        return this._history ? this._history.slice() : [];
    };


    // ═══════════════════════════════════════
    //  Destroy
    // ═══════════════════════════════════════

    Mu20Alerts.prototype.destroy = function () {
        this._destroyed = true;

        if (this._heartbeatHandle !== null) {
            clearInterval(this._heartbeatHandle);
            this._heartbeatHandle = null;
        }

        var bus = this._bus;
        if (bus) {
            if (this._onDemoToggle)  bus.off('demo:toggle',  this._onDemoToggle);
            if (this._onApiReady)    bus.off('api:ready',    this._onApiReady);
            if (this._onApiStatus)   bus.off('api:status',   this._onApiStatus);
            if (this._onDataUpdated) bus.off('data:updated', this._onDataUpdated);
        }

        if (this._audioCtx) {
            try { this._audioCtx.close(); } catch (e) {}
            this._audioCtx = null;
        }

        this._active      = null;
        this._history     = null;
        this._dedup       = null;
        this._lastSeen    = null;
        this._api         = null;
        this._countBadge  = null;
        this._listEl      = null;
        this._activeBtn   = null;
        this._historyBtn  = null;
        this._groupBtnEls = null;
        this._groupBtnsEl = null;
        this._bus         = null;

        var c = this._container;
        if (c) {
            while (c.firstChild) c.removeChild(c.firstChild);
            c.classList.remove('mu20-alerts-root');
        }
        this._container = null;
        this._shadow    = null;
    };


    // ── Export ──
    window.Mu20Alerts = Mu20Alerts;

})();
