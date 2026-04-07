/**
 * launcher.js — Unified Launcher Controller
 * 
 * Three modes:
 *  1. Emulator only — loads PI Vision emulator in full iframe
 *  2. QA only — loads the QA app (current index.html)
 *  3. Combined — emulator visible, QA runs silently in background
 *     - QA captures F12 errors, runtime bugs, user feedback
 *     - F10 toggles QA overlay panel
 */

'use strict';

import QABackground from './qa-background.js';

const Launcher = (() => {

  let _currentMode = null; // 'emulator' | 'qa' | 'combined' | null
  let _emulatorUrl = '';
  let _qaUrl = '';         // URL of the QA app (index.html in same origin)
  let _emulatorIframe = null;
  let _qaIframe = null;    // Hidden iframe for background QA in combined mode

  // ─── DOM Refs ────────────────────────────────────────────────
  let _launcherScreen = null;
  let _emulatorView = null;
  let _qaView = null;
  let _combinedView = null;

  // ─── Init ────────────────────────────────────────────────────

  function init() {
    _launcherScreen = document.getElementById('launcher-screen');
    _emulatorView = document.getElementById('mode-emulator');
    _qaView = document.getElementById('mode-qa');
    _combinedView = document.getElementById('mode-combined');

    // Determine QA app URL (same origin)
    // serve strips .html extensions, so use both forms
    _qaUrl = new URL('qa-app.html', window.location.href).href;

    // URL is kept in-memory only (sandbox restrictions apply)

    _bindEvents();
    _showLauncher();
  }

  function _bindEvents() {
    // Mode cards
    document.querySelectorAll('[data-mode]').forEach(card => {
      card.addEventListener('click', () => {
        _setEmulatorUrl();
        _launchMode(card.dataset.mode);
      });
    });

    // Back buttons
    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => _goBack());
    });

    // Emulator URL input
    const urlInput = document.getElementById('launcher-emu-url');
    if (urlInput) {
      urlInput.addEventListener('change', () => {
        _emulatorUrl = urlInput.value.trim();
      });
    }

    // Keyboard: Escape = back, F10 = QA toggle
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _currentMode) {
        _goBack();
      }
    });
  }

  function _setEmulatorUrl() {
    const inp = document.getElementById('launcher-emu-url');
    if (inp) {
      _emulatorUrl = inp.value.trim();
    }
  }

  // ─── Mode Navigation ─────────────────────────────────────────

  function _showLauncher() {
    _currentMode = null;
    _launcherScreen.style.display = 'flex';
    _launcherScreen.classList.add('fade-in');
    _emulatorView.classList.remove('active');
    _qaView.classList.remove('active');
    _combinedView.classList.remove('active');

    // Stop background QA if running
    QABackground.stop();

    // Clean up iframes
    _cleanupIframes();
  }

  function _goBack() {
    _showLauncher();
  }

  function _launchMode(mode) {
    _currentMode = mode;
    _launcherScreen.style.display = 'none';

    // Hide all mode views
    _emulatorView.classList.remove('active');
    _qaView.classList.remove('active');
    _combinedView.classList.remove('active');

    switch (mode) {
      case 'emulator':
        _startEmulatorMode();
        break;
      case 'qa':
        _startQAMode();
        break;
      case 'combined':
        _startCombinedMode();
        break;
    }
  }

  // ─── Mode: Emulator Only ─────────────────────────────────────

  function _startEmulatorMode() {
    _emulatorView.classList.add('active');
    
    const frameWrap = _emulatorView.querySelector('.emulator-frame-wrap');
    if (!frameWrap) return;

    if (!_emulatorUrl) {
      frameWrap.innerHTML = `
        <div class="emulator-placeholder">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          <p>לא הוגדרה כתובת אמולטור.<br>חזור למסך הראשי והזן כתובת URL.</p>
        </div>
      `;
      return;
    }

    _emulatorIframe = document.createElement('iframe');
    _emulatorIframe.src = _emulatorUrl;
    _emulatorIframe.id = 'emu-iframe';
    _emulatorIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    _emulatorIframe.setAttribute('allow', 'clipboard-write');
    frameWrap.innerHTML = '';
    frameWrap.appendChild(_emulatorIframe);
  }

  // ─── Mode: QA Only ───────────────────────────────────────────

  function _startQAMode() {
    _qaView.classList.add('active');

    const frameWrap = _qaView.querySelector('.qa-app-frame-wrap');
    if (!frameWrap) return;

    _qaIframe = document.createElement('iframe');
    _qaIframe.src = _qaUrl;
    _qaIframe.id = 'qa-iframe';
    _qaIframe.setAttribute('allow', 'clipboard-write');
    frameWrap.innerHTML = '';
    frameWrap.appendChild(_qaIframe);
  }

  // ─── Mode: Combined (Emulator + Background QA) ──────────────

  function _startCombinedMode() {
    _combinedView.classList.add('active');

    const frameWrap = _combinedView.querySelector('.emulator-frame-wrap');
    if (!frameWrap) return;

    // Start background QA engine
    QABackground.start();

    if (!_emulatorUrl) {
      frameWrap.innerHTML = `
        <div class="emulator-placeholder">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2"/>
            <path d="M8 21h8M12 17v4"/>
          </svg>
          <p>לא הוגדרה כתובת אמולטור.<br>חזור למסך הראשי והזן כתובת URL.</p>
        </div>
      `;
      return;
    }

    // Load emulator iframe (visible)
    _emulatorIframe = document.createElement('iframe');
    _emulatorIframe.src = _emulatorUrl;
    _emulatorIframe.id = 'emu-iframe-combined';
    _emulatorIframe.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-popups allow-forms');
    _emulatorIframe.setAttribute('allow', 'clipboard-write');
    frameWrap.innerHTML = '';
    frameWrap.appendChild(_emulatorIframe);

    // Listen for emulator messages and forward to QA background
    _emulatorIframe.addEventListener('load', () => {
      _setupEmulatorBridge();
    });

    // Update combined status
    _updateCombinedStatus('פעיל — QA ברקע מאזין');
  }

  function _setupEmulatorBridge() {
    // The QABackground already listens on window 'message' events.
    // We need to also inject a console capture script into the emulator iframe
    // if it's same-origin. For cross-origin, we rely on postMessage from emulator.
    
    try {
      if (_emulatorIframe && _emulatorIframe.contentWindow) {
        // Try to inject console interceptor (only works same-origin)
        const doc = _emulatorIframe.contentDocument;
        if (doc) {
          const script = doc.createElement('script');
          script.textContent = `
            (function() {
              const origConsole = {
                error: console.error.bind(console),
                warn: console.warn.bind(console),
                log: console.log.bind(console)
              };

              function send(level, args) {
                try {
                  window.parent.postMessage({
                    type: 'piv-emu-console',
                    payload: {
                      level: level,
                      message: Array.from(args).map(a => {
                        try { return typeof a === 'string' ? a : JSON.stringify(a); }
                        catch { return String(a); }
                      }).join(' '),
                      timestamp: Date.now()
                    }
                  }, '*');
                } catch {}
              }

              console.error = function() { send('error', arguments); origConsole.error.apply(console, arguments); };
              console.warn = function() { send('warn', arguments); origConsole.warn.apply(console, arguments); };
              
              window.addEventListener('error', function(e) {
                window.parent.postMessage({
                  type: 'piv-emu-error',
                  payload: {
                    message: e.message || 'Unknown error',
                    filename: e.filename,
                    lineno: e.lineno,
                    colno: e.colno
                  }
                }, '*');
              });

              window.addEventListener('unhandledrejection', function(e) {
                window.parent.postMessage({
                  type: 'piv-emu-error',
                  payload: {
                    message: 'Unhandled Promise: ' + (e.reason?.message || String(e.reason))
                  }
                }, '*');
              });
            })();
          `;
          doc.head.appendChild(script);
        }
      }
    } catch (e) {
      // Cross-origin — can't inject. Emulator must send postMessages itself.
      console.log('Emulator is cross-origin, relying on postMessage bridge.');
    }
  }

  function _updateCombinedStatus(text) {
    const statusEl = _combinedView?.querySelector('.status-label');
    if (statusEl) statusEl.textContent = text;
  }

  // ─── Cleanup ─────────────────────────────────────────────────

  function _cleanupIframes() {
    // Remove emulator iframe
    if (_emulatorIframe && _emulatorIframe.parentNode) {
      _emulatorIframe.parentNode.removeChild(_emulatorIframe);
    }
    _emulatorIframe = null;

    // Remove QA iframe
    if (_qaIframe && _qaIframe.parentNode) {
      _qaIframe.parentNode.removeChild(_qaIframe);
    }
    _qaIframe = null;

    // Clear frame wraps
    document.querySelectorAll('.emulator-frame-wrap, .qa-app-frame-wrap').forEach(fw => {
      fw.innerHTML = '';
    });
  }

  // ─── Export ──────────────────────────────────────────────────

  return { init };

})();

// Auto-init
document.addEventListener('DOMContentLoaded', () => {
  Launcher.init();
});

export default Launcher;
