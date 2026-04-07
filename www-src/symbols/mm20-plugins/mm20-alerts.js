/**
 * ═══════════════════════════════════════════════════════
 *  mm20-alerts.js  —  ISA-18.2 Alert Engine Widget
 * ═══════════════════════════════════════════════════════
 *  5 threshold types, alert state machine (ACTIVE →
 *  ACKNOWLEDGED → CLEARED, + SHELVED branch),
 *  deduplication, history, grouping, push notifications.
 *
 *  jQuery widget: mm20.mm20Alerts
 *  Version: 20.1.R1  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function ($) {
    'use strict';

    if (!$ || !$.widget) return;
    var MM = window.MM20;
    if (!MM) { console.error('[mm20-alerts] MM20 core not loaded'); return; }

    // ── ISA-18.2 Alert States ──
    var STATE = {
        ACTIVE:       'active',
        ACKNOWLEDGED: 'acknowledged',
        SHELVED:      'shelved',
        CLEARED:      'cleared'
    };

    // ── Threshold Rule Types ──
    var RULE = {
        QUOTA:    'quota',
        HOURS:    'hours',
        DAILY:    'dailyRate',
        STALE:    'stale',
        MONTHLY:  'monthlyLimit'
    };

    $.widget('mm20.mm20Alerts', {

        options: {
            bus:           null,
            sites:         null,
            data:          null,
            api:           null,    // API object from orchestrator
            demoMode:      false,
            // Thresholds (5 types)
            quotaPct:      90,
            hoursMax:      1000,
            staleSec:      300,
            dailyRate:     0,      // MW/h rate threshold (0 = disabled)
            monthlyLimit:  0,      // monthly hours limit (0 = disabled)
            // ISA-18.2
            shelveMinutes: 60,
            historyMax:    50,
            // Notifications
            soundEnabled:  false,
            pushEnabled:   false,
            // UI
            groupBy:       'time'  // 'time' | 'site' | 'severity'
        },

        _active:        null,  // array of active/ack alerts
        _history:       null,  // array of cleared/expired alerts (max historyMax)
        _dedup:         null,  // map: alertId → timestamp (for dedup)
        _audioCtx:      null,
        _destroyed:     false,
        _api:           null,  // captured API reference
        _lastSeen:      null,  // map: unitKey → Date.now() for heartbeat
        _heartbeatHandle: null, // setInterval/setTimeout handle

        // ═══════════════════════════════════════
        //  _create
        // ═══════════════════════════════════════

        _create: function () {
            var self = this;
            self._destroyed = false;
            self._active  = [];
            self._history = [];
            self._dedup   = {};
            self._lastSeen = {};
            self._api = self.options.api || null;

            try {
                var el = self.element;
                el.addClass('mm20-alerts-root');

                // ── Header toolbar ──
                var toolbar = $('<div class="mm20-toolbar"></div>');
                toolbar.append($('<span style="font-weight:600;">\u05DE\u05E0\u05D5\u05E2 \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA (ISA-18.2)</span>'));

                self._countBadge = $('<span class="mm20-version-badge" style="margin-right:8px;">0</span>');
                toolbar.append(self._countBadge);

                // Grouping buttons
                var groupBtns = $('<span class="mm20-alert-group-btns"></span>');
                var groups = [
                    { key: 'time',     label: '\u05D6\u05DE\u05DF' },
                    { key: 'site',     label: '\u05D0\u05EA\u05E8' },
                    { key: 'severity', label: '\u05D7\u05D5\u05DE\u05E8\u05D4' }
                ];
                for (var g = 0; g < groups.length; g++) {
                    (function (grp) {
                        var btn = $('<button class="mm20-sort-btn"></button>')
                            .text(grp.label)
                            .toggleClass('mm20-tab--active', self.options.groupBy === grp.key);
                        btn.on('click', function () {
                            self.options.groupBy = grp.key;
                            groupBtns.find('button').removeClass('mm20-tab--active');
                            $(this).addClass('mm20-tab--active');
                            self._renderAll();
                        });
                        groupBtns.append(btn);
                    })(groups[g]);
                }
                toolbar.append(groupBtns);

                // View toggle: Active vs History
                self._viewActive = true;
                var viewBtns = $('<span class="mm20-alert-view-btns" style="margin-right:auto;"></span>');
                self._activeBtn = $('<button class="mm20-sort-btn mm20-tab--active">\u05E4\u05E2\u05D9\u05DC\u05D5\u05EA</button>');
                self._historyBtn = $('<button class="mm20-sort-btn">\u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D4</button>');
                self._activeBtn.on('click', function () {
                    self._viewActive = true;
                    self._activeBtn.addClass('mm20-tab--active');
                    self._historyBtn.removeClass('mm20-tab--active');
                    self._renderAll();
                });
                self._historyBtn.on('click', function () {
                    self._viewActive = false;
                    self._historyBtn.addClass('mm20-tab--active');
                    self._activeBtn.removeClass('mm20-tab--active');
                    self._renderAll();
                });
                viewBtns.append(self._activeBtn).append(self._historyBtn);
                toolbar.append(viewBtns);

                var clearBtn = $('<button class="mm20-sort-btn">\u05E0\u05E7\u05D4</button>');
                clearBtn.on('click', function () { self._clearAll(); });
                toolbar.append(clearBtn);

                el.append(toolbar);

                // ── Alert list ──
                self._listEl = $('<div class="mm20-alert-list"></div>');
                el.append(self._listEl);

                // ── Bus subscriptions ──
                var bus = self.options.bus;
                if (bus) {
                    self._onDemoToggle = function (d) {
                        self.options.demoMode = d.enabled;
                    };
                    bus.on('demo:toggle', self._onDemoToggle, self);

                    // ── API Ready: capture API reference ──
                    self._onApiReady = function (apiObj) {
                        if (apiObj && typeof apiObj === 'object') {
                            self._api = apiObj;
                            self.options.api = apiObj;
                        }
                    };
                    bus.on('api:ready', self._onApiReady, self);

                    // ── API Status: handle connection changes ──
                    self._onApiStatus = function (status) {
                        if (!status || typeof status !== 'object') return;
                        var now = new Date().toISOString();

                        // If API connection lost, emit connection alert
                        if (status.connected === false) {
                            self._fireAlert({
                                id: 'api:connection:lost',
                                unitKey: 'system',
                                siteId: 'system',
                                ruleType: 'api-connection',
                                level: 'critical',
                                msg: 'API \u05D2\u05DD \u05E0\u05D5\u05EA\u05E7',
                                source: 'API',
                                ts: now
                            });
                        } else if (status.connected === true) {
                            // Connection restored: clear the lost alert if it exists
                            self._clear('api:connection:lost');
                        }
                    };
                    bus.on('api:status', self._onApiStatus, self);

                    // ── Data Updated: track last seen timestamp per unit ──
                    self._onDataUpdated = function (data) {
                        if (!data || typeof data !== 'object') return;
                        var unitKey = data.unitKey;
                        if (unitKey) {
                            self._lastSeen[unitKey] = new Date().getTime();
                        }
                    };
                    bus.on('data:updated', self._onDataUpdated, self);
                }

                // Request push notification permission
                if (self.options.pushEnabled) {
                    self._requestNotificationPermission();
                }

                // ── Start heartbeat timer for stale detection ──
                self._startHeartbeat();

                self._renderAll();

            } catch (e) {
                MM.shield.log('alerts', '_create', e);
                MM.shield.renderFallback(self.element, 'alerts', e);
            }
        },


        // ─────────────────────────────────────
        //  Heartbeat-based stale detection
        // ─────────────────────────────────────

        _startHeartbeat: function () {
            var self = this;
            // Clear any existing heartbeat
            if (self._heartbeatHandle !== null) {
                clearInterval(self._heartbeatHandle);
                self._heartbeatHandle = null;
            }
            // Start new heartbeat every 30 seconds
            self._heartbeatHandle = setInterval(function () {
                if (self._destroyed) return;
                self._checkStalenessHeartbeat();
            }, 30000);
        },

        _checkStalenessHeartbeat: function () {
            var self = this;
            if (!self._lastSeen || Object.keys(self._lastSeen).length === 0) {
                return; // No data tracked yet
            }

            var now = new Date().getTime();
            var staleSec = self.options.staleSec || 300;
            var staleMs = staleSec * 1000;
            var criticalMs = staleMs * 2; // 2x stale = critical

            for (var unitKey in self._lastSeen) {
                if (!self._lastSeen.hasOwnProperty(unitKey)) continue;

                var lastSeenMs = self._lastSeen[unitKey];
                var ageMs = now - lastSeenMs;
                var ageSec = Math.round(ageMs / 1000);

                // Skip if data is still fresh
                if (ageMs < staleMs) {
                    // Clear any stale/critical alert for this unit
                    self._clear(unitKey + ':heartbeat:stale');
                    self._clear(unitKey + ':heartbeat:critical');
                    continue;
                }

                var alertLevel = ageMs >= criticalMs ? 'critical' : 'warn';
                var alertId = ageMs >= criticalMs
                    ? unitKey + ':heartbeat:critical'
                    : unitKey + ':heartbeat:stale';
                var existingAlert = self._findAlertById(alertId);

                // If critical escalation needed (was warn, now critical)
                if (ageMs >= criticalMs && self._findAlertById(unitKey + ':heartbeat:stale')) {
                    self._clear(unitKey + ':heartbeat:stale');
                }

                // Emit stale or critical heartbeat alert
                self._fireAlert({
                    id: alertId,
                    unitKey: unitKey,
                    siteId: 'heartbeat',
                    ruleType: ageMs >= criticalMs ? 'heartbeat:critical' : 'heartbeat:stale',
                    level: alertLevel,
                    msg: '\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05D0 \u05DE\u05D4\u05D4 (' + ageSec + 's)',
                    source: unitKey,
                    ts: new Date().toISOString()
                });
            }
        },

        _findAlertById: function (alertId) {
            var self = this;
            for (var i = 0; i < self._active.length; i++) {
                if (self._active[i].id === alertId) {
                    return self._active[i];
                }
            }
            return null;
        },


        // ─────────────────────────────────────
        //  Evaluate all 5 threshold rules
        // ─────────────────────────────────────

        _evaluate: function () {
            var self = this;
            var data = self.options.data;
            if (!data) return;

            var sites = self.options.sites || MM.SITES;
            var now = new Date().toISOString();

            for (var s = 0; s < sites.length; s++) {
                var site = sites[s];
                var siteData = data[site.id];
                if (!siteData) continue;

                for (var u = 0; u < site.units.length; u++) {
                    var ud = siteData[u];
                    if (!ud) continue;

                    var unitKey = MM.unitKey(site.id, u);
                    var unitLabel = site.name + ' \u2014 ' + site.units[u];

                    // Rule 1: Quota % threshold
                    if (ud.pct >= self.options.quotaPct) {
                        self._fireAlert({
                            id: unitKey + ':' + RULE.QUOTA,
                            unitKey: unitKey,
                            siteId: site.id,
                            ruleType: RULE.QUOTA,
                            level: ud.pct >= 95 ? 'critical' : 'warn',
                            msg: '\u05E0\u05D9\u05E6\u05D5\u05DC \u05DE\u05DB\u05E1\u05D4 ' + MM.formatNum(ud.pct, 1) + '%',
                            source: unitLabel,
                            ts: now
                        });
                    }

                    // Rule 2: Hours max
                    if (self.options.hoursMax > 0 && ud.hours >= self.options.hoursMax) {
                        self._fireAlert({
                            id: unitKey + ':' + RULE.HOURS,
                            unitKey: unitKey,
                            siteId: site.id,
                            ruleType: RULE.HOURS,
                            level: 'critical',
                            msg: '\u05D7\u05E8\u05D9\u05D2\u05D4 \u05DE\u05E9\u05E2\u05D5\u05EA \u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD (' + MM.formatNum(ud.hours, 0) + ')',
                            source: unitLabel,
                            ts: now
                        });
                    }

                    // Rule 3: Stale data
                    if (self.options.staleSec > 0 && ud.ts) {
                        var ageSec = (new Date().getTime() - new Date(ud.ts).getTime()) / 1000;
                        if (ageSec > self.options.staleSec) {
                            self._fireAlert({
                                id: unitKey + ':' + RULE.STALE,
                                unitKey: unitKey,
                                siteId: site.id,
                                ruleType: RULE.STALE,
                                level: 'warn',
                                msg: '\u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DE\u05D9\u05D5\u05E9\u05E0\u05D9\u05DD (' + Math.round(ageSec) + 's)',
                                source: unitLabel,
                                ts: now
                            });
                        }
                    }

                    // Rule 4: Daily rate
                    if (self.options.dailyRate > 0 && ud.rate !== undefined && ud.rate > self.options.dailyRate) {
                        self._fireAlert({
                            id: unitKey + ':' + RULE.DAILY,
                            unitKey: unitKey,
                            siteId: site.id,
                            ruleType: RULE.DAILY,
                            level: 'warn',
                            msg: '\u05E7\u05E6\u05D1 \u05D9\u05D5\u05DE\u05D9 \u05D7\u05D5\u05E8\u05D2 (' + MM.formatNum(ud.rate, 1) + '/h)',
                            source: unitLabel,
                            ts: now
                        });
                    }

                    // Rule 5: Monthly limit
                    if (self.options.monthlyLimit > 0 && ud.hours >= self.options.monthlyLimit) {
                        self._fireAlert({
                            id: unitKey + ':' + RULE.MONTHLY,
                            unitKey: unitKey,
                            siteId: site.id,
                            ruleType: RULE.MONTHLY,
                            level: 'critical',
                            msg: '\u05D7\u05E8\u05D9\u05D2\u05D4 \u05DE\u05DE\u05D2\u05D1\u05DC\u05D4 \u05D7\u05D5\u05D3\u05E9\u05D9\u05EA (' + MM.formatNum(ud.hours, 0) + ')',
                            source: unitLabel,
                            ts: now
                        });
                    }
                }
            }

            self._renderAll();
        },


        // ─────────────────────────────────────
        //  Fire alert with deduplication
        // ─────────────────────────────────────

        _fireAlert: function (alert) {
            var self = this;

            // Deduplicate by alert.id — don't fire same alert within 60s
            var lastFired = self._dedup[alert.id];
            var nowMs = new Date(alert.ts).getTime();
            if (lastFired && (nowMs - lastFired) < 60000) return;
            self._dedup[alert.id] = nowMs;

            // Check if already active (same id) — update instead of duplicate
            for (var i = 0; i < self._active.length; i++) {
                if (self._active[i].id === alert.id) {
                    self._active[i].ts = alert.ts;
                    self._active[i].msg = alert.msg;
                    self._active[i].level = alert.level;
                    return; // updated existing, no new alert
                }
            }

            // New alert — set initial state
            alert.state = STATE.ACTIVE;
            self._active.push(alert);

            // Cap active alerts
            if (self._active.length > 500) self._active.shift();

            // Update badge
            self._countBadge.text(self._active.length);

            // Emit to bus
            var bus = self.options.bus;
            if (bus) {
                bus.emit('alert:fired', alert);
                bus.emit('log:entry', {
                    level: alert.level,
                    source: 'alerts:' + alert.source,
                    msg: '[' + alert.ruleType + '] ' + alert.msg,
                    ts: alert.ts
                });
            }

            // Sound for critical
            if (self.options.soundEnabled && alert.level === 'critical') {
                self._playBeep();
            }

            // Push for critical
            if (self.options.pushEnabled && alert.level === 'critical') {
                self._sendPush(alert);
            }
        },


        // ─────────────────────────────────────
        //  ISA-18.2 State Transitions
        // ─────────────────────────────────────

        _acknowledge: function (alertId) {
            var self = this;
            for (var i = 0; i < self._active.length; i++) {
                if (self._active[i].id === alertId && self._active[i].state === STATE.ACTIVE) {
                    self._active[i].state = STATE.ACKNOWLEDGED;
                    self._active[i].ackTs = new Date().toISOString();
                    if (self.options.bus) {
                        self.options.bus.emit('alert:ack', { id: alertId });
                        self.options.bus.emit('log:entry', {
                            level: 'info',
                            source: 'alerts',
                            msg: '\u05D0\u05D5\u05E9\u05E8\u05D4: ' + self._active[i].source + ' - ' + self._active[i].msg,
                            ts: self._active[i].ackTs
                        });
                    }
                    break;
                }
            }
            self._renderAll();
        },

        _shelve: function (alertId) {
            var self = this;
            var durationMs = (self.options.shelveMinutes || 60) * 60000;
            for (var i = 0; i < self._active.length; i++) {
                if (self._active[i].id === alertId) {
                    self._active[i].state = STATE.SHELVED;
                    self._active[i].shelveExpires = new Date(new Date().getTime() + durationMs).toISOString();
                    if (self.options.bus) {
                        self.options.bus.emit('alert:shelve', { id: alertId, minutes: self.options.shelveMinutes });
                    }
                    break;
                }
            }
            self._renderAll();
        },

        _clear: function (alertId) {
            var self = this;
            for (var i = self._active.length - 1; i >= 0; i--) {
                if (self._active[i].id === alertId) {
                    var cleared = self._active.splice(i, 1)[0];
                    cleared.state = STATE.CLEARED;
                    cleared.clearedTs = new Date().toISOString();
                    self._history.push(cleared);
                    if (self._history.length > (self.options.historyMax || 50)) {
                        self._history.shift();
                    }
                    if (self.options.bus) {
                        self.options.bus.emit('alert:cleared', { id: alertId });
                    }
                    break;
                }
            }
            self._countBadge.text(self._active.length);
            self._renderAll();
        },


        // ─────────────────────────────────────
        //  Render all alerts
        // ─────────────────────────────────────

        _renderAll: function () {
            var self = this;
            var container = self._listEl;
            container.empty();

            // Check shelved alerts for expiry
            var now = new Date().getTime();
            for (var e = 0; e < self._active.length; e++) {
                if (self._active[e].state === STATE.SHELVED && self._active[e].shelveExpires) {
                    if (now >= new Date(self._active[e].shelveExpires).getTime()) {
                        self._active[e].state = STATE.ACTIVE; // unshelve
                    }
                }
            }

            var alerts = self._viewActive ? self._active : self._history;

            if (!alerts || !alerts.length) {
                container.html(
                    '<div class="mm20-tags-placeholder" style="padding:30px;" dir="rtl">' +
                    (self._viewActive ? '\u05D0\u05D9\u05DF \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA' : '\u05D0\u05D9\u05DF \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D4') +
                    '</div>'
                );
                return;
            }

            // Group
            var grouped = self._groupAlerts(alerts, self.options.groupBy);

            for (var gKey in grouped) {
                if (!grouped.hasOwnProperty(gKey)) continue;
                var group = grouped[gKey];

                // Group header
                if (Object.keys(grouped).length > 1) {
                    var header = $('<div class="mm20-alert-group-header"></div>')
                        .text(gKey + ' (' + group.length + ')');
                    container.append(header);
                }

                for (var i = group.length - 1; i >= 0; i--) {
                    self._renderAlertRow(container, group[i]);
                }
            }
        },

        _groupAlerts: function (alerts, groupBy) {
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
        },

        _renderAlertRow: function (container, alert) {
            var self = this;
            var row = $('<div class="mm20-alert-row"></div>');
            if (alert.level === 'critical') row.addClass('mm20-alert-row--critical');
            else if (alert.level === 'warn') row.addClass('mm20-alert-row--warn');
            if (alert.state === STATE.SHELVED) row.addClass('mm20-alert-row--shelved');
            if (alert.state === STATE.ACKNOWLEDGED) row.addClass('mm20-alert-row--ack');

            // State badge
            var stateLabels = {};
            stateLabels[STATE.ACTIVE] = '\u05E4\u05E2\u05D9\u05DC';
            stateLabels[STATE.ACKNOWLEDGED] = '\u05D0\u05D5\u05E9\u05E8';
            stateLabels[STATE.SHELVED] = '\u05DE\u05D5\u05E9\u05D4\u05D4';
            stateLabels[STATE.CLEARED] = '\u05E0\u05E1\u05D2\u05E8';
            var stateBadge = $('<span class="mm20-alert-state mm20-alert-state--' + alert.state + '"></span>')
                .text(stateLabels[alert.state] || alert.state);
            row.append(stateBadge);

            // Rule type badge
            row.append($('<span class="mm20-alert-rule"></span>').text(alert.ruleType || ''));

            row.append($('<span class="mm20-alert-time"></span>').text(MM.formatDate(alert.ts, 'time')));
            row.append($('<span class="mm20-alert-source"></span>').text(alert.source || ''));
            row.append($('<span class="mm20-alert-msg"></span>').text(alert.msg));

            // Action buttons (only for active view)
            if (self._viewActive) {
                var actions = $('<span class="mm20-alert-actions"></span>');

                if (alert.state === STATE.ACTIVE) {
                    var ackBtn = $('<button class="mm20-btn mm20-btn--small">\u05D0\u05E9\u05E8</button>');
                    ackBtn.on('click', function (ev) { ev.stopPropagation(); self._acknowledge(alert.id); });
                    actions.append(ackBtn);

                    var shelveBtn = $('<button class="mm20-btn mm20-btn--small">\u05D4\u05E9\u05D4\u05D4</button>');
                    shelveBtn.on('click', function (ev) { ev.stopPropagation(); self._shelve(alert.id); });
                    actions.append(shelveBtn);
                }

                var clearBtn = $('<button class="mm20-btn mm20-btn--small mm20-btn--cancel">\u05E1\u05D2\u05D5\u05E8</button>');
                clearBtn.on('click', function (ev) { ev.stopPropagation(); self._clear(alert.id); });
                actions.append(clearBtn);

                row.append(actions);
            }

            container.append(row);
        },


        // ─────────────────────────────────────
        //  Clear all active alerts
        // ─────────────────────────────────────

        _clearAll: function () {
            var self = this;
            if (self._viewActive) {
                // Move all active to history
                for (var i = 0; i < self._active.length; i++) {
                    var a = self._active[i];
                    a.state = STATE.CLEARED;
                    a.clearedTs = new Date().toISOString();
                    self._history.push(a);
                }
                self._active = [];
                // Trim history
                while (self._history.length > (self.options.historyMax || 50)) {
                    self._history.shift();
                }
            } else {
                self._history = [];
            }
            self._countBadge.text(self._active.length);
            self._renderAll();
        },


        // ─────────────────────────────────────
        //  Sound (Web Audio API beep)
        // ─────────────────────────────────────

        _playBeep: function () {
            try {
                if (!this._audioCtx) {
                    var AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC) return;
                    this._audioCtx = new AC();
                }
                var ctx = this._audioCtx;
                var osc = ctx.createOscillator();
                var gain = ctx.createGain();
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.frequency.value = 880;
                gain.gain.value = 0.15;
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.15);
            } catch (e) { /* Audio not available */ }
        },


        // ─────────────────────────────────────
        //  Push Notifications
        // ─────────────────────────────────────

        _requestNotificationPermission: function () {
            if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
                try { Notification.requestPermission(); } catch (e) { /* legacy guard */ }
            }
        },

        _sendPush: function (alert) {
            try {
                if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                    new Notification('\u05D4\u05EA\u05E8\u05D0\u05EA \u05DE\u05D5\u05D2\u05D1\u05DC\u05D5\u05EA', {
                        body: alert.source + ': ' + alert.msg,
                        icon: (MM && MM.resolveUrl) ? MM.resolveUrl('icons/mm20.png') : '/PIVision/Scripts/app/editor/symbols/ext/icons/mm20.png',
                        tag: alert.id
                    });
                }
            } catch (e) { /* Push not supported */ }
        },


        // ═══════════════════════════════════════
        //  _setOption
        // ═══════════════════════════════════════

        _setOption: function (key, value) {
            this._super(key, value);

            if (key === 'data') {
                this._evaluate();
            } else if (key === 'pushEnabled' && value) {
                this._requestNotificationPermission();
            } else if (key === 'api') {
                // Capture API reference if provided
                if (value && typeof value === 'object') {
                    this._api = value;
                }
            }
        },


        // ═══════════════════════════════════════
        //  _destroy
        // ═══════════════════════════════════════

        _destroy: function () {
            this._destroyed = true;

            // ── Clear heartbeat timer ──
            if (this._heartbeatHandle !== null) {
                clearInterval(this._heartbeatHandle);
                this._heartbeatHandle = null;
            }

            // ── Clean up bus listeners ──
            var bus = this.options.bus;
            if (bus) {
                if (this._onDemoToggle) {
                    bus.off('demo:toggle', this._onDemoToggle);
                }
                if (this._onApiReady) {
                    bus.off('api:ready', this._onApiReady);
                }
                if (this._onApiStatus) {
                    bus.off('api:status', this._onApiStatus);
                }
                if (this._onDataUpdated) {
                    bus.off('data:updated', this._onDataUpdated);
                }
            }

            if (this._audioCtx) {
                try { this._audioCtx.close(); } catch (e) {}
                this._audioCtx = null;
            }

            this._active  = null;
            this._history = null;
            this._dedup   = null;
            this._lastSeen = null;
            this._api = null;
            this.element.empty().removeClass('mm20-alerts-root');
        }
    });

})(window.jQuery);
