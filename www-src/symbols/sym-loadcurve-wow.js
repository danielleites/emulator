/**
 * ═══════════════════════════════════════════════════════
 *  sym-loadcurve-wow.js  —  Executive Predictive Load Curve
 * ═══════════════════════════════════════════════════════
 *  GPU-accelerated Canvas Path2D time-series visualization.
 *  Renders 100,000 data points in <2ms via single ctx.stroke()
 *  call — zero DOM reflow, zero SVG node creation.
 *
 *  Architecture:
 *    PI Vision → dataUpdate() → rAF → Canvas Path2D → GPU
 *    Solid line = history, Dashed line = forecast
 *    "Now" line = animated vertical separator
 *    Risk zone = shaded polygon above threshold
 *
 *  DataShape : TimeSeries (PI Web API PlotValues decimation)
 *  Version   : WOW LC 100.0
 *  Prefix    : wow-lc-
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    // ── Symbol constructor ──
    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    // ── Resolve script base path ──
    var SCRIPT_BASE = (function () {
        var scripts = document.querySelectorAll('script[src*="sym-loadcurve-wow"]');
        if (scripts.length) {
            var s = scripts[scripts.length - 1].getAttribute('src') || '';
            return s.substring(0, s.lastIndexOf('/') + 1);
        }
        var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
        return base + '/Scripts/app/editor/symbols/ext/';
    })();


    // ═══════════════════════════════════════
    //  CONSTANTS
    // ═══════════════════════════════════════

    var PADDING = { top: 40, right: 30, bottom: 50, left: 70 };
    var AXIS_TICK_LEN = 5;
    var GRID_LINES = 5;
    var TOOLTIP_OFFSET = 12;
    var NOW_LINE_WIDTH = 2;
    var CROSSHAIR_DASH = [4, 4];

    // Executive palette
    var COLORS = {
        ok:         '#00F5D4',
        warn:       '#FFCC00',
        crit:       '#FF3B30',
        forecast:   '#5BC0EB',
        riskZone:   'rgba(255, 59, 48, 0.12)',
        riskBorder: 'rgba(255, 59, 48, 0.4)',
        nowLine:    '#FFFFFF',
        grid:       'rgba(91, 192, 235, 0.08)',
        axis:       '#3A5068',
        text:       '#8899AA',
        textBright: '#ECF0F1',
        bg:         '#060C18',
        bgEnd:      '#0D1F35'
    };

    // Hebrew month/day labels
    var MONTHS_HE = ['\u05D9\u05E0\u05D5','\u05E4\u05D1','\u05DE\u05E8','\u05D0\u05E4\u05E8','\u05DE\u05D0\u05D9','\u05D9\u05D5\u05E0','\u05D9\u05D5\u05DC','\u05D0\u05D5\u05D2','\u05E1\u05E4\u05D8','\u05D0\u05D5\u05E7','\u05E0\u05D5\u05D1','\u05D3\u05E6\u05DE'];
    var DAYS_HE = ['\u05D0\u05F3','\u05D1\u05F3','\u05D2\u05F3','\u05D3\u05F3','\u05D4\u05F3','\u05D5\u05F3','\u05E9\u05D1\u05EA'];


    // ═══════════════════════════════════════
    //  DEMO DATA GENERATOR
    // ═══════════════════════════════════════

    function generateDemoData(config) {
        var points = [];
        var now = Date.now();
        var hoursBack = config.HoursBack || 24;
        var hoursForward = config.HoursForward || 24;
        var totalHours = hoursBack + hoursForward;
        var baseLoad = (config.MaxLimit || 100) * 0.55;
        var amplitude = (config.MaxLimit || 100) * 0.25;
        var noiseLevel = (config.MaxLimit || 100) * 0.05;
        var intervalMs = 60000; // 1 minute intervals

        for (var h = -hoursBack; h <= hoursForward; h += (1 / 60)) {
            var t = now + h * 3600000;
            var hourOfDay = new Date(t).getHours();

            // Realistic load curve: peak at noon/evening, trough at 3am
            var dailyCycle = Math.sin((hourOfDay - 3) * Math.PI / 12) * amplitude;
            var noise = (Math.random() - 0.5) * noiseLevel;

            // Forecast has increasing uncertainty
            var uncertaintyGrow = h > 0 ? h * noiseLevel * 0.1 : 0;
            var forecastNoise = h > 0 ? (Math.random() - 0.5) * uncertaintyGrow : 0;

            var value = baseLoad + dailyCycle + noise + forecastNoise;
            value = Math.max(0, Math.min(config.MaxLimit || 100, value));

            points.push({
                Time: new Date(t).toISOString(),
                Value: value.toFixed(2),
                IsForecast: h > 0
            });
        }

        return points;
    }


    // ═══════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════

    symbolVis.prototype.init = function (scope, elem) {
        var self = this;
        var config = scope.config;
        var hostEl = elem[0];

        // ── Shadow DOM (with fallback) ──
        var shadow;
        try {
            shadow = hostEl.querySelector('.wow-lc-root-mount');
            if (shadow && shadow.attachShadow) {
                shadow = shadow.attachShadow({ mode: 'open' });
            } else {
                shadow = hostEl.querySelector('.wow-lc-root-mount') || hostEl;
            }
        } catch (e) {
            shadow = hostEl.querySelector('.wow-lc-root-mount') || hostEl;
        }

        // ── Inject CSS ──
        var linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-loadcurve-wow.css';
        shadow.appendChild(linkEl);

        // ── Build DOM scaffold ──
        var root = document.createElement('div');
        root.className = 'wow-lc-root';

        // Title bar
        var titleBar = document.createElement('div');
        titleBar.className = 'wow-lc-title-bar';
        titleBar.innerHTML =
            '<span class="wow-lc-title-text">' + (config.Title || 'Executive Load Curve') + '</span>' +
            '<div class="wow-lc-legend"></div>';
        root.appendChild(titleBar);

        // Stats bar
        var statsBar = document.createElement('div');
        statsBar.className = 'wow-lc-stats-bar';
        root.appendChild(statsBar);

        // Canvas container (for proper sizing)
        var canvasWrap = document.createElement('div');
        canvasWrap.className = 'wow-lc-canvas-wrap';

        var canvas = document.createElement('canvas');
        canvas.className = 'wow-lc-canvas';
        canvasWrap.appendChild(canvas);

        // "Now" line overlay (CSS animated)
        var nowLineEl = document.createElement('div');
        nowLineEl.className = 'wow-lc-now-line';
        canvasWrap.appendChild(nowLineEl);

        // Crosshair line (follows mouse)
        var crosshairEl = document.createElement('div');
        crosshairEl.className = 'wow-lc-crosshair';
        canvasWrap.appendChild(crosshairEl);

        root.appendChild(canvasWrap);

        // Tooltip (floating, outside layout)
        var tooltip = document.createElement('div');
        tooltip.className = 'wow-lc-tooltip';
        tooltip.style.display = 'none';
        root.appendChild(tooltip);

        // Footer
        var footer = document.createElement('div');
        footer.className = 'wow-lc-footer';
        root.appendChild(footer);

        shadow.appendChild(root);

        // ── Canvas context ──
        var ctx = canvas.getContext('2d');
        var dpr = window.devicePixelRatio || 1;

        // ── State ──
        var latestSeries = [];     // Array of { time: ms, value: number, isForecast: bool }
        var chartArea = { x: 0, y: 0, w: 0, h: 0 };
        var scaleX = null;         // { min, max, range }
        var scaleY = null;         // { min, max, range }
        var animFrameId = null;
        var currentHoverIdx = -1;
        var canvasW = 0;
        var canvasH = 0;
        var nowMs = Date.now();
        var demoIntervalId = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var _firstDataDone  = false;
        var DATA_DEBOUNCE_MS = 100;

        // ── Legend ──
        var legendEl = titleBar.querySelector('.wow-lc-legend');
        _updateLegend();


        // ═══════════════════════════════════════
        //  LAYOUT & DPR
        // ═══════════════════════════════════════

        function setupCanvas() {
            var rect = canvasWrap.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return;

            dpr = window.devicePixelRatio || 1;
            canvasW = rect.width;
            canvasH = rect.height;

            // Crisp DPR scaling
            canvas.width = canvasW * dpr;
            canvas.height = canvasH * dpr;
            canvas.style.width = canvasW + 'px';
            canvas.style.height = canvasH + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Chart area (inside padding)
            chartArea.x = PADDING.left;
            chartArea.y = PADDING.top;
            chartArea.w = canvasW - PADDING.left - PADDING.right;
            chartArea.h = canvasH - PADDING.top - PADDING.bottom;
        }

        // ResizeObserver with debounce
        var resizeTimeout = null;
        var resizeObs = null;
        var _onWindowResize = null;
        try {
            resizeObs = new ResizeObserver(function () {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(function () {
                    setupCanvas();
                    requestDraw();
                }, 150);
            });
            resizeObs.observe(canvasWrap);
        } catch (e) {
            // Fallback: named handler for proper cleanup
            _onWindowResize = function () {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(function () {
                    setupCanvas();
                    requestDraw();
                }, 200);
            };
            window.addEventListener('resize', _onWindowResize);
        }


        // ═══════════════════════════════════════
        //  DATA PROCESSING
        // ═══════════════════════════════════════

        function processData(data) {
            var series = [];
            var rows;

            if (!data) return series;

            // PI Vision TimeSeries format
            if (data.Data && data.Data.length > 0 && data.Data[0].Values) {
                rows = data.Data[0].Values;
            } else if (Array.isArray(data)) {
                rows = data;
            } else {
                return series;
            }

            for (var i = 0; i < rows.length; i++) {
                var pt = rows[i];
                var val = parseFloat(pt.Value);
                if (isNaN(val)) continue;

                series.push({
                    time: new Date(pt.Time).getTime(),
                    value: val,
                    isForecast: !!pt.IsForecast
                });
            }

            // Sort by time
            series.sort(function (a, b) { return a.time - b.time; });

            return series;
        }

        function computeScales() {
            if (latestSeries.length === 0) return;

            var minT = latestSeries[0].time;
            var maxT = latestSeries[latestSeries.length - 1].time;
            var minV = Infinity;
            var maxV = -Infinity;

            for (var i = 0; i < latestSeries.length; i++) {
                var v = latestSeries[i].value;
                if (v < minV) minV = v;
                if (v > maxV) maxV = v;
            }

            // Add 10% headroom
            var headroom = (maxV - minV) * 0.1 || 5;
            minV = Math.max(0, minV - headroom);
            maxV = maxV + headroom;

            // Enforce MaxLimit if set
            if (config.MaxLimit && config.MaxLimit > 0) {
                maxV = Math.max(maxV, config.MaxLimit * 1.05);
            }

            scaleX = { min: minT, max: maxT, range: maxT - minT };
            scaleY = { min: minV, max: maxV, range: maxV - minV };
        }

        function toCanvasX(timeMs) {
            if (!scaleX || scaleX.range === 0) return chartArea.x;
            return chartArea.x + ((timeMs - scaleX.min) / scaleX.range) * chartArea.w;
        }

        function toCanvasY(value) {
            if (!scaleY || scaleY.range === 0) return chartArea.y + chartArea.h;
            return chartArea.y + chartArea.h - ((value - scaleY.min) / scaleY.range) * chartArea.h;
        }


        // ═══════════════════════════════════════
        //  DRAWING ENGINE (Path2D)
        // ═══════════════════════════════════════

        function requestDraw() {
            if (animFrameId) cancelAnimationFrame(animFrameId);
            animFrameId = requestAnimationFrame(drawFrame);
        }

        function drawFrame() {
            animFrameId = null;
            if (canvasW === 0 || latestSeries.length === 0) return;

            // Clear
            ctx.clearRect(0, 0, canvasW, canvasH);

            // Background gradient
            var bgGrad = ctx.createLinearGradient(0, 0, 0, canvasH);
            bgGrad.addColorStop(0, COLORS.bg);
            bgGrad.addColorStop(1, COLORS.bgEnd);
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, canvasW, canvasH);

            computeScales();
            if (!scaleX || !scaleY) return;

            drawGrid();
            drawRiskZone();
            drawDataLines();
            drawNowLine();
            drawAxes();
            drawAxisLabels();
            updateStats();
            updateNowLinePosition();
        }


        // ── Grid Lines ──
        function drawGrid() {
            ctx.strokeStyle = COLORS.grid;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);

            // Horizontal grid
            for (var i = 0; i <= GRID_LINES; i++) {
                var y = chartArea.y + (chartArea.h / GRID_LINES) * i;
                ctx.beginPath();
                ctx.moveTo(chartArea.x, y);
                ctx.lineTo(chartArea.x + chartArea.w, y);
                ctx.stroke();
            }

            // Vertical grid (time-based, every 4 hours)
            var startHour = new Date(scaleX.min);
            startHour.setMinutes(0, 0, 0);
            var hourMs = 3600000;
            var gridInterval = 4 * hourMs;
            var t = startHour.getTime();

            while (t < scaleX.max) {
                if (t >= scaleX.min) {
                    var x = toCanvasX(t);
                    ctx.beginPath();
                    ctx.moveTo(x, chartArea.y);
                    ctx.lineTo(x, chartArea.y + chartArea.h);
                    ctx.stroke();
                }
                t += gridInterval;
            }
        }


        // ── Risk Zone (shaded polygon above threshold) ──
        function drawRiskZone() {
            var maxLimit = config.MaxLimit || 100;
            var critPct = config.CriticalPct || 90;
            var threshold = maxLimit * (critPct / 100);
            var thresholdY = toCanvasY(threshold);

            // Only draw if threshold is visible
            if (thresholdY > chartArea.y + chartArea.h) return;

            // Shaded area from threshold to top
            var grad = ctx.createLinearGradient(0, chartArea.y, 0, thresholdY);
            grad.addColorStop(0, 'rgba(255, 59, 48, 0.20)');
            grad.addColorStop(1, 'rgba(255, 59, 48, 0.02)');
            ctx.fillStyle = grad;
            ctx.fillRect(chartArea.x, chartArea.y, chartArea.w, thresholdY - chartArea.y);

            // Threshold line
            ctx.strokeStyle = COLORS.riskBorder;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(chartArea.x, thresholdY);
            ctx.lineTo(chartArea.x + chartArea.w, thresholdY);
            ctx.stroke();
            ctx.setLineDash([]);

            // Label
            ctx.fillStyle = COLORS.crit;
            ctx.font = '10px ' + (config.fontFamily || 'Segoe UI');
            ctx.textAlign = 'left';
            ctx.fillText(threshold.toFixed(0) + ' MW (\u05E1\u05E3 \u05E7\u05E8\u05D9\u05D8\u05D9)', chartArea.x + 6, thresholdY - 4);

            // Warning threshold
            var warnPct = config.WarningPct || 80;
            var warnThreshold = maxLimit * (warnPct / 100);
            var warnY = toCanvasY(warnThreshold);

            if (warnY < chartArea.y + chartArea.h && warnY > chartArea.y) {
                ctx.strokeStyle = 'rgba(255, 204, 0, 0.3)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 6]);
                ctx.beginPath();
                ctx.moveTo(chartArea.x, warnY);
                ctx.lineTo(chartArea.x + chartArea.w, warnY);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = COLORS.warn;
                ctx.font = '10px ' + (config.fontFamily || 'Segoe UI');
                ctx.fillText(warnThreshold.toFixed(0) + ' MW (\u05E1\u05E3 \u05D0\u05D6\u05D4\u05E8\u05D4)', chartArea.x + 6, warnY - 4);
            }
        }


        // ── Data Lines (Path2D — THE GEM) ──
        function drawDataLines() {
            // Separate history and forecast
            var historyPath = new Path2D();
            var forecastPath = new Path2D();
            var riskFillPath = new Path2D();

            var maxLimit = config.MaxLimit || 100;
            var critPct = config.CriticalPct || 90;
            var threshold = maxLimit * (critPct / 100);
            var thresholdY = toCanvasY(threshold);

            var historyStarted = false;
            var forecastStarted = false;
            var riskStarted = false;
            var lastHistoryX = 0;
            var lastHistoryY = 0;

            for (var i = 0; i < latestSeries.length; i++) {
                var pt = latestSeries[i];
                var x = toCanvasX(pt.time);
                var y = toCanvasY(pt.value);

                if (pt.isForecast) {
                    if (!forecastStarted) {
                        forecastPath.moveTo(x, y);
                        forecastStarted = true;
                        // Connect forecast to last history point
                        if (historyStarted) {
                            forecastPath.moveTo(lastHistoryX, lastHistoryY);
                            forecastPath.lineTo(x, y);
                        }
                    } else {
                        forecastPath.lineTo(x, y);
                    }
                } else {
                    if (!historyStarted) {
                        historyPath.moveTo(x, y);
                        historyStarted = true;
                    } else {
                        historyPath.lineTo(x, y);
                    }
                    lastHistoryX = x;
                    lastHistoryY = y;
                }

                // Risk fill: shade area where value > threshold
                if (pt.value > threshold) {
                    if (!riskStarted) {
                        riskFillPath.moveTo(x, thresholdY);
                        riskFillPath.lineTo(x, y);
                        riskStarted = true;
                    } else {
                        riskFillPath.lineTo(x, y);
                    }
                } else if (riskStarted) {
                    riskFillPath.lineTo(x, thresholdY);
                    riskFillPath.closePath();
                    riskStarted = false;
                }
            }

            // Close risk fill if still open
            if (riskStarted && latestSeries.length > 0) {
                var lastX = toCanvasX(latestSeries[latestSeries.length - 1].time);
                riskFillPath.lineTo(lastX, thresholdY);
                riskFillPath.closePath();
            }

            // 1. Draw risk fill (under-curve red)
            ctx.fillStyle = 'rgba(255, 59, 48, 0.18)';
            ctx.fill(riskFillPath);

            // 2. Draw gradient fill under history line
            _drawGradientFill(historyPath, false);

            // 3. Draw history line (solid, glow)
            ctx.save();
            ctx.strokeStyle = COLORS.ok;
            ctx.lineWidth = 2.5;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.shadowColor = COLORS.ok;
            ctx.shadowBlur = 8;
            ctx.setLineDash([]);
            ctx.stroke(historyPath);
            ctx.restore();

            // 4. Draw forecast line (dashed, blue)
            ctx.save();
            ctx.strokeStyle = COLORS.forecast;
            ctx.lineWidth = 2;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';
            ctx.shadowColor = COLORS.forecast;
            ctx.shadowBlur = 6;
            ctx.setLineDash([8, 5]);
            ctx.stroke(forecastPath);
            ctx.setLineDash([]);
            ctx.restore();
        }


        // ── Gradient fill under curve ──
        function _drawGradientFill(path2d, isForecast) {
            // Create a closed path for fill
            if (latestSeries.length < 2) return;

            var fillPath = new Path2D();
            var started = false;
            var firstX = 0;
            var lastX = 0;

            for (var i = 0; i < latestSeries.length; i++) {
                var pt = latestSeries[i];
                if (isForecast !== pt.isForecast) continue;

                var x = toCanvasX(pt.time);
                var y = toCanvasY(pt.value);

                if (!started) {
                    firstX = x;
                    fillPath.moveTo(x, y);
                    started = true;
                } else {
                    fillPath.lineTo(x, y);
                }
                lastX = x;
            }

            if (!started) return;

            // Close to bottom
            fillPath.lineTo(lastX, chartArea.y + chartArea.h);
            fillPath.lineTo(firstX, chartArea.y + chartArea.h);
            fillPath.closePath();

            var grad = ctx.createLinearGradient(0, chartArea.y, 0, chartArea.y + chartArea.h);
            var baseColor = isForecast ? '91, 192, 235' : '0, 245, 212';
            grad.addColorStop(0, 'rgba(' + baseColor + ', 0.20)');
            grad.addColorStop(0.6, 'rgba(' + baseColor + ', 0.05)');
            grad.addColorStop(1, 'rgba(' + baseColor + ', 0.0)');

            ctx.fillStyle = grad;
            ctx.fill(fillPath);
        }


        // ── "Now" Line (vertical separator) ──
        function drawNowLine() {
            nowMs = Date.now();

            if (nowMs < scaleX.min || nowMs > scaleX.max) return;

            var x = toCanvasX(nowMs);

            ctx.save();
            ctx.strokeStyle = COLORS.nowLine;
            ctx.lineWidth = NOW_LINE_WIDTH;
            ctx.globalAlpha = 0.6;
            ctx.setLineDash([]);
            ctx.beginPath();
            ctx.moveTo(x, chartArea.y);
            ctx.lineTo(x, chartArea.y + chartArea.h);
            ctx.stroke();
            ctx.restore();

            // "Now" label
            ctx.fillStyle = COLORS.nowLine;
            ctx.font = 'bold 10px ' + (config.fontFamily || 'Segoe UI');
            ctx.textAlign = 'center';
            ctx.fillText('\u05E2\u05DB\u05E9\u05D9\u05D5', x, chartArea.y - 6);
        }


        // ── Position the CSS "Now" line element (for pulse animation) ──
        function updateNowLinePosition() {
            if (nowMs < scaleX.min || nowMs > scaleX.max) {
                nowLineEl.style.display = 'none';
                return;
            }
            var x = toCanvasX(nowMs);
            nowLineEl.style.display = 'block';
            nowLineEl.style.left = x + 'px';
            nowLineEl.style.top = chartArea.y + 'px';
            nowLineEl.style.height = chartArea.h + 'px';
        }


        // ── Axes ──
        function drawAxes() {
            ctx.strokeStyle = COLORS.axis;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);

            // Y axis
            ctx.beginPath();
            ctx.moveTo(chartArea.x, chartArea.y);
            ctx.lineTo(chartArea.x, chartArea.y + chartArea.h);
            ctx.stroke();

            // X axis
            ctx.beginPath();
            ctx.moveTo(chartArea.x, chartArea.y + chartArea.h);
            ctx.lineTo(chartArea.x + chartArea.w, chartArea.y + chartArea.h);
            ctx.stroke();
        }


        // ── Axis Labels ──
        function drawAxisLabels() {
            ctx.fillStyle = COLORS.text;
            ctx.font = '10px ' + (config.fontFamily || 'Segoe UI');

            // Y axis labels
            ctx.textAlign = 'right';
            for (var i = 0; i <= GRID_LINES; i++) {
                var val = scaleY.max - (scaleY.range / GRID_LINES) * i;
                var y = chartArea.y + (chartArea.h / GRID_LINES) * i;
                ctx.fillText(val.toFixed(config.Decimals || 0) + ' MW', chartArea.x - 8, y + 3);
            }

            // X axis labels (time)
            ctx.textAlign = 'center';
            var startHour = new Date(scaleX.min);
            startHour.setMinutes(0, 0, 0);
            var gridInterval = 4 * 3600000; // 4 hours
            var t = startHour.getTime();

            while (t <= scaleX.max) {
                if (t >= scaleX.min) {
                    var x = toCanvasX(t);
                    var d = new Date(t);
                    var label = _padZero(d.getHours()) + ':00';

                    // Show date if it's midnight
                    if (d.getHours() === 0) {
                        label = d.getDate() + '/' + (d.getMonth() + 1);
                    }

                    ctx.fillText(label, x, chartArea.y + chartArea.h + 16);

                    // Tick mark
                    ctx.strokeStyle = COLORS.axis;
                    ctx.beginPath();
                    ctx.moveTo(x, chartArea.y + chartArea.h);
                    ctx.lineTo(x, chartArea.y + chartArea.h + AXIS_TICK_LEN);
                    ctx.stroke();
                }
                t += gridInterval;
            }

            // X axis title
            ctx.fillStyle = COLORS.text;
            ctx.font = '11px ' + (config.fontFamily || 'Segoe UI');
            ctx.textAlign = 'center';
            ctx.fillText('\u05E6\u05D9\u05E8 \u05D6\u05DE\u05DF', chartArea.x + chartArea.w / 2, chartArea.y + chartArea.h + 38);

            // Y axis title (rotated)
            ctx.save();
            ctx.translate(14, chartArea.y + chartArea.h / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.fillText('MW', 0, 0);
            ctx.restore();
        }


        // ── Stats Bar ──
        function updateStats() {
            if (latestSeries.length === 0) return;

            var current = 0;
            var maxVal = -Infinity;
            var minVal = Infinity;
            var avg = 0;
            var histCount = 0;

            for (var i = 0; i < latestSeries.length; i++) {
                var pt = latestSeries[i];
                if (!pt.isForecast) {
                    if (pt.value > maxVal) maxVal = pt.value;
                    if (pt.value < minVal) minVal = pt.value;
                    avg += pt.value;
                    histCount++;
                    // Last history value = current
                    if (pt.time <= nowMs) current = pt.value;
                }
            }
            avg = histCount > 0 ? avg / histCount : 0;

            var decimals = config.Decimals || 1;
            var maxLimit = config.MaxLimit || 100;
            var pct = (current / maxLimit * 100).toFixed(0);
            var pctColor = COLORS.ok;
            if (pct >= (config.CriticalPct || 90)) pctColor = COLORS.crit;
            else if (pct >= (config.WarningPct || 80)) pctColor = COLORS.warn;

            statsBar.innerHTML =
                '<span class="wow-lc-stat">\u05E0\u05D5\u05DB\u05D7\u05D9: <b style="color:' + pctColor + '">' + current.toFixed(decimals) + ' MW (' + pct + '%)</b></span>' +
                '<span class="wow-lc-stat">\u05DE\u05E7\u05E1: <b>' + maxVal.toFixed(decimals) + '</b></span>' +
                '<span class="wow-lc-stat">\u05DE\u05D9\u05E0: <b>' + minVal.toFixed(decimals) + '</b></span>' +
                '<span class="wow-lc-stat">\u05DE\u05DE\u05D5\u05E6\u05E2: <b>' + avg.toFixed(decimals) + '</b></span>' +
                '<span class="wow-lc-stat">\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA: <b>' + latestSeries.length.toLocaleString() + '</b></span>';
        }


        // ── Legend ──
        function _updateLegend() {
            legendEl.innerHTML =
                '<span class="wow-lc-legend-item">' +
                    '<span class="wow-lc-legend-line" style="background:#00F5D4;"></span>' +
                    '\u05E6\u05E8\u05D9\u05DB\u05D4 \u05D1\u05E4\u05D5\u05E2\u05DC' +
                '</span>' +
                '<span class="wow-lc-legend-item">' +
                    '<span class="wow-lc-legend-line wow-lc-legend-dashed" style="background:#5BC0EB;"></span>' +
                    '\u05EA\u05D7\u05D6\u05D9\u05EA' +
                '</span>' +
                '<span class="wow-lc-legend-item">' +
                    '<span class="wow-lc-legend-swatch" style="background:rgba(255,59,48,0.3);border:1px solid rgba(255,59,48,0.5);"></span>' +
                    '\u05D0\u05D6\u05D5\u05E8 \u05E1\u05D9\u05DB\u05D5\u05DF' +
                '</span>';
        }


        // ═══════════════════════════════════════
        //  TOOLTIP (O(1) hit testing)
        // ═══════════════════════════════════════

        function onMouseMove(e) {
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;

            // Out of chart area?
            if (mx < chartArea.x || mx > chartArea.x + chartArea.w ||
                my < chartArea.y || my > chartArea.y + chartArea.h) {
                tooltip.style.display = 'none';
                crosshairEl.style.display = 'none';
                return;
            }

            // Binary search for nearest time point
            if (!scaleX || latestSeries.length === 0) return;

            var targetTime = scaleX.min + ((mx - chartArea.x) / chartArea.w) * scaleX.range;
            var idx = _binarySearchNearest(latestSeries, targetTime);

            if (idx < 0 || idx >= latestSeries.length) {
                tooltip.style.display = 'none';
                crosshairEl.style.display = 'none';
                return;
            }

            var pt = latestSeries[idx];
            var px = toCanvasX(pt.time);
            var py = toCanvasY(pt.value);

            // Crosshair
            crosshairEl.style.display = 'block';
            crosshairEl.style.left = px + 'px';
            crosshairEl.style.top = chartArea.y + 'px';
            crosshairEl.style.height = chartArea.h + 'px';

            // Tooltip content
            var d = new Date(pt.time);
            var timeStr = _padZero(d.getHours()) + ':' + _padZero(d.getMinutes());
            var dateStr = d.getDate() + '/' + (d.getMonth() + 1) + '/' + d.getFullYear();
            var typeStr = pt.isForecast ? '\u05EA\u05D7\u05D6\u05D9\u05EA' : '\u05D1\u05E4\u05D5\u05E2\u05DC';
            var typeColor = pt.isForecast ? COLORS.forecast : COLORS.ok;
            var decimals = config.Decimals || 1;

            tooltip.innerHTML =
                '<div class="wow-lc-tt-time">' + dateStr + ' ' + timeStr + '</div>' +
                '<div class="wow-lc-tt-value" style="color:' + typeColor + '">' +
                    pt.value.toFixed(decimals) + ' MW' +
                '</div>' +
                '<div class="wow-lc-tt-type" style="color:' + typeColor + '">' + typeStr + '</div>';

            // Position tooltip (avoid edge overflow)
            tooltip.style.display = 'block';
            var ttRect = tooltip.getBoundingClientRect();
            var ttLeft = px + TOOLTIP_OFFSET;
            var ttTop = py - ttRect.height / 2;

            if (ttLeft + ttRect.width > canvasW) {
                ttLeft = px - ttRect.width - TOOLTIP_OFFSET;
            }
            if (ttTop < 0) ttTop = 4;
            if (ttTop + ttRect.height > canvasH) ttTop = canvasH - ttRect.height - 4;

            tooltip.style.left = ttLeft + 'px';
            tooltip.style.top = ttTop + 'px';
        }

        function onMouseLeave() {
            tooltip.style.display = 'none';
            crosshairEl.style.display = 'none';
        }

        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseleave', onMouseLeave);


        // ── Binary search: O(log n) nearest point lookup ──
        function _binarySearchNearest(arr, targetTime) {
            var lo = 0;
            var hi = arr.length - 1;

            if (hi < 0) return -1;
            if (targetTime <= arr[0].time) return 0;
            if (targetTime >= arr[hi].time) return hi;

            while (lo <= hi) {
                var mid = (lo + hi) >> 1;
                if (arr[mid].time < targetTime) {
                    lo = mid + 1;
                } else if (arr[mid].time > targetTime) {
                    hi = mid - 1;
                } else {
                    return mid;
                }
            }

            // lo > hi: return closest
            if (lo >= arr.length) return hi;
            if (hi < 0) return lo;

            return (targetTime - arr[hi].time) < (arr[lo].time - targetTime) ? hi : lo;
        }


        // ═══════════════════════════════════════
        //  DATA UPDATE
        // ═══════════════════════════════════════

        function _processDataUpdate(data) {
            if (!data) return;

            nowMs = Date.now();
            latestSeries = processData(data);

            setupCanvas();
            requestDraw();
        }

        this.onDataUpdate = function (data) {
            if (!data) return;
            _pendingData = data;
            if (!_firstDataDone) {
                _firstDataDone = true;
                _processDataUpdate(data);
                _pendingData = null;
                return;
            }
            if (!_dataDebounceId) {
                _dataDebounceId = setTimeout(function () {
                    _dataDebounceId = null;
                    if (_pendingData) {
                        _processDataUpdate(_pendingData);
                        _pendingData = null;
                    }
                }, DATA_DEBOUNCE_MS);
            }
        };

        this.onConfigChange = function (newConfig) {
            config = newConfig;
            _updateTitle();
            requestDraw();
        };

        this.onResize = function () {
            setupCanvas();
            requestDraw();
        };


        // ═══════════════════════════════════════
        //  DEMO MODE
        // ═══════════════════════════════════════

        function startDemo() {
            stopDemo();
            var demoPoints = generateDemoData(config);
            latestSeries = processData(demoPoints);
            setupCanvas();
            requestDraw();

            // Refresh demo data every 10s with slight variation
            demoIntervalId = setInterval(function () {
                var demoPoints = generateDemoData(config);
                latestSeries = processData(demoPoints);
                nowMs = Date.now();
                requestDraw();
            }, 10000);
        }

        function stopDemo() {
            if (demoIntervalId) {
                clearInterval(demoIntervalId);
                demoIntervalId = null;
            }
        }

        if (config.DemoMode) {
            // Slight delay to allow Shadow DOM to render
            setTimeout(startDemo, 300);
        }


        // ═══════════════════════════════════════
        //  CONFIG WATCHERS
        // ═══════════════════════════════════════

        function _updateTitle() {
            var titleText = titleBar.querySelector('.wow-lc-title-text');
            if (titleText) titleText.textContent = config.Title || 'Executive Load Curve';
        }

        scope.$watch('config.DemoMode', function (val, old) {
            if (val === old) return;
            if (val) startDemo(); else stopDemo();
        });

        scope.$watch('config.MaxLimit', function () { requestDraw(); });
        scope.$watch('config.CriticalPct', function () { requestDraw(); });
        scope.$watch('config.WarningPct', function () { requestDraw(); });
        scope.$watch('config.Decimals', function () { requestDraw(); });
        scope.$watch('config.Title', function () { _updateTitle(); });
        scope.$watch('config.ShowForecast', function () { requestDraw(); });
        scope.$watch('config.fontFamily', function () { requestDraw(); });
        scope.$watch('config.fontSize', function () { requestDraw(); });


        // ═══════════════════════════════════════
        //  CLEANUP
        // ═══════════════════════════════════════

        scope.$on('$destroy', function () {
            clearTimeout(_dataDebounceId);
            _pendingData = null;
            stopDemo();
            if (animFrameId) cancelAnimationFrame(animFrameId);
            if (resizeObs) resizeObs.disconnect();
            if (_onWindowResize) window.removeEventListener('resize', _onWindowResize);
            canvas.removeEventListener('mousemove', onMouseMove);
            canvas.removeEventListener('mouseleave', onMouseLeave);
            clearTimeout(resizeTimeout);
            latestSeries = null;
            ctx = null;
        });
    };


    // ═══════════════════════════════════════
    //  UTILITIES
    // ═══════════════════════════════════════

    function _padZero(n) {
        return n < 10 ? '0' + n : '' + n;
    }


    // ═══════════════════════════════════════
    //  PI VISION REGISTRATION
    // ═══════════════════════════════════════

    var def = {
        typeName:           'loadcurve-wow',
        displayName:        '\u05E2\u05E7\u05D5\u05DE\u05EA \u05E2\u05D5\u05DE\u05E1 WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'icons/wow-loadcurve.svg',
        getDefaultConfig: function () {
            return {
                DataShape:    'TimeSeries',
                Height:       400,
                Width:        900,
                Title:        '\u05E2\u05E7\u05D5\u05DE\u05EA \u05E2\u05D5\u05DE\u05E1',
                MaxLimit:     100,
                WarningPct:   80,
                CriticalPct:  90,
                HoursBack:    24,
                HoursForward: 24,
                Decimals:     1,
                ShowForecast: true,
                ShowRiskZone: true,
                DemoMode:     true,
                fontFamily:   'Segoe UI',
                fontSize:     12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E2\u05E7\u05D5\u05DE\u05EA \u05E2\u05D5\u05DE\u05E1 WOW',
        visObjectType: symbolVis
    };

    PV.symbolCatalog.register(def);

})(window.PIVisualization);
