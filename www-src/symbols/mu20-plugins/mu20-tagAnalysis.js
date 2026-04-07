/**
 * ═══════════════════════════════════════════════════════
 *  mu20-tagAnalysis.js  —  Tag Analysis Engine
 * ═══════════════════════════════════════════════════════
 *  Pure computation module: resample, normalize,
 *  correlation, statistics, model builders.
 *  No UI — consumed by mu20-tagExplorer.
 *
 *  Ported from mm20-tagAnalysis.js (namespace MM20 → MU20).
 *  Namespace: MU20.TagAnalysis
 *  Version: ULT.1.6  |  ES5 only
 * ═══════════════════════════════════════════════════════
 */
(function (root) {
    'use strict';

    var MU = root.MU20;
    if (!MU) { console.error('[mu20-tagAnalysis] MU20 core not loaded'); return; }

    var TA = MU.TagAnalysis = {};


    // ═══════════════════════════════════════
    //  Statistics
    // ═══════════════════════════════════════

    /**
     * Calculate basic statistics for a numeric series.
     * @param {number[]} values
     * @returns {{ min, max, avg, sum, count, missing, std, range }}
     */
    TA.calcStats = function (values) {
        if (!values || !values.length) {
            return { min: 0, max: 0, avg: 0, sum: 0, count: 0, missing: 0, std: 0, range: 0 };
        }

        var sum = 0, count = 0, min = Infinity, max = -Infinity, missing = 0;
        var vals = [];

        for (var i = 0; i < values.length; i++) {
            var v = values[i];
            if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) {
                missing++;
                continue;
            }
            var n = Number(v);
            if (isNaN(n)) { missing++; continue; }
            vals.push(n);
            sum += n;
            count++;
            if (n < min) min = n;
            if (n > max) max = n;
        }

        if (count === 0) {
            return { min: 0, max: 0, avg: 0, sum: 0, count: 0, missing: missing, std: 0, range: 0 };
        }

        var avg = sum / count;

        // Standard deviation
        var sqDiffSum = 0;
        for (var j = 0; j < vals.length; j++) {
            sqDiffSum += (vals[j] - avg) * (vals[j] - avg);
        }
        var std = Math.sqrt(sqDiffSum / count);

        return {
            min: min,
            max: max,
            avg: avg,
            sum: sum,
            count: count,
            missing: missing,
            std: std,
            range: max - min
        };
    };


    // ═══════════════════════════════════════
    //  Resample / Align
    // ═══════════════════════════════════════

    /**
     * Align multiple time series to the same timestamps.
     * Uses linear interpolation for missing points.
     *
     * @param {Object[]} seriesList - [{ name, data: [{ts, val}] }]
     * @param {number} intervalMs - target interval in milliseconds
     * @returns {Object} { timestamps: [], series: [{ name, values: [] }] }
     */
    TA.alignSeries = function (seriesList, intervalMs) {
        if (!seriesList || !seriesList.length) {
            return { timestamps: [], series: [] };
        }

        // Find global time range
        var globalMin = Infinity, globalMax = -Infinity;
        for (var s = 0; s < seriesList.length; s++) {
            var data = seriesList[s].data;
            if (!data || !data.length) continue;
            for (var d = 0; d < data.length; d++) {
                var t = new Date(data[d].ts).getTime();
                if (t < globalMin) globalMin = t;
                if (t > globalMax) globalMax = t;
            }
        }

        if (globalMin === Infinity || globalMax === -Infinity) {
            return { timestamps: [], series: [] };
        }

        // Default interval: divide range into ~200 points
        if (!intervalMs || intervalMs <= 0) {
            intervalMs = Math.max(1000, Math.floor((globalMax - globalMin) / 200));
        }

        // Generate target timestamps
        var timestamps = [];
        for (var ts = globalMin; ts <= globalMax; ts += intervalMs) {
            timestamps.push(ts);
        }

        // Interpolate each series
        var result = [];
        for (var si = 0; si < seriesList.length; si++) {
            var series = seriesList[si];
            var src = (series.data || []).slice();

            // Sort source by timestamp
            src.sort(function (a, b) {
                return new Date(a.ts).getTime() - new Date(b.ts).getTime();
            });

            var values = [];
            var srcIdx = 0;

            for (var ti = 0; ti < timestamps.length; ti++) {
                var target = timestamps[ti];
                var interp = TA._interpolate(src, target, srcIdx);
                values.push(interp.value);
                srcIdx = interp.nextIdx;
            }

            result.push({
                name: series.name,
                values: values
            });
        }

        return { timestamps: timestamps, series: result };
    };

    /**
     * Linear interpolation helper with cursor optimization.
     * @param {Object[]} sortedData - sorted [{ts, val}]
     * @param {number} targetTs - target timestamp (ms)
     * @param {number} startIdx - scan start index (cursor)
     * @returns {{ value: number|null, nextIdx: number }}
     */
    TA._interpolate = function (sortedData, targetTs, startIdx) {
        var nil = { value: null, nextIdx: startIdx || 0 };
        if (!sortedData.length) return nil;

        var idx = startIdx || 0;
        var before = null, after = null, beforeIdx = idx;

        // Scan forward from cursor
        for (var i = idx; i < sortedData.length; i++) {
            var t = new Date(sortedData[i].ts).getTime();
            if (t <= targetTs) {
                before = { ts: t, val: sortedData[i].val };
                beforeIdx = i;
            }
            if (t >= targetTs) {
                after = { ts: t, val: sortedData[i].val };
                break;
            }
        }

        if (!before && !after) return nil;
        if (!before) return { value: after.val, nextIdx: beforeIdx };
        if (!after) return { value: before.val, nextIdx: beforeIdx };
        if (before.ts === after.ts) return { value: before.val, nextIdx: beforeIdx };

        // Linear interpolation
        var ratio = (targetTs - before.ts) / (after.ts - before.ts);
        return {
            value: before.val + ratio * (after.val - before.val),
            nextIdx: beforeIdx
        };
    };


    // ═══════════════════════════════════════
    //  Normalize
    // ═══════════════════════════════════════

    /**
     * Normalize a series to 0-1 range.
     * @param {number[]} values
     * @returns {number[]}
     */
    TA.normalize = function (values) {
        if (!values || !values.length) return [];
        var stats = TA.calcStats(values);

        var _isMissing = function (v) {
            return v === null || v === undefined || (typeof v === 'number' && isNaN(v));
        };

        if (stats.range === 0) {
            var result = [];
            for (var i = 0; i < values.length; i++) {
                result.push(_isMissing(values[i]) ? null : 0.5);
            }
            return result;
        }
        var out = [];
        for (var j = 0; j < values.length; j++) {
            if (_isMissing(values[j])) {
                out.push(null);
            } else {
                out.push((values[j] - stats.min) / stats.range);
            }
        }
        return out;
    };


    // ═══════════════════════════════════════
    //  Correlation
    // ═══════════════════════════════════════

    /**
     * Pearson correlation coefficient between two aligned series.
     * @param {number[]} a
     * @param {number[]} b
     * @returns {number} r in [-1, 1] or NaN
     */
    TA.correlation = function (a, b) {
        if (!a || !b) return NaN;
        var n = Math.min(a.length, b.length);
        if (n < 3) return NaN;

        var sumA = 0, sumB = 0, sumAB = 0, sumA2 = 0, sumB2 = 0, count = 0;

        for (var i = 0; i < n; i++) {
            if (a[i] === null || b[i] === null || a[i] === undefined || b[i] === undefined) continue;
            sumA  += a[i];
            sumB  += b[i];
            sumAB += a[i] * b[i];
            sumA2 += a[i] * a[i];
            sumB2 += b[i] * b[i];
            count++;
        }

        if (count < 3) return NaN;

        var num = count * sumAB - sumA * sumB;
        var den = Math.sqrt((count * sumA2 - sumA * sumA) * (count * sumB2 - sumB * sumB));

        return den === 0 ? NaN : num / den;
    };

    /**
     * Build a correlation matrix for multiple series.
     * @param {Object[]} alignedSeries - [{ name, values }]
     * @returns {{ names: string[], matrix: number[][] }}
     */
    TA.correlationMatrix = function (alignedSeries) {
        if (!alignedSeries || !alignedSeries.length) return { names: [], matrix: [] };
        var names = [];
        var matrix = [];

        for (var i = 0; i < alignedSeries.length; i++) {
            names.push(alignedSeries[i].name);
            matrix.push([]);
            for (var j = 0; j < alignedSeries.length; j++) {
                if (i === j) {
                    matrix[i].push(1);
                } else if (j < i) {
                    // Already computed - symmetric
                    matrix[i].push(matrix[j][i]);
                } else {
                    matrix[i].push(TA.correlation(alignedSeries[i].values, alignedSeries[j].values));
                }
            }
        }

        return { names: names, matrix: matrix };
    };


    // ═══════════════════════════════════════
    //  Model Builders
    // ═══════════════════════════════════════

    /**
     * Build trend model for chart rendering.
     * @param {Object} aligned - from alignSeries
     * @returns {Object} { labels, datasets }
     */
    TA.buildTrendModel = function (aligned) {
        if (!aligned || !aligned.timestamps) return { labels: [], datasets: [] };

        var labels = [];
        for (var i = 0; i < aligned.timestamps.length; i++) {
            labels.push(new Date(aligned.timestamps[i]));
        }

        var datasets = [];
        for (var s = 0; s < aligned.series.length; s++) {
            datasets.push({
                name: aligned.series[s].name,
                values: aligned.series[s].values,
                stats: TA.calcStats(aligned.series[s].values)
            });
        }

        return { labels: labels, datasets: datasets };
    };

    /**
     * Build scatter model for X/Y chart.
     * @param {number[]} xValues
     * @param {number[]} yValues
     * @param {string} xName
     * @param {string} yName
     * @returns {Object}
     */
    TA.buildScatterModel = function (xValues, yValues, xName, yName) {
        if (!xValues || !yValues) {
            return { xName: xName, yName: yName, points: [], correlation: NaN,
                     xStats: TA.calcStats([]), yStats: TA.calcStats([]) };
        }
        var points = [];
        var n = Math.min(xValues.length, yValues.length);

        for (var i = 0; i < n; i++) {
            if (xValues[i] !== null && yValues[i] !== null &&
                xValues[i] !== undefined && yValues[i] !== undefined) {
                points.push({ x: xValues[i], y: yValues[i] });
            }
        }

        return {
            xName: xName,
            yName: yName,
            points: points,
            correlation: TA.correlation(xValues, yValues),
            xStats: TA.calcStats(xValues),
            yStats: TA.calcStats(yValues)
        };
    };

    /**
     * Build summary table model.
     * @param {Object[]} alignedSeries - [{ name, values }]
     * @returns {Object[]} [{ name, min, max, avg, std, count, missing, range }]
     */
    TA.buildSummaryTable = function (alignedSeries) {
        if (!alignedSeries || !alignedSeries.length) return [];
        var rows = [];
        for (var i = 0; i < alignedSeries.length; i++) {
            var s = alignedSeries[i];
            var stats = TA.calcStats(s.values);
            rows.push({
                name: s.name,
                min: stats.min,
                max: stats.max,
                avg: stats.avg,
                std: stats.std,
                count: stats.count,
                missing: stats.missing,
                range: stats.range,
                missingRatio: stats.count > 0 ? (stats.missing / (stats.count + stats.missing)) : 1
            });
        }
        return rows;
    };


    // ═══════════════════════════════════════
    //  Color Helpers (for charts)
    // ═══════════════════════════════════════

    TA.CHART_COLORS = [
        '#5BC0EB', '#FDE74C', '#9BC53D', '#E55934', '#FA7921',
        '#C45BAA', '#2ECC71', '#3498DB', '#E74C3C', '#F39C12'
    ];

    TA.getColor = function (idx) {
        return TA.CHART_COLORS[idx % TA.CHART_COLORS.length];
    };

    /**
     * Map a correlation coefficient to a heatmap color.
     * @param {number} r - [-1, 1]
     * @returns {string} CSS color
     */
    TA.correlationColor = function (r) {
        if (isNaN(r)) return '#333';
        // -1 = red, 0 = gray, +1 = green
        var abs = Math.abs(r);
        if (r >= 0) {
            var g = Math.round(80 + abs * 175);
            return 'rgb(46,' + g + ',113)';
        } else {
            var rd = Math.round(80 + abs * 175);
            return 'rgb(' + rd + ',60,60)';
        }
    };


})(window);
