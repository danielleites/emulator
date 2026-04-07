/**
 * =====================================================
 *  Mugbalot Ultimate Monitor (MU20) -- Data Worker
 * =====================================================
 *  Dedicated Web Worker that receives raw PI Vision data
 *  and returns render-ready state. All computation happens
 *  here -- threshold classification, TTE regression,
 *  sparkline SVG path generation, sensitivity aggregation.
 *
 *  BROWSER TARGET NOTE:
 *    Web Workers run in their own JS engine context.
 *    The main page uses ES5 for consistency across the
 *    PI Vision extension ecosystem, but Workers have
 *    full ES6+ support in all modern browsers.
 *    Therefore: let, const, arrow functions, destructuring,
 *    for..of, Object.assign, and fetch() are all valid here.
 *
 *  Messages IN:
 *    { type: 'PI_DATA',         payload: { sites, data, warnPct, critPct, decimals, unitSettings } }
 *    { type: 'CONFIG',          payload: { warnPct, critPct, decimals } }
 *    { type: 'FETCH_SPARK',     payload: { unitKey, baseUrl, webId } }
 *    { type: 'CALC_RATE',       payload: { unitKey, baseUrl, webId } }
 *    { type: 'EVAL_ALERTS',     payload: { rules, units } }
 *    { type: 'ANOMALY_DETECT',  payload: { unitKey, monthly, monthlyLY } }
 *    { type: 'FORECAST_3TIER',  payload: { unitKey, total, quota, monthly, monthlyLY } }
 *    { type: 'MONTHLY_PIPELINE',payload: { unitKey, monthlyData } }
 *
 *  Messages OUT:
 *    { type: 'RENDER_STATE',    payload: { [unitKey]: { pct, status, value, tte, hours, quota, mw, ts, hoursLeft, secondsYtd, designation, unitName, siteName, activeMonth, runtimeFormatted, siteHoursYtd, noQuota, stale, staleAge } } }
 *    { type: 'SPARKLINE',       payload: { unitKey, svgPath } }
 *    { type: 'RATE',            payload: { unitKey, ratePerHour } }
 *    { type: 'ALERT_RESULTS',   payload: { fired, cleared } }
 *    { type: 'ANOMALY_RESULT',  payload: { unitKey, result } }
 *    { type: 'FORECAST_RESULT', payload: { unitKey, seasonal, linear, ewma, daysLeft, tier } }
 *    { type: 'MONTHLY_RESULT',  payload: { unitKey, monthly } }
 *    { type: 'ERROR',           payload: { source, message } }
 *
 *  Version: ULT.1.5
 *
 *  QA17-FIX: IIFE + Worker guard prevents SyntaxError when PI Vision
 *  loads this file as a regular script (it scans ext/ recursively).
 * =====================================================
 */

// Guard: bail out if not running inside a Web Worker
if (typeof WorkerGlobalScope === 'undefined' && typeof importScripts === 'undefined') {
    // Loaded as regular <script> by PI Vision bundler — do nothing
} else {
(function (self) {
'use strict';

// -- Worker State --
let _config = {
    warnPct:  70,
    critPct:  90,
    decimals: 1
};

let _sparkCache = {};  // { unitKey: { data, fetchedAt } }
let _rateCache  = {};  // { unitKey: { rate, fetchedAt } }

const SPARK_TTL = 300000; // 5 minutes
const RATE_TTL  = 120000; // 2 minutes


// =====================================================
//  Message Handler
// =====================================================

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

            // -- Phase 3 stub handlers --

            case 'EVAL_ALERTS':
                handleEvalAlerts(msg.payload);
                break;

            case 'ANOMALY_DETECT':
                handleAnomalyDetect(msg.payload);
                break;

            case 'FORECAST_3TIER':
                handleForecast3Tier(msg.payload);
                break;

            case 'MONTHLY_PIPELINE':
                handleMonthlyPipeline(msg.payload);
                break;

            case 'EVENT_FRAMES':
                handleEventFrameStats(msg.payload);
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


// =====================================================
//  FIX #4: Value Normalization Helpers
// =====================================================
//  PI Vision AF values arrive as { display, numeric, good, isDigitalState }
//  objects. The Worker needs plain numbers for classification.

function toNumber(v) {
    if (v && typeof v === 'object' && v.numeric !== undefined) return Number(v.numeric) || 0;
    return Number(v) || 0;
}

function toDisplay(v) {
    if (v && typeof v === 'object' && v.display !== undefined) return String(v.display);
    return String(v != null ? v : '');
}

function toTimestamp(v) {
    if (v && typeof v === 'object' && v.ts) return v.ts;
    if (v && typeof v === 'object' && v.Timestamp) return v.Timestamp;
    return null;
}


// =====================================================
//  PI_DATA --> Process & Return RENDER_STATE
// =====================================================

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
            // FIX #6: unitKey format = siteId_uN (consistent everywhere)
            const unitKey = site.id + '_u' + u;
            const uData = siteData[u];

            if (!uData) {
                renderState[unitKey] = { pct: 0, status: 'ok', hours: 0, quota: 0, mw: 0, tte: Infinity };
                continue;
            }

            // FIX #4: Normalize AF object values to plain numbers
            const pct    = toNumber(uData.pct);
            const hours  = toNumber(uData.hours);
            const quota  = toNumber(uData.quota);
            const mw     = toNumber(uData.mw);
            const status = classifyStatus(pct, _config.warnPct, _config.critPct);

            // TTE: Use provided value or estimate from regression
            // Prefer secondsYtd (higher precision) over hours for TTE calc
            const usedHours = (uData.secondsYtd !== undefined && uData.secondsYtd !== null)
                ? uData.secondsYtd / 3600
                : (hours || 0);

            let tte = uData.tte;
            if (tte === undefined || tte === null) {
                // Estimate from remaining hours and daily rate if we can
                if (quota > 0 && usedHours > 0 && pct < 100) {
                    const remaining = quota - usedHours;
                    if (remaining > 0) {
                        const now = new Date();
                        const dayOfYear = Math.floor((now - new Date(now.getFullYear(), 0, 0)) / 86400000);
                        const dailyRate = usedHours / Math.max(dayOfYear, 1);
                        tte = dailyRate > 0 ? remaining / dailyRate : Infinity;
                    } else {
                        tte = 0;
                    }
                } else {
                    tte = Infinity;
                }
            }

            // Stale detection: check data timestamp age
            const dataTs = toTimestamp(uData.hours) || toTimestamp(uData.pct) || null;
            let stale = false;
            let staleAge = 0;
            if (dataTs) {
                const age = (Date.now() - new Date(dataTs).getTime()) / 1000;
                const threshold = _config.AlertStaleSec || 300;
                if (age > threshold) {
                    stale = true;
                    staleAge = Math.round(age / 60);
                }
            }

            renderState[unitKey] = {
                pct:       pct,
                status:    status,
                hours:     hours,
                quota:     quota,
                mw:        mw,
                tte:       tte,
                rawStatus: toDisplay(uData.status),
                ts:        dataTs,
                monthly:   uData.monthly || null,
                // -- Task 4: enriched fields --
                hoursLeft:         (uData.hoursLeft !== undefined) ? uData.hoursLeft : null,
                secondsYtd:        (uData.secondsYtd !== undefined) ? uData.secondsYtd : null,
                designation:       (uData.designation !== undefined) ? uData.designation : null,
                unitName:          (uData.unitName !== undefined) ? uData.unitName : null,
                siteName:          (uData.siteName !== undefined) ? uData.siteName : null,
                activeMonth:       (uData.activeMonth !== undefined) ? uData.activeMonth : null,
                runtimeFormatted:  (uData.runtimeFormatted !== undefined) ? uData.runtimeFormatted : null,
                siteHoursYtd:      (uData.siteHoursYtd !== undefined) ? uData.siteHoursYtd : null,
                noQuota:           !!uData.noQuota,
                stale:             stale,
                staleAge:          staleAge
            };
        }
    }

    // Post render state back to main thread
    self.postMessage({ type: 'RENDER_STATE', payload: renderState });
    // Sensitivity matrix is computed internally by siteGrid._updateSensitivity()
}


// =====================================================
//  Threshold Classification
// =====================================================

function classifyStatus(pct, warnPct, critPct) {
    if (pct >= critPct) return 'critical';
    if (pct >= warnPct) return 'warn';
    return 'ok';
}


// =====================================================
//  Sparkline: PI Web API Fetch + SVG Path
// =====================================================

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
                if (!pt || pt.Value === null || pt.Value === undefined) continue;
                // L-1 fix: digital state values (strings like "Shutdown") → null gap
                // instead of silently dropping the data point
                const n = parseFloat(pt.Value);
                points.push(isNaN(n) ? null : n);
            }

            // Generate SVG polyline points string (nulls render as gaps)
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


// =====================================================
//  SVG Path Generator (no DOM needed)
// =====================================================

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


// =====================================================
//  Linear Regression for TTE Rate
// =====================================================

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

            // Simple linear regression: y = a + bx --> solve for b (slope)
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
            const ratePerHour = slope * (1000 * 60 * 60); // ms --> hours

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


// =====================================================
//  Helper: getDaysInMonth / dayOfYear
// =====================================================

function getDaysInMonth(year, month) {
    return new Date(year, month, 0).getDate();
}

function dayOfYear(now) {
    const start = new Date(now.getFullYear(), 0, 0);
    return Math.floor((now - start) / 86400000);
}


// =====================================================
//  ISA-18.2 Alert Evaluation
// =====================================================

/**
 * Evaluates alert rules against per-unit render state.
 * Maintains _alertState across calls for ISA-18.2 state tracking:
 *   ACTIVE -> ACKNOWLEDGED -> CLEARED  (+ SHELVED branch)
 *
 * @param {Object} payload - { rules, units }
 *   rules[]  = { id, triggerFn, clearFn, suppressedBy, severity, title, messageFn }
 *              (serialized: triggerPct/clearPct thresholds instead of functions)
 *   units[]  = { unitKey, pct, hours, quota, total, monthly, monthlyLY,
 *                daysLeft, anomaly, st, hasHoursTag, mw }
 */
let _alertState = {};  // { "unitKey|ruleId": { state, ts, ... } }
const DEDUP_WINDOW = 60000;  // 60s deduplication

/** Built-in custom alert rules (Task 9: Alerts Expansion). */
const BUILTIN_ALERT_RULES = [
    { id: 'NO_QUOTA', type: 'custom', severity: 'info',
      check: function (u) { return !!u.noQuota; },
      msg: '\u05D9\u05D7\u05D9\u05D3\u05D4 \u05DC\u05DC\u05D0 \u05DE\u05DB\u05E1\u05D4 \u05DE\u05D5\u05D2\u05D3\u05E8\u05EA' },

    { id: 'STALE_DATA', type: 'custom', severity: 'warn',
      check: function (u) { return !!u.stale; },
      msg: function (u) { return '\u05E0\u05EA\u05D5\u05DF \u05DC\u05D0 \u05E2\u05D5\u05D3\u05DB\u05DF ' + (u.staleAge || '?') + ' \u05D3\u05E7\u05D5\u05EA'; } },

    { id: 'CROSS_VALIDATION', type: 'custom', severity: 'warn',
      check: function (u) {
          if (!u.secondsYtd || !u.hours) return false;
          return Math.abs(u.secondsYtd / 3600 - u.hours) > 1;
      },
      msg: '\u05D7\u05D5\u05E1\u05E8 \u05D4\u05EA\u05D0\u05DE\u05D4 \u05E9\u05E0\u05D9\u05D5\u05EA\u2194\u05E9\u05E2\u05D5\u05EA' }
];

function handleEvalAlerts(payload) {
    let { rules, units } = payload;
    if (!units) {
        self.postMessage({ type: 'ALERT_RESULTS', payload: { fired: [], cleared: [] } });
        return;
    }

    // Merge caller-supplied rules with built-in custom rules
    rules = (rules || []).concat(BUILTIN_ALERT_RULES);

    const now = Date.now();
    const fired = [];
    const cleared = [];

    for (const u of units) {
        for (const rule of rules) {
            // Skip percentage-based rules for noQuota units
            if (u.noQuota && (rule.id === 'CRIT_PCT' || rule.id === 'WARN_PCT' || rule.type === 'triggerPct')) continue;

            const key = u.unitKey + '|' + rule.id;
            const prev = _alertState[key];
            const triggered = evalRuleTrigger(rule, u);
            const cleared_cond = evalRuleClear(rule, u);

            // Check suppression
            let suppressed = false;
            if (rule.suppressedBy) {
                for (const supId of rule.suppressedBy) {
                    const supKey = u.unitKey + '|' + supId;
                    if (_alertState[supKey] && _alertState[supKey].state === 'ACTIVE') {
                        suppressed = true;
                        break;
                    }
                }
            }

            if (triggered && !suppressed) {
                if (!prev || prev.state === 'CLEARED' || prev.state === undefined) {
                    // Dedup check
                    if (prev && prev.clearedAt && (now - prev.clearedAt) < DEDUP_WINDOW) continue;

                    _alertState[key] = { state: 'ACTIVE', ts: now, ruleId: rule.id };
                    // Task 9: resolve msg (may be a function) with fallback to message
                    const rawMsg = rule.msg !== undefined ? rule.msg : rule.message;
                    const resolvedMsg = typeof rawMsg === 'function' ? rawMsg(u) : (rawMsg || '');
                    fired.push({
                        unitKey: u.unitKey,
                        ruleId:  rule.id,
                        severity: rule.severity || 'medium',
                        title:   rule.title || rule.id,
                        message: resolvedMsg,
                        ts:      now
                    });
                }
            } else if (cleared_cond && prev && prev.state === 'ACTIVE') {
                _alertState[key] = { state: 'CLEARED', clearedAt: now, ruleId: rule.id };
                cleared.push({
                    unitKey:   u.unitKey,
                    ruleId:    rule.id,
                    clearedAt: now
                });
            }
        }
    }

    self.postMessage({ type: 'ALERT_RESULTS', payload: { fired, cleared } });
}

/** Evaluate trigger condition from serialized rule thresholds. */
function evalRuleTrigger(rule, u) {
    // Task 9: custom rules with check function
    if (rule.type === 'custom' && typeof rule.check === 'function') return !!rule.check(u);
    if (rule.triggerPct !== undefined)  return u.pct >= rule.triggerPct;
    if (rule.triggerDays !== undefined) return u.daysLeft != null && u.daysLeft <= rule.triggerDays;
    if (rule.triggerAnomaly)            return u.anomaly === rule.triggerAnomaly;
    return false;
}

/** Evaluate clear condition with hysteresis. */
function evalRuleClear(rule, u) {
    // Task 9: custom rules clear when check returns false
    if (rule.type === 'custom' && typeof rule.check === 'function') return !rule.check(u);
    if (rule.clearPct !== undefined)   return u.pct < rule.clearPct;
    if (rule.clearDays !== undefined)  return u.daysLeft == null || u.daysLeft > rule.clearDays;
    if (rule.clearAnomaly)             return u.anomaly === rule.clearAnomaly;
    return false;
}


// =====================================================
//  Seasonal Anomaly Detection (v10 calcAnomaly)
// =====================================================

/**
 * Compares current-month daily consumption rate against LY profile.
 * ratio > 1.6 = critical, > 1.3 = warn, else none.
 *
 * @param {Object} payload - { unitKey, monthly[12], monthlyLY[12] }
 */
function handleAnomalyDetect(payload) {
    const { unitKey, monthly, monthlyLY } = payload;
    const NONE = { level: 'none', ratio: 0, label: '' };

    if (!monthly || !monthlyLY) {
        self.postMessage({ type: 'ANOMALY_RESULT', payload: { unitKey, result: NONE } });
        return;
    }

    const now   = new Date();
    const curM  = now.getMonth();
    const dayNow = now.getDate();
    const year  = now.getFullYear();

    // Guard: need enough days into month
    if (dayNow < 5) {
        self.postMessage({ type: 'ANOMALY_RESULT', payload: { unitKey, result: NONE } });
        return;
    }

    // Guard: need LY baseline for this month
    const lyHours = monthlyLY[curM] || 0;
    if (lyHours < 10) {
        self.postMessage({ type: 'ANOMALY_RESULT', payload: { unitKey, result: NONE } });
        return;
    }

    // Guard: need actual consumption data this month
    const actHours = monthly[curM] || 0;
    if (actHours <= 0) {
        self.postMessage({ type: 'ANOMALY_RESULT', payload: { unitKey, result: NONE } });
        return;
    }

    // Daily rates
    const daysInMonthLY = getDaysInMonth(year - 1, curM + 1);
    const expectedDaily = lyHours / daysInMonthLY;
    const actualDaily   = actHours / (dayNow - 1 || 1);

    if (expectedDaily <= 0) {
        self.postMessage({ type: 'ANOMALY_RESULT', payload: { unitKey, result: NONE } });
        return;
    }

    const ratio = actualDaily / expectedDaily;
    const label = '\u00D7' + ratio.toFixed(1) + ' \u05DE\u05D4\u05E2\u05D5\u05E0\u05D4';

    let result;
    if (ratio >= 1.6)      result = { level: 'critical', ratio, label };
    else if (ratio >= 1.3) result = { level: 'warn',     ratio, label };
    else                   result = NONE;

    self.postMessage({ type: 'ANOMALY_RESULT', payload: { unitKey, result } });
}


// =====================================================
//  3-Tier Forecast Engine (v10 calcForecast)
// =====================================================

/**
 * Three-tier forecasting:
 *   Tier A — Seasonal blend (LY profile weights)
 *   Tier B — Linear regression on this-year monthly[]
 *   Tier C — Simple daily-rate fallback
 *
 * Also computes EWMA (Tier 2b) for short-term smoothing.
 *
 * @param {Object} payload - { unitKey, total, quota, monthly[12], monthlyLY[12] }
 */
function handleForecast3Tier(payload) {
    const { unitKey, total, quota, monthly, monthlyLY } = payload;

    if (!monthly || quota <= 0) {
        self.postMessage({
            type: 'FORECAST_RESULT',
            payload: { unitKey, seasonal: null, linear: null, ewma: null, daysLeft: null, tier: null }
        });
        return;
    }

    const now   = new Date();
    const curM  = now.getMonth();
    const year  = now.getFullYear();
    const dom   = now.getDate();
    const rem   = Math.max(0, quota - total);

    let result = { unitKey, seasonal: null, linear: null, ewma: null, daysLeft: null, tier: null };

    // ── Tier A: Seasonal blend via last-year profile ──
    if (monthlyLY) {
        let lyTotal = 0;
        for (let i = 0; i < 12; i++) lyTotal += (monthlyLY[i] || 0);

        if (lyTotal > 0) {
            let lyYtdFrac = 0;
            for (let i = 0; i <= curM; i++) lyYtdFrac += (monthlyLY[i] || 0);
            lyYtdFrac /= lyTotal;

            if (lyYtdFrac > 0.02 && total > 0) {
                const projAnnual = total / lyYtdFrac;
                let cumul = total;
                for (let m = curM; m < 12; m++) {
                    const lyShare = (monthlyLY[m] || 0) / lyTotal;
                    let proj = projAnnual * lyShare;
                    if (m === curM) {
                        const daysInMonth = getDaysInMonth(year, curM + 1);
                        const dayFrac = 1 - (dom - 1) / daysInMonth;
                        proj *= dayFrac;
                    }
                    cumul += proj;
                    if (cumul >= quota) {
                        const excess = cumul - quota;
                        const frac = proj > 0 ? (1 - excess / proj) : 0.5;
                        const daysInM = getDaysInMonth(year, m + 1);
                        const daysInMonth = getDaysInMonth(year, curM + 1);
                        const day = m === curM
                            ? dom + Math.round(frac * (daysInMonth - dom + 1))
                            : Math.max(1, Math.round(frac * daysInM));
                        const forecastDate = new Date(year, m, Math.min(day, daysInM));
                        result.seasonal = forecastDate.getTime();
                        result.tier = 'seasonal';
                        result.daysLeft = Math.round((forecastDate - now) / 86400000);
                        break;
                    }
                }
            }
        }
    }

    // ── Tier B: Linear regression on this-year monthly[] ──
    let n = 0, sx = 0, sy = 0, sxy = 0, sx2 = 0;
    for (let i = 0; i < monthly.length; i++) {
        if (monthly[i] > 0) { n++; sx += i; sy += monthly[i]; sxy += i * monthly[i]; sx2 += i * i; }
    }

    if (n >= 2) {
        const denom = n * sx2 - sx * sx;
        if (denom !== 0) {
            const slope = (n * sxy - sx * sy) / denom;
            const intercept = (sy - slope * sx) / n;
            let cumul = total;
            for (let m = curM; m < 12; m++) {
                const proj = Math.max(0, intercept + slope * m);
                cumul += proj;
                if (cumul >= quota) {
                    const excess = cumul - quota;
                    const frac = proj > 0 ? (1 - excess / proj) : 0.5;
                    const daysInM = getDaysInMonth(year, m + 1);
                    const forecastDate = new Date(year, m, Math.max(1, Math.round(frac * daysInM)));
                    result.linear = forecastDate.getTime();
                    if (!result.tier) {
                        result.tier = 'linear';
                        result.daysLeft = Math.round((forecastDate - now) / 86400000);
                    }
                    break;
                }
            }
        }
    }

    // ── Tier 2b: EWMA short-term smoothing ──
    const alpha = 0.3;
    let ewmaRate = 0;
    let ewmaPoints = 0;
    for (let i = 0; i < monthly.length; i++) {
        if (monthly[i] > 0) {
            ewmaRate = ewmaPoints === 0 ? monthly[i] : alpha * monthly[i] + (1 - alpha) * ewmaRate;
            ewmaPoints++;
        }
    }
    if (ewmaRate > 0 && rem > 0) {
        const monthsLeft = rem / ewmaRate;
        const ewmaDate = new Date(now.getTime() + monthsLeft * 30.44 * 86400000);
        if (ewmaDate.getFullYear() === year) {
            result.ewma = ewmaDate.getTime();
        }
    }

    // ── Tier C: Simple daily-rate fallback ──
    if (!result.tier) {
        const doy = dayOfYear(now);
        const rate = total / Math.max(doy, 1);
        if (rate > 0 && rem > 0) {
            const daysToExhaust = rem / rate;
            const fallbackDate = new Date(now.getTime() + daysToExhaust * 86400000);
            result.linear = fallbackDate.getTime();
            result.tier = 'daily';
            result.daysLeft = Math.round(daysToExhaust);
        }
    }

    self.postMessage({ type: 'FORECAST_RESULT', payload: result });
}


// =====================================================
//  Monthly Aggregation Pipeline
// =====================================================

/**
 * Aggregates daily data into monthly rollups with statistics.
 * @param {Object} payload - { unitKey, monthlyData: { days[], monthly[] } }
 */
function handleMonthlyPipeline(payload) {
    const { unitKey, monthlyData } = payload;

    if (!monthlyData || !monthlyData.monthly) {
        self.postMessage({ type: 'MONTHLY_RESULT', payload: { unitKey, monthly: null } });
        return;
    }

    const monthly = monthlyData.monthly;
    const monthlyLY = monthlyData.monthlyLY || [];
    const result = [];

    for (let m = 0; m < 12; m++) {
        const val  = monthly[m] || 0;
        const lyVal = monthlyLY[m] || 0;
        const delta = lyVal > 0 ? ((val - lyVal) / lyVal * 100) : 0;
        const trend = delta > 5 ? 'up' : (delta < -5 ? 'down' : 'flat');

        result.push({
            month:   m,
            hours:   val,
            lyHours: lyVal,
            delta:   Math.round(delta),
            trend:   trend
        });
    }

    // Rolling 12-month summary
    let sum = 0, peak = 0, min = Infinity, nonZeroCount = 0;
    for (let i = 0; i < monthly.length; i++) {
        const v = monthly[i] || 0;
        sum += v;
        if (v > peak) peak = v;
        if (v > 0) { if (v < min) min = v; nonZeroCount++; }
    }
    if (min === Infinity) min = 0;

    const summary = {
        total:  sum,
        peak:   peak,
        avg:    nonZeroCount > 0 ? Math.round(sum / nonZeroCount) : 0,
        min:    min,
        months: result
    };

    self.postMessage({ type: 'MONTHLY_RESULT', payload: { unitKey, monthly: summary } });
}


// ── Event Frame Stats ──────────────────────────────
function handleEventFrameStats(frames) {
    const stats = {};
    for (let i = 0; i < frames.length; i++) {
        const f = frames[i];
        const key = f.unitKey;
        if (!stats[key]) stats[key] = { count: 0, totalMs: 0, activeNow: false };
        stats[key].count++;
        const dur = (f.endTime ? new Date(f.endTime) : new Date()) - new Date(f.startTime);
        stats[key].totalMs += dur;
        if (!f.endTime) stats[key].activeNow = true;
    }
    self.postMessage({ type: 'EVENT_FRAME_STATS', payload: stats });
}

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
