/**
 * launcher.js — Unified Launcher Controller (All-In-One)
 *
 * חמישה מצבים:
 *  1. Emulator only   — טוען אמולטור PI Vision מקומי
 *  2. QA only         — טוען אפליקציית QA
 *  3. Combined        — אמולטור גלוי, QA רץ ברקע
 *  4. AF Browser      — דפדפן נתוני AF עצמאי
 *  5. Visual Builder  — עורך ויזואלי לסמלים
 *
 * שים לב:
 *  - גישה ל-storage מחוץ מבנה רגיל למניעת בעיות אבטחה
 *  - fullscreen API uses obfuscated access pattern
 */

'use strict';

import initUXEnhancements, { saveLastMode } from './ux-enhancements.js';
import { APP_VERSION } from './versioning.js';
import {
  showFrameLoading,
  hideFrameLoading,
  initBreadcrumbs,
  updateBreadcrumb,
  initCommandPalette,
  initDashboardStats,
  initOnboarding,
  initErrorBoundary,
} from './ux-features.js';

// qa-background.js נטען באופן דינמי רק כאשר מצב משולב מופעל

const Launcher = (() => {

  let _currentMode = null;

  // ─── עזר טעינה עצלאית (לאזי) ─────────────────────────────────────────

  /** מטמון מודולים שנטענו באופן דינמי */
  const _lazyModuleCache = new Map();

  /**
   * טוען מודול באופן דינמי ומשמר במטמון למניעת טעינות כפולות.
   * @param {string} path — נתיב יחסי למודול
   * @returns {Promise<any>}
   */
  function _lazyImport(path) {
    if (_lazyModuleCache.has(path)) {
      return _lazyModuleCache.get(path);
    }
    const promise = import(path);
    _lazyModuleCache.set(path, promise);
    return promise;
  }

  // ─── מטמון iframes — שמירת iframes טעונים כדי לא ליצור מחדש ──
  const _iframeCache = new Map();  /* key: type string, value: iframe element */

  // ─── DOM Refs ───────────────────────────────────────────────────
  let _launcherScreen = null;
  let _emulatorView   = null;
  let _qaView         = null;
  let _combinedView   = null;
  let _afView         = null;
  let _builderView    = null;

  // ─── Init ───────────────────────────────────────────────────────

  function init() {
    _launcherScreen = document.getElementById('launcher-screen');
    _emulatorView   = document.getElementById('mode-emulator');
    _qaView         = document.getElementById('mode-qa');
    _combinedView   = document.getElementById('mode-combined');
    _afView         = document.getElementById('mode-af');
    _builderView    = document.getElementById('mode-builder');

    _bindEvents();
    _showLauncher();

    // אתחול שיפורי UX — העברת callback להשקת מצב
    initUXEnhancements({
      launchMode: _launchMode,
    });

    // אתחול תכונות UX חדשות
    initBreadcrumbs();
    initCommandPalette(_launchMode);
    initDashboardStats();
    initOnboarding();
    initErrorBoundary();

    console.log('[Launcher] PI Vision v' + APP_VERSION + ' מוכן');
  }

  function _bindEvents() {
    // Mode cards
    document.querySelectorAll('[data-mode]').forEach(card => {
      card.addEventListener('click', () => _launchMode(card.dataset.mode));
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          _launchMode(card.dataset.mode);
        }
      });
    });

    // Back buttons
    document.querySelectorAll('.btn-back').forEach(btn => {
      btn.addEventListener('click', () => _goBack());
    });

    // Keyboard: Escape = back
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && _currentMode) {
        _goBack();
      }

      // Ctrl+1/2/3/4/5 — קיצורי מקלדת למצבים
      if (e.ctrlKey && !e.shiftKey) {
        const modeMap = { '1': 'emulator', '2': 'qa', '3': 'combined', '4': 'af', '5': 'builder' };
        const mode = modeMap[e.key];
        if (mode) {
          e.preventDefault();
          _launchMode(mode);
        }
      }
    });
  }

  // ─── Mode Navigation ────────────────────────────────────────────

  function _showLauncher() {
    _currentMode = null;
    _launcherScreen.style.display = 'flex';
    _launcherScreen.classList.remove('fade-out');
    _launcherScreen.classList.add('fade-in');

    [_emulatorView, _qaView, _combinedView, _afView, _builderView].forEach(v => {
      if (v) v.classList.remove('active', 'mode-enter', 'mode-exit');
    });

    // סגור עורך ויזואלי אם פתוח
    if (window.PIV_BUILDER && typeof window.PIV_BUILDER.close === 'function') {
      // סגירה שקטה — ללא prompt שמירה
      try { window.PIV_BUILDER._forceClose && window.PIV_BUILDER._forceClose(); } catch(e) {}
    }

    // הפסק QA ברקע אם המודול כבר נטען
    if (_lazyModuleCache.has('./qa-background.js')) {
      _lazyImport('./qa-background.js').then(function(mod) {
        const bg = mod.default || mod;
        if (bg && typeof bg.stop === 'function') bg.stop();
      }).catch(function() {});
    }
    _hideAllFrameWraps();
    _restoreAFPanel();
    updateBreadcrumb(null);
  }

  function _goBack() {
    if (!_currentMode) return;

    // מעבר חלק: הוסף mode-exit לתצוגה הנוכחית
    const currentView = _getViewByMode(_currentMode);
    if (currentView) {
      currentView.classList.add('mode-exit');
      setTimeout(() => {
        currentView.classList.remove('active', 'mode-exit');
        _showLauncher();
      }, 200);
    } else {
      _showLauncher();
    }
  }

  function _launchMode(mode) {
    const prevMode = _currentMode;
    _currentMode   = mode;

    // שמור מצב אחרון ב-storage
    saveLastMode(mode);

    // הסתר לאנצ'ר עם מעבר חלק
    _launcherScreen.classList.add('fade-out');
    _launcherScreen.classList.remove('fade-in');
    setTimeout(() => {
      _launcherScreen.style.display = 'none';
      _launcherScreen.classList.remove('fade-out');
    }, 200);

    // הסר מצב קודם עם אנימציית יציאה
    [_emulatorView, _qaView, _combinedView, _afView, _builderView].forEach(v => {
      if (v && v.classList.contains('active')) {
        v.classList.add('mode-exit');
        setTimeout(() => v.classList.remove('active', 'mode-exit'), 200);
      }
    });

    // הפעל מצב חדש לאחר השהייה קצרה
    setTimeout(() => {
      switch (mode) {
        case 'emulator':  _startEmulatorMode(); break;
        case 'qa':        _startQAMode();        break;
        case 'combined':  _startCombinedMode();  break;
        case 'af':        _startAFMode();         break;
        case 'builder':   _startBuilderMode();   break;
      }
      updateBreadcrumb(mode);
    }, prevMode ? 200 : 0);
  }

  // ─── Iframe Cache ────────────────────────────────────────────────

  /**
   * מחזיר iframe ממטמון לפי type, או null אם לא קיים.
   * @param {string} type
   * @returns {HTMLIFrameElement|null}
   */
  function _getCachedIframe(type) {
    return _iframeCache.get(type) || null;
  }

  /**
   * שומר iframe במטמון לפי type.
   * @param {string} type
   * @param {HTMLIFrameElement} iframe
   */
  function _cacheIframe(type, iframe) {
    _iframeCache.set(type, iframe);
  }

  /**
   * מסתיר את כל ה-frame-wraps (שומר iframes בזיכרון).
   * בניגוד ל-_cleanupIframes, אינו מוחק את ה-iframes.
   */
  function _hideAllFrameWraps() {
    document.querySelectorAll('.frame-wrap iframe').forEach(iframe => {
      iframe.style.display = 'none';
    });
  }

  /**
   * מחזיר iframe קיים ממטמון לתצוגה, או יוצר חדש ומוסיף למטמון.
   * @param {string}            type      — מזהה (emulator|qa|emulator-combined)
   * @param {HTMLElement}       frameWrap — מיכל ה-iframe
   * @param {string}            src       — כתובת URL
   * @param {string}            id        — id שייקבע ל-iframe
   * @param {string}            loadingLabel — טקסט עברי בשכבת הטעינה
   * @returns {HTMLIFrameElement}
   */
  function _getOrCreateIframe(type, frameWrap, src, id, loadingLabel) {
    let iframe = _getCachedIframe(type);

    if (iframe) {
      // שחזר מהמטמון — הצג מחדש
      iframe.style.display = '';
      if (!frameWrap.contains(iframe)) {
        frameWrap.appendChild(iframe);
      }
      return iframe;
    }

    // צור iframe חדש
    iframe = document.createElement('iframe');
    iframe.src   = src;
    iframe.id    = id;
    iframe.allow = 'clipboard-write';

    // הצג שכבת טעינה עד שהדף נטען
    showFrameLoading(frameWrap, loadingLabel);

    iframe.addEventListener('load', () => {
      hideFrameLoading(frameWrap);
    }, { once: true });

    frameWrap.appendChild(iframe);
    _cacheIframe(type, iframe);

    return iframe;
  }

  // ─── Mode: Emulator Only ──────────────────────────────────────

  function _startEmulatorMode() {
    _emulatorView.classList.add('active', 'mode-enter');
    setTimeout(() => _emulatorView.classList.remove('mode-enter'), 300);

    const frameWrap = _emulatorView.querySelector('.frame-wrap');
    if (!frameWrap) return;

    _getOrCreateIframe(
      'emulator',
      frameWrap,
      'emulator/',
      'emu-iframe',
      'טוען אמולטור...'
    );
  }

  // ─── Mode: QA Only ───────────────────────────────────────────

  function _startQAMode() {
    _qaView.classList.add('active', 'mode-enter');
    setTimeout(() => _qaView.classList.remove('mode-enter'), 300);

    const frameWrap = _qaView.querySelector('.frame-wrap');
    if (!frameWrap) return;

    _getOrCreateIframe(
      'qa',
      frameWrap,
      'qa/qa-app',
      'qa-iframe',
      'טוען אפליקציית QA...'
    );
  }

  // ─── Mode: Combined ──────────────────────────────────────────

  function _startCombinedMode() {
    _combinedView.classList.add('active', 'mode-enter');
    setTimeout(() => _combinedView.classList.remove('mode-enter'), 300);

    const frameWrap = _combinedView.querySelector('.frame-wrap');
    if (!frameWrap) return;

    // טען qa-background.js באופן דינמי רק כשמצב זה מופעל והפעל
    _lazyImport('./qa-background.js').then(function(mod) {
      const bg = mod.default || mod;
      if (bg && typeof bg.start === 'function') bg.start();
    }).catch(function(err) {
      console.warn('[Launcher] טעינת qa-background נכשלה:', err);
    });

    const iframe = _getOrCreateIframe(
      'emulator-combined',
      frameWrap,
      'emulator/',
      'emu-iframe-combined',
      'טוען אמולטור...'
    );

    // הגדר bridge רק אם iframe חדש (לא קיים במטמון)
    if (!iframe._bridgeSetup) {
      iframe.addEventListener('load', () => _setupEmulatorBridge(iframe), { once: true });
      iframe._bridgeSetup = true;
    }

    _updateCombinedStatus('פעיל — QA ברקע מאזין');
  }

  function _setupEmulatorBridge(iframe) {
    try {
      if (iframe && iframe.contentDocument) {
        const doc    = iframe.contentDocument;
        const script = doc.createElement('script');
        script.textContent = `
          (function() {
            var origErr  = console.error.bind(console);
            var origWarn = console.warn.bind(console);

            function send(level, args) {
              try {
                window.parent.postMessage({
                  type: 'piv-emu-console',
                  payload: {
                    level: level,
                    message: Array.from(args).map(function(a) {
                      try { return typeof a === 'string' ? a : JSON.stringify(a); }
                      catch(e) { return String(a); }
                    }).join(' '),
                    timestamp: Date.now()
                  }
                }, '*');
              } catch(e) {}
            }

            console.error = function() { send('error', arguments); origErr.apply(console, arguments); };
            console.warn  = function() { send('warn',  arguments); origWarn.apply(console, arguments); };

            window.addEventListener('error', function(e) {
              window.parent.postMessage({
                type: 'piv-emu-error',
                payload: { message: e.message || 'Unknown error', filename: e.filename, lineno: e.lineno, colno: e.colno }
              }, '*');
            });

            window.addEventListener('unhandledrejection', function(e) {
              window.parent.postMessage({
                type: 'piv-emu-error',
                payload: { message: 'Unhandled Promise: ' + (e.reason && e.reason.message || String(e.reason)) }
              }, '*');
            });
          })();
        `;
        doc.head.appendChild(script);
      }
    } catch (e) {
      console.log('[Launcher] Cross-origin emulator, relying on postMessage bridge');
    }
  }

  function _updateCombinedStatus(text) {
    const label = _combinedView?.querySelector('.status-label');
    if (label) label.textContent = text;
  }

  // ─── Mode: Visual Builder ─────────────────────────────────────

  function _startBuilderMode() {
    if (!_builderView) return;
    _builderView.classList.add('active', 'mode-enter');
    setTimeout(() => _builderView.classList.remove('mode-enter'), 300);

    if (window.PIV_BUILDER && typeof window.PIV_BUILDER.open === 'function') {
      window.PIV_BUILDER.open();
    } else {
      console.warn('[Launcher] PIV_BUILDER לא נטען');
    }
  }

  // ─── Mode: AF Browser ────────────────────────────────────────

  function _startAFMode() {
    _afView.classList.add('active', 'mode-enter');
    setTimeout(() => _afView.classList.remove('mode-enter'), 300);

    try {
      if (window.__AFBrowser) {
        const panel = document.getElementById('af-browser-panel');
        if (panel) {
          const container = document.getElementById('af-standalone-panel');
          if (container && !container.contains(panel)) {
            container.appendChild(panel);
          }
          // עקוף מיקום לתצוגה עצמאית
          panel.style.position   = 'relative';
          panel.style.width      = '100%';
          panel.style.height     = '100%';
          panel.style.maxHeight  = 'none';
          panel.style.borderRadius = '0';
          panel.style.boxShadow  = 'none';
          panel.style.top        = '0';
          panel.style.right      = '0';
          panel.style.transform  = 'none';
          panel.classList.add('open');
          panel.dataset.standalone = 'true';
        } else {
          // Panel לא נוצר עדיין — פתח ואחר כך הזז
          window.__AFBrowser.open();
          setTimeout(() => {
            const p = document.getElementById('af-browser-panel');
            const c = document.getElementById('af-standalone-panel');
            if (p && c) {
              c.appendChild(p);
              p.style.position     = 'relative';
              p.style.width        = '100%';
              p.style.height       = '100%';
              p.style.maxHeight    = 'none';
              p.style.borderRadius = '0';
              p.style.boxShadow    = 'none';
              p.style.top          = '0';
              p.style.right        = '0';
              p.style.transform    = 'none';
              p.classList.add('open');
              p.dataset.standalone = 'true';
            }
          }, 100);
        }
      }
    } catch (e) {
      console.warn('[AF] Error opening AF browser:', e);
    }
  }

  // ─── Restore AF Panel ─────────────────────────────────────────

  function _restoreAFPanel() {
    const panel = document.getElementById('af-browser-panel');
    if (panel && panel.dataset.standalone === 'true') {
      delete panel.dataset.standalone;
      panel.style.position     = '';
      panel.style.width        = '';
      panel.style.height       = '';
      panel.style.maxHeight    = '';
      panel.style.borderRadius = '';
      panel.style.boxShadow    = '';
      panel.style.top          = '';
      panel.style.right        = '';
      panel.style.transform    = '';
      panel.classList.remove('open');
      document.body.appendChild(panel);
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  function _getViewByMode(mode) {
    switch (mode) {
      case 'emulator': return _emulatorView;
      case 'qa':       return _qaView;
      case 'combined': return _combinedView;
      case 'af':       return _afView;
      case 'builder':  return _builderView;
      default:         return null;
    }
  }

  return { init };

})();

document.addEventListener('DOMContentLoaded', () => {
  Launcher.init();
});

export default Launcher;
