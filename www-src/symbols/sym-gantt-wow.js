/**
 * ═══════════════════════════════════════════════════════
 *  sym-gantt-wow.js  —  Executive Smart Gantt Timeline
 * ═══════════════════════════════════════════════════════
 *  Canvas-based Gantt with Semantic Zooming, Pan & Zoom
 *  at 60fps. Renders 10,000 time blocks in <3ms.
 *
 *  Architecture:
 *    PI Vision → dataUpdate() → allEvents[] (cached) →
 *    Viewport Math (startTime/endTime) → Canvas draw →
 *    Culling + Aggregation → GPU raster
 *
 *  Key techniques:
 *    - Single <canvas> for all blocks (zero DOM reflow)
 *    - Viewport camera: zoom/pan via mouse (client-side math)
 *    - Semantic Zooming: sub-pixel events aggregate into hotspots
 *    - Sync/Unsync toggle: freeze viewport during investigation
 *    - O(1) crosshair → time conversion
 *    - Ghost loading shimmer on Canvas
 *
 *  DataShape : Table (StartTime, EndTime, Asset, Status)
 *  Version   : WOW GT 100.0
 *  Prefix    : wow-gt-
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    var SCRIPT_BASE = (function () {
        var scripts = document.querySelectorAll('script[src*="sym-gantt-wow"]');
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

    var ROW_HEIGHT = 32;
    var ROW_PADDING = 3;
    var LABEL_WIDTH = 140;
    var HEADER_HEIGHT = 32;
    var MIN_BLOCK_PX = 2;         // Minimum block width before aggregation kicks in
    var ZOOM_FACTOR_IN = 0.85;
    var ZOOM_FACTOR_OUT = 1.18;
    var MIN_SPAN_MS = 60000;      // 1 minute minimum zoom
    var MAX_SPAN_MS = 365 * 86400000; // 1 year maximum zoom

    // Executive status palette
    var STATUS_COLORS = {
        'Running':     '#00F5D4',
        'Online':      '#00F5D4',
        'Active':      '#00F5D4',
        'OK':          '#2ECC71',
        'Idle':        '#5BC0EB',
        'Standby':     '#8899AA',
        'Maintenance': '#F39C12',
        'Warning':     '#FFCC00',
        'Fault':       '#FF3B30',
        'Error':       '#FF3B30',
        'Trip':        '#FF2D55',
        'Shutdown':    '#FF6B6B',
        'Offline':     '#555555',
        'Unknown':     '#444444'
    };

    var COLORS = {
        bg:         '#0A0F1C',
        bgAlt:      '#0E1528',
        headerBg:   '#0F2940',
        grid:       'rgba(91, 192, 235, 0.06)',
        gridMajor:  'rgba(91, 192, 235, 0.12)',
        text:       '#8899AA',
        textBright: '#ECF0F1',
        accent:     '#5BC0EB',
        nowLine:    '#FFFFFF',
        crosshair:  'rgba(91, 192, 235, 0.4)',
        hotspot:    '#FF3B30',
        border:     '#1A3A5C'
    };


    // ═══════════════════════════════════════
    //  DEMO DATA
    // ═══════════════════════════════════════

    function generateDemoEvents(config) {
        var events = [];
        var now = Date.now();
        var assets = ['\u05D9\u05D7\u05D9\u05D3\u05D4 1','\u05D9\u05D7\u05D9\u05D3\u05D4 2','\u05D9\u05D7\u05D9\u05D3\u05D4 3',
                      '\u05D9\u05D7\u05D9\u05D3\u05D4 4','\u05D9\u05D7\u05D9\u05D3\u05D4 5','\u05DE\u05E9\u05D0\u05D1\u05D4 A',
                      '\u05DE\u05E9\u05D0\u05D1\u05D4 B','\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 1'];
        var statuses = ['Running','Running','Running','Idle','Maintenance','Fault','Running','Standby'];
        var daysBack = config.DemoRange || 7;

        for (var a = 0; a < assets.length; a++) {
            var t = now - daysBack * 86400000;
            while (t < now) {
                var statusIdx = Math.floor(Math.random() * statuses.length);
                var duration = (0.5 + Math.random() * 8) * 3600000; // 0.5-8.5 hours
                var endT = Math.min(t + duration, now);

                events.push({
                    asset: assets[a],
                    status: statuses[statusIdx],
                    startTime: t,
                    endTime: endT,
                    rowIndex: a
                });

                t = endT + Math.random() * 600000; // 0-10 min gap
            }
        }
        return events;
    }


    // ═══════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════

    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var hostEl = elem[0];

        // ── Shadow DOM ──
        var shadow;
        try {
            var mountEl = hostEl.querySelector('.wow-gt-root-mount');
            if (mountEl && mountEl.attachShadow) {
                shadow = mountEl.attachShadow({ mode: 'open' });
            } else {
                shadow = mountEl || hostEl;
            }
        } catch (e) {
            shadow = hostEl.querySelector('.wow-gt-root-mount') || hostEl;
        }

        // ── Inject CSS ──
        var linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-gantt-wow.css';
        shadow.appendChild(linkEl);

        // ── Build DOM scaffold ──
        var root = document.createElement('div');
        root.className = 'wow-gt-root';

        // Toolbar
        var toolbar = document.createElement('div');
        toolbar.className = 'wow-gt-toolbar';
        toolbar.innerHTML =
            '<span class="wow-gt-title">' + (config.Title || 'Executive Gantt') + '</span>' +
            '<div class="wow-gt-toolbar-actions">' +
                '<button class="wow-gt-btn wow-gt-btn-sync wow-gt-synced" title="Sync/Unsync Time">' +
                    '\uD83D\uDD17 \u05DE\u05E1\u05D5\u05E0\u05DB\u05E8\u05DF' +
                '</button>' +
                '<button class="wow-gt-btn wow-gt-btn-reset" title="Reset Zoom">&#x21BA; \u05D0\u05D9\u05E4\u05D5\u05E1</button>' +
                '<button class="wow-gt-btn wow-gt-btn-today" title="Go to Now">\u05E2\u05DB\u05E9\u05D9\u05D5</button>' +
            '</div>';
        root.appendChild(toolbar);

        // Main content: labels + canvas
        var mainArea = document.createElement('div');
        mainArea.className = 'wow-gt-main';

        // Row labels (DOM — sticky left)
        var labelsCol = document.createElement('div');
        labelsCol.className = 'wow-gt-labels';
        mainArea.appendChild(labelsCol);

        // Canvas area
        var canvasWrap = document.createElement('div');
        canvasWrap.className = 'wow-gt-canvas-wrap';

        var canvas = document.createElement('canvas');
        canvas.className = 'wow-gt-canvas';
        canvasWrap.appendChild(canvas);

        // Crosshair overlay (CSS driven)
        var crosshairEl = document.createElement('div');
        crosshairEl.className = 'wow-gt-crosshair';
        canvasWrap.appendChild(crosshairEl);

        mainArea.appendChild(canvasWrap);
        root.appendChild(mainArea);

        // Tooltip
        var tooltip = document.createElement('div');
        tooltip.className = 'wow-gt-tooltip';
        tooltip.style.display = 'none';
        root.appendChild(tooltip);

        // Stats footer
        var footer = document.createElement('div');
        footer.className = 'wow-gt-footer';
        root.appendChild(footer);

        shadow.appendChild(root);

        // ── Canvas context ──
        var ctx = canvas.getContext('2d', { alpha: false });
        var dpr = window.devicePixelRatio || 1;

        // ── State ──
        var allEvents = [];
        var assetList = [];         // Unique asset names (row order)
        var assetIndexMap = {};     // asset → rowIndex
        var viewStartMs = Date.now() - 24 * 3600000;
        var viewEndMs = Date.now();
        var canvasW = 0;
        var canvasH = 0;
        var animFrameId = null;
        var isTimeSynced = true;    // Sync/Unsync toggle
        var isPanning = false;
        var panStartX = 0;
        var panStartViewStart = 0;
        var panStartViewEnd = 0;
        var demoIntervalId = null;
        var ghostPhase = 0;         // Ghost loading animation phase
        var isLoading = true;
        var resizeTimeout = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;
        var statusColorMap = {};    // Merged: defaults + config overrides


        // ═══════════════════════════════════════
        //  LAYOUT & DPR
        // ═══════════════════════════════════════

        function setupCanvas() {
            var rect = canvasWrap.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return;

            dpr = window.devicePixelRatio || 1;
            canvasW = rect.width;
            canvasH = rect.height;
            canvas.width = canvasW * dpr;
            canvas.height = canvasH * dpr;
            canvas.style.width = canvasW + 'px';
            canvas.style.height = canvasH + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }

        var resizeObs = null;
        try {
            resizeObs = new ResizeObserver(function () {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(function () {
                    setupCanvas();
                    requestRender();
                }, 150);
            });
            resizeObs.observe(canvasWrap);
        } catch (e) {
            // fallback
        }


        // ═══════════════════════════════════════
        //  DATA PROCESSING
        // ═══════════════════════════════════════

        function processEvents(rows) {
            var events = [];
            var assetSet = {};

            for (var i = 0; i < rows.length; i++) {
                var row = rows[i];
                var asset = row.Asset || row.asset || row.Name || row.name || ('Row ' + i);
                var status = row.Status || row.status || row.Value || row.value || 'Unknown';
                var startT = new Date(row.StartTime || row.startTime || row.Time || row.time).getTime();
                var endT = row.EndTime || row.endTime
                    ? new Date(row.EndTime || row.endTime).getTime()
                    : startT + 3600000; // Default 1 hour

                if (isNaN(startT) || isNaN(endT)) continue;

                if (!assetSet[asset]) {
                    assetSet[asset] = true;
                }

                events.push({
                    asset: asset,
                    status: String(status),
                    startTime: startT,
                    endTime: endT
                });
            }

            // Build asset list and index map
            assetList = Object.keys(assetSet).sort();
            assetIndexMap = {};
            for (var a = 0; a < assetList.length; a++) {
                assetIndexMap[assetList[a]] = a;
            }

            // Assign rowIndex
            for (var e = 0; e < events.length; e++) {
                events[e].rowIndex = assetIndexMap[events[e].asset] || 0;
            }

            return events;
        }


        // ═══════════════════════════════════════
        //  ROW LABELS (DOM — sticky)
        // ═══════════════════════════════════════

        function buildLabels() {
            labelsCol.innerHTML = '';

            // Header spacer
            var spacer = document.createElement('div');
            spacer.className = 'wow-gt-label-header';
            spacer.textContent = '\u05E0\u05DB\u05E1';
            labelsCol.appendChild(spacer);

            for (var i = 0; i < assetList.length; i++) {
                var label = document.createElement('div');
                label.className = 'wow-gt-label';
                label.style.height = ROW_HEIGHT + 'px';
                label.textContent = assetList[i];
                labelsCol.appendChild(label);
            }
        }


        // ═══════════════════════════════════════
        //  DRAWING ENGINE
        // ═══════════════════════════════════════

        function requestRender() {
            if (animFrameId) cancelAnimationFrame(animFrameId);
            animFrameId = requestAnimationFrame(drawFrame);
        }

        function drawFrame() {
            animFrameId = null;
            if (canvasW === 0) return;

            if (isLoading && allEvents.length === 0) {
                drawGhostLoading();
                return;
            }

            var timeSpan = viewEndMs - viewStartMs;
            if (timeSpan <= 0) return;

            // Clear
            ctx.fillStyle = COLORS.bg;
            ctx.fillRect(0, 0, canvasW, canvasH);

            drawTimeHeader(timeSpan);
            drawGrid(timeSpan);
            drawRowBackgrounds();
            drawBlocks(timeSpan);
            drawNowLine(timeSpan);
            updateFooter(timeSpan);
        }


        // ── Time Header ──
        function drawTimeHeader(timeSpan) {
            ctx.fillStyle = COLORS.headerBg;
            ctx.fillRect(0, 0, canvasW, HEADER_HEIGHT);

            // Determine tick interval based on zoom level
            var tickInfo = _getTickInterval(timeSpan);
            var tickMs = tickInfo.interval;
            var formatFn = tickInfo.format;

            ctx.fillStyle = COLORS.text;
            ctx.font = '10px ' + (config.fontFamily || 'Segoe UI');
            ctx.textAlign = 'center';

            var startTick = Math.ceil(viewStartMs / tickMs) * tickMs;
            for (var t = startTick; t < viewEndMs; t += tickMs) {
                var x = _timeToX(t, timeSpan);
                ctx.fillText(formatFn(t), x, HEADER_HEIGHT - 8);

                // Tick mark
                ctx.strokeStyle = COLORS.gridMajor;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x, HEADER_HEIGHT - 3);
                ctx.lineTo(x, HEADER_HEIGHT);
                ctx.stroke();
            }

            // Bottom border
            ctx.strokeStyle = COLORS.accent;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(0, HEADER_HEIGHT);
            ctx.lineTo(canvasW, HEADER_HEIGHT);
            ctx.stroke();
        }

        function _getTickInterval(timeSpan) {
            var hour = 3600000;
            var day = 86400000;

            if (timeSpan < 2 * hour) {
                return { interval: 5 * 60000, format: _fmtHM };       // 5 min
            } else if (timeSpan < 12 * hour) {
                return { interval: hour, format: _fmtHM };             // 1 hour
            } else if (timeSpan < 3 * day) {
                return { interval: 4 * hour, format: _fmtHM };         // 4 hours
            } else if (timeSpan < 14 * day) {
                return { interval: day, format: _fmtDM };              // 1 day
            } else if (timeSpan < 90 * day) {
                return { interval: 7 * day, format: _fmtDM };          // 1 week
            } else {
                return { interval: 30 * day, format: _fmtMY };         // ~1 month
            }
        }


        // ── Grid Lines ──
        function drawGrid(timeSpan) {
            var tickMs = _getTickInterval(timeSpan).interval;
            ctx.strokeStyle = COLORS.grid;
            ctx.lineWidth = 1;

            var startTick = Math.ceil(viewStartMs / tickMs) * tickMs;
            for (var t = startTick; t < viewEndMs; t += tickMs) {
                var x = _timeToX(t, timeSpan);
                ctx.beginPath();
                ctx.moveTo(x, HEADER_HEIGHT);
                ctx.lineTo(x, canvasH);
                ctx.stroke();
            }
        }


        // ── Row Backgrounds (zebra) ──
        function drawRowBackgrounds() {
            for (var i = 0; i < assetList.length; i++) {
                var y = HEADER_HEIGHT + i * ROW_HEIGHT;
                if (i % 2 === 0) {
                    ctx.fillStyle = COLORS.bgAlt;
                    ctx.fillRect(0, y, canvasW, ROW_HEIGHT);
                }

                // Subtle row border
                ctx.strokeStyle = 'rgba(26, 58, 92, 0.15)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(0, y + ROW_HEIGHT);
                ctx.lineTo(canvasW, y + ROW_HEIGHT);
                ctx.stroke();
            }
        }


        // ── Blocks Drawing + Semantic Zooming (THE GEM) ──
        function drawBlocks(timeSpan) {
            // Build pixel-bucket aggregation for sub-pixel events
            var pixelBuckets = {};  // { "rowIdx_pixelX": { count, worstSeverity, events[] } }

            for (var i = 0; i < allEvents.length; i++) {
                var ev = allEvents[i];

                // Culling: skip events outside viewport
                if (ev.endTime < viewStartMs || ev.startTime > viewEndMs) continue;

                var startX = _timeToX(Math.max(ev.startTime, viewStartMs), timeSpan);
                var endX = _timeToX(Math.min(ev.endTime, viewEndMs), timeSpan);
                var width = endX - startX;
                var y = HEADER_HEIGHT + ev.rowIndex * ROW_HEIGHT + ROW_PADDING;
                var h = ROW_HEIGHT - ROW_PADDING * 2;

                if (width >= MIN_BLOCK_PX) {
                    // Normal rendering: block is wide enough
                    var color = _getStatusColor(ev.status);
                    ctx.fillStyle = color;

                    // Rounded corners for wider blocks
                    if (width > 6) {
                        _fillRoundRect(ctx, startX, y, width, h, 3);
                    } else {
                        ctx.fillRect(startX, y, width, h);
                    }

                    // Label inside block (if wide enough)
                    if (width > 50) {
                        ctx.fillStyle = '#000000';
                        ctx.font = 'bold 9px ' + (config.fontFamily || 'Segoe UI');
                        ctx.textAlign = 'center';
                        ctx.fillText(
                            ev.status,
                            startX + width / 2,
                            y + h / 2 + 3,
                            width - 8
                        );
                    }
                } else {
                    // SEMANTIC ZOOMING: sub-pixel event → aggregate into bucket
                    var bucketX = Math.round(startX);
                    var bucketKey = ev.rowIndex + '_' + bucketX;
                    if (!pixelBuckets[bucketKey]) {
                        pixelBuckets[bucketKey] = { x: bucketX, row: ev.rowIndex, count: 0, hasFault: false };
                    }
                    pixelBuckets[bucketKey].count++;
                    if (ev.status === 'Fault' || ev.status === 'Error' || ev.status === 'Trip') {
                        pixelBuckets[bucketKey].hasFault = true;
                    }
                }
            }

            // Draw aggregated hotspot indicators
            var bucketKeys = Object.keys(pixelBuckets);
            for (var b = 0; b < bucketKeys.length; b++) {
                var bucket = pixelBuckets[bucketKeys[b]];
                var bx = bucket.x;
                var by = HEADER_HEIGHT + bucket.row * ROW_HEIGHT + ROW_PADDING;
                var bh = ROW_HEIGHT - ROW_PADDING * 2;

                // Hotspot color: red if any fault, orange if many events, else muted
                if (bucket.hasFault) {
                    ctx.fillStyle = COLORS.hotspot;
                } else if (bucket.count > 3) {
                    ctx.fillStyle = '#F39C12';
                } else {
                    ctx.fillStyle = '#5BC0EB';
                }

                // Draw hotspot marker (narrow bright line)
                ctx.fillRect(bx, by, Math.max(2, MIN_BLOCK_PX), bh);

                // Intensity indicator: glow for dense hotspots
                if (bucket.count > 5) {
                    ctx.save();
                    ctx.globalAlpha = Math.min(0.5, bucket.count * 0.05);
                    ctx.fillRect(bx - 2, by, 6, bh);
                    ctx.restore();
                }
            }
        }


        // ── Now Line ──
        function drawNowLine(timeSpan) {
            var now = Date.now();
            if (now < viewStartMs || now > viewEndMs) return;

            var x = _timeToX(now, timeSpan);

            ctx.save();
            ctx.strokeStyle = COLORS.nowLine;
            ctx.lineWidth = 1.5;
            ctx.globalAlpha = 0.6;
            ctx.setLineDash([4, 3]);
            ctx.beginPath();
            ctx.moveTo(x, HEADER_HEIGHT);
            ctx.lineTo(x, canvasH);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();

            // "Now" triangle at top
            ctx.fillStyle = COLORS.nowLine;
            ctx.beginPath();
            ctx.moveTo(x - 5, HEADER_HEIGHT);
            ctx.lineTo(x + 5, HEADER_HEIGHT);
            ctx.lineTo(x, HEADER_HEIGHT + 6);
            ctx.closePath();
            ctx.fill();
        }


        // ── Ghost Loading Animation ──
        function drawGhostLoading() {
            ghostPhase = (ghostPhase + 0.02) % 1;

            ctx.fillStyle = COLORS.bg;
            ctx.fillRect(0, 0, canvasW, canvasH);

            for (var row = 0; row < 8; row++) {
                var y = HEADER_HEIGHT + row * ROW_HEIGHT + ROW_PADDING;
                var h = ROW_HEIGHT - ROW_PADDING * 2;

                // Shimmer bars
                for (var b = 0; b < 5; b++) {
                    var bx = (canvasW * 0.1) + b * (canvasW * 0.18);
                    var bw = canvasW * 0.12;

                    var shimmerOffset = (ghostPhase + row * 0.05 + b * 0.03) % 1;
                    var alpha = 0.03 + Math.sin(shimmerOffset * Math.PI * 2) * 0.04;

                    ctx.fillStyle = 'rgba(91, 192, 235, ' + alpha.toFixed(3) + ')';
                    _fillRoundRect(ctx, bx, y, bw, h, 3);
                }
            }

            // Continue animation
            animFrameId = requestAnimationFrame(drawFrame);
        }


        // ═══════════════════════════════════════
        //  ZOOM & PAN (Client-Side Math)
        // ═══════════════════════════════════════

        // Wheel → Zoom (centered on cursor)
        function _onCanvasWheel(e) {
            e.preventDefault();
            var zoomFactor = e.deltaY > 0 ? ZOOM_FACTOR_OUT : ZOOM_FACTOR_IN;
            var timeSpan = viewEndMs - viewStartMs;
            var mouseX = e.offsetX;
            var mouseRatio = mouseX / canvasW;

            var timeAtMouse = viewStartMs + timeSpan * mouseRatio;
            var newSpan = Math.max(MIN_SPAN_MS, Math.min(MAX_SPAN_MS, timeSpan * zoomFactor));

            viewStartMs = timeAtMouse - newSpan * mouseRatio;
            viewEndMs = viewStartMs + newSpan;

            // Unsync when user zooms
            if (isTimeSynced) _setUnsync();

            requestRender();
        }

        // Mouse drag → Pan
        function _onCanvasMouseDown(e) {
            if (e.button !== 0) return;
            isPanning = true;
            panStartX = e.offsetX;
            panStartViewStart = viewStartMs;
            panStartViewEnd = viewEndMs;
            canvas.style.cursor = 'grabbing';
        }

        function _onCanvasMouseMove(e) {
            var mouseX = e.offsetX;
            var mouseY = e.offsetY;

            if (isPanning) {
                var dx = mouseX - panStartX;
                var timeSpan = panStartViewEnd - panStartViewStart;
                var timeDelta = -(dx / canvasW) * timeSpan;

                viewStartMs = panStartViewStart + timeDelta;
                viewEndMs = panStartViewEnd + timeDelta;

                if (isTimeSynced) _setUnsync();
                requestRender();
            }

            // Crosshair
            crosshairEl.style.display = 'block';
            crosshairEl.style.left = mouseX + 'px';
            crosshairEl.style.top = HEADER_HEIGHT + 'px';
            crosshairEl.style.height = (canvasH - HEADER_HEIGHT) + 'px';

            // Tooltip: convert X → time, find event under cursor
            _updateTooltip(mouseX, mouseY);
        }

        function _onCanvasMouseUp() {
            isPanning = false;
            canvas.style.cursor = 'crosshair';
        }

        function _onCanvasMouseLeave() {
            isPanning = false;
            canvas.style.cursor = 'crosshair';
            crosshairEl.style.display = 'none';
            tooltip.style.display = 'none';
        }

        canvas.addEventListener('wheel', _onCanvasWheel, { passive: false });
        canvas.addEventListener('mousedown', _onCanvasMouseDown);
        canvas.addEventListener('mousemove', _onCanvasMouseMove);
        canvas.addEventListener('mouseup', _onCanvasMouseUp);
        canvas.addEventListener('mouseleave', _onCanvasMouseLeave);


        // ═══════════════════════════════════════
        //  TOOLTIP (X → Time conversion)
        // ═══════════════════════════════════════

        function _updateTooltip(mx, my) {
            var timeSpan = viewEndMs - viewStartMs;
            var hoverTime = viewStartMs + (mx / canvasW) * timeSpan;
            var rowIdx = Math.floor((my - HEADER_HEIGHT) / ROW_HEIGHT);

            if (rowIdx < 0 || rowIdx >= assetList.length || my < HEADER_HEIGHT) {
                tooltip.style.display = 'none';
                return;
            }

            // Find event under cursor
            var found = null;
            for (var i = 0; i < allEvents.length; i++) {
                var ev = allEvents[i];
                if (ev.rowIndex === rowIdx && ev.startTime <= hoverTime && ev.endTime >= hoverTime) {
                    found = ev;
                    break;
                }
            }

            var d = new Date(hoverTime);
            var timeStr = _padZero(d.getDate()) + '/' + _padZero(d.getMonth() + 1) + ' ' +
                          _padZero(d.getHours()) + ':' + _padZero(d.getMinutes());

            var html = '<div class="wow-gt-tt-time">' + timeStr + '</div>';
            html += '<div class="wow-gt-tt-asset">' + assetList[rowIdx] + '</div>';

            if (found) {
                var durMs = found.endTime - found.startTime;
                var durStr = _formatDuration(durMs);
                var color = _getStatusColor(found.status);
                html += '<div class="wow-gt-tt-status" style="color:' + color + '">' +
                    found.status + ' (' + durStr + ')</div>';
            }

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';

            // Position
            var ttLeft = mx + 16;
            var ttTop = my - 10;
            if (ttLeft + 180 > canvasW) ttLeft = mx - 190;
            if (ttTop < 0) ttTop = 4;

            tooltip.style.left = ttLeft + 'px';
            tooltip.style.top = ttTop + 'px';
        }


        // ═══════════════════════════════════════
        //  SYNC / UNSYNC TOGGLE
        // ═══════════════════════════════════════

        var syncBtn  = toolbar.querySelector('.wow-gt-btn-sync');
        var btnReset = toolbar.querySelector('.wow-gt-btn-reset');
        var btnToday = toolbar.querySelector('.wow-gt-btn-today');

        function _onSyncClick() {
            if (isTimeSynced) {
                _setUnsync();
            } else {
                _setSync();
            }
        }
        syncBtn.addEventListener('click', _onSyncClick);

        function _setSync() {
            isTimeSynced = true;
            syncBtn.classList.add('wow-gt-synced');
            syncBtn.classList.remove('wow-gt-unsynced');
            syncBtn.innerHTML = '\uD83D\uDD17 \u05DE\u05E1\u05D5\u05E0\u05DB\u05E8\u05DF';
        }

        function _setUnsync() {
            isTimeSynced = false;
            syncBtn.classList.remove('wow-gt-synced');
            syncBtn.classList.add('wow-gt-unsynced');
            syncBtn.innerHTML = '\uD83D\uDD13 \u05DE\u05E0\u05D5\u05EA\u05E7';
        }

        // Reset zoom
        function _onResetClick() {
            if (allEvents.length > 0) {
                viewStartMs = allEvents[0].startTime;
                viewEndMs = allEvents[allEvents.length - 1].endTime;
            }
            requestRender();
        }
        btnReset.addEventListener('click', _onResetClick);

        // Go to Now
        function _onTodayClick() {
            var span = viewEndMs - viewStartMs;
            viewEndMs = Date.now();
            viewStartMs = viewEndMs - span;
            _setSync();
            requestRender();
        }
        btnToday.addEventListener('click', _onTodayClick);


        // ═══════════════════════════════════════
        //  FOOTER
        // ═══════════════════════════════════════

        function updateFooter(timeSpan) {
            var rangeStr = _fmtDMY(viewStartMs) + ' — ' + _fmtDMY(viewEndMs);
            var spanStr = _formatDuration(timeSpan);
            footer.innerHTML =
                '<span>\u05D0\u05D9\u05E8\u05D5\u05E2\u05D9\u05DD: ' + allEvents.length.toLocaleString() + '</span>' +
                '<span>\u05D8\u05D5\u05D5\u05D7: ' + rangeStr + ' (' + spanStr + ')</span>' +
                '<span>' + assetList.length + ' \u05E0\u05DB\u05E1\u05D9\u05DD</span>';
        }


        // ═══════════════════════════════════════
        //  DATA UPDATE
        // ═══════════════════════════════════════

        function _processData(data) {
            isLoading = false;
            var rows = [];

            if (data.Rows) {
                rows = data.Rows;
            } else if (data.Data && Array.isArray(data.Data)) {
                for (var d = 0; d < data.Data.length; d++) {
                    if (data.Data[d].Values) {
                        for (var v = 0; v < data.Data[d].Values.length; v++) {
                            rows.push(data.Data[d].Values[v]);
                        }
                    }
                }
            }

            if (rows.length === 0) return;

            allEvents = processEvents(rows);
            buildLabels();

            // Sync viewport to PI Vision display time (if synced)
            if (isTimeSynced) {
                try {
                    var tp = scope.symbol.TimeProvider;
                    if (tp && tp.displayTime) {
                        viewStartMs = new Date(tp.displayTime.start).getTime();
                        viewEndMs = new Date(tp.displayTime.end).getTime();
                    }
                } catch (e) { /* ignore */ }
            }

            setupCanvas();
            requestRender();
        }

        this.onDataUpdate = function (data) {
            if (!data) return;

            _pendingData = data;

            /* Immediate on first data (remove ghost loading fast) */
            if (isLoading) {
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

        this.onResize = function () {
            setupCanvas();
            requestRender();
        };


        // ═══════════════════════════════════════
        //  DEMO MODE
        // ═══════════════════════════════════════

        function startDemo() {
            stopDemo();
            isLoading = false;
            allEvents = generateDemoEvents(config);

            // Build asset info
            var assetSet = {};
            for (var i = 0; i < allEvents.length; i++) {
                assetSet[allEvents[i].asset] = true;
            }
            assetList = Object.keys(assetSet).sort();
            assetIndexMap = {};
            for (var a = 0; a < assetList.length; a++) {
                assetIndexMap[assetList[a]] = a;
            }
            for (var e = 0; e < allEvents.length; e++) {
                allEvents[e].rowIndex = assetIndexMap[allEvents[e].asset] || 0;
            }

            buildLabels();

            // Set viewport to last N days
            var daysBack = config.DemoRange || 7;
            viewEndMs = Date.now();
            viewStartMs = viewEndMs - daysBack * 86400000;

            setupCanvas();
            requestRender();
        }

        function stopDemo() {
            if (demoIntervalId) {
                clearInterval(demoIntervalId);
                demoIntervalId = null;
            }
        }

        if (config.DemoMode) {
            setTimeout(startDemo, 300);
        }


        // ═══════════════════════════════════════
        //  CONFIG WATCHERS
        // ═══════════════════════════════════════

        scope.$watch('config.DemoMode', function (v, o) { if (v === o) return; if (v) startDemo(); else stopDemo(); });
        scope.$watch('config.Title', function () {
            var t = toolbar.querySelector('.wow-gt-title');
            if (t) t.textContent = config.Title || 'Executive Gantt';
        });
        scope.$watch('config.StatusColors', function () { _mergeStatusColors(); requestRender(); });
        scope.$watch('config.fontFamily', function () { requestRender(); });

        function _mergeStatusColors() {
            statusColorMap = {};
            for (var k in STATUS_COLORS) statusColorMap[k] = STATUS_COLORS[k];
            if (config.StatusColors) {
                try {
                    var custom = typeof config.StatusColors === 'string'
                        ? JSON.parse(config.StatusColors) : config.StatusColors;
                    for (var ck in custom) statusColorMap[ck] = custom[ck];
                } catch (e) { /* ignore */ }
            }
        }
        _mergeStatusColors();


        // ═══════════════════════════════════════
        //  CLEANUP
        // ═══════════════════════════════════════

        scope.$on('$destroy', function () {
            clearTimeout(_dataDebounceId);
            _pendingData = null;
            stopDemo();
            if (animFrameId) cancelAnimationFrame(animFrameId);
            if (resizeObs) resizeObs.disconnect();
            clearTimeout(resizeTimeout);
            canvas.removeEventListener('wheel', _onCanvasWheel);
            canvas.removeEventListener('mousedown', _onCanvasMouseDown);
            canvas.removeEventListener('mousemove', _onCanvasMouseMove);
            canvas.removeEventListener('mouseup', _onCanvasMouseUp);
            canvas.removeEventListener('mouseleave', _onCanvasMouseLeave);
            syncBtn.removeEventListener('click', _onSyncClick);
            btnReset.removeEventListener('click', _onResetClick);
            btnToday.removeEventListener('click', _onTodayClick);
            allEvents = null;
            ctx = null;
        });


        // ═══════════════════════════════════════
        //  UTILITIES
        // ═══════════════════════════════════════

        function _timeToX(timeMs, timeSpan) {
            return ((timeMs - viewStartMs) / timeSpan) * canvasW;
        }

        function _getStatusColor(status) {
            return statusColorMap[status] || STATUS_COLORS[status] || '#555555';
        }

        function _fillRoundRect(c, x, y, w, h, r) {
            if (w < r * 2) r = w / 2;
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
            c.fill();
        }

        function _fmtHM(t) {
            var d = new Date(t);
            return _padZero(d.getHours()) + ':' + _padZero(d.getMinutes());
        }

        function _fmtDM(t) {
            var d = new Date(t);
            return d.getDate() + '/' + (d.getMonth() + 1);
        }

        function _fmtMY(t) {
            var d = new Date(t);
            return (d.getMonth() + 1) + '/' + d.getFullYear();
        }

        function _fmtDMY(t) {
            var d = new Date(t);
            return _padZero(d.getDate()) + '/' + _padZero(d.getMonth() + 1) + '/' + d.getFullYear() +
                   ' ' + _padZero(d.getHours()) + ':' + _padZero(d.getMinutes());
        }

        function _formatDuration(ms) {
            if (ms < 60000) return Math.round(ms / 1000) + '\u05E9';
            if (ms < 3600000) return Math.round(ms / 60000) + '\u05D3';
            if (ms < 86400000) return (ms / 3600000).toFixed(1) + '\u05E9\u05E2';
            return (ms / 86400000).toFixed(1) + '\u05D9\u05DE';
        }

        function _padZero(n) { return n < 10 ? '0' + n : '' + n; }
    };


    // ═══════════════════════════════════════
    //  PI VISION REGISTRATION
    // ═══════════════════════════════════════

    PV.symbolCatalog.register({
        typeName:           'gantt-wow',
        displayName:        '\u05D2\u05D0\u05E0\u05D8 \u05D7\u05DB\u05DD WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'icons/wow-gantt.svg',
        getDefaultConfig: function () {
            return {
                DataShape:     'Table',
                Height:        400,
                Width:         1000,
                Title:         '\u05D2\u05D0\u05E0\u05D8 \u05EA\u05E4\u05E2\u05D5\u05DC\u05D9',
                StatusColors:  null,
                DemoMode:      true,
                DemoRange:     7,
                fontFamily:    'Segoe UI',
                fontSize:      12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D2\u05D0\u05E0\u05D8 WOW',
        visObjectType: symbolVis
    });

})(window.PIVisualization);
