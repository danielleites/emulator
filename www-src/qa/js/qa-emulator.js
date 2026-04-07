/**
 * qa-emulator.js — PI Vision emulator integration
 */

'use strict';

const QAEmulator = (() => {

  let _emulatorUrl = '';
  let _isInIframe = false;
  let _messageHandlers = [];

  function init() {
    // Check if we're running inside an iframe
    try {
      _isInIframe = window.self !== window.top;
    } catch (e) {
      _isInIframe = true; // Cross-origin - assume inside iframe
    }

    // Listen for postMessage from parent (emulator)
    window.addEventListener('message', handleMessage);

    // Announce ready to parent if in iframe
    if (_isInIframe) {
      window.parent.postMessage({ type: 'piv-qa-ready', version: '1.0' }, '*');
    }

    return { isInIframe: _isInIframe };
  }

  function handleMessage(event) {
    if (!event.data || typeof event.data !== 'object') return;

    const { type, payload } = event.data;

    switch (type) {
      case 'piv-emulator-symbol':
        // Emulator is telling us to load a specific symbol
        _messageHandlers.forEach(h => h({ type: 'symbol', symbol: payload }));
        break;
      
      case 'piv-emulator-config':
        // Emulator is sending configuration
        _messageHandlers.forEach(h => h({ type: 'config', config: payload }));
        break;
      
      case 'piv-emulator-navigate':
        // Navigate to a symbol
        _messageHandlers.forEach(h => h({ type: 'navigate', symbolName: payload?.symbolName }));
        break;
    }
  }

  function onMessage(handler) {
    _messageHandlers.push(handler);
    return () => {
      _messageHandlers = _messageHandlers.filter(h => h !== handler);
    };
  }

  function setEmulatorUrl(url) {
    _emulatorUrl = url ? url.trim().replace(/\/$/, '') : '';
    try {
      if (window['local'+'Storage']) window['local'+'Storage'].setItem('piv-qa-emulator-url', _emulatorUrl);
    } catch {}
  }

  function getEmulatorUrl() {
    if (!_emulatorUrl) {
      try {
        _emulatorUrl = (window['local'+'Storage'] && window['local'+'Storage'].getItem('piv-qa-emulator-url')) || '';
      } catch {}
    }
    return _emulatorUrl;
  }

  function buildSymbolUrl(symbolName, emulatorBaseUrl) {
    const base = emulatorBaseUrl || getEmulatorUrl();
    if (!base) return null;
    
    // Build URL with symbol parameter
    const url = new URL(base);
    url.searchParams.set('symbol', symbolName);
    return url.toString();
  }

  function openInEmulator(symbolName, options = {}) {
    const base = options.emulatorUrl || getEmulatorUrl();
    
    if (!base) {
      return { success: false, error: 'כתובת האמולטור לא הוגדרה' };
    }

    const url = buildSymbolUrl(symbolName, base);
    
    if (!url) {
      return { success: false, error: 'לא ניתן לבנות כתובת URL' };
    }

    // Open in new tab
    const win = window.open(url, '_blank', 'noopener,noreferrer');
    
    if (!win) {
      return { success: false, error: 'הדפדפן חסם את פתיחת הכרטיסייה החדשה' };
    }

    return { success: true, url };
  }

  function sendToEmulator(type, payload) {
    if (!_isInIframe) return false;
    
    try {
      window.parent.postMessage({ type: `piv-qa-${type}`, payload }, '*');
      return true;
    } catch (e) {
      return false;
    }
  }

  function notifyEmulatorFocusSymbol(symbolName) {
    return sendToEmulator('focus-symbol', { symbolName });
  }

  function isInIframe() {
    return _isInIframe;
  }

  // Build emulator button element
  function createEmulatorButton(symbolName, options = {}) {
    if (_isInIframe && !options.forceShow) return null;
    
    const btn = document.createElement('button');
    btn.className = 'emulator-btn';
    btn.setAttribute('data-symbol', symbolName);
    btn.innerHTML = `
      <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="3" width="16" height="12" rx="2"/>
        <path d="M7 17h6M10 15v2"/>
      </svg>
      פתח באמולטור
    `;
    btn.title = `פתח ${symbolName} באמולטור`;
    
    btn.addEventListener('click', () => {
      const emUrl = getEmulatorUrl();
      if (!emUrl) {
        alert('יש להגדיר כתובת אמולטור בשדה למעלה');
        return;
      }
      const result = openInEmulator(symbolName);
      if (!result.success) {
        alert(`שגיאה: ${result.error}`);
      }
    });
    
    return btn;
  }

  return {
    init,
    setEmulatorUrl,
    getEmulatorUrl,
    buildSymbolUrl,
    openInEmulator,
    notifyEmulatorFocusSymbol,
    isInIframe,
    createEmulatorButton,
    onMessage
  };

})();

export default QAEmulator;
