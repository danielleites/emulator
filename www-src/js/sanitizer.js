/**
 * PIV Input Sanitizer v4.2.0-R300
 * Prevents XSS and injection in user-provided inputs.
 */
(function () {
  'use strict';

  var _entityMap = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;'
  };

  function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[&<>"'`=\/]/g, function (s) {
      return _entityMap[s];
    });
  }

  function sanitizeAttr(str) {
    if (typeof str !== 'string') return '';
    return str.replace(/[^\w\s\-_.,:;#()]/g, '');
  }

  function sanitizeSymbolName(name) {
    if (typeof name !== 'string') return '';
    return name.replace(/[^a-zA-Z0-9\-_]/g, '');
  }

  window.__PIV_SANITIZER = {
    escapeHtml: escapeHtml,
    sanitizeAttr: sanitizeAttr,
    sanitizeSymbolName: sanitizeSymbolName
  };

  console.log('[PIV] Input sanitizer loaded');
})();
