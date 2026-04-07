(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Triage Alert Panel — WOW v100
     * ═══════════════════════════════════════════════════════
     *  Smart alarm management panel that prevents Alarm
     *  Fatigue through intelligent Triage + FLIP animations.
     *
     *  THE GEM: Two-Phase Alarm Intelligence
     *  Phase 1 — Triage Engine: JavaScript pre-filters raw
     *  PI data, eliminates normal states, classifies severity,
     *  auto-groups similar warnings, and sorts by risk weight.
     *  Only actionable alerts reach the DOM.
     *  Phase 2 — FLIP Animations: cards slide smoothly to
     *  new positions using GPU-accelerated transforms. No
     *  layout thrashing, no jarring jumps. The operator's
     *  eye tracks card movement naturally.
     *
     *  - DocumentFragment: single DOM injection (0 reflows)
     *  - FLIP (First/Last/Invert/Play): transform-only GPU
     *  - Auto-Grouping: 30 similar warnings → 1 summary card
     *  - Pulse of Death: subtle red box-shadow pulse
     *  - Web Audio API: industrial chime on new critical
     *  - Notification API: OS toast when tab is hidden
     *
     *  DataShape: Table (Multiple datasources)
     *  Shadow DOM · Hebrew RTL · wc20 config
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    /* ── Executive Palette ── */
    var CLR = {
        critical: '#FF3B30',
        warning:  '#FF9500',
        info:     '#5BC0EB',
        ok:       '#00F5D4',
        text:     '#ECF0F1',
        muted:    '#8899AA',
        bg:       '#0A0F1C',
        surface:  '#0F2940',
        border:   '#1A3A5C'
    };

    /* ── Severity Labels (Hebrew) ── */
    var SEV_LABEL = {
        critical: '\u05E7\u05E8\u05D9\u05D8\u05D9',    /* קריטי */
        warning:  '\u05D0\u05D6\u05D4\u05E8\u05D4',    /* אזהרה */
        info:     '\u05DE\u05D9\u05D3\u05E2'            /* מידע  */
    };

    var SEV_ICON = {
        critical: '\uD83D\uDD34',   /* 🔴 */
        warning:  '\uD83D\uDFE0',   /* 🟠 */
        info:     '\u2139\uFE0F'     /* ℹ️  */
    };


    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var self   = this;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-alertpanel-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-ap-root-mount');
        if (!mountEl) {
            console.error('[WOW Alert Panel] Mount element .wow-ap-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-alertpanel-wow.css';
        shadow.appendChild(linkEl);


        /* ═══ DOM Scaffold ═══ */
        function _el(tag, cls) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            return e;
        }

        var root    = _el('div', 'wow-ap-root');
        var toolbar = _el('div', 'wow-ap-toolbar');
        var titleEl = _el('span', 'wow-ap-title');
        var actions = _el('div', 'wow-ap-toolbar-actions');

        var btnMute   = _el('button', 'wow-ap-btn');
        btnMute.textContent = '\uD83D\uDD07 \u05D4\u05E9\u05EA\u05E7';  /* 🔇 השתק */
        var btnAckAll = _el('button', 'wow-ap-btn');
        btnAckAll.textContent = '\u2713 \u05D0\u05E9\u05E8 \u05D4\u05DB\u05DC';  /* ✓ אשר הכל */
        actions.appendChild(btnMute);
        actions.appendChild(btnAckAll);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        /* ── Stats Bar ── */
        var statsBar = _el('div', 'wow-ap-stats');

        /* ── Cards Container ── */
        var cardsWrap = _el('div', 'wow-ap-cards-wrap');
        var cardsEl   = _el('div', 'wow-ap-cards');
        cardsWrap.appendChild(cardsEl);

        /* ── Empty State ── */
        var emptyEl = _el('div', 'wow-ap-no-alerts');
        emptyEl.textContent = '\u2713 \u05D0\u05D9\u05DF \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E4\u05E2\u05D9\u05DC\u05D5\u05EA \u2014 \u05DB\u05DC \u05D4\u05DE\u05E2\u05E8\u05DB\u05D5\u05EA \u05EA\u05E7\u05D9\u05E0\u05D5\u05EA';
        /* ✓ אין התראות פעילות — כל המערכות תקינות */

        /* ── Skeleton ── */
        var skeleton = _el('div', 'wow-ap-skeleton');

        /* ── Footer ── */
        var footer = _el('div', 'wow-ap-footer');
        footer.textContent = 'WOW Triage Panel v100 \u00B7 FLIP Animations + Auto-Grouping';

        /* Assemble */
        root.appendChild(toolbar);
        root.appendChild(statsBar);
        root.appendChild(cardsWrap);
        root.appendChild(emptyEl);
        root.appendChild(skeleton);
        root.appendChild(footer);
        shadow.appendChild(root);


        /* ═══ State ═══ */
        var prevAlertIds    = {};     /* Track for new-alert detection    */
        var acknowledgedIds = {};     /* Acknowledged alerts              */
        var isMuted         = false;  /* Sound muted?                     */
        var audioCtx        = null;   /* Web Audio context (lazy)         */
        var demoInterval    = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;


        /* ═══════════════════════════════════════════════════
         *  THE GEM — Phase 1: Triage Engine
         *
         *  Raw PI data arrives as rows. The Triage Engine:
         *  1. Filters out all normal/healthy values
         *  2. Classifies severity (critical/warning/info)
         *  3. Sorts by risk weight (critical first)
         *  4. Auto-groups similar alerts above threshold
         *  5. Returns ONLY actionable alerts for rendering
         *
         *  A classic PI panel renders 100 rows for 100 tags.
         *  The Triage Panel may render only 5 cards from
         *  those 100 rows — because 95 were healthy.
         * ═══════════════════════════════════════════════════ */
        function _processTriage(rows) {
            var critLimit = config.CriticalLimit || 90;
            var warnLimit = config.WarningLimit  || 70;
            var alerts = [];

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var val = parseFloat(row.Value);
                var isDigital = isNaN(val);
                if (isDigital) val = row.Value;

                var severity, weight;

                if (isDigital) {
                    /* Digital State classification */
                    var state = String(val).toLowerCase();
                    if (state === 'alarm' || state === 'critical' ||
                        state === 'trip'  || state === 'fault') {
                        severity = 'critical'; weight = 3;
                    } else if (state === 'warning' || state === 'high' || state === 'low') {
                        severity = 'warning'; weight = 2;
                    } else if (state === 'normal' || state === 'ok' ||
                               state === 'good'   || state === 'running') {
                        continue; /* Skip healthy — Data Discipline */
                    } else {
                        severity = 'info'; weight = 1;
                    }
                } else {
                    /* Numeric threshold classification */
                    if (val >= critLimit) {
                        severity = 'critical'; weight = 3;
                    } else if (val >= warnLimit) {
                        severity = 'warning'; weight = 2;
                    } else {
                        continue; /* Below warning threshold — skip */
                    }
                }

                alerts.push({
                    id:        row.Label || ('alert-' + i),
                    label:     row.Label || ('Tag ' + i),
                    value:     isDigital ? val : parseFloat(row.Value),
                    severity:  severity,
                    weight:    weight,
                    timestamp: row.Time || new Date(),
                    isGroup:   false
                });
            }

            /* Sort: critical (3) → warning (2) → info (1) */
            alerts.sort(function (a, b) { return b.weight - a.weight; });

            return alerts;
        }


        /* ═══════════════════════════════════════════════════
         *  Auto-Grouping — Cognitive Load Reduction
         *
         *  When a cascade failure generates 30 similar warnings,
         *  showing each one individually causes Alarm Fatigue.
         *  Auto-Grouping collapses them into a single summary
         *  card: "+27 אזהרות נוספות"
         *
         *  Critical alerts are NEVER grouped — each one demands
         *  individual attention. Only warnings and info can
         *  be collapsed above the GroupThreshold.
         * ═══════════════════════════════════════════════════ */
        function _autoGroup(alerts) {
            var threshold = config.GroupThreshold || 5;
            if (!config.AutoGroup || alerts.length <= threshold) return alerts;

            var critical = [];
            var warnings = [];
            var infos    = [];

            for (var i = 0; i < alerts.length; i++) {
                var a = alerts[i];
                if (a.severity === 'critical') critical.push(a);
                else if (a.severity === 'warning') warnings.push(a);
                else infos.push(a);
            }

            var result = critical.slice(); /* Critical always individual */

            /* Group warnings if above threshold */
            if (warnings.length > threshold) {
                for (var w = 0; w < threshold; w++) {
                    result.push(warnings[w]);
                }
                var wRemaining = warnings.length - threshold;
                result.push({
                    id:       '_group_warning',
                    label:    '+' + wRemaining + ' \u05D0\u05D6\u05D4\u05E8\u05D5\u05EA \u05E0\u05D5\u05E1\u05E4\u05D5\u05EA',
                    /* +N אזהרות נוספות */
                    value:    wRemaining,
                    severity: 'warning',
                    weight:   2,
                    isGroup:  true,
                    count:    wRemaining
                });
            } else {
                result = result.concat(warnings);
            }

            /* Group infos if above threshold */
            if (infos.length > threshold) {
                for (var n = 0; n < Math.min(2, infos.length); n++) {
                    result.push(infos[n]);
                }
                var iRemaining = infos.length - 2;
                result.push({
                    id:       '_group_info',
                    label:    '+' + iRemaining + ' \u05D4\u05D5\u05D3\u05E2\u05D5\u05EA \u05E0\u05D5\u05E1\u05E4\u05D5\u05EA',
                    /* +N הודעות נוספות */
                    value:    iRemaining,
                    severity: 'info',
                    weight:   1,
                    isGroup:  true,
                    count:    iRemaining
                });
            } else {
                result = result.concat(infos);
            }

            return result;
        }


        /* ═══════════════════════════════════════════════════
         *  THE GEM — Phase 2: FLIP Animation Engine
         *
         *  FLIP = First, Last, Invert, Play
         *
         *  Traditional list updates cause layout jumps — cards
         *  suddenly appear at new positions, disorienting the
         *  operator. FLIP records positions before and after
         *  the DOM change, then uses GPU-accelerated transforms
         *  to animate cards from old → new positions.
         *
         *  Why transform (not top/margin)?
         *  transform runs on the GPU Compositor layer. It never
         *  triggers Layout or Paint — just Composite. This
         *  guarantees 60fps even on weak industrial PCs with
         *  heavy PI Vision graphs in the background.
         *
         *  DocumentFragment: the new DOM tree is built entirely
         *  in memory. container.replaceChildren(fragment) is a
         *  single C++ binding call — one reflow, not N reflows.
         * ═══════════════════════════════════════════════════ */
        function _updateWithFLIP(alerts) {

            /* ── FIRST: Record current positions ── */
            var firstPositions = {};
            var children = cardsEl.children;
            for (var i = 0; i < children.length; i++) {
                var child = children[i];
                firstPositions[child.dataset.id] = child.getBoundingClientRect();
            }

            /* ── Build new DOM in memory (DocumentFragment) ── */
            var fragment = document.createDocumentFragment();
            for (var j = 0; j < alerts.length; j++) {
                fragment.appendChild(_buildCard(alerts[j]));
            }

            /* ── Single atomic DOM update ── */
            cardsEl.replaceChildren(fragment);

            /* ── LAST + INVERT + PLAY ── */
            var newChildren = cardsEl.children;
            for (var k = 0; k < newChildren.length; k++) {
                var card = newChildren[k];
                var id   = card.dataset.id;
                var lastRect = card.getBoundingClientRect();
                var firstRect = firstPositions[id];

                if (firstRect) {
                    /* Existing card — animate position change */
                    var deltaY = firstRect.top - lastRect.top;
                    var deltaX = firstRect.left - lastRect.left;

                    if (Math.abs(deltaY) > 1 || Math.abs(deltaX) > 1) {
                        /* INVERT: snap back to old position visually */
                        card.style.transition = 'none';
                        card.style.transform  = 'translate(' + deltaX + 'px, ' + deltaY + 'px)';

                        /* Force browser to flush pending layout */
                        void card.offsetHeight;

                        /* PLAY: animate to new position */
                        card.style.transition = 'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
                        card.style.transform  = '';
                    }
                } else {
                    /* New card — enter animation (slide in from right) */
                    card.style.opacity   = '0';
                    card.style.transform = 'translateX(20px) scale(0.95)';

                    /* Closure to capture card reference */
                    (function (c) {
                        requestAnimationFrame(function () {
                            c.style.transition = 'opacity 0.5s ease, transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)';
                            c.style.opacity    = '1';
                            c.style.transform  = '';
                        });
                    })(card);
                }
            }

            /* ── Toggle empty state ── */
            emptyEl.style.display    = alerts.length === 0 ? 'flex' : 'none';
            cardsWrap.style.display  = alerts.length === 0 ? 'none' : 'block';
        }


        /* ═══ Card Builder ═══ */
        function _buildCard(alert) {
            var card = _el('div', 'wow-ap-card wow-ap-card-' + alert.severity);
            card.dataset.id = alert.id;

            /* Pulse of Death for unacknowledged critical */
            if (alert.severity === 'critical' && !alert.isGroup && !acknowledgedIds[alert.id]) {
                card.classList.add('wow-ap-card-pulse');
            }

            /* Group card styling */
            if (alert.isGroup) {
                card.classList.add('wow-ap-card-group');
            }

            /* Acknowledged styling */
            if (acknowledgedIds[alert.id]) {
                card.classList.add('wow-ap-card-ack');
            }

            /* ── Icon ── */
            var icon = _el('div', 'wow-ap-card-icon');
            icon.textContent = alert.isGroup
                ? '\uD83D\uDCCB'                      /* 📋 */
                : (SEV_ICON[alert.severity] || '\u2139\uFE0F');

            /* ── Content ── */
            var content = _el('div', 'wow-ap-card-content');

            var title = _el('div', 'wow-ap-card-title');
            title.textContent = alert.label;

            var value = _el('div', 'wow-ap-card-value');
            if (alert.isGroup) {
                value.textContent = alert.count + ' \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05DE\u05E7\u05D5\u05D1\u05E6\u05D5\u05EA';
                /* N התראות מקובצות */
            } else {
                var displayVal = typeof alert.value === 'number'
                    ? alert.value.toFixed(config.Decimals || 1)
                    : String(alert.value);
                value.textContent = displayVal;
            }

            content.appendChild(title);
            content.appendChild(value);

            /* ── Time badge ── */
            var timeBadge = _el('div', 'wow-ap-card-time');
            timeBadge.textContent = _formatTime(alert.timestamp);

            /* ── Severity badge ── */
            var badge = _el('div', 'wow-ap-card-badge wow-ap-badge-' + alert.severity);
            badge.textContent = SEV_LABEL[alert.severity] || alert.severity;

            /* Assemble card */
            card.appendChild(icon);
            card.appendChild(content);
            card.appendChild(timeBadge);
            card.appendChild(badge);

            /* Click to acknowledge */
            card.addEventListener('click', function () {
                if (alert.isGroup) return;
                acknowledgedIds[alert.id] = true;
                card.classList.add('wow-ap-card-ack');
                card.classList.remove('wow-ap-card-pulse');
            });

            return card;
        }


        /* ═══ Time Formatting ═══ */
        function _formatTime(ts) {
            if (!ts) return '';
            var d = (ts instanceof Date) ? ts : new Date(ts);
            if (isNaN(d.getTime())) return '';
            var h = String(d.getHours());
            var m = String(d.getMinutes());
            var sec = String(d.getSeconds());
            if (h.length < 2) h = '0' + h;
            if (m.length < 2) m = '0' + m;
            if (sec.length < 2) sec = '0' + sec;
            return h + ':' + m + ':' + sec;
        }


        /* ═══════════════════════════════════════════════════
         *  Sound Alert — Web Audio API
         *
         *  Instead of loading audio files (which may not exist
         *  on all PI Vision deployments), we synthesize a
         *  short industrial chime using an OscillatorNode.
         *
         *  Critical: two-tone 880→660→880 Hz (urgent, piercing)
         *  Warning:  single-tone 440 Hz (gentle fade)
         *
         *  The AudioContext is created lazily on first use
         *  (browsers require user gesture for audio policy,
         *  but PI Vision operators interact with the dashboard
         *  before alarms typically arrive).
         * ═══════════════════════════════════════════════════ */
        function _playSound(severity) {
            if (isMuted || !config.EnableSound) return;

            try {
                if (!audioCtx) {
                    var AC = window.AudioContext || window.webkitAudioContext;
                    if (!AC) return;
                    audioCtx = new AC();
                }
                if (audioCtx.state === 'suspended') {
                    audioCtx.resume();
                }

                var osc  = audioCtx.createOscillator();
                var gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);

                var now = audioCtx.currentTime;

                if (severity === 'critical') {
                    /* Two-tone urgent chime: 880→660→880 Hz */
                    osc.frequency.setValueAtTime(880, now);
                    osc.frequency.setValueAtTime(660, now + 0.1);
                    osc.frequency.setValueAtTime(880, now + 0.2);
                    gain.gain.setValueAtTime(0.25, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                    osc.start(now);
                    osc.stop(now + 0.6);
                } else {
                    /* Single gentle tone: 440 Hz */
                    osc.frequency.setValueAtTime(440, now);
                    gain.gain.setValueAtTime(0.12, now);
                    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
                    osc.start(now);
                    osc.stop(now + 0.4);
                }
            } catch (e) {
                /* Audio not available — silent fallback */
            }
        }


        /* ═══════════════════════════════════════════════════
         *  Browser Notification (Background Tab Alert)
         *
         *  When the operator switches to another tab (email,
         *  report, etc.), critical alerts still need to reach
         *  them. The Notification API creates an OS-level
         *  toast that appears even when Chrome is minimized.
         *
         *  Only fires when:
         *  1. Tab is hidden (Page Visibility API)
         *  2. Permission is granted
         *  3. Alert is critical (no spam for warnings)
         * ═══════════════════════════════════════════════════ */
        function _sendNotification(title, body) {
            if (!config.EnableNotifications) return;
            if (!document.hidden) return;  /* Only when tab is hidden */
            if (!('Notification' in window)) return;

            if (Notification.permission === 'granted') {
                try {
                    new Notification(title, {
                        body: body,
                        tag:  'wow-alert-' + Date.now(),
                        requireInteraction: false
                    });
                } catch (e) { /* Notification API not available */ }
            } else if (Notification.permission !== 'denied') {
                Notification.requestPermission();
            }
        }


        /* ═══ New Alert Detection ═══ */
        function _detectNewAlerts(alerts) {
            var newCritical = [];
            var currentIds  = {};

            for (var i = 0; i < alerts.length; i++) {
                var a = alerts[i];
                if (a.isGroup) continue;
                currentIds[a.id] = true;

                if (!prevAlertIds[a.id] && a.severity === 'critical') {
                    newCritical.push(a);
                }
            }

            /* Sound + Notification for new critical alerts */
            if (newCritical.length > 0) {
                _playSound('critical');
                _sendNotification(
                    '\u26A0 \u05D4\u05EA\u05E8\u05D0\u05D4 \u05E7\u05E8\u05D9\u05D8\u05D9\u05EA \u2014 ' + newCritical[0].label,
                    /* ⚠ התראה קריטית — [label] */
                    newCritical.length > 1
                        ? newCritical.length + ' \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA \u05E7\u05E8\u05D9\u05D8\u05D9\u05D5\u05EA \u05D7\u05D3\u05E9\u05D5\u05EA'
                        : '\u05E2\u05E8\u05DA: ' + newCritical[0].value
                );
            }

            prevAlertIds = currentIds;
        }


        /* ═══ Stats Bar ═══ */
        function _updateStats(alerts) {
            var crit = 0, warn = 0, info = 0, total = alerts.length;
            for (var i = 0; i < alerts.length; i++) {
                var a = alerts[i];
                var count = a.isGroup ? a.count : 1;
                if (a.severity === 'critical') crit += count;
                else if (a.severity === 'warning') warn += count;
                else info += count;
            }

            statsBar.innerHTML =
                '<span class="wow-ap-stat">' +
                    '\u05E1\u05D4"\u05DB: <b>' + total + '</b></span>' +
                '<span class="wow-ap-stat wow-ap-stat-crit">' +
                    '\u05E7\u05E8\u05D9\u05D8\u05D9: <b>' + crit + '</b></span>' +
                '<span class="wow-ap-stat wow-ap-stat-warn">' +
                    '\u05D0\u05D6\u05D4\u05E8\u05D4: <b>' + warn + '</b></span>' +
                '<span class="wow-ap-stat wow-ap-stat-info">' +
                    '\u05DE\u05D9\u05D3\u05E2: <b>' + info + '</b></span>';
        }


        /* ═══ Mute Toggle ═══ */
        function _onMuteClick() {
            isMuted = !isMuted;
            btnMute.textContent = isMuted
                ? '\uD83D\uDD0A \u05D1\u05D8\u05DC \u05D4\u05E9\u05EA\u05E7\u05D4'   /* 🔊 בטל השתקה */
                : '\uD83D\uDD07 \u05D4\u05E9\u05EA\u05E7';                             /* 🔇 השתק */
            btnMute.classList.toggle('wow-ap-btn-active', isMuted);
        }
        btnMute.addEventListener('click', _onMuteClick);


        /* ═══ Acknowledge All ═══ */
        function _onAckAllClick() {
            var cards = cardsEl.querySelectorAll('.wow-ap-card');
            for (var i = 0; i < cards.length; i++) {
                cards[i].classList.add('wow-ap-card-ack');
                cards[i].classList.remove('wow-ap-card-pulse');
                acknowledgedIds[cards[i].dataset.id] = true;
            }
        }
        btnAckAll.addEventListener('click', _onAckAllClick);


        /* ═══ Config ═══ */
        function _applyConfig() {
            titleEl.textContent = config.Title || 'Executive Triage Panel';

            var ff = config.fontFamily || 'Segoe UI';
            var fs = config.fontSize   || 12;
            root.style.setProperty('--wow-ap-font',      '"' + ff + '", Arial, sans-serif');
            root.style.setProperty('--wow-ap-font-size',  fs + 'px');
        }

        ['Title', 'CriticalLimit', 'WarningLimit', 'GroupThreshold',
         'AutoGroup', 'EnableSound', 'EnableNotifications', 'Decimals',
         'DemoMode', 'fontFamily', 'fontSize'
        ].forEach(function (key) {
            scope.$watch('config.' + key, function () { _applyConfig(); });
        });


        /* ═══ Data Update ═══ */
        function _processData(data) {
            skeleton.style.display = 'none';

            /* Phase 1: Triage */
            var alerts = _processTriage(data.Rows);

            /* Auto-Group */
            alerts = _autoGroup(alerts);

            /* Detect new critical alerts → sound + notification */
            _detectNewAlerts(alerts);

            /* Update stats */
            _updateStats(alerts);

            /* Phase 2: FLIP render */
            _updateWithFLIP(alerts);
        }

        self.onDataUpdate = function (data) {
            if (config.DemoMode) return;
            if (!data || !data.Rows) return;

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


        /* ═══════════════════════════════════════════════════
         *  Demo Mode — Simulated Control Room Scenario
         *
         *  Phases cycle every 3s to showcase all features:
         *  - Steady-state: a few normal warnings
         *  - Phase 1: new critical turbine alarm (enter anim)
         *  - Phase 3: cascade failure → 15 pressure alarms
         *             (Auto-Grouping kicks in)
         *  - Phase 5: turbine resolves (card exits)
         *  - Phase 6: cascade resolves (group card exits)
         * ═══════════════════════════════════════════════════ */
        function _startDemo() {
            skeleton.style.display = 'none';

            var demoAlerts = [
                { id: 'demo-boiler-1', label: '\u05D3\u05D5\u05D3 \u05E7\u05D9\u05D8\u05D5\u05E8 #1 \u2014 \u05DC\u05D7\u05E5 \u05D2\u05D1\u05D5\u05D4',
                  value: 95.3, severity: 'critical', weight: 3, timestamp: new Date(), isGroup: false },
                /* דוד קיטור #1 — לחץ גבוה */

                { id: 'demo-boiler-2', label: '\u05D3\u05D5\u05D3 \u05E7\u05D9\u05D8\u05D5\u05E8 #2 \u2014 \u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4',
                  value: 87.1, severity: 'warning', weight: 2, timestamp: new Date(), isGroup: false },
                /* דוד קיטור #2 — טמפרטורה */

                { id: 'demo-pump-3', label: '\u05DE\u05E9\u05D0\u05D1\u05D4 \u05E8\u05D0\u05E9\u05D9\u05EA \u2014 \u05D6\u05E8\u05DD \u05D7\u05E8\u05D9\u05D2',
                  value: 78.5, severity: 'warning', weight: 2, timestamp: new Date(), isGroup: false },
                /* משאבה ראשית — זרם חריג */

                { id: 'demo-valve-4', label: '\u05E9\u05E1\u05EA\u05D5\u05DD \u05D1\u05D8\u05D9\u05D7\u05D5\u05EA \u2014 \u05DE\u05E6\u05D1 \u05E4\u05EA\u05D5\u05D7',
                  value: 'Alarm', severity: 'critical', weight: 3, timestamp: new Date(), isGroup: false },
                /* שסתום בטיחות — מצב פתוח */

                { id: 'demo-temp-5', label: '\u05D7\u05D9\u05D9\u05E9\u05DF \u05D8\u05DE\u05E4\u05F3 \u05E7\u05D5 3',
                  value: 72.0, severity: 'warning', weight: 2, timestamp: new Date(), isGroup: false }
                /* חיישן טמפ׳ קו 3 */
            ];

            var demoPhase = 0;

            /* Initial render */
            var grouped = _autoGroup(demoAlerts);
            _detectNewAlerts(grouped);
            _updateStats(grouped);
            _updateWithFLIP(grouped);

            demoInterval = setInterval(function () {
                demoPhase = (demoPhase + 1) % 8;

                /* Phase 1: New critical turbine alert */
                if (demoPhase === 1) {
                    demoAlerts.push({
                        id: 'demo-turbine-new',
                        label: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 #2 \u2014 \u05E8\u05E2\u05D9\u05D3\u05D5\u05EA \u05D7\u05E8\u05D9\u05D2\u05D5\u05EA',
                        /* טורבינה #2 — רעידות חריגות */
                        value: 98.7, severity: 'critical', weight: 3,
                        timestamp: new Date(), isGroup: false
                    });
                }

                /* Phase 3: Cascade failure — 15 pressure sensor alarms */
                if (demoPhase === 3) {
                    for (var f = 0; f < 15; f++) {
                        demoAlerts.push({
                            id: 'demo-flood-' + f,
                            label: '\u05D7\u05D9\u05D9\u05E9\u05DF \u05DC\u05D7\u05E5 #' + (f + 10) + ' \u2014 \u05EA\u05E7\u05E9\u05D5\u05E8\u05EA',
                            /* חיישן לחץ #N — תקשורת */
                            value: 'Warning', severity: 'warning', weight: 2,
                            timestamp: new Date(), isGroup: false
                        });
                    }
                }

                /* Phase 5: Turbine resolves */
                if (demoPhase === 5) {
                    demoAlerts = demoAlerts.filter(function (a) {
                        return a.id !== 'demo-turbine-new';
                    });
                }

                /* Phase 6: Cascade resolves */
                if (demoPhase === 6) {
                    demoAlerts = demoAlerts.filter(function (a) {
                        return a.id.indexOf('demo-flood') === -1;
                    });
                }

                /* Sort by weight */
                demoAlerts.sort(function (a, b) { return b.weight - a.weight; });

                var grouped = _autoGroup(demoAlerts);
                _detectNewAlerts(grouped);
                _updateStats(grouped);
                _updateWithFLIP(grouped);
            }, 3000);
        }


        /* ═══ Init ═══ */
        _applyConfig();
        if (config.DemoMode) {
            _startDemo();
        }


        /* ═══ Cleanup ═══ */
        scope.$on('$destroy', function () {
            if (demoInterval) clearInterval(demoInterval);
            clearTimeout(_dataDebounceId);
            if (audioCtx) {
                try { audioCtx.close(); } catch (e) {}
            }
            btnMute.removeEventListener('click', _onMuteClick);
            btnAckAll.removeEventListener('click', _onAckAllClick);
            _pendingData = null;
            prevAlertIds    = {};
            acknowledgedIds = {};
        });
    };


    /* ═══ Symbol Registration ═══ */
    PV.symbolCatalog.register({
        typeName:           'alertpanel-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05E4\u05D0\u05E0\u05DC \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA WOW v100',
        /* פאנל התראות WOW v100 */
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        getDefaultConfig: function () {
            return {
                DataShape:            'Table',
                Height:               500,
                Width:                450,
                Title:                'Executive Triage Panel',
                DemoMode:             true,
                CriticalLimit:        90,
                WarningLimit:         70,
                GroupThreshold:       5,
                AutoGroup:            true,
                EnableSound:          true,
                EnableNotifications:  true,
                Decimals:             1,
                fontFamily:           'Segoe UI',
                fontSize:             12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E4\u05D0\u05E0\u05DC \u05D4\u05EA\u05E8\u05D0\u05D5\u05EA WOW'
        /* הגדרות פאנל התראות WOW */
    });

})(window.PIVisualization);
