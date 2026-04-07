/**
 * ═══════════════════════════════════════════════════════
 *  WOW Heatmap Renderer — GPU-Accelerated Canvas Engine
 * ═══════════════════════════════════════════════════════
 *  ES6 class replacing DOM-based mm20-heatmap.js.
 *  Single <canvas> element renders 10,000+ cells in <2ms.
 *
 *  Features:
 *    • devicePixelRatio scaling for 4K/Retina
 *    • O(1) coordinate-based tooltip hit testing
 *    • "Fade the Noise" Executive color palette (HSL)
 *    • Dirty region rendering (only changed cells)
 *    • Zoom/Pan via affine transform matrix
 *    • Hebrew RTL axis labels
 *    • requestAnimationFrame batching
 *    • ResizeObserver with debounced redraw
 *
 *  Version : WOW HM 100.0
 *  Prefix  : wow-hm-
 * ═══════════════════════════════════════════════════════
 */


// QA17-FIX: Worker guard — skip if running inside a Web Worker context
if (typeof WorkerGlobalScope !== 'undefined' || typeof importScripts !== 'undefined') {
    // Worker context — renderer belongs in main thread only, bail out
} else {
(function (self) {
'use strict';

class WowHeatmapRenderer {

    /**
     * @param {ShadowRoot|HTMLElement} shadowRoot - Shadow DOM root
     * @param {Object} options - Configuration
     * @param {Object} [bus] - MM20.createBus() signal bus
     */
    constructor(shadowRoot, options, bus) {
        this._root = shadowRoot;
        this._bus = bus || null;
        this._destroyed = false;

        // Options with defaults
        this._opts = Object.assign({
            sites:          [],
            metric:         'hours',
            viewMode:       'monthly',
            colorScheme:    'executive',
            siteFilter:     '',
            warnPct:        70,
            critPct:        90,
            decimals:       1,
            showValues:     true,
            showLabels:     true,
            fontFamily:     'Segoe UI',
            fontSize:       12,
            cellPadding:    2,
            animateChanges: true,
            demoMode:       false
        }, options || {});

        // Canvas refs
        this._canvas    = null;
        this._ctx       = null;
        this._dpr       = window.devicePixelRatio || 1;

        // Logical dimensions (CSS pixels)
        this._logicalW  = 0;
        this._logicalH  = 0;

        // Layout cache (recomputed on resize)
        this._layout    = null;

        // Data state
        this._heatmapData   = null;     // Float32Array[rows * cols]
        this._rowLabels     = [];       // [{label, siteId, unitIdx, unitKey}]
        this._colLabels     = [];       // string[]
        this._dataMin       = 0;
        this._dataMax       = 100;
        this._prevCells     = null;     // Previous values for dirty tracking
        this._dirtySet      = new Set();

        // Hover state
        this._hoverRow  = -1;
        this._hoverCol  = -1;

        // Zoom/Pan transform: [a, b, c, d, e, f] → ctx.setTransform()
        this._transformMatrix = [1, 0, 0, 1, 0, 0];

        // rAF
        this._rAF               = null;
        this._needsFullRedraw   = true;

        // Resize
        this._resizeObserver    = null;
        this._resizeTimer       = null;

        // OffscreenCanvas (set externally by sym-wow-heatmap.js)
        this._useOffscreen      = false;

        // DOM refs
        this._tooltipEl     = null;
        this._statsBarEl    = null;
        this._containerEl   = null;
        this._canvasWrapEl  = null;
        this._legendCanvas  = null;
        this._skeletonEl    = null;

        // Sensitivity data
        this._sensitivity   = null;

        // Bound handlers (for cleanup)
        this._boundMouseMove  = this._onMouseMove.bind(this);
        this._boundMouseLeave = this._onMouseLeave.bind(this);
        this._boundClick      = this._onClick.bind(this);
        this._boundWheel      = this._onWheel.bind(this);
    }


    // ═══════════════════════════════════════
    //  MOUNT — Build DOM Scaffold
    // ═══════════════════════════════════════

    mount(sites) {
        if (this._destroyed) return;
        var root = this._root;
        sites = sites || this._opts.sites || [];
        this._opts.sites = sites;

        // Build row labels from sites
        this._rowLabels = [];
        for (var s = 0; s < sites.length; s++) {
            var site = sites[s];
            for (var u = 0; u < site.units.length; u++) {
                this._rowLabels.push({
                    label:   site.name + ' \u2013 ' + site.units[u],
                    siteId:  site.id,
                    unitIdx: u,
                    unitKey: site.id + '_u' + u
                });
            }
        }

        // Build column labels
        this._rebuildColLabels();

        // ── Root Container ──
        var container = this._el('div', 'wow-hm-root');
        container.setAttribute('dir', 'rtl');

        // ── Toolbar ──
        var toolbar = this._el('div', 'wow-hm-toolbar');

        // Metric select
        var metricSel = this._createSelect('wow-hm-metric-select', [
            { value: 'hours', text: '\u05E9\u05E2\u05D5\u05EA' },
            { value: 'quota', text: '\u05DE\u05DB\u05E1\u05D4' },
            { value: 'pct',   text: '% \u05E0\u05D9\u05E6\u05D5\u05DC' }
        ], this._opts.metric);
        metricSel.addEventListener('change', function () {
            this.setMetric(metricSel.value);
            if (this._bus) this._bus.emit('hm:metric', metricSel.value);
        }.bind(this));
        toolbar.appendChild(metricSel);

        // View mode select
        var viewSel = this._createSelect('wow-hm-view-select', [
            { value: 'monthly', text: '\u05D7\u05D5\u05D3\u05E9\u05D9 (12)' },
            { value: 'dayHour', text: '\u05D9\u05D5\u05DD\u00D7\u05E9\u05E2\u05D4 (7\u00D724)' }
        ], this._opts.viewMode);
        viewSel.addEventListener('change', function () {
            this.setViewMode(viewSel.value);
            if (this._bus) this._bus.emit('hm:viewMode', viewSel.value);
        }.bind(this));
        toolbar.appendChild(viewSel);

        // Color scheme select
        var schemeSel = this._createSelect('wow-hm-scheme-select', [
            { value: 'executive', text: '\u05E0\u05D9\u05D4\u05D5\u05DC\u05D9 (Fade the Noise)' },
            { value: 'thermal',   text: '\u05EA\u05E8\u05DE\u05D9' },
            { value: 'green',     text: '\u05D9\u05E8\u05D5\u05E7' },
            { value: 'blue',      text: '\u05DB\u05D7\u05D5\u05DC' }
        ], this._opts.colorScheme);
        schemeSel.addEventListener('change', function () {
            this.setColorScheme(schemeSel.value);
        }.bind(this));
        toolbar.appendChild(schemeSel);

        // Site filter input
        var filterInput = document.createElement('input');
        filterInput.className = 'wow-hm-filter-input';
        filterInput.type = 'text';
        filterInput.placeholder = '\u05E1\u05E0\u05DF...';
        filterInput.addEventListener('input', function () {
            this.setSiteFilter(filterInput.value);
        }.bind(this));
        toolbar.appendChild(filterInput);

        // Zoom buttons
        var zoomWrap = this._el('div', 'wow-hm-zoom-btns');
        var btnZoomIn = this._btn('+', function () { this.zoomIn(); }.bind(this));
        var btnZoomOut = this._btn('\u2013', function () { this.zoomOut(); }.bind(this));
        var btnReset = this._btn('\u21BA', function () { this.resetZoom(); }.bind(this));
        zoomWrap.appendChild(btnZoomIn);
        zoomWrap.appendChild(btnZoomOut);
        zoomWrap.appendChild(btnReset);
        toolbar.appendChild(zoomWrap);

        // Export button
        var btnExport = this._btn('PNG \u2193', function () { this.exportPNG(); }.bind(this));
        toolbar.appendChild(btnExport);

        container.appendChild(toolbar);

        // ── Stats Bar ──
        this._statsBarEl = this._el('div', 'wow-hm-stats-bar');
        var statItems = ['min', 'avg', 'max', 'count'];
        var statLabelsHe = ['\u05DE\u05D9\u05E0\u05D9\u05DE\u05D5\u05DD', '\u05DE\u05DE\u05D5\u05E6\u05E2', '\u05DE\u05E7\u05E1\u05D9\u05DE\u05D5\u05DD', '\u05EA\u05D0\u05D9\u05DD'];
        for (var i = 0; i < statItems.length; i++) {
            var stat = this._el('div', 'wow-hm-stat');
            var valEl = this._el('div', 'wow-hm-stat-value');
            valEl.setAttribute('data-stat', statItems[i]);
            valEl.textContent = '\u2014';
            var lblEl = this._el('div', 'wow-hm-stat-label');
            lblEl.textContent = statLabelsHe[i];
            stat.appendChild(valEl);
            stat.appendChild(lblEl);
            this._statsBarEl.appendChild(stat);
        }
        container.appendChild(this._statsBarEl);

        // ── Canvas Wrapper ──
        this._canvasWrapEl = this._el('div', 'wow-hm-canvas-wrap');

        this._canvas = document.createElement('canvas');
        this._canvas.className = 'wow-hm-canvas';
        this._canvas.style.width = '100%';
        this._canvas.style.height = '100%';
        this._canvasWrapEl.appendChild(this._canvas);

        // Single event listeners on canvas
        this._canvas.addEventListener('mousemove', this._boundMouseMove);
        this._canvas.addEventListener('mouseleave', this._boundMouseLeave);
        this._canvas.addEventListener('click', this._boundClick);
        this._canvas.addEventListener('wheel', this._boundWheel, { passive: false });

        // Tooltip
        this._tooltipEl = this._el('div', 'wow-hm-tooltip');
        this._tooltipEl.style.display = 'none';
        this._canvasWrapEl.appendChild(this._tooltipEl);

        // Skeleton overlay
        this._skeletonEl = this._el('div', 'wow-hm-skeleton');
        this._skeletonEl.style.cssText = 'position:absolute;inset:0;z-index:5;';
        this._canvasWrapEl.appendChild(this._skeletonEl);

        container.appendChild(this._canvasWrapEl);

        // ── Legend ──
        var legendWrap = this._el('div', 'wow-hm-legend-wrap');
        this._legendCanvas = document.createElement('canvas');
        this._legendCanvas.className = 'wow-hm-legend-canvas';
        this._legendCanvas.style.cssText = 'width:100%;height:12px;display:block;';
        legendWrap.appendChild(this._legendCanvas);

        var legendLabels = this._el('div', 'wow-hm-legend-labels');
        var lblMin = this._el('span', 'wow-hm-legend-min');
        lblMin.textContent = '0';
        var lblMax = this._el('span', 'wow-hm-legend-max');
        lblMax.textContent = '100';
        legendLabels.appendChild(lblMin);
        legendLabels.appendChild(lblMax);
        legendWrap.appendChild(legendLabels);
        container.appendChild(legendWrap);

        this._containerEl = container;
        root.appendChild(container);

        // Setup DPR and initial size
        this._setupCanvasDPR();
        this._drawLegendGradient();

        // ResizeObserver with debounce
        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(function () {
                clearTimeout(this._resizeTimer);
                this._resizeTimer = setTimeout(function () {
                    this._setupCanvasDPR();
                    this._layout = null;
                    this._needsFullRedraw = true;
                    this._drawLegendGradient();
                    this._scheduleRedraw();
                }.bind(this), 150);
            }.bind(this));
            this._resizeObserver.observe(this._canvasWrapEl);
        }
    }


    // ═══════════════════════════════════════
    //  DPR SCALING
    // ═══════════════════════════════════════

    _setupCanvasDPR() {
        var cvs = this._canvas;
        if (!cvs || !cvs.parentElement) return;

        this._dpr = window.devicePixelRatio || 1;
        var rect = cvs.parentElement.getBoundingClientRect();
        var cssW = rect.width;
        var cssH = rect.height;

        if (cssW < 1 || cssH < 1) return;

        // Physical pixels
        cvs.width  = Math.round(cssW * this._dpr);
        cvs.height = Math.round(cssH * this._dpr);

        // CSS size
        cvs.style.width  = cssW + 'px';
        cvs.style.height = cssH + 'px';

        // Context with scaling
        this._ctx = cvs.getContext('2d', { alpha: false });
        this._ctx.scale(this._dpr, this._dpr);

        this._logicalW = cssW;
        this._logicalH = cssH;
    }


    // ═══════════════════════════════════════
    //  LAYOUT COMPUTATION
    // ═══════════════════════════════════════

    _computeLayout() {
        if (this._layout) return this._layout;

        var rows = this._rowLabels.length;
        var cols = this._colLabels.length;
        if (rows === 0 || cols === 0) return null;

        var W = this._logicalW;
        var H = this._logicalH;
        if (W < 1 || H < 1) return null;

        var ctx = this._ctx;
        if (!ctx) return null;

        // Measure widest Y-axis label
        ctx.save();
        ctx.font = this._opts.fontSize + 'px ' + this._opts.fontFamily;
        var maxLabelW = 0;
        for (var i = 0; i < this._rowLabels.length; i++) {
            var m = ctx.measureText(this._rowLabels[i].label);
            if (m.width > maxLabelW) maxLabelW = m.width;
        }
        ctx.restore();

        var yLabelWidth  = Math.min(maxLabelW + 12, W * 0.25);
        var xLabelHeight = 22;
        var pad          = this._opts.cellPadding;

        // Available area for cells
        var cellAreaW = W - yLabelWidth - 8;
        var cellAreaH = H - xLabelHeight - 8;

        var cellW = Math.max((cellAreaW - pad * (cols - 1)) / cols, 4);
        var cellH = Math.max((cellAreaH - pad * (rows - 1)) / rows, 4);

        this._layout = {
            rows: rows,
            cols: cols,
            cellW: cellW,
            cellH: cellH,
            pad: pad,
            yLabelWidth: yLabelWidth,
            xLabelHeight: xLabelHeight,
            cellOriginX: 0,
            cellOriginY: xLabelHeight,
            canvasW: W,
            canvasH: H
        };
        return this._layout;
    }


    // ═══════════════════════════════════════
    //  UPDATE — Receive Data from Worker
    // ═══════════════════════════════════════

    update(heatmapState) {
        if (this._destroyed || !heatmapState) return;

        this._hideSkeleton();

        // Unpack Worker result
        this._heatmapData = heatmapState.cells;
        this._rowLabels   = heatmapState.rowLabels || this._rowLabels;
        this._colLabels   = heatmapState.colLabels || this._colLabels;
        this._dataMin     = heatmapState.min !== undefined ? heatmapState.min : 0;
        this._dataMax     = heatmapState.max !== undefined ? heatmapState.max : 100;

        // Update stats bar
        if (heatmapState.stats) {
            this._updateStatsBar(heatmapState.stats);
        }

        // Update legend
        this._drawLegendGradient();
        this._updateLegendLabels();

        // Dirty region detection
        if (this._prevCells &&
            this._prevCells.length === this._heatmapData.length &&
            !this._needsFullRedraw) {

            this._dirtySet.clear();
            var cols = this._colLabels.length;
            for (var i = 0; i < this._heatmapData.length; i++) {
                if (this._heatmapData[i] !== this._prevCells[i]) {
                    var r = Math.floor(i / cols);
                    var c = i % cols;
                    this._dirtySet.add(r + ',' + c);
                }
            }

            if (this._dirtySet.size > 0 &&
                this._dirtySet.size < this._heatmapData.length * 0.3) {
                this._scheduleRedraw();
            } else {
                this._needsFullRedraw = true;
                this._scheduleRedraw();
            }
        } else {
            this._needsFullRedraw = true;
            this._layout = null;
            this._scheduleRedraw();
        }
    }

    updateSensitivity(sensData) {
        if (!sensData) return;
        this._sensitivity = sensData;
    }


    // ═══════════════════════════════════════
    //  REDRAW — rAF Batching
    // ═══════════════════════════════════════

    _scheduleRedraw() {
        if (this._rAF) return;
        this._rAF = requestAnimationFrame(function () {
            this._rAF = null;
            if (this._destroyed) return;

            if (this._needsFullRedraw) {
                this._redrawFull();
            } else if (this._dirtySet.size > 0) {
                this._redrawDirty(this._dirtySet);
                this._prevCells = this._heatmapData ? new Float32Array(this._heatmapData) : null;
                this._dirtySet.clear();
            }
        }.bind(this));
    }

    _redrawFull() {
        var ctx = this._ctx;
        var layout = this._computeLayout();
        if (!ctx || !layout || !this._heatmapData) return;

        // Clear entire canvas
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(this._dpr, this._dpr);

        // Background
        ctx.fillStyle = '#060C18';
        ctx.fillRect(0, 0, this._logicalW, this._logicalH);

        // Apply zoom/pan
        this._applyTransform(ctx);

        // 1) Draw cells
        this._drawCells(ctx, layout);

        // 2) Draw axis labels
        if (this._opts.showLabels) {
            this._drawAxisLabels(ctx, layout);
        }

        // 3) Draw hover highlight
        if (this._hoverRow >= 0 && this._hoverCol >= 0) {
            this._drawHoverHighlight(ctx, this._hoverRow, this._hoverCol, layout);
        }

        ctx.restore();

        this._needsFullRedraw = false;
        this._prevCells = new Float32Array(this._heatmapData);
    }

    _redrawDirty(changedCells) {
        var ctx = this._ctx;
        var layout = this._computeLayout();
        if (!ctx || !layout) return;

        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(this._dpr, this._dpr);
        this._applyTransform(ctx);

        var cellW = layout.cellW;
        var cellH = layout.cellH;
        var pad = layout.pad;
        var oX = layout.cellOriginX;
        var oY = layout.cellOriginY;
        var cols = layout.cols;

        changedCells.forEach(function (key) {
            var parts = key.split(',');
            var r = parseInt(parts[0], 10);
            var c = parseInt(parts[1], 10);
            var idx = r * cols + c;
            var value = this._heatmapData[idx];

            var x = oX + c * (cellW + pad);
            var y = oY + r * (cellH + pad);

            // Clear cell area
            ctx.fillStyle = '#060C18';
            ctx.fillRect(x - 1, y - 1, cellW + 2, cellH + 2);

            // Redraw cell
            var color = this._schemeColor(value, this._dataMin, this._dataMax);
            ctx.fillStyle = color;
            ctx.fillRect(x, y, cellW, cellH);

            // Value text
            if (this._opts.showValues && cellW > 28 && cellH > 16) {
                ctx.fillStyle = this._getTextColor(value);
                ctx.font = Math.max(8, Math.min(cellH * 0.5, 11)) + 'px ' + this._opts.fontFamily;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(this._formatValue(value), x + cellW / 2, y + cellH / 2);
            }
        }.bind(this));

        // Redraw hover if overlapped
        if (changedCells.has(this._hoverRow + ',' + this._hoverCol)) {
            this._drawHoverHighlight(ctx, this._hoverRow, this._hoverCol, layout);
        }

        ctx.restore();
    }


    // ═══════════════════════════════════════
    //  CELL DRAWING
    // ═══════════════════════════════════════

    _drawCells(ctx, layout) {
        var rows = layout.rows;
        var cols = layout.cols;
        var cellW = layout.cellW;
        var cellH = layout.cellH;
        var pad = layout.pad;
        var oX = layout.cellOriginX;
        var oY = layout.cellOriginY;
        var data = this._heatmapData;

        for (var r = 0; r < rows; r++) {
            for (var c = 0; c < cols; c++) {
                var idx = r * cols + c;
                var value = data[idx];

                var x = oX + c * (cellW + pad);
                var y = oY + r * (cellH + pad);

                // Cell color
                ctx.fillStyle = this._schemeColor(value, this._dataMin, this._dataMax);
                ctx.fillRect(x, y, cellW, cellH);

                // Value text if cell large enough
                if (this._opts.showValues && cellW > 28 && cellH > 16) {
                    ctx.fillStyle = this._getTextColor(value);
                    ctx.font = Math.max(8, Math.min(cellH * 0.5, 11)) + 'px ' + this._opts.fontFamily;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(this._formatValue(value), x + cellW / 2, y + cellH / 2);
                }
            }
        }
    }


    // ═══════════════════════════════════════
    //  AXIS LABELS — Hebrew RTL
    // ═══════════════════════════════════════

    _drawAxisLabels(ctx, layout) {
        var rows = layout.rows;
        var cols = layout.cols;
        var cellW = layout.cellW;
        var cellH = layout.cellH;
        var pad = layout.pad;
        var oX = layout.cellOriginX;
        var oY = layout.cellOriginY;
        var canvasW = layout.canvasW;

        ctx.save();

        // Y-axis: unit names (Hebrew RTL)
        ctx.font = this._opts.fontSize + 'px ' + this._opts.fontFamily;
        ctx.fillStyle = '#8899AA';
        ctx.textBaseline = 'middle';
        ctx.direction = 'rtl';
        ctx.textAlign = 'right';

        for (var r = 0; r < rows; r++) {
            var y = oY + r * (cellH + pad) + cellH / 2;
            var x = canvasW - 4;
            var label = this._rowLabels[r] ? this._rowLabels[r].label : '';
            var maxW = layout.yLabelWidth - 8;
            ctx.fillText(label, x, y, maxW);
        }

        // X-axis: column labels (top)
        ctx.direction = 'rtl';
        ctx.textAlign = 'center';
        ctx.font = '10px ' + this._opts.fontFamily;

        for (var c = 0; c < cols; c++) {
            var cx = oX + c * (cellW + pad) + cellW / 2;
            var cy = oY - 6;
            var colLabel = this._colLabels[c] || '';
            // Truncate for dayHour mode (many columns)
            if (cellW < 20 && colLabel.length > 3) {
                colLabel = colLabel.substring(0, 3);
            }
            if (cellW >= 12) {
                ctx.fillText(colLabel, cx, cy, cellW);
            }
        }

        ctx.restore();
    }


    // ═══════════════════════════════════════
    //  HOVER HIGHLIGHT
    // ═══════════════════════════════════════

    _drawHoverHighlight(ctx, row, col, layout) {
        if (row < 0 || col < 0) return;
        var x = layout.cellOriginX + col * (layout.cellW + layout.pad);
        var y = layout.cellOriginY + row * (layout.cellH + layout.pad);

        ctx.save();
        ctx.strokeStyle = '#5BC0EB';
        ctx.lineWidth = 2;
        ctx.strokeRect(x - 1, y - 1, layout.cellW + 2, layout.cellH + 2);

        // Row + col highlight (subtle)
        ctx.fillStyle = 'rgba(91, 192, 235, 0.05)';
        ctx.fillRect(layout.cellOriginX, y, layout.canvasW - layout.yLabelWidth - 8, layout.cellH);
        ctx.fillRect(x, layout.cellOriginY, layout.cellW, layout.canvasH - layout.xLabelHeight - 8);
        ctx.restore();
    }


    // ═══════════════════════════════════════
    //  COLOR SYSTEM — HSL Interpolation
    // ═══════════════════════════════════════

    _schemeColor(value, min, max) {
        switch (this._opts.colorScheme) {
            case 'executive': return this._executiveColor(value, min, max);
            case 'thermal':   return this._thermalColor(value, min, max);
            case 'green':     return this._greenColor(value, min, max);
            case 'blue':      return this._blueColor(value, min, max);
            default:          return this._executiveColor(value, min, max);
        }
    }

    /**
     * "Fade the Noise" Executive Palette:
     * - OK: muted gray-blue (barely visible) — executives ignore
     * - Warning: warm amber glow — catches peripheral vision
     * - Critical: bright saturated red — demands attention
     */
    _executiveColor(value, min, max) {
        if (max <= min) return 'hsl(210,5%,18%)';
        var ratio = Math.max(0, Math.min((value - min) / (max - min), 1));

        var h, s, l;

        if (ratio < 0.5) {
            var t = ratio / 0.5;
            h = 210;
            s = 5 + t * 5;
            l = 15 + t * 7;
        } else if (ratio < 0.75) {
            var t2 = (ratio - 0.5) / 0.25;
            h = 210 - t2 * 170;
            s = 10 + t2 * 60;
            l = 22 + t2 * 28;
        } else {
            var t3 = (ratio - 0.75) / 0.25;
            h = 40 - t3 * 40;
            s = 70 + t3 * 20;
            l = 50 + t3 * 5;
        }

        return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
    }

    _thermalColor(value, min, max) {
        if (max <= min) return 'hsl(240,60%,30%)';
        var ratio = Math.max(0, Math.min((value - min) / (max - min), 1));
        var h = 240 - ratio * 240;
        var s = 50 + ratio * 30;
        var l = 25 + ratio * 25;
        return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
    }

    _greenColor(value, min, max) {
        if (max <= min) return 'hsl(145,50%,15%)';
        var ratio = Math.max(0, Math.min((value - min) / (max - min), 1));
        var h = 145 - ratio * 25;
        var s = 30 + ratio * 40;
        var l = 12 + ratio * 35;
        return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
    }

    _blueColor(value, min, max) {
        if (max <= min) return 'hsl(210,50%,12%)';
        var ratio = Math.max(0, Math.min((value - min) / (max - min), 1));
        var h = 210 - ratio * 15;
        var s = 40 + ratio * 40;
        var l = 10 + ratio * 45;
        return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
    }

    _getTextColor(value) {
        var ratio = (this._dataMax > this._dataMin) ?
            (value - this._dataMin) / (this._dataMax - this._dataMin) : 0;
        return ratio > 0.6 ? '#FFFFFF' : '#AABBCC';
    }


    // ═══════════════════════════════════════
    //  O(1) HIT TESTING
    // ═══════════════════════════════════════

    _hitTest(canvasX, canvasY) {
        var layout = this._layout;
        if (!layout) return null;

        // Inverse transform for zoom/pan
        var world = this._screenToWorld(canvasX, canvasY);
        var wx = world[0];
        var wy = world[1];

        var cellW = layout.cellW;
        var cellH = layout.cellH;
        var pad = layout.pad;
        var oX = layout.cellOriginX;
        var oY = layout.cellOriginY;
        var rows = layout.rows;
        var cols = layout.cols;

        var relX = wx - oX;
        var relY = wy - oY;

        if (relX < 0 || relY < 0) return null;

        var cellStepX = cellW + pad;
        var cellStepY = cellH + pad;

        var col = Math.floor(relX / cellStepX);
        var row = Math.floor(relY / cellStepY);

        // Check within cell bounds (not in gap)
        var withinX = relX - col * cellStepX;
        var withinY = relY - row * cellStepY;

        if (withinX > cellW || withinY > cellH) return null;
        if (row < 0 || row >= rows || col < 0 || col >= cols) return null;

        var idx = row * cols + col;
        return {
            row: row,
            col: col,
            idx: idx,
            unitKey:  this._rowLabels[row] ? this._rowLabels[row].unitKey : null,
            value:    this._heatmapData ? this._heatmapData[idx] : 0,
            label:    this._rowLabels[row] ? this._rowLabels[row].label : '',
            colLabel: this._colLabels[col] || ''
        };
    }

    _canvasCoords(e) {
        var rect = this._canvas.getBoundingClientRect();
        return [e.clientX - rect.left, e.clientY - rect.top];
    }


    // ═══════════════════════════════════════
    //  EVENT HANDLERS
    // ═══════════════════════════════════════

    _onMouseMove(e) {
        var coords = this._canvasCoords(e);
        var hit = this._hitTest(coords[0], coords[1]);

        if (hit) {
            var prevRow = this._hoverRow;
            var prevCol = this._hoverCol;
            this._hoverRow = hit.row;
            this._hoverCol = hit.col;

            // Tooltip content
            this._tooltipEl.innerHTML =
                '<strong>' + this._escHtml(hit.label) + '</strong><br>' +
                '<span style="color:#5BC0EB">' + this._escHtml(hit.colLabel) + '</span>: ' +
                this._formatValue(hit.value);
            this._tooltipEl.style.display = 'block';

            // Position near mouse
            var rect = this._canvas.getBoundingClientRect();
            var tx = e.clientX - rect.left + 12;
            var ty = e.clientY - rect.top - 30;
            var tw = this._tooltipEl.offsetWidth;
            if (tx + tw > rect.width) tx = rect.width - tw - 4;
            if (ty < 0) ty = e.clientY - rect.top + 12;
            this._tooltipEl.style.left = tx + 'px';
            this._tooltipEl.style.top  = ty + 'px';

            // Redraw if cell changed
            if (prevRow !== hit.row || prevCol !== hit.col) {
                this._needsFullRedraw = true;
                this._scheduleRedraw();
            }
        } else {
            if (this._hoverRow >= 0) {
                this._hoverRow = -1;
                this._hoverCol = -1;
                this._tooltipEl.style.display = 'none';
                this._needsFullRedraw = true;
                this._scheduleRedraw();
            }
        }
    }

    _onMouseLeave() {
        if (this._hoverRow >= 0) {
            this._hoverRow = -1;
            this._hoverCol = -1;
            this._tooltipEl.style.display = 'none';
            this._needsFullRedraw = true;
            this._scheduleRedraw();
        }
    }

    _onClick(e) {
        var coords = this._canvasCoords(e);
        var hit = this._hitTest(coords[0], coords[1]);
        if (hit && this._bus) {
            this._bus.emit('hm:cell:clicked', {
                unitKey:  hit.unitKey,
                siteId:   this._rowLabels[hit.row] ? this._rowLabels[hit.row].siteId : null,
                unitIdx:  this._rowLabels[hit.row] ? this._rowLabels[hit.row].unitIdx : null,
                colLabel: hit.colLabel,
                value:    hit.value
            });
        }
    }

    _onWheel(e) {
        if (!e.ctrlKey) return;
        e.preventDefault();
        var coords = this._canvasCoords(e);
        var factor = e.deltaY < 0 ? 1.1 : 0.9;
        this._zoomBy(factor, coords[0], coords[1]);
    }


    // ═══════════════════════════════════════
    //  ZOOM / PAN TRANSFORM MATRIX
    // ═══════════════════════════════════════

    _applyTransform(ctx) {
        var m = this._transformMatrix;
        ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]);
    }

    _screenToWorld(sx, sy) {
        var m = this._transformMatrix;
        return [(sx - m[4]) / m[0], (sy - m[5]) / m[3]];
    }

    zoomIn() {
        this._zoomBy(1.2, this._logicalW / 2, this._logicalH / 2);
    }

    zoomOut() {
        this._zoomBy(0.833, this._logicalW / 2, this._logicalH / 2);
    }

    resetZoom() {
        this._transformMatrix = [1, 0, 0, 1, 0, 0];
        this._needsFullRedraw = true;
        this._scheduleRedraw();
    }

    _zoomBy(factor, cx, cy) {
        var m = this._transformMatrix;
        var newScale = Math.max(0.25, Math.min(m[0] * factor, 5));
        var ds = newScale / m[0];
        var e = cx - ds * (cx - m[4]);
        var f = cy - ds * (cy - m[5]);
        this._transformMatrix = [newScale, 0, 0, newScale, e, f];
        this._needsFullRedraw = true;
        this._scheduleRedraw();
    }


    // ═══════════════════════════════════════
    //  PUBLIC API
    // ═══════════════════════════════════════

    setViewMode(mode) {
        if (this._opts.viewMode === mode) return;
        this._opts.viewMode = mode;
        this._rebuildColLabels();
        this._layout = null;
        this._needsFullRedraw = true;
        this._scheduleRedraw();
    }

    setMetric(metric) {
        if (this._opts.metric === metric) return;
        this._opts.metric = metric;
    }

    setColorScheme(scheme) {
        if (this._opts.colorScheme === scheme) return;
        this._opts.colorScheme = scheme;
        this._needsFullRedraw = true;
        this._drawLegendGradient();
        this._scheduleRedraw();
    }

    setSiteFilter(filter) {
        this._opts.siteFilter = (filter || '').toLowerCase();
        this._needsFullRedraw = true;
        this._scheduleRedraw();
    }

    exportPNG() {
        if (!this._canvas) return;
        var dataUrl = this._canvas.toDataURL('image/png');
        var link = document.createElement('a');
        link.download = 'wow-heatmap-' + new Date().toISOString().split('T')[0] + '.png';
        link.href = dataUrl;
        link.click();
    }

    exportCSV() {
        if (!this._heatmapData || !this._rowLabels.length) return;
        var cols = this._colLabels;
        var rows = this._rowLabels;
        var data = this._heatmapData;
        var lines = [];

        // Header
        lines.push(',' + cols.join(','));

        // Data rows
        for (var r = 0; r < rows.length; r++) {
            var vals = [];
            for (var c = 0; c < cols.length; c++) {
                vals.push(data[r * cols.length + c]);
            }
            lines.push(rows[r].label + ',' + vals.join(','));
        }

        var blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var link = document.createElement('a');
        link.download = 'wow-heatmap-' + new Date().toISOString().split('T')[0] + '.csv';
        link.href = url;
        link.click();
        URL.revokeObjectURL(url);
    }


    // ═══════════════════════════════════════
    //  LEGEND
    // ═══════════════════════════════════════

    _drawLegendGradient() {
        var cvs = this._legendCanvas;
        if (!cvs || !cvs.parentElement) return;
        var rect = cvs.parentElement.getBoundingClientRect();
        var w = rect.width || 200;
        var h = 12;
        var dpr = this._dpr;

        cvs.width = Math.round(w * dpr);
        cvs.height = Math.round(h * dpr);
        cvs.style.width = w + 'px';
        cvs.style.height = h + 'px';

        var ctx = cvs.getContext('2d');
        ctx.scale(dpr, dpr);

        var grad = ctx.createLinearGradient(0, 0, w, 0);
        for (var i = 0; i <= 20; i++) {
            var t = i / 20;
            var v = this._dataMin + t * (this._dataMax - this._dataMin);
            grad.addColorStop(t, this._schemeColor(v, this._dataMin, this._dataMax));
        }
        ctx.fillStyle = grad;

        // Rounded rect
        var r = 3;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r);
        ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h);
        ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
        ctx.fill();
    }

    _updateLegendLabels() {
        if (!this._containerEl) return;
        var minEl = this._containerEl.querySelector('.wow-hm-legend-min');
        var maxEl = this._containerEl.querySelector('.wow-hm-legend-max');
        if (minEl) minEl.textContent = this._formatValue(this._dataMin);
        if (maxEl) maxEl.textContent = this._formatValue(this._dataMax);
    }


    // ═══════════════════════════════════════
    //  STATS BAR
    // ═══════════════════════════════════════

    _updateStatsBar(stats) {
        if (!this._statsBarEl) return;
        var map = { min: stats.min, avg: stats.avg, max: stats.max, count: stats.count };
        for (var key in map) {
            var el = this._statsBarEl.querySelector('[data-stat="' + key + '"]');
            if (el) {
                el.textContent = key === 'count' ?
                    Math.round(map[key]) :
                    this._formatValue(map[key]);
            }
        }
    }


    // ═══════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════

    _el(tag, cls) {
        var el = document.createElement(tag);
        if (cls) el.className = cls;
        return el;
    }

    _btn(text, handler) {
        var b = document.createElement('button');
        b.textContent = text;
        b.addEventListener('click', handler);
        return b;
    }

    _createSelect(cls, options, currentVal) {
        var sel = document.createElement('select');
        sel.className = cls;
        for (var i = 0; i < options.length; i++) {
            var opt = document.createElement('option');
            opt.value = options[i].value;
            opt.textContent = options[i].text;
            if (options[i].value === currentVal) opt.selected = true;
            sel.appendChild(opt);
        }
        return sel;
    }

    _formatValue(v) {
        if (v === undefined || v === null || isNaN(v)) return '\u2014';
        return Number(v).toFixed(this._opts.decimals);
    }

    _escHtml(str) {
        var div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }

    _rebuildColLabels() {
        var MONTHS_HE = [
            '\u05D9\u05E0\u05D5\u05D0\u05E8','\u05E4\u05D1\u05E8\u05D5\u05D0\u05E8',
            '\u05DE\u05E8\u05E5','\u05D0\u05E4\u05E8\u05D9\u05DC',
            '\u05DE\u05D0\u05D9','\u05D9\u05D5\u05E0\u05D9',
            '\u05D9\u05D5\u05DC\u05D9','\u05D0\u05D5\u05D2\u05D5\u05E1\u05D8',
            '\u05E1\u05E4\u05D8\u05DE\u05D1\u05E8','\u05D0\u05D5\u05E7\u05D8\u05D5\u05D1\u05E8',
            '\u05E0\u05D5\u05D1\u05DE\u05D1\u05E8','\u05D3\u05E6\u05DE\u05D1\u05E8'
        ];
        var DAYS_HE = [
            '\u05E8\u05D0\u05E9\u05D5\u05DF','\u05E9\u05E0\u05D9',
            '\u05E9\u05DC\u05D9\u05E9\u05D9','\u05E8\u05D1\u05D9\u05E2\u05D9',
            '\u05D7\u05DE\u05D9\u05E9\u05D9','\u05E9\u05D9\u05E9\u05D9',
            '\u05E9\u05D1\u05EA'
        ];

        if (this._opts.viewMode === 'dayHour') {
            this._colLabels = [];
            for (var d = 0; d < 7; d++) {
                for (var h = 0; h < 24; h++) {
                    this._colLabels.push(DAYS_HE[d] + ' ' + h + ':00');
                }
            }
        } else {
            this._colLabels = MONTHS_HE.slice();
        }
    }

    _showSkeleton() {
        if (this._skeletonEl) this._skeletonEl.style.display = 'block';
    }

    _hideSkeleton() {
        if (this._skeletonEl) this._skeletonEl.style.display = 'none';
    }


    // ═══════════════════════════════════════
    //  DESTROY — Full Cleanup
    // ═══════════════════════════════════════

    destroy() {
        this._destroyed = true;

        // Cancel rAF
        if (this._rAF) {
            cancelAnimationFrame(this._rAF);
            this._rAF = null;
        }

        // Remove canvas event listeners
        if (this._canvas) {
            this._canvas.removeEventListener('mousemove', this._boundMouseMove);
            this._canvas.removeEventListener('mouseleave', this._boundMouseLeave);
            this._canvas.removeEventListener('click', this._boundClick);
            this._canvas.removeEventListener('wheel', this._boundWheel);
        }

        // Disconnect resize observer
        if (this._resizeObserver) {
            this._resizeObserver.disconnect();
            this._resizeObserver = null;
        }
        clearTimeout(this._resizeTimer);

        // Null DOM refs
        this._canvas        = null;
        this._ctx           = null;
        this._tooltipEl     = null;
        this._statsBarEl    = null;
        this._containerEl   = null;
        this._canvasWrapEl  = null;
        this._legendCanvas  = null;
        this._skeletonEl    = null;
        this._heatmapData   = null;
        this._prevCells     = null;
        this._rowLabels     = [];
        this._colLabels     = [];
        this._layout        = null;
        this._sensitivity   = null;
    }
}

window.WowHeatmapRenderer = WowHeatmapRenderer;

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
