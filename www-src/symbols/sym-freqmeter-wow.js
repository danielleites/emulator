(function (PV) {
    'use strict';

    /* ═══════════════════════════════════════════════════════
     *  Executive Resonance Frequency Meter — WOW v100
     * ═══════════════════════════════════════════════════════
     *  Live oscilloscope that translates grid frequency
     *  deviation into a physical sine wave visualization.
     *
     *  THE GEM: Resonance Oscilloscope — instead of a dead
     *  number or a jumping needle, the operator sees a live
     *  sine wave whose behavior mirrors the grid's health.
     *  Calm green wave = stable grid. Violent red jittery
     *  wave = danger. Instinctive understanding in <0.5s.
     *
     *  - CRT Phosphor Effect: semi-transparent overlay per
     *    frame creates classic oscilloscope persistence trail
     *  - Tension Lerping: displayed value + wave parameters
     *    smoothly interpolate toward the real value
     *  - Dynamic Jitter: harmonic noise scales with stress
     *  - Pulse Ring: peripheral-vision alert when crossing
     *    the deadband threshold
     *  - Neon Glow: shadowBlur on the wave stroke for that
     *    authentic CRT phosphor glow
     *
     *  DataShape: Value (Single datasource — current frequency)
     *  Shadow DOM · DPR scaling · Hebrew RTL · wc20 config
     * ═══════════════════════════════════════════════════════ */

    function symbolVis() { PV.deriveVisualizationFromBase(this); }

    /* ── Executive Palette ── */
    var CLR = {
        ok:       '#00F5D4',
        warn:     '#FF9500',
        crit:     '#FF3B30',
        accent:   '#5BC0EB',
        text:     '#ECF0F1',
        muted:    '#8899AA',
        bg:       'rgba(11, 15, 25, 0.15)',  /* CRT phosphor fade */
        bgSolid:  '#0B0F19',
        grid:     'rgba(91, 192, 235, 0.06)',
        gridLine: 'rgba(91, 192, 235, 0.12)'
    };

    /* ── Wave Physics ── */
    var PHYS = {
        BASE_AMP:     0.08,   /* Base amplitude (fraction of height)   */
        STRESS_AMP:   0.35,   /* Max stress amplitude (fraction)       */
        BASE_SPEED:   0.05,   /* Base phase advance per frame           */
        STRESS_SPEED: 0.10,   /* Added speed at max stress              */
        BASE_FREQ:    0.020,  /* Base wave spatial frequency            */
        STRESS_FREQ:  0.010,  /* Added frequency at max stress          */
        LERP:         0.08,   /* Display value lerp factor              */
        STEP:         2,      /* X-axis resolution (px)                 */
        LINE_W:       2.5,    /* Wave line width                        */
        GLOW:         12      /* Shadow blur for neon glow              */
    };

    /* ── Pulse Ring Constants ── */
    var PULSE = {
        DURATION:  1500,  /* ms for one pulse cycle          */
        MAX_GROW:  20,    /* px growth beyond canvas edge    */
        LINE_W:    2      /* ring stroke width               */
    };


    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var self   = this;

        /* ═══ Script Base Path ═══ */
        var SCRIPT_BASE = (function () {
            var scripts = document.querySelectorAll('script[src*="sym-freqmeter-wow"]');
            if (scripts.length) {
                var s = scripts[scripts.length - 1].getAttribute('src') || '';
                return s.substring(0, s.lastIndexOf('/') + 1);
            }
            var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
            return base + '/Scripts/app/editor/symbols/ext/';
        })();

        /* ═══ Mount Point ═══ */
        var mountEl = elem[0].querySelector('.wow-fm-root-mount');
        if (!mountEl) {
            console.error('[WOW Freq Meter] Mount element .wow-fm-root-mount not found');
            return;
        }

        /* ═══ Shadow DOM ═══ */
        var shadow;
        try { shadow = mountEl.attachShadow({ mode: 'open' }); }
        catch (e) { shadow = mountEl; }

        var linkEl = document.createElement('link');
        linkEl.rel  = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-freqmeter-wow.css';
        shadow.appendChild(linkEl);


        /* ═══ DOM Scaffold ═══ */
        function _el(tag, cls) {
            var e = document.createElement(tag);
            if (cls) e.className = cls;
            return e;
        }

        var root    = _el('div', 'wow-fm-root');
        var toolbar = _el('div', 'wow-fm-toolbar');
        var titleEl = _el('span', 'wow-fm-title');
        var actions = _el('div', 'wow-fm-toolbar-actions');

        var btnExport = _el('button', 'wow-fm-btn');
        btnExport.textContent = '\uD83D\uDCF7 Export';
        actions.appendChild(btnExport);
        toolbar.appendChild(titleEl);
        toolbar.appendChild(actions);

        /* ── Stats Bar ── */
        var statsBar = _el('div', 'wow-fm-stats');

        /* ── Canvas Container ── */
        var canvasOuter = _el('div', 'wow-fm-canvas-outer');
        var canvas      = document.createElement('canvas');
        canvas.className = 'wow-fm-canvas';
        var ctx = canvas.getContext('2d', { alpha: false });

        /* ── Value Overlay ── */
        var valueOverlay = _el('div', 'wow-fm-value-overlay');
        var freqText     = _el('div', 'wow-fm-value-freq');
        freqText.textContent = '\u2014';
        var deviationText = _el('div', 'wow-fm-value-deviation');
        var statusText    = _el('div', 'wow-fm-value-status');

        valueOverlay.appendChild(freqText);
        valueOverlay.appendChild(deviationText);
        valueOverlay.appendChild(statusText);

        canvasOuter.appendChild(canvas);
        canvasOuter.appendChild(valueOverlay);

        /* ── Skeleton ── */
        var skeleton = _el('div', 'wow-fm-skeleton');

        /* ── Footer ── */
        var footer = _el('div', 'wow-fm-footer');
        footer.textContent = 'WOW Resonance Meter v100 \u00B7 CRT Oscilloscope + Tension Lerp';

        /* Assemble */
        root.appendChild(toolbar);
        root.appendChild(statsBar);
        root.appendChild(canvasOuter);
        root.appendChild(skeleton);
        root.appendChild(footer);
        shadow.appendChild(root);


        /* ═══ State ═══ */
        var currentFreq   = 50.00;   /* Real value from PI               */
        var displayedFreq = 50.00;   /* Lerping display value             */
        var phase         = 0;       /* Wave phase offset                 */
        var dimW          = 0;
        var dimH          = 0;
        var dpr           = 1;
        var animId        = null;
        var demoInterval  = null;
        var resizeObs     = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;
        var pulseStart    = 0;       /* Timestamp of last pulse trigger   */
        var wasInBand     = true;    /* Was previously inside deadband?   */
        var initialClear  = true;    /* First frame needs full clear      */


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
            initialClear = true;
        }

        var resizeTimer = null;
        resizeObs = new ResizeObserver(function () {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(_resize, 150);
        });
        resizeObs.observe(canvasOuter);


        /* ═══════════════════════════════════════════════════
         *  THE GEM: Resonance Oscilloscope Rendering
         *
         *  Each rAF frame:
         *  1. CRT phosphor fade (semi-transparent overlay)
         *  2. Lerp displayed frequency toward real value
         *  3. Compute stress factor from deviation
         *  4. Map stress → amplitude, speed, frequency, jitter
         *  5. Draw oscilloscope grid lines
         *  6. Draw sine wave with neon glow
         *  7. Pulse ring if crossing deadband threshold
         *
         *  The CRT trail effect: instead of clearRect, we
         *  draw rgba(bg, 0.15) over the previous frame.
         *  Old wave traces fade gradually — exactly like the
         *  phosphor persistence of a real CRT oscilloscope.
         * ═══════════════════════════════════════════════════ */
        function _render() {
            if (dimW === 0 || dimH === 0) {
                animId = requestAnimationFrame(_render);
                return;
            }

            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            /* ── CRT Phosphor Fade ── */
            if (initialClear) {
                ctx.fillStyle = CLR.bgSolid;
                ctx.fillRect(0, 0, dimW, dimH);
                initialClear = false;
            } else {
                ctx.fillStyle = CLR.bg;
                ctx.fillRect(0, 0, dimW, dimH);
            }

            /* ── Lerp display value ── */
            displayedFreq += (currentFreq - displayedFreq) * PHYS.LERP;

            /* ── Stress factor: deviation / warningBand ── */
            var nominal   = config.NominalFrequency || 50.00;
            var warnBand  = config.WarningBand || 0.15;
            var critBand  = config.CriticalBand || 0.30;
            var deviation = Math.abs(currentFreq - nominal);
            var stressFactor = Math.min(deviation / warnBand, 2.5);

            /* ── Wave physics ── */
            var amplitude   = (PHYS.BASE_AMP + stressFactor * PHYS.STRESS_AMP) * (dimH / 2);
            var speed       = PHYS.BASE_SPEED + stressFactor * PHYS.STRESS_SPEED;
            var waveFreq    = PHYS.BASE_FREQ + stressFactor * PHYS.STRESS_FREQ;

            phase += speed;

            /* ── Color by risk ── */
            var waveColor;
            var level;
            if (deviation >= critBand) {
                waveColor = CLR.crit;
                level = 'crit';
            } else if (deviation >= warnBand) {
                waveColor = CLR.warn;
                level = 'warn';
            } else {
                waveColor = CLR.ok;
                level = 'ok';
            }

            /* ── Oscilloscope grid ── */
            _drawGrid();

            /* ── Draw sine wave ── */
            ctx.beginPath();
            ctx.moveTo(0, dimH / 2);

            var midY = dimH / 2;
            for (var x = 0; x < dimW; x += PHYS.STEP) {
                /* Dynamic Jitter: harmonic noise scales with stress */
                var jitter = 0;
                if (stressFactor > 0.6) {
                    jitter = (Math.random() - 0.5) * stressFactor * 6;
                }

                /* Second harmonic distortion at high stress */
                var harmonic = 0;
                if (stressFactor > 1.0) {
                    harmonic = Math.sin(x * waveFreq * 3 + phase * 1.7) *
                               amplitude * 0.15 * (stressFactor - 1);
                }

                var y = midY +
                        Math.sin(x * waveFreq + phase) * amplitude +
                        harmonic +
                        jitter;

                ctx.lineTo(x, y);
            }

            /* Neon glow stroke */
            ctx.strokeStyle = waveColor;
            ctx.lineWidth   = PHYS.LINE_W;
            ctx.shadowColor = waveColor;
            ctx.shadowBlur  = PHYS.GLOW;
            ctx.stroke();
            ctx.shadowBlur = 0;

            /* ── Pulse Ring (peripheral vision alert) ── */
            _drawPulse(deviation, warnBand, waveColor);

            /* ── Update text overlay ── */
            _updateValueDisplay(deviation, warnBand, critBand, level);

            animId = requestAnimationFrame(_render);
        }


        /* ═══ Oscilloscope Grid ═══ */
        function _drawGrid() {
            ctx.strokeStyle = CLR.gridLine;
            ctx.lineWidth = 0.5;

            /* Horizontal center line */
            ctx.beginPath();
            ctx.moveTo(0, dimH / 2);
            ctx.lineTo(dimW, dimH / 2);
            ctx.stroke();

            /* Horizontal quarter lines */
            ctx.strokeStyle = CLR.grid;
            var quarterH = dimH / 4;
            for (var i = 1; i < 4; i++) {
                if (i === 2) continue;  /* Skip center (already drawn) */
                ctx.beginPath();
                ctx.moveTo(0, quarterH * i);
                ctx.lineTo(dimW, quarterH * i);
                ctx.stroke();
            }

            /* Vertical divisions */
            var divW = dimW / 8;
            for (var j = 1; j < 8; j++) {
                ctx.beginPath();
                ctx.moveTo(divW * j, 0);
                ctx.lineTo(divW * j, dimH);
                ctx.stroke();
            }
        }


        /* ═══════════════════════════════════════════════════
         *  Pulse Ring — Peripheral Vision Alert
         *
         *  When the frequency crosses the deadband threshold,
         *  a circle expands outward from the canvas center
         *  and fades. This catches the operator's eye even
         *  when they're looking at another monitor in the
         *  control room.  The pulse uses the same waveColor
         *  so it reinforces the risk level.
         * ═══════════════════════════════════════════════════ */
        function _drawPulse(deviation, warnBand, waveColor) {
            var isInBand = deviation < warnBand;

            /* Trigger pulse on threshold crossing */
            if (!isInBand && wasInBand) {
                pulseStart = Date.now();
            }
            wasInBand = isInBand;

            /* Continuous pulse while out of band */
            if (!isInBand && deviation >= warnBand) {
                var elapsed = (Date.now() - pulseStart) % PULSE.DURATION;
                var progress = elapsed / PULSE.DURATION;
                var alpha = 1 - progress;

                if (alpha > 0) {
                    var grow = progress * PULSE.MAX_GROW;
                    var cx = dimW / 2;
                    var cy = dimH / 2;
                    var baseR = Math.min(dimW, dimH) / 2 - 4;

                    ctx.beginPath();
                    ctx.arc(cx, cy, baseR + grow, 0, 2 * Math.PI);
                    ctx.strokeStyle = waveColor;
                    ctx.globalAlpha = alpha * 0.4;
                    ctx.lineWidth = PULSE.LINE_W;
                    ctx.stroke();
                    ctx.globalAlpha = 1;
                }
            }
        }


        /* ═══ Value Overlay Update ═══ */
        function _updateValueDisplay(deviation, warnBand, critBand, level) {
            var dec = config.Decimals != null ? config.Decimals : 2;

            /* Frequency */
            freqText.textContent = displayedFreq.toFixed(dec) + ' Hz';

            /* Deviation */
            var sign = currentFreq >= (config.NominalFrequency || 50) ? '+' : '-';
            deviationText.textContent = '\u0394 ' + sign + deviation.toFixed(3) + ' Hz';

            /* Status label */
            if (level === 'crit') {
                statusText.textContent = '\u26A0 \u05E1\u05D8\u05D9\u05D9\u05D4 \u05E7\u05E8\u05D9\u05D8\u05D9\u05EA';  /* ⚠ סטייה קריטית */
                statusText.className = 'wow-fm-value-status wow-fm-status-crit';
            } else if (level === 'warn') {
                statusText.textContent = '\u26A0 \u05D0\u05D6\u05D4\u05E8\u05D4';  /* ⚠ אזהרה */
                statusText.className = 'wow-fm-value-status wow-fm-status-warn';
            } else {
                statusText.textContent = '\u2713 \u05EA\u05E7\u05D9\u05DF';  /* ✓ תקין */
                statusText.className = 'wow-fm-value-status wow-fm-status-ok';
            }

            /* Level coloring on freq text */
            freqText.classList.remove('wow-fm-level-ok', 'wow-fm-level-warn', 'wow-fm-level-crit');
            freqText.classList.add('wow-fm-level-' + level);
        }


        /* ═══ Stats Bar ═══ */
        function _updateStats() {
            var nominal  = config.NominalFrequency || 50.00;
            var warnBand = config.WarningBand || 0.15;
            var critBand = config.CriticalBand || 0.30;
            var html = '';

            html += '<span class="wow-fm-stat">\u05E0\u05D5\u05DE\u05D9\u05E0\u05DC\u05D9: <b>' +
                    nominal.toFixed(2) + ' Hz</b></span>';

            html += '<span class="wow-fm-stat">\u05D0\u05D6\u05D4\u05E8\u05D4: <b>\u00B1' +
                    warnBand.toFixed(2) + '</b></span>';

            html += '<span class="wow-fm-stat">\u05E7\u05E8\u05D9\u05D8\u05D9: <b>\u00B1' +
                    critBand.toFixed(2) + '</b></span>';

            statsBar.innerHTML = html;
        }


        /* ═══ Export PNG ═══ */
        function _exportPNG() {
            var link = document.createElement('a');
            link.download = 'resonance-meter-' + Date.now() + '.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
        btnExport.addEventListener('click', _exportPNG);


        /* ═══ Config ═══ */
        function _applyConfig() {
            titleEl.textContent = config.Title || 'Executive Resonance Meter';

            var ff = config.fontFamily || 'Segoe UI';
            var fs = config.fontSize   || 12;
            root.style.setProperty('--wow-fm-font',      '"' + ff + '", Arial, sans-serif');
            root.style.setProperty('--wow-fm-font-size',  fs + 'px');

            _updateStats();
        }

        ['Title', 'NominalFrequency', 'WarningBand', 'CriticalBand',
         'Decimals', 'DemoMode', 'fontFamily', 'fontSize'
        ].forEach(function (key) {
            scope.$watch('config.' + key, function () { _applyConfig(); });
        });


        /* ═══ Data Update ═══ */
        function _processData(data) {
            var val;
            if (data.Value !== undefined) {
                val = parseFloat(data.Value);
            } else if (data.Rows && data.Rows.length > 0) {
                val = parseFloat(data.Rows[0].Value);
            }
            if (val === undefined || isNaN(val)) return;

            skeleton.style.display = 'none';
            currentFreq = val;
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
            currentFreq   = 50.00;
            displayedFreq = 50.00;

            /* Simulate grid frequency fluctuations:
               Normal operation around 50Hz with occasional dips */
            demoInterval = setInterval(function () {
                var t = Date.now() * 0.001;

                /* Base: 50Hz + slow drift */
                var drift = Math.sin(t * 0.3) * 0.08;

                /* Occasional stress events */
                var stress = Math.sin(t * 0.07) * Math.sin(t * 0.13);
                if (stress > 0.7) {
                    drift += (stress - 0.7) * 0.6;  /* Frequency drop event */
                }
                if (stress < -0.8) {
                    drift -= (stress + 0.8) * 0.3;  /* Overshoot event */
                }

                /* Micro-noise */
                drift += (Math.random() - 0.5) * 0.02;

                currentFreq = 50.00 + drift;
            }, 100);
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
        typeName:           'freqmeter-wow',
        visObjectType:      symbolVis,
        displayName:        '\u05DE\u05D3 \u05EA\u05D3\u05E8 WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Single,
        getDefaultConfig: function () {
            return {
                DataShape:          'Value',
                Height:             250,
                Width:              500,
                Title:              'Executive Resonance Meter',
                DemoMode:           true,
                NominalFrequency:   50.00,
                WarningBand:        0.15,
                CriticalBand:       0.30,
                Decimals:           2,
                fontFamily:         'Segoe UI',
                fontSize:           12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05DE\u05D3 \u05EA\u05D3\u05E8 WOW'
    });

})(window.PIVisualization);
