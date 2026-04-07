/**
 * qa-data-quality.js — Stage 6 data quality profiling + simple drift baseline
 * ES5 compatible lightweight profiling across symbol updates.
 */
(function (window) {
    'use strict';

    var QA = window.EMU_QA = window.EMU_QA || {};
    var DataQuality = window.EMU_QA_DATA_QUALITY = window.EMU_QA_DATA_QUALITY || {};
    var _profiles = {};
    var _historyLimit = 24;

    function _nowIso() {
        return new Date().toISOString();
    }

    function _copy(target, source) {
        var key;
        target = target || {};
        source = source || {};
        for (key in source) {
            if (source.hasOwnProperty(key)) target[key] = source[key];
        }
        return target;
    }

    function _typeOf(value) {
        if (value === null) return 'null';
        if (typeof value === 'undefined') return 'undefined';
        if (Object.prototype.toString.call(value) === '[object Array]') return 'array';
        return typeof value;
    }

    function _isFiniteNumber(value) {
        return typeof value === 'number' && !isNaN(value) && isFinite(value);
    }

    function _toFiniteNumber(value) {
        var parsed;
        if (_isFiniteNumber(value)) return value;
        if (typeof value === 'string' && value !== '') {
            parsed = parseFloat(value);
            if (!isNaN(parsed) && isFinite(parsed)) return parsed;
        }
        return null;
    }

    function _normalizeStatus(status) {
        var value = status === null || typeof status === 'undefined' ? '' : String(status).toLowerCase();
        if (!value) return 'unknown';
        if (value.indexOf('good') !== -1 || value.indexOf('ok') !== -1 || value.indexOf('healthy') !== -1 || value.indexOf('normal') !== -1) return 'good';
        if (value.indexOf('warn') !== -1 || value.indexOf('uncertain') !== -1 || value.indexOf('alert') !== -1) return 'warning';
        if (value.indexOf('critical') !== -1 || value.indexOf('bad') !== -1 || value.indexOf('error') !== -1 || value.indexOf('fail') !== -1) return 'bad';
        if (value.indexOf('stale') !== -1 || value.indexOf('late') !== -1 || value.indexOf('old') !== -1) return 'stale';
        return value;
    }

    function _safeDateMs(value) {
        var ms;
        if (!value) return null;
        ms = Date.parse(value);
        if (isNaN(ms)) return null;
        return ms;
    }

    function _pushNumeric(collector, numberValue) {
        if (!_isFiniteNumber(numberValue)) return;
        collector.numericCount += 1;
        collector.numericSum += numberValue;
        if (collector.numericMin === null || numberValue < collector.numericMin) collector.numericMin = numberValue;
        if (collector.numericMax === null || numberValue > collector.numericMax) collector.numericMax = numberValue;
    }

    function _walkValue(value, path, collector) {
        var kind = _typeOf(value);
        var i;
        var key;
        var numberValue;
        var tsMs;
        collector.fieldCount += 1;
        if (kind === 'null' || kind === 'undefined') {
            collector.nullCount += 1;
            if (collector.nullExamples.length < 5) collector.nullExamples.push(path || 'payload');
            return;
        }
        numberValue = _toFiniteNumber(value);
        if (_isFiniteNumber(numberValue) && kind !== 'object' && kind !== 'array') {
            _pushNumeric(collector, numberValue);
        }
        if (kind === 'string') {
            if (path && path.toLowerCase().indexOf('status') !== -1) {
                collector.statusCount += 1;
                collector.statusDistribution[_normalizeStatus(value)] = (collector.statusDistribution[_normalizeStatus(value)] || 0) + 1;
            }
            if (path && path.toLowerCase().indexOf('timestamp') !== -1) {
                tsMs = _safeDateMs(value);
                if (tsMs !== null) {
                    collector.timestampCount += 1;
                    if (collector.latestTimestampMs === null || tsMs > collector.latestTimestampMs) collector.latestTimestampMs = tsMs;
                    if (collector.oldestTimestampMs === null || tsMs < collector.oldestTimestampMs) collector.oldestTimestampMs = tsMs;
                }
            }
            return;
        }
        if (kind === 'array') {
            collector.arrayCount += 1;
            for (i = 0; i < value.length; i++) {
                _walkValue(value[i], (path || 'payload') + '[' + i + ']', collector);
            }
            return;
        }
        if (kind === 'object') {
            collector.objectCount += 1;
            for (key in value) {
                if (value.hasOwnProperty(key)) {
                    _walkValue(value[key], path ? (path + '.' + key) : key, collector);
                }
            }
        }
    }

    function _dominantStatus(distribution) {
        var key;
        var bestKey = 'unknown';
        var bestCount = 0;
        for (key in distribution) {
            if (distribution.hasOwnProperty(key) && distribution[key] > bestCount) {
                bestKey = key;
                bestCount = distribution[key];
            }
        }
        return bestKey;
    }

    function _ratio(numerator, denominator) {
        if (!denominator) return 0;
        return numerator / denominator;
    }

    function _round(value, digits) {
        var factor;
        if (typeof value !== 'number' || !isFinite(value)) return value;
        factor = Math.pow(10, typeof digits === 'number' ? digits : 2);
        return Math.round(value * factor) / factor;
    }

    function _clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function _extractPrimaryValue(payload) {
        var value;
        var rows;
        var values;
        var i;
        if (!payload || typeof payload !== 'object') return null;
        value = _toFiniteNumber(payload.Value);
        if (_isFiniteNumber(value)) return value;
        rows = Object.prototype.toString.call(payload.Rows) === '[object Array]' ? payload.Rows : [];
        for (i = 0; i < rows.length; i++) {
            value = _toFiniteNumber(rows[i] && rows[i].Value);
            if (_isFiniteNumber(value)) return value;
        }
        values = Object.prototype.toString.call(payload.Values) === '[object Array]' ? payload.Values : [];
        if (values.length) {
            value = _toFiniteNumber(values[values.length - 1] && values[values.length - 1].Value);
            if (_isFiniteNumber(value)) return value;
        }
        return null;
    }

    function _buildProfile(symbolId, payload, meta) {
        var collector = {
            fieldCount: 0,
            nullCount: 0,
            numericCount: 0,
            numericSum: 0,
            numericMin: null,
            numericMax: null,
            objectCount: 0,
            arrayCount: 0,
            statusCount: 0,
            statusDistribution: {},
            timestampCount: 0,
            latestTimestampMs: null,
            oldestTimestampMs: null,
            nullExamples: []
        };
        var nowMs = new Date().getTime();
        var mean = null;
        var span = null;
        var latestAgeMs = null;
        var freshnessState = 'unknown';
        var numericCoverage;
        var nullRate;
        var health = [];
        var dominantStatus;
        var primaryValue = _extractPrimaryValue(payload);

        _walkValue(payload, 'payload', collector);
        mean = collector.numericCount ? (collector.numericSum / collector.numericCount) : null;
        span = (collector.numericMin !== null && collector.numericMax !== null) ? (collector.numericMax - collector.numericMin) : null;
        latestAgeMs = collector.latestTimestampMs !== null ? Math.max(0, nowMs - collector.latestTimestampMs) : null;
        if (latestAgeMs === null) freshnessState = 'unknown';
        else if (latestAgeMs > 15 * 60 * 1000) freshnessState = 'stale';
        else if (latestAgeMs > 5 * 60 * 1000) freshnessState = 'aging';
        else freshnessState = 'fresh';
        numericCoverage = collector.fieldCount ? collector.numericCount / collector.fieldCount : 0;
        nullRate = collector.fieldCount ? collector.nullCount / collector.fieldCount : 0;
        dominantStatus = _dominantStatus(collector.statusDistribution);

        if (collector.nullCount > 0) health.push('has-nulls');
        if (nullRate >= 0.3) health.push('high-null-rate');
        if (numericCoverage <= 0.05) health.push('low-numeric-coverage');
        if (freshnessState === 'aging') health.push('aging-data');
        if (freshnessState === 'stale') health.push('stale-data');
        if (!collector.timestampCount) health.push('no-timestamps');
        if (!collector.statusCount) health.push('no-status-fields');
        if (!collector.numericCount) health.push('no-numeric-values');

        return {
            symbolId: symbolId || '',
            profiledAt: _nowIso(),
            source: meta && meta.source ? meta.source : 'data-update',
            expectedShape: meta && meta.expectedShape ? meta.expectedShape : '',
            updateCount: 1,
            fieldCount: collector.fieldCount,
            nullCount: collector.nullCount,
            nullRate: _round(nullRate, 4),
            numericCount: collector.numericCount,
            numericCoverage: _round(numericCoverage, 4),
            statusCount: collector.statusCount,
            statusDistribution: collector.statusDistribution,
            dominantStatus: dominantStatus,
            timestampCount: collector.timestampCount,
            freshness: {
                latestTimestamp: collector.latestTimestampMs !== null ? new Date(collector.latestTimestampMs).toISOString() : null,
                oldestTimestamp: collector.oldestTimestampMs !== null ? new Date(collector.oldestTimestampMs).toISOString() : null,
                ageMs: latestAgeMs,
                ageMinutes: latestAgeMs === null ? null : _round(latestAgeMs / 60000, 2),
                state: freshnessState
            },
            ranges: {
                min: collector.numericMin,
                max: collector.numericMax,
                mean: mean === null ? null : _round(mean, 4),
                span: span === null ? null : _round(span, 4)
            },
            primaryValue: primaryValue,
            shape: {
                objectCount: collector.objectCount,
                arrayCount: collector.arrayCount
            },
            nullExamples: collector.nullExamples,
            healthFlags: health,
            healthScore: 100,
            drift: null,
            meta: _copy({}, meta || {})
        };
    }

    function _mergeTotals(history) {
        var totals = {
            updateCount: 0,
            nullRateSum: 0,
            numericCoverageSum: 0,
            meanSum: 0,
            meanCount: 0,
            spanSum: 0,
            spanCount: 0,
            freshnessAgeSum: 0,
            freshnessAgeCount: 0,
            statusDistribution: {},
            staleCount: 0,
            agingCount: 0,
            freshCount: 0
        };
        var i;
        var item;
        var key;
        if (!history || !history.length) return totals;
        for (i = 0; i < history.length; i++) {
            item = history[i] || {};
            totals.updateCount += item.updateCount || 1;
            totals.nullRateSum += typeof item.nullRate === 'number' ? item.nullRate : 0;
            totals.numericCoverageSum += typeof item.numericCoverage === 'number' ? item.numericCoverage : 0;
            if (item.ranges && typeof item.ranges.mean === 'number') {
                totals.meanSum += item.ranges.mean;
                totals.meanCount += 1;
            }
            if (item.ranges && typeof item.ranges.span === 'number') {
                totals.spanSum += item.ranges.span;
                totals.spanCount += 1;
            }
            if (item.freshness && typeof item.freshness.ageMs === 'number') {
                totals.freshnessAgeSum += item.freshness.ageMs;
                totals.freshnessAgeCount += 1;
            }
            if (item.freshness && item.freshness.state === 'stale') totals.staleCount += 1;
            else if (item.freshness && item.freshness.state === 'aging') totals.agingCount += 1;
            else if (item.freshness && item.freshness.state === 'fresh') totals.freshCount += 1;
            for (key in (item.statusDistribution || {})) {
                if (item.statusDistribution.hasOwnProperty(key)) {
                    totals.statusDistribution[key] = (totals.statusDistribution[key] || 0) + item.statusDistribution[key];
                }
            }
        }
        return totals;
    }

    function _buildBaseline(history) {
        var totals = _mergeTotals(history);
        var count = history && history.length ? history.length : 0;
        return {
            sampleSize: count,
            avgNullRate: count ? _round(totals.nullRateSum / count, 4) : null,
            avgNumericCoverage: count ? _round(totals.numericCoverageSum / count, 4) : null,
            avgMean: totals.meanCount ? _round(totals.meanSum / totals.meanCount, 4) : null,
            avgSpan: totals.spanCount ? _round(totals.spanSum / totals.spanCount, 4) : null,
            avgFreshnessAgeMs: totals.freshnessAgeCount ? Math.round(totals.freshnessAgeSum / totals.freshnessAgeCount) : null,
            dominantStatus: _dominantStatus(totals.statusDistribution),
            statusDistribution: totals.statusDistribution,
            staleRate: count ? _round(totals.staleCount / count, 4) : 0,
            agingRate: count ? _round(totals.agingCount / count, 4) : 0,
            freshRate: count ? _round(totals.freshCount / count, 4) : 0
        };
    }

    function _compareRatio(currentValue, baselineValue) {
        if (typeof currentValue !== 'number' || typeof baselineValue !== 'number') return null;
        if (baselineValue === 0) {
            return currentValue === 0 ? 0 : 1;
        }
        return Math.abs(currentValue - baselineValue) / Math.abs(baselineValue);
    }

    function _pushUnique(list, value) {
        var i;
        if (!list || value === null || typeof value === 'undefined' || value === '') return list;
        for (i = 0; i < list.length; i++) {
            if (list[i] === value) return list;
        }
        list.push(value);
        return list;
    }

    function _issueFamilyFromCode(code) {
        code = code || '';
        if (code.indexOf('null') !== -1) return 'completeness';
        if (code.indexOf('coverage') !== -1) return 'coverage';
        if (code.indexOf('freshness') !== -1 || code.indexOf('stale') !== -1 || code.indexOf('aging') !== -1) return 'freshness';
        if (code.indexOf('status') !== -1) return 'status';
        if (code.indexOf('span') !== -1 || code.indexOf('mean') !== -1 || code.indexOf('range') !== -1) return 'distribution';
        return 'drift';
    }

    function _patternLabelForFamily(family, severity) {
        if (family === 'freshness') return severity === 'fail' ? 'staleness-escalation' : 'freshness-regression';
        if (family === 'completeness') return severity === 'fail' ? 'null-explosion' : 'null-creep';
        if (family === 'coverage') return severity === 'fail' ? 'coverage-collapse' : 'coverage-drop';
        if (family === 'distribution') return severity === 'fail' ? 'distribution-break' : 'distribution-shift';
        if (family === 'status') return severity === 'fail' ? 'status-instability' : 'status-shift';
        return severity === 'fail' ? 'drift-break' : 'drift-shift';
    }

    function _addDriftIssue(target, severity, code, message, currentValue, baselineValue) {
        var family = _issueFamilyFromCode(code);
        var issue = {
            severity: severity,
            code: code,
            issueCode: code,
            family: family,
            issueFamily: family,
            pattern: _patternLabelForFamily(family, severity),
            message: message,
            current: currentValue,
            baseline: baselineValue,
            ts: _nowIso()
        };
        target.issues.push(issue);
        target.issueCodes[code] = (target.issueCodes[code] || 0) + 1;
        target.issueFamilies[family] = (target.issueFamilies[family] || 0) + 1;
        _pushUnique(target.patterns, issue.pattern);
        if (severity === 'fail') target.failures += 1;
        else target.warnings += 1;
    }

    function _dominantCountKey(map) {
        var key;
        var bestKey = null;
        var bestValue = -1;
        for (key in (map || {})) {
            if (map.hasOwnProperty(key) && map[key] > bestValue) {
                bestKey = key;
                bestValue = map[key];
            }
        }
        return bestKey;
    }

    function _buildDriftPatternSummary(drift, currentProfile, baseline) {
        var patterns = [];
        var dominantFamily = _dominantCountKey(drift.issueFamilies) || 'stable';
        var summary;
        if (!drift.enabled) {
            return {
                dominantFamily: 'baseline',
                patternGroup: 'baseline-building',
                patterns: [],
                issueFamilyCounts: drift.issueFamilies,
                issueCodeCounts: drift.issueCodes,
                summary: drift.summary
            };
        }
        if ((drift.issueFamilies.freshness || 0) > 0 && currentProfile && currentProfile.freshness && currentProfile.freshness.state === 'stale') {
            _pushUnique(patterns, 'stale-signal-cluster');
        }
        if ((drift.issueFamilies.completeness || 0) > 0 && (drift.issueFamilies.coverage || 0) > 0) {
            _pushUnique(patterns, 'shape-degradation-cluster');
        }
        if ((drift.issueFamilies.distribution || 0) > 0 && (drift.issueFamilies.status || 0) > 0) {
            _pushUnique(patterns, 'state-and-distribution-shift');
        }
        if ((drift.issueFamilies.distribution || 0) >= 2) {
            _pushUnique(patterns, 'distribution-instability');
        }
        if (!patterns.length && drift.issues.length) {
            _pushUnique(patterns, _patternLabelForFamily(dominantFamily, drift.status === 'FAIL' ? 'fail' : 'warning'));
        }
        if (!patterns.length) {
            _pushUnique(patterns, 'stable-baseline');
        }
        summary = drift.status === 'PASS' ? 'אין drift חריג מול baseline' : 'זוהו ' + drift.issues.length + ' סימני drift בקטגוריה ' + dominantFamily;
        if (baseline && baseline.sampleSize >= 6 && currentProfile && currentProfile.healthScore <= 70 && drift.status !== 'PASS') {
            _pushUnique(patterns, 'health-regression');
        }
        return {
            dominantFamily: dominantFamily,
            patternGroup: patterns[0],
            patterns: patterns,
            issueFamilyCounts: drift.issueFamilies,
            issueCodeCounts: drift.issueCodes,
            summary: summary
        };
    }

    function _buildDrift(currentProfile, history, meta) {
        var baselineHistory = history && history.length ? history.slice(0, history.length - 1) : [];
        var baseline = _buildBaseline(baselineHistory);
        var drift = {
            enabled: baseline.sampleSize >= 3,
            sampleSize: baseline.sampleSize,
            baseline: baseline,
            status: 'PASS',
            warnings: 0,
            failures: 0,
            issues: [],
            changedFields: [],
            issueCodes: {},
            issueFamilies: {},
            patterns: [],
            dominantFamily: 'baseline',
            patternGroup: 'baseline-building',
            summary: 'אין baseline מספיק עדיין'
        };
        var patternSummary;
        var nullDelta;
        var numericDelta;
        var meanRatio;
        var spanRatio;
        var freshnessRatio;
        var primaryValueRatio;
        var expectedBand;
        var statusNow;
        if (!drift.enabled) {
            return drift;
        }
        nullDelta = typeof baseline.avgNullRate === 'number' && typeof currentProfile.nullRate === 'number' ? currentProfile.nullRate - baseline.avgNullRate : null;
        numericDelta = typeof baseline.avgNumericCoverage === 'number' && typeof currentProfile.numericCoverage === 'number' ? currentProfile.numericCoverage - baseline.avgNumericCoverage : null;
        meanRatio = _compareRatio(currentProfile.ranges && currentProfile.ranges.mean, baseline.avgMean);
        spanRatio = _compareRatio(currentProfile.ranges && currentProfile.ranges.span, baseline.avgSpan);
        freshnessRatio = _compareRatio(currentProfile.freshness && currentProfile.freshness.ageMs, baseline.avgFreshnessAgeMs);
        primaryValueRatio = _compareRatio(currentProfile.primaryValue, baseline.avgMean);
        expectedBand = meta && meta.dataState ? String(meta.dataState).toLowerCase() : '';
        statusNow = currentProfile.dominantStatus || 'unknown';

        if (nullDelta !== null && nullDelta >= 0.2) {
            _addDriftIssue(drift, nullDelta >= 0.35 ? 'fail' : 'warning', 'null-rate-spike', 'עלייה חריגה בשכיחות nulls.', _round(currentProfile.nullRate, 4), baseline.avgNullRate);
            drift.changedFields.push('nullRate');
        }
        if (numericDelta !== null && numericDelta <= -0.2) {
            _addDriftIssue(drift, numericDelta <= -0.35 ? 'fail' : 'warning', 'numeric-coverage-drop', 'ירידה חריגה בכיסוי הערכים המספריים.', _round(currentProfile.numericCoverage, 4), baseline.avgNumericCoverage);
            drift.changedFields.push('numericCoverage');
        }
        if (meanRatio !== null && meanRatio >= 0.35) {
            _addDriftIssue(drift, meanRatio >= 0.7 ? 'fail' : 'warning', 'mean-shift', 'שינוי בולט בממוצע הערכים.', currentProfile.ranges.mean, baseline.avgMean);
            drift.changedFields.push('mean');
        }
        if (spanRatio !== null && spanRatio >= 0.6) {
            _addDriftIssue(drift, spanRatio >= 1 ? 'fail' : 'warning', 'range-span-shift', 'שינוי בולט ברוחב הטווח.', currentProfile.ranges.span, baseline.avgSpan);
            drift.changedFields.push('span');
        }
        if (freshnessRatio !== null && freshnessRatio >= 1.5 && currentProfile.freshness && currentProfile.freshness.ageMs > 120000) {
            _addDriftIssue(drift, freshnessRatio >= 3 ? 'fail' : 'warning', 'freshness-regression', 'הנתונים מתיישנים מהר יותר מהרגיל.', currentProfile.freshness.ageMs, baseline.avgFreshnessAgeMs);
            drift.changedFields.push('freshness');
        }
        if (primaryValueRatio !== null && primaryValueRatio >= 0.18) {
            _addDriftIssue(drift, primaryValueRatio >= 0.32 || expectedBand === 'critical' ? 'fail' : 'warning', 'primary-value-shift', 'ערך ה-KPI הראשי זז משמעותית מול ה-baseline.', currentProfile.primaryValue, baseline.avgMean);
            drift.changedFields.push('primaryValue');
        }
        if (baseline.dominantStatus && baseline.dominantStatus !== 'unknown' && statusNow !== baseline.dominantStatus && currentProfile.statusCount > 0) {
            _addDriftIssue(drift, statusNow === 'bad' || statusNow === 'stale' ? 'fail' : 'warning', 'status-distribution-shift', 'התפלגות ה-status השתנתה ביחס לבסיס.', statusNow, baseline.dominantStatus);
            drift.changedFields.push('status');
        }

        if (drift.failures > 0) drift.status = 'FAIL';
        else if (drift.warnings > 0) drift.status = 'WARNING';
        else drift.status = 'PASS';

        patternSummary = _buildDriftPatternSummary(drift, currentProfile, baseline);
        drift.dominantFamily = patternSummary.dominantFamily;
        drift.patternGroup = patternSummary.patternGroup;
        drift.patterns = patternSummary.patterns;
        drift.issueFamilies = patternSummary.issueFamilyCounts;
        drift.issueCodes = patternSummary.issueCodeCounts;
        drift.summary = patternSummary.summary;
        return drift;
    }

    function _scoreHealth(profile) {
        var score = 100;
        var primaryShift = profile && profile.drift && profile.drift.changedFields && profile.drift.changedFields.indexOf('primaryValue') !== -1;
        score -= Math.round((profile.nullRate || 0) * 40);
        score -= Math.round((1 - (profile.numericCoverage || 0)) * 12);
        if (profile.freshness && profile.freshness.state === 'aging') score -= 10;
        if (profile.freshness && profile.freshness.state === 'stale') score -= 25;
        if (profile.healthFlags && profile.healthFlags.length > 0) score -= Math.min(18, profile.healthFlags.length * 3);
        if (profile.drift) {
            score -= (profile.drift.warnings || 0) * 6;
            score -= (profile.drift.failures || 0) * 15;
            if (primaryShift) score -= profile.drift.failures > 0 ? 14 : 8;
        }
        if (score < 0) score = 0;
        if (score > 100) score = 100;
        return score;
    }

    DataQuality.profile = function (symbolId, payload, meta) {
        return _buildProfile(symbolId, payload, meta || {});
    };

    DataQuality.profileAndStore = function (symbolId, payload, meta) {
        var profile;
        var history;
        var drift;
        if (!symbolId) return null;
        profile = _buildProfile(symbolId, payload, meta || {});
        history = _profiles[symbolId] || [];
        profile.updateCount = history.length + 1;
        history.push(_clone(profile));
        while (history.length > _historyLimit) history.shift();
        drift = _buildDrift(profile, history, meta || {});
        profile.drift = drift;
        profile.healthScore = _scoreHealth(profile);
        history[history.length - 1] = _clone(profile);
        _profiles[symbolId] = history;
        if (QA && typeof QA.setDataQualityResult === 'function') {
            QA.setDataQualityResult(symbolId, profile, history);
        }
        return profile;
    };

    DataQuality.getHistory = function (symbolId) {
        if (!symbolId) return _profiles;
        return _profiles[symbolId] || [];
    };

    DataQuality.resetSymbol = function (symbolId) {
        if (symbolId) _profiles[symbolId] = [];
    };

    DataQuality.getTotals = function () {
        var key;
        var latest;
        var totals = {
            symbols: 0,
            updates: 0,
            avgHealthScore: 100,
            avgNullRate: 0,
            avgNumericCoverage: 0,
            staleSymbols: 0,
            agingSymbols: 0,
            driftPass: 0,
            driftWarning: 0,
            driftFail: 0,
            highNullSymbols: 0,
            lowNumericCoverageSymbols: 0,
            issueFamilies: {},
            issueCodes: {},
            patternGroups: {},
            dominantFamilies: {},
            symbolSummaries: []
        };
        var totalHealth = 0;
        var totalNullRate = 0;
        var totalNumericCoverage = 0;
        var drift;
        var driftIssue;
        var i;
        for (key in _profiles) {
            if (_profiles.hasOwnProperty(key) && _profiles[key] && _profiles[key].length) {
                latest = _profiles[key][_profiles[key].length - 1];
                drift = latest.drift || null;
                totals.symbols += 1;
                totals.updates += _profiles[key].length;
                totalHealth += latest.healthScore || 0;
                totalNullRate += latest.nullRate || 0;
                totalNumericCoverage += latest.numericCoverage || 0;
                if (latest.freshness && latest.freshness.state === 'stale') totals.staleSymbols += 1;
                else if (latest.freshness && latest.freshness.state === 'aging') totals.agingSymbols += 1;
                if (drift && drift.status === 'FAIL') totals.driftFail += 1;
                else if (drift && drift.status === 'WARNING') totals.driftWarning += 1;
                else totals.driftPass += 1;
                if ((latest.nullRate || 0) >= 0.3) totals.highNullSymbols += 1;
                if ((latest.numericCoverage || 0) <= 0.05) totals.lowNumericCoverageSymbols += 1;
                if (drift && drift.patternGroup) totals.patternGroups[drift.patternGroup] = (totals.patternGroups[drift.patternGroup] || 0) + 1;
                if (drift && drift.dominantFamily) totals.dominantFamilies[drift.dominantFamily] = (totals.dominantFamilies[drift.dominantFamily] || 0) + 1;
                for (i = 0; drift && drift.issues && i < drift.issues.length; i++) {
                    driftIssue = drift.issues[i] || {};
                    if (driftIssue.issueFamily) totals.issueFamilies[driftIssue.issueFamily] = (totals.issueFamilies[driftIssue.issueFamily] || 0) + 1;
                    if (driftIssue.issueCode) totals.issueCodes[driftIssue.issueCode] = (totals.issueCodes[driftIssue.issueCode] || 0) + 1;
                }
                totals.symbolSummaries.push({
                    symbolId: key,
                    driftStatus: drift ? drift.status : 'PASS',
                    dominantFamily: drift ? drift.dominantFamily : 'baseline',
                    patternGroup: drift ? drift.patternGroup : 'baseline-building',
                    healthScore: latest.healthScore || 0,
                    nullRate: latest.nullRate || 0,
                    numericCoverage: latest.numericCoverage || 0,
                    freshness: latest.freshness ? latest.freshness.state : 'unknown'
                });
            }
        }
        if (totals.symbols > 0) {
            totals.avgHealthScore = Math.round(totalHealth / totals.symbols);
            totals.avgNullRate = _round(totalNullRate / totals.symbols, 4);
            totals.avgNumericCoverage = _round(totalNumericCoverage / totals.symbols, 4);
        }
        return totals;
    };
})(window);
