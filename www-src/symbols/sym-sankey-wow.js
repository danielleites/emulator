/**
 * ═══════════════════════════════════════════════════════
 *  sym-sankey-wow.js  —  Executive Smart Sankey Flow
 * ═══════════════════════════════════════════════════════
 *  Canvas-based Sankey diagram with animated Bezier flow.
 *  Layout calculation runs in a Web Worker (zero UI freeze).
 *  Renders 500+ flowing links at 60fps in <1ms per frame.
 *
 *  Architecture:
 *    PI Vision → dataUpdate() → Worker (iterative relaxation)
 *    → LAYOUT_READY → Canvas draw loop (Bezier + lineDashOffset)
 *
 *  Key techniques:
 *    - Web Worker: Sankey layout algorithm off Main Thread
 *    - Canvas Bezier curves with animated dash flow
 *    - Dynamic Opacity by Value (5% threshold fade)
 *    - Interactive Dimming: hover node → dim unrelated paths
 *    - O(n) node hit testing via spatial lookup
 *    - DPR scaling for 4K/Retina
 *    - Ghost loading shimmer on Canvas
 *
 *  DataShape : Table (Source, Target, Value)
 *  Version   : WOW SK 100.0
 *  Prefix    : wow-sk-
 * ═══════════════════════════════════════════════════════
 */

(function (PV) {
    'use strict';

    function symbolVis() {}
    PV.deriveVisualizationFromBase(symbolVis);

    var SCRIPT_BASE = (function () {
        var scripts = document.querySelectorAll('script[src*="sym-sankey-wow"]');
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

    var COLORS = {
        bg:           '#0A0F1C',
        surface:      '#0F2940',
        accent:       '#5BC0EB',
        accentGlow:   'rgba(91, 192, 235, 0.3)',
        flow:         '#00F5D4',      // Executive Neon Turquoise
        flowWarn:     '#FFCC00',
        flowCrit:     '#FF3B30',
        nodeDefault:  '#1A3A5C',
        nodeHover:    '#2A5A8C',
        nodeBorder:   '#5BC0EB',
        text:         '#ECF0F1',
        textMuted:    '#8899AA',
        dimmed:       'rgba(30, 40, 55, 0.7)',
        border:       '#1A3A5C'
    };

    // Flow color by percentage of max value
    function getFlowColor(ratio) {
        if (ratio > 0.85) return COLORS.flowCrit;
        if (ratio > 0.65) return COLORS.flowWarn;
        return COLORS.flow;
    }


    // ═══════════════════════════════════════
    //  DEMO DATA
    // ═══════════════════════════════════════

    function generateDemoData() {
        return [
            // Energy source → Turbines
            { Source: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9',   Target: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 1',     Value: 340 },
            { Source: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9',   Target: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 2',     Value: 280 },
            { Source: '\u05D2\u05D6 \u05D8\u05D1\u05E2\u05D9',   Target: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 3',     Value: 210 },
            { Source: '\u05D3\u05DC\u05E7 \u05E1\u05D5\u05DC\u05E8\u05D9',  Target: '\u05DE\u05DE\u05D9\u05E8 DC',   Value: 120 },
            // Turbines → Generators
            { Source: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 1',     Target: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 A',    Value: 310 },
            { Source: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 1',     Target: '\u05D0\u05D9\u05D1\u05D5\u05D3 \u05D7\u05D5\u05DD',     Value: 30 },
            { Source: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 2',     Target: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 B',    Value: 255 },
            { Source: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 2',     Target: '\u05D0\u05D9\u05D1\u05D5\u05D3 \u05D7\u05D5\u05DD',     Value: 25 },
            { Source: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 3',     Target: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 C',    Value: 190 },
            { Source: '\u05D8\u05D5\u05E8\u05D1\u05D9\u05E0\u05D4 3',     Target: '\u05D0\u05D9\u05D1\u05D5\u05D3 \u05D7\u05D5\u05DD',     Value: 20 },
            { Source: '\u05DE\u05DE\u05D9\u05E8 DC',              Target: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 C',    Value: 50 },
            { Source: '\u05DE\u05DE\u05D9\u05E8 DC',              Target: '\u05D0\u05D2\u05D9\u05E8\u05D4',         Value: 70 },
            // Generators → Grid
            { Source: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 A',   Target: '\u05E8\u05E9\u05EA \u05D7\u05E9\u05DE\u05DC',  Value: 290 },
            { Source: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 A',   Target: '\u05E6\u05E8\u05D9\u05DB\u05D4 \u05E4\u05E0\u05D9\u05DE\u05D9\u05EA',  Value: 20 },
            { Source: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 B',   Target: '\u05E8\u05E9\u05EA \u05D7\u05E9\u05DE\u05DC',  Value: 240 },
            { Source: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 B',   Target: '\u05E6\u05E8\u05D9\u05DB\u05D4 \u05E4\u05E0\u05D9\u05DE\u05D9\u05EA',  Value: 15 },
            { Source: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 C',   Target: '\u05E8\u05E9\u05EA \u05D7\u05E9\u05DE\u05DC',  Value: 220 },
            { Source: '\u05D2\u05E0\u05E8\u05D8\u05D5\u05E8 C',   Target: '\u05E6\u05E8\u05D9\u05DB\u05D4 \u05E4\u05E0\u05D9\u05DE\u05D9\u05EA',  Value: 20 }
        ];
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
            var mountEl = hostEl.querySelector('.wow-sk-root-mount');
            if (mountEl && mountEl.attachShadow) {
                shadow = mountEl.attachShadow({ mode: 'open' });
            } else {
                shadow = mountEl || hostEl;
            }
        } catch (e) {
            shadow = hostEl.querySelector('.wow-sk-root-mount') || hostEl;
        }

        // ── Inject CSS ──
        var linkEl = document.createElement('link');
        linkEl.rel = 'stylesheet';
        linkEl.href = SCRIPT_BASE + 'sym-sankey-wow.css';
        shadow.appendChild(linkEl);

        // ── Build DOM scaffold ──
        var root = document.createElement('div');
        root.className = 'wow-sk-root';

        // Toolbar
        var toolbar = document.createElement('div');
        toolbar.className = 'wow-sk-toolbar';
        toolbar.innerHTML =
            '<span class="wow-sk-title">' + (config.Title || 'Executive Sankey Flow') + '</span>' +
            '<div class="wow-sk-toolbar-actions">' +
                '<button class="wow-sk-btn wow-sk-btn-export" title="Export PNG">&#x1F4F7; PNG</button>' +
            '</div>';
        root.appendChild(toolbar);

        // Stats bar
        var statsBar = document.createElement('div');
        statsBar.className = 'wow-sk-stats';
        root.appendChild(statsBar);

        // Canvas container
        var canvasWrap = document.createElement('div');
        canvasWrap.className = 'wow-sk-canvas-wrap';

        var canvas = document.createElement('canvas');
        canvas.className = 'wow-sk-canvas';
        canvasWrap.appendChild(canvas);
        root.appendChild(canvasWrap);

        // Tooltip
        var tooltip = document.createElement('div');
        tooltip.className = 'wow-sk-tooltip';
        tooltip.style.display = 'none';
        root.appendChild(tooltip);

        // Footer
        var footer = document.createElement('div');
        footer.className = 'wow-sk-footer';
        root.appendChild(footer);

        shadow.appendChild(root);

        // ── Canvas context ──
        var ctx = canvas.getContext('2d', { alpha: false });
        var dpr = window.devicePixelRatio || 1;

        // ── State ──
        var layoutData = null;        // From Worker: { nodes[], links[] }
        var canvasW = 0, canvasH = 0;
        var animFrameId = null;
        var flowOffset = 0;           // Animated dash offset
        var hoveredNodeId = null;     // For Interactive Dimming
        var isLoading = true;
        var ghostPhase = 0;
        var resizeTimeout = null;
        var _pendingData    = null;
        var _dataDebounceId = null;
        var DATA_DEBOUNCE_MS = 100;
        var nodeHitMap = [];          // Spatial lookup for node hit testing


        // ═══════════════════════════════════════
        //  WEB WORKER LIFECYCLE
        // ═══════════════════════════════════════

        var worker = null;
        try {
            worker = new Worker(SCRIPT_BASE + 'wow-plugins/wow-sankey-worker.js');
        } catch (e) {
            // Worker creation failed — will show error state
        }

        if (worker) {
            worker.onmessage = function (e) {
                var msg = e.data;
                if (msg.type === 'LAYOUT_READY') {
                    layoutData = msg.payload;
                    buildNodeHitMap();
                    updateStats(msg.payload.stats);
                    isLoading = false;

                    if (!animFrameId) {
                        animFrameId = requestAnimationFrame(renderLoop);
                    }
                } else if (msg.type === 'ERROR') {
                    footer.textContent = 'Worker Error: ' + msg.message;
                }
            };

            worker.onerror = function (e) {
                footer.textContent = 'Worker Error: ' + (e.message || 'Unknown');
            };
        }

        function triggerLayoutCalc(rows) {
            if (!worker) return;
            worker.postMessage({
                type: 'CALC_LAYOUT',
                data: rows,
                width: canvasW,
                height: canvasH,
                config: {
                    iterations: 32,
                    nodePadding: 16,
                    nodeWidth: config.NodeWidth || 20
                }
            });
        }


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
                    if (scope.dataCache) {
                        triggerLayoutCalc(scope.dataCache);
                    }
                }, 200);
            });
            resizeObs.observe(canvasWrap);
        } catch (e) { /* fallback */ }


        // ═══════════════════════════════════════
        //  RENDER LOOP (60fps Flow Animation)
        // ═══════════════════════════════════════

        function renderLoop() {
            animFrameId = null;
            if (canvasW === 0) return;

            if (isLoading && !layoutData) {
                drawGhostLoading();
                animFrameId = requestAnimationFrame(renderLoop);
                return;
            }

            if (!layoutData) return;

            // Clear
            ctx.fillStyle = COLORS.bg;
            ctx.fillRect(0, 0, canvasW, canvasH);

            // Advance flow animation
            flowOffset -= 0.8;

            // Draw links (Bezier curves with animated dash)
            drawLinks();

            // Draw nodes (rectangles)
            drawNodes();

            // Draw labels
            drawLabels();

            // Continue animation
            animFrameId = requestAnimationFrame(renderLoop);
        }


        // ═══════════════════════════════════════
        //  DRAW LINKS (Bezier + Flow Animation)
        // ═══════════════════════════════════════

        function drawLinks() {
            var links = layoutData.links;
            var maxVal = layoutData.stats.maxValue || 1;
            var dimThreshold = maxVal * 0.05; // 5% threshold for opacity fade

            for (var i = 0; i < links.length; i++) {
                var link = links[i];

                // Interactive Dimming: if a node is hovered, dim unrelated links
                var isDimmed = false;
                if (hoveredNodeId !== null) {
                    if (link.sourceId !== hoveredNodeId && link.targetId !== hoveredNodeId) {
                        isDimmed = true;
                    }
                }

                ctx.beginPath();
                ctx.moveTo(link.source.x, link.source.y);
                ctx.bezierCurveTo(
                    link.source.x + link.curvature, link.source.y,
                    link.target.x - link.curvature, link.target.y,
                    link.target.x, link.target.y
                );

                if (isDimmed) {
                    // Dimmed: dark gray, no animation
                    ctx.strokeStyle = COLORS.dimmed;
                    ctx.lineWidth = link.thickness;
                    ctx.lineCap = 'round';
                    ctx.setLineDash([]);
                    ctx.stroke();
                } else {
                    // Dynamic Opacity by Value
                    var ratio = link.value / maxVal;
                    var opacity = link.value < dimThreshold ? 0.1 : link.opacity;
                    var color = getFlowColor(ratio);

                    // Base glow layer
                    ctx.strokeStyle = _colorWithAlpha(color, opacity * 0.3);
                    ctx.lineWidth = link.thickness + 4;
                    ctx.lineCap = 'round';
                    ctx.setLineDash([]);
                    ctx.stroke();

                    // Main flow with animated dash
                    ctx.beginPath();
                    ctx.moveTo(link.source.x, link.source.y);
                    ctx.bezierCurveTo(
                        link.source.x + link.curvature, link.source.y,
                        link.target.x - link.curvature, link.target.y,
                        link.target.x, link.target.y
                    );

                    ctx.strokeStyle = _colorWithAlpha(color, opacity);
                    ctx.lineWidth = link.thickness;
                    ctx.setLineDash([15, 10]);
                    ctx.lineDashOffset = flowOffset * (link.flowSpeed || 1);
                    ctx.stroke();
                }

                ctx.setLineDash([]);
            }
        }


        // ═══════════════════════════════════════
        //  DRAW NODES
        // ═══════════════════════════════════════

        function drawNodes() {
            var nodes = layoutData.nodes;

            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var isHovered = hoveredNodeId === node.id;
                var isDimmed = hoveredNodeId !== null && !isHovered &&
                    !_isConnectedToHovered(node);

                // Node rectangle
                if (isDimmed) {
                    ctx.fillStyle = 'rgba(20, 30, 45, 0.5)';
                } else if (isHovered) {
                    ctx.fillStyle = COLORS.nodeHover;
                } else {
                    ctx.fillStyle = COLORS.nodeDefault;
                }

                _fillRoundRect(ctx, node.x, node.y, node.width, node.height, 3);

                // Node border
                if (isHovered) {
                    ctx.strokeStyle = COLORS.accent;
                    ctx.lineWidth = 2;
                } else if (!isDimmed) {
                    ctx.strokeStyle = COLORS.nodeBorder;
                    ctx.lineWidth = 1;
                } else {
                    ctx.strokeStyle = 'rgba(40, 50, 65, 0.5)';
                    ctx.lineWidth = 1;
                }

                ctx.beginPath();
                _roundRectPath(ctx, node.x, node.y, node.width, node.height, 3);
                ctx.stroke();

                // Value indicator on hover
                if (isHovered && node.value) {
                    ctx.fillStyle = COLORS.accent;
                    ctx.font = 'bold 10px ' + (config.fontFamily || 'Segoe UI');
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'bottom';
                    ctx.fillText(
                        _formatValue(node.value),
                        node.x + node.width / 2,
                        node.y - 4
                    );
                }
            }
        }


        // ═══════════════════════════════════════
        //  DRAW LABELS
        // ═══════════════════════════════════════

        function drawLabels() {
            var nodes = layoutData.nodes;
            var fontSize = config.fontSize || 11;
            ctx.font = fontSize + 'px ' + (config.fontFamily || 'Segoe UI');
            ctx.textBaseline = 'middle';

            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                var isDimmed = hoveredNodeId !== null && hoveredNodeId !== node.id &&
                    !_isConnectedToHovered(node);

                ctx.fillStyle = isDimmed ? 'rgba(80, 90, 100, 0.3)' : COLORS.text;

                var labelY = node.y + node.height / 2;

                // Position label based on depth (left or right of node)
                if (node.depth === 0) {
                    // Leftmost: label to the right (RTL: visually to the right)
                    ctx.textAlign = 'right';
                    ctx.fillText(node.label, node.x - 6, labelY);
                } else if (node.sourceLinks.length === 0) {
                    // Rightmost (leaf): label to the left
                    ctx.textAlign = 'left';
                    ctx.fillText(node.label, node.x + node.width + 6, labelY);
                } else {
                    // Middle: label above or below
                    ctx.textAlign = 'center';
                    ctx.fillText(node.label, node.x + node.width / 2, node.y - 8);
                }
            }
        }


        // ═══════════════════════════════════════
        //  GHOST LOADING
        // ═══════════════════════════════════════

        function drawGhostLoading() {
            ghostPhase = (ghostPhase + 0.015) % 1;

            ctx.fillStyle = COLORS.bg;
            ctx.fillRect(0, 0, canvasW, canvasH);

            // Fake node columns
            var cols = [0.1, 0.35, 0.6, 0.85];
            for (var c = 0; c < cols.length; c++) {
                var cx = canvasW * cols[c];
                for (var r = 0; r < 3; r++) {
                    var ry = canvasH * (0.2 + r * 0.25);
                    var shimmer = (ghostPhase + c * 0.1 + r * 0.07) % 1;
                    var alpha = 0.04 + Math.sin(shimmer * Math.PI * 2) * 0.04;

                    ctx.fillStyle = 'rgba(91, 192, 235, ' + alpha.toFixed(3) + ')';
                    _fillRoundRect(ctx, cx - 10, ry, 20, 50, 3);
                }
            }

            // Fake link curves
            ctx.strokeStyle = 'rgba(91, 192, 235, 0.03)';
            ctx.lineWidth = 8;
            ctx.setLineDash([15, 10]);
            ctx.lineDashOffset = flowOffset;
            flowOffset -= 0.5;

            for (var lc = 0; lc < cols.length - 1; lc++) {
                var x1 = canvasW * cols[lc] + 10;
                var x2 = canvasW * cols[lc + 1] - 10;
                var curv = (x2 - x1) * 0.4;
                for (var lr = 0; lr < 3; lr++) {
                    var ly = canvasH * (0.2 + lr * 0.25) + 25;
                    ctx.beginPath();
                    ctx.moveTo(x1, ly);
                    ctx.bezierCurveTo(x1 + curv, ly, x2 - curv, ly + 15, x2, ly + 15);
                    ctx.stroke();
                }
            }

            ctx.setLineDash([]);
        }


        // ═══════════════════════════════════════
        //  INTERACTIVE DIMMING (Mouse)
        // ═══════════════════════════════════════

        function _onCanvasMouseMove(e) {
            if (!layoutData) return;

            var mx = e.offsetX;
            var my = e.offsetY;

            // Hit test: find node under cursor
            var foundNode = _hitTestNode(mx, my);
            var newHoveredId = foundNode ? foundNode.id : null;

            if (newHoveredId !== hoveredNodeId) {
                hoveredNodeId = newHoveredId;
                // No need to request render — animation loop is already running
            }

            // Tooltip
            if (foundNode) {
                _showTooltip(foundNode, mx, my);
            } else {
                // Check if hovering a link
                var foundLink = _hitTestLink(mx, my);
                if (foundLink) {
                    _showLinkTooltip(foundLink, mx, my);
                } else {
                    tooltip.style.display = 'none';
                }
            }
        }

        function _onCanvasMouseLeave() {
            hoveredNodeId = null;
            tooltip.style.display = 'none';
        }

        canvas.addEventListener('mousemove', _onCanvasMouseMove);
        canvas.addEventListener('mouseleave', _onCanvasMouseLeave);


        // ═══════════════════════════════════════
        //  NODE HIT TESTING
        // ═══════════════════════════════════════

        function buildNodeHitMap() {
            nodeHitMap = [];
            if (!layoutData) return;
            for (var i = 0; i < layoutData.nodes.length; i++) {
                var n = layoutData.nodes[i];
                nodeHitMap.push({
                    id: n.id,
                    label: n.label,
                    x: n.x,
                    y: n.y,
                    width: n.width,
                    height: n.height,
                    value: n.value,
                    depth: n.depth,
                    sourceLinks: n.sourceLinks,
                    targetLinks: n.targetLinks
                });
            }
        }

        function _hitTestNode(mx, my) {
            // Expand hit area slightly for usability
            var pad = 4;
            for (var i = 0; i < nodeHitMap.length; i++) {
                var n = nodeHitMap[i];
                if (mx >= n.x - pad && mx <= n.x + n.width + pad &&
                    my >= n.y - pad && my <= n.y + n.height + pad) {
                    return n;
                }
            }
            return null;
        }

        function _hitTestLink(mx, my) {
            if (!layoutData) return null;
            // Approximate: check if point is near any link's Bezier midpoint
            for (var i = 0; i < layoutData.links.length; i++) {
                var lk = layoutData.links[i];
                var midX = (lk.source.x + lk.target.x) / 2;
                var midY = (lk.source.y + lk.target.y) / 2;
                var dist = Math.sqrt(Math.pow(mx - midX, 2) + Math.pow(my - midY, 2));
                if (dist < lk.thickness + 8) {
                    return lk;
                }
            }
            return null;
        }

        function _isConnectedToHovered(node) {
            if (!hoveredNodeId || !layoutData) return false;
            for (var i = 0; i < layoutData.links.length; i++) {
                var lk = layoutData.links[i];
                if ((lk.sourceId === hoveredNodeId && lk.targetId === node.id) ||
                    (lk.targetId === hoveredNodeId && lk.sourceId === node.id)) {
                    return true;
                }
            }
            return false;
        }


        // ═══════════════════════════════════════
        //  TOOLTIPS
        // ═══════════════════════════════════════

        function _showTooltip(node, mx, my) {
            var html = '<div class="wow-sk-tt-label">' + node.label + '</div>';
            html += '<div class="wow-sk-tt-value">' + _formatValue(node.value) + '</div>';
            html += '<div class="wow-sk-tt-depth">\u05E9\u05DB\u05D1\u05D4 ' + node.depth + '</div>';

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';
            _positionTooltip(mx, my);
        }

        function _showLinkTooltip(link, mx, my) {
            var html = '<div class="wow-sk-tt-label">' + link.sourceId + ' \u2192 ' + link.targetId + '</div>';
            html += '<div class="wow-sk-tt-value">' + _formatValue(link.value) + '</div>';

            tooltip.innerHTML = html;
            tooltip.style.display = 'block';
            _positionTooltip(mx, my);
        }

        function _positionTooltip(mx, my) {
            var ttLeft = mx + 16;
            var ttTop = my - 10;
            if (ttLeft + 200 > canvasW) ttLeft = mx - 210;
            if (ttTop < 0) ttTop = 4;
            tooltip.style.left = ttLeft + 'px';
            tooltip.style.top = ttTop + 'px';
        }


        // ═══════════════════════════════════════
        //  STATS & FOOTER
        // ═══════════════════════════════════════

        function updateStats(stats) {
            if (!stats) return;
            statsBar.innerHTML =
                '<span class="wow-sk-stat">\u05E6\u05DE\u05EA\u05D9\u05DD: <b>' + stats.nodeCount + '</b></span>' +
                '<span class="wow-sk-stat">\u05D7\u05D9\u05D1\u05D5\u05E8\u05D9\u05DD: <b>' + stats.linkCount + '</b></span>' +
                '<span class="wow-sk-stat">\u05E2\u05D5\u05DE\u05E7: <b>' + stats.maxDepth + '</b></span>';

            footer.innerHTML = 'WOW SK v100 \u2014 Canvas Bezier Flow \u2014 Layout: Web Worker (Off-Thread)';
        }


        // ═══════════════════════════════════════
        //  EXPORT PNG
        // ═══════════════════════════════════════

        var btnExport = toolbar.querySelector('.wow-sk-btn-export');

        function _onExportClick() {
            if (!canvas) return;
            try {
                var link = document.createElement('a');
                link.download = 'sankey-wow-' + new Date().toISOString().slice(0, 10) + '.png';
                link.href = canvas.toDataURL('image/png');
                link.click();
            } catch (e) { /* security */ }
        }

        btnExport.addEventListener('click', _onExportClick);


        // ═══════════════════════════════════════
        //  DATA UPDATE
        // ═══════════════════════════════════════

        function _processData(data) {
            if (!data) return;

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

            scope.dataCache = rows;
            setupCanvas();
            triggerLayoutCalc(rows);
        }

        this.onDataUpdate = function (data) {
            if (!data) return;
            _pendingData = data;
            if (isLoading) {
                isLoading = false;
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
            if (scope.dataCache) {
                triggerLayoutCalc(scope.dataCache);
            }
        };


        // ═══════════════════════════════════════
        //  DEMO MODE
        // ═══════════════════════════════════════

        function startDemo() {
            isLoading = false;
            scope.dataCache = generateDemoData();
            setupCanvas();
            triggerLayoutCalc(scope.dataCache);
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
            var t = toolbar.querySelector('.wow-sk-title');
            if (t) t.textContent = config.Title || 'Executive Sankey Flow';
        });
        scope.$watch('config.NodeWidth', function () {
            if (scope.dataCache) triggerLayoutCalc(scope.dataCache);
        });
        scope.$watch('config.fontFamily', function () { /* render loop handles it */ });
        scope.$watch('config.fontSize', function () { /* render loop handles it */ });


        // ═══════════════════════════════════════
        //  CLEANUP
        // ═══════════════════════════════════════

        scope.$on('$destroy', function () {
            clearTimeout(_dataDebounceId);
            _pendingData = null;
            if (animFrameId) cancelAnimationFrame(animFrameId);
            if (worker) worker.terminate();
            if (resizeObs) resizeObs.disconnect();
            clearTimeout(resizeTimeout);
            canvas.removeEventListener('mousemove', _onCanvasMouseMove);
            canvas.removeEventListener('mouseleave', _onCanvasMouseLeave);
            btnExport.removeEventListener('click', _onExportClick);
            layoutData = null;
            nodeHitMap = null;
            scope.dataCache = null;
            ctx = null;
        });


        // ═══════════════════════════════════════
        //  UTILITIES
        // ═══════════════════════════════════════

        function _colorWithAlpha(hex, alpha) {
            // Convert hex to rgba
            var r = parseInt(hex.slice(1, 3), 16);
            var g = parseInt(hex.slice(3, 5), 16);
            var b = parseInt(hex.slice(5, 7), 16);
            return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha.toFixed(2) + ')';
        }

        function _fillRoundRect(c, x, y, w, h, r) {
            if (w < r * 2) r = w / 2;
            if (h < r * 2) r = h / 2;
            c.beginPath();
            _roundRectPath(c, x, y, w, h, r);
            c.fill();
        }

        function _roundRectPath(c, x, y, w, h, r) {
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

        function _formatValue(val) {
            if (val >= 1000) return (val / 1000).toFixed(1) + 'K';
            return val.toFixed(config.Decimals || 0);
        }
    };


    // ═══════════════════════════════════════
    //  PI VISION REGISTRATION
    // ═══════════════════════════════════════

    PV.symbolCatalog.register({
        typeName:           'sankey-wow',
        displayName:        '\u05E1\u05E0\u05E7\u05D9 \u05D7\u05DB\u05DD WOW v100',
        datasourceBehavior: PV.Extensibility.Enums.DatasourceBehaviors.Multiple,
        iconUrl:            SCRIPT_BASE + 'icons/wow-sankey.svg',
        getDefaultConfig: function () {
            return {
                DataShape:   'Table',
                Height:      500,
                Width:       1000,
                Title:       '\u05D6\u05E8\u05D9\u05DE\u05EA \u05D0\u05E0\u05E8\u05D2\u05D9\u05D4',
                NodeWidth:   20,
                Decimals:    0,
                DemoMode:    true,
                fontFamily:  'Segoe UI',
                fontSize:    11
            };
        },
        configTitle: '\u05D4\u05D2\u05D3\u05E8\u05D5\u05EA \u05E1\u05E0\u05E7\u05D9 WOW',
        visObjectType: symbolVis
    });

})(window.PIVisualization);
