/**
 * qa-contract-monitor.js — Stage 2 basic contract monitor for PI Vision Symbol Emulator
 * ES5 compatible lifecycle tracking + anomaly detection
 */
(function (window) {
    'use strict';

    var QA = window.EMU_QA = window.EMU_QA || {};
    var Monitor = window.EMU_QA_CONTRACT = window.EMU_QA_CONTRACT || {};
    var _states = {};

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

    function _hasOwn(obj, key) {
        return Object.prototype.hasOwnProperty.call(obj || {}, key);
    }

    function _recordIssue(symbolId, severity, message, extras) {
        var issue = _copy({
            severity: severity || 'warning',
            message: message,
            stage: 'contract',
            contract: true,
            ts: _nowIso()
        }, extras || {});
        if (QA && typeof QA.recordIssue === 'function' && symbolId) {
            QA.recordIssue(symbolId, issue);
        }
        return issue;
    }

    function _emit(eventName, payload) {
        if (QA && typeof QA.emit === 'function') {
            QA.emit(eventName, payload || {});
        }
    }

    function _defaultState(symbolId, meta) {
        var lifecycle = {
            init: 0,
            renderStart: 0,
            renderEnd: 0,
            resize: 0,
            destroy: 0,
            configChange: 0,
            dataUpdate: 0
        };
        return {
            symbolId: symbolId,
            createdAt: _nowIso(),
            updatedAt: _nowIso(),
            meta: meta || {},
            lifecycle: lifecycle,
            flags: {
                initialized: false,
                rendered: false,
                destroyed: false
            },
            lastEvent: null,
            lastError: null,
            openRender: null,
            issues: [],
            lifecycleOrder: []
        };
    }

    function _ensure(symbolId, meta) {
        if (!_states[symbolId]) {
            _states[symbolId] = _defaultState(symbolId, meta);
        }
        if (meta) {
            _states[symbolId].meta = _copy(_states[symbolId].meta || {}, meta);
        }
        _states[symbolId].updatedAt = _nowIso();
        return _states[symbolId];
    }

    function _attachToQASymbol(symbolId) {
        var qaState;
        var summary;
        if (!symbolId || !QA || typeof QA.getSymbolState !== 'function') return;
        qaState = QA.getSymbolState(symbolId);
        summary = Monitor.getSummary(symbolId);
        qaState.contract = summary;
        if (typeof QA.setContractSummary === 'function') {
            QA.setContractSummary(symbolId, summary);
        }
    }

    function _pushIssue(state, severity, message, extras) {
        var issue = _recordIssue(state.symbolId, severity, message, extras);
        state.issues.push(issue);
        state.lastError = issue.message;
        return issue;
    }

    function _markLifecycle(state, lifecycleName, extras) {
        state.updatedAt = _nowIso();
        state.lastEvent = lifecycleName;
        state.lifecycleOrder.push({
            name: lifecycleName,
            ts: _nowIso(),
            details: extras || {}
        });
        if (_hasOwn(state.lifecycle, lifecycleName)) {
            state.lifecycle[lifecycleName] += 1;
        }
    }

    function _checkMissingData(symbolId, payload) {
        var state = _ensure(symbolId);
        var data = payload && payload.data;
        var hasData = !(data === null || typeof data === 'undefined');
        var hasDataSource = !(payload && (payload.dataSource === null || typeof payload.dataSource === 'undefined'));

        if (!hasData) {
            _pushIssue(state, 'warning', 'Missing basic data payload', { contractType: 'missing-data', lifecycle: 'dataUpdate' });
        }
        if (!hasDataSource) {
            _pushIssue(state, 'warning', 'Missing datasource reference', { contractType: 'missing-datasource', lifecycle: 'dataUpdate' });
        }
        _attachToQASymbol(symbolId);
    }

    Monitor.ensureSymbol = function (symbolId, meta) {
        var state = _ensure(symbolId, meta);
        _attachToQASymbol(symbolId);
        return state;
    };

    Monitor.resetSymbol = function (symbolId, meta) {
        _states[symbolId] = _defaultState(symbolId, meta);
        _attachToQASymbol(symbolId);
        return _states[symbolId];
    };

    Monitor.recordLifecycle = function (symbolId, lifecycleName, payload) {
        var state;
        payload = payload || {};
        if (!symbolId || !lifecycleName) return null;
        state = _ensure(symbolId, payload.meta);
        _markLifecycle(state, lifecycleName, payload);

        if (lifecycleName === 'init') {
            if (state.flags.initialized && !state.flags.destroyed) {
                _pushIssue(state, 'warning', 'Init called again before destroy', { contractType: 'duplicate-init', lifecycle: lifecycleName });
            }
            state.flags.initialized = true;
            state.flags.destroyed = false;
        }

        if (lifecycleName === 'renderStart') {
            if (!state.flags.initialized) {
                _pushIssue(state, 'fail', 'Render started before init', { contractType: 'render-before-init', lifecycle: lifecycleName });
            }
            state.openRender = { ts: _nowIso(), payload: payload };
        }

        if (lifecycleName === 'renderEnd') {
            if (!state.flags.initialized) {
                _pushIssue(state, 'fail', 'Render completed before init', { contractType: 'render-before-init', lifecycle: lifecycleName });
            }
            if (!state.openRender) {
                _pushIssue(state, 'warning', 'Render completed without matching render start', { contractType: 'render-end-without-start', lifecycle: lifecycleName });
            }
            state.flags.rendered = true;
            state.openRender = null;
        }

        if (lifecycleName === 'resize' || lifecycleName === 'configChange' || lifecycleName === 'dataUpdate') {
            if (!state.flags.initialized) {
                _pushIssue(state, 'warning', lifecycleName + ' called before init', { contractType: 'lifecycle-before-init', lifecycle: lifecycleName });
            }
        }

        if (lifecycleName === 'dataUpdate') {
            _checkMissingData(symbolId, payload);
        }

        if (lifecycleName === 'destroy') {
            if (state.flags.destroyed) {
                _pushIssue(state, 'warning', 'Destroy called more than once', { contractType: 'double-destroy', lifecycle: lifecycleName });
            }
            state.flags.destroyed = true;
            state.flags.initialized = false;
            state.flags.rendered = false;
            state.openRender = null;
        }

        _emit('qa:contract:lifecycle', {
            symbolId: symbolId,
            lifecycle: lifecycleName,
            ts: _nowIso(),
            details: payload
        });
        _attachToQASymbol(symbolId);
        return state;
    };

    Monitor.recordError = function (symbolId, lifecycleName, error, payload) {
        var state = _ensure(symbolId, payload && payload.meta);
        var message = error && error.message ? error.message : String(error || 'Unknown error');
        state.lastError = message;
        _pushIssue(state, 'fail', 'Error during ' + lifecycleName, {
            contractType: 'lifecycle-error',
            lifecycle: lifecycleName,
            error: error || null,
            details: payload || {}
        });
        _emit('qa:contract:error', {
            symbolId: symbolId,
            lifecycle: lifecycleName,
            message: message,
            ts: _nowIso()
        });
        _attachToQASymbol(symbolId);
        return state;
    };

    Monitor.finalizeSymbol = function (symbolId, payload) {
        var state = _ensure(symbolId, payload && payload.meta);
        if (!state.lifecycle.init) {
            _pushIssue(state, 'warning', 'Instance missing init lifecycle', { contractType: 'missing-lifecycle', lifecycle: 'init' });
        }
        if (!state.lifecycle.renderStart && !state.lifecycle.renderEnd) {
            _pushIssue(state, 'warning', 'Instance missing render lifecycle', { contractType: 'missing-lifecycle', lifecycle: 'render' });
        }
        if (state.lifecycle.renderStart > 0 && state.lifecycle.renderEnd === 0) {
            _pushIssue(state, 'warning', 'Instance render never completed', { contractType: 'incomplete-render', lifecycle: 'renderEnd' });
        }
        _attachToQASymbol(symbolId);
        return state;
    };

    Monitor.getState = function (symbolId) {
        if (!symbolId) return _states;
        return _ensure(symbolId);
    };

    Monitor.getSummary = function (symbolId) {
        var state = _ensure(symbolId);
        return {
            symbolId: state.symbolId,
            updatedAt: state.updatedAt,
            lifecycle: _copy({}, state.lifecycle),
            flags: _copy({}, state.flags),
            issueCount: state.issues.length,
            lastEvent: state.lastEvent,
            lastError: state.lastError,
            lifecycleOrder: state.lifecycleOrder.slice(0),
            missing: {
                init: state.lifecycle.init === 0,
                render: state.lifecycle.renderStart === 0 && state.lifecycle.renderEnd === 0,
                renderCompletion: state.lifecycle.renderStart > 0 && state.lifecycle.renderEnd === 0
            }
        };
    };

    Monitor.getAllSummaries = function () {
        var key;
        var summaries = {};
        for (key in _states) {
            if (_states.hasOwnProperty(key)) {
                summaries[key] = Monitor.getSummary(key);
            }
        }
        return summaries;
    };
})(window);
