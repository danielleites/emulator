/**
 * PIV Error Telemetry v4.2.0-R300
 * Global error boundary — captures unhandled errors for QA diagnostics.
 */
(function () {
  'use strict';

  var _errors = [];
  var MAX_ENTRIES = 100;

  window.addEventListener('error', function (e) {
    _errors.push({
      type: 'error',
      message: e.message || 'Unknown error',
      filename: e.filename || '',
      line: e.lineno || 0,
      col: e.colno || 0,
      timestamp: Date.now()
    });
    if (_errors.length > MAX_ENTRIES) _errors.shift();
  });

  window.addEventListener('unhandledrejection', function (e) {
    _errors.push({
      type: 'promise',
      message: (e.reason && e.reason.message) || String(e.reason) || 'Unhandled rejection',
      timestamp: Date.now()
    });
    if (_errors.length > MAX_ENTRIES) _errors.shift();
  });

  window.__PIV_TELEMETRY = {
    getErrors: function () { return _errors.slice(); },
    getRecent: function (n) { return _errors.slice(-(n || 10)); },
    clear: function () { _errors.length = 0; },
    count: function () { return _errors.length; }
  };

  console.log('[PIV] Error telemetry initialized');
})();
