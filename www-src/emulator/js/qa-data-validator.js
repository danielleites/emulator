/**
 * qa-data-validator.js — Stage 3 DataShape validator for PI Vision Symbol Emulator
 * ES5 compatible expected-vs-actual validation for symbol payloads
 */
(function (window) {
    'use strict';

    var QA = window.EMU_QA = window.EMU_QA || {};
    var Validator = window.EMU_QA_VALIDATOR = window.EMU_QA_VALIDATOR || {};

    function _nowIso() {
        return new Date().toISOString();
    }

    function _copy(target, source) {
        var key;
        target = target || {};
        source = source || {};
        for (key in source) {
            if (source.hasOwnProperty(key)) {
                target[key] = source[key];
            }
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

    function _isNumber(value) {
        return typeof value === 'number' && !isNaN(value);
    }

    function _addIssue(result, severity, code, path, message, expected, actual, extras) {
        var issue = _copy({
            severity: severity,
            code: code,
            path: path || '',
            message: message,
            expected: typeof expected === 'undefined' ? null : expected,
            actual: typeof actual === 'undefined' ? null : actual,
            stage: 'data-shape',
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

    function _ensureArrayWithEntries(value, path, result, itemValidator) {
        var i;
        if (_typeOf(value) === 'undefined') {
            _addIssue(result, 'fail', 'missing-collection', path, 'Missing required collection', 'array', 'undefined');
            return;
        }
        if (value === null) {
            _addIssue(result, 'fail', 'null-collection', path, 'Required collection is null', 'array', 'null');
            return;
        }
        if (_typeOf(value) !== 'array') {
            _addIssue(result, 'fail', 'type-mismatch', path, 'Collection type mismatch', 'array', _typeOf(value));
            return;
        }
        if (value.length === 0) {
            _addIssue(result, 'warning', 'empty-collection', path, 'Required collection is empty', 'non-empty array', 'empty array');
            return;
        }
        if (typeof itemValidator === 'function') {
            for (i = 0; i < value.length; i++) {
                itemValidator(value[i], path + '[' + i + ']', result);
            }
        }
    }

    function _validateRequiredObject(value, path, result) {
        if (_typeOf(value) === 'undefined') {
            _addIssue(result, 'fail', 'missing-object', path, 'Missing required object', 'object', 'undefined');
            return false;
        }
        if (value === null) {
            _addIssue(result, 'fail', 'null-object', path, 'Required object is null', 'object', 'null');
            return false;
        }
        if (!_isObject(value)) {
            _addIssue(result, 'fail', 'type-mismatch', path, 'Object type mismatch', 'object', _typeOf(value));
            return false;
        }
        return true;
    }

    function _validateField(value, expectedType, path, result, required) {
        var actualType = _typeOf(value);
        if (actualType === 'undefined') {
            if (required !== false) {
                _addIssue(result, 'fail', 'missing-field', path, 'Missing required field', expectedType, 'undefined');
            }
            return false;
        }
        if (value === null) {
            _addIssue(result, 'fail', 'null-field', path, 'Required field is null', expectedType, 'null');
            return false;
        }
        if (expectedType === 'number') {
            if (!_isNumber(value)) {
                _addIssue(result, 'fail', 'type-mismatch', path, 'Field type mismatch', 'number', actualType);
                return false;
            }
            return true;
        }
        if (expectedType === 'string') {
            if (actualType !== 'string') {
                _addIssue(result, 'fail', 'type-mismatch', path, 'Field type mismatch', 'string', actualType);
                return false;
            }
            return true;
        }
        if (expectedType === 'object') {
            return _validateRequiredObject(value, path, result);
        }
        if (expectedType === 'array') {
            if (actualType !== 'array') {
                _addIssue(result, 'fail', 'type-mismatch', path, 'Field type mismatch', 'array', actualType);
                return false;
            }
            return true;
        }
        return true;
    }

    function _validateValue(payload, result) {
        if (!_validateRequiredObject(payload, 'payload', result)) return;
        _validateField(payload.Value, 'number', 'payload.Value', result);
        _validateField(payload.Timestamp, 'string', 'payload.Timestamp', result);
        _validateField(payload.Status, 'string', 'payload.Status', result);
        _validateField(payload.UOM, 'string', 'payload.UOM', result, false);
        _validateField(payload.Path, 'string', 'payload.Path', result, false);
    }

    function _validateTableRow(row, path, result) {
        if (!_validateRequiredObject(row, path, result)) return;
        _validateField(row.Attribute, 'string', path + '.Attribute', result);
        _validateField(row.Value, 'number', path + '.Value', result);
        _validateField(row.Timestamp, 'string', path + '.Timestamp', result, false);
        _validateField(row.Status, 'string', path + '.Status', result, false);
    }

    function _validateTable(payload, result) {
        if (!_validateRequiredObject(payload, 'payload', result)) return;
        _ensureArrayWithEntries(payload.Rows, 'payload.Rows', result, _validateTableRow);
        _ensureArrayWithEntries(payload.Columns, 'payload.Columns', result, function (item, path, targetResult) {
            _validateField(item, 'string', path, targetResult);
        });
    }

    function _validateTimeSeriesPoint(point, path, result) {
        if (!_validateRequiredObject(point, path, result)) return;
        _validateField(point.Timestamp, 'string', path + '.Timestamp', result);
        _validateField(point.Value, 'number', path + '.Value', result);
    }

    function _validateTimeSeries(payload, result) {
        if (!_validateRequiredObject(payload, 'payload', result)) return;
        _ensureArrayWithEntries(payload.Values, 'payload.Values', result, _validateTimeSeriesPoint);
    }

    function _validateXYPoint(point, path, result) {
        if (!_validateRequiredObject(point, path, result)) return;
        _validateField(point.X, 'number', path + '.X', result);
        _validateField(point.Y, 'number', path + '.Y', result);
        _validateField(point.Label, 'string', path + '.Label', result, false);
    }

    function _validateXYPlot(payload, result) {
        if (!_validateRequiredObject(payload, 'payload', result)) return;
        _ensureArrayWithEntries(payload.Points, 'payload.Points', result, _validateXYPoint);
    }

    function _expectedContract(dataShape) {
        switch (dataShape) {
            case 'Value':
                return { dataShape: 'Value', kind: 'object', required: ['Value', 'Timestamp', 'Status'] };
            case 'Table':
                return { dataShape: 'Table', kind: 'object', required: ['Rows', 'Columns'] };
            case 'TimeSeries':
                return { dataShape: 'TimeSeries', kind: 'object', required: ['Values'] };
            case 'XYPlot':
                return { dataShape: 'XYPlot', kind: 'object', required: ['Points'] };
            default:
                return { dataShape: dataShape || 'Unknown', kind: 'unknown', required: [] };
        }
    }

    Validator.validate = function (symbolId, expectedShape, payload, meta) {
        var result = {
            symbolId: symbolId || '',
            expectedShape: expectedShape || 'Unknown',
            actualRootType: _typeOf(payload),
            actualKeys: _isObject(payload) ? Object.keys(payload) : [],
            validatedAt: _nowIso(),
            issues: [],
            failures: 0,
            warnings: 0,
            status: 'PASS',
            valid: true,
            contract: _expectedContract(expectedShape),
            meta: _copy({}, meta || {})
        };

        if (payload === null || typeof payload === 'undefined') {
            _addIssue(result, 'fail', 'missing-payload', 'payload', 'Payload is null or undefined', 'object', _typeOf(payload));
        } else {
            switch (expectedShape) {
                case 'Value':
                    _validateValue(payload, result);
                    break;
                case 'Table':
                    _validateTable(payload, result);
                    break;
                case 'TimeSeries':
                    _validateTimeSeries(payload, result);
                    break;
                case 'XYPlot':
                    _validateXYPlot(payload, result);
                    break;
                default:
                    _addIssue(result, 'warning', 'unsupported-shape', 'payload', 'No validator contract for data shape', expectedShape, _typeOf(payload));
                    break;
            }
        }

        result.valid = result.failures === 0;
        result.issueCount = result.issues.length;
        result.summary = {
            expectedShape: result.expectedShape,
            actualRootType: result.actualRootType,
            issueCount: result.issueCount,
            failures: result.failures,
            warnings: result.warnings,
            status: result.status,
            valid: result.valid
        };
        return result;
    };

    Validator.validateAndStore = function (symbolId, expectedShape, payload, meta) {
        var result = Validator.validate(symbolId, expectedShape, payload, meta);
        if (QA && typeof QA.setValidationResult === 'function' && symbolId) {
            QA.setValidationResult(symbolId, result);
        }
        return result;
    };
})(window);
