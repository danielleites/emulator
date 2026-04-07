/**
 * ═══════════════════════════════════════════════════════
 *  sym-treemap-wow.js  —  Executive Zoomable Treemap
 * ═══════════════════════════════════════════════════════
 *  Hierarchical health map rendering 5,000+ assets with
 *  Google-Maps-like Semantic Zoom. Web Worker computes
 *  the Squarify layout off-thread; Canvas draws rectangles
 *  in a single fillRect loop; CSS Transform drives the
 *  GPU-accelerated zoom animation (0 reflows).
 *
 *  Architecture:
 *    PI Vision → dataUpdate() → Worker.BUILD_TREE
 *    Worker: AF path parsing → tree → Squarify → flat nodes
 *    Click → CSS transform scale+translate → GPU zoom
 *    Worker.LAYOUT → new coordinates → reset transform → redraw
 *
 *  Key techniques:
 *    - Squarify algorithm in Worker (off-thread)
 *    - CSS Transform zoom: GPU stretches bitmap during animation
 *    - Two-phase zoom: animate first, compute in parallel, swap
 *    - AF path auto-hierarchy (flat table → nested tree)
 *    - HSL executive palette (fade-the-noise)
 *    - Breadcrumbs for spatial drill-up navigation
 *    - O(N) hit testing with fast rect search
 *    - Contextual tooltip with aggregated stats
 *
 *  DataShape : Table (Path / Value / Health columns)
 *  Version   : WOW TM 100.0
 *  Prefix    : wow-tm-
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    var SCRIPT_BASE = (function () {
        var scripts = document.querySelectorAll('script[src*="sym-treemap-wow"]');
        if (scripts.length) {
            var s = scripts[scripts.length - 1].getAttribute('src') || '';
            return s.substring(0, s.lastIndexOf('/') + 1);
        }
        var base = (window.location.pathname.match(/^(\/[^\/]+)\//) || [])[1] || '/PIVision';
        return base + '/Scripts/app/editor/symbols/ext/';
    })();


    // ═══════════════════════════════════════
    //  INITIALIZATION
    // ═══════════════════════════════════════

    symbolVis.prototype.init = function (scope, elem) {
        var config = scope.config;
        var hostEl = elem[0];

        // ── Shadow DOM ──
        var shadow;
        try {
            var mountEl = hostEl.querySelector('.wow-tm-root-mount');
            if (mountEl && mountEl.attachShadow) {
                shadow = mountEl.attachShadow({ mode: 'open' });
            } else {
                shadow = mountEl || hostEl;
            }
        } catch (e) {
            shadow = hostEl.querySelector('.wow-tm-root-mount') || hostEl;
        }

        // ── Inject CSS ──
        var linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-treemap-wow.css';
        shadow.appendChild(linkEl);


        // ═══════════════════════════════════════
        //  DOM SCAFFOLD
        // ═══════════════════════════════════════

        var root = document.createElement('div');
        root.className = 'wow-tm-root';

        // Toolbar
        var toolbar = document.createElement('div');
        toolbar.className = 'wow-tm-toolbar';
        toolbar.innerHTML =
            '<span class="wow-tm-title">' + (config.Title || 'Executive Treemap') + '</span>' +
            '<div class="wow-tm-toolbar-actions">' +
                '<button class="wow-tm-btn wow-tm-btn-home" title="Home">\uD83C\uDFE0</button>' +
                '<button class="wow-tm-btn wow-tm-btn-export" title="Export PNG">\uD83D\uDCF7 PNG</button>' +
            '</div>';
        root.appendChild(toolbar);

        // Breadcrumbs bar
        var breadcrumbsBar = document.createElement('div');
        breadcrumbsBar.className = 'wow-tm-breadcrumbs';
        root.appendChild(breadcrumbsBar);

        // Stats bar
        var statsBar = document.createElement('div');
        statsBar.className = 'wow-tm-stats';
        root.appendChild(statsBar);

        // Canvas outer (overflow clip for zoom)
        var canvasOuter = document.createElement('div');
        canvasOuter.className = 'wow-tm-canvas-outer';

        // Canvas container (CSS Transform target)
        var canvasContainer = document.createElement('div');
        canvasContainer.className = 'wow-tm-canvas-container';

        var canvas = document.createElement('canvas');
        canvas.className = 'wow-tm-canvas';
        canvasContainer.appendChild(canvas);
        canvasOuter.appendChild(canvasContainer);
        root.appendChild(canvasOuter);

        // Tooltip
        var tooltip = document.createElement('div');
        tooltip.className = 'wow-tm-tooltip';
        tooltip.style.display = 'none';
        root.appendChild(tooltip);

        // Footer
        var footer = document.createElement('div');
        footer.className = 'wow-tm-footer';
        footer.textContent = 'WOW TM v100 \u2014 Squarify Engine';
        root.appendChild(footer);

        shadow.appendChild(root);


        // ═══════════════════════════════════════
        //  STATE
        // ═══════════════════════════════════════

        var ctx = canvas.getContext('2d', { alpha: false });
        var worker = null;
        var canvasW = 0, canvasH = 0;
        var dpr = window.devicePixelRatio || 1;
        var resizeTimeout = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var _firstDataDone  = false;
        var DATA_DEBOUNCE_MS = 100;
        var animFrameId = null;

        var currentNodes = [];
        var currentFocusId = 'root';
        var hoveredNode = null;

        // Zoom state machine
        var isZooming = false;
        var animComplete = false;
        var dataReady = false;
        var pendingResult = null;
        var zoomSafetyTimer = null;


        // ═══════════════════════════════════════
        //  WORKER SETUP
        // ═══════════════════════════════════════

        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-treemap-worker.js');
        } catch (e) {
            footer.textContent = 'Worker creation failed: ' + e.message;
        }

        if (worker) {
            worker.onmessage = function (e) {
                var msg = e.data;

                switch (msg.type) {
                    case 'TREEMAP_LAYOUT':
                        if (isZooming) {
                            // Two-phase: store result, wait for animation to complete
                            pendingResult = msg;
                            dataReady = true;
                            tryApplyLayout();
                        } else {
                            applyLayout(msg);
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
        //  LAYOUT APPLICATION
        // ═══════════════════════════════════════

        function applyLayout(msg) {
            // Reset CSS transform (no transition)
            canvasContainer.style.transition = 'none';
            canvasContainer.style.transform = 'none';
            canvasContainer.style.opacity = '1';

            currentNodes = msg.nodes || [];
            currentFocusId = msg.focusId || 'root';

            updateBreadcrumbs(msg.breadcrumbs || []);
            updateStats(msg.focusStats);
            requestDraw();

            // Re-enable transitions after layout
            requestAnimationFrame(function () {
                canvasContainer.style.transition =
                    'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease';
            });

            isZooming = false;
            animComplete = false;
            dataReady = false;
            pendingResult = null;
        }

        function tryApplyLayout() {
            if (animComplete && dataReady && pendingResult) {
                applyLayout(pendingResult);
            }
        }


        // ═══════════════════════════════════════
        //  CANVAS SETUP & RESIZE
        // ═══════════════════════════════════════

        function setupCanvas() {
            var rect = canvasOuter.getBoundingClientRect();
            if (rect.width < 10 || rect.height < 10) return;

            dpr = window.devicePixelRatio || 1;
            canvasW = rect.width;
            canvasH = rect.height;

            canvas.width = canvasW * dpr;
            canvas.height = canvasH * dpr;
            canvas.style.width = canvasW + 'px';
            canvas.style.height = canvasH + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Re-layout at new dimensions
            if (worker && currentFocusId) {
                worker.postMessage({
                    type: 'LAYOUT',
                    focusId: currentFocusId,
                    width: canvasW,
                    height: canvasH
                });
            }
        }

        var resizeObs = null;
        try {
            resizeObs = new ResizeObserver(function () {
                clearTimeout(resizeTimeout);
                resizeTimeout = setTimeout(setupCanvas, 200);
            });
            resizeObs.observe(canvasOuter);
        } catch (e) { /* fallback */ }


        // ═══════════════════════════════════════
        //  CANVAS DRAWING
        // ═══════════════════════════════════════

        function requestDraw() {
            if (animFrameId) cancelAnimationFrame(animFrameId);
            animFrameId = requestAnimationFrame(drawTreemap);
        }

        function drawTreemap() {
            if (currentNodes.length === 0 || canvasW === 0) {
                drawEmpty();
                return;
            }

            var gap = config.Gap || 2;

            // Clear
            ctx.fillStyle = '#0A0F1C';
            ctx.fillRect(0, 0, canvasW, canvasH);

            // Draw each node
            for (var i = 0; i < currentNodes.length; i++) {
                var node = currentNodes[i];
                var x = node.x + gap;
                var y = node.y + gap;
                var w = node.w - gap * 2;
                var h = node.h - gap * 2;

                if (w < 1 || h < 1) continue;

                // ── Fill color (executive health palette) ──
                ctx.fillStyle = getNodeColor(node);

                // Rounded rectangle
                _roundRect(ctx, x, y, w, h, 3);
                ctx.fill();

                // ── Depth border ──
                if (node.depth === 0) {
                    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
                    ctx.lineWidth = 1;
                    _roundRect(ctx, x, y, w, h, 3);
                    ctx.stroke();
                }

                // ── Label ──
                if (w > 50 && h > 25) {
                    ctx.fillStyle = '#FFFFFF';
                    ctx.font = 'bold 12px ' + (config.fontFamily || 'Segoe UI');
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'top';

                    var label = _truncateText(ctx, node.label, w - 10);
                    ctx.fillText(label, x + w - 5, y + 4);
                }

                // ── Value ──
                if (w > 60 && h > 40) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
                    ctx.font = '10px ' + (config.fontFamily || 'Segoe UI');
                    ctx.textAlign = 'right';
                    ctx.fillText(node.value.toFixed(config.Decimals || 0), x + w - 5, y + 20);
                }

                // ── Mini stats for parent nodes ──
                if (node.stats && node.stats.totalLeaves > 1 && w > 80 && h > 55) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
                    ctx.font = '9px ' + (config.fontFamily || 'Segoe UI');
                    ctx.textAlign = 'right';
                    ctx.fillText(
                        node.stats.totalLeaves + ' \u05E0\u05DB\u05E1\u05D9\u05DD \u2022 ' +
                        node.stats.okPct + '% \u05EA\u05E7\u05D9\u05DF',
                        x + w - 5, y + 34
                    );
                }

                // ── Drill indicator ──
                if (node.hasChildren && w > 30 && h > 20) {
                    ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
                    ctx.font = '10px ' + (config.fontFamily || 'Segoe UI');
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText('\u25B6', x + 4, y + h - 4);
                }
            }

            // ── Hover highlight ──
            if (hoveredNode) {
                ctx.strokeStyle = '#5BC0EB';
                ctx.lineWidth = 2;
                var hg = gap;
                _roundRect(ctx, hoveredNode.x + hg, hoveredNode.y + hg,
                    hoveredNode.w - hg * 2, hoveredNode.h - hg * 2, 3);
                ctx.stroke();
            }
        }

        function drawEmpty() {
            ctx.fillStyle = '#0A0F1C';
            ctx.fillRect(0, 0, canvasW, canvasH);
            ctx.fillStyle = '#8899AA';
            ctx.font = '14px ' + (config.fontFamily || 'Segoe UI');
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('\u05D0\u05D9\u05DF \u05E0\u05EA\u05D5\u05E0\u05D9\u05DD \u05DC\u05EA\u05E6\u05D5\u05D2\u05D4', canvasW / 2, canvasH / 2);
        }


        // ═══════════════════════════════════════
        //  EXECUTIVE COLOR PALETTE
        //  "Fade the Noise" — healthy is muted,
        //  problems demand attention
        // ═══════════════════════════════════════

        function getNodeColor(node) {
            var ratio = node.healthRatio / 100;
            var warn = (config.WarnPct || 70) / 100;
            var crit = (config.CritPct || 90) / 100;

            if (ratio < warn) {
                // OK zone: muted teal-green (barely visible = nothing to worry about)
                var t = ratio / warn;
                return 'hsl(' + Math.round(160 - t * 20) + ',' +
                       Math.round(25 + t * 15) + '%,' +
                       Math.round(20 + t * 8) + '%)';
            }
            if (ratio < crit) {
                // Warning: warm amber (catches peripheral vision)
                var tw = (ratio - warn) / (crit - warn);
                return 'hsl(' + Math.round(45 - tw * 15) + ',' +
                       Math.round(65 + tw * 20) + '%,' +
                       Math.round(42 + tw * 8) + '%)';
            }
            // Critical: bright red (demands attention)
            var tc = Math.min(1, (ratio - crit) / (1 - crit));
            return 'hsl(' + Math.round(8 - tc * 8) + ',' +
                   Math.round(80 + tc * 10) + '%,' +
                   Math.round(48 + tc * 7) + '%)';
        }


        // ═══════════════════════════════════════
        //  ZOOM MECHANICS (THE GEM 💎)
        //  Google-Maps-like two-phase zoom:
        //  Phase 1: GPU stretches bitmap via CSS transform
        //  Phase 2: Worker computes new layout, then swap
        // ═══════════════════════════════════════

        function zoomIn(node) {
            if (isZooming || !worker) return;

            isZooming = true;
            animComplete = false;
            dataReady = false;
            pendingResult = null;

            // Phase 1: CSS Transform — GPU-accelerated zoom
            var scaleX = canvasW / node.w;
            var scaleY = canvasH / node.h;
            var scale = Math.min(scaleX, scaleY);

            var tx = -node.x;
            var ty = -node.y;

            canvasContainer.style.transition =
                'transform 0.4s cubic-bezier(0.25, 1, 0.5, 1)';
            canvasContainer.style.transformOrigin = '0 0';
            canvasContainer.style.transform =
                'scale(' + scale.toFixed(4) + ') translate(' + tx.toFixed(1) + 'px, ' + ty.toFixed(1) + 'px)';

            // Phase 2: Worker computes new layout in parallel
            worker.postMessage({
                type: 'LAYOUT',
                focusId: node.id,
                width: canvasW,
                height: canvasH
            });

            // Safety timeout (in case transitionend doesn't fire)
            clearTimeout(zoomSafetyTimer);
            zoomSafetyTimer = setTimeout(function () {
                animComplete = true;
                tryApplyLayout();
            }, 600);
        }

        function zoomOut(targetId) {
            if (isZooming || !worker) return;

            isZooming = true;
            animComplete = false;
            dataReady = false;
            pendingResult = null;

            // Reverse animation: scale down + slight fade
            canvasContainer.style.transition =
                'transform 0.3s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.3s ease';
            canvasContainer.style.transform = 'scale(0.85)';
            canvasContainer.style.opacity = '0.7';

            // Worker computes parent layout
            worker.postMessage({
                type: 'LAYOUT',
                focusId: targetId,
                width: canvasW,
                height: canvasH
            });

            clearTimeout(zoomSafetyTimer);
            zoomSafetyTimer = setTimeout(function () {
                animComplete = true;
                tryApplyLayout();
            }, 500);
        }

        // Listen for CSS transition end
        function _onTransitionEnd(e) {
            if (e.propertyName === 'transform' || e.propertyName === 'opacity') {
                clearTimeout(zoomSafetyTimer);
                animComplete = true;
                tryApplyLayout();
            }
        }
        canvasContainer.addEventListener('transitionend', _onTransitionEnd);


        // ═══════════════════════════════════════
        //  HIT TESTING & INTERACTION
        // ═══════════════════════════════════════

        function hitTest(mx, my) {
            // Find the DEEPEST (highest depth) node under cursor
            var best = null;
            for (var i = 0; i < currentNodes.length; i++) {
                var n = currentNodes[i];
                if (mx >= n.x && mx <= n.x + n.w &&
                    my >= n.y && my <= n.y + n.h) {
                    if (!best || n.depth >= best.depth) {
                        best = n;
                    }
                }
            }
            return best;
        }

        // Click → Drill Down
        function _onCanvasClick(e) {
            if (isZooming) return;
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;

            var clicked = hitTest(mx, my);
            if (clicked && clicked.hasChildren) {
                zoomIn(clicked);
            }
        }

        // Hover → Tooltip + Highlight
        function _onCanvasMouseMove(e) {
            if (isZooming) return;
            var rect = canvas.getBoundingClientRect();
            var mx = e.clientX - rect.left;
            var my = e.clientY - rect.top;

            var node = hitTest(mx, my);
            var prevHovered = hoveredNode;
            hoveredNode = node;

            if (node !== prevHovered) requestDraw();

            if (node) {
                showTooltip(node, mx, my);
            } else {
                tooltip.style.display = 'none';
            }
        }

        function _onCanvasMouseLeave() {
            if (hoveredNode) {
                hoveredNode = null;
                requestDraw();
            }
            tooltip.style.display = 'none';
        }

        canvas.addEventListener('click', _onCanvasClick);
        canvas.addEventListener('mousemove', _onCanvasMouseMove);
        canvas.addEventListener('mouseleave', _onCanvasMouseLeave);


        // ═══════════════════════════════════════
        //  TOOLTIP
        // ═══════════════════════════════════════

        function showTooltip(node, mx, my) {
            var dec = config.Decimals || 1;
            var html = '<div class="wow-tm-tt-label">' + node.label + '</div>';

            html += '<div class="wow-tm-tt-value">';
            html += '\u05E2\u05E8\u05DA: <b>' + node.value.toFixed(dec) + '</b>';
            html += '</div>';

            if (node.stats && node.stats.totalLeaves > 1) {
                html += '<div class="wow-tm-tt-stats">';
                html += '<span class="wow-tm-tt-health-ok">' + node.stats.okCount + ' \u05EA\u05E7\u05D9\u05DF</span>';
                if (node.stats.warnCount > 0) {
                    html += '<span class="wow-tm-tt-health-warn">' + node.stats.warnCount + ' \u05D0\u05D6\u05D4\u05E8\u05D4</span>';
                }
                if (node.stats.critCount > 0) {
                    html += '<span class="wow-tm-tt-health-crit">' + node.stats.critCount + ' \u05E7\u05E8\u05D9\u05D8\u05D9</span>';
                }
                html += '</div>';

                // Mini health bar
                var okW = node.stats.okPct;
                var warnW = Math.round(node.stats.warnCount / node.stats.totalLeaves * 100);
                var critW = 100 - okW - warnW;
                html += '<div class="wow-tm-tt-health-bar">';
                html += '<div class="wow-tm-tt-bar-ok" style="width:' + okW + '%"></div>';
                html += '<div class="wow-tm-tt-bar-warn" style="width:' + warnW + '%"></div>';
                html += '<div class="wow-tm-tt-bar-crit" style="width:' + critW + '%"></div>';
                html += '</div>';
            }

            if (node.hasChildren) {
                html += '<div class="wow-tm-tt-drill">\u05DC\u05D7\u05E5 \u05DC\u05E6\u05DC\u05D9\u05DC\u05D4 \u25B6</div>';
            }

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';

            // Position with bounds check
            var ttLeft = mx + 16;
            var ttTop = my - 10;
            if (ttLeft + 220 > canvasW) ttLeft = mx - 230;
            if (ttTop + 150 > canvasH) ttTop = canvasH - 160;
            if (ttTop < 0) ttTop = 4;

            tooltip.style.left = ttLeft + 'px';
            tooltip.style.top = ttTop + 'px';
        }


        // ═══════════════════════════════════════
        //  BREADCRUMBS
        // ═══════════════════════════════════════

        function updateBreadcrumbs(crumbs) {
            if (!crumbs || crumbs.length === 0) {
                breadcrumbsBar.innerHTML = '';
                return;
            }

            var html = '';
            for (var i = 0; i < crumbs.length; i++) {
                var isLast = i === crumbs.length - 1;

                if (isLast) {
                    html += '<span class="wow-tm-crumb wow-tm-crumb-current">' +
                            crumbs[i].label + '</span>';
                } else {
                    html += '<span class="wow-tm-crumb" data-id="' + crumbs[i].id + '">' +
                            crumbs[i].label + '</span>';
                    html += '<span class="wow-tm-crumb-sep">\u203A</span>';
                }
            }

            breadcrumbsBar.innerHTML = html;

            // Click handlers for breadcrumbs (drill up)
            var crumbEls = breadcrumbsBar.querySelectorAll('.wow-tm-crumb[data-id]');
            for (var c = 0; c < crumbEls.length; c++) {
                crumbEls[c].addEventListener('click', function () {
                    var targetId = this.getAttribute('data-id');
                    if (targetId && targetId !== currentFocusId) {
                        zoomOut(targetId);
                    }
                });
            }
        }


        // ═══════════════════════════════════════
        //  STATS BAR
        // ═══════════════════════════════════════

        function updateStats(focusStats) {
            if (!focusStats) {
                statsBar.innerHTML = '';
                return;
            }

            statsBar.innerHTML =
                '<span class="wow-tm-stat">\u05E0\u05DB\u05E1\u05D9\u05DD: <b>' + focusStats.totalLeaves + '</b></span>' +
                '<span class="wow-tm-stat">\u05EA\u05E7\u05D9\u05DF: <b style="color:#00F5D4">' + focusStats.okCount + '</b></span>' +
                (focusStats.warnCount > 0
                    ? '<span class="wow-tm-stat">\u05D0\u05D6\u05D4\u05E8\u05D4: <b style="color:#FFCC00">' + focusStats.warnCount + '</b></span>'
                    : '') +
                (focusStats.critCount > 0
                    ? '<span class="wow-tm-stat">\u05E7\u05E8\u05D9\u05D8\u05D9: <b style="color:#FF3B30">' + focusStats.critCount + '</b></span>'
                    : '') +
                '<span class="wow-tm-stat">\u05E2\u05E8\u05DA: <b>' + (focusStats.totalValue || 0).toFixed(config.Decimals || 0) + '</b></span>';
        }


        // ═══════════════════════════════════════
        //  TOOLBAR BUTTONS
        // ═══════════════════════════════════════

        var btnHome   = toolbar.querySelector('.wow-tm-btn-home');
        var btnExport = toolbar.querySelector('.wow-tm-btn-export');

        function _onHomeClick() {
            if (currentFocusId !== 'root') {
                zoomOut('root');
            }
        }

        function _onExportClick() {
            try {
                var link = document.createElement('a');
                link.download = 'treemap-wow-' + new Date().toISOString().slice(0, 10) + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch (e) { /* security */ }
        }

        btnHome.addEventListener('click', _onHomeClick);
        btnExport.addEventListener('click', _onExportClick);


        // ═══════════════════════════════════════
        //  DATA UPDATE
        // ═══════════════════════════════════════

        function _processData(data) {
            if (!data || !worker) return;

            var rows = [];
            if (data.Rows) {
                rows = data.Rows;
            } else if (data.Data && Array.isArray(data.Data)) {
                rows = data.Data;
            }

            if (rows.length === 0) return;

            setupCanvas();

            worker.postMessage({
                type: 'BUILD_TREE',
                rows: rows,
                width: canvasW,
                height: canvasH,
                focusId: 'root',
                config: {
                    WarnPct: config.WarnPct,
                    CritPct: config.CritPct,
                    MaxDepth: config.MaxDepth,
                    Gap: config.Gap,
                    Decimals: config.Decimals,
                    PathLevelsToSkip: config.PathLevelsToSkip
                }
            });

            currentFocusId = 'root';
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
            setupCanvas();
            if (!worker) return;

            // Worker generates demo data internally via BUILD_TREE with special flag
            // We generate demo rows client-side and send them
            var demoRows = _generateDemoRows();

            worker.postMessage({
                type: 'BUILD_TREE',
                rows: demoRows,
                width: canvasW,
                height: canvasH,
                focusId: 'root',
                config: {
                    WarnPct: config.WarnPct || 70,
                    CritPct: config.CritPct || 90,
                    MaxDepth: config.MaxDepth || 1,
                    Gap: config.Gap || 2,
                    Decimals: config.Decimals || 1,
                    PathLevelsToSkip: 0
                }
            });

            currentFocusId = 'root';
        }

        function _generateDemoRows() {
            var rows = [];
            var plants = [
                { name: '\u05DE\u05E4\u05E2\u05DC \u05D3\u05E8\u05D5\u05DD', units: 5 },
                { name: '\u05DE\u05E4\u05E2\u05DC \u05E6\u05E4\u05D5\u05DF', units: 4 },
                { name: '\u05DE\u05E4\u05E2\u05DC \u05DE\u05E8\u05DB\u05D6', units: 3 },
                { name: '\u05DE\u05E4\u05E2\u05DC \u05DE\u05E2\u05E8\u05D1', units: 2 }
            ];
            var equipment = [
                '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4', '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8',
                '\u05DE\u05E9\u05D0\u05D1\u05D4', '\u05DE\u05D3\u05D7\u05E1',
                '\u05DE\u05D7\u05DC\u05D9\u05E3 \u05D7\u05D5\u05DD', '\u05E9\u05E0\u05D0\u05D9'
            ];

            for (var p = 0; p < plants.length; p++) {
                for (var u = 1; u <= plants[p].units; u++) {
                    var eqCount = 3 + Math.floor(Math.random() * 4);
                    for (var e = 0; e < eqCount; e++) {
                        var eqName = equipment[e % equipment.length];
                        var baseHealth = Math.random() * 55;
                        // More warnings in specific plants
                        if (p === 0 && u <= 2) baseHealth += 25 + Math.random() * 25;
                        if (p === 2) baseHealth += 15 + Math.random() * 15;

                        rows.push({
                            Path: plants[p].name + '\\' +
                                  '\u05D9\u05D7\u05D9\u05D3\u05D4 ' + u + '\\' +
                                  eqName + (e >= equipment.length ? ' ' + (e + 1) : ''),
                            Value: 30 + Math.random() * 170,
                            Health: Math.min(100, baseHealth)
                        });
                    }
                }
            }
            return rows;
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
            var t = toolbar.querySelector('.wow-tm-title');
            if (t) t.textContent = config.Title || 'Executive Treemap';
        });
        scope.$watch('config.WarnPct', function (v, o) {
            if (v === o || !worker) return;
            worker.postMessage({ type: 'CONFIG', WarnPct: v });
            if (config.DemoMode) startDemo();
        });
        scope.$watch('config.CritPct', function (v, o) {
            if (v === o || !worker) return;
            worker.postMessage({ type: 'CONFIG', CritPct: v });
            if (config.DemoMode) startDemo();
        });
        scope.$watch('config.MaxDepth', function (v, o) {
            if (v === o || !worker) return;
            worker.postMessage({ type: 'CONFIG', MaxDepth: v });
            if (config.DemoMode) startDemo();
        });
        scope.$watch('config.fontFamily', function (v, o) {
            if (v === o) return;
            requestDraw();
        });
        scope.$watch('config.fontSize', function (v, o) {
            if (v === o) return;
            requestDraw();
        });
        scope.$watch('config.PathLevelsToSkip', function (v, o) {
            if (v === o || !worker) return;
            worker.postMessage({ type: 'CONFIG', PathLevelsToSkip: v });
        });


        // ═══════════════════════════════════════
        //  CLEANUP
        // ═══════════════════════════════════════

        scope.$on('$destroy', function () {
            clearTimeout(_dataDebounceId);
            _pendingData = null;
            if (worker) worker.terminate();
            if (resizeObs) resizeObs.disconnect();
            if (animFrameId) cancelAnimationFrame(animFrameId);
            clearTimeout(resizeTimeout);
            clearTimeout(zoomSafetyTimer);
            canvasContainer.removeEventListener('transitionend', _onTransitionEnd);
            canvas.removeEventListener('click', _onCanvasClick);
            canvas.removeEventListener('mousemove', _onCanvasMouseMove);
            canvas.removeEventListener('mouseleave', _onCanvasMouseLeave);
            btnHome.removeEventListener('click', _onHomeClick);
            btnExport.removeEventListener('click', _onExportClick);
        });


        // ═══════════════════════════════════════
        //  UTILITIES
        // ═══════════════════════════════════════

        function _roundRect(c, x, y, w, h, r) {
            if (r > w / 2) r = w / 2;
            if (r > h / 2) r = h / 2;
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

        function _truncateText(c, text, maxW) {
            if (c.measureText(text).width <= maxW) return text;
            while (text.length > 0 && c.measureText(text + '\u2026').width > maxW) {
                text = text.slice(0, -1);
            }
            return text + '\u2026';
        }
    };


    // ═══════════════════════════════════════
    //  PI VISION REGISTRATION
    // ═══════════════════════════════════════

    PV.symbolCatalog.register({
        typeName:           'treemap-wow',
        displayName:        '\u05DE\u05E4\u05EA \u05E2\u05E5 WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'icons/wow-treemap.svg',
        getDefaultConfig: function () {
            return {
                DataShape:          'Table',
                Height:             500,
                Width:              800,
                Title:              '\u05DE\u05E4\u05EA \u05D1\u05E8\u05D9\u05D0\u05D5\u05EA \u05D0\u05E8\u05D2\u05D5\u05E0\u05D9',
                WarnPct:            70,
                CritPct:            90,
                MaxDepth:           1,
                Gap:                2,
                Decimals:           1,
                PathLevelsToSkip:   0,
                DemoMode:           true,
                fontFamily:         'Segoe UI',
                fontSize:           12
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA Treemap WOW',
        visObjectType: symbolVis
    });

})(window.PIVisualization);
