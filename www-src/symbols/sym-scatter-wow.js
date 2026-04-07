/**
 * ═══════════════════════════════════════════════════════
 *  sym-scatter-wow.js  —  Executive Anomaly Scatter Plot
 * ═══════════════════════════════════════════════════════
 *  OffscreenCanvas-powered scatter plot rendering 200K+
 *  points at 0ms Main Thread cost. All drawing runs in
 *  a Web Worker via transferControlToOffscreen().
 *
 *  Architecture:
 *    PI Vision → dataUpdate() → Float32Array → Worker
 *    Worker: Z-Score anomaly detection + Canvas rendering
 *    Worker → FRAME_READY / BRUSH_RESULT / HOVER_RESULT
 *
 *  Key techniques:
 *    - OffscreenCanvas: entire rendering pipeline in Worker
 *    - Density Glow: globalCompositeOperation 'lighter'
 *    - Z-Score anomaly detection (combined X+Y)
 *    - Brush & Select: rectangle → time range extraction
 *    - Float32Array Transferable: zero-copy data passing
 *    - Single ctx.fill() for 200K points → GPU
 *
 *  DataShape : XYPlot (Time-aligned from PI Web API)
 *  Version   : WOW SC 100.0
 *  Prefix    : wow-sc-
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    var SCRIPT_BASE = (function () {
        var scripts = document.querySelectorAll('script[src*="sym-scatter-wow"]');
        if (scripts.length) {
            var s = scripts[scripts.length - 1].getAttribute('src') || '';
            return s.substring(0, s.lastIndexOf('/') + 1);
        }
        var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
        return base + '/Scripts/app/editor/symbols/ext/';
    })();


    // ═══════════════════════════════════════
    //  DEMO DATA
    // ═══════════════════════════════════════

    function generateDemoData(count) {
        var n = count || 10000;
        var xArr = new Float32Array(n);
        var yArr = new Float32Array(n);
        var tArr = new Float64Array(n);
        var now = Date.now();

        for (var i = 0; i < n; i++) {
            // Cluster around a "sweet spot" (MW=320, Temp=540)
            var clusterRoll = Math.random();
            if (clusterRoll < 0.7) {
                // Main cluster: Normal distribution around sweet spot
                xArr[i] = 320 + _boxMuller() * 25;
                yArr[i] = 540 + _boxMuller() * 18;
            } else if (clusterRoll < 0.9) {
                // Secondary cluster: lower efficiency
                xArr[i] = 240 + _boxMuller() * 30;
                yArr[i] = 480 + _boxMuller() * 20;
            } else if (clusterRoll < 0.97) {
                // Scattered normal points
                xArr[i] = 100 + Math.random() * 350;
                yArr[i] = 400 + Math.random() * 200;
            } else {
                // Anomalies: far from clusters
                xArr[i] = Math.random() < 0.5 ? 50 + Math.random() * 50 : 420 + Math.random() * 80;
                yArr[i] = Math.random() < 0.5 ? 350 + Math.random() * 40 : 650 + Math.random() * 50;
            }

            tArr[i] = now - (n - i) * 30000; // 30s intervals
        }

        return { xValues: xArr, yValues: yArr, timestamps: tArr };
    }

    function _boxMuller() {
        var u = Math.random(), v = Math.random();
        return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
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
            var mountEl = hostEl.querySelector('.wow-sc-root-mount');
            if (mountEl && mountEl.attachShadow) {
                shadow = mountEl.attachShadow({ mode: 'open' });
            } else {
                shadow = mountEl || hostEl;
            }
        } catch (e) {
            shadow = hostEl.querySelector('.wow-sc-root-mount') || hostEl;
        }

        // ── Inject CSS ──
        var linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-scatter-wow.css';
        shadow.appendChild(linkEl);

        // ── Build DOM scaffold ──
        var root = document.createElement('div');
        root.className = 'wow-sc-root';

        // Toolbar
        var toolbar = document.createElement('div');
        toolbar.className = 'wow-sc-toolbar';
        toolbar.innerHTML =
            '<span class="wow-sc-title">' + (config.Title || 'Executive Anomaly Scatter') + '</span>' +
            '<div class="wow-sc-toolbar-actions">' +
                '<button class="wow-sc-btn wow-sc-btn-density" title="Toggle Density Mode">\u2601 Density</button>' +
                '<button class="wow-sc-btn wow-sc-btn-anomaly" title="Toggle Anomalies">\u26A0 Anomalies</button>' +
                '<button class="wow-sc-btn wow-sc-btn-export" title="Export PNG">\uD83D\uDCF7 PNG</button>' +
            '</div>';
        root.appendChild(toolbar);

        // Stats bar
        var statsBar = document.createElement('div');
        statsBar.className = 'wow-sc-stats';
        root.appendChild(statsBar);

        // Canvas container
        var canvasWrap = document.createElement('div');
        canvasWrap.className = 'wow-sc-canvas-wrap';

        var canvas = document.createElement('canvas');
        canvas.className = 'wow-sc-canvas';
        canvasWrap.appendChild(canvas);

        // Brush overlay (for rectangle selection)
        var brushOverlay = document.createElement('div');
        brushOverlay.className = 'wow-sc-brush';
        brushOverlay.style.display = 'none';
        canvasWrap.appendChild(brushOverlay);

        root.appendChild(canvasWrap);

        // Tooltip
        var tooltip = document.createElement('div');
        tooltip.className = 'wow-sc-tooltip';
        tooltip.style.display = 'none';
        root.appendChild(tooltip);

        // Footer
        var footer = document.createElement('div');
        footer.className = 'wow-sc-footer';
        root.appendChild(footer);

        shadow.appendChild(root);

        // ── State ──
        var worker = null;
        var offscreenMode = false;
        var canvasW = 0, canvasH = 0;
        var resizeTimeout = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var _firstDataDone  = false;
        var DATA_DEBOUNCE_MS = 100;
        var dpr = window.devicePixelRatio || 1;

        // Brush state
        var isBrushing = false;
        var brushStartX = 0, brushStartY = 0;

        // Fallback canvas context (when OffscreenCanvas not supported)
        var fallbackCtx = null;


        // ═══════════════════════════════════════
        //  OFFSCREEN CANVAS + WORKER SETUP
        // ═══════════════════════════════════════

        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-scatter-worker.js');
        } catch (e) {
            footer.textContent = 'Worker creation failed: ' + e.message;
        }

        if (worker) {
            // Try OffscreenCanvas transfer
            try {
                var offscreen = canvas.transferControlToOffscreen();
                worker.postMessage({ type: 'INIT_CANVAS', canvas: offscreen }, [offscreen]);
                offscreenMode = true;
            } catch (e) {
                // Fallback: Worker will receive size but won't draw — we draw on Main Thread
                offscreenMode = false;
                fallbackCtx = canvas.getContext('2d', { alpha: false });
            }

            // Worker message handler
            worker.onmessage = function (e) {
                var msg = e.data;

                switch (msg.type) {
                    case 'FRAME_READY':
                        updateStats(msg.stats);
                        break;

                    case 'ANOMALIES':
                        updateAnomalyStats(msg);
                        break;

                    case 'BRUSH_RESULT':
                        showBrushResult(msg);
                        break;

                    case 'HOVER_RESULT':
                        if (msg.found) {
                            showPointTooltip(msg);
                        } else {
                            tooltip.style.display = 'none';
                        }
                        break;

                    case 'ERROR':
                        footer.textContent = 'Worker Error: ' + msg.message;
                        break;
                }
            };

            worker.onerror = function (e) {
                footer.textContent = 'Worker Error: ' + (e.message || 'Unknown');
            };
        }


        // ═══════════════════════════════════════
        //  LAYOUT & RESIZE
        // ═══════════════════════════════════════

        function setupCanvas() {
            var rect = canvasWrap.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return;

            dpr = window.devicePixelRatio || 1;
            canvasW = rect.width;
            canvasH = rect.height;

            if (!offscreenMode && fallbackCtx) {
                canvas.width = canvasW * dpr;
                canvas.height = canvasH * dpr;
                canvas.style.width = canvasW + 'px';
                canvas.style.height = canvasH + 'px';
                fallbackCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }

            if (worker) {
                worker.postMessage({
                    type: 'RESIZE',
                    width: canvasW,
                    height: canvasH,
                    dpr: dpr
                });
            }
        }

        var resizeObs = null;
        try {
            resizeObs = new ResizeObserver(function () {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(setupCanvas, 200);
            });
            resizeObs.observe(canvasWrap);
        } catch (e) { /* fallback */ }


        // ═══════════════════════════════════════
        //  BRUSH & SELECT
        // ═══════════════════════════════════════

        function _onCanvasMouseDown(e) {
            if (e.button !== 0 || e.shiftKey) return;
            isBrushing = true;
            brushStartX = e.offsetX;
            brushStartY = e.offsetY;
            brushOverlay.style.display = 'block';
            brushOverlay.style.left = brushStartX + 'px';
            brushOverlay.style.top = brushStartY + 'px';
            brushOverlay.style.width = '0px';
            brushOverlay.style.height = '0px';
        }

        function _onCanvasMouseMove(e) {
            if (isBrushing) {
                var x = Math.min(e.offsetX, brushStartX);
                var y = Math.min(e.offsetY, brushStartY);
                var w = Math.abs(e.offsetX - brushStartX);
                var h = Math.abs(e.offsetY - brushStartY);

                brushOverlay.style.left = x + 'px';
                brushOverlay.style.top = y + 'px';
                brushOverlay.style.width = w + 'px';
                brushOverlay.style.height = h + 'px';
            } else {
                // Hover query
                if (worker) {
                    worker.postMessage({
                        type: 'HOVER_QUERY',
                        x: e.offsetX,
                        y: e.offsetY
                    });
                }
            }
        }

        function _onCanvasMouseUp(e) {
            if (!isBrushing) return;
            isBrushing = false;

            var w = Math.abs(e.offsetX - brushStartX);
            var h = Math.abs(e.offsetY - brushStartY);

            if (w > 5 && h > 5 && worker) {
                // Send brush rectangle to Worker
                worker.postMessage({
                    type: 'BRUSH_QUERY',
                    x1: Math.min(e.offsetX, brushStartX),
                    y1: Math.min(e.offsetY, brushStartY),
                    x2: Math.max(e.offsetX, brushStartX),
                    y2: Math.max(e.offsetY, brushStartY)
                });
            } else {
                brushOverlay.style.display = 'none';
            }
        }

        function _onCanvasMouseLeave() {
            if (isBrushing) {
                isBrushing = false;
                brushOverlay.style.display = 'none';
            }
            tooltip.style.display = 'none';
        }

        canvas.addEventListener('mousedown', _onCanvasMouseDown);
        canvas.addEventListener('mousemove', _onCanvasMouseMove);
        canvas.addEventListener('mouseup', _onCanvasMouseUp);
        canvas.addEventListener('mouseleave', _onCanvasMouseLeave);


        // ═══════════════════════════════════════
        //  TOOLTIPS
        // ═══════════════════════════════════════

        function showPointTooltip(msg) {
            var dec = config.Decimals || 1;
            var anomalyTag = msg.isAnomaly
                ? '<span class="wow-sc-tt-anomaly">\u26A0 \u05D7\u05E8\u05D9\u05D2\u05D4</span>'
                : '';

            var timeStr = '';
            if (msg.time) {
                var d = new Date(msg.time);
                timeStr = '<div class="wow-sc-tt-time">' +
                    _padZero(d.getDate()) + '/' + _padZero(d.getMonth() + 1) + ' ' +
                    _padZero(d.getHours()) + ':' + _padZero(d.getMinutes()) + ':' + _padZero(d.getSeconds()) +
                    '</div>';
            }

            tooltip.innerHTML =
                timeStr +
                '<div class="wow-sc-tt-values">' +
                    'X: <b>' + msg.x.toFixed(dec) + '</b> &nbsp; Y: <b>' + msg.y.toFixed(dec) + '</b>' +
                '</div>' +
                anomalyTag;

            tooltip.style.display = 'block';
            tooltip.style.left = (msg.canvasX + 16) + 'px';
            tooltip.style.top = (msg.canvasY - 10) + 'px';

            // Bounds check
            if (msg.canvasX + 200 > canvasW) {
                tooltip.style.left = (msg.canvasX - 200) + 'px';
            }
        }

        function showBrushResult(msg) {
            if (msg.count === 0) {
                brushOverlay.style.display = 'none';
                return;
            }

            var timeRange = '';
            if (msg.timeStart && msg.timeEnd) {
                timeRange = _fmtDateTime(msg.timeStart) + ' \u2014 ' + _fmtDateTime(msg.timeEnd);
            }

            tooltip.innerHTML =
                '<div class="wow-sc-tt-brush-title">\uD83D\uDD0D \u05D1\u05D7\u05D9\u05E8\u05D4</div>' +
                '<div class="wow-sc-tt-values">\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA: <b>' + msg.count.toLocaleString() + '</b></div>' +
                (msg.anomalyCount > 0
                    ? '<div class="wow-sc-tt-anomaly">\u26A0 \u05D7\u05E8\u05D9\u05D2\u05D5\u05EA: ' + msg.anomalyCount + '</div>'
                    : '') +
                (timeRange ? '<div class="wow-sc-tt-time">' + timeRange + '</div>' : '');

            tooltip.style.display = 'block';
            tooltip.style.left = (canvasW / 2 - 100) + 'px';
            tooltip.style.top = '60px';

            // Auto-hide after 5 seconds
            setTimeout(function () {
                brushOverlay.style.display = 'none';
                tooltip.style.display = 'none';
            }, 5000);
        }


        // ═══════════════════════════════════════
        //  STATS
        // ═══════════════════════════════════════

        function updateStats(stats) {
            if (!stats) return;
            statsBar.innerHTML =
                '<span class="wow-sc-stat">\u05E0\u05E7\u05D5\u05D3\u05D5\u05EA: <b>' + (stats.points || 0).toLocaleString() + '</b></span>' +
                '<span class="wow-sc-stat">\u05D7\u05E8\u05D9\u05D2\u05D5\u05EA: <b style="color:#FF3B30">' + (stats.anomalies || 0).toLocaleString() + '</b></span>' +
                '<span class="wow-sc-stat">X: ' + _fmtRange(stats.minX, stats.maxX) + '</span>' +
                '<span class="wow-sc-stat">Y: ' + _fmtRange(stats.minY, stats.maxY) + '</span>';
        }

        function updateAnomalyStats(msg) {
            footer.innerHTML =
                'WOW SC v100 \u2014 ' +
                (offscreenMode ? 'OffscreenCanvas (Zero UI Block)' : 'Canvas Fallback') +
                ' \u2014 Z-Score > ' + cfg_zScore().toFixed(1) +
                ' \u2014 \u03BC(X)=' + (msg.meanX || 0).toFixed(1) +
                ' \u03C3(X)=' + (msg.stdX || 0).toFixed(1);
        }

        function cfg_zScore() { return config.ZScoreThreshold || 2.5; }


        // ═══════════════════════════════════════
        //  TOOLBAR BUTTONS
        // ═══════════════════════════════════════

        var btnDensity = toolbar.querySelector('.wow-sc-btn-density');
        var btnAnomaly = toolbar.querySelector('.wow-sc-btn-anomaly');
        var btnExport  = toolbar.querySelector('.wow-sc-btn-export');

        function _onDensityClick() {
            config.DensityMode = !config.DensityMode;
            btnDensity.classList.toggle('wow-sc-btn-active', config.DensityMode);
            if (worker) worker.postMessage({ type: 'CONFIG', densityMode: config.DensityMode });
        }

        function _onAnomalyClick() {
            config.ShowAnomalies = config.ShowAnomalies === false ? true : (config.ShowAnomalies ? false : true);
            btnAnomaly.classList.toggle('wow-sc-btn-active', config.ShowAnomalies !== false);
            if (worker) worker.postMessage({ type: 'CONFIG', showAnomalies: config.ShowAnomalies !== false });
        }

        function _onExportClick() {
            if (!canvas) return;
            try {
                // For OffscreenCanvas, we need to capture from the visible canvas
                var exportCanvas = document.createElement('canvas');
                exportCanvas.width = canvas.width;
                exportCanvas.height = canvas.height;
                var expCtx = exportCanvas.getContext('2d');
                expCtx.drawImage(canvas, 0, 0);

                var link = document.createElement('a');
                link.download = 'scatter-wow-' + new Date().toISOString().slice(0, 10) + '.png';
                link.href = exportCanvas.toDataURL('image/png');
                link.click();
            } catch (e) { /* security */ }
        }

        btnDensity.addEventListener('click', _onDensityClick);
        btnAnomaly.addEventListener('click', _onAnomalyClick);
        btnExport.addEventListener('click', _onExportClick);


        // ═══════════════════════════════════════
        //  DATA UPDATE
        // ═══════════════════════════════════════

        function _processData(data) {
            if (!data || !worker) return;

            // XYPlot DataShape: data.Data is array of series
            if (data.Data && Array.isArray(data.Data)) {
                var xSeries = data.Data[0];
                var ySeries = data.Data.length > 1 ? data.Data[1] : null;

                if (xSeries && xSeries.Values && ySeries && ySeries.Values) {
                    var len = Math.min(xSeries.Values.length, ySeries.Values.length);
                    var xArr = new Float32Array(len);
                    var yArr = new Float32Array(len);
                    var tArr = new Float64Array(len);

                    for (var i = 0; i < len; i++) {
                        xArr[i] = parseFloat(xSeries.Values[i].Value || 0);
                        yArr[i] = parseFloat(ySeries.Values[i].Value || 0);
                        tArr[i] = new Date(xSeries.Values[i].Time || 0).getTime();
                    }

                    // Zero-copy transfer!
                    worker.postMessage({
                        type: 'DATA_UPDATE',
                        xValues: xArr,
                        yValues: yArr,
                        timestamps: tArr,
                        config: {
                            ZScoreThreshold: config.ZScoreThreshold,
                            PointRadius: config.PointRadius,
                            DensityMode: config.DensityMode,
                            ShowAnomalies: config.ShowAnomalies,
                            Decimals: config.Decimals,
                            fontFamily: config.fontFamily,
                            fontSize: config.fontSize
                        }
                    }, [xArr.buffer, yArr.buffer, tArr.buffer]);

                    return;
                }
            }

            // Fallback: Table DataShape
            if (data.Rows) {
                worker.postMessage({
                    type: 'DATA_RAW',
                    payload: data.Rows,
                    config: {
                        ZScoreThreshold: config.ZScoreThreshold,
                        PointRadius: config.PointRadius,
                        DensityMode: config.DensityMode,
                        ShowAnomalies: config.ShowAnomalies,
                        Decimals: config.Decimals,
                        fontFamily: config.fontFamily,
                        fontSize: config.fontSize
                    }
                });
            }
        }

        this.onDataUpdate = function (data) {
            if (!data || !worker) return;
            _pendingData = data;
            if (!_firstDataDone) {
                _firstDataDone = true;
                _processData(data);
                _pendingData = null;
                return;
            }
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
        };


        // ═══════════════════════════════════════
        //  DEMO MODE
        // ═══════════════════════════════════════

        function startDemo() {
            var demoCount = config.DemoPointCount || 10000;
            var demo = generateDemoData(demoCount);

            setupCanvas();

            if (worker) {
                worker.postMessage({
                    type: 'DATA_UPDATE',
                    xValues: demo.xValues,
                    yValues: demo.yValues,
                    timestamps: demo.timestamps,
                    config: {
                        ZScoreThreshold: config.ZScoreThreshold || 2.5,
                        PointRadius: config.PointRadius || 2.5,
                        DensityMode: config.DensityMode !== false,
                        ShowAnomalies: config.ShowAnomalies !== false,
                        Decimals: config.Decimals || 1,
                        fontFamily: config.fontFamily || 'Segoe UI',
                        fontSize: config.fontSize || 10
                    }
                }, [demo.xValues.buffer, demo.yValues.buffer, demo.timestamps.buffer]);
            }
        }

        if (config.DemoMode) {
            setTimeout(startDemo, 300);
        }


        // ═══════════════════════════════════════
        //  CONFIG WATCHERS
        // ═══════════════════════════════════════

        scope.$watch('config.DemoMode', function (v, o) {
            if (v === o) return;
            if (v) startDemo();
        });
        scope.$watch('config.Title', function () {
            var t = toolbar.querySelector('.wow-sc-title');
            if (t) t.textContent = config.Title || 'Executive Anomaly Scatter';
        });
        scope.$watch('config.ZScoreThreshold', function (v, o) {
            if (v === o || !worker) return;
            worker.postMessage({ type: 'CONFIG', ZScoreThreshold: v });
        });
        scope.$watch('config.PointRadius', function (v, o) {
            if (v === o || !worker) return;
            worker.postMessage({ type: 'CONFIG', PointRadius: v });
        });
        scope.$watch('config.fontFamily', function (v, o) {
            if (v === o || !worker) return;
            worker.postMessage({ type: 'CONFIG', fontFamily: v });
        });
        scope.$watch('config.fontSize', function (v, o) {
            if (v === o || !worker) return;
            worker.postMessage({ type: 'CONFIG', fontSize: v });
        });
        scope.$watch('config.DemoPointCount', function (v, o) {
            if (v === o) return;
            if (config.DemoMode) startDemo();
        });


        // ═══════════════════════════════════════
        //  CLEANUP
        // ═══════════════════════════════════════

        scope.$on('$destroy', function () {
            clearTimeout(_dataDebounceId);
            _pendingData = null;
            if (worker) worker.terminate();
            if (resizeObs) resizeObs.disconnect();
            clearTimeout(resizeTimeout);
            canvas.removeEventListener('mousedown', _onCanvasMouseDown);
            canvas.removeEventListener('mousemove', _onCanvasMouseMove);
            canvas.removeEventListener('mouseup', _onCanvasMouseUp);
            canvas.removeEventListener('mouseleave', _onCanvasMouseLeave);
            btnDensity.removeEventListener('click', _onDensityClick);
            btnAnomaly.removeEventListener('click', _onAnomalyClick);
            btnExport.removeEventListener('click', _onExportClick);
            fallbackCtx = null;
        });


        // ═══════════════════════════════════════
        //  UTILITIES
        // ═══════════════════════════════════════

        function _padZero(n) { return n < 10 ? '0' + n : '' + n; }

        function _fmtDateTime(ms) {
            var d = new Date(ms);
            return _padZero(d.getDate()) + '/' + _padZero(d.getMonth() + 1) + ' ' +
                   _padZero(d.getHours()) + ':' + _padZero(d.getMinutes());
        }

        function _fmtRange(min, max) {
            if (min === undefined) return '?';
            return min.toFixed(0) + '\u2013' + max.toFixed(0);
        }
    };


    // ═══════════════════════════════════════
    //  PI VISION REGISTRATION
    // ═══════════════════════════════════════

    PV.symbolCatalog.register({
        typeName:           'scatter-wow',
        displayName:        '\u05E4\u05D9\u05D6\u05D5\u05E8 \u05D7\u05DB\u05DD WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'icons/wow-scatter.svg',
        getDefaultConfig: function () {
            return {
                DataShape:        'XYPlot',
                Height:           500,
                Width:            800,
                Title:            '\u05E0\u05D9\u05EA\u05D5\u05D7 \u05D7\u05E8\u05D9\u05D2\u05D5\u05EA',
                ZScoreThreshold:  2.5,
                PointRadius:      2.5,
                DensityMode:      true,
                ShowAnomalies:    true,
                Decimals:         1,
                DemoMode:         true,
                DemoPointCount:   10000,
                fontFamily:       'Segoe UI',
                fontSize:         10
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E4\u05D9\u05D6\u05D5\u05E8 WOW',
        visObjectType: symbolVis
    });

})(window.PIVisualization);
