/**
 * ═══════════════════════════════════════════════════════
 *  sym-kpicard-wow.js — Executive KPI Card Dashboard WOW v100
 * ═══════════════════════════════════════════════════════
 *
 *  Self-contained KPI card dashboard with Shadow DOM.
 *  DOM-based card grid + Canvas sparklines.
 *  Web Worker for off-thread statistics computation.
 *
 *  Key features:
 *    • Responsive card grid (flexbox, 3 sizes)
 *    • Sparkline mini-charts per card (Canvas, DPR-aware)
 *    • Lerp animation for value morphing (60fps)
 *    • Web Worker: trend, delta, min/max, EWMA, percentiles, Z-Score
 *    • Threshold-based status colors (ok/warn/crit)
 *    • Ghost loading skeleton
 *    • Demo mode with 6 oscillating KPIs
 *    • Export CSV
 *    • Shadow DOM isolation
 *    • 0 external dependencies
 *
 *  DataShape : Table (Multiple attributes → rows)
 *  Version   : WOW KPI v100
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════
     *  CONSTANTS & PALETTE
     * ═══════════════════════════════════════════════════ */

    var MAX_SPARKLINE_PTS = 60;

    var CLR = {
        bg:        '#060C18',
        accent:    '#5BC0EB',
        ok:        '#00F5D4',
        okDim:     'rgba(0, 245, 212, 0.12)',
        warn:      '#FFCC00',
        warnDim:   'rgba(255, 204, 0, 0.12)',
        crit:      '#FF3B30',
        critDim:   'rgba(255, 59, 48, 0.12)',
        text:      '#ECF0F1',
        textMuted: '#8899AA',
        textDim:   '#556677',
        sparkOk:   'rgba(0, 245, 212, 0.6)',
        sparkFill: 'rgba(0, 245, 212, 0.08)',
        sparkWarn: 'rgba(255, 204, 0, 0.6)',
        sparkCrit: 'rgba(255, 59, 48, 0.6)'
    };

    // Hebrew demo KPIs — power plant monitoring
    var DEMO_KPIS = [
        { label: '\u05D4\u05E1\u05E4\u05E7 \u05D7\u05E9\u05DE\u05DC\u05D9',  unit: 'MW',   base: 620,  range: 80,  warn: 680, crit: 720 },
        { label: '\u05EA\u05D3\u05E8 \u05D2\u05E0\u05E8\u05D8\u05D5\u05E8',  unit: 'Hz',   base: 50.0, range: 0.4, warn: 50.3, crit: 50.5 },
        { label: '\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4 \u05DE\u05E2\u05D2\u05DC', unit: '\u00B0C', base: 540,  range: 40,  warn: 560, crit: 580 },
        { label: '\u05DC\u05D7\u05E5 \u05E7\u05D9\u05D8\u05D5\u05E8',        unit: 'bar',  base: 165,  range: 20,  warn: 178, crit: 185 },
        { label: '\u05E8\u05E2\u05D9\u05D3\u05D5\u05EA \u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4', unit: 'mm/s', base: 2.8,  range: 1.5, warn: 3.8, crit: 4.5 },
        { label: '\u05E0\u05E6\u05D9\u05DC\u05D5\u05EA \u05DE\u05E2\u05E8\u05DB\u05EA',  unit: '%',   base: 92,   range: 6,   warn: 88, crit: 85 }
    ];

    /* ═══════════════════════════════════════════════════
     *  HELPERS
     * ═══════════════════════════════════════════════════ */

    function lerp(a, b, t) { return a + (b - a) * t; }

    function debounce(fn, ms) {
        var timer;
        return function () {
            var args = arguments, self = this;
            clearTimeout(timer);
            timer = setTimeout(function () { fn.apply(self, args); }, ms);
        };
    }

    function _el(tag, cls) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        return e;
    }

    function fmtVal(v, dec) {
        if (v == null || isNaN(v)) return '--';
        return v.toFixed(dec != null ? dec : 1);
    }

    function fmtTime() {
        var d = new Date();
        var h = d.getHours(), m = d.getMinutes(), s = d.getSeconds();
        return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    /* ═══════════════════════════════════════════════════
     *  SYMBOL IMPLEMENTATION
     * ═══════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    symbolVis.prototype.init = function (scope, elem) {

        /* ── Script Base Path ─────────────────────────── */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-kpicard-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].src;
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            // Dynamic fallback via PI Vision base URL
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ── Shadow DOM ───────────────────────────────── */
        var mountEl = elem[0].querySelector('.wow-kpicard-root-mount');
        if (!mountEl) mountEl = elem[0];
        var shadow;
        try   { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-kpicard-wow.css';
        shadow.appendChild(linkEl);

        /* ── DOM Scaffold ─────────────────────────────── */
        var root       = _el('div', 'wow-kpi-root');
        var toolbar    = _el('div', 'wow-kpi-toolbar');
        var titleEl    = _el('span', 'wow-kpi-title');
        var actions    = _el('div', 'wow-kpi-toolbar-actions');
        var liveEl     = _el('span', 'wow-kpi-live');
        liveEl.innerHTML = '<span class="wow-kpi-live-dot"></span><span class="wow-kpi-live-time"></span>';
        var btnExport  = _el('button', 'wow-kpi-btn'); btnExport.textContent  = '\uD83D\uDCE5 CSV';
        var btnReset   = _el('button', 'wow-kpi-btn'); btnReset.textContent   = '\uD83D\uDD04';
        actions.appendChild(btnExport);
        actions.appendChild(btnReset);
        actions.appendChild(liveEl);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        var summaryBar = _el('div', 'wow-kpi-summary');
        var bodyEl     = _el('div', 'wow-kpi-body');
        var gridEl     = _el('div', 'wow-kpi-grid');
        bodyEl.appendChild(gridEl);

        var skeleton = _el('div', 'wow-kpi-skeleton');
        bodyEl.appendChild(skeleton);

        var footer = _el('div', 'wow-kpi-footer');
        footer.textContent = 'WOW KPI v100 \u00B7 Executive KPI Card Dashboard';

        root.appendChild(toolbar);
        root.appendChild(summaryBar);
        root.appendChild(bodyEl);
        root.appendChild(footer);
        shadow.appendChild(root);

        /* ── State ─────────────────────────────────────── */
        var config = scope.config;
        var cards  = [];     // [{label, unit, current, target, values[], status, stats, domEls}]
        var isRunning    = false;
        var idleMode     = false;
        var animId       = null;
        var demoTime     = 0;
        var worker       = null;
        var workerReady  = false;

        /* ── Config Defaults ───────────────────────────── */
        if (!config.Title)          config.Title          = 'Executive KPI Dashboard';
        if (!config.CardSize)       config.CardSize       = 'medium';
        if (config.Decimals == null) config.Decimals      = 1;
        if (config.DemoMode === undefined) config.DemoMode = true;
        if (config.ShowSparkline === undefined) config.ShowSparkline = true;
        if (config.ShowTrend === undefined) config.ShowTrend = true;
        if (config.ShowDelta === undefined) config.ShowDelta = true;
        if (config.ShowMinMax === undefined) config.ShowMinMax = true;
        if (config.SparklinePoints == null) config.SparklinePoints = 60;
        if (config.WarnThreshold == null) config.WarnThreshold = 0;
        if (config.CritThreshold == null) config.CritThreshold = 0;
        if (!config.ThresholdMode)  config.ThresholdMode  = 'high';
        if (!config.Unit)           config.Unit           = '';
        if (!config.fontFamily)     config.fontFamily     = 'Segoe UI';
        if (config.fontSize == null)  config.fontSize     = 12;
        if (config.valueFontSize == null) config.valueFontSize = 32;

        titleEl.textContent = config.Title;

        /* ── Web Worker ───────────────────────────────── */
        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-kpicard-worker.js');
            workerReady = true;
            worker.onmessage = function (e) {
                if (e.data.type === 'RESULT') {
                    _applyWorkerStats(e.data.stats);
                }
            };
            worker.onerror = function () { workerReady = false; };
        } catch (e) {
            workerReady = false;
        }

        /* ═══════════════════════════════════════════════
         *  CARD DOM MANAGEMENT
         * ═══════════════════════════════════════════════ */

        function _createCardDOM(card, idx) {
            var sizeClass = 'size-' + (config.CardSize || 'medium');
            var cardEl = _el('div', 'wow-kpi-card ' + sizeClass);

            var statusBar = _el('div', 'wow-kpi-status-bar');
            var labelEl   = _el('div', 'wow-kpi-card-label');
            labelEl.textContent = card.label;

            var valRow = _el('div', 'wow-kpi-val-row');
            var valEl  = _el('span', 'wow-kpi-val');
            valEl.textContent = '--';
            var unitEl = _el('span', 'wow-kpi-unit');
            unitEl.textContent = card.unit || config.Unit || '';
            valRow.appendChild(valEl);
            valRow.appendChild(unitEl);

            var metaEl = _el('div', 'wow-kpi-meta');
            var trendEl = _el('span', 'wow-kpi-trend');
            var deltaEl = _el('span', 'wow-kpi-delta');
            var outlierEl = _el('span', 'wow-kpi-outlier');
            outlierEl.textContent = '\u26A0 \u05D7\u05E8\u05D9\u05D2';
            outlierEl.style.display = 'none';
            metaEl.appendChild(trendEl);
            metaEl.appendChild(deltaEl);
            metaEl.appendChild(outlierEl);

            var minmaxEl = _el('div', 'wow-kpi-minmax');

            var sparkWrap = _el('div', 'wow-kpi-spark');
            var sparkCanvas = document.createElement('canvas');
            sparkCanvas.style.height = (config.CardSize === 'small' ? 28 : config.CardSize === 'large' ? 50 : 36) + 'px';
            sparkWrap.appendChild(sparkCanvas);

            cardEl.appendChild(statusBar);
            cardEl.appendChild(labelEl);
            cardEl.appendChild(valRow);
            cardEl.appendChild(metaEl);
            if (config.ShowMinMax) cardEl.appendChild(minmaxEl);
            if (config.ShowSparkline) cardEl.appendChild(sparkWrap);

            gridEl.appendChild(cardEl);

            // Store DOM references
            card.domEls = {
                card:     cardEl,
                status:   statusBar,
                label:    labelEl,
                val:      valEl,
                unit:     unitEl,
                trend:    trendEl,
                delta:    deltaEl,
                outlier:  outlierEl,
                minmax:   minmaxEl,
                spark:    sparkCanvas,
                sparkCtx: sparkCanvas.getContext('2d')
            };
        }

        function _clearCards() {
            while (gridEl.firstChild) gridEl.removeChild(gridEl.firstChild);
            cards = [];
        }

        /* ═══════════════════════════════════════════════
         *  STATUS COMPUTATION
         * ═══════════════════════════════════════════════ */

        function _getStatus(value, card) {
            var warnT = card.warnT || config.WarnThreshold || 0;
            var critT = card.critT || config.CritThreshold || 0;
            var mode  = config.ThresholdMode || 'high';

            if (warnT === 0 && critT === 0) return 'ok';

            if (mode === 'high') {
                if (critT > 0 && value >= critT) return 'crit';
                if (warnT > 0 && value >= warnT) return 'warn';
            } else if (mode === 'low') {
                if (critT > 0 && value <= critT) return 'crit';
                if (warnT > 0 && value <= warnT) return 'warn';
            } else {
                // dual: distance from 0
                var abs = Math.abs(value);
                if (critT > 0 && abs >= critT) return 'crit';
                if (warnT > 0 && abs >= warnT) return 'warn';
            }
            return 'ok';
        }

        function _statusColor(status) {
            if (status === 'crit') return CLR.crit;
            if (status === 'warn') return CLR.warn;
            return CLR.ok;
        }

        /* ═══════════════════════════════════════════════
         *  DEMO DATA
         * ═══════════════════════════════════════════════ */

        function _initDemo() {
            _clearCards();
            for (var i = 0; i < DEMO_KPIS.length; i++) {
                var d = DEMO_KPIS[i];
                var initial = d.base + (Math.random() - 0.5) * d.range * 0.5;
                var card = {
                    label:    d.label,
                    unit:     d.unit,
                    current:  initial,
                    target:   initial,
                    values:   [initial],
                    warnT:    d.warn,
                    critT:    d.crit,
                    status:   'ok',
                    stats:    null,
                    domEls:   null
                };
                cards.push(card);
                _createCardDOM(card, i);
            }
        }

        function _generateDemoTargets() {
            demoTime += 0.016;
            for (var i = 0; i < cards.length; i++) {
                var d    = DEMO_KPIS[i];
                var card = cards[i];
                var val  = d.base + d.range * 0.4 * Math.sin(demoTime * (0.3 + i * 0.15) + i * 1.5);

                // Occasional spikes
                if (i === 0) val += Math.max(0, Math.sin(demoTime * 0.2)) * d.range * 0.6;
                if (i === 4) val += Math.max(0, Math.sin(demoTime * 0.15 + 1.8)) * d.range * 0.7;

                // KPI 5 (utilization) inverted thresholds — lower is worse
                if (i === 5) val = d.base - Math.abs(Math.sin(demoTime * 0.25 + 0.8)) * d.range * 0.5;

                card.target = val;

                // Accumulate sparkline values
                if (card.values.length >= (config.SparklinePoints || MAX_SPARKLINE_PTS)) {
                    card.values.shift();
                }
                card.values.push(val);
            }
        }

        /* ═══════════════════════════════════════════════
         *  DATA UPDATE (Live PI Vision Bridge)
         * ═══════════════════════════════════════════════ */

        var _pendingData    = null;
        var _dataDebounceId = null;

        function _processData(data) {
            var rows    = data.Rows;
            var numCards = rows.length;

            // Remove skeleton
            if (skeleton && skeleton.parentNode) {
                skeleton.parentNode.removeChild(skeleton);
                skeleton = null;
            }

            // Initialize cards on first data or count change
            if (cards.length !== numCards) {
                _clearCards();
                for (var i = 0; i < numCards; i++) {
                    var card = {
                        label:   rows[i].Label || rows[i].Path || ('\u05DE\u05D3\u05D3 ' + (i + 1)),
                        unit:    rows[i].Units || config.Unit || '',
                        current: 0,
                        target:  parseFloat(rows[i].Value) || 0,
                        values:  [],
                        warnT:   0,
                        critT:   0,
                        status:  'ok',
                        stats:   null,
                        domEls:  null
                    };
                    cards.push(card);
                    _createCardDOM(card, i);
                }
            }

            // Update targets
            for (var k = 0; k < numCards; k++) {
                var val = parseFloat(rows[k].Value) || 0;
                cards[k].target = val;
                if (cards[k].values.length >= (config.SparklinePoints || MAX_SPARKLINE_PTS)) {
                    cards[k].values.shift();
                }
                cards[k].values.push(val);
            }

            // Request Worker stats
            _requestWorkerCompute();

            // Wake from idle
            if (idleMode) {
                idleMode = false;
                if (!isRunning) _startLoop();
                else animId = requestAnimationFrame(renderLoop);
            }
        }

        this.onDataUpdate = function (data) {
            if (config.DemoMode) return;
            if (!data || !data.Rows || data.Rows.length === 0) return;

            _pendingData = data;

            // Immediate on first data
            if (!cards.length) {
                _processData(data);
                _pendingData = null;
                return;
            }

            // Debounce 100ms
            if (!_dataDebounceId) {
                _dataDebounceId = setTimeout(function () {
                    _dataDebounceId = null;
                    if (_pendingData) {
                        _processData(_pendingData);
                        _pendingData = null;
                    }
                }, 100);
            }
        };

        /* ═══════════════════════════════════════════════
         *  WORKER COMMUNICATION
         * ═══════════════════════════════════════════════ */

        function _requestWorkerCompute() {
            if (!workerReady || !worker || cards.length === 0) return;
            var payload = [];
            for (var i = 0; i < cards.length; i++) {
                payload.push({
                    values:  cards[i].values.slice(),
                    current: cards[i].current,
                    prev:    cards[i].values.length > 1 ? cards[i].values[cards[i].values.length - 2] : cards[i].current
                });
            }
            worker.postMessage({ type: 'COMPUTE', cards: payload, config: { zScoreThreshold: 2.5 } });
        }

        var _workerTimer = null;
        function _scheduleWorkerCompute() {
            if (_workerTimer) clearTimeout(_workerTimer);
            _workerTimer = setTimeout(function () {
                _requestWorkerCompute();
                if (config.DemoMode && isRunning) _scheduleWorkerCompute();
            }, 2000);
        }

        function _applyWorkerStats(stats) {
            if (!stats || !cards.length) return;
            var dec = config.Decimals != null ? config.Decimals : 1;
            for (var i = 0; i < stats.length && i < cards.length; i++) {
                var s = stats[i];
                var c = cards[i];
                c.stats = s;

                if (!c.domEls) continue;

                // Trend
                if (config.ShowTrend) {
                    var arrow = s.trend === 'up' ? '\u25B2' : s.trend === 'down' ? '\u25BC' : '\u25C6';
                    var tColor = s.trend === 'up' ? CLR.ok : s.trend === 'down' ? CLR.crit : CLR.textMuted;
                    var tBg = s.trend === 'up' ? CLR.okDim : s.trend === 'down' ? CLR.critDim : 'rgba(90,122,148,0.12)';
                    c.domEls.trend.textContent = arrow + ' ' + s.trendPct + '%';
                    c.domEls.trend.style.color = tColor;
                    c.domEls.trend.style.background = tBg;
                    c.domEls.trend.style.display = '';
                } else {
                    c.domEls.trend.style.display = 'none';
                }

                // Delta
                if (config.ShowDelta && s.delta !== 0) {
                    var dSign = s.delta > 0 ? '+' : '';
                    c.domEls.delta.textContent = dSign + fmtVal(s.delta, dec);
                    c.domEls.delta.style.color = s.delta > 0 ? CLR.ok : CLR.crit;
                    c.domEls.delta.style.background = s.delta > 0 ? CLR.okDim : CLR.critDim;
                    c.domEls.delta.style.display = '';
                } else {
                    c.domEls.delta.style.display = 'none';
                }

                // Outlier
                c.domEls.outlier.style.display = s.isOutlier ? '' : 'none';

                // Min/Max
                if (config.ShowMinMax && c.domEls.minmax.parentNode) {
                    c.domEls.minmax.innerHTML =
                        '<span>\u25BC ' + fmtVal(s.min, dec) + '</span>' +
                        '<span>\u25B2 ' + fmtVal(s.max, dec) + '</span>' +
                        '<span>\u00D8 ' + fmtVal(s.avg, dec) + '</span>';
                }
            }
        }

        /* ═══════════════════════════════════════════════
         *  RENDER LOOP
         * ═══════════════════════════════════════════════ */

        function _startLoop() {
            if (isRunning) return;
            isRunning = true;
            idleMode  = false;
            if (skeleton && skeleton.parentNode && config.DemoMode) {
                skeleton.parentNode.removeChild(skeleton);
                skeleton = null;
            }
            renderLoop();
        }

        function renderLoop() {
            if (!isRunning || cards.length === 0) {
                if (isRunning) animId = requestAnimationFrame(renderLoop);
                return;
            }

            if (config.DemoMode) _generateDemoTargets();

            var settling = _stepPhysics();
            _updateCardDOM();
            _drawSparklines();
            _updateSummary();
            _updateLiveTime();

            if (config.DemoMode || settling) {
                animId = requestAnimationFrame(renderLoop);
            } else {
                idleMode = true;
            }
        }

        function _stepPhysics() {
            var lerpF    = 0.08;
            var settling = false;
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                var diff = Math.abs(c.current - c.target);
                if (diff > 0.001) {
                    c.current = lerp(c.current, c.target, lerpF);
                    settling = true;
                } else {
                    c.current = c.target;
                }
            }
            return settling;
        }

        /* ═══════════════════════════════════════════════
         *  CARD DOM UPDATE
         * ═══════════════════════════════════════════════ */

        function _updateCardDOM() {
            var dec = config.Decimals != null ? config.Decimals : 1;
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                if (!c.domEls) continue;

                // Update value
                c.domEls.val.textContent = fmtVal(c.current, dec);
                if (config.valueFontSize) c.domEls.val.style.fontSize = config.valueFontSize + 'px';

                // Status
                var status = _getStatus(c.current, c);
                c.status = status;
                var sColor = _statusColor(status);
                c.domEls.status.style.background = sColor;
                c.domEls.val.style.color = status === 'ok' ? CLR.accent : sColor;

                // Card class
                c.domEls.card.className = 'wow-kpi-card size-' + (config.CardSize || 'medium');
                if (status === 'crit') c.domEls.card.className += ' status-crit';
            }
        }

        /* ═══════════════════════════════════════════════
         *  SPARKLINE DRAWING
         * ═══════════════════════════════════════════════ */

        function _drawSparklines() {
            if (!config.ShowSparkline) return;

            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                if (!c.domEls || !c.domEls.sparkCtx) continue;

                var canvas = c.domEls.spark;
                var ctx    = c.domEls.sparkCtx;
                var rect   = canvas.parentElement;
                if (!rect) continue;

                var w = rect.offsetWidth || 100;
                var h = rect.offsetHeight || 36;
                var dpr = window.devicePixelRatio || 1;

                if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
                    canvas.width  = w * dpr;
                    canvas.height = h * dpr;
                    canvas.style.width  = w + 'px';
                    canvas.style.height = h + 'px';
                    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                }

                var vals = c.values;
                if (vals.length < 2) {
                    ctx.clearRect(0, 0, w, h);
                    continue;
                }

                // Compute range
                var minV = vals[0], maxV = vals[0];
                for (var j = 1; j < vals.length; j++) {
                    if (vals[j] < minV) minV = vals[j];
                    if (vals[j] > maxV) maxV = vals[j];
                }
                var rangeV = maxV - minV || 1;
                var pad    = 2;

                // Choose color based on status
                var strokeColor = c.status === 'crit' ? CLR.sparkCrit
                                : c.status === 'warn' ? CLR.sparkWarn
                                : CLR.sparkOk;

                // Clear
                ctx.clearRect(0, 0, w, h);

                // Draw fill
                ctx.beginPath();
                for (var k = 0; k < vals.length; k++) {
                    var px = (k / (vals.length - 1)) * w;
                    var py = h - pad - ((vals[k] - minV) / rangeV) * (h - pad * 2);
                    if (k === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
                }
                ctx.lineTo(w, h);
                ctx.lineTo(0, h);
                ctx.closePath();
                ctx.fillStyle = CLR.sparkFill;
                ctx.fill();

                // Draw line
                ctx.beginPath();
                for (var m = 0; m < vals.length; m++) {
                    var lx = (m / (vals.length - 1)) * w;
                    var ly = h - pad - ((vals[m] - minV) / rangeV) * (h - pad * 2);
                    if (m === 0) ctx.moveTo(lx, ly); else ctx.lineTo(lx, ly);
                }
                ctx.strokeStyle = strokeColor;
                ctx.lineWidth   = 1.5;
                ctx.stroke();

                // End dot
                var lastX = w;
                var lastY = h - pad - ((vals[vals.length - 1] - minV) / rangeV) * (h - pad * 2);
                ctx.beginPath();
                ctx.arc(lastX, lastY, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = strokeColor;
                ctx.fill();
            }
        }

        /* ═══════════════════════════════════════════════
         *  SUMMARY BAR
         * ═══════════════════════════════════════════════ */

        function _updateSummary() {
            var ok = 0, warn = 0, crit = 0;
            for (var i = 0; i < cards.length; i++) {
                if (cards[i].status === 'crit') crit++;
                else if (cards[i].status === 'warn') warn++;
                else ok++;
            }

            var html = '';
            html += '<span class="wow-kpi-badge wow-kpi-badge-ok">\u25CF ' + ok + ' \u05EA\u05E7\u05D9\u05DF</span>';
            if (warn > 0) html += '<span class="wow-kpi-badge wow-kpi-badge-warn">\u25C6 ' + warn + ' \u05D0\u05D6\u05D4\u05E8\u05D4</span>';
            if (crit > 0) html += '<span class="wow-kpi-badge wow-kpi-badge-crit">\u25B2 ' + crit + ' \u05E7\u05E8\u05D9\u05D8\u05D9</span>';
            html += '<span class="wow-kpi-summary-msg">' + cards.length + ' \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9\u05DD</span>';
            summaryBar.innerHTML = html;
        }

        function _updateLiveTime() {
            var timeEl = liveEl.querySelector('.wow-kpi-live-time');
            if (timeEl) timeEl.textContent = fmtTime();
        }

        /* ═══════════════════════════════════════════════
         *  EXPORT CSV
         * ═══════════════════════════════════════════════ */

        function _onExportClick() {
            if (cards.length === 0) return;
            var dec = config.Decimals != null ? config.Decimals : 1;
            var csv = '\uFEFF';  // BOM for Hebrew
            csv += '\u05E9\u05DD,\u05E2\u05E8\u05DA,\u05D9\u05D7\u05D9\u05D3\u05D4,\u05E1\u05D8\u05D8\u05D5\u05E1\n';
            for (var i = 0; i < cards.length; i++) {
                var c = cards[i];
                csv += c.label + ',' + fmtVal(c.current, dec) + ',' + (c.unit || '') + ',' + c.status + '\n';
            }
            var blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            var url  = URL.createObjectURL(blob);
            var a    = document.createElement('a');
            a.href     = url;
            a.download = 'wow-kpi-' + new Date().toISOString().slice(0, 10) + '.csv';
            a.click();
            URL.revokeObjectURL(url);
        }
        btnExport.addEventListener('click', _onExportClick);

        /* ── Reset Animation ─────────────────────────── */
        function _onResetClick() {
            for (var i = 0; i < cards.length; i++) {
                cards[i].current = 0;
            }
            if (idleMode) {
                idleMode = false;
                animId = requestAnimationFrame(renderLoop);
            }
        }
        btnReset.addEventListener('click', _onResetClick);

        /* ── Config Watchers ─────────────────────────── */
        scope.$watch('config.Title', function (v) {
            if (v) titleEl.textContent = v;
        });

        scope.$watch('config.DemoMode', function (v) {
            if (v && cards.length === 0) {
                _initDemo();
                _scheduleWorkerCompute();
                if (!isRunning) _startLoop();
            }
        });

        scope.$watchGroup([
            'config.CardSize', 'config.ShowSparkline', 'config.ShowTrend',
            'config.ShowDelta', 'config.ShowMinMax', 'config.Decimals',
            'config.WarnThreshold', 'config.CritThreshold', 'config.ThresholdMode',
            'config.valueFontSize', 'config.fontFamily', 'config.fontSize'
        ], function () {
            // Rebuild cards DOM when display config changes
            if (cards.length > 0) {
                var saved = [];
                for (var i = 0; i < cards.length; i++) {
                    saved.push({
                        label: cards[i].label, unit: cards[i].unit,
                        current: cards[i].current, target: cards[i].target,
                        values: cards[i].values, warnT: cards[i].warnT,
                        critT: cards[i].critT, stats: cards[i].stats
                    });
                }
                _clearCards();
                for (var j = 0; j < saved.length; j++) {
                    var card = saved[j];
                    card.status = 'ok';
                    card.domEls = null;
                    cards.push(card);
                    _createCardDOM(card, j);
                }
                if (idleMode) {
                    _drawSparklines();
                    _updateCardDOM();
                    _updateSummary();
                    _requestWorkerCompute();
                }
            }
        });

        /* ── Cleanup ─────────────────────────────────── */
        scope.$on('$destroy', function () {
            isRunning = false;
            if (animId) { cancelAnimationFrame(animId); clearTimeout(animId); }
            if (_dataDebounceId) { clearTimeout(_dataDebounceId); _dataDebounceId = null; }
            if (_workerTimer) clearTimeout(_workerTimer);
            if (worker) { worker.terminate(); worker = null; }
            btnExport.removeEventListener('click', _onExportClick);
            btnReset.removeEventListener('click', _onResetClick);
            cards = [];
            _pendingData = null;
        });

        /* ── Init ─────────────────────────────────────── */
        if (config.DemoMode) {
            _initDemo();
            _scheduleWorkerCompute();
        }
    };

    /* ═══════════════════════════════════════════════════
     *  REGISTRATION
     * ═══════════════════════════════════════════════════ */

    PV.symbolCatalog.register({
        typeName:           'kpicard-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05DC\u05D5\u05D7 \u05DB\u05E8\u05D8\u05D9\u05E1\u05D9 KPI WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        getDefaultConfig: function () {
            return {
                DataShape:       'Table',
                Height:          350,
                Width:           800,
                Title:           'Executive KPI Dashboard',
                DemoMode:        true,
                CardSize:        'medium',
                Decimals:        1,
                Unit:            '',
                ShowSparkline:   true,
                ShowTrend:       true,
                ShowDelta:       true,
                ShowMinMax:      true,
                SparklinePoints: 60,
                WarnThreshold:   0,
                CritThreshold:   0,
                ThresholdMode:   'high',
                fontFamily:      'Segoe UI',
                fontSize:        12,
                valueFontSize:   32
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DC\u05D5\u05D7 KPI WOW'
    });

})(window.PIVisualization);
