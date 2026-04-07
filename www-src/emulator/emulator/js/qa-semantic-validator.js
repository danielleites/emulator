/**
 * qa-semantic-validator.js — Stage 4 semantic validator for PI Vision Symbol Emulator
 * ES5 compatible business-oriented checks for KPI values, status/value consistency,
 * table consistency, time-series sanity and semantic mismatch alerts.
 */
(function (window) {
    'use strict';

    var QA = window.EMU_QA = window.EMU_QA || {};
    var Semantic = window.EMU_QA_SEMANTIC = window.EMU_QA_SEMANTIC || {};

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

    function _isObject(value) {
        return !!value && typeof value === 'object' && Object.prototype.toString.call(value) !== '[object Array]';
    }

    function _isArray(value) {
        return Object.prototype.toString.call(value) === '[object Array]';
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

    function _normalizeText(value) {
        if (value === null || typeof value === 'undefined') return '';
        return String(value).toLowerCase();
    }

    function _stringContains(haystack, needle) {
        return _normalizeText(haystack).indexOf(_normalizeText(needle)) !== -1;
    }


    function _trimText(value) {
        return String(value === null || typeof value === 'undefined' ? '' : value).replace(/^\s+|\s+$/g, '');
    }

    function _safeArray(value) {
        return _isArray(value) ? value : [];
    }

    function _safeObject(value) {
        return _isObject(value) ? value : {};
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

    function _deriveSymbolTokens(symbolId) {
        var raw = _normalizeText(symbolId).replace(/[^a-z0-9]+/g, ' ');
        var parts = raw.split(/\s+/);
        var out = [];
        var i;
        for (i = 0; i < parts.length; i++) {
            if (parts[i] && parts[i].length > 2) out.push(parts[i]);
        }
        return out;
    }

    function _deriveMetaProfile(symbolId, expectedShape, payload, meta) {
        var profile = {
            symbolId: symbolId || '',
            expectedShape: expectedShape || 'Unknown',
            category: meta && meta.category ? String(meta.category) : '',
            type: meta && meta.type ? String(meta.type) : '',
            dataState: meta && meta.dataState ? String(meta.dataState) : '',
            source: meta && meta.source ? String(meta.source) : '',
            symbolTokens: _deriveSymbolTokens(symbolId),
            declaredStatuses: [],
            declaredFields: [],
            hasValue: false,
            hasRows: false,
            hasSeries: false,
            hasPoints: false,
            hasThresholds: false,
            hasStatus: false,
            payloadKind: _typeOf(payload),
            semanticClass: 'generic',
            expectedFreshnessBand: 'unknown'
        };
        var key;
        if (_isObject(payload)) {
            for (key in payload) {
                if (payload.hasOwnProperty(key)) profile.declaredFields.push(key);
            }
            profile.hasValue = typeof payload.Value !== 'undefined';
            profile.hasRows = _isArray(payload.Rows);
            profile.hasSeries = _isArray(payload.Values);
            profile.hasPoints = _isArray(payload.Points);
            profile.hasThresholds = typeof payload.Min !== 'undefined' || typeof payload.Max !== 'undefined';
            profile.hasStatus = typeof payload.Status !== 'undefined';
            if (typeof payload.Status !== 'undefined' && payload.Status !== null && payload.Status !== '') {
                _pushUnique(profile.declaredStatuses, _classifyStatus(payload.Status));
            }
        }
        if (_normalizeText(expectedShape) === 'value') profile.semanticClass = 'single-kpi';
        else if (_normalizeText(expectedShape) == 'table') profile.semanticClass = 'tabular-kpi';
        else if (_normalizeText(expectedShape) == 'timeseries') profile.semanticClass = 'trend-kpi';
        else if (_normalizeText(expectedShape) == 'xyplot') profile.semanticClass = 'correlation-kpi';
        else profile.semanticClass = 'generic';
        profile.expectedFreshnessBand = _normalizeText(meta && meta.dataState) === 'stale' ? 'stale' : 'active';
        return profile;
    }

    function _profileSummaryRows(profile) {
        return {
            semanticClass: profile.semanticClass,
            category: profile.category || '-',
            shape: profile.expectedShape || '-',
            statuses: profile.declaredStatuses.length ? profile.declaredStatuses.join(', ') : '-',
            fields: profile.declaredFields.slice(0, 8),
            features: [
                profile.hasThresholds ? 'thresholds' : null,
                profile.hasStatus ? 'status' : null,
                profile.hasRows ? 'rows' : null,
                profile.hasSeries ? 'series' : null,
                profile.hasPoints ? 'points' : null
            ]
        };
    }

    function _addSignal(result, signal) {
        _pushUnique(result.semanticSignals, signal);
    }

    function _checkMetaSemanticAlignment(result, profile, payload, meta) {
        var category = _normalizeText(profile.category);
        var fields = profile.declaredFields;
        var hasTimestampField = false;
        var hasStatusField = false;
        var hasRangeField = false;
        var i;
        for (i = 0; i < fields.length; i++) {
            if (_stringContains(fields[i], 'time')) hasTimestampField = true;
            if (_stringContains(fields[i], 'status')) hasStatusField = true;
            if (_stringContains(fields[i], 'min') || _stringContains(fields[i], 'max')) hasRangeField = true;
        }
        if (profile.expectedShape === 'Value' && !profile.hasValue) {
            _addIssue(result, 'warning', 'semantic-profile-missing-primary-value', 'payload.Value', 'פרופיל Value ללא שדה Value ראשי.', 'primary Value field', 'missing', { dimension: 'profile-shape', issueFamily: 'shape' });
            _addSignal(result, 'profile-missing-primary-value');
        }
        if (profile.expectedShape === 'Table' && profile.hasRows && !_safeArray(payload.Rows).length) {
            _addIssue(result, 'warning', 'semantic-profile-empty-table', 'payload.Rows', 'טבלת KPI קיימת אך ללא שורות.', 'non-empty rows', 0, { dimension: 'profile-shape', issueFamily: 'completeness' });
            _addSignal(result, 'profile-empty-table');
        }
        if (profile.expectedShape === 'TimeSeries' && !hasTimestampField && !_safeArray(payload && payload.Values).length) {
            _addIssue(result, 'warning', 'semantic-profile-no-series-points', 'payload.Values', 'TimeSeries ללא נקודות usable.', 'series points', 0, { dimension: 'profile-shape', issueFamily: 'completeness' });
            _addSignal(result, 'profile-no-series-points');
        }
        if (profile.expectedShape === 'XYPlot' && !_safeArray(payload && payload.Points).length) {
            _addIssue(result, 'warning', 'semantic-profile-no-xy-points', 'payload.Points', 'XY plot ללא נקודות.', 'xy points', 0, { dimension: 'profile-shape', issueFamily: 'completeness' });
            _addSignal(result, 'profile-no-xy-points');
        }
        if (category && (category.indexOf('מדד') !== -1 || category.indexOf('ניטור') !== -1) && !hasStatusField && !profile.hasStatus) {
            _addIssue(result, 'warning', 'semantic-profile-missing-status-channel', 'payload.Status', 'לסמל בקטגוריית מדדים/ניטור אין channel ברור של status.', 'status field or status-bearing rows', 'missing', { dimension: 'profile-metadata', issueFamily: 'status' });
            _addSignal(result, 'profile-missing-status');
        }
        if (profile.expectedShape === 'Value' && !hasRangeField && !profile.hasThresholds && _isFiniteNumber(_toFiniteNumber(payload && payload.Value))) {
            _addIssue(result, 'warning', 'semantic-profile-no-threshold-context', 'payload', 'KPI מספרי ללא min/max או threshold context קשה ל-triage עסקי.', 'threshold hints', 'missing', { dimension: 'profile-metadata', issueFamily: 'range' });
            _addSignal(result, 'profile-no-threshold-context');
        }
        if (profile.expectedShape === 'TimeSeries' && profile.expectedFreshnessBand === 'active' && !hasTimestampField && !(payload && payload.Values)) {
            _addIssue(result, 'warning', 'semantic-profile-no-freshness-anchor', 'payload', 'ל-TimeSeries פעיל אין anchor של זמן שמאפשר freshness reasoning.', 'timestamps present', 'missing', { dimension: 'profile-metadata', issueFamily: 'freshness' });
            _addSignal(result, 'profile-no-freshness-anchor');
        }
        if (meta && meta.sample && _typeOf(meta.sample) !== 'object' && _typeOf(meta.sample) !== 'array') {
            _addIssue(result, 'warning', 'semantic-profile-poor-sample-context', 'meta.sample', 'sample context מצומצם ולכן semantic profiling מוגבל.', 'object or array sample', _typeOf(meta.sample), { dimension: 'profile-metadata', issueFamily: 'metadata' });
        }
    }

    function _validateGenericBusinessRules(result, profile, payload, meta) {
        var rows;
        var i;
        var row;
        var valueCount = 0;
        var statusCount = 0;
        var thresholdCount = 0;
        var uniqueAttributes = {};
        var duplicateRows = 0;
        var values;
        if (profile.expectedShape === 'Table') {
            rows = _safeArray(payload && payload.Rows);
            for (i = 0; i < rows.length; i++) {
                row = _safeObject(rows[i]);
                if (typeof row.Value !== 'undefined') valueCount += 1;
                if (typeof row.Status !== 'undefined' && row.Status !== null && row.Status !== '') statusCount += 1;
                if (typeof row.Min !== 'undefined' || typeof row.Max !== 'undefined') thresholdCount += 1;
                if (row.Attribute) {
                    if (uniqueAttributes[row.Attribute]) duplicateRows += 1;
                    uniqueAttributes[row.Attribute] = true;
                }
            }
            if (rows.length >= 3 && valueCount > 0 && statusCount === 0) {
                _addIssue(result, 'warning', 'semantic-table-missing-status-channel', 'payload.Rows', 'טבלה עם מספר KPI-ים אך ללא status מלווה מקשה על triage רוחבי.', 'status-bearing rows', statusCount, { dimension: 'business-coverage', issueFamily: 'status' });
                _addSignal(result, 'table-missing-status-channel');
            }
            if (rows.length >= 3 && thresholdCount === 0 && profile.category && _normalizeText(profile.category).indexOf('מדד') !== -1) {
                _addIssue(result, 'warning', 'semantic-table-no-thresholds', 'payload.Rows', 'טבלת מדדים ללא threshold hints אינה מאפשרת ranking עשיר.', 'some rows with Min/Max', thresholdCount, { dimension: 'business-coverage', issueFamily: 'range' });
                _addSignal(result, 'table-no-thresholds');
            }
            if (duplicateRows > 1) {
                _addIssue(result, 'warning', 'semantic-table-recurring-attribute-clash', 'payload.Rows', 'יש יותר מהתנגשות Attribute אחת בטבלה, מה שמרמז על KPI families לא יציבים.', 'mostly unique attributes', duplicateRows, { dimension: 'business-coverage', issueFamily: 'business-state' });
            }
        }
        if (profile.expectedShape === 'Value') {
            if (profile.hasStatus && !_isFiniteNumber(_toFiniteNumber(payload && payload.Value)) && !_trimText(payload && payload.Status)) {
                _addIssue(result, 'warning', 'semantic-value-no-signal-or-status', 'payload', 'סמל Value ללא ערך מספרי וללא status מספק לא נותן סיגנל עסקי usable.', 'numeric value or status', 'missing', { dimension: 'business-coverage', issueFamily: 'completeness' });
                _addSignal(result, 'value-no-signal-or-status');
            }
            if (_trimText(payload && payload.UOM) && !_isFiniteNumber(_toFiniteNumber(payload && payload.Value))) {
                _addIssue(result, 'warning', 'semantic-value-uom-without-number', 'payload.UOM', 'יש יחידת מידה אך אין ערך מספרי usable.', 'numeric value', payload && payload.UOM, { dimension: 'business-coverage', issueFamily: 'coverage' });
            }
        }
        if (profile.expectedShape === 'TimeSeries') {
            values = _safeArray(payload && payload.Values);
            if (values.length > 0 && values.length < 3) {
                _addIssue(result, 'warning', 'semantic-timeseries-thin-window', 'payload.Values', 'חלון TimeSeries דל מאוד ולכן trend semantics חלשים.', '>= 3 points', values.length, { dimension: 'business-coverage', issueFamily: 'freshness' });
                _addSignal(result, 'timeseries-thin-window');
            }
        }
        if (profile.expectedShape === 'XYPlot') {
            values = _safeArray(payload && payload.Points);
            if (values.length >= 2 && values.length < 4) {
                _addIssue(result, 'warning', 'semantic-xy-low-density', 'payload.Points', 'ל-XY plot יש מעט נקודות ולכן correlation semantics מוגבלים.', '>= 4 points', values.length, { dimension: 'business-coverage', issueFamily: 'coverage' });
            }
        }
    }

    function _addIssue(result, severity, code, path, message, expected, actual, extras) {
        var issue = _copy({
            severity: severity,
            code: code,
            path: path || '',
            message: message,
            expected: typeof expected === 'undefined' ? null : expected,
            actual: typeof actual === 'undefined' ? null : actual,
            stage: 'semantic',
            ts: _nowIso()
        }, extras || {});
        result.issues.push(issue);
        if (severity === 'fail') {
            result.failures += 1;
            result.status = 'FAIL';
        } else {
            result.warnings += 1;
            if (result.status !== 'FAIL') result.status = 'WARNING';
        }
    }

    function _collectNumericBounds(target, value, min, max) {
        if (_isFiniteNumber(value)) {
            if (!_isFiniteNumber(target.minValue) || value < target.minValue) target.minValue = value;
            if (!_isFiniteNumber(target.maxValue) || value > target.maxValue) target.maxValue = value;
        }
        if (_isFiniteNumber(min)) {
            if (!_isFiniteNumber(target.minDeclared) || min < target.minDeclared) target.minDeclared = min;
        }
        if (_isFiniteNumber(max)) {
            if (!_isFiniteNumber(target.maxDeclared) || max > target.maxDeclared) target.maxDeclared = max;
        }
    }

    function _classifyStatus(status) {
        var normalized = _normalizeText(status);
        if (!normalized) return 'unknown';
        if (normalized.indexOf('good') !== -1 || normalized.indexOf('normal') !== -1 || normalized.indexOf('ok') !== -1 || normalized.indexOf('healthy') !== -1) return 'good';
        if (normalized.indexOf('bad') !== -1 || normalized.indexOf('error') !== -1 || normalized.indexOf('critical') !== -1 || normalized.indexOf('fail') !== -1) return 'bad';
        if (normalized.indexOf('uncertain') !== -1 || normalized.indexOf('warning') !== -1 || normalized.indexOf('warn') !== -1 || normalized.indexOf('alert') !== -1) return 'warning';
        if (normalized.indexOf('stale') !== -1 || normalized.indexOf('old') !== -1 || normalized.indexOf('late') !== -1) return 'stale';
        return 'unknown';
    }

    function _expectedSemanticBand(meta) {
        var dataState = _normalizeText(meta && meta.dataState);
        if (dataState === 'critical') return 'high';
        if (dataState === 'warning') return 'elevated';
        if (dataState === 'stale') return 'stale';
        return 'normal';
    }

    function _checkStatusValueConsistency(result, path, value, status, min, max, meta) {
        var statusClass = _classifyStatus(status);
        var band = _expectedSemanticBand(meta || {});
        var numericValue = _toFiniteNumber(value);
        var minValue = _toFiniteNumber(min);
        var maxValue = _toFiniteNumber(max);
        var rangeMid;
        var upperWarning;
        var upperCritical;
        if (!_isFiniteNumber(numericValue)) return;
        if (_isFiniteNumber(minValue) && _isFiniteNumber(maxValue) && minValue > maxValue) {
            _addIssue(result, 'warning', 'semantic-invalid-range', path, 'min גדול מ-max ולכן אי אפשר לאמת KPI לפי טווח.', 'min <= max', { min: minValue, max: maxValue }, { dimension: 'bounds' });
            return;
        }
        if (_isFiniteNumber(minValue) && numericValue < minValue) {
            _addIssue(result, 'fail', 'semantic-below-min', path, 'ערך KPI נמוך מה-min המוצהר.', '>= ' + minValue, numericValue, { min: minValue, max: maxValue, dimension: 'bounds' });
        }
        if (_isFiniteNumber(maxValue) && numericValue > maxValue) {
            _addIssue(result, 'fail', 'semantic-above-max', path, 'ערך KPI גבוה מה-max המוצהר.', '<= ' + maxValue, numericValue, { min: minValue, max: maxValue, dimension: 'bounds' });
        }
        if (_isFiniteNumber(minValue) && _isFiniteNumber(maxValue)) {
            rangeMid = minValue + ((maxValue - minValue) / 2);
            upperWarning = minValue + ((maxValue - minValue) * 0.75);
            upperCritical = minValue + ((maxValue - minValue) * 0.9);
            if (statusClass === 'good' && (numericValue < minValue || numericValue > maxValue)) {
                _addIssue(result, 'fail', 'semantic-status-out-of-range', path, 'status מציג Good אבל הערך מחוץ לטווח.', 'Good בתוך הטווח', { value: numericValue, min: minValue, max: maxValue }, { dimension: 'status-value' });
            }
            if (statusClass === 'bad' && numericValue >= minValue && numericValue <= upperWarning) {
                _addIssue(result, 'warning', 'semantic-status-too-bad', path, 'status מציג Bad אך הערך עדיין לא באזור קיצון ברור.', 'Bad near extreme', numericValue, { min: minValue, max: maxValue, dimension: 'status-value' });
            }
            if (statusClass === 'warning' && numericValue >= minValue && numericValue <= rangeMid && band !== 'warning') {
                _addIssue(result, 'warning', 'semantic-status-warning-mismatch', path, 'status מציג Warning למרות שהערך נראה בטווח בסיסי תקין.', 'Warning near threshold', numericValue, { min: minValue, max: maxValue, dimension: 'status-value' });
            }
            if (band === 'normal' && numericValue > upperCritical) {
                _addIssue(result, 'warning', 'semantic-state-value-mismatch', path, 'מצב runtime תקין אך ערך KPI קרוב מאוד לקצה העליון.', 'normal band', numericValue, { min: minValue, max: maxValue, dataState: meta && meta.dataState, dimension: 'business-semantics' });
            }
            if (band === 'critical' && numericValue < upperWarning) {
                _addIssue(result, 'warning', 'semantic-state-under-critical', path, 'מצב runtime קריטי אך הערך אינו משקף עומס/חריגות גבוהה.', 'critical band', numericValue, { min: minValue, max: maxValue, dataState: meta && meta.dataState, dimension: 'business-semantics' });
            }
            if (band === 'warning' && (numericValue < rangeMid || numericValue > maxValue)) {
                _addIssue(result, 'warning', 'semantic-state-warning-mismatch', path, 'מצב runtime אזהרה אינו מתיישב היטב עם ערך KPI ביחס לטווח.', 'warning band', numericValue, { min: minValue, max: maxValue, dataState: meta && meta.dataState, dimension: 'business-semantics' });
            }
        } else {
            if (statusClass === 'stale' && band !== 'stale') {
                _addIssue(result, 'warning', 'semantic-stale-status-mismatch', path, 'status מסמן Stale אך מצב runtime אינו stale.', 'stale alignment', status, { dataState: meta && meta.dataState, dimension: 'business-semantics' });
            }
        }
    }

    function _validateValuePayload(payload, result, meta) {
        var value = payload ? payload.Value : null;
        _checkStatusValueConsistency(result, 'payload.Value', value, payload && payload.Status, payload && payload.Min, payload && payload.Max, meta);
        _collectNumericBounds(result.rangeSummary, _toFiniteNumber(value), _toFiniteNumber(payload && payload.Min), _toFiniteNumber(payload && payload.Max));
        if (payload && payload.UOM === '' && _isFiniteNumber(_toFiniteNumber(value))) {
            _addIssue(result, 'warning', 'semantic-missing-uom', 'payload.UOM', 'KPI מספרי ללא יחידת מידה.', 'non-empty UOM', payload.UOM, { dimension: 'metadata' });
        }
    }

    function _validateTablePayload(payload, result, meta) {
        var rows = payload && _isArray(payload.Rows) ? payload.Rows : [];
        var columns = payload && _isArray(payload.Columns) ? payload.Columns : [];
        var columnMap = {};
        var uniqueAttributes = {};
        var duplicateAttributes = 0;
        var numericRows = 0;
        var statusRows = 0;
        var i;
        var j;
        var row;
        var rowKeys;
        var value;
        var min;
        var max;
        var attribute;
        for (i = 0; i < columns.length; i++) {
            columnMap[String(columns[i])] = true;
        }
        if (rows.length && columns.length) {
            for (i = 0; i < rows.length; i++) {
                row = rows[i] || {};
                rowKeys = [];
                for (j in row) {
                    if (row.hasOwnProperty(j)) rowKeys.push(j);
                }
                for (j = 0; j < rowKeys.length; j++) {
                    if (!columnMap[rowKeys[j]]) {
                        _addIssue(result, 'warning', 'semantic-table-extra-row-key', 'payload.Rows[' + i + '].' + rowKeys[j], 'לשורה יש שדה שלא מוגדר ב-Columns.', 'column listed in Columns', rowKeys[j], { dimension: 'table-consistency' });
                    }
                }
                if (columnMap.Value && typeof row.Value === 'undefined') {
                    _addIssue(result, 'warning', 'semantic-table-missing-value-column', 'payload.Rows[' + i + '].Value', 'Columns מצהיר על Value אך השורה חסרה ערך.', 'Value present', 'undefined', { dimension: 'table-consistency' });
                }
                if (columnMap.Status && typeof row.Status === 'undefined') {
                    _addIssue(result, 'warning', 'semantic-table-missing-status-column', 'payload.Rows[' + i + '].Status', 'Columns מצהיר על Status אך השורה חסרה status.', 'Status present', 'undefined', { dimension: 'table-consistency' });
                }
                attribute = row.Attribute;
                if (attribute) {
                    if (uniqueAttributes[attribute]) duplicateAttributes += 1;
                    uniqueAttributes[attribute] = true;
                }
                value = _toFiniteNumber(row.Value);
                min = _toFiniteNumber(row.Min);
                max = _toFiniteNumber(row.Max);
                if (_isFiniteNumber(value)) numericRows += 1;
                if (typeof row.Status !== 'undefined' && row.Status !== null && row.Status !== '') statusRows += 1;
                _collectNumericBounds(result.rangeSummary, value, min, max);
                _checkStatusValueConsistency(result, 'payload.Rows[' + i + '].Value', value, row.Status, min, max, meta);
            }
        }
        if (rows.length > 1 && duplicateAttributes > 0) {
            _addIssue(result, 'warning', 'semantic-duplicate-attributes', 'payload.Rows', 'נמצאו שורות עם Attribute כפול, ייתכן KPI כפול בטבלה.', 'unique Attribute', duplicateAttributes + ' duplicates', { dimension: 'table-consistency' });
        }
        if (rows.length > 0 && numericRows === 0) {
            _addIssue(result, 'warning', 'semantic-table-no-numeric-values', 'payload.Rows', 'טבלת KPI ללא ערכים מספריים נראית לא צפויה.', 'at least one numeric value', numericRows, { dimension: 'table-consistency' });
        }
        if (rows.length > 0 && statusRows === 0 && (columnMap.Status || columnMap.Value)) {
            _addIssue(result, 'warning', 'semantic-table-no-status', 'payload.Rows', 'טבלת KPI ללא status-ים מקשה על פירוש עסקי.', 'at least one status', statusRows, { dimension: 'business-semantics' });
        }
        result.summary.rows = rows.length;
        result.summary.columns = columns.length;
        result.summary.numericRows = numericRows;
    }

    function _validateTimeSeriesPayload(payload, result, meta) {
        var values = payload && _isArray(payload.Values) ? payload.Values : [];
        var previousTs = null;
        var previousValue = null;
        var decreases = 0;
        var duplicateTs = 0;
        var stalePoints = 0;
        var i;
        var point;
        var tsValue;
        var numericValue;
        var step;
        var now = new Date().getTime();
        for (i = 0; i < values.length; i++) {
            point = values[i] || {};
            tsValue = point.Timestamp ? Date.parse(point.Timestamp) : NaN;
            numericValue = _toFiniteNumber(point.Value);
            if (_isFiniteNumber(numericValue)) {
                _collectNumericBounds(result.rangeSummary, numericValue, null, null);
            }
            if (!isNaN(tsValue)) {
                if (previousTs !== null) {
                    if (tsValue < previousTs) {
                        _addIssue(result, 'fail', 'semantic-timeseries-not-sorted', 'payload.Values[' + i + '].Timestamp', 'סדרת הזמן אינה ממוינת בסדר כרונולוגי עולה.', 'ascending timestamps', point.Timestamp, { dimension: 'time-series' });
                    } else if (tsValue === previousTs) {
                        duplicateTs += 1;
                    }
                    step = tsValue - previousTs;
                    if (step > 21600000) {
                        _addIssue(result, 'warning', 'semantic-timeseries-large-gap', 'payload.Values[' + i + '].Timestamp', 'נמצא פער זמן גדול במיוחד בין נקודות.', '<= 6h gap', step, { gapMs: step, dimension: 'time-series' });
                    }
                }
                if ((now - tsValue) > 86400000) stalePoints += 1;
                previousTs = tsValue;
            }
            if (_isFiniteNumber(previousValue) && _isFiniteNumber(numericValue)) {
                if (Math.abs(numericValue - previousValue) > Math.max(250, Math.abs(previousValue) * 0.6)) {
                    _addIssue(result, 'warning', 'semantic-timeseries-spike', 'payload.Values[' + i + '].Value', 'נמצא קפיצה חריגה יחסית בין נקודות עוקבות.', 'smooth adjacent delta', numericValue, { previousValue: previousValue, dimension: 'time-series' });
                }
                if (numericValue < previousValue) decreases += 1;
            }
            previousValue = numericValue;
        }
        if (duplicateTs > 0) {
            _addIssue(result, 'warning', 'semantic-timeseries-duplicate-timestamp', 'payload.Values', 'נמצאו timestamps כפולים בסדרת הזמן.', 'unique timestamps', duplicateTs, { dimension: 'time-series' });
        }
        if (values.length > 4 && decreases === 0) {
            _addIssue(result, 'warning', 'semantic-timeseries-monotonic-rise', 'payload.Values', 'כל הנקודות עולות בלבד; ייתכן feed לא רענן או KPI לא מגוון.', 'mixed changes', 'strict/non-stop rise', { dimension: 'business-semantics' });
        }
        if (_expectedSemanticBand(meta) !== 'stale' && stalePoints === values.length && values.length > 0) {
            _addIssue(result, 'warning', 'semantic-timeseries-stale-window', 'payload.Values', 'כל חלון הסדרה ישן יחסית, אך מצב runtime אינו stale.', 'fresh window', stalePoints + '/' + values.length, { dimension: 'business-semantics' });
        }
        result.summary.points = values.length;
    }

    function _validateXYPayload(payload, result) {
        var points = payload && _isArray(payload.Points) ? payload.Points : [];
        var uniqueLabels = {};
        var duplicateLabels = 0;
        var i;
        var point;
        var x;
        var y;
        for (i = 0; i < points.length; i++) {
            point = points[i] || {};
            x = _toFiniteNumber(point.X);
            y = _toFiniteNumber(point.Y);
            _collectNumericBounds(result.rangeSummary, x, null, null);
            _collectNumericBounds(result.rangeSummary, y, null, null);
            if (_isFiniteNumber(x) && _isFiniteNumber(y) && x === 0 && y === 0) {
                _addIssue(result, 'warning', 'semantic-xy-origin-cluster', 'payload.Points[' + i + ']', 'נקודה ב-(0,0) עלולה להצביע על default עסקי במקום data אמיתי.', 'real metric point', { X: x, Y: y }, { dimension: 'business-semantics' });
            }
            if (point.Label) {
                if (uniqueLabels[point.Label]) duplicateLabels += 1;
                uniqueLabels[point.Label] = true;
            }
        }
        if (duplicateLabels > 0) {
            _addIssue(result, 'warning', 'semantic-xy-duplicate-labels', 'payload.Points', 'נמצאו labels כפולים ב-XY plot.', 'unique labels', duplicateLabels, { dimension: 'table-consistency' });
        }
        result.summary.points = points.length;
    }

    Semantic.validate = function (symbolId, expectedShape, payload, meta) {
        var profile = _deriveMetaProfile(symbolId, expectedShape, payload, meta || {});
        var result = {
            symbolId: symbolId || '',
            expectedShape: expectedShape || 'Unknown',
            validatedAt: _nowIso(),
            status: 'PASS',
            valid: true,
            issues: [],
            failures: 0,
            warnings: 0,
            issueCount: 0,
            semanticSignals: [],
            profile: profile,
            rangeSummary: {
                minValue: null,
                maxValue: null,
                minDeclared: null,
                maxDeclared: null
            },
            summary: {
                expectedShape: expectedShape || 'Unknown',
                status: 'PASS',
                issueCount: 0,
                failures: 0,
                warnings: 0,
                rows: 0,
                columns: 0,
                points: 0,
                numericRows: 0,
                semanticClass: profile.semanticClass,
                category: profile.category || '',
                statuses: [],
                profileSignals: []
            },
            meta: _copy({}, meta || {})
        };

        if (!_isObject(payload)) {
            _addIssue(result, 'warning', 'semantic-payload-unavailable', 'payload', 'אין payload אובייקטי זמין ל-semantic validation.', 'object payload', _typeOf(payload), { dimension: 'business-semantics', issueFamily: 'shape' });
        } else {
            switch (expectedShape) {
                case 'Value':
                    _validateValuePayload(payload, result, meta || {});
                    break;
                case 'Table':
                    _validateTablePayload(payload, result, meta || {});
                    break;
                case 'TimeSeries':
                    _validateTimeSeriesPayload(payload, result, meta || {});
                    break;
                case 'XYPlot':
                    _validateXYPayload(payload, result);
                    break;
                default:
                    _addIssue(result, 'warning', 'semantic-unsupported-shape', 'payload', 'אין semantic rules עבור data shape זה.', expectedShape, _typeOf(payload), { dimension: 'business-semantics', issueFamily: 'shape' });
                    break;
            }
            _checkMetaSemanticAlignment(result, profile, payload, meta || {});
            _validateGenericBusinessRules(result, profile, payload, meta || {});
        }

        result.issueCount = result.issues.length;
        result.valid = result.failures === 0;
        result.summary.status = result.status;
        result.summary.issueCount = result.issueCount;
        result.summary.failures = result.failures;
        result.summary.warnings = result.warnings;
        result.summary.valid = result.valid;
        result.summary.statuses = profile.declaredStatuses.slice(0);
        result.summary.profileSignals = result.semanticSignals.slice(0);
        result.profileSummary = _profileSummaryRows(profile);
        if (result.warnings || result.failures) {
            _addSignal(result, result.failures > 0 ? 'semantic-failures' : 'semantic-warnings');
        }
        return result;
    };

    Semantic.validateAndStore = function (symbolId, expectedShape, payload, meta) {
        var result = Semantic.validate(symbolId, expectedShape, payload, meta);
        if (QA && typeof QA.setSemanticResult === 'function' && symbolId) {
            QA.setSemanticResult(symbolId, result);
        }
        return result;
    };
})(window);
