/**
 * PIV Symbol Sandbox v4.2.0-R300
 * Provides isolation context for symbol execution.
 * In mobile/Cordova context, symbols run in the main WebView.
 * This module provides a lightweight guard layer.
 */
(function () {
  'use strict';

  var _timeoutIds = [];
  var _intervalIds = [];

  // Track timeouts/intervals created by symbols so they can be cleaned up
  var _origSetTimeout = window.setTimeout;
  var _origSetInterval = window.setInterval;
  var _origClearTimeout = window.clearTimeout;
  var _origClearInterval = window.clearInterval;

  function sandboxedTimeout(fn, delay) {
    var id = _origSetTimeout.call(window, fn, delay);
    _timeoutIds.push(id);
    return id;
  }

  function sandboxedInterval(fn, delay) {
    var id = _origSetInterval.call(window, fn, delay);
    _intervalIds.push(id);
    return id;
  }

  function cleanupAll() {
    _timeoutIds.forEach(function (id) { _origClearTimeout.call(window, id); });
    _intervalIds.forEach(function (id) { _origClearInterval.call(window, id); });
    _timeoutIds = [];
    _intervalIds = [];
  }

  // Apply sandbox attributes to dynamically-created iframes
  function applySandbox(iframe) {
    if (!iframe || iframe.tagName !== 'IFRAME') return;
    try {
      iframe.setAttribute('sandbox', 'allow-scripts allow-same-origin');
    } catch (e) {}
  }

  window.__PIV_SANDBOX = {
    setTimeout: sandboxedTimeout,
    setInterval: sandboxedInterval,
    cleanup: cleanupAll,
    applySandbox: applySandbox,
    getActiveTimers: function () {
      return { timeouts: _timeoutIds.length, intervals: _intervalIds.length };
    }
  };

  // Also expose as PIV_SANDBOX for emulator/index.html compatibility
  window.PIV_SANDBOX = window.__PIV_SANDBOX;

  console.log('[PIV] Symbol sandbox initialized');
})();
