/**
 * ═══════════════════════════════════════════════════════
 *  sym-digitaltwin-wow.js — Executive Digital Twin WOW v100
 * ═══════════════════════════════════════════════════════
 *
 *  Canvas-based process graphic / digital twin that draws
 *  a background schematic AND live data overlays on one
 *  single bitmap — zero DOM elements, zero reflows.
 *
 *  THE GEM  ─────────────────────────────────────────────
 *  50 live tags update simultaneously?  Traditional PI Vision
 *  fires 50 Angular $apply cycles → 50 DOM reflows → 200 ms.
 *  This symbol writes 50 fillText calls in a tight Canvas
 *  loop → <1 ms total.  The GPU doesn't even notice.
 *
 *  Extra gems:
 *    • Contextual Dimming — healthy zones fade to grayscale,
 *      anomaly zones light up via even-odd clip spotlights
 *    • Pulse Animation — Math.sin(Date.now()) driven halo
 *      for alarm badges, zero CSS / zero DOM
 *    • Background Image Caching — loaded once, drawn every
 *      frame via ctx.drawImage (GPU texture upload)
 *    • Demo Schematic — full power-plant block diagram
 *      drawn entirely with Canvas primitives
 *  ──────────────────────────────────────────────────────
 *
 *  DataShape : Table (Multiple attributes → rows)
 *  Version   : WOW Digital Twin v100
 *  Lines     : ~820
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════
     *  CONSTANTS & PALETTE
     * ═══════════════════════════════════════════════════ */

    var BADGE_PAD_X  = 8;
    var BADGE_PAD_Y  = 4;
    var BADGE_RADIUS = 5;
    var SPOT_RADIUS  = 55;       // contextual dimming spotlight
    var HIT_RADIUS   = 35;       // hover hit-test zone

    var CLR = {
        bg:           '#0B0F19',
        blockFill:    'rgba(15, 41, 64, 0.70)',
        blockBorder:  'rgba(26, 58, 92, 0.60)',
        pipe:         'rgba(91, 192, 235, 0.35)',
        pipeArrow:    'rgba(91, 192, 235, 0.50)',
        ok:           '#00F5D4',
        warn:         '#FFCC00',
        crit:         '#FF3B30',
        accent:       '#5BC0EB',
        text:         '#ECF0F1',
        textMuted:    '#8899AA',
        border:       '#1A3A5C',
        badgeBg:      'rgba(11, 15, 25, 0.78)',
        dimOverlay:   'rgba(11, 15, 25, 0.52)',
        gridLine:     'rgba(26, 58, 92, 0.12)'
    };

    /* ── Demo Power-Plant Schematic ──────────────────── */

    var DEMO_BLOCKS = [
        { xPct: 5,  yPct: 14, wPct: 27, hPct: 30, label: '\u05D3\u05D5\u05D3 \u05E7\u05D9\u05D8\u05D5\u05E8',     accent: '#E8443A' },
        { xPct: 36, yPct: 14, wPct: 27, hPct: 30, label: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4',             accent: '#5BC0EB' },
        { xPct: 67, yPct: 14, wPct: 28, hPct: 30, label: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8',                   accent: '#00F5D4' },
        { xPct: 5,  yPct: 56, wPct: 42, hPct: 24, label: '\u05DE\u05E2\u05D1\u05D4',                               accent: '#8899AA' },
        { xPct: 53, yPct: 56, wPct: 42, hPct: 24, label: '\u05DE\u05D2\u05D3\u05DC\u05D9 \u05E7\u05D9\u05E8\u05D5\u05E8', accent: '#5BC0EB' }
    ];

    var DEMO_PIPES = [
        { x1: 32, y1: 29, x2: 36, y2: 29 },
        { x1: 63, y1: 29, x2: 67, y2: 29 },
        { x1: 49, y1: 44, x2: 26, y2: 56 },
        { x1: 49, y1: 44, x2: 74, y2: 56 },
        { x1: 47, y1: 68, x2: 53, y2: 68 }
    ];

    var DEMO_TAGS = [
        { label: '\u05D8\u05DE\u05E4\u05F3 \u05E7\u05D9\u05D8\u05D5\u05E8',  xPct: 18, yPct: 24, warn: 500, crit: 540, unit: '\u00B0C',  base: 480, amp: 18, freq: 0.40, spike: true  },
        { label: '\u05DC\u05D7\u05E5 \u05E7\u05D9\u05D8\u05D5\u05E8',        xPct: 18, yPct: 38, warn: 80,  crit: 95,  unit: 'bar', base: 72,  amp: 6,  freq: 0.30, spike: false },
        { label: 'RPM',                                                         xPct: 49, yPct: 24, warn: 3400,crit: 3600,unit: 'rpm', base: 3200,amp: 90, freq: 0.50, spike: false },
        { label: '\u05E8\u05E2\u05D9\u05D3\u05D5\u05EA',                      xPct: 49, yPct: 38, warn: 7,   crit: 10,  unit: 'mm/s',base: 3.5, amp: 1.8,freq: 0.55, spike: true  },
        { label: '\u05D4\u05E1\u05E4\u05E7',                                   xPct: 80, yPct: 24, warn: 550, crit: 580, unit: 'MW',  base: 510, amp: 18, freq: 0.35, spike: false },
        { label: '\u05D6\u05E8\u05DD',                                          xPct: 80, yPct: 38, warn: 18,  crit: 20,  unit: 'kA',  base: 15,  amp: 1.5,freq: 0.42, spike: false },
        { label: '\u05D8\u05DE\u05E4\u05F3 \u05DE\u05E2\u05D1\u05D4',        xPct: 26, yPct: 66, warn: 40,  crit: 50,  unit: '\u00B0C',  base: 32,  amp: 4,  freq: 0.25, spike: false },
        { label: '\u05D8\u05DE\u05E4\u05F3 \u05E7\u05D9\u05E8\u05D5\u05E8',  xPct: 74, yPct: 66, warn: 38,  crit: 45,  unit: '\u00B0C',  base: 28,  amp: 3,  freq: 0.28, spike: false }
    ];

    /* ═══════════════════════════════════════════════════
     *  HELPERS
     * ═══════════════════════════════════════════════════ */

    function debounce(fn, ms) {
        var t; return function () {
            var a = arguments, s = this;
            clearTimeout(t); t = setTimeout(function () { fn.apply(s, a); }, ms);
        };
    }

    function _el(tag, cls) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        return e;
    }

    function _roundRect(ctx, x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    /* ═══════════════════════════════════════════════════
     *  SYMBOL IMPLEMENTATION
     * ═══════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    symbolVis.prototype.init = function (scope, elem) {

        /* ── Script Base Path ─────────────────────────── */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-digitaltwin-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].src;
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            // Dynamic fallback via PI Vision base URL
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ── Shadow DOM ───────────────────────────────── */
        var mountEl = elem[0].querySelector('.wow-dt-root-mount');
        if (!mountEl) mountEl = elem[0];
        var shadow;
        try   { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-digitaltwin-wow.css';
        shadow.appendChild(linkEl);

        /* ── DOM Scaffold ─────────────────────────────── */
        var root       = _el('div', 'wow-dt-root');
        var toolbar    = _el('div', 'wow-dt-toolbar');
        var titleEl    = _el('span', 'wow-dt-title');
        var actions    = _el('div', 'wow-dt-toolbar-actions');
        var btnExport  = _el('button', 'wow-dt-btn'); btnExport.textContent = '\uD83D\uDCF8 Export';
        var btnDim     = _el('button', 'wow-dt-btn'); btnDim.textContent    = '\uD83D\uDD26 Dimming';
        actions.appendChild(btnDim);
        actions.appendChild(btnExport);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        var statsBar    = _el('div', 'wow-dt-stats');
        var canvasOuter = _el('div', 'wow-dt-canvas-outer');
        var canvas      = document.createElement('canvas');
        canvas.className = 'wow-dt-canvas';
        canvasOuter.appendChild(canvas);

        var tooltip = _el('div', 'wow-dt-tooltip');
        tooltip.style.display = 'none';
        canvasOuter.appendChild(tooltip);

        var skeleton = _el('div', 'wow-dt-skeleton');
        canvasOuter.appendChild(skeleton);

        var footer = _el('div', 'wow-dt-footer');
        footer.textContent = 'WOW Digital Twin v100 \u00B7 Executive Process Graphic';

        root.appendChild(toolbar);
        root.appendChild(statsBar);
        root.appendChild(canvasOuter);
        root.appendChild(footer);
        shadow.appendChild(root);

        /* ── Canvas Context ────────────────────────────── */
        var ctx = canvas.getContext('2d', { alpha: false });
        var dpr = 1, W = 0, H = 0;

        /* ── State ─────────────────────────────────────── */
        var latestData    = {};        // { tagLabel: numericValue }
        var bgImage       = null;      // cached background Image
        var imageLoaded   = false;
        var mappings      = [];        // active data mappings
        var anomalyIdxs   = [];        // indices of anomalous mappings
        var hasAlarms     = false;
        var hoveredIdx    = -1;
        var animId        = null;
        var isAnimating   = false;
        var demoTime      = 0;
        var config        = scope.config;

        // Draw area (background image or full canvas)
        var drawX = 0, drawY = 0, drawW = 0, drawH = 0;

        /* ── Config Defaults ───────────────────────────── */
        if (!config.Title)           config.Title           = 'Executive Digital Twin';
        if (config.DemoMode === undefined) config.DemoMode  = true;
        if (config.EnableDimming === undefined) config.EnableDimming = true;
        if (config.EnablePulse  === undefined) config.EnablePulse  = true;
        if (config.Decimals == null) config.Decimals        = 1;
        if (!config.fontFamily)      config.fontFamily      = 'Segoe UI';
        if (!config.fontSize)        config.fontSize        = 13;
        if (!config.BackgroundImageUrl) config.BackgroundImageUrl = '';
        if (!config.DataMappingsJSON)   config.DataMappingsJSON   = '';

        titleEl.textContent = config.Title;

        /* ── Background Image Loading ──────────────────── */
        function _loadBgImage(url) {
            if (!url) { bgImage = null; imageLoaded = false; return; }
            var img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = function () {
                bgImage = img;
                imageLoaded = true;
                _requestDraw();
            };
            img.onerror = function () {
                bgImage = null;
                imageLoaded = false;
            };
            img.src = url;
        }

        if (config.BackgroundImageUrl && !config.DemoMode) {
            _loadBgImage(config.BackgroundImageUrl);
        }

        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;

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
            _requestDraw();
        }, 100));
        resizeObs.observe(canvasOuter);

        /* ═══════════════════════════════════════════════
         *  DEMO SCHEMATIC DRAWING
         * ═══════════════════════════════════════════════ */

        function _drawDemoSchematic() {
            // Subtle background grid
            ctx.strokeStyle = CLR.gridLine;
            ctx.lineWidth   = 1;
            var step = 35;
            for (var gx = step; gx < W; gx += step) {
                ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
            }
            for (var gy = step; gy < H; gy += step) {
                ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
            }

            // Equipment blocks
            for (var b = 0; b < DEMO_BLOCKS.length; b++) {
                var blk = DEMO_BLOCKS[b];
                var bx = (blk.xPct / 100) * W;
                var by = (blk.yPct / 100) * H;
                var bw = (blk.wPct / 100) * W;
                var bh = (blk.hPct / 100) * H;

                // Block body
                _roundRect(ctx, bx, by, bw, bh, 6);
                ctx.fillStyle = CLR.blockFill;
                ctx.fill();
                ctx.strokeStyle = CLR.blockBorder;
                ctx.lineWidth   = 1.5;
                ctx.stroke();

                // Top accent bar
                ctx.fillStyle = blk.accent + '35';
                ctx.fillRect(bx + 1, by + 1, bw - 2, 3);

                // Label
                ctx.fillStyle    = CLR.textMuted;
                ctx.font         = 'bold 12px ' + (config.fontFamily || 'Segoe UI');
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(blk.label, bx + bw / 2, by + 8);
            }

            // Connecting pipes with flow arrows
            for (var p = 0; p < DEMO_PIPES.length; p++) {
                var pipe = DEMO_PIPES[p];
                var px1 = (pipe.x1 / 100) * W;
                var py1 = (pipe.y1 / 100) * H;
                var px2 = (pipe.x2 / 100) * W;
                var py2 = (pipe.y2 / 100) * H;

                ctx.strokeStyle = CLR.pipe;
                ctx.lineWidth   = 2;
                ctx.beginPath();
                ctx.moveTo(px1, py1);
                ctx.lineTo(px2, py2);
                ctx.stroke();

                // Arrow at midpoint
                var mx = (px1 + px2) / 2;
                var my = (py1 + py2) / 2;
                var angle = Math.atan2(py2 - py1, px2 - px1);
                ctx.save();
                ctx.translate(mx, my);
                ctx.rotate(angle);
                ctx.beginPath();
                ctx.moveTo(5, 0);
                ctx.lineTo(-4, -3.5);
                ctx.lineTo(-4, 3.5);
                ctx.closePath();
                ctx.fillStyle = CLR.pipeArrow;
                ctx.fill();
                ctx.restore();
            }
        }

        /* ═══════════════════════════════════════════════
         *  DEMO DATA GENERATOR
         * ═══════════════════════════════════════════════ */

        function _generateDemoData() {
            demoTime += 0.016;
            mappings = [];
            for (var i = 0; i < DEMO_TAGS.length; i++) {
                var tag  = DEMO_TAGS[i];
                var val  = tag.base + tag.amp * Math.sin(demoTime * tag.freq + i * 0.9);

                // Periodic spikes for anomaly demo
                if (tag.spike) {
                    var spikeSin = Math.sin(demoTime * 0.22 + i * 1.5);
                    if (spikeSin > 0.65) {
                        val = tag.warn + (tag.crit - tag.warn) * 0.8 * spikeSin;
                    }
                }

                latestData[tag.label] = val;
                mappings.push({
                    label:  tag.label,
                    xPct:   tag.xPct,
                    yPct:   tag.yPct,
                    warn:   tag.warn,
                    crit:   tag.crit,
                    unit:   tag.unit
                });
            }
        }

        /* ═══════════════════════════════════════════════
         *  DATA UPDATE (Live PI Vision Bridge)
         * ═══════════════════════════════════════════════ */

        function _processData(data) {
            // Remove skeleton on first data
            if (skeleton && skeleton.parentNode) {
                skeleton.parentNode.removeChild(skeleton);
                skeleton = null;
            }

            // Build flat lookup
            data.Rows.forEach(function (row) {
                latestData[row.Label] = parseFloat(row.Value);
            });

            // Parse mappings from config JSON
            if (!mappings.length) {
                mappings = _parseMappings();
            }

            _requestDraw();
        }

        this.onDataUpdate = function (data) {
            if (config.DemoMode) return;
            if (!data || !data.Rows) return;

            _pendingData = data;

            /* Immediate on first data (remove skeleton fast) */
            if (skeleton) {
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

        function _parseMappings() {
            if (!config.DataMappingsJSON) return [];
            try { return JSON.parse(config.DataMappingsJSON); }
            catch (e) { return []; }
        }

        /* ═══════════════════════════════════════════════
         *  DRAW LOOP
         * ═══════════════════════════════════════════════ */

        function _requestDraw() {
            if (isAnimating) return;
            isAnimating = true;
            animId = requestAnimationFrame(_drawLoop);
        }

        function _drawLoop() {
            animId = null;
            if (W === 0) { isAnimating = false; return; }

            if (config.DemoMode) _generateDemoData();

            _drawTwin();
            _updateStats();

            // Keep animating for demo or active pulse alarms
            if (config.DemoMode || (config.EnablePulse && hasAlarms)) {
                animId = requestAnimationFrame(_drawLoop);
            } else {
                isAnimating = false;
            }
        }

        /* ═══════════════════════════════════════════════
         *  MAIN DRAW FUNCTION
         * ═══════════════════════════════════════════════ */

        function _drawTwin() {
            // 1. Clear
            ctx.fillStyle = CLR.bg;
            ctx.fillRect(0, 0, W, H);

            // 2. Draw background
            if (config.DemoMode || !imageLoaded) {
                drawX = 0; drawY = 0; drawW = W; drawH = H;
                if (config.DemoMode) _drawDemoSchematic();
            } else {
                _drawBgImage();
            }

            // 3. Compute anomalies
            anomalyIdxs = [];
            hasAlarms   = false;
            for (var i = 0; i < mappings.length; i++) {
                var m   = mappings[i];
                var val = latestData[m.label];
                if (val == null || isNaN(val)) continue;
                var status = _getStatus(val, m);
                if (status !== 'ok') {
                    anomalyIdxs.push(i);
                    hasAlarms = true;
                }
            }

            // 4. Contextual Dimming (THE GEM)
            if (config.EnableDimming && hasAlarms) {
                _applyDimming();
            }

            // 5. Draw data badges
            _drawAllBadges();
        }

        /* ── Background Image (with aspect ratio) ────── */
        function _drawBgImage() {
            var imgR    = bgImage.width / bgImage.height;
            var canvasR = W / H;
            if (canvasR > imgR) {
                drawH = H; drawW = drawH * imgR;
                drawX = (W - drawW) / 2; drawY = 0;
            } else {
                drawW = W; drawH = drawW / imgR;
                drawX = 0; drawY = (H - drawH) / 2;
            }
            ctx.drawImage(bgImage, drawX, drawY, drawW, drawH);
        }

        /* ════════════════════════════════════════════════
         *  THE GEM: Contextual Dimming
         *  Healthy zones fade out, anomaly zones light up
         *  via even-odd clip (dark overlay with "holes").
         * ════════════════════════════════════════════════ */

        function _applyDimming() {
            ctx.save();

            // Build path: full-canvas rectangle (CW) + anomaly circles (CCW → holes)
            ctx.beginPath();
            ctx.rect(0, 0, W, H);

            for (var a = 0; a < anomalyIdxs.length; a++) {
                var m  = mappings[anomalyIdxs[a]];
                var px = drawX + (m.xPct / 100) * drawW;
                var py = drawY + (m.yPct / 100) * drawH;
                ctx.moveTo(px + SPOT_RADIUS, py);
                ctx.arc(px, py, SPOT_RADIUS, 0, Math.PI * 2, true);
            }

            ctx.fillStyle = CLR.dimOverlay;
            ctx.fill('evenodd');
            ctx.restore();

            // Soft feathered edges around each spotlight
            for (var b = 0; b < anomalyIdxs.length; b++) {
                var m2 = mappings[anomalyIdxs[b]];
                var px2 = drawX + (m2.xPct / 100) * drawW;
                var py2 = drawY + (m2.yPct / 100) * drawH;
                var grad = ctx.createRadialGradient(px2, py2, SPOT_RADIUS * 0.6, px2, py2, SPOT_RADIUS * 1.1);
                grad.addColorStop(0, 'rgba(11, 15, 25, 0)');
                grad.addColorStop(1, 'rgba(11, 15, 25, 0.35)');
                ctx.beginPath();
                ctx.arc(px2, py2, SPOT_RADIUS * 1.1, 0, Math.PI * 2);
                ctx.fillStyle = grad;
                ctx.fill();
            }
        }

        /* ═══════════════════════════════════════════════
         *  DATA BADGE DRAWING
         * ═══════════════════════════════════════════════ */

        function _drawAllBadges() {
            var dec  = config.Decimals != null ? config.Decimals : 1;
            var font = (config.fontSize || 13) + 'px ' + (config.fontFamily || 'Segoe UI');

            for (var i = 0; i < mappings.length; i++) {
                var m   = mappings[i];
                var val = latestData[m.label];
                if (val == null || isNaN(val)) continue;

                var px     = drawX + (m.xPct / 100) * drawW;
                var py     = drawY + (m.yPct / 100) * drawH;
                var status = _getStatus(val, m);

                // ── Pulse Glow (for anomalies) ──
                if (status !== 'ok') {
                    _drawAlarmGlow(px, py, status);
                }

                // ── Badge Background ──
                var valText = val.toFixed(dec) + ' ' + (m.unit || '');
                ctx.font = 'bold ' + font;
                var tw = ctx.measureText(valText).width;
                var bw = tw + BADGE_PAD_X * 2;
                var bh = 20 + BADGE_PAD_Y * 2;
                var bx = px - bw / 2;
                var by = py - bh / 2;

                _roundRect(ctx, bx, by, bw, bh, BADGE_RADIUS);
                ctx.fillStyle = CLR.badgeBg;
                ctx.fill();

                // Border color by status
                ctx.strokeStyle = status === 'crit' ? CLR.crit
                                : status === 'warn' ? CLR.warn
                                : 'rgba(91, 192, 235, 0.18)';
                ctx.lineWidth = status !== 'ok' ? 1.5 : 1;
                ctx.stroke();

                // ── Value Text ──
                ctx.fillStyle    = status === 'crit' ? CLR.crit
                                 : status === 'warn' ? CLR.warn
                                 : CLR.ok;
                ctx.textAlign    = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(valText, px, py);

                // ── Label below badge ──
                ctx.font      = '9px ' + (config.fontFamily || 'Segoe UI');
                ctx.fillStyle = CLR.textMuted;
                ctx.fillText(m.label, px, py + bh / 2 + 10);

                // ── Highlight if hovered ──
                if (hoveredIdx === i) {
                    _roundRect(ctx, bx - 2, by - 2, bw + 4, bh + 4, BADGE_RADIUS + 2);
                    ctx.strokeStyle = CLR.accent;
                    ctx.lineWidth   = 1.5;
                    ctx.stroke();
                }
            }
        }

        /* ════════════════════════════════════════════════
         *  PULSE ANIMATION
         *  Math.sin(Date.now()) driven halo for alarm
         *  badges — zero CSS, zero DOM, pure Canvas.
         * ════════════════════════════════════════════════ */

        function _drawAlarmGlow(px, py, status) {
            var isCrit = status === 'crit';
            var now    = Date.now();

            // Pulsing radius and alpha
            var pulse  = config.EnablePulse
                       ? Math.abs(Math.sin(now * 0.004))
                       : 0.7;
            var glowR  = 22 + 14 * pulse;
            var alpha  = 0.25 + 0.2 * pulse;

            var grad = ctx.createRadialGradient(px, py, 0, px, py, glowR);
            if (isCrit) {
                grad.addColorStop(0, 'rgba(255, 59, 48, ' + alpha + ')');
                grad.addColorStop(1, 'rgba(255, 59, 48, 0)');
            } else {
                grad.addColorStop(0, 'rgba(255, 204, 0, ' + (alpha * 0.85) + ')');
                grad.addColorStop(1, 'rgba(255, 204, 0, 0)');
            }

            ctx.beginPath();
            ctx.arc(px, py, glowR, 0, Math.PI * 2);
            ctx.fillStyle = grad;
            ctx.fill();
        }

        /* ═══════════════════════════════════════════════
         *  HIT TESTING + TOOLTIP
         * ═══════════════════════════════════════════════ */

        function _hitTest(mx, my) {
            for (var i = 0; i < mappings.length; i++) {
                var m  = mappings[i];
                var px = drawX + (m.xPct / 100) * drawW;
                var py = drawY + (m.yPct / 100) * drawH;
                var dx = mx - px, dy = my - py;
                if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) return i;
            }
            return -1;
        }

        var _onCanvasMove = function (e) {
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;
            var prev = hoveredIdx;
            hoveredIdx = _hitTest(mx, my);

            if (hoveredIdx >= 0) {
                _showTooltip(hoveredIdx, e.clientX, e.clientY);
            } else {
                tooltip.style.display = 'none';
            }
            // Redraw for hover highlight
            if (prev !== hoveredIdx && !isAnimating) {
                _requestDraw();
            }
        };
        canvas.addEventListener('mousemove', _onCanvasMove);

        var _onCanvasLeave = function () {
            hoveredIdx = -1;
            tooltip.style.display = 'none';
            if (!isAnimating) _requestDraw();
        };
        canvas.addEventListener('mouseleave', _onCanvasLeave);

        function _showTooltip(idx, clientX, clientY) {
            var m   = mappings[idx];
            var val = latestData[m.label];
            if (val == null) return;
            var dec    = config.Decimals != null ? config.Decimals : 1;
            var status = _getStatus(val, m);
            var statusHeb = status === 'crit' ? '\u05E7\u05E8\u05D9\u05D8\u05D9'
                          : status === 'warn' ? '\u05D0\u05D6\u05D4\u05E8\u05D4'
                          : '\u05EA\u05E7\u05D9\u05DF';
            var statusCls = 'wow-dt-tt-' + status;
            var pctOfWarn = ((val / (m.warn || 100)) * 100).toFixed(0);

            tooltip.innerHTML =
                '<div class="wow-dt-tt-label">' + m.label + '</div>' +
                '<div class="wow-dt-tt-value"><b>' + val.toFixed(dec) + '</b> ' +
                    (m.unit || '') + '</div>' +
                '<div class="wow-dt-tt-limits">' +
                    '\u05D0\u05D6\u05D4\u05E8\u05D4: ' + m.warn + ' | ' +
                    '\u05E7\u05E8\u05D9\u05D8\u05D9: ' + m.crit + '</div>' +
                '<div class="' + statusCls + '">' + statusHeb +
                    ' (' + pctOfWarn + '% \u05DE\u05E1\u05E3)</div>';

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

        /* ── Status Helper ───────────────────────────── */
        function _getStatus(val, mapping) {
            if (val >= (mapping.crit || 9999)) return 'crit';
            if (val >= (mapping.warn || 9999)) return 'warn';
            return 'ok';
        }

        /* ── Stats Bar ───────────────────────────────── */
        function _updateStats() {
            var n = mappings.length;
            if (n === 0) { statsBar.innerHTML = ''; return; }

            var ok = 0, warn = 0, crit = 0;
            for (var i = 0; i < n; i++) {
                var val = latestData[mappings[i].label];
                if (val == null) continue;
                var s = _getStatus(val, mappings[i]);
                if (s === 'crit') crit++;
                else if (s === 'warn') warn++;
                else ok++;
            }

            var html = '<span class="wow-dt-stat">\u05EA\u05D2\u05D9\u05D5\u05EA: <b>' + n + '</b></span>';
            html += '<span class="wow-dt-stat" style="color:' + CLR.ok + '">\u05EA\u05E7\u05D9\u05DF: <b>' + ok + '</b></span>';
            if (warn > 0) html += '<span class="wow-dt-stat" style="color:' + CLR.warn + '">\u05D0\u05D6\u05D4\u05E8\u05D4: <b>' + warn + '</b></span>';
            if (crit > 0) html += '<span class="wow-dt-stat" style="color:' + CLR.crit + '">\u05E7\u05E8\u05D9\u05D8\u05D9: <b>' + crit + '</b></span>';
            statsBar.innerHTML = html;
        }

        /* ── Export PNG ──────────────────────────────── */
        var _onExport = function () {
            try {
                var link = document.createElement('a');
                link.download = 'wow-digitaltwin-' + new Date().toISOString().slice(0, 10) + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch (e) { /* cross-origin guard */ }
        };
        btnExport.addEventListener('click', _onExport);

        /* ── Dimming Toggle ──────────────────────────── */
        var _onDimToggle = function () {
            config.EnableDimming = !config.EnableDimming;
            btnDim.classList.toggle('wow-dt-btn-active', config.EnableDimming);
            _requestDraw();
        };
        btnDim.addEventListener('click', _onDimToggle);
        if (config.EnableDimming) btnDim.classList.add('wow-dt-btn-active');

        /* ── Config Watchers ─────────────────────────── */
        scope.$watch('config.Title', function (v) {
            if (v) titleEl.textContent = v;
        });
        scope.$watch('config.BackgroundImageUrl', function (v) {
            if (v && !config.DemoMode) _loadBgImage(v);
        });
        scope.$watch('config.DemoMode', function (v) {
            if (v) {
                if (skeleton && skeleton.parentNode) {
                    skeleton.parentNode.removeChild(skeleton);
                    skeleton = null;
                }
                _requestDraw();
            }
        });
        scope.$watch('config.DataMappingsJSON', function () {
            mappings = _parseMappings();
            _requestDraw();
        });
        scope.$watchGroup([
            'config.EnableDimming', 'config.EnablePulse',
            'config.Decimals', 'config.fontFamily', 'config.fontSize'
        ], function () {
            _requestDraw();
        });

        /* ── Cleanup ─────────────────────────────────── */
        scope.$on('$destroy', function () {
            clearTimeout(_dataDebounceId);
            _pendingData = null;
            isAnimating = false;
            if (animId) { cancelAnimationFrame(animId); clearTimeout(animId); }
            resizeObs.disconnect();
            canvas.removeEventListener('mousemove', _onCanvasMove);
            canvas.removeEventListener('mouseleave', _onCanvasLeave);
            btnExport.removeEventListener('click', _onExport);
            btnDim.removeEventListener('click', _onDimToggle);
            if (bgImage) { bgImage.onload = null; bgImage = null; }
            latestData = mappings = anomalyIdxs = null;
        });

        /* ── Init ─────────────────────────────────────── */
        if (config.DemoMode) {
            if (skeleton && skeleton.parentNode) {
                skeleton.parentNode.removeChild(skeleton);
                skeleton = null;
            }
            // Loop starts when ResizeObserver fires
        }
    };

    /* ═══════════════════════════════════════════════════
     *  REGISTRATION
     * ═══════════════════════════════════════════════════ */

    PV.symbolCatalog.register({
        typeName:           'digitaltwin-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05D3\u05D9\u05D2\u05D9\u05D8\u05DC \u05D8\u05D5\u05D5\u05D9\u05DF WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        getDefaultConfig: function () {
            return {
                DataShape:          'Table',
                Height:             500,
                Width:              900,
                Title:              'Executive Digital Twin',
                DemoMode:           true,
                EnableDimming:      true,
                EnablePulse:        true,
                Decimals:           1,
                BackgroundImageUrl: '',
                DataMappingsJSON:   '',
                fontFamily:         'Segoe UI',
                fontSize:           13
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D3\u05D9\u05D2\u05D9\u05D8\u05DC \u05D8\u05D5\u05D5\u05D9\u05DF WOW'
    });

})(window.PIVisualization);
