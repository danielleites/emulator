/**
 * ═══════════════════════════════════════════════════════
 *  WOW Heatmap Worker — Off-Thread Data Processing
 * ═══════════════════════════════════════════════════════
 *  Dedicated Web Worker that receives raw PI Vision data
 *  and returns render-ready Float32Array for Canvas drawing.
 *  Optionally manages OffscreenCanvas for full off-thread rendering.
 *
 *  Messages IN:
 *    { type: 'PI_DATA',        payload: { sites, data, warnPct, critPct, metric, viewMode } }
 *    { type: 'CONFIG',         payload: { warnPct, critPct, decimals, metric, viewMode, colorScheme } }
 *    { type: 'FETCH_MONTHLY',  payload: { baseUrl, webIds: [{unitKey, webId}] } }
 *    { type: 'OFFSCREEN_INIT', payload: { canvas, dpr, width, height } }
 *    { type: 'OFFSCREEN_RESIZE', payload: { dpr, width, height } }
 *
 *  Messages OUT:
 *    { type: 'HEATMAP_STATE',  payload: { cells, rowLabels, colLabels, min, max, stats } }
 *    { type: 'SENSITIVITY',    payload: { totalUnits, okUnits, warnUnits, critUnits } }
 *    { type: 'OFFSCREEN_FRAME' }
 *    { type: 'ERROR',          payload: { source, message } }
 *
 *  Version: WOW HM 100.0
 * ═══════════════════════════════════════════════════════
 */


// QA17-FIX: Worker guard — prevents collision when PI Vision loads this as regular script
if (typeof WorkerGlobalScope === 'undefined' && typeof importScripts === 'undefined') {
    // Not a Worker context — bail out silently
} else {
(function (self) {
'use strict';

// ── Worker State ──
let _config = {
    warnPct:     70,
    critPct:     90,
    decimals:    1,
    metric:      'hours',
    viewMode:    'monthly',
    colorScheme: 'executive'
};

let _offscreenCtx = null;
let _offscreenDpr = 1;
let _offscreenW   = 0;
let _offscreenH   = 0;

let _monthlyCache = {};
const CACHE_TTL   = 3600000; // 1 hour

// Hebrew labels
const MONTHS_HE = [
    '\u05D9\u05E0\u05D5\u05D0\u05E8','\u05E4\u05D1\u05E8\u05D5\u05D0\u05E8',
    '\u05DE\u05E8\u05E5','\u05D0\u05E4\u05E8\u05D9\u05DC',
    '\u05DE\u05D0\u05D9','\u05D9\u05D5\u05E0\u05D9',
    '\u05D9\u05D5\u05DC\u05D9','\u05D0\u05D5\u05D2\u05D5\u05E1\u05D8',
    '\u05E1\u05E4\u05D8\u05DE\u05D1\u05E8','\u05D0\u05D5\u05E7\u05D8\u05D5\u05D1\u05E8',
    '\u05E0\u05D5\u05D1\u05DE\u05D1\u05E8','\u05D3\u05E6\u05DE\u05D1\u05E8'
];
const DAYS_HE = [
    '\u05E8\u05D0\u05E9\u05D5\u05DF','\u05E9\u05E0\u05D9',
    '\u05E9\u05DC\u05D9\u05E9\u05D9','\u05E8\u05D1\u05D9\u05E2\u05D9',
    '\u05D7\u05DE\u05D9\u05E9\u05D9','\u05E9\u05D9\u05E9\u05D9',
    '\u05E9\u05D1\u05EA'
];


// ═══════════════════════════════════════
//  Message Handler
// ═══════════════════════════════════════

self.onmessage = function (e) {
    const msg = e.data;
    if (!msg || !msg.type) return;

    try {
        switch (msg.type) {
            case 'CONFIG':
                Object.assign(_config, msg.payload || {});
                break;

            case 'PI_DATA':
                handlePiData(msg.payload);
                break;

            case 'FETCH_MONTHLY':
                handleFetchMonthly(msg.payload);
                break;

            case 'OFFSCREEN_INIT':
                initOffscreen(msg.payload);
                break;

            case 'OFFSCREEN_RESIZE':
                resizeOffscreen(msg.payload);
                break;

            default:
                break;
        }
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            payload: { source: msg.type, message: err.message || String(err) }
        });
    }
};


// ═══════════════════════════════════════
//  PI_DATA → Process & Return HEATMAP_STATE
// ═══════════════════════════════════════

function handlePiData(payload) {
    const { sites, data, warnPct, critPct, metric, viewMode } = payload;
    if (warnPct !== undefined)  _config.warnPct  = warnPct;
    if (critPct !== undefined)  _config.critPct  = critPct;
    if (metric)                 _config.metric   = metric;
    if (viewMode)               _config.viewMode = viewMode;

    if (!sites || !data) return;

    // Build row labels
    const rowLabels = [];
    for (const site of sites) {
        for (let u = 0; u < site.units.length; u++) {
            rowLabels.push({
                label:   site.name + ' \u2013 ' + site.units[u],
                siteId:  site.id,
                unitIdx: u,
                unitKey: site.id + '_u' + u
            });
        }
    }

    // Build column labels
    let colLabels;
    let cols;
    if (_config.viewMode === 'dayHour') {
        colLabels = [];
        for (let d = 0; d < 7; d++) {
            for (let h = 0; h < 24; h++) {
                colLabels.push(DAYS_HE[d] + ' ' + h + ':00');
            }
        }
        cols = 168;
    } else {
        colLabels = MONTHS_HE.slice();
        cols = 12;
    }

    const rows = rowLabels.length;
    const cells = new Float32Array(rows * cols);

    let min = Infinity, max = -Infinity, sum = 0, count = 0;

    for (let r = 0; r < rows; r++) {
        const rl = rowLabels[r];
        const siteData = data[rl.siteId];
        if (!siteData) continue;
        const unitData = siteData[rl.unitIdx];
        if (!unitData) continue;

        const monthly = unitData.monthly || [];

        for (let c = 0; c < cols; c++) {
            let val = 0;

            if (_config.viewMode === 'monthly' && monthly[c]) {
                val = extractMetric(monthly[c], unitData, _config.metric);
            } else if (_config.viewMode === 'dayHour' && unitData.dayHour) {
                const d = Math.floor(c / 24);
                const h = c % 24;
                val = unitData.dayHour[d] ?
                    (unitData.dayHour[d][h] || {}).avg || 0 : 0;
            } else {
                val = extractMetric(monthly[c], unitData, _config.metric);
            }

            cells[r * cols + c] = val;
            if (val < min) min = val;
            if (val > max) max = val;
            sum += val;
            count++;
        }
    }

    if (min === Infinity) min = 0;
    if (max === -Infinity) max = 0;

    // Transfer Float32Array (zero-copy)
    self.postMessage({
        type: 'HEATMAP_STATE',
        payload: {
            cells:     cells,
            rowLabels: rowLabels,
            colLabels: colLabels,
            min:       min,
            max:       max,
            stats: {
                min:   min,
                max:   max,
                avg:   count > 0 ? sum / count : 0,
                count: count
            }
        }
    }, [cells.buffer]);

    // Sensitivity
    const sens = calcSensitivity(rowLabels, data, _config.warnPct, _config.critPct);
    self.postMessage({ type: 'SENSITIVITY', payload: sens });

    // OffscreenCanvas draw
    if (_offscreenCtx) {
        drawOffscreen(cells, rowLabels, colLabels, min, max);
    }
}


// ═══════════════════════════════════════
//  Metric Extraction
// ═══════════════════════════════════════

function extractMetric(monthEntry, unitData, metric) {
    if (monthEntry) {
        if (metric === 'hours' && monthEntry.hours !== undefined) return monthEntry.hours;
        if (metric === 'quota' && monthEntry.quota !== undefined) return monthEntry.quota;
        if (metric === 'pct'   && monthEntry.pct   !== undefined) return monthEntry.pct;
        if (monthEntry.value !== undefined) return monthEntry.value;
    }
    if (unitData) {
        if (metric === 'hours') return unitData.hours || 0;
        if (metric === 'quota') return unitData.quota || 0;
        if (metric === 'pct')   return unitData.pct   || 0;
    }
    return 0;
}


// ═══════════════════════════════════════
//  Sensitivity Aggregation
// ═══════════════════════════════════════

function calcSensitivity(rowLabels, data, warnPct, critPct) {
    let total = 0, ok = 0, warn = 0, crit = 0;
    for (const rl of rowLabels) {
        total++;
        const sd = data[rl.siteId];
        if (!sd) { ok++; continue; }
        const ud = sd[rl.unitIdx];
        if (!ud) { ok++; continue; }
        const pct = ud.pct || 0;
        if (pct >= critPct) crit++;
        else if (pct >= warnPct) warn++;
        else ok++;
    }
    return { totalUnits: total, okUnits: ok, warnUnits: warn, critUnits: crit };
}


// ═══════════════════════════════════════
//  Monthly Data Fetch (PI Web API)
// ═══════════════════════════════════════

function handleFetchMonthly(payload) {
    const { baseUrl, webIds } = payload;
    if (!baseUrl || !webIds || webIds.length === 0) return;

    for (const item of webIds) {
        const cached = _monthlyCache[item.unitKey];
        if (cached && (Date.now() - cached.fetchedAt) < CACHE_TTL) continue;

        const url = baseUrl + '/streams/' + item.webId + '/summary' +
                    '?startTime=*-12mo&endTime=*&summaryType=Average&summaryDuration=1mo';

        fetch(url, { credentials: 'include' })
            .then(function (response) {
                if (!response.ok) throw new Error('HTTP ' + response.status);
                return response.json();
            })
            .then(function (json) {
                const items = json.Items || json.items || [];
                const monthlyData = [];
                for (let i = 0; i < items.length; i++) {
                    const pt = items[i];
                    if (pt && pt.Value !== undefined && pt.Value.Value !== undefined) {
                        monthlyData.push({
                            value: parseFloat(pt.Value.Value),
                            hours: pt.Value.Value || 0,
                            pct:   pt.Value.Value || 0,
                            quota: pt.Value.Value || 0
                        });
                    } else {
                        monthlyData.push({ value: 0, hours: 0, pct: 0, quota: 0 });
                    }
                }

                _monthlyCache[item.unitKey] = {
                    data: monthlyData,
                    fetchedAt: Date.now()
                };
            })
            .catch(function (err) {
                self.postMessage({
                    type: 'ERROR',
                    payload: { source: 'FETCH_MONTHLY', message: item.unitKey + ': ' + err.message }
                });
            });
    }
}


// ═══════════════════════════════════════
//  OffscreenCanvas Support
// ═══════════════════════════════════════

function initOffscreen(payload) {
    try {
        const canvas = payload.canvas;
        _offscreenDpr = payload.dpr || 1;
        _offscreenW   = payload.width || 800;
        _offscreenH   = payload.height || 400;
        canvas.width  = Math.round(_offscreenW * _offscreenDpr);
        canvas.height = Math.round(_offscreenH * _offscreenDpr);
        _offscreenCtx = canvas.getContext('2d');
        _offscreenCtx.scale(_offscreenDpr, _offscreenDpr);
    } catch (err) {
        _offscreenCtx = null;
        self.postMessage({
            type: 'ERROR',
            payload: { source: 'OFFSCREEN_INIT', message: err.message }
        });
    }
}

function resizeOffscreen(payload) {
    if (!_offscreenCtx) return;
    try {
        _offscreenDpr = payload.dpr || 1;
        _offscreenW   = payload.width || 800;
        _offscreenH   = payload.height || 400;
        const cvs = _offscreenCtx.canvas;
        cvs.width  = Math.round(_offscreenW * _offscreenDpr);
        cvs.height = Math.round(_offscreenH * _offscreenDpr);
        _offscreenCtx.scale(_offscreenDpr, _offscreenDpr);
    } catch (err) {
        self.postMessage({
            type: 'ERROR',
            payload: { source: 'OFFSCREEN_RESIZE', message: err.message }
        });
    }
}

function drawOffscreen(cells, rowLabels, colLabels, min, max) {
    if (!_offscreenCtx) return;
    const ctx = _offscreenCtx;
    const W = _offscreenW;
    const H = _offscreenH;

    // Clear
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(_offscreenDpr, _offscreenDpr);
    ctx.fillStyle = '#060C18';
    ctx.fillRect(0, 0, W, H);

    const rows = rowLabels.length;
    const cols = colLabels.length;
    if (rows === 0 || cols === 0) { ctx.restore(); return; }

    // Simple layout
    const yLabelW = Math.min(W * 0.2, 120);
    const xLabelH = 22;
    const pad = 2;
    var cellW = Math.max(((W - yLabelW - 8) - pad * (cols - 1)) / cols, 4);
    var cellH = Math.max(((H - xLabelH - 8) - pad * (rows - 1)) / rows, 4);

    // Draw cells
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const idx = r * cols + c;
            const value = cells[idx];
            const x = c * (cellW + pad);
            const y = xLabelH + r * (cellH + pad);
            ctx.fillStyle = offscreenColor(value, min, max);
            ctx.fillRect(x, y, cellW, cellH);
        }
    }

    ctx.restore();
    self.postMessage({ type: 'OFFSCREEN_FRAME' });
}

function offscreenColor(value, min, max) {
    if (max <= min) return 'hsl(210,5%,18%)';
    const ratio = Math.max(0, Math.min((value - min) / (max - min), 1));

    let h, s, l;
    if (ratio < 0.5) {
        const t = ratio / 0.5;
        h = 210; s = 5 + t * 5; l = 15 + t * 7;
    } else if (ratio < 0.75) {
        const t = (ratio - 0.5) / 0.25;
        h = 210 - t * 170; s = 10 + t * 60; l = 22 + t * 28;
    } else {
        const t = (ratio - 0.75) / 0.25;
        h = 40 - t * 40; s = 70 + t * 20; l = 50 + t * 5;
    }
    return 'hsl(' + Math.round(h) + ',' + Math.round(s) + '%,' + Math.round(l) + '%)';
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
