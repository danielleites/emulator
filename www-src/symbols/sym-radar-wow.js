/**
 * ═══════════════════════════════════════════════════════
 *  sym-radar-wow.js — Executive Morphing Radar WOW v100
 * ═══════════════════════════════════════════════════════
 *
 *  Canvas-based multi-axis radar with Spring Physics morphing.
 *
 *  THE GEM  ─────────────────────────────────────────────
 *  Dual-state animation: targetValues[] holds exact PI data,
 *  currentValues[] chases them via lerp(current, target, factor)
 *  every frame at 60 fps.  Data can arrive every 10 s but the
 *  polygon "breathes" organically with zero server load.
 *  ──────────────────────────────────────────────────────
 *
 *  Key features:
 *    • Lerp interpolation  — no snapping, fluid morphing
 *    • Dynamic Axis Highlighting — radialGradient halo per
 *      anomalous vertex (red/amber), pulsing ring
 *    • Hover Raycasting — Math.atan2 nearest-axis detection,
 *      DOM tooltip only when needed
 *    • Reference baseline — dashed overlay for comparison
 *    • Executive HSL palette with neon glow
 *    • Shadow DOM isolation + DPR-aware canvas
 *    • Demo mode with oscillating sine-wave data
 *
 *  DataShape : Table (Multiple attributes → rows)
 *  Version   : WOW Radar v100
 *  Lines     : ~730
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════
     *  CONSTANTS & PALETTE
     * ═══════════════════════════════════════════════════ */

    var GRID_RINGS       = 5;
    var AXIS_DETECT_DEG  = 25;      // ±degrees for hover raycasting
    var MIN_AXES         = 3;
    var MAX_AXES         = 12;
    var LABEL_MARGIN     = 50;      // px reserved outside radar for labels
    var SETTLE_EPSILON   = 0.05;    // convergence threshold

    var CLR = {
        bg:           '#0B0F19',
        gridRing:     'rgba(91, 192, 235, 0.10)',
        axisLine:     'rgba(91, 192, 235, 0.14)',
        axisEndDot:   'rgba(91, 192, 235, 0.35)',
        ringLabel:    '#556677',
        ok:           '#00F5D4',
        okFill:       'rgba(0, 245, 212, 0.18)',
        okGlow:       'rgba(0, 245, 212, 0.55)',
        warn:         '#FFCC00',
        warnFill:     'rgba(255, 204, 0, 0.14)',
        warnGlow:     'rgba(255, 204, 0, 0.55)',
        crit:         '#FF3B30',
        critFill:     'rgba(255, 59, 48, 0.14)',
        critGlow:     'rgba(255, 59, 48, 0.55)',
        accent:       '#5BC0EB',
        text:         '#ECF0F1',
        textMuted:    '#8899AA',
        border:       '#1A3A5C',
        refStroke:    'rgba(91, 192, 235, 0.28)',
        refFill:      'rgba(91, 192, 235, 0.04)',
        hoveredAxis:  'rgba(91, 192, 235, 0.35)'
    };

    // Hebrew demo axes — turbine health signature
    var DEMO_AXES = [
        { label: '\u05E8\u05E2\u05D9\u05D3\u05D5\u05EA',     max: 100, unit: 'mm/s'  },
        { label: '\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4',   max: 120, unit: '\u00B0C'    },
        { label: '\u05DC\u05D7\u05E5 \u05E9\u05DE\u05DF',     max: 10,  unit: 'bar'   },
        { label: 'RPM',           max: 100, unit: '%'     },
        { label: '\u05D6\u05E8\u05DD',            max: 500, unit: 'A'     },
        { label: '\u05E1\u05E4\u05D9\u05E7\u05D4',           max: 100, unit: 'm\u00B3/h' }
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

    function axisAngle(i, total) {
        return (i / total) * Math.PI * 2 - Math.PI / 2;   // 12-o'clock start
    }

    function angleDiff(a, b) {
        var d = a - b;
        while (d >  Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        return d;
    }

    function dist(x1, y1, x2, y2) {
        var dx = x2 - x1, dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function _el(tag, cls) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        return e;
    }

    /* ═══════════════════════════════════════════════════
     *  SYMBOL IMPLEMENTATION
     * ═══════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    symbolVis.prototype.init = function (scope, elem) {

        /* ── Script Base Path ─────────────────────────── */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-radar-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].src;
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            // Dynamic fallback via PI Vision base URL
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ── Shadow DOM ───────────────────────────────── */
        var mountEl = elem[0].querySelector('.wow-radar-root-mount');
        if (!mountEl) mountEl = elem[0];
        var shadow;
        try   { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-radar-wow.css';
        shadow.appendChild(linkEl);

        /* ── DOM Scaffold ─────────────────────────────── */
        var root       = _el('div', 'wow-rd-root');
        var toolbar    = _el('div', 'wow-rd-toolbar');
        var titleEl    = _el('span', 'wow-rd-title');
        var actions    = _el('div', 'wow-rd-toolbar-actions');
        var btnExport  = _el('button', 'wow-rd-btn'); btnExport.textContent  = '\uD83D\uDCF8 Export';
        var btnReset   = _el('button', 'wow-rd-btn'); btnReset.textContent   = '\uD83D\uDD04 Reset';
        actions.appendChild(btnExport);
        actions.appendChild(btnReset);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        var statsBar    = _el('div', 'wow-rd-stats');
        var canvasOuter = _el('div', 'wow-rd-canvas-outer');
        var canvas      = document.createElement('canvas');
        canvas.className = 'wow-rd-canvas';
        canvasOuter.appendChild(canvas);

        var tooltip = _el('div', 'wow-rd-tooltip');
        tooltip.style.display = 'none';
        canvasOuter.appendChild(tooltip);

        var skeleton = _el('div', 'wow-rd-skeleton');
        canvasOuter.appendChild(skeleton);

        var footer = _el('div', 'wow-rd-footer');
        footer.textContent = 'WOW Radar v100 \u00B7 Executive Morphing Radar';

        root.appendChild(toolbar);
        root.appendChild(statsBar);
        root.appendChild(canvasOuter);
        root.appendChild(footer);
        shadow.appendChild(root);

        /* ── Canvas Context ────────────────────────────── */
        var ctx = canvas.getContext('2d', { alpha: false });
        var dpr = 1, W = 0, H = 0;
        var centerX = 0, centerY = 0, maxRadius = 0;

        /* ── State ─────────────────────────────────────── */
        var axes          = [];        // [{label, max, unit}]
        var targetValues  = [];        // exact values from PI
        var currentValues = [];        // lerped toward target (drawn)
        var refValues     = null;      // optional baseline
        var hoveredAxis   = -1;
        var mouseX = -1, mouseY = -1;
        var isRunning     = false;
        var idleMode      = false;
        var animId        = null;
        var demoTime      = 0;
        var config        = scope.config;

        /* ── Config Defaults ───────────────────────────── */
        if (!config.Title)       config.Title       = 'Executive Anomaly Radar';
        if (!config.WarnPct)     config.WarnPct     = 70;
        if (!config.CritPct)     config.CritPct     = 85;
        if (!config.LerpFactor)  config.LerpFactor  = 8;    // ×0.01
        if (!config.LabelMode)   config.LabelMode   = 'hover';  // 'always'|'hover'|'anomaly'
        if (!config.GridRings)   config.GridRings   = 5;
        if (config.ShowReference === undefined) config.ShowReference = true;
        if (config.Decimals  == null)  config.Decimals  = 1;
        if (config.DemoMode  === undefined) config.DemoMode = true;
        if (!config.fontFamily)  config.fontFamily  = 'Segoe UI';
        if (!config.fontSize)    config.fontSize    = 12;
        if (!config.MaxLimits)   config.MaxLimits   = [];
        if (!config.DefaultMax)  config.DefaultMax  = 100;

        titleEl.textContent = config.Title;

        /* ── Resize Observer ───────────────────────────── */
        var resizeObs = new ResizeObserver(debounce(function (entries) {
            var rect = entries[0].contentRect;
            if (rect.width < 20 || rect.height < 20) return;
            W = rect.width;
            H = rect.height;
            dpr = window.devicePixelRatio || 1;
            canvas.width  = W * dpr;
            canvas.height = H * dpr;
            canvas.style.width  = W + 'px';
            canvas.style.height = H + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            _updateGeometry();
            if (!isRunning) _startLoop();
        }, 100));
        resizeObs.observe(canvasOuter);

        function _updateGeometry() {
            centerX   = W / 2;
            centerY   = H / 2;
            maxRadius = Math.min(centerX, centerY) - LABEL_MARGIN;
            if (maxRadius < 25) maxRadius = 25;
        }

        /* ═══════════════════════════════════════════════
         *  DEMO DATA GENERATOR
         * ═══════════════════════════════════════════════ */

        function _initDemoAxes() {
            axes = DEMO_AXES.map(function (a) {
                return { label: a.label, max: a.max, unit: a.unit };
            });
            targetValues  = new Array(axes.length);
            currentValues = new Array(axes.length);
            for (var i = 0; i < axes.length; i++) {
                targetValues[i]  = 30 + Math.random() * 25;
                currentValues[i] = targetValues[i];
            }
            // Reference baseline: 50% for all axes
            refValues = axes.map(function (a) { return a.max * 0.5; });
        }

        /**
         * Generates smooth oscillating targets using sine waves.
         * Each axis has a unique frequency & phase for organic motion.
         * Axes 0 and 2 periodically spike to demonstrate anomaly detection.
         */
        function _generateDemoTargets() {
            demoTime += 0.016;   // ~60fps increment
            for (var i = 0; i < axes.length; i++) {
                var maxVal = axes[i].max;
                var base   = maxVal * (0.35 + 0.12 * Math.sin(demoTime * (0.4 + i * 0.25) + i * 1.1));

                // Axis 0: periodic critical spike (vibration anomaly)
                if (i === 0) {
                    var spike = Math.max(0, Math.sin(demoTime * 0.28 + 0.5));
                    base += spike * maxVal * 0.52;
                }
                // Axis 2: occasional warning zone (oil pressure drift)
                if (i === 2) {
                    var drift = Math.max(0, Math.sin(demoTime * 0.18 + 2.2));
                    base += drift * maxVal * 0.32;
                }

                targetValues[i] = Math.max(maxVal * 0.05, Math.min(maxVal * 0.98, base));
            }
        }

        /* ═══════════════════════════════════════════════
         *  DATA UPDATE (Live PI Vision Bridge)
         *  ── 100ms debounce accumulator for data bursts ──
         *  PI may push multiple updates in rapid succession.
         *  We store the latest payload and process only once
         *  per 100ms window. The lerp engine then smoothly
         *  interpolates toward the new targets.
         * ═══════════════════════════════════════════════ */

        var _pendingData   = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;

        function _processData(data) {
            var rows    = data.Rows;
            var numAxes = Math.min(rows.length, MAX_AXES);

            // Remove skeleton on first real data
            if (skeleton && skeleton.parentNode) {
                skeleton.parentNode.removeChild(skeleton);
                skeleton = null;
            }

            // Initialize axes from data columns
            if (axes.length !== numAxes) {
                axes = [];
                for (var i = 0; i < numAxes; i++) {
                    var cfgMax = (config.MaxLimits && config.MaxLimits[i])
                               ? parseFloat(config.MaxLimits[i])
                               : (config.DefaultMax || 100);
                    axes.push({
                        label: rows[i].Label || rows[i].Path || ('\u05E6\u05D9\u05E8 ' + (i + 1)),
                        max:   cfgMax,
                        unit:  rows[i].Units || ''
                    });
                }
                currentValues = new Array(numAxes);
                for (var j = 0; j < numAxes; j++) currentValues[j] = 0;
            }

            // Update target values only — the render loop lerps toward them
            targetValues = [];
            for (var k = 0; k < numAxes; k++) {
                targetValues.push(parseFloat(rows[k].Value) || 0);
            }

            if (currentValues.length !== targetValues.length) {
                currentValues = targetValues.slice();
            }

            // Wake from idle if converged
            if (idleMode) {
                idleMode = false;
                if (!isRunning) _startLoop();
                else animId = requestAnimationFrame(renderLoop);
            }
        }

        this.onDataUpdate = function (data) {
            if (config.DemoMode) return;
            if (!data || !data.Rows || data.Rows.length < MIN_AXES) return;

            _pendingData = data;

            // Immediate on first data (remove skeleton fast)
            if (!axes.length) {
                _processData(data);
                _pendingData = null;
                return;
            }

            // Debounce subsequent updates
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

        /* ═══════════════════════════════════════════════
         *  RENDER LOOP (60 fps Morphing Engine)
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
            if (!isRunning || W === 0 || axes.length === 0) {
                if (isRunning) animId = requestAnimationFrame(renderLoop);
                return;
            }

            // Demo: generate new oscillating targets each frame
            if (config.DemoMode) _generateDemoTargets();

            // Physics step: lerp all axes toward targets
            var settling = _stepPhysics();

            // Draw the frame
            _drawFrame();
            _updateStats();

            // Schedule next frame
            if (config.DemoMode || settling) {
                animId = requestAnimationFrame(renderLoop);
            } else {
                // Converged → idle. One final draw already done.
                idleMode = true;
            }
        }

        /**
         * Advance currentValues toward targetValues.
         * Returns true if still settling (needs more frames).
         */
        function _stepPhysics() {
            var lerpF    = (config.LerpFactor || 8) * 0.01;
            var settling = false;
            for (var i = 0; i < axes.length; i++) {
                if (currentValues[i] === undefined) currentValues[i] = 0;
                var diff = Math.abs(currentValues[i] - targetValues[i]);
                if (diff > SETTLE_EPSILON) {
                    currentValues[i] = lerp(currentValues[i], targetValues[i], lerpF);
                    settling = true;
                } else {
                    currentValues[i] = targetValues[i];
                }
            }
            return settling;
        }

        /* ═══════════════════════════════════════════════
         *  DRAWING
         * ═══════════════════════════════════════════════ */

        function _drawFrame() {
            var n = axes.length;
            if (n < MIN_AXES) return;

            // Clear
            ctx.fillStyle = CLR.bg;
            ctx.fillRect(0, 0, W, H);

            var rings = config.GridRings || GRID_RINGS;

            // 1. Grid rings
            _drawGrid(n, rings);

            // 2. Axis spoke lines
            _drawAxisLines(n);

            // 3. Reference baseline (dashed)
            if (config.ShowReference && refValues && refValues.length === n) {
                _drawPolygon(refValues, n, CLR.refStroke, CLR.refFill, null, true);
            }

            // 4. Compute per-axis anomaly status
            var anomalies = _computeAnomalies(n);

            // 5. Main morphing polygon
            _drawMainPolygon(n, anomalies);

            // 6. Dynamic Axis Highlights (THE GEM)
            _drawAxisHighlights(n, anomalies);

            // 7. Axis labels
            _drawAxisLabels(n, anomalies);

            // 8. Center dot
            ctx.beginPath();
            ctx.arc(centerX, centerY, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = CLR.accent;
            ctx.fill();
        }

        /* ── Grid Rings (concentric pentagons/hexagons) ── */
        function _drawGrid(n, rings) {
            var font = '9px ' + (config.fontFamily || 'Segoe UI');
            for (var j = 1; j <= rings; j++) {
                var r = maxRadius * (j / rings);
                ctx.beginPath();
                for (var i = 0; i <= n; i++) {
                    var angle = axisAngle(i % n, n);
                    var x = centerX + Math.cos(angle) * r;
                    var y = centerY + Math.sin(angle) * r;
                    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                }
                ctx.closePath();
                ctx.strokeStyle = CLR.gridRing;
                ctx.lineWidth   = 1;
                ctx.stroke();

                // Percentage label on first spoke
                if (j < rings) {
                    var pct = Math.round((j / rings) * 100);
                    ctx.font      = font;
                    ctx.fillStyle = CLR.ringLabel;
                    ctx.textAlign    = 'left';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(pct + '%', centerX + 5, centerY - r - 2);
                }
            }
        }

        /* ── Axis Spoke Lines ────────────────────────── */
        function _drawAxisLines(n) {
            for (var i = 0; i < n; i++) {
                var angle = axisAngle(i, n);
                var ex = centerX + Math.cos(angle) * maxRadius;
                var ey = centerY + Math.sin(angle) * maxRadius;

                // Highlighted if hovered
                ctx.strokeStyle = (hoveredAxis === i) ? CLR.hoveredAxis : CLR.axisLine;
                ctx.lineWidth   = (hoveredAxis === i) ? 1.5 : 1;
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.lineTo(ex, ey);
                ctx.stroke();

                // End dot
                ctx.beginPath();
                ctx.arc(ex, ey, 2.5, 0, Math.PI * 2);
                ctx.fillStyle = (hoveredAxis === i) ? CLR.accent : CLR.axisEndDot;
                ctx.fill();
            }
        }

        /* ── Anomaly Computation ─────────────────────── */
        function _computeAnomalies(n) {
            var result = [];
            var warnT  = (config.WarnPct || 70) / 100;
            var critT  = (config.CritPct || 85) / 100;
            for (var i = 0; i < n; i++) {
                var norm = currentValues[i] / (axes[i].max || 100);
                if (norm >= critT)      result.push('crit');
                else if (norm >= warnT) result.push('warn');
                else                    result.push('ok');
            }
            return result;
        }

        /* ── Generic Polygon Drawing ─────────────────── */
        function _drawPolygon(values, n, stroke, fill, glow, dashed) {
            ctx.beginPath();
            for (var i = 0; i <= n; i++) {
                var idx   = i % n;
                var angle = axisAngle(idx, n);
                var norm  = Math.min(values[idx] / (axes[idx].max || 100), 1.15);
                var r     = norm * maxRadius;
                var x     = centerX + Math.cos(angle) * r;
                var y     = centerY + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();

            if (fill) { ctx.fillStyle = fill; ctx.fill(); }

            ctx.save();
            if (dashed) ctx.setLineDash([6, 4]);
            if (glow)   { ctx.shadowColor = glow; ctx.shadowBlur = 10; }
            ctx.strokeStyle = stroke;
            ctx.lineWidth   = dashed ? 1.5 : 2;
            ctx.stroke();
            ctx.restore();
            ctx.setLineDash([]);
        }

        /* ── Main Morphing Polygon ───────────────────── */
        function _drawMainPolygon(n, anomalies) {
            // Determine dominant color from worst axis
            var hasCrit = anomalies.indexOf('crit') >= 0;
            var hasWarn = anomalies.indexOf('warn') >= 0;
            var fillC, strokeC, glowC;

            if (hasCrit)      { fillC = CLR.critFill; strokeC = CLR.crit; glowC = CLR.critGlow; }
            else if (hasWarn) { fillC = CLR.warnFill; strokeC = CLR.warn; glowC = CLR.warnGlow; }
            else              { fillC = CLR.okFill;   strokeC = CLR.ok;   glowC = CLR.okGlow;   }

            // Build path
            ctx.beginPath();
            for (var i = 0; i <= n; i++) {
                var idx   = i % n;
                var angle = axisAngle(idx, n);
                var norm  = Math.min(currentValues[idx] / (axes[idx].max || 100), 1.15);
                var r     = norm * maxRadius;
                var x     = centerX + Math.cos(angle) * r;
                var y     = centerY + Math.sin(angle) * r;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            }
            ctx.closePath();

            // Fill
            ctx.fillStyle = fillC;
            ctx.fill();

            // Glow stroke
            ctx.save();
            ctx.shadowColor = glowC;
            ctx.shadowBlur  = 14;
            ctx.strokeStyle = strokeC;
            ctx.lineWidth   = 2;
            ctx.stroke();
            ctx.restore();
        }

        /* ════════════════════════════════════════════════
         *  THE GEM: Dynamic Axis Highlighting
         *  Per-vertex radialGradient halo + pulsing ring
         *  for anomalous axes. The manager sees WHICH
         *  parameter is failing in <2 seconds.
         * ════════════════════════════════════════════════ */

        function _drawAxisHighlights(n, anomalies) {
            var now = Date.now();
            for (var i = 0; i < n; i++) {
                if (anomalies[i] === 'ok') continue;

                var angle = axisAngle(i, n);
                var norm  = Math.min(currentValues[i] / (axes[i].max || 100), 1.15);
                var r     = norm * maxRadius;
                var vx    = centerX + Math.cos(angle) * r;
                var vy    = centerY + Math.sin(angle) * r;

                var isCrit     = anomalies[i] === 'crit';
                var glowRadius = isCrit ? 26 : 20;

                // ── Radial gradient halo ──
                var grad = ctx.createRadialGradient(vx, vy, 0, vx, vy, glowRadius);
                if (isCrit) {
                    grad.addColorStop(0, 'rgba(255, 59, 48, 0.55)');
                    grad.addColorStop(1, 'rgba(255, 59, 48, 0)');
                } else {
                    grad.addColorStop(0, 'rgba(255, 204, 0, 0.45)');
                    grad.addColorStop(1, 'rgba(255, 204, 0, 0)');
                }
                ctx.beginPath();
                ctx.arc(vx, vy, glowRadius, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();

                // ── Solid vertex dot ──
                ctx.beginPath();
                ctx.arc(vx, vy, 4, 0, Math.PI * 2);
                ctx.fillStyle = isCrit ? CLR.crit : CLR.warn;
                ctx.fill();

                // ── Pulsing ring (animated) ──
                var pulsePhase = now * 0.005 + i * 1.2;
                var pulseR     = 7 + 5 * Math.sin(pulsePhase);
                var pulseAlpha = 0.35 + 0.3 * Math.sin(pulsePhase);
                ctx.beginPath();
                ctx.arc(vx, vy, pulseR, 0, Math.PI * 2);
                ctx.strokeStyle = isCrit ? CLR.crit : CLR.warn;
                ctx.lineWidth   = 1.5;
                ctx.globalAlpha = pulseAlpha;
                ctx.stroke();
                ctx.globalAlpha = 1;
            }
        }

        /* ── Axis Labels ─────────────────────────────── */
        function _drawAxisLabels(n, anomalies) {
            var mode = config.LabelMode || 'hover';
            var font = (config.fontSize || 12) + 'px ' + (config.fontFamily || 'Segoe UI');
            var dec  = config.Decimals != null ? config.Decimals : 1;

            for (var i = 0; i < n; i++) {
                var showThis = false;
                if (mode === 'always')  showThis = true;
                else if (mode === 'hover'   && hoveredAxis === i) showThis = true;
                else if (mode === 'anomaly' && anomalies[i] !== 'ok') showThis = true;

                if (!showThis) continue;

                var angle  = axisAngle(i, n);
                var cosA   = Math.cos(angle);
                var sinA   = Math.sin(angle);
                var labelX = centerX + cosA * (maxRadius + 16);
                var labelY = centerY + sinA * (maxRadius + 16);

                // Smart text alignment
                if (Math.abs(cosA) < 0.15)     ctx.textAlign = 'center';
                else if (cosA > 0)             ctx.textAlign = 'left';
                else                           ctx.textAlign = 'right';

                if (sinA > 0.4)                ctx.textBaseline = 'top';
                else if (sinA < -0.4)          ctx.textBaseline = 'bottom';
                else                           ctx.textBaseline = 'middle';

                // Label name
                ctx.font      = 'bold ' + font;
                ctx.fillStyle = anomalies[i] === 'crit' ? CLR.crit
                              : anomalies[i] === 'warn' ? CLR.warn
                              : CLR.text;
                ctx.fillText(axes[i].label, labelX, labelY);

                // Value + unit below label
                var val     = currentValues[i];
                var valText = val.toFixed(dec) + (axes[i].unit ? ' ' + axes[i].unit : '');
                var valY    = labelY + (sinA > 0.3 ? 15 : sinA < -0.3 ? -15 : 15);
                ctx.font      = (parseInt(config.fontSize || 12) - 1) + 'px ' + (config.fontFamily || 'Segoe UI');
                ctx.fillStyle = CLR.textMuted;
                ctx.fillText(valText, labelX, valY);

                // Percentage bar
                var pct    = val / (axes[i].max || 100);
                var barPctText = (pct * 100).toFixed(0) + '%';
                var barY   = valY + (sinA > 0.3 ? 13 : sinA < -0.3 ? -13 : 13);
                ctx.fillText(barPctText, labelX, barY);
            }
        }

        /* ═══════════════════════════════════════════════
         *  HOVER RAYCASTING (Math.atan2 nearest axis)
         * ═══════════════════════════════════════════════ */

        function _findNearestAxis(mx, my) {
            if (axes.length === 0) return -1;
            var d = dist(mx, my, centerX, centerY);
            if (d < 12) return -1;                   // too close to center

            var mouseAngle = Math.atan2(my - centerY, mx - centerX);
            var n          = axes.length;
            var bestIdx    = -1;
            var bestDiff   = Infinity;

            for (var i = 0; i < n; i++) {
                var diff = Math.abs(angleDiff(mouseAngle, axisAngle(i, n)));
                if (diff < bestDiff) { bestDiff = diff; bestIdx = i; }
            }

            var threshRad = (AXIS_DETECT_DEG * Math.PI) / 180;
            return bestDiff <= threshRad ? bestIdx : -1;
        }

        /* ── Mouse Events ────────────────────────────── */
        function _onCanvasMouseMove(e) {
            var rect = canvas.getBoundingClientRect();
            mouseX = e.clientX - rect.left;
            mouseY = e.clientY - rect.top;
            var prev = hoveredAxis;
            hoveredAxis = _findNearestAxis(mouseX, mouseY);
            if (hoveredAxis >= 0) {
                _showTooltip(hoveredAxis, e.clientX, e.clientY);
            } else {
                tooltip.style.display = 'none';
            }
            // Redraw if hover changed (for label/axis highlight)
            if (prev !== hoveredAxis && idleMode) {
                _drawFrame();
            }
        }

        function _onCanvasMouseLeave() {
            hoveredAxis = -1;
            mouseX = mouseY = -1;
            tooltip.style.display = 'none';
            if (idleMode) _drawFrame();
        }

        canvas.addEventListener('mousemove', _onCanvasMouseMove);
        canvas.addEventListener('mouseleave', _onCanvasMouseLeave);

        /* ── DOM Tooltip (Glassmorphism) ─────────────── */
        function _showTooltip(axIdx, clientX, clientY) {
            var val  = currentValues[axIdx];
            var axis = axes[axIdx];
            var norm = val / (axis.max || 100);
            var dec  = config.Decimals != null ? config.Decimals : 1;
            var warnT = (config.WarnPct || 70) / 100;
            var critT = (config.CritPct || 85) / 100;

            var status, statusCls, barColor;
            if (norm >= critT) {
                status = '\u05E7\u05E8\u05D9\u05D8\u05D9'; statusCls = 'wow-rd-tt-crit'; barColor = CLR.crit;
            } else if (norm >= warnT) {
                status = '\u05D0\u05D6\u05D4\u05E8\u05D4'; statusCls = 'wow-rd-tt-warn'; barColor = CLR.warn;
            } else {
                status = '\u05EA\u05E7\u05D9\u05DF'; statusCls = 'wow-rd-tt-ok'; barColor = CLR.ok;
            }

            tooltip.innerHTML =
                '<div class="wow-rd-tt-label">' + axis.label + '</div>' +
                '<div class="wow-rd-tt-value"><b>' + val.toFixed(dec) + '</b> ' +
                    (axis.unit || '') + ' / ' + axis.max + ' ' + (axis.unit || '') + '</div>' +
                '<div class="wow-rd-tt-bar-wrap">' +
                    '<div class="wow-rd-tt-bar" style="width:' +
                    Math.min(norm * 100, 100).toFixed(1) +
                    '%;background:' + barColor + '"></div></div>' +
                '<div class="' + statusCls + '">' + status +
                    ' (' + (norm * 100).toFixed(0) + '%)</div>';

            tooltip.style.display = 'block';
            var outerRect = canvasOuter.getBoundingClientRect();
            var tx = clientX - outerRect.left + 14;
            var ty = clientY - outerRect.top  - 10;
            var tw = tooltip.offsetWidth  || 170;
            var th = tooltip.offsetHeight || 80;
            if (tx + tw > W - 8) tx = tx - tw - 28;
            if (ty + th > H - 8) ty = H - th - 8;
            if (ty < 4) ty = 4;
            tooltip.style.left = tx + 'px';
            tooltip.style.top  = ty + 'px';
        }

        /* ── Stats Bar ───────────────────────────────── */
        function _updateStats() {
            var n = axes.length;
            if (n === 0) { statsBar.innerHTML = ''; return; }

            var ok = 0, warn = 0, crit = 0;
            var warnT = (config.WarnPct || 70) / 100;
            var critT = (config.CritPct || 85) / 100;
            for (var i = 0; i < n; i++) {
                var norm = currentValues[i] / (axes[i].max || 100);
                if (norm >= critT)      crit++;
                else if (norm >= warnT) warn++;
                else                    ok++;
            }

            var html = '<span class="wow-rd-stat">\u05E6\u05D9\u05E8\u05D9\u05DD: <b>' + n + '</b></span>';
            html += '<span class="wow-rd-stat" style="color:' + CLR.ok + '">\u05EA\u05E7\u05D9\u05DF: <b>' + ok + '</b></span>';
            if (warn > 0) html += '<span class="wow-rd-stat" style="color:' + CLR.warn + '">\u05D0\u05D6\u05D4\u05E8\u05D4: <b>' + warn + '</b></span>';
            if (crit > 0) html += '<span class="wow-rd-stat" style="color:' + CLR.crit + '">\u05E7\u05E8\u05D9\u05D8\u05D9: <b>' + crit + '</b></span>';
            statsBar.innerHTML = html;
        }

        /* ── Export PNG ──────────────────────────────── */
        function _onExportClick() {
            try {
                var link = document.createElement('a');
                link.download = 'wow-radar-' + new Date().toISOString().slice(0, 10) + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch (e) { /* cross-origin guard */ }
        }
        btnExport.addEventListener('click', _onExportClick);

        /* ── Reset Animation ─────────────────────────── */
        function _onResetClick() {
            for (var i = 0; i < currentValues.length; i++) {
                currentValues[i] = 0;  // zoom-from-center effect
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
            if (v && axes.length === 0) {
                _initDemoAxes();
                if (!isRunning) _startLoop();
            }
        });
        scope.$watchGroup([
            'config.WarnPct', 'config.CritPct',
            'config.LerpFactor', 'config.LabelMode',
            'config.ShowReference', 'config.GridRings',
            'config.Decimals', 'config.fontFamily', 'config.fontSize'
        ], function () {
            if (idleMode) _drawFrame();
        });

        /* ── Cleanup ─────────────────────────────────── */
        scope.$on('$destroy', function () {
            isRunning = false;
            if (animId) { cancelAnimationFrame(animId); clearTimeout(animId); }
            if (_dataDebounceId) { clearTimeout(_dataDebounceId); _dataDebounceId = null; }
            resizeObs.disconnect();
            canvas.removeEventListener('mousemove', _onCanvasMouseMove);
            canvas.removeEventListener('mouseleave', _onCanvasMouseLeave);
            btnExport.removeEventListener('click', _onExportClick);
            btnReset.removeEventListener('click', _onResetClick);
            targetValues = currentValues = axes = refValues = _pendingData = null;
        });

        /* ── Init ─────────────────────────────────────── */
        if (config.DemoMode) {
            _initDemoAxes();
            // Loop starts when ResizeObserver fires
        }
    };

    /* ═══════════════════════════════════════════════════
     *  REGISTRATION
     * ═══════════════════════════════════════════════════ */

    PV.symbolCatalog.register({
        typeName:           'radar-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05E8\u05D3\u05D0\u05E8 \u05D7\u05E8\u05D9\u05D2\u05D5\u05EA WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        getDefaultConfig: function () {
            return {
                DataShape:     'Table',
                Height:        450,
                Width:         450,
                Title:         'Executive Anomaly Radar',
                DemoMode:      true,
                WarnPct:       70,
                CritPct:       85,
                LerpFactor:    8,
                LabelMode:     'hover',
                ShowReference: true,
                GridRings:     5,
                Decimals:      1,
                DefaultMax:    100,
                MaxLimits:     [],
                fontFamily:    'Segoe UI',
                fontSize:      12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E8\u05D3\u05D0\u05E8 \u05D7\u05E8\u05D9\u05D2\u05D5\u05EA WOW'
    });

})(window.PIVisualization);
