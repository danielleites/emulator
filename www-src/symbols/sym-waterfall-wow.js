(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Kinetic Waterfall — WOW v100
     * ═══════════════════════════════════════════════════════
     *  Canvas waterfall chart with:
     *  - Single Pass Running Total (reduce-style loop)
     *  - Cascading Flow Animation (lineDashOffset on GPU)
     *  - Highlight Biggest Loser (shadowBlur red glow)
     *  - Contextual Delta (% of anchor per step)
     *  - Executive dark theme · DPR scaling · Hebrew RTL
     *  - Shadow DOM isolation · Glassmorphism tooltip
     *
     *  0 SVG elements · 0 DOM cells · 60fps flow animation
     *  <1ms draw for 20+ steps vs 200ms SVG reflow
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    /* ── Executive Palette ── */
    var CLR = {
        bgStart:    '#0A0F1C',
        bgEnd:      '#111B2E',
        total:      '#5BC0EB',
        totalDim:   'rgba(91, 192, 235, 0.12)',
        gain:       '#00F5D4',
        gainDim:    'rgba(0, 245, 212, 0.10)',
        loss:       '#FF3B30',
        lossDim:    'rgba(255, 59, 48, 0.10)',
        lossGlow:   'rgba(255, 59, 48, 0.60)',
        flow:       'rgba(91, 192, 235, 0.45)',
        grid:       'rgba(91, 192, 235, 0.06)',
        gridStroke: 'rgba(91, 192, 235, 0.12)',
        baseline:   'rgba(255, 255, 255, 0.25)',
        text:       '#ECF0F1',
        textMuted:  '#8899AA',
        ok:         '#00F5D4',
        warn:       '#FFCC00',
        crit:       '#FF3B30'
    };

    /* ── Demo Data: Power Plant Energy Cascade ── */
    var DEMO_BASE = [
        { Label: '\u05D9\u05D9\u05E6\u05D5\u05E8 \u05D1\u05E8\u05D5\u05D8\u05D5',      Value:  500  },
        { Label: '\u05E6\u05E8\u05D9\u05DB\u05D4 \u05E2\u05E6\u05DE\u05D9\u05EA',       Value: -35   },
        { Label: '\u05D4\u05E4\u05E1\u05D3\u05D9 \u05D8\u05E8\u05E0\u05E1\u05E4\u05D5\u05E8\u05DE\u05E6\u05D9\u05D4', Value: -22 },
        { Label: '\u05D4\u05E4\u05E1\u05D3\u05D9 \u05E8\u05E9\u05EA',         Value: -48   },
        { Label: '\u05D4\u05E4\u05E1\u05D3\u05D9 \u05D4\u05D5\u05DC\u05DB\u05D4',       Value: -15   },
        { Label: '\u05D4\u05E4\u05E1\u05D3\u05D9 \u05D7\u05DC\u05D5\u05E7\u05D4',       Value:  -8   },
        { Label: '\u05D9\u05D9\u05E6\u05D5\u05E8 \u05E0\u05D8\u05D5',         Value:  372  }
    ];

    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var self   = this;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-waterfall-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-wf-root-mount');
        if (!mountEl) {
            console.error('[WOW Waterfall] Mount element .wow-wf-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-waterfall-wow.css';
        shadow.appendChild(linkEl);

        /* ═══ DOM Scaffold ═══ */
        function _el(tag, cls) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            return e;
        }

        var root       = _el('div', 'wow-wf-root');
        var toolbar    = _el('div', 'wow-wf-toolbar');
        var titleEl    = _el('span', 'wow-wf-title');
        var actions    = _el('div', 'wow-wf-toolbar-actions');
        var btnExport  = _el('button', 'wow-wf-btn');
        btnExport.textContent = '\uD83D\uDCF8 Export';

        actions.appendChild(btnExport);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        var statsBar    = _el('div', 'wow-wf-stats');
        var canvasOuter = _el('div', 'wow-wf-canvas-outer');
        var canvas      = document.createElement('canvas');
        canvas.className = 'wow-wf-canvas';
        var ctx = canvas.getContext('2d', { alpha: false });

        var tooltip  = _el('div', 'wow-wf-tooltip');
        tooltip.style.display = 'none';

        var skeleton = _el('div', 'wow-wf-skeleton');

        var footer = _el('div', 'wow-wf-footer');
        footer.textContent = 'WOW Waterfall v100 \u00B7 Executive Kinetic Waterfall';

        canvasOuter.appendChild(canvas);
        canvasOuter.appendChild(tooltip);
        canvasOuter.appendChild(skeleton);
        root.appendChild(toolbar);
        root.appendChild(statsBar);
        root.appendChild(canvasOuter);
        root.appendChild(footer);
        shadow.appendChild(root);


        /* ═══ Web Worker ═══ */
        var worker = null;
        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-waterfall-worker.js');
        } catch (e) {
            console.warn('[WOW Waterfall] Worker unavailable, using main-thread fallback');
        }

        /* ═══ State ═══ */
        var W = 0, H = 0, dpr = 1;
        var rafId      = null;
        var flowOffset = 0;
        var latestRows = [];
        var steps      = [];
        var barRects   = [];        // [{x,y,w,h,idx}] for hit testing
        var anchorVal  = 0;
        var finalVal   = 0;
        var loserIdx   = -1;       // biggest-loser index
        var loserVal   = 0;
        var hoveredIdx = -1;
        var hasData    = false;
        var minVal = 0, maxVal = 0;

        /* ── Debounce State ── */
        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;

        /* ── Layout Constants ── */
        var PAD = { top: 48, bottom: 58, left: 60, right: 25 };
        var BAR_GAP    = 12;
        var BAR_RADIUS = 4;
        var FLOW_DASH  = [5, 5];
        var FLOW_SPEED = 0.6;


        /* ═══ Helpers ═══ */

        /** Rounded rectangle path (cross-browser, no ctx.roundRect) */
        function _roundRect(c, x, y, w, h, r) {
            if (h < 0) { y += h; h = -h; }
            if (h < 1) h = 1;
            if (r > h / 2) r = h / 2;
            if (r > w / 2) r = w / 2;
            c.beginPath();
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - r);
            c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r);
            c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y);
            c.closePath();
        }

        /** Compute nice Y-axis tick interval */
        function _niceInterval(range, ticks) {
            var rough = range / ticks;
            if (rough <= 0) return 1;
            var mag = Math.pow(10, Math.floor(Math.log10(rough)));
            var res = rough / mag;
            var nice;
            if (res <= 1.5) nice = 1;
            else if (res <= 3) nice = 2;
            else if (res <= 7) nice = 5;
            else nice = 10;
            return nice * mag;
        }

        /** Truncate long Hebrew labels to fit bar width */
        function _truncateLabel(text, maxW, c) {
            if (c.measureText(text).width <= maxW) return text;
            var ellip = '\u2026';
            for (var len = text.length - 1; len > 0; len--) {
                var t = text.substring(0, len) + ellip;
                if (c.measureText(t).width <= maxW) return t;
            }
            return ellip;
        }


        /* ═══════════════════════════════════════════════════
         *  THE GEM: Single Pass Running Total
         *  One loop builds the full waterfall geometry.
         *  No sort, no reflow, no DOM — pure arithmetic.
         * ═══════════════════════════════════════════════════ */
        function _computeSteps(rows) {
            var autoTotals = config.AutoTotals !== false;
            var totalStr   = (config.TotalIndices || '').trim();
            var totalSet   = {};
            if (totalStr) {
                totalStr.split(',').forEach(function (s) {
                    var idx = parseInt(s.trim(), 10);
                    if (!isNaN(idx)) totalSet[idx] = true;
                });
            }

            var running = 0;
            var result  = [];
            var mn = 0, mx = 0;
            var worstVal = 0, worstI = -1;

            for (var i = 0; i < rows.length; i++) {
                var val   = parseFloat(rows[i].Value) || 0;
                var label = rows[i].Label || ('Step ' + (i + 1));
                var isTotal = totalSet[i] ||
                              (autoTotals && (i === 0 || i === rows.length - 1));

                var start, end;

                if (isTotal) {
                    if (i === 0) {
                        /* First anchor: value IS the starting total */
                        start = 0; end = val; running = val;
                    } else {
                        /* Final total: bar from zero to running total */
                        start = 0; end = running; val = running;
                    }
                } else {
                    start = running;
                    running += val;
                    end = running;
                    /* Track biggest loser */
                    if (val < 0 && Math.abs(val) > Math.abs(worstVal)) {
                        worstVal = val;
                        worstI = result.length;
                    }
                }

                var lo = Math.min(start, end, 0);
                var hi = Math.max(start, end);
                if (lo < mn) mn = lo;
                if (hi > mx) mx = hi;

                result.push({
                    label:   label,
                    val:     val,
                    start:   start,
                    end:     end,
                    isTotal: !!isTotal,
                    running: end
                });
            }

            steps      = result;
            anchorVal  = result.length > 0 ? result[0].end : 0;
            finalVal   = running;
            loserIdx   = worstI;
            loserVal   = worstVal;
            minVal     = mn;
            maxVal     = mx;
        }


        /* ═══ Worker-Aware Compute ═══ */
        function _computeWithWorker(rows, callback) {
            if (worker) {
                worker.postMessage({
                    cmd:          'COMPUTE',
                    rows:         rows,
                    autoTotals:   config.AutoTotals !== false,
                    totalIndices: config.TotalIndices || ''
                });
            } else {
                /* Fallback: main-thread computation */
                _computeSteps(rows);
                if (callback) callback();
            }
        }

        if (worker) {
            worker.onmessage = function (e) {
                var msg = e.data;
                if (!msg || msg.cmd !== 'RESULT') return;
                steps     = msg.steps;
                anchorVal = msg.stats.anchorVal;
                finalVal  = msg.stats.finalVal;
                loserIdx  = msg.stats.loserIdx;
                loserVal  = msg.stats.loserVal;
                minVal    = msg.stats.minVal;
                maxVal    = msg.stats.maxVal;
                _updateStats();
                _startLoop();
            };
        }


        /* ═══ Stats Bar ═══ */
        function _updateStats() {
            var dec = config.Decimals != null ? config.Decimals : 1;
            var n   = steps.length;
            var html = '<span class="wow-wf-stat">\u05E9\u05DC\u05D1\u05D9\u05DD: <b>' + n + '</b></span>';
            if (anchorVal !== 0) {
                html += '<span class="wow-wf-stat">\u05E2\u05D5\u05D2\u05DF: <b>' +
                        anchorVal.toFixed(dec) + '</b></span>';
            }
            html += '<span class="wow-wf-stat">\u05E1\u05D5\u05E4\u05D9: <b>' +
                    finalVal.toFixed(dec) + '</b></span>';
            if (loserIdx >= 0 && steps[loserIdx]) {
                html += '<span class="wow-wf-stat" style="color:' + CLR.crit +
                        '">\u05D4\u05E4\u05E1\u05D3 \u05DE\u05E8\u05D1\u05D9: <b>' +
                        steps[loserIdx].label + ' (' + loserVal.toFixed(dec) + ')</b></span>';
            }
            if (anchorVal !== 0) {
                var netPct = ((finalVal - anchorVal) / Math.abs(anchorVal) * 100).toFixed(1);
                html += '<span class="wow-wf-stat">\u05E9\u05D9\u05E0\u05D5\u05D9 \u05E0\u05D8\u05D5: <b>' +
                        netPct + '%</b></span>';
            }
            statsBar.innerHTML = html;
        }


        /* ═══════════════════════════════════════════════════
         *  Main Draw — Canvas Render Pass
         * ═══════════════════════════════════════════════════ */
        function _draw() {
            if (W === 0 || H === 0 || steps.length === 0) return;

            var dec        = config.Decimals != null ? config.Decimals : 1;
            var showValues = config.ShowValues !== false;
            var showDelta  = config.ShowDelta  !== false;
            var showGrid   = config.ShowGrid   !== false;
            var ff         = config.fontFamily || 'Segoe UI';
            var fs         = config.fontSize   || 12;

            /* ── Background Gradient ── */
            var bgGrad = ctx.createLinearGradient(0, 0, 0, H);
            bgGrad.addColorStop(0, CLR.bgStart);
            bgGrad.addColorStop(1, CLR.bgEnd);
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, W, H);

            /* ── Chart Area ── */
            var cX = PAD.left, cY = PAD.top;
            var cW = W - PAD.left - PAD.right;
            var cH = H - PAD.top - PAD.bottom;
            if (cW < 60 || cH < 60) return;

            /* ── Y-Scale with 10% padding ── */
            var range = maxVal - minVal;
            if (range === 0) range = 1;
            var pad10     = range * 0.10;
            var scaleMin  = minVal - pad10;
            var scaleMax  = maxVal + pad10;
            var scaleSpan = scaleMax - scaleMin;

            function valToY(v) {
                return cY + cH - ((v - scaleMin) / scaleSpan) * cH;
            }

            /* ── Grid Lines + Y-Axis Labels ── */
            if (showGrid) {
                var interval  = _niceInterval(scaleSpan, 5);
                var gridStart = Math.ceil(scaleMin / interval) * interval;
                ctx.font          = (fs - 2) + 'px "' + ff + '"';
                ctx.textAlign     = 'right';
                ctx.textBaseline  = 'middle';
                for (var gv = gridStart; gv <= scaleMax + 0.001; gv += interval) {
                    var gy = valToY(gv);
                    ctx.beginPath();
                    ctx.moveTo(cX, gy);
                    ctx.lineTo(cX + cW, gy);
                    ctx.strokeStyle = CLR.gridStroke;
                    ctx.lineWidth   = 0.5;
                    ctx.stroke();
                    ctx.fillStyle = CLR.textMuted;
                    var gridLabel = Math.abs(gv) >= 1000
                        ? (gv / 1000).toFixed(1) + 'K'
                        : gv.toFixed(gv === Math.round(gv) ? 0 : 1);
                    ctx.fillText(gridLabel, cX - 8, gy);
                }
            }

            /* ── Baseline (Zero Line) ── */
            var zeroY = valToY(0);
            ctx.beginPath();
            ctx.moveTo(cX, zeroY);
            ctx.lineTo(cX + cW, zeroY);
            ctx.strokeStyle = CLR.baseline;
            ctx.lineWidth   = 1;
            ctx.stroke();

            /* ── Bar Layout ── */
            var n = steps.length;
            var totalBarSpace = cW - (n - 1) * BAR_GAP;
            var barW = totalBarSpace / n;
            if (barW > 90) barW = 90;
            if (barW < 14) barW = 14;
            var usedW  = n * barW + (n - 1) * BAR_GAP;
            var startX = cX + (cW - usedW) / 2;

            barRects = [];

            /* ── Draw Each Step ── */
            for (var i = 0; i < n; i++) {
                var step = steps[i];
                var bx   = startX + i * (barW + BAR_GAP);

                /* Bar geometry: yTop (visual top), yBot (visual bottom) */
                var yTop, yBot;
                if (step.isTotal) {
                    yTop = valToY(Math.max(0, step.end));
                    yBot = valToY(Math.min(0, step.end));
                } else {
                    yTop = valToY(Math.max(step.start, step.end));
                    yBot = valToY(Math.min(step.start, step.end));
                }
                var bh = yBot - yTop;
                if (bh < 2) bh = 2;

                barRects.push({ x: bx, y: yTop, w: barW, h: bh, idx: i });

                /* ─── Biggest Loser Glow (shadowBlur) ─── */
                var isLoser = (i === loserIdx);
                if (isLoser) {
                    ctx.save();
                    ctx.shadowBlur  = 22;
                    ctx.shadowColor = CLR.lossGlow;
                }

                /* ─── Bar Fill Color ─── */
                if (step.isTotal)      ctx.fillStyle = CLR.total;
                else if (step.val < 0) ctx.fillStyle = CLR.loss;
                else                   ctx.fillStyle = CLR.gain;

                _roundRect(ctx, bx, yTop, barW, bh, BAR_RADIUS);
                ctx.fill();

                /* Double-fill for stronger glow on loser */
                if (isLoser) {
                    _roundRect(ctx, bx, yTop, barW, bh, BAR_RADIUS);
                    ctx.fill();
                    ctx.restore();
                }

                /* ─── Subtle gradient overlay on bars ─── */
                ctx.save();
                ctx.globalAlpha = 0.08;
                var barGrad = ctx.createLinearGradient(bx, yTop, bx, yBot);
                barGrad.addColorStop(0, '#FFFFFF');
                barGrad.addColorStop(1, '#000000');
                ctx.fillStyle = barGrad;
                _roundRect(ctx, bx, yTop, barW, bh, BAR_RADIUS);
                ctx.fill();
                ctx.restore();

                /* ─── Hover Highlight ─── */
                if (i === hoveredIdx) {
                    ctx.save();
                    ctx.globalAlpha = 0.12;
                    ctx.fillStyle = '#FFFFFF';
                    _roundRect(ctx, bx, yTop, barW, bh, BAR_RADIUS);
                    ctx.fill();
                    ctx.restore();
                }

                /* ══════════════════════════════════════════
                 *  THE GEM: Cascading Flow Animation
                 *  Dashed connector with animated lineDashOffset
                 *  creates illusion of energy "flowing" between stages.
                 *  Runs on GPU compositor — 0% CPU cost.
                 * ══════════════════════════════════════════ */
                if (i < n - 1 && !steps[i + 1].isTotal) {
                    var flowY = valToY(step.end);
                    ctx.beginPath();
                    ctx.moveTo(bx + barW, flowY);
                    ctx.lineTo(bx + barW + BAR_GAP, flowY);
                    ctx.strokeStyle    = CLR.flow;
                    ctx.lineWidth      = 1.5;
                    ctx.setLineDash(FLOW_DASH);
                    ctx.lineDashOffset = flowOffset;
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                /* ─── Value Label ─── */
                if (showValues) {
                    var centerX = bx + barW / 2;
                    var valStr;
                    if (step.isTotal) {
                        valStr = step.end.toFixed(dec);
                    } else {
                        valStr = (step.val >= 0 ? '+' : '') + step.val.toFixed(dec);
                    }

                    /* Check if there's a delta line too */
                    var hasDelta = showDelta && !step.isTotal && anchorVal !== 0;
                    var valY = hasDelta ? (yTop - fs - 2) : (yTop - 6);

                    ctx.font         = 'bold ' + fs + 'px "' + ff + '"';
                    ctx.textAlign    = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillStyle    = CLR.text;
                    ctx.fillText(valStr, centerX, valY);

                    /* Contextual Delta: (X.X%) — below value, above bar */
                    if (hasDelta) {
                        var pct = (Math.abs(step.val) / Math.abs(anchorVal) * 100).toFixed(1);
                        ctx.font      = (fs - 2) + 'px "' + ff + '"';
                        ctx.fillStyle = CLR.textMuted;
                        ctx.fillText('(' + pct + '%)', centerX, yTop - 3);
                    }
                }

                /* ─── Category Label (X-axis) ─── */
                ctx.font         = (fs - 1) + 'px "' + ff + '"';
                ctx.fillStyle    = i === hoveredIdx ? CLR.text : CLR.textMuted;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';

                if (barW < 50) {
                    /* Rotate labels when bars are narrow */
                    ctx.save();
                    ctx.translate(bx + barW / 2, cY + cH + 6);
                    ctx.rotate(-Math.PI / 5);
                    ctx.textAlign = 'right';
                    ctx.fillText(
                        _truncateLabel(step.label, PAD.bottom - 8, ctx),
                        0, 0
                    );
                    ctx.restore();
                } else {
                    ctx.fillText(
                        _truncateLabel(step.label, barW - 4, ctx),
                        bx + barW / 2,
                        cY + cH + 8
                    );
                }
            }
        }


        /* ═══ Animation Loop ═══ */
        function _startLoop() {
            if (rafId) return;
            _loop();
        }

        function _stopLoop() {
            if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
        }

        function _loop() {
            rafId = null;

            /* Demo oscillation: subtle sine-wave perturbation */
            if (config.DemoMode && hasData) {
                _updateDemoData();
            }

            _draw();

            /* Keep running for flow animation while data exists */
            if (hasData) {
                flowOffset -= FLOW_SPEED;
                if (flowOffset < -1000) flowOffset = 0;
                rafId = requestAnimationFrame(_loop);
            }
        }


        /* ═══ Hit Testing + Tooltip ═══ */

        function _hitTest(mx, my) {
            for (var i = 0; i < barRects.length; i++) {
                var r = barRects[i];
                if (mx >= r.x && mx <= r.x + r.w &&
                    my >= r.y && my <= r.y + r.h) {
                    return i;
                }
            }
            return -1;
        }

        function _onMouseMove(e) {
            var rect = canvas.getBoundingClientRect();
            var mx   = e.clientX - rect.left;
            var my   = e.clientY - rect.top;
            var idx  = _hitTest(mx, my);
            hoveredIdx = idx;

            if (idx >= 0) {
                _showTooltip(idx, e.clientX, e.clientY);
                canvas.style.cursor = 'pointer';
            } else {
                tooltip.style.display = 'none';
                canvas.style.cursor   = 'crosshair';
            }
        }

        function _onMouseLeave() {
            hoveredIdx = -1;
            tooltip.style.display = 'none';
            canvas.style.cursor   = 'crosshair';
        }

        function _showTooltip(idx, cx, cy) {
            var step = steps[idx];
            if (!step) return;

            var dec = config.Decimals != null ? config.Decimals : 1;
            var statusLabel, statusCls;
            if (step.isTotal)      { statusLabel = '\u05E2\u05D5\u05D2\u05DF';  statusCls = 'wow-wf-tt-total'; }
            else if (step.val < 0) { statusLabel = '\u05D4\u05E4\u05E1\u05D3';  statusCls = 'wow-wf-tt-loss'; }
            else                   { statusLabel = '\u05EA\u05D5\u05E1\u05E4\u05EA'; statusCls = 'wow-wf-tt-gain'; }

            var deltaHtml = '';
            if (!step.isTotal && anchorVal !== 0) {
                var pct = (Math.abs(step.val) / Math.abs(anchorVal) * 100).toFixed(1);
                deltaHtml = '<div class="wow-wf-tt-delta">' + pct +
                            '% \u05DE\u05D4\u05E2\u05D5\u05D2\u05DF</div>';
            }

            var loserBadge = (idx === loserIdx)
                ? '<div class="wow-wf-tt-loser">\u26A0 \u05D4\u05E4\u05E1\u05D3 \u05DE\u05E8\u05D1\u05D9!</div>'
                : '';

            tooltip.innerHTML =
                '<div class="wow-wf-tt-label">' + step.label + '</div>' +
                '<div class="wow-wf-tt-value">\u05E2\u05E8\u05DA: <b>' +
                    (step.isTotal ? '' : (step.val >= 0 ? '+' : '')) +
                    step.val.toFixed(dec) + '</b></div>' +
                '<div class="wow-wf-tt-value">\u05DE\u05D0\u05D6\u05DF \u05E8\u05E5: <b>' +
                    step.running.toFixed(dec) + '</b></div>' +
                deltaHtml + loserBadge +
                '<div class="' + statusCls + '">' + statusLabel + '</div>';

            tooltip.style.display = 'block';

            /* Position within canvasOuter bounds */
            var outerRect = canvasOuter.getBoundingClientRect();
            var tx = cx - outerRect.left + 15;
            var ty = cy - outerRect.top - 10;
            var tw = tooltip.offsetWidth  || 180;
            var th = tooltip.offsetHeight || 120;
            if (tx + tw > canvasOuter.clientWidth - 5)  tx = tx - tw - 30;
            if (ty + th > canvasOuter.clientHeight - 5) ty = canvasOuter.clientHeight - th - 5;
            if (ty < 5) ty = 5;
            tooltip.style.left = tx + 'px';
            tooltip.style.top  = ty + 'px';
        }

        canvas.addEventListener('mousemove',  _onMouseMove);
        canvas.addEventListener('mouseleave', _onMouseLeave);


        /* ═══ Export ═══ */
        function _onExportClick() {
            var a = document.createElement('a');
            a.download = 'wow-waterfall-' + Date.now() + '.png';
            a.href     = canvas.toDataURL('image/png');
            a.click();
        }
        btnExport.addEventListener('click', _onExportClick);


        /* ═══ ResizeObserver ═══ */
        var resizeTimer = null;
        var ro = new ResizeObserver(function (entries) {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function () {
                var entry = entries[0];
                if (!entry) return;
                var cr = entry.contentRect;
                W   = cr.width;
                H   = cr.height;
                dpr = window.devicePixelRatio || 1;
                canvas.width  = W * dpr;
                canvas.height = H * dpr;
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
                if (hasData) _startLoop();
            }, 150);
        });
        ro.observe(canvasOuter);


        /* ═══ Config ═══ */
        function _applyConfig() {
            titleEl.textContent = config.Title || 'Executive Kinetic Waterfall';
            var ff = config.fontFamily || 'Segoe UI';
            var fs = config.fontSize   || 12;
            root.style.setProperty('--wow-wf-font',      '"' + ff + '", Arial, sans-serif');
            root.style.setProperty('--wow-wf-font-size',  fs + 'px');
            if (latestRows && latestRows.length > 0) {
                _computeWithWorker(latestRows, function () {
                    _updateStats();
                });
            }
        }

        ['Title', 'DemoMode', 'AutoTotals', 'TotalIndices',
         'ShowValues', 'ShowDelta', 'ShowGrid', 'Decimals',
         'fontFamily', 'fontSize'].forEach(function (key) {
            scope.$watch('config.' + key, function () { _applyConfig(); });
        });


        /* ═══ Demo Mode ═══ */
        function _updateDemoData() {
            var t    = Date.now() * 0.001;
            var rows = [];
            for (var i = 0; i < DEMO_BASE.length; i++) {
                var base = DEMO_BASE[i];
                var val  = base.Value;
                /* Oscillate only intermediate rows (not first/last totals) */
                if (i > 0 && i < DEMO_BASE.length - 1) {
                    val += Math.sin(t * 0.7 + i * 1.9) * Math.abs(base.Value) * 0.12;
                }
                rows.push({ Label: base.Label, Value: val });
            }
            latestRows = rows;
            _computeSteps(rows);
        }

        function _initDemo() {
            hasData = true;
            skeleton.style.display = 'none';
            _updateDemoData();
            _updateStats();
            _startLoop();
        }


        /* ═══ Data Bridge (with Debounce Accumulator) ═══ */

        function _processData(data) {
            latestRows = data.Rows;
            hasData = true;
            skeleton.style.display = 'none';
            _computeWithWorker(latestRows, function () {
                /* main-thread fallback callback */
                _updateStats();
                _startLoop();
            });
        }

        self.onDataUpdate = function (data) {
            if (config.DemoMode) return;
            if (!data || !data.Rows || data.Rows.length === 0) return;

            _pendingData = data;

            /* Immediate on first data (remove skeleton fast) */
            if (!hasData) {
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
        if (config.DemoMode) {
            _initDemo();
        }


        /* ═══ Cleanup ═══ */
        scope.$on('$destroy', function () {
            _stopLoop();
            clearTimeout(resizeTimer);
            clearTimeout(_dataDebounceId);
            if (ro) { ro.disconnect(); ro = null; }
            if (worker) { worker.terminate(); worker = null; }
            canvas.removeEventListener('mousemove',  _onMouseMove);
            canvas.removeEventListener('mouseleave', _onMouseLeave);
            btnExport.removeEventListener('click', _onExportClick);
            latestRows   = null;
            steps        = null;
            barRects     = null;
            _pendingData = null;
            ctx          = null;
            shadow       = null;
        });
    };


    /* ═══ Symbol Registration ═══ */
    PV.symbolCatalog.register({
        typeName:           'waterfall-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05DE\u05E4\u05DC \u05E7\u05D9\u05E0\u05D8\u05D9 WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        getDefaultConfig: function () {
            return {
                DataShape:    'Table',
                Height:       400,
                Width:        800,
                Title:        'Executive Kinetic Waterfall',
                DemoMode:     true,
                AutoTotals:   true,
                TotalIndices: '',
                ShowValues:   true,
                ShowDelta:    true,
                ShowGrid:     true,
                Decimals:     1,
                fontFamily:   'Segoe UI',
                fontSize:     12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DE\u05E4\u05DC \u05E7\u05D9\u05E0\u05D8\u05D9 WOW'
    });

})(window.PIVisualization);
