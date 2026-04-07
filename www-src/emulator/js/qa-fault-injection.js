/**
 * qa-fault-injection.js — Stage 5 basic fault injection for PI Vision Symbol Emulator
 * ES5 compatible global/per-symbol fault controls + delayed update support
 */
(function (window) {
    'use strict';

    var Faults = window.EMU_QA_FAULTS = window.EMU_QA_FAULTS || {};
    var _state = {
        enabled: false,
        globalMode: 'none',
        globalDelayMs: 1600,
        activeTarget: 'global',
        symbolModes: {},
        symbolDelayMs: {},
        counters: {},
        queue: []
    };

    function _copy(target, source) {
        var key;
        target = target || {};
        source = source || {};
        for (key in source) {
            if (source.hasOwnProperty(key)) target[key] = source[key];
        }
        return target;
    }

    function _clone(value) {
        if (value === null || typeof value === 'undefined') return value;
        if (Object.prototype.toString.call(value) === '[object Array]') {
            return value.slice(0);
        }
        if (typeof value === 'object') {
            return _copy({}, value);
        }
        return value;
    }

    function _cloneDeep(value) {
        var key;
        var result;
        if (value === null || typeof value !== 'object') return value;
        if (Object.prototype.toString.call(value) === '[object Array]') {
            result = [];
            for (key = 0; key < value.length; key++) result.push(_cloneDeep(value[key]));
            return result;
        }
        result = {};
        for (key in value) {
            if (value.hasOwnProperty(key)) result[key] = _cloneDeep(value[key]);
        }
        return result;
    }

    function _countFor(symbolId) {
        var key = symbolId || '__global__';
        if (!_state.counters[key]) _state.counters[key] = 0;
        _state.counters[key] += 1;
        return _state.counters[key];
    }

    function _requiredFields(dataShape) {
        if (dataShape === 'Table') return ['Rows', 'Columns'];
        if (dataShape === 'TimeSeries') return ['Values'];
        if (dataShape === 'XYPlot') return ['Points'];
        return ['Value', 'Timestamp', 'Status'];
    }

    function _pickMode(symbolId) {
        if (_state.symbolModes[symbolId]) return _state.symbolModes[symbolId];
        return _state.globalMode || 'none';
    }

    function _pickDelay(symbolId) {
        return _state.symbolDelayMs[symbolId] || _state.globalDelayMs || 1600;
    }

    function _mutateMissingField(dataShape, payload, count) {
        var clone = _cloneDeep(payload);
        var fields = _requiredFields(dataShape);
        var field = fields[(count - 1) % fields.length];
        if (clone && typeof clone === 'object') delete clone[field];
        return {
            payload: clone,
            issue: 'missing-field:' + field,
            message: 'Removed required field ' + field
        };
    }

    function _mutateNullBurst(dataShape, payload, count) {
        var clone = _cloneDeep(payload);
        var index;
        if (clone === null || typeof clone === 'undefined') {
            return {
                payload: clone,
                issue: 'null-burst:payload',
                message: 'Payload already empty'
            };
        }
        if (dataShape === 'Value') {
            clone.Value = null;
            clone.Timestamp = null;
        } else if (dataShape === 'Table' && clone.Rows && clone.Rows.length) {
            index = (count - 1) % clone.Rows.length;
            clone.Rows[index] = _copy({}, clone.Rows[index]);
            clone.Rows[index].Value = null;
            clone.Rows[index].Attribute = null;
        } else if (dataShape === 'TimeSeries' && clone.Values && clone.Values.length) {
            index = (count - 1) % clone.Values.length;
            clone.Values[index] = _copy({}, clone.Values[index]);
            clone.Values[index].Value = null;
            clone.Values[index].Timestamp = null;
        } else if (dataShape === 'XYPlot' && clone.Points && clone.Points.length) {
            index = (count - 1) % clone.Points.length;
            clone.Points[index] = _copy({}, clone.Points[index]);
            clone.Points[index].X = null;
            clone.Points[index].Y = null;
        } else {
            clone = null;
        }
        return {
            payload: clone,
            issue: 'null-burst',
            message: 'Injected null burst into payload'
        };
    }

    function _mutateMalformed(dataShape, payload, count) {
        var malformed;
        if (dataShape === 'Table') malformed = { Rows: 'broken', Columns: 7, Broken: true, Count: count };
        else if (dataShape === 'TimeSeries') malformed = { Values: { latest: payload && payload.Values ? payload.Values[0] : null }, Broken: true };
        else if (dataShape === 'XYPlot') malformed = { Points: 'not-an-array', ErrorShape: true };
        else malformed = { Value: 'NaN', Timestamp: 12345, Status: { broken: true }, Broken: true };
        return {
            payload: malformed,
            issue: 'malformed-object',
            message: 'Replaced payload with malformed object'
        };
    }

    Faults.getModes = function () {
        return ['none', 'missing-payload', 'missing-field', 'null-burst', 'malformed-object', 'delayed-update'];
    };

    Faults.getState = function () {
        return {
            enabled: _state.enabled,
            globalMode: _state.globalMode,
            globalDelayMs: _state.globalDelayMs,
            activeTarget: _state.activeTarget,
            symbolModes: _copy({}, _state.symbolModes),
            symbolDelayMs: _copy({}, _state.symbolDelayMs),
            queueLength: _state.queue.length
        };
    };

    Faults.setEnabled = function (enabled) {
        _state.enabled = !!enabled;
        return Faults.getState();
    };

    Faults.setGlobalMode = function (mode) {
        _state.globalMode = mode || 'none';
        return Faults.getState();
    };

    Faults.setGlobalDelay = function (delayMs) {
        delayMs = parseInt(delayMs, 10);
        if (!delayMs || delayMs < 100) delayMs = 1600;
        _state.globalDelayMs = delayMs;
        return Faults.getState();
    };

    Faults.setActiveTarget = function (target) {
        _state.activeTarget = target === 'symbol' ? 'symbol' : 'global';
        return Faults.getState();
    };

    Faults.setSymbolMode = function (symbolId, mode) {
        if (!symbolId) return Faults.getState();
        if (!mode || mode === 'none') delete _state.symbolModes[symbolId];
        else _state.symbolModes[symbolId] = mode;
        return Faults.getState();
    };

    Faults.setSymbolDelay = function (symbolId, delayMs) {
        if (!symbolId) return Faults.getState();
        delayMs = parseInt(delayMs, 10);
        if (!delayMs || delayMs < 100) delayMs = 1600;
        _state.symbolDelayMs[symbolId] = delayMs;
        return Faults.getState();
    };

    Faults.clearSymbolMode = function (symbolId) {
        if (!symbolId) return Faults.getState();
        delete _state.symbolModes[symbolId];
        delete _state.symbolDelayMs[symbolId];
        return Faults.getState();
    };

    Faults.apply = function (symbolId, dataShape, payload, meta) {
        var mode;
        var count;
        var details;
        meta = meta || {};
        mode = _pickMode(symbolId);
        if (!_state.enabled || !mode || mode === 'none') {
            return {
                enabled: false,
                mode: 'none',
                payload: payload,
                delayed: false,
                target: _state.symbolModes[symbolId] ? 'symbol' : 'global',
                delayMs: 0,
                meta: meta
            };
        }
        count = _countFor(symbolId);
        details = {
            enabled: true,
            mode: mode,
            symbolId: symbolId || '',
            target: _state.symbolModes[symbolId] ? 'symbol' : 'global',
            count: count,
            payload: payload,
            delayed: false,
            delayMs: 0,
            issue: mode,
            message: 'Fault injected',
            meta: meta
        };

        if (mode === 'missing-payload') {
            details.payload = undefined;
            details.issue = 'missing-payload';
            details.message = 'Payload removed before update';
        } else if (mode === 'missing-field') {
            details = _copy(details, _mutateMissingField(dataShape, payload, count));
        } else if (mode === 'null-burst') {
            details = _copy(details, _mutateNullBurst(dataShape, payload, count));
        } else if (mode === 'malformed-object') {
            details = _copy(details, _mutateMalformed(dataShape, payload, count));
        } else if (mode === 'delayed-update') {
            details.payload = _cloneDeep(payload);
            details.delayed = true;
            details.delayMs = _pickDelay(symbolId);
            details.issue = 'delayed-update';
            details.message = 'Update delayed before delivery';
        } else {
            details.enabled = false;
            details.mode = 'none';
            details.payload = payload;
        }
        return details;
    };
})(window);
