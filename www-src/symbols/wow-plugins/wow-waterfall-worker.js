/**
 * ═══════════════════════════════════════════════════════
 *  wow-waterfall-worker.js — Waterfall Running Total Worker
 * ═══════════════════════════════════════════════════════
 *  Off-thread computation for:
 *  - Single pass running total (steps array)
 *  - Biggest loser detection
 *  - Extended statistics: min, max, avg, stdDev, total gains/losses
 *
 *  Message protocol:
 *    IN  → { cmd: 'COMPUTE', rows: [...], autoTotals: bool, totalIndices: '0,6' }
 *    OUT → { cmd: 'RESULT',  steps: [...], stats: {...} }
 *
 *  Version : WOW Waterfall v100
 * ═══════════════════════════════════════════════════════
 */

/* eslint-env worker */
/* eslint no-restricted-globals: 0 */


// QA17-FIX: Worker guard — prevents collision when PI Vision loads this as regular script
if (typeof WorkerGlobalScope === 'undefined' && typeof importScripts === 'undefined') {
    // Not a Worker context — bail out silently
} else {
(function (self) {
self.onmessage = function (e) {
    var msg = e.data;
    if (!msg || msg.cmd !== 'COMPUTE') return;

    var rows        = msg.rows || [];
    var autoTotals  = msg.autoTotals !== false;
    var totalStr    = (msg.totalIndices || '').trim();

    /* ── Parse manual total indices ── */
    var totalSet = {};
    if (totalStr) {
        var parts = totalStr.split(',');
        for (var p = 0; p < parts.length; p++) {
            var idx = parseInt(parts[p].trim(), 10);
            if (!isNaN(idx)) totalSet[idx] = true;
        }
    }

    /* ═══ Single Pass Running Total ═══ */
    var running  = 0;
    var result   = [];
    var mn = 0, mx = 0;
    var worstVal = 0, worstI = -1;
    var totalGains = 0, totalLosses = 0;
    var intermediateVals = [];

    for (var i = 0; i < rows.length; i++) {
        var val   = parseFloat(rows[i].Value) || 0;
        var label = rows[i].Label || ('Step ' + (i + 1));
        var isTotal = totalSet[i] ||
                      (autoTotals && (i === 0 || i === rows.length - 1));

        var start, end;

        if (isTotal) {
            if (i === 0) {
                start = 0; end = val; running = val;
            } else {
                start = 0; end = running; val = running;
            }
        } else {
            start = running;
            running += val;
            end = running;

            /* Track gains and losses */
            if (val >= 0) totalGains += val;
            else          totalLosses += val;

            /* Collect for stdDev */
            intermediateVals.push(val);

            /* Track biggest loser */
            if (val < 0 && Math.abs(val) > Math.abs(worstVal)) {
                worstVal = val;
                worstI   = result.length;
            }
        }

        var lo = Math.min(start, end, 0);
        var hi = Math.max(start, end);
        if (lo < mn) mn = lo;
        if (hi > mx) mx = hi;

        result.push({
            label:   label,
            val:     val,
            start:   start,
            end:     end,
            isTotal: !!isTotal,
            running: end
        });
    }

    /* ═══ Extended Statistics ═══ */
    var anchorVal = result.length > 0 ? result[0].end : 0;
    var finalVal  = running;
    var n         = intermediateVals.length;

    var avg    = 0;
    var stdDev = 0;

    if (n > 0) {
        var sum = 0;
        for (var j = 0; j < n; j++) sum += intermediateVals[j];
        avg = sum / n;

        if (n > 1) {
            var sqSum = 0;
            for (var k = 0; k < n; k++) {
                var diff = intermediateVals[k] - avg;
                sqSum += diff * diff;
            }
            stdDev = Math.sqrt(sqSum / (n - 1));
        }
    }

    /* ═══ Return Result ═══ */
    self.postMessage({
        cmd:   'RESULT',
        steps: result,
        stats: {
            anchorVal:    anchorVal,
            finalVal:     finalVal,
            loserIdx:     worstI,
            loserVal:     worstVal,
            minVal:       mn,
            maxVal:       mx,
            totalGains:   totalGains,
            totalLosses:  totalLosses,
            avgStep:      avg,
            stdDev:       stdDev,
            stepCount:    result.length,
            intermediateCount: n
        }
    });
};

})(typeof self !== 'undefined' ? self : this);
} // end Worker guard
