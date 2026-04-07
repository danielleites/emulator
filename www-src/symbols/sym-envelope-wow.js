(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Dynamic Envelope — WOW v100
     * ═══════════════════════════════════════════════════════
     *  Canvas-based Operating Envelope with Comet Tail History.
     *  Replaces static PNG backgrounds with a mathematically-
     *  computed dynamic polygon.  The operator sees the current
     *  operating point plus a fading trail of the last N
     *  positions — showing trajectory and momentum at a glance.
     *
     *  THE GEM: Ray-Casting Point-in-Polygon O(N) detects
     *  if the operating point is inside the safe zone.
     *  Proximity Pulse: glow frequency on the current point
     *  increases as it drifts toward the boundary — a sine
     *  wave modulated by distance-to-edge.
     *
     *  DataShape : Value (Multiple — first=X, second=Y)
     *  Shadow DOM · DPR scaling · Hebrew RTL · wc20 config
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }


    /* ── Executive Palette ── */
    var CLR = {
        bg:        '#0A0F1C',
        grid:      'rgba(91, 192, 235, 0.07)',
        axis:      '#8899AA',
        axisTitle: '#AAB8C8',
        text:      '#ECF0F1',
        muted:     '#8899AA',
        border:    '#1A3A5C',
        envFill:   'rgba(46, 204, 113, 0.10)',
        envStroke: 'rgba(46, 204, 113, 0.50)',
        envVertex: 'rgba(46, 204, 113, 0.70)',
        safe:      '#2ECC71',
        warn:      '#F1C40F',
        danger:    '#E74C3C',
        comet:     '#5BC0EB',
        horizon:   'rgba(91, 192, 235, 0.30)',
        labelBg:   'rgba(10, 15, 28, 0.75)'
    };

    /* ── Demo Polygon (industrial operating envelope) ── */
    var DEMO_POLYGON = [
        { x: 60,  y: 20 },
        { x: 140, y: 12 },
        { x: 240, y: 18 },
        { x: 300, y: 45 },
        { x: 290, y: 78 },
        { x: 220, y: 92 },
        { x: 120, y: 88 },
        { x: 40,  y: 55 }
    ];

    /* ── Constants ── */
    var GRID_LINES   = 8;
    var PULSE_MAX_HZ = 4.0;
    var PULSE_AMP    = 8;
    var DEMO_TICK_MS = 80;
    var RESIZE_MS    = 100;
    var PAD = { top: 46, right: 16, bottom: 44, left: 56 };


    /* ═══════════════════════════════════════════════════════
     *  Geometry Helpers
     * ═══════════════════════════════════════════════════════ */

    /**
     * Ray-Casting Point-in-Polygon — O(N)
     * Cast horizontal ray from (px,py) to +inf and count
     * how many polygon edges the ray crosses.
     * Odd crossings = inside.  Even = outside.
     */
    function isPointInPolygon(px, py, poly) {
        var inside = false;
        var n = poly.length;
        for (var i = 0, j = n - 1; i < n; j = i++) {
            var yi = poly[i].y, yj = poly[j].y;
            if ((yi > py) !== (yj > py) &&
                px < (poly[j].x - poly[i].x) * (py - yi) / (yj - yi) + poly[i].x) {
                inside = !inside;
            }
        }
        return inside;
    }

    /** Squared distance from point (px,py) to segment (ax,ay)-(bx,by) */
    function distToSegSq(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay;
        var lenSq = dx * dx + dy * dy;
        if (lenSq === 0) {
            var ex = px - ax, ey = py - ay;
            return ex * ex + ey * ey;
        }
        var t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
        if (t < 0) t = 0;
        else if (t > 1) t = 1;
        var cx = ax + t * dx - px;
        var cy = ay + t * dy - py;
        return cx * cx + cy * cy;
    }

    /** Minimum distance from point to polygon boundary */
    function minDistToPoly(px, py, poly) {
        var minSq = Infinity;
        var n = poly.length;
        for (var i = 0, j = n - 1; i < n; j = i++) {
            var sq = distToSegSq(px, py,
                poly[i].x, poly[i].y, poly[j].x, poly[j].y);
            if (sq < minSq) minSq = sq;
        }
        return Math.sqrt(minSq);
    }


    /* ═══════════════════════════════════════════════════════
     *  Coordinate Transform & Utility
     * ═══════════════════════════════════════════════════════ */

    function dataToScreen(dx, dy, L) {
        return {
            x: L.plotX + (dx - L.minX) / (L.rangeX || 1) * L.plotW,
            y: L.plotY + L.plotH - (dy - L.minY) / (L.rangeY || 1) * L.plotH
        };
    }

    function computeLayout(w, h, cfg) {
        var minX = Number(cfg.MinX) || 0;
        var maxX = Number(cfg.MaxX) || 350;
        var minY = Number(cfg.MinY) || 0;
        var maxY = Number(cfg.MaxY) || 100;
        return {
            w: w, h: h,
            plotX: PAD.left,   plotY: PAD.top,
            plotW: Math.max(1, w - PAD.left - PAD.right),
            plotH: Math.max(1, h - PAD.top - PAD.bottom),
            minX: minX, maxX: maxX,
            minY: minY, maxY: maxY,
            rangeX: maxX - minX,
            rangeY: maxY - minY
        };
    }

    function fmt(v, dec) {
        if (v == null || isNaN(v)) return '\u2014';
        return Number(v).toFixed(dec);
    }

    /** Parse "x1,y1;x2,y2;..." to [{x,y}, ...] or null */
    function parseEnvelopeStr(str) {
        if (!str || typeof str !== 'string') return null;
        var pts = [];
        var pairs = str.split(';');
        for (var i = 0; i < pairs.length; i++) {
            var parts = pairs[i].split(',');
            if (parts.length >= 2) {
                var x = parseFloat(parts[0]);
                var y = parseFloat(parts[1]);
                if (!isNaN(x) && !isNaN(y)) pts.push({ x: x, y: y });
            }
        }
        return pts.length >= 3 ? pts : null;
    }


    /* ═══════════════════════════════════════════════════════
     *  Symbol Visualization
     * ═══════════════════════════════════════════════════════ */

    symbolVis.prototype.init = function (scope, elem) {
        var cfg  = scope.config;
        var self = this;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-envelope-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-ev-root-mount');
        if (!mountEl) {
            console.error('[WOW Envelope] Mount element .wow-ev-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-envelope-wow.css';
        shadow.appendChild(linkEl);

        /* ═══ DOM Construction ═══ */
        var root = document.createElement('div');
        root.className = 'wow-ev-root';
        shadow.appendChild(root);

        var toolbar = document.createElement('div');
        toolbar.className = 'wow-ev-toolbar';
        root.appendChild(toolbar);

        var titleEl = document.createElement('div');
        titleEl.className = 'wow-ev-title';
        titleEl.textContent = cfg.Title || 'Executive Operating Envelope';
        toolbar.appendChild(titleEl);

        var badge = document.createElement('div');
        badge.className = 'wow-ev-status-badge';
        badge.textContent = '\u2014';
        toolbar.appendChild(badge);

        var statsEl = document.createElement('div');
        statsEl.className = 'wow-ev-stats';
        toolbar.appendChild(statsEl);

        var canvasWrap = document.createElement('div');
        canvasWrap.className = 'wow-ev-canvas-wrap';
        root.appendChild(canvasWrap);

        var canvas = document.createElement('canvas');
        canvas.className = 'wow-ev-canvas';
        canvasWrap.appendChild(canvas);

        var skeleton = document.createElement('div');
        skeleton.className = 'wow-ev-skeleton';
        canvasWrap.appendChild(skeleton);

        var footer = document.createElement('div');
        footer.className = 'wow-ev-footer';
        footer.textContent = 'WOW Envelope v100';
        root.appendChild(footer);


        /* ═══ State ═══ */
        var ctx = canvas.getContext('2d');
        var logW = 0, logH = 0;
        var layout = null;
        var polygon = null;
        var pointHistory = [];
        var currentX = null, currentY = null;
        var inZone = false;
        var distToEdge = Infinity;
        var animFrameId = null;
        var alive = true;
        var demoInterval = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;
        var demoT = 0;
        var _lastStatus = '';
        var _lastStats  = '';


        /* ═══ Resize ═══ */
        var _resizeTimer = null;

        self.onResize = function (width, height) {
            if (_resizeTimer) clearTimeout(_resizeTimer);
            _resizeTimer = setTimeout(function () {
                _resizeTimer = null;
                _handleResize(width, height);
            }, RESIZE_MS);
        };

        function _handleResize(width, height) {
            logW = width;
            var toolbarH = toolbar.offsetHeight || 36;
            var footerH  = footer.offsetHeight  || 20;
            logH = height - toolbarH - footerH;
            if (logH < 50) logH = 50;

            canvasWrap.style.height = logH + 'px';

            var dpr = window.devicePixelRatio || 1;
            canvas.width  = logW * dpr;
            canvas.height = logH * dpr;
            canvas.style.width  = logW + 'px';
            canvas.style.height = logH + 'px';
            ctx.scale(dpr, dpr);

            layout = computeLayout(logW, logH, cfg);
        }

        /* Initial sizing */
        _handleResize(elem[0].clientWidth || 800, elem[0].clientHeight || 500);

        /* Parse polygon */
        function _updatePolygon() {
            polygon = parseEnvelopeStr(cfg.EnvelopePoints);
            if (!polygon && cfg.DemoMode) polygon = DEMO_POLYGON;
        }
        _updatePolygon();


        /* ═══════════════════════════════════════════════════
         *  Draw Frame — Continuous rAF for Proximity Pulse
         * ═══════════════════════════════════════════════════ */

        function _drawFrame(now) {
            if (!alive) return;
            animFrameId = requestAnimationFrame(_drawFrame);
            if (!layout || logW <= 0 || logH <= 0) return;

            var L   = layout;
            var dec = cfg.Decimals != null ? Number(cfg.Decimals) : 1;
            var ff  = cfg.fontFamily || 'Segoe UI';
            var fs  = cfg.fontSize   || 12;
            var warnDist = Number(cfg.WarnDist) || 15;

            /* ── 1. Background ── */
            ctx.fillStyle = CLR.bg;
            ctx.fillRect(0, 0, L.w, L.h);

            /* ── 2. Clip to plot area ── */
            ctx.save();
            ctx.beginPath();
            ctx.rect(L.plotX, L.plotY, L.plotW, L.plotH);
            ctx.clip();

            /* ── 3. Grid ── */
            if (cfg.ShowGrid !== false) {
                ctx.strokeStyle = CLR.grid;
                ctx.lineWidth = 1;
                var xg, yg;
                for (var gx = 0; gx <= GRID_LINES; gx++) {
                    xg = L.plotX + (gx / GRID_LINES) * L.plotW;
                    ctx.beginPath();
                    ctx.moveTo(xg, L.plotY);
                    ctx.lineTo(xg, L.plotY + L.plotH);
                    ctx.stroke();
                }
                for (var gy = 0; gy <= GRID_LINES; gy++) {
                    yg = L.plotY + (gy / GRID_LINES) * L.plotH;
                    ctx.beginPath();
                    ctx.moveTo(L.plotX, yg);
                    ctx.lineTo(L.plotX + L.plotW, yg);
                    ctx.stroke();
                }
            }

            /* ── 4. Envelope Polygon ── */
            if (polygon && polygon.length >= 3) {
                var sp0 = dataToScreen(polygon[0].x, polygon[0].y, L);
                ctx.beginPath();
                ctx.moveTo(sp0.x, sp0.y);
                for (var pi = 1; pi < polygon.length; pi++) {
                    var sp = dataToScreen(polygon[pi].x, polygon[pi].y, L);
                    ctx.lineTo(sp.x, sp.y);
                }
                ctx.closePath();

                ctx.fillStyle = CLR.envFill;
                ctx.fill();

                ctx.strokeStyle = CLR.envStroke;
                ctx.lineWidth = 1.5;
                ctx.stroke();

                /* Vertex dots */
                ctx.fillStyle = CLR.envVertex;
                for (var vi = 0; vi < polygon.length; vi++) {
                    var vp = dataToScreen(polygon[vi].x, polygon[vi].y, L);
                    ctx.beginPath();
                    ctx.arc(vp.x, vp.y, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            /* ── 5. Comet Tail ── */
            if (cfg.ShowCometTail !== false && pointHistory.length > 1) {
                var prevS, hs, alpha, rad;
                for (var hi = 0; hi < pointHistory.length; hi++) {
                    hs = dataToScreen(pointHistory[hi].x, pointHistory[hi].y, L);
                    alpha = (hi + 1) / pointHistory.length;
                    rad = 1.5 + 2.5 * alpha;

                    if (hi > 0) {
                        prevS = dataToScreen(
                            pointHistory[hi - 1].x,
                            pointHistory[hi - 1].y, L);
                        ctx.beginPath();
                        ctx.moveTo(prevS.x, prevS.y);
                        ctx.lineTo(hs.x, hs.y);
                        ctx.strokeStyle = 'rgba(91,192,235,' +
                            (alpha * 0.35).toFixed(2) + ')';
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }

                    ctx.beginPath();
                    ctx.arc(hs.x, hs.y, rad, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(91,192,235,' +
                        (alpha * 0.7).toFixed(2) + ')';
                    ctx.fill();
                }
            }

            /* ── 6. Context Horizon (dashed crosshair) ── */
            if (cfg.ShowContextHorizon !== false &&
                currentX != null && currentY != null) {
                var chS = dataToScreen(currentX, currentY, L);
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = CLR.horizon;
                ctx.lineWidth = 1;

                ctx.beginPath();
                ctx.moveTo(L.plotX, chS.y);
                ctx.lineTo(L.plotX + L.plotW, chS.y);
                ctx.stroke();

                ctx.beginPath();
                ctx.moveTo(chS.x, L.plotY);
                ctx.lineTo(chS.x, L.plotY + L.plotH);
                ctx.stroke();

                ctx.setLineDash([]);
            }

            /* ── 7. Current Point + Proximity Pulse ── */
            if (currentX != null && currentY != null) {
                var ps = dataToScreen(currentX, currentY, L);
                var baseR = 5;
                var glowR = baseR;
                var ptColor = CLR.comet;

                if (polygon && polygon.length >= 3) {
                    if (!inZone) {
                        ptColor = CLR.danger;
                        var dPulse = Math.sin(
                            2 * Math.PI * PULSE_MAX_HZ * now / 1000);
                        glowR = baseR + PULSE_AMP * (0.5 + 0.5 * dPulse);
                    } else if (distToEdge < warnDist) {
                        ptColor = CLR.warn;
                        if (cfg.ShowProximityPulse !== false) {
                            var normD = Math.max(0, distToEdge / warnDist);
                            var freq = PULSE_MAX_HZ * (1 - normD);
                            if (freq < 0.3) freq = 0.3;
                            var wPulse = Math.sin(
                                2 * Math.PI * freq * now / 1000);
                            glowR = baseR + PULSE_AMP *
                                (0.5 + 0.5 * wPulse);
                        }
                    } else {
                        ptColor = CLR.safe;
                    }
                }

                /* Outer glow */
                ctx.save();
                ctx.globalAlpha = 0.25;
                ctx.beginPath();
                ctx.arc(ps.x, ps.y, glowR, 0, Math.PI * 2);
                ctx.fillStyle = ptColor;
                ctx.fill();
                ctx.restore();

                /* Main dot with shadow */
                ctx.save();
                ctx.shadowColor = ptColor;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(ps.x, ps.y, baseR, 0, Math.PI * 2);
                ctx.fillStyle = ptColor;
                ctx.fill();
                ctx.restore();

                /* White center */
                ctx.beginPath();
                ctx.arc(ps.x, ps.y, 2, 0, Math.PI * 2);
                ctx.fillStyle = '#FFFFFF';
                ctx.fill();

                /* Value label near point */
                if (cfg.ShowValues !== false) {
                    var valTxt = 'X: ' + fmt(currentX, dec) +
                                 '   Y: ' + fmt(currentY, dec);
                    ctx.font = 'bold ' + (fs - 1) + 'px "' +
                               ff + '", Arial, sans-serif';
                    var valW = ctx.measureText(valTxt).width;
                    var valX = ps.x + baseR + 8;
                    var valY = ps.y - baseR - 12;

                    if (valX + valW + 4 > L.plotX + L.plotW) {
                        valX = ps.x - valW - baseR - 8;
                    }
                    if (valY < L.plotY + 4) {
                        valY = ps.y + baseR + 16;
                    }

                    ctx.fillStyle = CLR.labelBg;
                    ctx.fillRect(valX - 4, valY - 10, valW + 8, 16);
                    ctx.fillStyle = CLR.text;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(valTxt, valX, valY - 2);
                }
            }

            /* ── Remove clip ── */
            ctx.restore();

            /* ── 8. Context Horizon axis value labels ── */
            if (cfg.ShowContextHorizon !== false &&
                currentX != null && currentY != null) {
                var chS2 = dataToScreen(currentX, currentY, L);
                ctx.font = (fs - 2) + 'px "' + ff + '", Arial, sans-serif';

                var yStr = fmt(currentY, dec);
                var yW = ctx.measureText(yStr).width;
                ctx.fillStyle = CLR.labelBg;
                ctx.fillRect(L.plotX - yW - 8, chS2.y - 8, yW + 6, 16);
                ctx.fillStyle = CLR.text;
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(yStr, L.plotX - 5, chS2.y);

                var xStr = fmt(currentX, dec);
                var xW = ctx.measureText(xStr).width;
                ctx.fillStyle = CLR.labelBg;
                ctx.fillRect(chS2.x - xW / 2 - 3,
                    L.plotY + L.plotH + 2, xW + 6, 14);
                ctx.fillStyle = CLR.text;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(xStr, chS2.x, L.plotY + L.plotH + 3);
            }

            /* ── 9. Axes tick labels ── */
            ctx.font = (fs - 2) + 'px "' + ff + '", Arial, sans-serif';
            ctx.fillStyle = CLR.axis;

            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            var yVal, yPos;
            for (var yi = 0; yi <= GRID_LINES; yi++) {
                yVal = L.minY + (yi / GRID_LINES) * L.rangeY;
                yPos = L.plotY + L.plotH - (yi / GRID_LINES) * L.plotH;
                ctx.fillText(fmt(yVal, dec), L.plotX - 6, yPos);
            }

            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            var xVal, xPos;
            for (var xi = 0; xi <= GRID_LINES; xi++) {
                xVal = L.minX + (xi / GRID_LINES) * L.rangeX;
                xPos = L.plotX + (xi / GRID_LINES) * L.plotW;
                ctx.fillText(fmt(xVal, dec), xPos, L.plotY + L.plotH + 4);
            }

            /* ── 10. Axis titles ── */
            ctx.font = fs + 'px "' + ff + '", Arial, sans-serif';
            ctx.fillStyle = CLR.axisTitle;

            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText(cfg.XLabel || 'X', L.plotX + L.plotW / 2, L.h - 4);

            ctx.save();
            ctx.translate(14, L.plotY + L.plotH / 2);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(cfg.YLabel || 'Y', 0, 0);
            ctx.restore();

            /* ── 11. Plot border ── */
            ctx.strokeStyle = CLR.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(L.plotX, L.plotY, L.plotW, L.plotH);

            /* ── 12. DOM updates (change-detect) ── */
            var status = '\u2014';
            var bgCol = 'transparent';
            var brCol = CLR.muted;
            var txCol = CLR.muted;
            var statsText = '';

            if (currentX != null && currentY != null &&
                polygon && polygon.length >= 3) {
                if (!inZone) {
                    status = 'DANGER';
                    bgCol = 'rgba(231,76,60,0.15)';
                    brCol = CLR.danger;
                    txCol = CLR.danger;
                } else if (distToEdge < warnDist) {
                    status = 'WARNING';
                    bgCol = 'rgba(241,196,15,0.15)';
                    brCol = CLR.warn;
                    txCol = CLR.warn;
                } else {
                    status = 'SAFE';
                    bgCol = 'rgba(46,204,113,0.15)';
                    brCol = CLR.safe;
                    txCol = CLR.safe;
                }
                statsText =
                    '\u05DE\u05E8\u05D7\u05E7: ' + fmt(distToEdge, 1) +
                    '  |  \u05D4\u05D9\u05E1\u05D8\u05D5\u05E8\u05D9\u05D4: ' +
                    pointHistory.length + '/' +
                    (Number(cfg.HistorySize) || 50);
            }

            if (status !== _lastStatus) {
                badge.textContent       = status;
                badge.style.background  = bgCol;
                badge.style.borderColor = brCol;
                badge.style.color       = txCol;
                _lastStatus = status;
            }
            if (statsText !== _lastStats) {
                statsEl.textContent = statsText;
                _lastStats = statsText;
            }
        }

        /* Start continuous animation */
        animFrameId = requestAnimationFrame(_drawFrame);


        /* ═══ Data Update ═══ */
        function _processData(data) {
            skeleton.style.display = 'none';

            var xRaw = data.Data[0];
            var yRaw = data.Data[1];
            if (!xRaw || !yRaw) return;

            var xVal = parseFloat(
                xRaw.Value != null ? xRaw.Value : xRaw);
            var yVal = parseFloat(
                yRaw.Value != null ? yRaw.Value : yRaw);
            if (isNaN(xVal) || isNaN(yVal)) return;

            currentX = xVal;
            currentY = yVal;

            var maxH = Number(cfg.HistorySize) || 50;
            pointHistory.push({ x: xVal, y: yVal });
            while (pointHistory.length > maxH) {
                pointHistory.shift();
            }

            if (polygon && polygon.length >= 3) {
                inZone     = isPointInPolygon(xVal, yVal, polygon);
                distToEdge = minDistToPoly(xVal, yVal, polygon);
            }
        }

        self.onDataUpdate = function (data) {
            if (cfg.DemoMode) return;
            if (!data || !data.Data || data.Data.length < 2) return;

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


        /* ═══ Config ═══ */
        function _applyConfig() {
            titleEl.textContent = cfg.Title || 'Executive Operating Envelope';
            _updatePolygon();
            layout = computeLayout(logW, logH, cfg);

            var ff2 = cfg.fontFamily || 'Segoe UI';
            var fs2 = cfg.fontSize   || 12;
            root.style.setProperty(
                '--wow-ev-font', '"' + ff2 + '", Arial, sans-serif');
            root.style.setProperty(
                '--wow-ev-font-size', fs2 + 'px');
        }

        ['Title', 'EnvelopePoints', 'MinX', 'MaxX', 'MinY', 'MaxY',
         'XLabel', 'YLabel', 'ShowGrid', 'ShowCometTail',
         'ShowProximityPulse', 'ShowContextHorizon', 'ShowValues',
         'HistorySize', 'WarnDist', 'Decimals', 'fontFamily', 'fontSize'
        ].forEach(function (key) {
            scope.$watch('config.' + key, function () {
                _applyConfig();
            });
        });

        scope.$watch('config.DemoMode', function (v) {
            _applyConfig();
            if (v) _startDemo();
            else   _stopDemo();
        });


        /* ═══════════════════════════════════════════════════
         *  Demo Mode — Wandering Operating Point
         *
         *  A Lissajous-like trajectory that orbits inside the
         *  envelope, occasionally drifting to the boundary
         *  (triggering WARNING pulse) and sometimes exiting
         *  (triggering DANGER state).
         * ═══════════════════════════════════════════════════ */
        function _demoTick() {
            if (!alive || !cfg.DemoMode) return;
            demoT += 0.04;

            var cx = 170, cy = 50;
            var x = cx + 80 * Math.sin(demoT * 0.5) +
                         30 * Math.cos(demoT * 1.7);
            var y = cy + 30 * Math.cos(demoT * 0.3) +
                         15 * Math.sin(demoT * 1.3);

            /* Occasional excursion outside polygon */
            if (Math.sin(demoT * 0.08) > 0.6) {
                x += 60 * Math.sin(demoT * 2.0);
                y += 25 * Math.cos(demoT * 1.5);
            }

            currentX = x;
            currentY = y;

            var maxH = Number(cfg.HistorySize) || 50;
            pointHistory.push({ x: x, y: y });
            while (pointHistory.length > maxH) {
                pointHistory.shift();
            }

            if (polygon && polygon.length >= 3) {
                inZone     = isPointInPolygon(x, y, polygon);
                distToEdge = minDistToPoly(x, y, polygon);
            }
        }

        function _startDemo() {
            _stopDemo();
            skeleton.style.display = 'none';
            pointHistory = [];
            demoT = 0;
            currentX = null;
            currentY = null;
            _lastStatus = '';
            _lastStats  = '';
            demoInterval = setInterval(_demoTick, DEMO_TICK_MS);
        }

        function _stopDemo() {
            if (demoInterval) {
                clearInterval(demoInterval);
                demoInterval = null;
            }
        }

        /* ═══ Init ═══ */
        _applyConfig();
        if (cfg.DemoMode) _startDemo();


        /* ═══ Cleanup ═══ */
        scope.$on('$destroy', function () {
            alive = false;
            if (animFrameId) cancelAnimationFrame(animFrameId);
            _stopDemo();
            if (_resizeTimer) clearTimeout(_resizeTimer);
            clearTimeout(_dataDebounceId);
            pointHistory = [];
            polygon      = null;
            layout       = null;
            _pendingData = null;
        });
    };


    /* ═══ Symbol Registration ═══ */
    PV.symbolCatalog.register({
        typeName:           'envelope-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05DE\u05E2\u05D8\u05E4\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC WOW v100',
        /* מעטפת תפעול WOW v100 */
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        getDefaultConfig: function () {
            return {
                DataShape:          'Value',
                Height:             500,
                Width:              800,
                Title:              'Executive Operating Envelope',
                DemoMode:           true,
                MinX:               0,
                MaxX:               350,
                MinY:               0,
                MaxY:               100,
                XLabel:             '\u05D8\u05DE\u05E4\u05E8\u05D8\u05D5\u05E8\u05D4 (\u00B0C)',
                YLabel:             '\u05DC\u05D7\u05E5 (bar)',
                EnvelopePoints:     '',
                ShowGrid:           true,
                ShowCometTail:      true,
                ShowProximityPulse: true,
                ShowContextHorizon: true,
                ShowValues:         true,
                HistorySize:        50,
                WarnDist:           15,
                Decimals:           1,
                fontFamily:         'Segoe UI',
                fontSize:           12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DE\u05E2\u05D8\u05E4\u05EA \u05EA\u05E4\u05E2\u05D5\u05DC WOW'
        /* הגדרות מעטפת תפעול WOW */
    });

})(window.PIVisualization);
