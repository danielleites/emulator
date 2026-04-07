/**
 * ═══════════════════════════════════════════════════════
 *  wow-kpicard-worker.js — KPI Card Statistics Engine
 * ═══════════════════════════════════════════════════════
 *  Off-thread computation for N KPI cards:
 *    - Trend direction (up/down/flat) from EWMA slope
 *    - Delta from previous value
 *    - Min / Max / Mean / StdDev
 *    - Percentiles (P5, P50, P95) via quickselect
 *    - EWMA (Exponentially Weighted Moving Average)
 *    - Outlier detection (Z-Score > threshold)
 *
 *  Message Protocol:
 *    IN:  COMPUTE  → { cards: [{values: number[], prev, current}...], config }
 *    OUT: RESULT   → { stats: [{trend, delta, min, max, avg, ...}...] }
 *    OUT: ERROR    → { message }
 *
 *  ES5 compatible — no ES6 features.
 *  Version: WOW KPI v100
 * ═══════════════════════════════════════════════════════
 */

/* jshint worker:true */

// QA17-FIX: Worker guard — prevents collision when PI Vision loads this as regular script
if (typeof WorkerGlobalScope === 'undefined' && typeof importScripts === 'undefined') {
    // Not a Worker context — bail out silently
} else {
(function (self) {
'use strict';

var EWMA_ALPHA = 0.15;
var Z_SCORE_DEFAULT = 2.5;

/* ── Statistics Helpers ── */

function computeStats(values) {
    var n = values.length;
    if (n === 0) return { min: 0, max: 0, avg: 0, stdDev: 0, p5: 0, p50: 0, p95: 0, ewma: 0, n: 0 };

    var min = values[0], max = values[0], sum = 0;
    var i;
    for (i = 0; i < n; i++) {
        if (values[i] < min) min = values[i];
        if (values[i] > max) max = values[i];
        sum += values[i];
    }
    var avg = sum / n;

    // Standard deviation
    var sqSum = 0;
    for (i = 0; i < n; i++) {
        var diff = values[i] - avg;
        sqSum += diff * diff;
    }
    var stdDev = Math.sqrt(sqSum / n);

    // Percentiles via sorted copy
    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var p5  = sorted[Math.floor(n * 0.05)]  || sorted[0];
    var p50 = sorted[Math.floor(n * 0.50)]  || sorted[0];
    var p95 = sorted[Math.floor(n * 0.95)]  || sorted[n - 1];

    // EWMA
    var ewma = values[0];
    for (i = 1; i < n; i++) {
        ewma = EWMA_ALPHA * values[i] + (1 - EWMA_ALPHA) * ewma;
    }

    return {
        min: min, max: max, avg: avg, stdDev: stdDev,
        p5: p5, p50: p50, p95: p95, ewma: ewma, n: n
    };
}

function detectTrend(values) {
    var n = values.length;
    if (n < 3) return { dir: 'flat', pct: 0 };

    // Compare EWMA of recent third vs first third
    var third = Math.max(1, Math.floor(n / 3));
    var earlySum = 0, lateSum = 0;
    var i;
    for (i = 0; i < third; i++) earlySum += values[i];
    for (i = n - third; i < n; i++) lateSum += values[i];

    var earlyAvg = earlySum / third;
    var lateAvg  = lateSum / third;
    if (earlyAvg === 0) return { dir: lateAvg > 0 ? 'up' : 'flat', pct: 0 };

    var changePct = ((lateAvg - earlyAvg) / Math.abs(earlyAvg)) * 100;

    var dir = 'flat';
    if (changePct > 1)       dir = 'up';
    else if (changePct < -1) dir = 'down';

    return { dir: dir, pct: Math.round(Math.abs(changePct) * 10) / 10 };
}

function isOutlier(current, avg, stdDev, threshold) {
    if (stdDev === 0) return false;
    return Math.abs(current - avg) / stdDev > (threshold || Z_SCORE_DEFAULT);
}

/* ── Message Handler ── */

self.onmessage = function (e) {
    var msg = e.data;

    if (msg.type === 'COMPUTE') {
        try {
            var cards  = msg.cards || [];
            var config = msg.config || {};
            var zThreshold = config.zScoreThreshold || Z_SCORE_DEFAULT;
            var results = [];

            for (var c = 0; c < cards.length; c++) {
                var card   = cards[c];
                var values = card.values || [];
                var stats  = computeStats(values);
                var trend  = detectTrend(values);
                var current = card.current != null ? card.current : (values.length ? values[values.length - 1] : 0);
                var prev    = card.prev != null ? card.prev : (values.length > 1 ? values[values.length - 2] : current);

                var delta    = current - prev;
                var deltaPct = prev !== 0 ? ((delta / Math.abs(prev)) * 100) : 0;
                var outlier  = isOutlier(current, stats.avg, stats.stdDev, zThreshold);

                results.push({
                    idx:       c,
                    trend:     trend.dir,
                    trendPct:  trend.pct,
                    delta:     Math.round(delta * 1000) / 1000,
                    deltaPct:  Math.round(deltaPct * 10) / 10,
                    isOutlier: outlier,
                    min:       stats.min,
                    max:       stats.max,
                    avg:       stats.avg,
                    stdDev:    stats.stdDev,
                    p5:        stats.p5,
                    p50:       stats.p50,
                    p95:       stats.p95,
                    ewma:      stats.ewma,
                    sampleN:   stats.n
                });
            }

            self.postMessage({ type: 'RESULT', stats: results });
        } catch (err) {
            self.postMessage({ type: 'ERROR', message: err.message || String(err) });
        }
    }
};

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
