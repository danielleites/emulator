/**
 * ═══════════════════════════════════════════════════════
 *  WOW Data Worker — Off-Thread Processing
 * ═══════════════════════════════════════════════════════
 *  Dedicated Web Worker that receives raw PI Vision data
 *  and returns render-ready state. All computation happens
 *  here — threshold classification, TTE regression,
 *  sparkline SVG path generation, sensitivity aggregation.
 *
 *  Messages IN:
 *    { type: 'PI_DATA',     payload: { sites, data, warnPct, critPct, decimals, unitSettings } }
 *    { type: 'CONFIG',      payload: { warnPct, critPct, decimals } }
 *    { type: 'FETCH_SPARK', payload: { unitKey, baseUrl, webId } }
 *
 *  Messages OUT:
 *    { type: 'RENDER_STATE', payload: { [unitKey]: { pct, status, value, tte, hours, quota, ts } } }
 *    { type: 'SPARKLINE',    payload: { unitKey, svgPath } }
 *    { type: 'SENSITIVITY',  payload: { totalMW, onlineMW, counts } }
 *    { type: 'ERROR',        payload: { source, message } }
 *
 *  Version: WOW 100.0
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
    warnPct:  70,
    critPct:  90,
    decimals: 1
};

let _sparkCache = {};  // { unitKey: { data, fetchedAt } }
let _rateCache  = {};  // { unitKey: { rate, fetchedAt } }

const SPARK_TTL = 300000; // 5 minutes
const RATE_TTL  = 120000; // 2 minutes


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

            case 'FETCH_SPARK':
                handleFetchSparkline(msg.payload);
                break;

            case 'CALC_RATE':
                handleCalcRate(msg.payload);
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
//  PI_DATA → Process & Return RENDER_STATE
// ═══════════════════════════════════════

function handlePiData(payload) {
    const { sites, data, warnPct, critPct, decimals, unitSettings } = payload;

    // Update config if provided inline
    if (warnPct !== undefined)  _config.warnPct  = warnPct;
    if (critPct !== undefined)  _config.critPct  = critPct;
    if (decimals !== undefined) _config.decimals = decimals;

    if (!sites || !data) return;

    const renderState = {};

    for (let s = 0; s < sites.length; s++) {
        const site = sites[s];
        const siteData = data[site.id];
        if (!siteData) continue;

        for (let u = 0; u < site.units.length; u++) {
            const unitKey = site.id + '_u' + u;
            const uData = siteData[u];

            if (!uData) {
                renderState[unitKey] = { pct: 0, status: 'ok', tte: Infinity };
                continue;
            }

            const pct = uData.pct || 0;
            const status = classifyStatus(pct, _config.warnPct, _config.critPct);

            // TTE: Use provided value or estimate from regression
            let tte = uData.tte;
            if (tte === undefined || tte === null) {
                tte = Infinity;
            }

            renderState[unitKey] = {
                pct:    pct,
                status: status,
                value:  uData.value || 0,
                tte:    tte,
                hours:  uData.hours || 0,
                quota:  uData.quota || 0,
                ts:     uData.ts || null,
                monthly: uData.monthly || null
            };
        }
    }

    // Post render state back to main thread
    self.postMessage({ type: 'RENDER_STATE', payload: renderState });

    // Also calculate sensitivity matrix
    const sensitivity = calcSensitivity(sites, renderState, unitSettings || {});
    self.postMessage({ type: 'SENSITIVITY', payload: sensitivity });
}


// ═══════════════════════════════════════
//  Threshold Classification
// ═══════════════════════════════════════

function classifyStatus(pct, warnPct, critPct) {
    if (pct >= critPct) return 'critical';
    if (pct >= warnPct) return 'warn';
    return 'ok';
}


// ═══════════════════════════════════════
//  Sensitivity Matrix Aggregation
// ═══════════════════════════════════════

function calcSensitivity(sites, renderState, unitSettings) {
    let totalMW = 0, onlineMW = 0, warnMW = 0, critMW = 0;
    let totalUnits = 0, okUnits = 0, warnUnits = 0, critUnits = 0;

    for (const site of sites) {
        for (let u = 0; u < site.units.length; u++) {
            totalUnits++;
            const unitKey = site.id + '_u' + u;
            const us = unitSettings[unitKey];
            const mw = (us && us.maxMW) ? us.maxMW : 100;
            totalMW += mw;

            const ud = renderState[unitKey];
            const status = (ud && ud.status) ? ud.status : 'ok';

            if (status === 'critical') { critUnits++; critMW += mw; }
            else if (status === 'warn') { warnUnits++; warnMW += mw; }
            else { okUnits++; }
            onlineMW += mw;
        }
    }

    return {
        totalMW, onlineMW, warnMW, critMW,
        totalUnits, okUnits, warnUnits, critUnits
    };
}


// ═══════════════════════════════════════
//  Sparkline: PI Web API Fetch + SVG Path
// ═══════════════════════════════════════

function handleFetchSparkline(payload) {
    const { unitKey, baseUrl, webId } = payload;
    if (!baseUrl || !webId) return;

    // Check cache
    const cached = _sparkCache[unitKey];
    if (cached && (Date.now() - cached.fetchedAt) < SPARK_TTL) {
        // Return cached SVG path
        self.postMessage({
            type: 'SPARKLINE',
            payload: { unitKey, svgPath: cached.svgPath }
        });
        return;
    }

    // Fetch from PI Web API (Workers support fetch())
    const url = baseUrl + '/streams/' + webId + '/recorded' +
                '?startTime=*-24h&endTime=*&maxCount=24';

    fetch(url, { credentials: 'include' })
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(function (json) {
            const items = json.Items || json.items || [];
            const points = [];
            for (let i = 0; i < items.length; i++) {
                const pt = items[i];
                if (pt && pt.Value !== null && pt.Value !== undefined && !isNaN(pt.Value)) {
                    points.push(parseFloat(pt.Value));
                }
            }

            // Generate SVG polyline points string
            const svgPath = generateSvgPath(points, 60, 16);

            // Cache it
            _sparkCache[unitKey] = {
                svgPath: svgPath,
                fetchedAt: Date.now()
            };

            self.postMessage({
                type: 'SPARKLINE',
                payload: { unitKey, svgPath }
            });
        })
        .catch(function (err) {
            self.postMessage({
                type: 'ERROR',
                payload: { source: 'FETCH_SPARK', message: unitKey + ': ' + err.message }
            });
        });
}


// ═══════════════════════════════════════
//  SVG Path Generator (no DOM needed)
// ═══════════════════════════════════════

/**
 * Convert array of values to SVG polyline points string.
 * @param {number[]} values - Raw data values
 * @param {number} width - SVG viewBox width
 * @param {number} height - SVG viewBox height
 * @returns {string} points attribute (e.g., "0,15 6,10 12,8...")
 */
function generateSvgPath(values, width, height) {
    if (!values || values.length === 0) return '';

    let max = 1;
    for (let i = 0; i < values.length; i++) {
        if (values[i] > max) max = values[i];
    }

    const points = [];
    const count = values.length;
    for (let j = 0; j < count; j++) {
        const x = Math.round((j / Math.max(count - 1, 1)) * width);
        const y = Math.round(height - (values[j] / max) * (height - 2));
        points.push(x + ',' + y);
    }

    return points.join(' ');
}


// ═══════════════════════════════════════
//  Linear Regression for TTE Rate
// ═══════════════════════════════════════

function handleCalcRate(payload) {
    const { unitKey, baseUrl, webId } = payload;
    if (!baseUrl || !webId) return;

    // Check cache
    const cached = _rateCache[unitKey];
    if (cached && (Date.now() - cached.fetchedAt) < RATE_TTL) return;

    const url = baseUrl + '/streams/' + webId + '/recorded' +
                '?startTime=*-1h&endTime=*&maxCount=12';

    fetch(url, { credentials: 'include' })
        .then(function (response) {
            if (!response.ok) throw new Error('HTTP ' + response.status);
            return response.json();
        })
        .then(function (json) {
            const items = json.Items || json.items || [];
            if (items.length < 2) return;

            const points = [];
            for (let i = 0; i < items.length; i++) {
                const pt = items[i];
                if (pt && pt.Timestamp && pt.Value !== null && !isNaN(pt.Value)) {
                    points.push({
                        x: new Date(pt.Timestamp).getTime(),
                        y: parseFloat(pt.Value)
                    });
                }
            }

            if (points.length < 2) return;

            // Simple linear regression: y = a + bx → solve for b (slope)
            const n = points.length;
            let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
            for (let j = 0; j < n; j++) {
                const x = points[j].x;
                const y = points[j].y;
                sumX  += x;
                sumY  += y;
                sumXY += x * y;
                sumX2 += x * x;
            }

            const denom = n * sumX2 - sumX * sumX;
            if (denom === 0) return;

            const slope = (n * sumXY - sumX * sumY) / denom;
            const ratePerHour = slope * (1000 * 60 * 60); // ms → hours

            _rateCache[unitKey] = {
                rate: ratePerHour,
                fetchedAt: Date.now()
            };

            self.postMessage({
                type: 'RATE',
                payload: { unitKey, ratePerHour }
            });
        })
        .catch(function (err) {
            self.postMessage({
                type: 'ERROR',
                payload: { source: 'CALC_RATE', message: unitKey + ': ' + err.message }
            });
        });
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
