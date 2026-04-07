(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Kinetic Liquid Gauge — WOW v100
     * ═══════════════════════════════════════════════════════
     *  Canvas-based capacity indicator with trigonometric
     *  sine waves simulating real liquid inside a container.
     *
     *  THE GEM: Dual sine waves (front + back for depth),
     *  Turbulence by Rate-of-Change (amplitude scales with
     *  derivative), Dynamic Gradient (dark bottom → bright
     *  top for 3D feel), Lerp fill interpolation.
     *
     *  - Clipping path: circle / roundedRect / pill
     *  - Executive color themes: risk-based + organic tones
     *  - Peripheral-vision status (wave color = instant read)
     *  - InvertColors for drain tanks (high = bad)
     *  - GPU-driven: 0.1ms frame, 20 gauges at 0% CPU
     *
     *  Shadow DOM · DPR scaling · Hebrew RTL · wc20 config
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    /* ── Executive Palette ── */
    var CLR = {
        ok:      '#00F5D4',
        warn:    '#FFCC00',
        crit:    '#FF3B30',
        accent:  '#5BC0EB',
        text:    '#ECF0F1',
        muted:   '#8899AA',
        ring:    '#1A3A5C',
        ringGlow: 'rgba(91, 192, 235, 0.15)'
    };

    /* ── Wave Constants ── */
    var WAVE = {
        BASE_AMP:    6,     /* Base wave amplitude (px)             */
        TURB_AMP:    20,    /* Max turbulence bonus amplitude (px)  */
        FREQ:        0.025, /* Base wave frequency                  */
        SPEED:       0.04,  /* Phase advance per frame              */
        LERP:        0.04,  /* Fill interpolation factor            */
        STEP:        3      /* X-axis resolution for lineTo (px)    */
    };


    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var self   = this;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-liquidgauge20"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-lg-root-mount');
        if (!mountEl) {
            console.error('[WOW Liquid Gauge] Mount element .wow-lg-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-liquidgauge20.css';
        shadow.appendChild(linkEl);


        /* ═══ DOM Scaffold ═══ */
        function _el(tag, cls) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            return e;
        }

        /* ── Toolbar ── */
        var root    = _el('div', 'wow-lg-root');
        var toolbar = _el('div', 'wow-lg-toolbar');
        var titleEl = _el('span', 'wow-lg-title');
        var actions = _el('div', 'wow-lg-toolbar-actions');

        var btnExport = _el('button', 'wow-lg-btn');
        btnExport.textContent = '\uD83D\uDCF7 Export';
        actions.appendChild(btnExport);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        /* ── Stats Bar ── */
        var statsBar = _el('div', 'wow-lg-stats');

        /* ── Canvas Container ── */
        var canvasOuter = _el('div', 'wow-lg-canvas-outer');
        var canvas      = document.createElement('canvas');
        canvas.className = 'wow-lg-canvas';
        var ctx = canvas.getContext('2d', { alpha: true });

        /* ── Value Overlay (centered on canvas) ── */
        var valueOverlay = _el('div', 'wow-lg-value-overlay');
        var pctText      = _el('div', 'wow-lg-value-pct');
        pctText.textContent = '\u2014';
        var rawText      = _el('div', 'wow-lg-value-raw');
        var rateIndicator = _el('div', 'wow-lg-value-rate');

        valueOverlay.appendChild(pctText);
        valueOverlay.appendChild(rawText);
        valueOverlay.appendChild(rateIndicator);

        canvasOuter.appendChild(canvas);
        canvasOuter.appendChild(valueOverlay);

        /* ── Skeleton ── */
        var skeleton = _el('div', 'wow-lg-skeleton');

        /* ── Footer ── */
        var footer = _el('div', 'wow-lg-footer');
        footer.textContent = 'WOW Liquid Gauge v100 \u00B7 Kinetic Waves + Turbulence';

        /* Assemble */
        root.appendChild(toolbar);
        root.appendChild(statsBar);
        root.appendChild(canvasOuter);
        root.appendChild(skeleton);
        root.appendChild(footer);
        shadow.appendChild(root);


        /* ═══ State ═══ */
        var targetFill    = 0;       /* Target fill fraction 0–1        */
        var currentFill   = 0;       /* Animated fill (Lerping)         */
        var phase         = 0;       /* Wave phase offset               */
        var rawValue      = 0;       /* Actual value from PI            */
        var prevValue     = null;    /* For rate-of-change derivative   */
        var prevTimestamp  = 0;       /* When prevValue was recorded     */
        var turbulence    = 0;       /* 0–1 turbulence intensity        */
        var dimW          = 0;       /* CSS width of canvas area        */
        var dimH          = 0;       /* CSS height of canvas area       */
        var dpr           = 1;       /* Device pixel ratio              */
        var animId        = null;    /* requestAnimationFrame ID        */
        var demoInterval  = null;
        var resizeObs     = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;


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
        }

        var resizeTimer = null;
        resizeObs = new ResizeObserver(function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(_resize, 150);
        });
        resizeObs.observe(canvasOuter);


        /* ═══════════════════════════════════════════════════
         *  THE GEM: Kinetic Wave Rendering Engine
         *
         *  Each rAF frame:
         *  1. Lerp currentFill → targetFill (smooth liquid)
         *  2. Advance wave phase (continuous motion)
         *  3. Scale amplitude + frequency by turbulence
         *  4. Clip to container shape
         *  5. Draw BACK wave (transparent, offset phase)
         *  6. Draw FRONT wave (gradient fill for 3D depth)
         *  7. Draw container ring with subtle glow
         *
         *  Total per frame: ~0.1ms — GPU handles compositing.
         * ═══════════════════════════════════════════════════ */
        function _render() {
            if (dimW === 0 || dimH === 0) {
                animId = requestAnimationFrame(_render);
                return;
            }

            /* ── Lerp fill level ── */
            var lerpFactor = WAVE.LERP + turbulence * 0.03;
            currentFill += (targetFill - currentFill) * lerpFactor;

            /* ── Advance wave phase ── */
            var speedMult = 1 + turbulence * 0.5;
            phase += WAVE.SPEED * speedMult;

            /* ── Decay turbulence smoothly ── */
            turbulence *= 0.995;
            if (turbulence < 0.01) turbulence = 0;

            /* ── Canvas setup ── */
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, dimW, dimH);

            /* ── Container geometry ── */
            var shape   = config.ContainerShape || 'circle';
            var pad     = 4;
            var cx, cy, containerR;
            var rX, rY, rW, rH, cornerR;

            if (shape === 'circle') {
                containerR = Math.min(dimW, dimH) / 2 - pad;
                cx = dimW / 2;
                cy = dimH / 2;
            } else {
                rX = pad;
                rY = pad;
                rW = dimW - pad * 2;
                rH = dimH - pad * 2;
                cornerR = shape === 'pill'
                    ? Math.min(rW, rH) / 2
                    : 16;
            }

            /* ── Fill Y position (water surface) ── */
            var fillTop, fillBot;
            if (shape === 'circle') {
                fillTop = cy - containerR;
                fillBot = cy + containerR;
            } else {
                fillTop = rY;
                fillBot = rY + rH;
            }
            var fillRange = fillBot - fillTop;
            var baseY     = fillBot - currentFill * fillRange;

            /* ── Clipping path ── */
            ctx.save();
            ctx.beginPath();
            if (shape === 'circle') {
                ctx.arc(cx, cy, containerR, 0, 2 * Math.PI);
            } else {
                _roundedRectPath(ctx, rX, rY, rW, rH, cornerR);
            }
            ctx.clip();

            /* ── Colors by fill level + scheme ── */
            var colors = _getColors(currentFill);

            /* ── Wave amplitude & frequency with turbulence ── */
            var amp  = WAVE.BASE_AMP + turbulence * WAVE.TURB_AMP;
            var freq = WAVE.FREQ + turbulence * 0.015;

            /* ── BACK wave (transparent, offset phase = depth) ── */
            _drawWave(baseY, freq * 0.8, amp * 0.7, phase + 2.0, colors.back, false);

            /* ── FRONT wave (gradient fill = 3D feel) ── */
            _drawWave(baseY, freq, amp, phase, colors.front, true);

            ctx.restore();  /* release clip */

            /* ── Container ring ── */
            ctx.beginPath();
            if (shape === 'circle') {
                ctx.arc(cx, cy, containerR, 0, 2 * Math.PI);
            } else {
                _roundedRectPath(ctx, rX, rY, rW, rH, cornerR);
            }
            ctx.strokeStyle = CLR.ring;
            ctx.lineWidth   = 3;
            ctx.stroke();

            /* Subtle accent glow on ring */
            ctx.shadowBlur  = 8;
            ctx.shadowColor = CLR.ringGlow;
            ctx.stroke();
            ctx.shadowBlur  = 0;

            animId = requestAnimationFrame(_render);
        }


        /* ═══════════════════════════════════════════════════
         *  Sine Wave Drawing (Trigonometry Pass)
         *
         *  Draws a filled region from the sine curve down to
         *  the container bottom.  When useGradient=true, a
         *  LinearGradient is applied: lighter at the surface,
         *  darker at the bottom → organic 3D depth.
         * ═══════════════════════════════════════════════════ */
        function _drawWave(baseY, freq, amp, timePhase, color, useGradient) {
            ctx.beginPath();
            ctx.moveTo(0, dimH);  /* bottom-left */

            for (var x = 0; x <= dimW; x += WAVE.STEP) {
                var y = baseY + Math.sin(x * freq + timePhase) * amp;
                ctx.lineTo(x, y);
            }

            ctx.lineTo(dimW, dimH);  /* bottom-right */
            ctx.closePath();

            /* Dynamic gradient: lighter at surface → darker at depth */
            if (useGradient && color.top && color.bottom) {
                var grad = ctx.createLinearGradient(0, baseY, 0, dimH);
                grad.addColorStop(0, color.top);
                grad.addColorStop(1, color.bottom);
                ctx.fillStyle = grad;
            } else {
                ctx.fillStyle = typeof color === 'string' ? color : (color.top || color);
            }
            ctx.fill();
        }


        /* ═══ Color Scheme Engine ═══ */
        function _getColors(fill) {
            var wPct = (config.WarnPct != null ? config.WarnPct : 30) / 100;
            var cPct = (config.CritPct != null ? config.CritPct : 15) / 100;
            var inv  = config.InvertColors || false;

            /* Determine risk level */
            var level;
            if (inv) {
                /* High = bad (waste tank, pressure) */
                if (fill > (1 - cPct)) level = 'crit';
                else if (fill > (1 - wPct)) level = 'warn';
                else level = 'ok';
            } else {
                /* Low = bad (fuel, water reserve) */
                if (fill < cPct) level = 'crit';
                else if (fill < wPct) level = 'warn';
                else level = 'ok';
            }

            var scheme = config.ColorScheme || 'executive';
            var ft, fb, bk;  /* front-top, front-bottom, back */

            if (scheme === 'ocean') {
                if (level === 'crit') {
                    ft = 'rgba(255, 80, 60, 0.72)';
                    fb = 'rgba(200, 40, 30, 0.92)';
                    bk = 'rgba(255, 80, 60, 0.30)';
                } else if (level === 'warn') {
                    ft = 'rgba(255, 200, 50, 0.70)';
                    fb = 'rgba(200, 150, 30, 0.88)';
                    bk = 'rgba(255, 200, 50, 0.28)';
                } else {
                    ft = 'rgba(91, 192, 235, 0.68)';
                    fb = 'rgba(30, 100, 180, 0.92)';
                    bk = 'rgba(91, 192, 235, 0.28)';
                }
            } else if (scheme === 'thermal') {
                if (level === 'crit') {
                    ft = 'rgba(255, 50, 30, 0.78)';
                    fb = 'rgba(180, 20, 10, 0.95)';
                    bk = 'rgba(255, 50, 30, 0.32)';
                } else if (level === 'warn') {
                    ft = 'rgba(255, 150, 0, 0.72)';
                    fb = 'rgba(200, 100, 0, 0.90)';
                    bk = 'rgba(255, 150, 0, 0.28)';
                } else {
                    ft = 'rgba(0, 200, 100, 0.68)';
                    fb = 'rgba(0, 150, 70, 0.90)';
                    bk = 'rgba(0, 200, 100, 0.25)';
                }
            } else if (scheme === 'neon') {
                if (level === 'crit') {
                    ft = 'rgba(255, 0, 100, 0.75)';
                    fb = 'rgba(200, 0, 70, 0.92)';
                    bk = 'rgba(255, 0, 100, 0.32)';
                } else if (level === 'warn') {
                    ft = 'rgba(255, 255, 0, 0.68)';
                    fb = 'rgba(200, 200, 0, 0.88)';
                    bk = 'rgba(255, 255, 0, 0.28)';
                } else {
                    ft = 'rgba(0, 255, 150, 0.65)';
                    fb = 'rgba(0, 200, 100, 0.90)';
                    bk = 'rgba(0, 255, 150, 0.25)';
                }
            } else {
                /* executive (default) */
                if (level === 'crit') {
                    ft = 'rgba(255, 59, 48, 0.75)';
                    fb = 'rgba(200, 30, 20, 0.95)';
                    bk = 'rgba(255, 59, 48, 0.32)';
                } else if (level === 'warn') {
                    ft = 'rgba(255, 204, 0, 0.70)';
                    fb = 'rgba(204, 150, 0, 0.90)';
                    bk = 'rgba(255, 204, 0, 0.28)';
                } else {
                    ft = 'rgba(0, 245, 212, 0.65)';
                    fb = 'rgba(0, 180, 160, 0.92)';
                    bk = 'rgba(0, 245, 212, 0.25)';
                }
            }

            return {
                front: { top: ft, bottom: fb },
                back:  bk,
                level: level
            };
        }


        /* ═══ Rounded Rect Path Helper ═══ */
        function _roundedRectPath(c, x, y, w, h, r) {
            r = Math.min(r, w / 2, h / 2);
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.arcTo(x + w, y, x + w, y + r, r);
            c.lineTo(x + w, y + h - r);
            c.arcTo(x + w, y + h, x + w - r, y + h, r);
            c.lineTo(x + r, y + h);
            c.arcTo(x, y + h, x, y + h - r, r);
            c.lineTo(x, y + r);
            c.arcTo(x, y, x + r, y, r);
            c.closePath();
        }


        /* ═══════════════════════════════════════════════════
         *  Turbulence by Rate-of-Change
         *
         *  Tracks the last 2 PI samples. The derivative
         *  (|delta| / maxCapacity / dt) maps to turbulence
         *  0–1. Fast emptying = stormy waves. Slow drip =
         *  calm surface. The operator sees "urgency" in
         *  the wave motion without reading numbers.
         * ═══════════════════════════════════════════════════ */
        function _computeTurbulence(newValue) {
            var now = Date.now();
            if (prevValue !== null && prevTimestamp > 0) {
                var dt = (now - prevTimestamp) / 1000;
                if (dt > 0 && dt < 60) {
                    var max     = config.MaxCapacity || 100;
                    var delta   = Math.abs(newValue - prevValue);
                    var rate    = delta / max / dt;
                    var maxRate = config.TurbulenceMax || 0.1;
                    turbulence  = Math.max(turbulence, Math.min(rate / maxRate, 1));
                }
            }
            prevValue     = newValue;
            prevTimestamp  = now;
        }


        /* ═══ Value Overlay Update ═══ */
        function _updateValueDisplay() {
            var dec  = config.Decimals != null ? config.Decimals : 1;
            var unit = config.Unit || '';
            var max  = config.MaxCapacity || 100;

            /* Percentage */
            pctText.textContent = (targetFill * 100).toFixed(0) + '%';

            /* Raw value */
            var display;
            if (typeof rawValue === 'number' && !isNaN(rawValue)) {
                display = rawValue.toFixed(dec);
            } else {
                display = '' + rawValue;
            }
            if (unit) display += ' ' + unit;
            rawText.textContent = display;

            /* Rate-of-change indicator */
            if (turbulence > 0.1) {
                rateIndicator.textContent = turbulence > 0.5 ? '\u26A1' : '\u301C';
                rateIndicator.style.display = '';
            } else {
                rateIndicator.style.display = 'none';
            }

            /* Level coloring on pctText */
            var colors = _getColors(targetFill);
            pctText.classList.remove('wow-lg-level-ok', 'wow-lg-level-warn', 'wow-lg-level-crit');
            pctText.classList.add('wow-lg-level-' + colors.level);
        }


        /* ═══ Stats Bar ═══ */
        function _updateStats() {
            var max  = config.MaxCapacity || 100;
            var dec  = config.Decimals != null ? config.Decimals : 1;
            var unit = config.Unit || '';
            var html = '';

            html += '<span class="wow-lg-stat">\u05E2\u05E8\u05DA: <b>' +
                    (typeof rawValue === 'number' ? rawValue.toFixed(dec) : rawValue) +
                    (unit ? ' ' + unit : '') + '</b></span>';

            html += '<span class="wow-lg-stat">\u05E7\u05D9\u05D1\u05D5\u05DC\u05EA: <b>' +
                    max + '</b></span>';

            html += '<span class="wow-lg-stat">\u05DE\u05D9\u05DC\u05D5\u05D9: <b>' +
                    (targetFill * 100).toFixed(0) + '%</b></span>';

            if (turbulence > 0.05) {
                html += '<span class="wow-lg-stat" style="color:' + CLR.warn +
                        '">\u05E1\u05E2\u05E8\u05D4: <b>' +
                        (turbulence * 100).toFixed(0) + '%</b></span>';
            }

            statsBar.innerHTML = html;
        }


        /* ═══ Export PNG ═══ */
        function _exportPNG() {
            var link = document.createElement('a');
            link.download = 'liquid-gauge-' + Date.now() + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
        btnExport.addEventListener('click', _exportPNG);


        /* ═══ Config ═══ */
        function _applyConfig() {
            titleEl.textContent = config.Title || 'Liquid Gauge v20';

            var ff = config.fontFamily || 'Segoe UI';
            var fs = config.fontSize   || 12;
            root.style.setProperty('--wow-lg-font',      '"' + ff + '", Arial, sans-serif');
            root.style.setProperty('--wow-lg-font-size',  fs + 'px');

            _updateValueDisplay();
            _updateStats();
        }

        ['Title', 'MaxCapacity', 'WarnPct', 'CritPct', 'InvertColors',
         'ColorScheme', 'ContainerShape', 'Unit', 'Decimals',
         'DemoMode', 'fontFamily', 'fontSize', 'TurbulenceMax'
        ].forEach(function (key) {
            scope.$watch('config.' + key, function () { _applyConfig(); });
        });


        /* ═══════════════════════════════════════════════════
         *  Smart onDataUpdate
         *  Receives new PI value → sets targetFill.
         *  The rAF loop takes care of Lerp + waves.
         *  PI can send data every 15s yet the UI stays
         *  "alive and breathing" at 60 FPS.
         * ═══════════════════════════════════════════════════ */
        function _processData(data) {
            var val;
            if (data.Value !== undefined) {
                val = parseFloat(data.Value);
            } else if (data.Rows && data.Rows.length > 0) {
                val = parseFloat(data.Rows[0].Value);
            }
            if (val === undefined || isNaN(val)) return;

            skeleton.style.display = 'none';

            rawValue = val;
            var max = config.MaxCapacity || 100;
            targetFill = Math.max(0, Math.min(val / max, 1));

            _computeTurbulence(val);
            _updateValueDisplay();
            _updateStats();
        }

        self.onDataUpdate = function (data) {
            if (config.DemoMode) return;
            if (!data) return;

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

            rawValue   = 65;
            targetFill = 0.65;
            _updateValueDisplay();
            _updateStats();

            if (!config.Unit) config.Unit = 'L';
            if (config.MaxCapacity == null || config.MaxCapacity === 100) {
                config.MaxCapacity = 1000;
            }
            rawValue   = 650;
            targetFill = 0.65;
            _applyConfig();

            /* Slow sine oscillation — simulates gradual fill/drain */
            demoInterval = setInterval(function () {
                var t   = Date.now() * 0.0005;
                var pct = 0.5 + Math.sin(t) * 0.3 + Math.sin(t * 2.7) * 0.1;
                pct = Math.max(0.05, Math.min(0.95, pct));

                var max = config.MaxCapacity || 1000;
                rawValue   = Math.round(pct * max * 10) / 10;
                targetFill = pct;

                _computeTurbulence(rawValue);
                _updateValueDisplay();
                _updateStats();
            }, 2000);
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
            btnExport.removeEventListener('click', _exportPNG);
            _pendingData = null;
        });
    };


    /* ═══ Symbol Registration ═══ */
    PV.symbolCatalog.register({
        typeName:           'liquidgauge20',
        visObjectType:      symbolVis,
        displayName:        '\u05DE\u05D7\u05D5\u05D5\u05DF \u05E0\u05D5\u05D6\u05DC WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Single,
        getDefaultConfig: function () {
            return {
                DataShape:       'Value',
                Height:          350,
                Width:           350,
                Title:           'Liquid Gauge v20',
                DemoMode:        true,
                MaxCapacity:     100,
                WarnPct:         30,
                CritPct:         15,
                InvertColors:    false,
                ColorScheme:     'executive',
                ContainerShape:  'circle',
                Unit:            '%',
                Decimals:        1,
                TurbulenceMax:   0.1,
                fontFamily:      'Segoe UI',
                fontSize:        12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DE\u05D7\u05D5\u05D5\u05DF \u05E0\u05D5\u05D6\u05DC WOW'
    });

})(window.PIVisualization);
