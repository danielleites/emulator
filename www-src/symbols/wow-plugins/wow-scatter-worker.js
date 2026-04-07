/**
 * ═══════════════════════════════════════════════════════
 *  wow-scatter-worker.js  —  OffscreenCanvas Scatter Engine
 * ═══════════════════════════════════════════════════════
 *  Runs the ENTIRE rendering pipeline in a Web Worker:
 *    - Receives OffscreenCanvas via transferControlToOffscreen()
 *    - Draws 200K+ points with Density Glow (globalCompositeOperation: 'lighter')
 *    - Detects anomalies via Z-Score (statistical outlier detection)
 *    - Responds to Brush queries (rectangle → time range extraction)
 *
 *  Float32Array transfer: zero-copy data passing from Main Thread.
 *  The Main Thread does ZERO rendering — 0ms UI blocking.
 *
 *  Message Protocol:
 *    IN:  INIT_CANVAS   → { canvas: OffscreenCanvas }
 *    IN:  RESIZE        → { width, height, dpr }
 *    IN:  DATA_UPDATE   → { xValues: Float32Array, yValues: Float32Array,
 *                           timestamps: Float64Array, config }
 *    IN:  DATA_RAW      → { payload: [{X,Y,Time}...], config } (fallback)
 *    IN:  CONFIG        → { zScoreThreshold, pointRadius, densityMode, ... }
 *    IN:  BRUSH_QUERY   → { x1, y1, x2, y2 } (canvas coords)
 *    IN:  HOVER_QUERY   → { x, y } (canvas coords → nearest point)
 *
 *    OUT: FRAME_READY   → { stats }
 *    OUT: ANOMALIES     → { count, indices }
 *    OUT: BRUSH_RESULT  → { count, timeStart, timeEnd, points }
 *    OUT: HOVER_RESULT  → { found, point, index }
 *    OUT: ERROR         → { source, message }
 *
 *  Version : WOW SC 100.0
 * ═══════════════════════════════════════════════════════
 */

/* jshint worker:true */

// QA17-FIX: Worker guard — prevents collision when PI Vision loads this as regular script
if (typeof WorkerGlobalScope === 'undefined' && typeof importScripts === 'undefined') {
    // Not a Worker context — bail out silently
} else {
(function (self) {
'use strict';

// ═══ State ═══

var canvas = null;
var ctx = null;
var dims = { width: 0, height: 0, dpr: 1 };

// Data arrays (Float32/64)
var xData = null;       // Float32Array
var yData = null;       // Float32Array
var timestamps = null;  // Float64Array (milliseconds)
var pointCount = 0;

// Computed bounds
var minX = 0, maxX = 1, minY = 0, maxY = 1;
var rangeX = 1, rangeY = 1;

// Anomaly detection
var anomalyFlags = null; // Uint8Array: 0 = normal, 1 = anomaly
var anomalyCount = 0;

// Drawing config
var cfg = {
    zScoreThreshold: 2.5,
    pointRadius: 2.5,
    densityMode: true,
    showAnomalies: true,
    showGrid: true,
    showAxes: true,
    colorNormal: 'rgba(0, 245, 212, 0.08)',
    colorAnomaly: '#FF3B30',
    colorBg: '#0A0F1C',
    colorGrid: 'rgba(91, 192, 235, 0.06)',
    colorGridMajor: 'rgba(91, 192, 235, 0.12)',
    colorAxis: '#5BC0EB',
    colorText: '#8899AA',
    fontFamily: 'Segoe UI',
    fontSize: 10,
    decimals: 1,
    marginTop: 20,
    marginRight: 20,
    marginBottom: 40,
    marginLeft: 60
};


// ═══ Message Handler ═══

self.onmessage = function (e) {
    var msg = e.data;

    try {
        switch (msg.type) {
            case 'INIT_CANVAS':
                canvas = msg.canvas;
                ctx = canvas.getContext('2d', { alpha: false });
                break;

            case 'RESIZE':
                dims.width = msg.width;
                dims.height = msg.height;
                dims.dpr = msg.dpr || 1;
                if (canvas) {
                    canvas.width = dims.width * dims.dpr;
                    canvas.height = dims.height * dims.dpr;
                    ctx.setTransform(dims.dpr, 0, 0, dims.dpr, 0, 0);
                }
                drawFrame();
                break;

            case 'DATA_UPDATE':
                // Float32Array transfer (zero-copy)
                if (msg.xValues && msg.yValues) {
                    xData = msg.xValues;
                    yData = msg.yValues;
                    timestamps = msg.timestamps || null;
                    pointCount = xData.length;
                }
                if (msg.config) mergeConfig(msg.config);
                computeBounds();
                detectAnomalies();
                drawFrame();
                break;

            case 'DATA_RAW':
                // Fallback: convert raw objects to typed arrays
                processRawData(msg.payload || []);
                if (msg.config) mergeConfig(msg.config);
                computeBounds();
                detectAnomalies();
                drawFrame();
                break;

            case 'CONFIG':
                mergeConfig(msg);
                if (pointCount > 0) {
                    detectAnomalies(); // Re-detect with new threshold
                    drawFrame();
                }
                break;

            case 'BRUSH_QUERY':
                handleBrushQuery(msg);
                break;

            case 'HOVER_QUERY':
                handleHoverQuery(msg);
                break;

            default:
                break;
        }
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            source: 'wow-scatter-worker',
            message: err.message || String(err)
        });
    }
};


// ═══════════════════════════════════════
//  DATA PROCESSING
// ═══════════════════════════════════════

function processRawData(rows) {
    var len = rows.length;
    if (len === 0) { pointCount = 0; return; }

    xData = new Float32Array(len);
    yData = new Float32Array(len);
    timestamps = new Float64Array(len);

    for (var i = 0; i < len; i++) {
        var row = rows[i];
        xData[i] = parseFloat(row.X || row.x || row.Value1 || 0);
        yData[i] = parseFloat(row.Y || row.y || row.Value2 || 0);

        var t = row.Time || row.time || row.Timestamp || row.timestamp || 0;
        timestamps[i] = typeof t === 'number' ? t : new Date(t).getTime();
    }

    pointCount = len;
}

function computeBounds() {
    if (pointCount === 0) return;

    minX = Infinity; maxX = -Infinity;
    minY = Infinity; maxY = -Infinity;

    for (var i = 0; i < pointCount; i++) {
        var x = xData[i], y = yData[i];
        if (isNaN(x) || isNaN(y)) continue;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
    }

    rangeX = maxX - minX || 1;
    rangeY = maxY - minY || 1;

    // Add 5% padding
    var padX = rangeX * 0.05;
    var padY = rangeY * 0.05;
    minX -= padX; maxX += padX;
    minY -= padY; maxY += padY;
    rangeX = maxX - minX;
    rangeY = maxY - minY;
}


// ═══════════════════════════════════════
//  ANOMALY DETECTION (Z-Score)
// ═══════════════════════════════════════

function detectAnomalies() {
    if (pointCount === 0) return;

    anomalyFlags = new Uint8Array(pointCount);
    anomalyCount = 0;

    // Compute means
    var sumX = 0, sumY = 0;
    var validCount = 0;
    for (var i = 0; i < pointCount; i++) {
        if (isNaN(xData[i]) || isNaN(yData[i])) continue;
        sumX += xData[i];
        sumY += yData[i];
        validCount++;
    }

    if (validCount === 0) return;
    var meanX = sumX / validCount;
    var meanY = sumY / validCount;

    // Compute standard deviations
    var sumSqX = 0, sumSqY = 0;
    for (var j = 0; j < pointCount; j++) {
        if (isNaN(xData[j]) || isNaN(yData[j])) continue;
        sumSqX += (xData[j] - meanX) * (xData[j] - meanX);
        sumSqY += (yData[j] - meanY) * (yData[j] - meanY);
    }

    var stdX = Math.sqrt(sumSqX / validCount);
    var stdY = Math.sqrt(sumSqY / validCount);

    if (stdX === 0) stdX = 1;
    if (stdY === 0) stdY = 1;

    // Flag anomalies: combined Z-score > threshold
    var threshold = cfg.zScoreThreshold;

    for (var k = 0; k < pointCount; k++) {
        if (isNaN(xData[k]) || isNaN(yData[k])) continue;

        var zX = Math.abs((xData[k] - meanX) / stdX);
        var zY = Math.abs((yData[k] - meanY) / stdY);
        var combinedZ = Math.sqrt(zX * zX + zY * zY);

        if (combinedZ > threshold) {
            anomalyFlags[k] = 1;
            anomalyCount++;
        }
    }

    // Report anomaly stats
    self.postMessage({
        type: 'ANOMALIES',
        count: anomalyCount,
        total: validCount,
        meanX: meanX,
        meanY: meanY,
        stdX: stdX,
        stdY: stdY
    });
}


// ═══════════════════════════════════════
//  DRAWING ENGINE (runs in Worker!)
// ═══════════════════════════════════════

function drawFrame() {
    if (!ctx || dims.width === 0 || pointCount === 0) return;

    var w = dims.width;
    var h = dims.height;
    var m = cfg;

    // Plot area
    var plotX = m.marginLeft;
    var plotY = m.marginTop;
    var plotW = w - m.marginLeft - m.marginRight;
    var plotH = h - m.marginTop - m.marginBottom;

    if (plotW < 10 || plotH < 10) return;

    // Clear background
    ctx.fillStyle = cfg.colorBg;
    ctx.fillRect(0, 0, w, h);

    // Draw grid
    if (cfg.showGrid) drawGrid(plotX, plotY, plotW, plotH);

    // Draw axes
    if (cfg.showAxes) drawAxes(plotX, plotY, plotW, plotH);

    // ──────────────────────────────────────────────
    //  DENSITY GLOW PASS (THE GEM)
    //  globalCompositeOperation: 'lighter'
    //  Overlapping points accumulate brightness
    // ──────────────────────────────────────────────

    if (cfg.densityMode) {
        ctx.globalCompositeOperation = 'lighter';
    }

    var radius = cfg.pointRadius;

    // Single-path batch for normal points
    ctx.fillStyle = cfg.colorNormal;
    ctx.beginPath();

    for (var i = 0; i < pointCount; i++) {
        if (isNaN(xData[i]) || isNaN(yData[i])) continue;
        if (cfg.showAnomalies && anomalyFlags && anomalyFlags[i]) continue; // Draw anomalies separately

        var px = plotX + ((xData[i] - minX) / rangeX) * plotW;
        var py = plotY + plotH - ((yData[i] - minY) / rangeY) * plotH;

        ctx.moveTo(px + radius, py);
        ctx.arc(px, py, radius, 0, 6.2832); // 2*PI
    }

    ctx.fill(); // Single fill call for ALL normal points → GPU

    // Reset composite for anomaly layer
    ctx.globalCompositeOperation = 'source-over';

    // ──────────────────────────────────────────────
    //  ANOMALY HIGHLIGHT PASS
    //  Bright red on top of density cloud
    // ──────────────────────────────────────────────

    if (cfg.showAnomalies && anomalyFlags && anomalyCount > 0) {
        // Glow halo
        ctx.fillStyle = 'rgba(255, 59, 48, 0.25)';
        ctx.beginPath();
        for (var a = 0; a < pointCount; a++) {
            if (!anomalyFlags[a]) continue;
            var ax = plotX + ((xData[a] - minX) / rangeX) * plotW;
            var ay = plotY + plotH - ((yData[a] - minY) / rangeY) * plotH;
            ctx.moveTo(ax + radius + 4, ay);
            ctx.arc(ax, ay, radius + 4, 0, 6.2832);
        }
        ctx.fill();

        // Core dot
        ctx.fillStyle = cfg.colorAnomaly;
        ctx.beginPath();
        for (var b = 0; b < pointCount; b++) {
            if (!anomalyFlags[b]) continue;
            var bx = plotX + ((xData[b] - minX) / rangeX) * plotW;
            var by = plotY + plotH - ((yData[b] - minY) / rangeY) * plotH;
            ctx.moveTo(bx + radius + 1, by);
            ctx.arc(bx, by, radius + 1, 0, 6.2832);
        }
        ctx.fill();
    }

    // Stats
    self.postMessage({
        type: 'FRAME_READY',
        stats: {
            points: pointCount,
            anomalies: anomalyCount,
            minX: minX, maxX: maxX,
            minY: minY, maxY: maxY
        }
    });
}


// ═══════════════════════════════════════
//  GRID & AXES
// ═══════════════════════════════════════

function drawGrid(px, py, pw, ph) {
    var ticksX = 8;
    var ticksY = 6;

    ctx.strokeStyle = cfg.colorGrid;
    ctx.lineWidth = 1;

    for (var i = 0; i <= ticksX; i++) {
        var gx = px + (i / ticksX) * pw;
        ctx.beginPath();
        ctx.moveTo(gx, py);
        ctx.lineTo(gx, py + ph);
        ctx.stroke();
    }

    for (var j = 0; j <= ticksY; j++) {
        var gy = py + (j / ticksY) * ph;
        ctx.beginPath();
        ctx.moveTo(px, gy);
        ctx.lineTo(px + pw, gy);
        ctx.stroke();
    }
}

function drawAxes(px, py, pw, ph) {
    var fontSize = cfg.fontSize;
    var font = fontSize + 'px ' + cfg.fontFamily;
    var dec = cfg.decimals;

    // Axis lines
    ctx.strokeStyle = cfg.colorGridMajor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px, py + ph);
    ctx.lineTo(px + pw, py + ph);
    ctx.stroke();

    // X-axis labels
    ctx.fillStyle = cfg.colorText;
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    var ticksX = 8;
    for (var i = 0; i <= ticksX; i++) {
        var valX = minX + (i / ticksX) * rangeX;
        var lx = px + (i / ticksX) * pw;
        ctx.fillText(_fmtNum(valX, dec), lx, py + ph + 6);

        // Tick mark
        ctx.beginPath();
        ctx.moveTo(lx, py + ph);
        ctx.lineTo(lx, py + ph + 4);
        ctx.stroke();
    }

    // Y-axis labels
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    var ticksY = 6;
    for (var j = 0; j <= ticksY; j++) {
        var valY = minY + (j / ticksY) * rangeY;
        var ly = py + ph - (j / ticksY) * ph;
        ctx.fillText(_fmtNum(valY, dec), px - 6, ly);

        ctx.beginPath();
        ctx.moveTo(px - 4, ly);
        ctx.lineTo(px, ly);
        ctx.stroke();
    }
}


// ═══════════════════════════════════════
//  BRUSH & SELECT (Rectangle Query)
// ═══════════════════════════════════════

function handleBrushQuery(msg) {
    if (pointCount === 0) {
        self.postMessage({ type: 'BRUSH_RESULT', count: 0, points: [] });
        return;
    }

    var m = cfg;
    var plotX = m.marginLeft;
    var plotY = m.marginTop;
    var plotW = dims.width - m.marginLeft - m.marginRight;
    var plotH = dims.height - m.marginTop - m.marginBottom;

    // Convert canvas coords to data coords
    var dataX1 = minX + ((msg.x1 - plotX) / plotW) * rangeX;
    var dataX2 = minX + ((msg.x2 - plotX) / plotW) * rangeX;
    var dataY1 = minY + ((plotY + plotH - msg.y2) / plotH) * rangeY;
    var dataY2 = minY + ((plotY + plotH - msg.y1) / plotH) * rangeY;

    // Ensure proper order
    var bMinX = Math.min(dataX1, dataX2);
    var bMaxX = Math.max(dataX1, dataX2);
    var bMinY = Math.min(dataY1, dataY2);
    var bMaxY = Math.max(dataY1, dataY2);

    // Find points in rectangle
    var selected = [];
    var timeStart = Infinity, timeEnd = -Infinity;

    for (var i = 0; i < pointCount; i++) {
        if (isNaN(xData[i]) || isNaN(yData[i])) continue;
        if (xData[i] >= bMinX && xData[i] <= bMaxX &&
            yData[i] >= bMinY && yData[i] <= bMaxY) {

            selected.push({
                index: i,
                x: xData[i],
                y: yData[i],
                time: timestamps ? timestamps[i] : 0,
                isAnomaly: anomalyFlags ? anomalyFlags[i] === 1 : false
            });

            if (timestamps && timestamps[i] < timeStart) timeStart = timestamps[i];
            if (timestamps && timestamps[i] > timeEnd) timeEnd = timestamps[i];
        }
    }

    self.postMessage({
        type: 'BRUSH_RESULT',
        count: selected.length,
        timeStart: timeStart === Infinity ? 0 : timeStart,
        timeEnd: timeEnd === -Infinity ? 0 : timeEnd,
        anomalyCount: selected.filter(function (p) { return p.isAnomaly; }).length,
        points: selected.slice(0, 100) // Cap at 100 for message size
    });
}


// ═══════════════════════════════════════
//  HOVER QUERY (Nearest Point)
// ═══════════════════════════════════════

function handleHoverQuery(msg) {
    if (pointCount === 0) {
        self.postMessage({ type: 'HOVER_RESULT', found: false });
        return;
    }

    var m = cfg;
    var plotX = m.marginLeft;
    var plotY = m.marginTop;
    var plotW = dims.width - m.marginLeft - m.marginRight;
    var plotH = dims.height - m.marginTop - m.marginBottom;

    // Convert canvas coords to data coords
    var dataX = minX + ((msg.x - plotX) / plotW) * rangeX;
    var dataY = minY + ((plotY + plotH - msg.y) / plotH) * rangeY;

    // Find nearest point within tolerance
    var bestDist = Infinity;
    var bestIdx = -1;
    var tolerance = rangeX * 0.02; // 2% of range

    for (var i = 0; i < pointCount; i++) {
        if (isNaN(xData[i]) || isNaN(yData[i])) continue;
        var dx = (xData[i] - dataX) / rangeX;
        var dy = (yData[i] - dataY) / rangeY;
        var dist = dx * dx + dy * dy;
        if (dist < bestDist) {
            bestDist = dist;
            bestIdx = i;
        }
    }

    if (bestIdx >= 0 && Math.sqrt(bestDist) < 0.03) {
        // Convert point back to canvas coords for tooltip positioning
        var ptX = plotX + ((xData[bestIdx] - minX) / rangeX) * plotW;
        var ptY = plotY + plotH - ((yData[bestIdx] - minY) / rangeY) * plotH;

        self.postMessage({
            type: 'HOVER_RESULT',
            found: true,
            index: bestIdx,
            x: xData[bestIdx],
            y: yData[bestIdx],
            time: timestamps ? timestamps[bestIdx] : 0,
            canvasX: ptX,
            canvasY: ptY,
            isAnomaly: anomalyFlags ? anomalyFlags[bestIdx] === 1 : false
        });
    } else {
        self.postMessage({ type: 'HOVER_RESULT', found: false });
    }
}


// ═══════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════

function mergeConfig(c) {
    if (c.zScoreThreshold !== undefined) cfg.zScoreThreshold = c.zScoreThreshold;
    if (c.pointRadius !== undefined) cfg.pointRadius = c.pointRadius;
    if (c.densityMode !== undefined) cfg.densityMode = c.densityMode;
    if (c.showAnomalies !== undefined) cfg.showAnomalies = c.showAnomalies;
    if (c.showGrid !== undefined) cfg.showGrid = c.showGrid;
    if (c.showAxes !== undefined) cfg.showAxes = c.showAxes;
    if (c.Decimals !== undefined) cfg.decimals = c.Decimals;
    if (c.fontFamily) cfg.fontFamily = c.fontFamily;
    if (c.fontSize) cfg.fontSize = c.fontSize;
    if (c.PointRadius !== undefined) cfg.pointRadius = c.PointRadius;
    if (c.ZScoreThreshold !== undefined) cfg.zScoreThreshold = c.ZScoreThreshold;
    if (c.DensityMode !== undefined) cfg.densityMode = c.DensityMode;
    if (c.ShowAnomalies !== undefined) cfg.showAnomalies = c.ShowAnomalies;
}

function _fmtNum(val, dec) {
    if (Math.abs(val) >= 10000) return (val / 1000).toFixed(0) + 'K';
    if (Math.abs(val) >= 1000) return (val / 1000).toFixed(1) + 'K';
    return val.toFixed(dec !== undefined ? dec : 1);
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
