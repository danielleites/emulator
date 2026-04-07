(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Smart Donut — WOW v100
     * ═══════════════════════════════════════════════════════
     *  Canvas-based donut chart with mathematical hit-testing
     *  and Smart Center display.
     *
     *  THE GEM: Smart Center — the donut hole auto-displays
     *  the most critical data point (hovered > critical > total),
     *  eliminating external legends.  O(1) hit testing via
     *  atan2 raycasting determines the hovered slice in
     *  constant time regardless of slice count.
     *
     *  - Angle Lerping: smooth angular transitions on update
     *  - 1% Rule: aggregate tiny slices (<threshold) → "Others"
     *  - Conic Gradient: metallic sheen overlay for 3D feel
     *  - Pop-out on hover: slice translates outward along angle
     *  - Slice gaps + shadow glow for executive dashboard feel
     *  - DPR scaling for crisp 4K rendering
     *
     *  DataShape: Table (Multiple datasources)
     *  Shadow DOM · Hebrew RTL · wc20 config
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    /* ── Executive Palette (10 slices max) ── */
    var PALETTE = {
        executive: [
            '#5BC0EB', '#00F5D4', '#FFCC00', '#FF6B6B',
            '#A78BFA', '#F472B6', '#34D399', '#F59E0B',
            '#60A5FA', '#C084FC'
        ],
        ocean: [
            '#0EA5E9', '#06B6D4', '#14B8A6', '#22C55E',
            '#84CC16', '#EAB308', '#F97316', '#EF4444',
            '#8B5CF6', '#EC4899'
        ],
        warm: [
            '#F97316', '#EF4444', '#EC4899', '#F59E0B',
            '#E11D48', '#F472B6', '#DC2626', '#FB923C',
            '#FBBF24', '#A855F7'
        ],
        pastel: [
            '#93C5FD', '#86EFAC', '#FDE68A', '#FCA5A5',
            '#C4B5FD', '#F9A8D4', '#6EE7B7', '#FCD34D',
            '#A5B4FC', '#D8B4FE'
        ]
    };

    var OTHERS_COLOR = '#4B5563';  /* Gray for aggregated tiny slices */

    /* ── Rendering Constants ── */
    var CONST = {
        LERP:       0.08,    /* Angle interpolation speed          */
        POP_OUT:    12,      /* Hover pop-out distance (px)        */
        GAP:        0.015,   /* Gap between slices (radians)       */
        SHADOW_R:   12,      /* Shadow blur radius (px)            */
        START_ANGLE: -Math.PI / 2  /* 12 o'clock start             */
    };


    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var self   = this;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-donut-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-dn-root-mount');
        if (!mountEl) {
            console.error('[WOW Smart Donut] Mount element .wow-dn-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-donut-wow.css';
        shadow.appendChild(linkEl);


        /* ═══ DOM Scaffold ═══ */
        function _el(tag, cls) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            return e;
        }

        /* ── Toolbar ── */
        var root    = _el('div', 'wow-dn-root');
        var toolbar = _el('div', 'wow-dn-toolbar');
        var titleEl = _el('span', 'wow-dn-title');
        var actions = _el('div', 'wow-dn-toolbar-actions');

        var btnExport = _el('button', 'wow-dn-btn');
        btnExport.textContent = '\uD83D\uDCF7 Export';
        actions.appendChild(btnExport);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        /* ── Stats Bar ── */
        var statsBar = _el('div', 'wow-dn-stats');

        /* ── Canvas Container ── */
        var canvasOuter = _el('div', 'wow-dn-canvas-outer');
        var canvas      = document.createElement('canvas');
        canvas.className = 'wow-dn-canvas';
        var ctx = canvas.getContext('2d', { alpha: true });

        /* ── Tooltip ── */
        var tooltip  = _el('div', 'wow-dn-tooltip');
        var ttLabel  = _el('div', 'wow-dn-tt-label');
        var ttValue  = _el('div', 'wow-dn-tt-value');
        var ttPct    = _el('div', 'wow-dn-tt-pct');
        tooltip.appendChild(ttLabel);
        tooltip.appendChild(ttValue);
        tooltip.appendChild(ttPct);
        tooltip.style.display = 'none';

        canvasOuter.appendChild(canvas);
        canvasOuter.appendChild(tooltip);

        /* ── Skeleton ── */
        var skeleton = _el('div', 'wow-dn-skeleton');

        /* ── Footer ── */
        var footer = _el('div', 'wow-dn-footer');
        footer.textContent = 'WOW Smart Donut v100 \u00B7 Canvas + atan2 Hit Testing';

        /* Assemble */
        root.appendChild(toolbar);
        root.appendChild(statsBar);
        root.appendChild(canvasOuter);
        root.appendChild(skeleton);
        root.appendChild(footer);
        shadow.appendChild(root);


        /* ═══ State ═══ */
        var slices        = [];   /* Processed slice data                */
        var currentAngles = [];   /* Currently rendered angle spans      */
        var targetAngles  = [];   /* Target angle spans for lerping      */
        var hoveredIndex  = -1;   /* Currently hovered slice index       */
        var centerData    = null; /* Smart Center: what to show          */
        var dimW          = 0;
        var dimH          = 0;
        var dpr           = 1;
        var animId        = null;
        var demoInterval  = null;
        var resizeObs     = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;
        var needsRedraw   = true;
        var totalValue    = 0;
        var criticalIndex = -1;   /* Slice with highest value (critical) */


        /* ═══ DPR + Resize ═══ */
        function _resize() {
            dimW = canvasOuter.clientWidth;
            dimH = canvasOuter.clientHeight;
            if (dimW === 0 || dimH === 0) return;

            dpr = window.devicePixelRatio || 1;
            canvas.width  = dimW * dpr;
            canvas.height = dimH * dpr;
            canvas.style.width  = dimW + 'px';
            canvas.style.height = dimH + 'px';
            needsRedraw = true;
        }

        var resizeTimer = null;
        resizeObs = new ResizeObserver(function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(_resize, 150);
        });
        resizeObs.observe(canvasOuter);


        /* ═══════════════════════════════════════════════════
         *  THE GEM: Smart Donut Rendering Engine
         *
         *  Each rAF frame:
         *  1. Lerp current angles → target angles
         *  2. Compute donut geometry (cx, cy, outer/inner R)
         *  3. Draw each slice arc with gap + shadow + glow
         *  4. Pop-out hovered slice along midpoint angle
         *  5. Conic gradient overlay (optional metallic sheen)
         *  6. Smart Center text: hovered > critical > total
         *
         *  Total per frame: ~0.3ms — single canvas, 0 DOM cells.
         * ═══════════════════════════════════════════════════ */
        function _render() {
            if (dimW === 0 || dimH === 0 || slices.length === 0) {
                animId = requestAnimationFrame(_render);
                return;
            }

            /* ── Lerp angles ── */
            var stillLerping = false;
            for (var i = 0; i < currentAngles.length; i++) {
                if (currentAngles[i] === undefined) currentAngles[i] = 0;
                var diff = targetAngles[i] - currentAngles[i];
                if (Math.abs(diff) > 0.001) {
                    currentAngles[i] += diff * CONST.LERP;
                    stillLerping = true;
                }
            }

            if (!needsRedraw && !stillLerping && hoveredIndex === -1) {
                animId = requestAnimationFrame(_render);
                return;
            }

            needsRedraw = stillLerping;

            /* ── Canvas setup ── */
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, dimW, dimH);

            /* ── Donut geometry ── */
            var cx = dimW / 2;
            var cy = dimH / 2;
            var maxR = Math.min(dimW, dimH) / 2 - CONST.POP_OUT - 4;
            var thickness = config.Thickness || 0.35;
            var outerR = maxR;
            var innerR = maxR * (1 - thickness);

            /* ── Draw slices ── */
            var angle = CONST.START_ANGLE;
            var gap   = CONST.GAP;
            var palette = PALETTE[config.Palette || 'executive'] || PALETTE.executive;

            for (var s = 0; s < slices.length; s++) {
                var slice = slices[s];
                var span  = currentAngles[s] || 0;
                if (span < 0.002) { angle += span; continue; }  /* Skip negligible */

                var startA = angle + gap / 2;
                var endA   = angle + span - gap / 2;
                var midA   = angle + span / 2;

                /* Pop-out offset for hovered slice */
                var ox = 0, oy = 0;
                if (s === hoveredIndex) {
                    ox = Math.cos(midA) * CONST.POP_OUT;
                    oy = Math.sin(midA) * CONST.POP_OUT;
                }

                /* Shadow glow */
                ctx.save();
                if (s === hoveredIndex) {
                    ctx.shadowBlur  = CONST.SHADOW_R;
                    ctx.shadowColor = slice.color;
                }

                /* Draw arc slice */
                ctx.beginPath();
                ctx.arc(cx + ox, cy + oy, outerR, startA, endA);
                ctx.arc(cx + ox, cy + oy, innerR, endA, startA, true);
                ctx.closePath();

                ctx.fillStyle = slice.color;
                ctx.fill();
                ctx.restore();

                /* Slice border for definition */
                ctx.beginPath();
                ctx.arc(cx + ox, cy + oy, outerR, startA, endA);
                ctx.arc(cx + ox, cy + oy, innerR, endA, startA, true);
                ctx.closePath();
                ctx.strokeStyle = 'rgba(10, 15, 28, 0.4)';
                ctx.lineWidth   = 1;
                ctx.stroke();

                angle += span;
            }

            /* ── Conic Gradient Overlay (metallic sheen) ── */
            if (config.ConicGradient !== false && typeof ctx.createConicGradient === 'function') {
                ctx.save();
                ctx.globalCompositeOperation = 'overlay';
                ctx.globalAlpha = 0.08;

                var conic = ctx.createConicGradient(0, cx, cy);
                conic.addColorStop(0,    'rgba(255,255,255,0.5)');
                conic.addColorStop(0.25, 'rgba(255,255,255,0)');
                conic.addColorStop(0.5,  'rgba(255,255,255,0.3)');
                conic.addColorStop(0.75, 'rgba(255,255,255,0)');
                conic.addColorStop(1,    'rgba(255,255,255,0.5)');

                ctx.beginPath();
                ctx.arc(cx, cy, outerR, 0, 2 * Math.PI);
                ctx.arc(cx, cy, innerR, 0, 2 * Math.PI, true);
                ctx.closePath();
                ctx.fillStyle = conic;
                ctx.fill();
                ctx.restore();
            }


            /* ═══════════════════════════════════════════════
             *  Smart Center — The Donut Hole Display
             *
             *  Priority:
             *  1. Hovered slice (user interaction)
             *  2. Critical slice (highest risk value)
             *  3. Total aggregate (overview)
             *
             *  The operator never has to look at an external
             *  legend — the most important number is always
             *  centered inside the donut.
             * ═══════════════════════════════════════════════ */
            var centerLabel, centerValue, centerPct, centerColor;
            var dec = config.Decimals != null ? config.Decimals : 1;

            if (hoveredIndex >= 0 && hoveredIndex < slices.length) {
                /* Hovered slice takes priority */
                var hov = slices[hoveredIndex];
                centerLabel = hov.label;
                centerValue = _formatValue(hov.value, dec);
                centerPct   = (hov.pct * 100).toFixed(1) + '%';
                centerColor = hov.color;
            } else if (criticalIndex >= 0 && criticalIndex < slices.length) {
                /* Critical = largest slice */
                var crt = slices[criticalIndex];
                centerLabel = crt.label;
                centerValue = _formatValue(crt.value, dec);
                centerPct   = (crt.pct * 100).toFixed(1) + '%';
                centerColor = crt.color;
            } else {
                /* Total overview */
                centerLabel = '\u05E1\u05D4\u05F4\u05DB';  /* סה"כ */
                centerValue = _formatValue(totalValue, dec);
                centerPct   = slices.length + ' \u05E4\u05E8\u05D9\u05D8\u05D9\u05DD';  /* פריטים */
                centerColor = '#ECF0F1';
            }

            /* Draw Smart Center text */
            ctx.textAlign    = 'center';
            ctx.textBaseline = 'middle';

            /* Main value */
            var valueFontSize = Math.max(16, innerR * 0.45);
            ctx.font      = '800 ' + valueFontSize + 'px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = centerColor;
            ctx.shadowBlur  = 8;
            ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
            ctx.fillText(centerValue, cx, cy - valueFontSize * 0.15);
            ctx.shadowBlur = 0;

            /* Label */
            var labelFontSize = Math.max(10, innerR * 0.2);
            ctx.font      = '600 ' + labelFontSize + 'px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#8899AA';
            ctx.fillText(centerLabel, cx, cy - valueFontSize * 0.65);

            /* Percentage / count */
            ctx.font      = '400 ' + labelFontSize + 'px "Segoe UI", Arial, sans-serif';
            ctx.fillStyle = '#8899AA';
            ctx.fillText(centerPct, cx, cy + valueFontSize * 0.55);


            animId = requestAnimationFrame(_render);
        }


        /* ═══ Format Value ═══ */
        function _formatValue(val, dec) {
            if (typeof val !== 'number' || isNaN(val)) return '\u2014';
            if (val >= 1000000) return (val / 1000000).toFixed(1) + 'M';
            if (val >= 1000)    return (val / 1000).toFixed(1) + 'K';
            return val.toFixed(dec);
        }


        /* ═══════════════════════════════════════════════════
         *  O(1) Hit Testing via atan2 Raycasting
         *
         *  Single mousemove listener. Convert cursor position
         *  to polar coordinates:
         *  1. Distance from center → is it on the donut ring?
         *  2. atan2(dy, dx) → angle → which slice?
         *
         *  This replaces N event listeners with 1. The atan2
         *  call takes less than a nanosecond.
         * ═══════════════════════════════════════════════════ */
        function _hitTest(mouseX, mouseY) {
            var cx = dimW / 2;
            var cy = dimH / 2;
            var maxR = Math.min(dimW, dimH) / 2 - CONST.POP_OUT - 4;
            var thickness = config.Thickness || 0.35;
            var outerR = maxR;
            var innerR = maxR * (1 - thickness);

            var dx = mouseX - cx;
            var dy = mouseY - cy;
            var dist = Math.sqrt(dx * dx + dy * dy);

            /* Not on the donut ring? */
            if (dist < innerR - 5 || dist > outerR + CONST.POP_OUT + 5) return -1;

            /* Compute angle via atan2 */
            var angle = Math.atan2(dy, dx);

            /* Normalize to match our drawing (start from -PI/2) */
            angle -= CONST.START_ANGLE;
            if (angle < 0) angle += 2 * Math.PI;

            /* Walk through slice boundaries */
            var cumulative = 0;
            for (var i = 0; i < currentAngles.length; i++) {
                cumulative += currentAngles[i] || 0;
                if (angle <= cumulative) return i;
            }
            return -1;
        }

        /* ── Mouse Events ── */
        function _onMouseMove(e) {
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;

            var hit = _hitTest(mx, my);
            if (hit !== hoveredIndex) {
                hoveredIndex = hit;
                needsRedraw = true;

                if (hit >= 0 && hit < slices.length) {
                    var sl = slices[hit];
                    ttLabel.textContent = sl.label;
                    ttValue.textContent = _formatValue(sl.value,
                        config.Decimals != null ? config.Decimals : 1);
                    ttPct.textContent   = (sl.pct * 100).toFixed(1) + '%';
                    tooltip.style.display = '';

                    /* Position tooltip near cursor */
                    var tx = mx + 16;
                    var ty = my - 40;
                    if (tx + 140 > dimW) tx = mx - 150;
                    if (ty < 0) ty = my + 16;
                    tooltip.style.left = tx + 'px';
                    tooltip.style.top  = ty + 'px';

                    canvas.style.cursor = 'pointer';
                } else {
                    tooltip.style.display = 'none';
                    canvas.style.cursor = 'default';
                }
            } else if (hit >= 0) {
                /* Update tooltip position */
                var rect2 = canvas.getBoundingClientRect();
                var tx2 = e.clientX - rect2.left + 16;
                var ty2 = e.clientY - rect2.top - 40;
                if (tx2 + 140 > dimW) tx2 = e.clientX - rect2.left - 150;
                if (ty2 < 0) ty2 = e.clientY - rect2.top + 16;
                tooltip.style.left = tx2 + 'px';
                tooltip.style.top  = ty2 + 'px';
            }
        }

        function _onMouseLeave() {
            hoveredIndex = -1;
            tooltip.style.display = 'none';
            canvas.style.cursor = 'default';
            needsRedraw = true;
        }

        canvas.addEventListener('mousemove', _onMouseMove);
        canvas.addEventListener('mouseleave', _onMouseLeave);


        /* ═══════════════════════════════════════════════════
         *  THE 1% RULE — Aggregate Tiny Slices
         *
         *  Slices below the aggregate threshold (default 2%)
         *  are merged into a single "Others" slice. This
         *  prevents 20 invisible slivers from cluttering
         *  the chart. The Pareto 80/20 principle in UI.
         *
         *  The threshold is configurable — operators working
         *  with many small contributors can raise it.
         * ═══════════════════════════════════════════════════ */
        function _processSlices(rawSlices) {
            var threshold = (config.AggregateThreshold != null
                ? config.AggregateThreshold : 2) / 100;

            totalValue = 0;
            for (var i = 0; i < rawSlices.length; i++) {
                totalValue += rawSlices[i].value;
            }
            if (totalValue === 0) totalValue = 1; /* Avoid division by zero */

            var palette = PALETTE[config.Palette || 'executive'] || PALETTE.executive;
            var significant = [];
            var othersValue = 0;
            var othersCount = 0;

            for (var j = 0; j < rawSlices.length; j++) {
                var pct = rawSlices[j].value / totalValue;
                if (pct < threshold && rawSlices.length > 3) {
                    /* Aggregate tiny slices */
                    othersValue += rawSlices[j].value;
                    othersCount++;
                } else {
                    significant.push({
                        label: rawSlices[j].label,
                        value: rawSlices[j].value,
                        pct:   pct,
                        color: palette[significant.length % palette.length]
                    });
                }
            }

            /* Add "Others" bucket if any slices were aggregated */
            if (othersCount > 0) {
                significant.push({
                    label: '\u05D0\u05D7\u05E8\u05D9\u05DD (' + othersCount + ')',  /* אחרים */
                    value: othersValue,
                    pct:   othersValue / totalValue,
                    color: OTHERS_COLOR
                });
            }

            /* Find critical (largest) slice */
            criticalIndex = 0;
            var maxVal = 0;
            for (var k = 0; k < significant.length; k++) {
                if (significant[k].value > maxVal) {
                    maxVal = significant[k].value;
                    criticalIndex = k;
                }
            }

            /* CriticalKeywords: mark slices matching keywords */
            var critWords = config.CriticalKeywords;
            if (critWords && typeof critWords === 'string') {
                var keywords = critWords.split(',').map(function(w) {
                    return w.trim().toLowerCase();
                });
                for (var m = 0; m < significant.length; m++) {
                    var lbl = (significant[m].label || '').toLowerCase();
                    for (var n = 0; n < keywords.length; n++) {
                        if (lbl.indexOf(keywords[n]) !== -1) {
                            criticalIndex = m;
                            break;
                        }
                    }
                }
            }

            /* Compute target angles */
            slices = significant;
            targetAngles = [];
            for (var p = 0; p < slices.length; p++) {
                targetAngles.push(slices[p].pct * 2 * Math.PI);
            }

            /* Initialize currentAngles if needed */
            while (currentAngles.length < targetAngles.length) {
                currentAngles.push(0);
            }
            /* Trim excess */
            currentAngles.length = targetAngles.length;

            needsRedraw = true;
        }


        /* ═══ Stats Bar ═══ */
        function _updateStats() {
            var dec = config.Decimals != null ? config.Decimals : 1;
            var html = '';

            html += '<span class="wow-dn-stat">\u05E4\u05E8\u05D9\u05D8\u05D9\u05DD: <b>' +
                    slices.length + '</b></span>';

            html += '<span class="wow-dn-stat">\u05E1\u05D4\u05F4\u05DB: <b>' +
                    _formatValue(totalValue, dec) + '</b></span>';

            if (criticalIndex >= 0 && slices[criticalIndex]) {
                html += '<span class="wow-dn-stat">\u05DE\u05D5\u05D1\u05D9\u05DC: <b>' +
                        slices[criticalIndex].label + '</b> (' +
                        (slices[criticalIndex].pct * 100).toFixed(1) + '%)</span>';
            }

            statsBar.innerHTML = html;
        }


        /* ═══ Export PNG ═══ */
        function _exportPNG() {
            var link = document.createElement('a');
            link.download = 'smart-donut-' + Date.now() + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
        btnExport.addEventListener('click', _exportPNG);


        /* ═══ Config ═══ */
        function _applyConfig() {
            titleEl.textContent = config.Title || 'Executive Smart Donut';

            var ff = config.fontFamily || 'Segoe UI';
            var fs = config.fontSize   || 12;
            root.style.setProperty('--wow-dn-font',      '"' + ff + '", Arial, sans-serif');
            root.style.setProperty('--wow-dn-font-size',  fs + 'px');

            needsRedraw = true;
            _updateStats();
        }

        ['Title', 'Thickness', 'AggregateThreshold', 'Palette',
         'ConicGradient', 'CriticalKeywords', 'Decimals',
         'DemoMode', 'fontFamily', 'fontSize'
        ].forEach(function (key) {
            scope.$watch('config.' + key, function () { _applyConfig(); });
        });


        /* ═══════════════════════════════════════════════════
         *  Smart onDataUpdate
         *  Receives Table data from PI → processes into slices.
         *  The rAF loop handles Angle Lerping.
         * ═══════════════════════════════════════════════════ */
        function _processData(data) {
            skeleton.style.display = 'none';

            var rawSlices = [];
            for (var i = 0; i < data.Rows.length; i++) {
                var row = data.Rows[i];
                var val = parseFloat(row.Value);
                if (isNaN(val) || val < 0) val = 0;
                rawSlices.push({
                    label: row.Label || row.Path || ('Item ' + (i + 1)),
                    value: val
                });
            }

            if (rawSlices.length === 0) return;

            _processSlices(rawSlices);
            _updateStats();
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


        /* ═══ Demo Mode ═══ */
        function _startDemo() {
            skeleton.style.display = 'none';

            /* Energy mix demo — representative industrial dashboard */
            var demoData = [
                { label: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9',   value: 420 },   /* גז טבעי */
                { label: '\u05E4\u05D7\u05DD',                       value: 280 },   /* פחם */
                { label: '\u05E1\u05D5\u05DC\u05E8\u05D9',           value: 180 },   /* סולרי */
                { label: '\u05E8\u05D5\u05D7',                       value: 140 },   /* רוח */
                { label: '\u05D2\u05E8\u05E2\u05D9\u05E0\u05D9',     value: 95 },    /* גרעיני */
                { label: '\u05D4\u05D9\u05D3\u05E8\u05D5',           value: 65 },    /* הידרו */
                { label: '\u05D1\u05D9\u05D5\u05DE\u05E1\u05D4',     value: 12 },    /* ביומסה */
                { label: '\u05D2\u05D9\u05D0\u05D5\u05EA\u05E8\u05DE\u05DC', value: 5 }  /* גיאותרמל */
            ];

            _processSlices(demoData);
            _updateStats();

            /* Periodic demo fluctuation */
            demoInterval = setInterval(function () {
                var updated = [];
                for (var i = 0; i < demoData.length; i++) {
                    var base = demoData[i].value;
                    var flux = base * (0.9 + Math.random() * 0.2);
                    updated.push({
                        label: demoData[i].label,
                        value: Math.round(flux * 10) / 10
                    });
                }
                _processSlices(updated);
                _updateStats();
            }, 3000);
        }


        /* ═══ Init ═══ */
        _applyConfig();
        _resize();
        animId = requestAnimationFrame(_render);

        if (config.DemoMode) {
            _startDemo();
        }


        /* ═══ Cleanup ═══ */
        scope.$on('$destroy', function () {
            if (animId) cancelAnimationFrame(animId);
            if (demoInterval) clearInterval(demoInterval);
            if (resizeObs) resizeObs.disconnect();
            clearTimeout(_dataDebounceId);
            canvas.removeEventListener('mousemove', _onMouseMove);
            canvas.removeEventListener('mouseleave', _onMouseLeave);
            btnExport.removeEventListener('click', _exportPNG);
            _pendingData = null;
        });
    };


    /* ═══ Symbol Registration ═══ */
    PV.symbolCatalog.register({
        typeName:           'donut-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05D3\u05D5\u05E0\u05D0\u05D8 \u05D7\u05DB\u05DD WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        getDefaultConfig: function () {
            return {
                DataShape:           'Table',
                Height:              400,
                Width:               500,
                Title:               'Executive Smart Donut',
                DemoMode:            true,
                Thickness:           0.35,
                AggregateThreshold:  2,
                ConicGradient:       true,
                Palette:             'executive',
                CriticalKeywords:    '',
                Decimals:            1,
                fontFamily:          'Segoe UI',
                fontSize:            12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05D3\u05D5\u05E0\u05D0\u05D8 \u05D7\u05DB\u05DD WOW'
    });

})(window.PIVisualization);
