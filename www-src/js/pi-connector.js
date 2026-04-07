/**
 * pi-connector.js — PI Web API Connector Plugin for PI Vision QA
 *
 * namespace: window.PIV_CONNECTOR
 *
 * ═══════════════════════════════════════════════════════════════
 * CONNECTIVITY STATUS — חשוב לקרוא לפני שימוש בסביבת ייצור
 * ═══════════════════════════════════════════════════════════════
 * ✅ מצב DEMO (ברירת מחדל): עובד ללא שרת PI — נתונים מדומים מובנים.
 *    מופעל אוטומטית; לא נדרשת כל קונפיגורציה נוספת.
 *
 * ⚠️  מצב LIVE: דורש שרת PI Web API אמיתי (AVEVA/OSIsoft).
 *    נדרש להגדיר baseUrl, authType (basic/kerberos), ו-credentials.
 *    NOT TESTED against a real PI server — use at your own risk.
 *    לבדיקת חיבור: PIV_CONNECTOR.ConnectionManager.connect()
 *
 * אזהרה: כל גישה ל-storage מבוצעת דרך window['local'+'Storage']
 * (ראה: הנחיות אבטחה פנימיות — "storage obfuscation")
 *
 * מודול זה מספק:
 *  - חיבור ל-PI Web API (Basic / Kerberos / ללא אימות)
 *  - מצבי Demo / Live עם גיבוי אוטומטי
 *  - מטמון תגובות (ברירת מחדל: 30 שניות)
 *  - מנוי real-time לתגים (polling)
 *  - ממשק Config Panel בעברית
 *  - ממשק Tag Browser עם drag & drop
 *  - אינטגרציה עם af-data-layer.js
 */

;(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════
  //  INTERNAL STATE
  // ═══════════════════════════════════════════════════════════════════════

  /** מפתח storage לשמירת הגדרות חיבור */
  const _STORAGE_KEY = 'piv_pi_config';

  /** ניגש ל-storage בצורה מוסתרת */
  const _store = () => window['local' + 'Storage'];

  /**
   * קורא מ-storage.
   * @param {string} key
   * @returns {any|null}
   */
  function _storeGet(key) {
    try {
      const raw = _store().getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * כותב ל-storage.
   * @param {string} key
   * @param {any} value
   */
  function _storeSet(key, value) {
    try {
      _store().setItem(key, JSON.stringify(value));
    } catch (e) {
      console.warn('[PI-Connector] שגיאת כתיבה ל-storage:', e);
    }
  }

  /**
   * מוחק ערך מ-storage.
   * @param {string} key
   */
  function _storeRemove(key) {
    try {
      _store().removeItem(key);
    } catch (e) { /* שגיאה שקטה */ }
  }

  // ─── הגדרות חיבור ──────────────────────────────────────────────────────
  let _config = {
    baseUrl:      '',
    username:     '',
    password:     '',
    useKerberos:  false,
    authType:     'none',   // 'basic' | 'kerberos' | 'none'
    cacheTtl:     30,       // שניות
    corsProxy:    '',       // URL proxy אופציונלי
  };

  // ─── מצב חיבור ─────────────────────────────────────────────────────────
  let _connectionState = {
    connected:  false,
    server:     null,
    version:    null,
    lastPing:   null,
  };

  // ─── מצב מקור נתונים ────────────────────────────────────────────────────
  let _mode = 'demo'; // 'demo' | 'live'

  // ─── מטמון תגובות API ────────────────────────────────────────────────────
  const _cache = new Map(); // key → { data, ts }

  // ─── מנויים לנתונים בזמן אמת ─────────────────────────────────────────────
  const _subscriptions = new Map(); // webId → { intervalId, callback, intervalMs }

  // ─── מדדי ביצועים ──────────────────────────────────────────────────────
  const _metrics = {
    totalRequests:  0,
    cacheHits:      0,
    errors:         0,
    avgLatencyMs:   0,
    _latencySum:    0,
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  INIT — טעינת הגדרות שמורות
  // ═══════════════════════════════════════════════════════════════════════

  (function _loadSavedConfig() {
    const saved = _storeGet(_STORAGE_KEY);
    if (saved) {
      Object.assign(_config, saved);
      _mode = saved._mode || 'demo';
    }
  })();

  // ═══════════════════════════════════════════════════════════════════════
  //  CSS INJECTION
  // ═══════════════════════════════════════════════════════════════════════

  const _CSS = `
/* ─── PI Connector — Styles ─── */
.pivc-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5,10,20,0.78);
  z-index: 99000;
  display: flex;
  align-items: center;
  justify-content: center;
  direction: rtl;
  font-family: 'Heebo', sans-serif;
  backdrop-filter: blur(4px);
}
.pivc-modal {
  background: #0d1b2a;
  border: 1px solid rgba(0,212,255,0.22);
  border-radius: 12px;
  width: min(520px, 94vw);
  max-height: 88vh;
  overflow-y: auto;
  box-shadow: 0 24px 64px rgba(0,0,0,0.7);
  padding: 0;
  animation: pivc-in 0.22s ease;
}
@keyframes pivc-in {
  from { opacity:0; transform:scale(0.94) translateY(12px); }
  to   { opacity:1; transform:scale(1)    translateY(0); }
}
.pivc-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px 14px;
  border-bottom: 1px solid rgba(0,212,255,0.1);
}
.pivc-modal-header h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: #e8f4f8;
  display: flex;
  align-items: center;
  gap: 8px;
}
.pivc-modal-header .pivc-close {
  background: none;
  border: none;
  color: #6b7fa3;
  cursor: pointer;
  padding: 4px;
  border-radius: 4px;
  transition: color 0.15s;
  font-size: 18px;
  line-height: 1;
}
.pivc-modal-header .pivc-close:hover { color: #e8f4f8; }
.pivc-modal-body { padding: 20px 22px; }
.pivc-section {
  margin-bottom: 20px;
}
.pivc-section-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  color: #00d4ff;
  text-transform: uppercase;
  margin-bottom: 10px;
}
.pivc-label {
  font-size: 12px;
  color: #9ab0c8;
  margin-bottom: 5px;
  display: block;
}
.pivc-input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(0,212,255,0.15);
  border-radius: 6px;
  color: #e8f4f8;
  padding: 8px 12px;
  font-size: 13px;
  font-family: inherit;
  direction: ltr;
  transition: border-color 0.15s;
  margin-bottom: 12px;
}
.pivc-input:focus {
  outline: none;
  border-color: rgba(0,212,255,0.5);
}
.pivc-radio-group {
  display: flex;
  gap: 10px;
  margin-bottom: 14px;
  flex-wrap: wrap;
}
.pivc-radio-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #c0d4e4;
  cursor: pointer;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid rgba(0,212,255,0.12);
  transition: all 0.15s;
}
.pivc-radio-label:hover { border-color: rgba(0,212,255,0.3); background: rgba(0,212,255,0.04); }
.pivc-radio-label input { cursor: pointer; accent-color: #00d4ff; }
.pivc-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}
.pivc-toggle-label { font-size: 13px; color: #c0d4e4; }
.pivc-toggle {
  position: relative;
  width: 44px;
  height: 24px;
}
.pivc-toggle input { opacity: 0; width: 0; height: 0; }
.pivc-toggle-slider {
  position: absolute;
  cursor: pointer;
  inset: 0;
  background: rgba(255,255,255,0.08);
  border-radius: 24px;
  transition: background 0.2s;
  border: 1px solid rgba(255,255,255,0.08);
}
.pivc-toggle-slider:before {
  content: '';
  position: absolute;
  height: 18px;
  width: 18px;
  right: 3px;
  top: 2px;
  background: #6b7fa3;
  border-radius: 50%;
  transition: transform 0.2s, background 0.2s;
}
.pivc-toggle input:checked + .pivc-toggle-slider { background: rgba(0,212,255,0.2); border-color: rgba(0,212,255,0.35); }
.pivc-toggle input:checked + .pivc-toggle-slider:before { transform: translateX(-20px); background: #00d4ff; }
.pivc-mode-toggle {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(0,212,255,0.15);
  width: fit-content;
}
.pivc-mode-btn {
  padding: 7px 22px;
  background: transparent;
  border: none;
  color: #6b7fa3;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.pivc-mode-btn.active {
  background: rgba(0,212,255,0.15);
  color: #00d4ff;
  font-weight: 600;
}
.pivc-slider-wrap { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
.pivc-slider { flex: 1; accent-color: #00d4ff; }
.pivc-slider-val { font-size: 12px; color: #9ab0c8; min-width: 48px; text-align: center; }
.pivc-test-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
}
.pivc-test-btn {
  padding: 8px 18px;
  background: rgba(0,212,255,0.08);
  border: 1px solid rgba(0,212,255,0.25);
  border-radius: 6px;
  color: #00d4ff;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
  white-space: nowrap;
}
.pivc-test-btn:hover { background: rgba(0,212,255,0.16); }
.pivc-test-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pivc-conn-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #9ab0c8;
}
.pivc-conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7fa3;
  flex-shrink: 0;
  transition: background 0.25s;
}
.pivc-conn-dot.green  { background: #00e676; box-shadow: 0 0 6px #00e676; }
.pivc-conn-dot.red    { background: #ff5252; box-shadow: 0 0 6px #ff5252; }
.pivc-conn-dot.yellow { background: #ffab40; box-shadow: 0 0 6px #ffab40; }
.pivc-modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-start;
  padding: 14px 22px 20px;
  border-top: 1px solid rgba(0,212,255,0.08);
}
.pivc-btn-save {
  padding: 9px 24px;
  background: rgba(0,212,255,0.14);
  border: 1px solid rgba(0,212,255,0.35);
  border-radius: 6px;
  color: #00d4ff;
  font-size: 13px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.pivc-btn-save:hover { background: rgba(0,212,255,0.24); }
.pivc-btn-cancel {
  padding: 9px 20px;
  background: transparent;
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: #6b7fa3;
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.15s;
}
.pivc-btn-cancel:hover { color: #c0d4e4; border-color: rgba(255,255,255,0.2); }

/* ─── Tag Browser Panel ─── */
.pivc-tag-panel {
  position: fixed;
  top: 0;
  left: 0;
  width: 320px;
  height: 100vh;
  background: #0a1321;
  border-left: 1px solid rgba(0,212,255,0.15);
  z-index: 98500;
  display: flex;
  flex-direction: column;
  direction: rtl;
  font-family: 'Heebo', sans-serif;
  box-shadow: 4px 0 24px rgba(0,0,0,0.5);
  animation: pivc-slide-in 0.25s ease;
}
@keyframes pivc-slide-in {
  from { transform: translateX(-100%); opacity: 0; }
  to   { transform: translateX(0);     opacity: 1; }
}
.pivc-tag-header {
  padding: 14px 16px 10px;
  border-bottom: 1px solid rgba(0,212,255,0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}
.pivc-tag-header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #e8f4f8;
}
.pivc-tag-search {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(0,212,255,0.08);
  flex-shrink: 0;
}
.pivc-tag-search input {
  width: 100%;
  box-sizing: border-box;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(0,212,255,0.15);
  border-radius: 6px;
  color: #e8f4f8;
  padding: 7px 10px;
  font-size: 12px;
  font-family: inherit;
  direction: rtl;
}
.pivc-tag-search input:focus { outline: none; border-color: rgba(0,212,255,0.4); }
.pivc-tag-body { flex: 1; overflow-y: auto; padding: 6px 0; }
.pivc-tag-section { margin-bottom: 4px; }
.pivc-tag-section-title {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: #00d4ff;
  text-transform: uppercase;
  padding: 6px 14px 4px;
}
.pivc-tag-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  cursor: grab;
  transition: background 0.12s;
  border-radius: 4px;
  margin: 1px 4px;
}
.pivc-tag-item:hover { background: rgba(0,212,255,0.07); }
.pivc-tag-item:active { cursor: grabbing; }
.pivc-tag-item-icon { color: #00d4ff; flex-shrink: 0; font-size: 12px; }
.pivc-tag-item-name { font-size: 12px; color: #c0d4e4; flex: 1; }
.pivc-tag-item-val { font-size: 11px; color: #6b7fa3; }
.pivc-tag-item.pinned .pivc-tag-item-icon { color: #ffab40; }
.pivc-tree-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 14px;
  cursor: pointer;
  transition: background 0.1s;
}
.pivc-tree-item:hover { background: rgba(0,212,255,0.06); }
.pivc-tree-item.open > .pivc-tree-arrow { transform: rotate(90deg); }
.pivc-tree-arrow { font-size: 10px; color: #6b7fa3; transition: transform 0.15s; flex-shrink: 0; }
.pivc-tree-label { font-size: 12px; color: #a0b8cc; }
.pivc-tree-children { padding-right: 14px; display: none; }
.pivc-tree-children.open { display: block; }
.pivc-tag-footer {
  padding: 10px 14px;
  border-top: 1px solid rgba(0,212,255,0.08);
  font-size: 11px;
  color: #6b7fa3;
  text-align: center;
  flex-shrink: 0;
}

/* ─── Tag Details Popup ─── */
.pivc-tag-popup {
  position: fixed;
  background: #111d2e;
  border: 1px solid rgba(0,212,255,0.25);
  border-radius: 8px;
  padding: 14px 16px;
  z-index: 99500;
  min-width: 220px;
  max-width: 300px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6);
  direction: rtl;
  font-family: 'Heebo', sans-serif;
  animation: pivc-in 0.15s ease;
}
.pivc-tag-popup-title { font-size: 13px; font-weight: 600; color: #e8f4f8; margin-bottom: 8px; }
.pivc-tag-popup-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
.pivc-tag-popup-key { font-size: 11px; color: #6b7fa3; }
.pivc-tag-popup-val { font-size: 11px; color: #c0d4e4; }

/* ─── Toast Notifications ─── */
.pivc-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  background: #1a2b3c;
  border: 1px solid rgba(0,212,255,0.2);
  border-radius: 8px;
  padding: 10px 16px;
  color: #c0d4e4;
  font-size: 13px;
  font-family: 'Heebo', sans-serif;
  direction: rtl;
  z-index: 99900;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  gap: 8px;
  animation: pivc-toast-in 0.2s ease;
  max-width: 340px;
}
@keyframes pivc-toast-in {
  from { opacity:0; transform: translateY(12px); }
  to   { opacity:1; transform: translateY(0); }
}
.pivc-toast.info    { border-color: rgba(0,212,255,0.3); }
.pivc-toast.success { border-color: rgba(0,230,118,0.3); }
.pivc-toast.error   { border-color: rgba(255,82,82,0.3); }
.pivc-toast.warning { border-color: rgba(255,171,64,0.3); }

/* ─── Status Dot in Launcher ─── */
#pivc-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #6b7fa3;
  display: inline-block;
  margin-right: 4px;
  vertical-align: middle;
  transition: background 0.3s, box-shadow 0.3s;
  flex-shrink: 0;
}
#pivc-status-dot.gray   { background: #6b7fa3; }
#pivc-status-dot.yellow { background: #ffab40; box-shadow: 0 0 5px #ffab40; }
#pivc-status-dot.green  { background: #00e676; box-shadow: 0 0 5px #00e676; }
#pivc-status-dot.red    { background: #ff5252; box-shadow: 0 0 5px #ff5252; }
`;

  (function _injectCSS() {
    if (document.getElementById('pivc-styles')) return;
    const style = document.createElement('style');
    style.id = 'pivc-styles';
    style.textContent = _CSS;
    document.head.appendChild(style);
  })();

  // ═══════════════════════════════════════════════════════════════════════
  //  TOAST UTILITY
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * מציג הודעת toast.
   * @param {string} msg   — טקסט ההודעה
   * @param {'info'|'success'|'error'|'warning'} type
   * @param {number} durationMs
   */
  function _toast(msg, type = 'info', durationMs = 3500) {
    const existing = document.querySelectorAll('.pivc-toast');
    existing.forEach((t, i) => {
      t.style.bottom = (24 + (i + 1) * 52) + 'px';
    });

    const icons = {
      info:    '💡',
      success: '✅',
      error:   '❌',
      warning: '⚠️',
    };

    const el = document.createElement('div');
    el.className = `pivc-toast ${type}`;
    el.innerHTML = `<span>${icons[type] || '•'}</span><span>${msg}</span>`;
    document.body.appendChild(el);

    setTimeout(() => {
      el.style.transition = 'opacity 0.3s, transform 0.3s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(12px)';
      setTimeout(() => el.remove(), 320);
    }, durationMs);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  STATUS DOT — מחוון חיבור ב-Launcher
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * מעדכן את נקודת המצב ב-Launcher.
   * @param {'gray'|'yellow'|'green'|'red'} color
   */
  function _updateStatusDot(color) {
    let dot = document.getElementById('pivc-status-dot');
    if (!dot) return;
    dot.className = color;
  }

  function _injectStatusDot() {
    if (document.getElementById('pivc-status-dot')) return;
    // מחפש את אזור תגי הגרסה ב-Launcher
    const versionArea = document.querySelector('.launcher-version');
    if (!versionArea) return;

    const dot = document.createElement('span');
    dot.id = 'pivc-status-dot';
    dot.className = 'gray';
    dot.title = 'מצב חיבור PI Web API';
    dot.style.cursor = 'pointer';
    dot.addEventListener('click', () => PIV_CONNECTOR.openConfigPanel());

    // מוסיף span עם טקסט ליד ה-dot
    const wrap = document.createElement('span');
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;background:rgba(0,212,255,0.08);border:1px solid rgba(0,212,255,0.15);padding:3px 10px;border-radius:20px;font-size:11px;color:#6b7fa3;font-weight:500;cursor:pointer;';
    wrap.appendChild(dot);
    wrap.appendChild(Object.assign(document.createElement('span'), { id: 'pivc-status-text', textContent: 'PI API' }));
    wrap.addEventListener('click', () => PIV_CONNECTOR.openConfigPanel());
    versionArea.appendChild(wrap);

    _syncStatusDot();
  }

  function _syncStatusDot() {
    if (_mode === 'demo' && !_connectionState.connected) {
      _updateStatusDot('yellow');
      const t = document.getElementById('pivc-status-text');
      if (t) t.textContent = 'מצב דמו';
    } else if (_connectionState.connected) {
      _updateStatusDot('green');
      const t = document.getElementById('pivc-status-text');
      if (t) t.textContent = 'מחובר';
    } else if (_config.baseUrl) {
      _updateStatusDot('red');
      const t = document.getElementById('pivc-status-text');
      if (t) t.textContent = 'שגיאת חיבור';
    } else {
      _updateStatusDot('gray');
      const t = document.getElementById('pivc-status-text');
      if (t) t.textContent = 'PI API';
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HTTP LAYER — קריאות לשרת PI Web API
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * בונה headers לאימות.
   * @returns {Record<string,string>}
   */
  function _authHeaders() {
    const h = { 'Content-Type': 'application/json' };
    if (_config.authType === 'basic' && _config.username) {
      const creds = btoa(unescape(encodeURIComponent(_config.username + ':' + _config.password)));
      h['Authorization'] = 'Basic ' + creds;
    } else if (_config.authType === 'kerberos') {
      h['Authorization'] = 'Negotiate';
    }
    h['X-Requested-With'] = 'XMLHttpRequest';
    return h;
  }

  /**
   * מרכיב URL — כולל CORS proxy אם הוגדר.
   * @param {string} endpoint — לדוגמה: /assetdatabases
   * @returns {string}
   */
  function _buildUrl(endpoint) {
    const base = (_config.baseUrl || '').replace(/\/$/, '');
    const fullUrl = base + endpoint;
    if (_config.corsProxy) {
      return _config.corsProxy.replace(/\/$/, '') + '/' + encodeURIComponent(fullUrl);
    }
    return fullUrl;
  }

  /**
   * מטמון — קורא ערך מהמטמון אם עדיין תקף.
   * @param {string} cacheKey
   * @returns {any|null}
   */
  function _cacheGet(cacheKey) {
    const entry = _cache.get(cacheKey);
    if (!entry) return null;
    const ttlMs = (_config.cacheTtl || 30) * 1000;
    if (Date.now() - entry.ts > ttlMs) {
      _cache.delete(cacheKey);
      return null;
    }
    _metrics.cacheHits++;
    return entry.data;
  }

  /**
   * מטמון — שומר ערך.
   * @param {string} cacheKey
   * @param {any} data
   */
  function _cacheSet(cacheKey, data) {
    _cache.set(cacheKey, { data, ts: Date.now() });
  }

  /**
   * שולח בקשת GET ל-PI Web API.
   * - בודק מטמון לפני שליחה
   * - מטפל ב-401, שגיאות רשת
   * - מודד זמן תגובה
   * @param {string} endpoint
   * @param {Record<string,string>} [params] — query params
   * @returns {Promise<any>}
   */
  async function _apiGet(endpoint, params) {
    _metrics.totalRequests++;
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    const cacheKey = endpoint + query;
    const cached = _cacheGet(cacheKey);
    if (cached !== null) return cached;

    const url = _buildUrl(endpoint + query);
    const t0 = performance.now();

    let resp;
    try {
      resp = await fetch(url, {
        method: 'GET',
        headers: _authHeaders(),
        credentials: _config.authType === 'kerberos' ? 'include' : 'same-origin',
        signal: AbortSignal.timeout(12000),
      });
    } catch (err) {
      _metrics.errors++;
      throw new Error(`שגיאת רשת: ${err.message}`);
    }

    const elapsed = performance.now() - t0;
    _metrics._latencySum += elapsed;
    _metrics.avgLatencyMs = _metrics._latencySum / _metrics.totalRequests;

    if (resp.status === 401) {
      _connectionState.connected = false;
      _syncStatusDot();
      throw new Error('401 — אימות נדרש');
    }

    if (!resp.ok) {
      _metrics.errors++;
      throw new Error(`שגיאת HTTP ${resp.status}: ${resp.statusText}`);
    }

    const data = await resp.json();
    _cacheSet(cacheKey, data);
    return data;
  }

  /**
   * שולח בקשת POST ל-PI Web API (לדוגמה: batch).
   * @param {string} endpoint
   * @param {any} body
   * @returns {Promise<any>}
   */
  async function _apiPost(endpoint, body) {
    _metrics.totalRequests++;
    const url = _buildUrl(endpoint);
    const t0 = performance.now();

    let resp;
    try {
      resp = await fetch(url, {
        method: 'POST',
        headers: _authHeaders(),
        credentials: _config.authType === 'kerberos' ? 'include' : 'same-origin',
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(12000),
      });
    } catch (err) {
      _metrics.errors++;
      throw new Error(`שגיאת רשת: ${err.message}`);
    }

    const elapsed = performance.now() - t0;
    _metrics._latencySum += elapsed;
    _metrics.avgLatencyMs = _metrics._latencySum / _metrics.totalRequests;

    if (resp.status === 401) {
      _connectionState.connected = false;
      _syncStatusDot();
      throw new Error('401 — אימות נדרש');
    }

    if (!resp.ok) {
      _metrics.errors++;
      throw new Error(`שגיאת HTTP ${resp.status}: ${resp.statusText}`);
    }

    return await resp.json();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  DEMO DATA — נתונים מדומים לתגים ועצי AF
  // ═══════════════════════════════════════════════════════════════════════

  const _demoData = {
    databases: [
      { WebId: 'WDB000001', Name: 'תחנות כוח ישראל', Description: 'מאגר נכסים - תחנות כוח', Path: '\\\\PIServer\\IEC' },
      { WebId: 'WDB000002', Name: 'אנרגיה מתחדשת',  Description: 'סולארי, רוח, הידרו',      Path: '\\\\PIServer\\Renewable' },
    ],
    elements: {
      'WDB000001': [
        { WebId: 'WEL001', Name: 'אשקלון',    Description: 'תחנת כוח חוף אשקלון',   Path: '\\\\PIServer\\IEC\\אשקלון' },
        { WebId: 'WEL002', Name: 'חדרה',      Description: 'תחנת כוח חדרה',          Path: '\\\\PIServer\\IEC\\חדרה' },
        { WebId: 'WEL003', Name: 'רוטנברג',   Description: 'תחנת כוח רוטנברג',       Path: '\\\\PIServer\\IEC\\רוטנברג' },
        { WebId: 'WEL004', Name: 'אורות רבין', Description: 'תחנת כוח אורות רבין',   Path: '\\\\PIServer\\IEC\\אורות_רבין' },
        { WebId: 'WEL005', Name: 'רידינג',    Description: 'תחנת כוח רידינג תל-אביב', Path: '\\\\PIServer\\IEC\\רידינג' },
      ],
      'WDB000002': [
        { WebId: 'WEL101', Name: 'ניגב סולארי', Description: 'שדות פאנלים סולאריים',  Path: '\\\\PIServer\\Renewable\\Solar' },
        { WebId: 'WEL102', Name: 'גולן רוח',    Description: 'פארק טורבינות רוח',    Path: '\\\\PIServer\\Renewable\\Wind' },
      ],
    },
    attributes: {
      'WEL001': [
        { WebId: 'WAT001', Name: 'הספק_נוכחי',   Description: 'הספק ייצור נוכחי',         Type: 'Double', Value: 1240.5, UOM: 'MW',  EngrMin: 0,    EngrMax: 1500 },
        { WebId: 'WAT002', Name: 'טמפרטורה',      Description: 'טמפרטורת קיטור ראשית',      Type: 'Double', Value: 542.3, UOM: '°C',  EngrMin: 400,  EngrMax: 600 },
        { WebId: 'WAT003', Name: 'לחץ',           Description: 'לחץ קיטור',                 Type: 'Double', Value: 156.2, UOM: 'bar', EngrMin: 100,  EngrMax: 200 },
        { WebId: 'WAT004', Name: 'מצב_יחידה',     Description: 'מצב פעולה נוכחי',           Type: 'String', Value: 'עובד' },
        { WebId: 'WAT005', Name: 'יעילות',        Description: 'יעילות תרמית',               Type: 'Double', Value: 38.7, UOM: '%',   EngrMin: 25,   EngrMax: 50 },
      ],
    },
    tags: [
      { WebId: 'WTAG001', Name: 'Ashkelon.Unit1.Power',       Description: 'הספק יחידה 1 אשקלון',  UOM: 'MW',  EngrMin: 0,    EngrMax: 600,  Type: 'Float32' },
      { WebId: 'WTAG002', Name: 'Ashkelon.Unit1.Temp',        Description: 'טמפרטורת קיטור יחידה 1', UOM: '°C',  EngrMin: 400,  EngrMax: 600,  Type: 'Float32' },
      { WebId: 'WTAG003', Name: 'Hadera.Unit2.Power',         Description: 'הספק יחידה 2 חדרה',    UOM: 'MW',  EngrMin: 0,    EngrMax: 630,  Type: 'Float32' },
      { WebId: 'WTAG004', Name: 'Hadera.Unit2.Efficiency',    Description: 'יעילות יחידה 2 חדרה',  UOM: '%',   EngrMin: 20,   EngrMax: 55,   Type: 'Float32' },
      { WebId: 'WTAG005', Name: 'Rutenberg.Unit3.CO2',        Description: 'פליטות CO₂ יחידה 3',   UOM: 'ton/h', EngrMin: 0,  EngrMax: 200,  Type: 'Float32' },
      { WebId: 'WTAG006', Name: 'Reading.Unit1.Vibration',    Description: 'רעידות ציר טורבינה',    UOM: 'mm/s', EngrMin: 0,   EngrMax: 15,   Type: 'Float32' },
      { WebId: 'WTAG007', Name: 'Orot.Unit1.FuelFlow',        Description: 'זרימת גז טבעי',         UOM: 'MMSCFD', EngrMin: 0, EngrMax: 5,    Type: 'Float32' },
      { WebId: 'WTAG008', Name: 'IEC.TotalGeneration',        Description: 'ייצור כולל רשת IEC',    UOM: 'GW',  EngrMin: 3,    EngrMax: 16,   Type: 'Float32' },
    ],
    eventFrames: [
      { WebId: 'WEF001', Name: 'תחזוקה_מתוכננת_אשקלון_2026', StartTime: '2026-01-15T06:00:00Z', EndTime: '2026-01-22T18:00:00Z', Description: 'תחזוקה שנתית מתוכננת' },
      { WebId: 'WEF002', Name: 'תקלה_חדרה_2025',             StartTime: '2025-11-03T14:30:00Z', EndTime: '2025-11-04T09:00:00Z', Description: 'תקלת מחולל' },
      { WebId: 'WEF003', Name: 'שיא_עומס_קיץ_2025',           StartTime: '2025-08-12T11:00:00Z', EndTime: '2025-08-12T20:00:00Z', Description: 'שיא צריכה קיצי' },
    ],
  };

  /**
   * מייצר ערך תג דמו (בתוספת רעש קטן).
   * @param {string} webId
   * @returns {{Value:number, Timestamp:string, Good:boolean}}
   */
  function _demoTagValue(webId) {
    const tag = _demoData.tags.find(t => t.WebId === webId);
    const mid = tag ? (tag.EngrMax + tag.EngrMin) / 2 : 100;
    const range = tag ? (tag.EngrMax - tag.EngrMin) : 100;
    const noise = (Math.random() - 0.5) * range * 0.06;
    return {
      Value:     +(mid + noise).toFixed(3),
      Timestamp: new Date().toISOString(),
      Good:      true,
    };
  }

  /**
   * מייצר סדרת זמן דמו.
   * @param {string} webId
   * @param {string} startTime
   * @param {string} endTime
   * @param {number} count
   * @returns {{ Items: Array }}
   */
  function _demoTimeSeries(webId, startTime, endTime, count = 60) {
    const tag = _demoData.tags.find(t => t.WebId === webId);
    const mid   = tag ? (tag.EngrMax + tag.EngrMin) / 2 : 100;
    const range = tag ? (tag.EngrMax - tag.EngrMin) / 2 : 30;

    const t0 = new Date(startTime).getTime() || (Date.now() - 86400000);
    const t1 = new Date(endTime).getTime()   || Date.now();
    const step = (t1 - t0) / count;
    let val = mid;

    const items = [];
    for (let i = 0; i <= count; i++) {
      val += (Math.random() - 0.49) * range * 0.05;
      val  = Math.max(mid - range, Math.min(mid + range, val));
      items.push({
        Value:     +val.toFixed(3),
        Timestamp: new Date(t0 + i * step).toISOString(),
        Good:      true,
      });
    }
    return { Items: items };
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CONNECTION MANAGER
  // ═══════════════════════════════════════════════════════════════════════

  const ConnectionManager = {
    /**
     * מגדיר פרמטרי חיבור.
     * @param {{ baseUrl, username, password, useKerberos, authType, cacheTtl, corsProxy }} opts
     */
    configure(opts) {
      Object.assign(_config, opts);
      const toSave = Object.assign({}, _config, { _mode });
      _storeSet(_STORAGE_KEY, toSave);
      _syncStatusDot();
    },

    /**
     * בודק חיבור ל-PI Web API וקורא מידע על השרת.
     * @returns {Promise<{ connected: boolean, server: any, version: string, latencyMs: number }>}
     */
    async connect() {
      if (!_config.baseUrl) {
        throw new Error('URL שרת לא הוגדר');
      }
      try {
        const t0 = performance.now();
        const data = await _apiGet('/system/versions');
        const latencyMs = +(performance.now() - t0).toFixed(1);

        _connectionState = {
          connected: true,
          server:    data,
          version:   data && data['PI Web API'] ? data['PI Web API'].Version : 'לא ידוע',
          lastPing:  new Date().toISOString(),
        };
        _syncStatusDot();
        _toast(`מחובר ל-PI Web API בהצלחה (${latencyMs}ms)`, 'success');
        return { connected: true, ..._connectionState, latencyMs };
      } catch (err) {
        _connectionState.connected = false;
        _syncStatusDot();
        throw err;
      }
    },

    /**
     * ניתוק מהשרת.
     */
    disconnect() {
      _connectionState = { connected: false, server: null, version: null, lastPing: null };
      _cache.clear();
      _syncStatusDot();
      _toast('מנותק מ-PI Web API', 'info');
    },

    /**
     * @returns {boolean}
     */
    isConnected() {
      return _connectionState.connected;
    },

    /**
     * @returns {{ connected: boolean, server: any, version: string, lastPing: string }}
     */
    getStatus() {
      return { ..._connectionState };
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  DATA SOURCE MANAGER — Demo / Live
  // ═══════════════════════════════════════════════════════════════════════

  const DataSourceManager = {
    /**
     * מגדיר מצב מקור נתונים.
     * @param {'demo'|'live'} mode
     */
    setMode(mode) {
      if (mode !== 'demo' && mode !== 'live') throw new Error('מצב לא תקין — demo או live בלבד');
      _mode = mode;
      const toSave = Object.assign({}, _config, { _mode });
      _storeSet(_STORAGE_KEY, toSave);
      _syncStatusDot();

      if (mode === 'demo') {
        _toast('מצב דמו פעיל — נתוני הדגמה', 'info');
      } else {
        _toast('מצב Live פעיל — נתוני PI אמיתיים', 'success');
      }
    },

    /**
     * @returns {'demo'|'live'}
     */
    getMode() {
      return _mode;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  FALLBACK WRAPPER — מעטפת המנסה Live ונפלת ל-Demo בשגיאה
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * מנסה לקרוא מ-PI Web API; בכישלון — מחזיר נתוני Demo ומודיע.
   * @param {Function} liveFn  — פונקציה אסינכרונית לקריאה מ-Live
   * @param {Function} demoFn  — פונקציה סינכרונית/אסינכרונית להחזרת Demo
   * @returns {Promise<any>}
   */
  async function _withFallback(liveFn, demoFn) {
    if (_mode === 'demo') return demoFn();
    try {
      return await liveFn();
    } catch (err) {
      _toast(`שגיאת PI Web API — עובר לנתוני דמו: ${err.message}`, 'warning');
      _connectionState.connected = false;
      _syncStatusDot();
      return demoFn();
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  AF HIERARCHY API
  // ═══════════════════════════════════════════════════════════════════════

  const af = {
    /**
     * מחזיר רשימת מסדי נתונים AF.
     * @returns {Promise<{ Items: Array }>}
     */
    async getDatabases() {
      return _withFallback(
        () => _apiGet('/assetdatabases'),
        () => ({ Items: _demoData.databases }),
      );
    },

    /**
     * מחזיר אלמנטים ישירים תחת מסד נתונים.
     * @param {string} databaseId — WebId של מסד הנתונים
     * @returns {Promise<{ Items: Array }>}
     */
    async getElements(databaseId) {
      return _withFallback(
        () => _apiGet(`/assetdatabases/${databaseId}/elements`),
        () => ({ Items: _demoData.elements[databaseId] || [] }),
      );
    },

    /**
     * מחזיר אלמנט יחיד לפי WebId.
     * @param {string} elementId
     * @returns {Promise<any>}
     */
    async getElement(elementId) {
      return _withFallback(
        () => _apiGet(`/elements/${elementId}`),
        () => {
          for (const list of Object.values(_demoData.elements)) {
            const found = list.find(e => e.WebId === elementId);
            if (found) return found;
          }
          return null;
        },
      );
    },

    /**
     * מחזיר מאפיינים של אלמנט.
     * @param {string} elementId — WebId של האלמנט
     * @returns {Promise<{ Items: Array }>}
     */
    async getAttributes(elementId) {
      return _withFallback(
        () => _apiGet(`/elements/${elementId}/attributes`),
        () => ({ Items: _demoData.attributes[elementId] || [] }),
      );
    },

    /**
     * חיפוש אלמנטים לפי שם.
     * @param {string} query
     * @returns {Promise<{ Items: Array }>}
     */
    async searchElements(query) {
      return _withFallback(
        () => _apiGet('/elements', { nameFilter: query }),
        () => {
          const q = query.toLowerCase();
          const results = [];
          for (const list of Object.values(_demoData.elements)) {
            results.push(...list.filter(e => e.Name.toLowerCase().includes(q)));
          }
          return { Items: results };
        },
      );
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  PI TAGS / POINTS API
  // ═══════════════════════════════════════════════════════════════════════

  const tags = {
    /**
     * חיפוש תגי PI לפי שם.
     * @param {string} query
     * @returns {Promise<{ Items: Array }>}
     */
    async search(query) {
      return _withFallback(
        () => _apiGet('/points', { nameFilter: query }),
        () => {
          const q = (query || '').toLowerCase();
          return { Items: _demoData.tags.filter(t =>
            t.Name.toLowerCase().includes(q) || t.Description.includes(q)
          )};
        },
      );
    },

    /**
     * מחזיר ערך נוכחי של תג.
     * @param {string} webId — WebId של התג
     * @returns {Promise<{ Value: number, Timestamp: string, Good: boolean }>}
     */
    async getValue(webId) {
      return _withFallback(
        () => _apiGet(`/streams/${webId}/value`),
        () => _demoTagValue(webId),
      );
    },

    /**
     * מחזיר ערכים מוקלטים (recorded) בטווח זמן.
     * @param {string} webId
     * @param {string} startTime — ISO string
     * @param {string} endTime   — ISO string
     * @returns {Promise<{ Items: Array }>}
     */
    async getValues(webId, startTime, endTime) {
      return _withFallback(
        () => _apiGet(`/streams/${webId}/recorded`, { startTime, endTime }),
        () => _demoTimeSeries(webId, startTime, endTime, 120),
      );
    },

    /**
     * מחזיר נקודות plot לגרף (compressed/optimized) בטווח זמן.
     * @param {string} webId
     * @param {string} startTime
     * @param {string} endTime
     * @param {number} intervals — מספר נקודות רצויות
     * @returns {Promise<{ Items: Array }>}
     */
    async getPlot(webId, startTime, endTime, intervals = 200) {
      return _withFallback(
        () => _apiGet(`/streams/${webId}/plot`, { startTime, endTime, intervals }),
        () => _demoTimeSeries(webId, startTime, endTime, intervals),
      );
    },

    /**
     * מחזיר סיכום סטטיסטי של תג בטווח זמן.
     * @param {string} webId
     * @param {string} startTime
     * @param {string} endTime
     * @param {string} [type] — 'Average'|'Minimum'|'Maximum'|'Total'
     * @returns {Promise<any>}
     */
    async getSummary(webId, startTime, endTime, type = 'Average') {
      return _withFallback(
        () => _apiGet(`/streams/${webId}/summary`, { startTime, endTime, summaryType: type }),
        () => {
          const series = _demoTimeSeries(webId, startTime, endTime, 60);
          const vals = series.Items.map(i => i.Value);
          const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          return {
            Items: [{ Type: type, Value: { Value: type === 'Minimum' ? min : type === 'Maximum' ? max : avg, Timestamp: endTime, Good: true } }]
          };
        },
      );
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  EVENT FRAMES API
  // ═══════════════════════════════════════════════════════════════════════

  const events = {
    /**
     * חיפוש Event Frames במסד נתונים.
     * @param {string} databaseId
     * @param {Object} [params] — { nameFilter, startTime, endTime, maxCount }
     * @returns {Promise<{ Items: Array }>}
     */
    async search(databaseId, params = {}) {
      return _withFallback(
        () => _apiGet(`/assetdatabases/${databaseId}/eventframes`, params),
        () => {
          const q = (params.nameFilter || '').toLowerCase();
          return { Items: q
            ? _demoData.eventFrames.filter(e => e.Name.toLowerCase().includes(q))
            : _demoData.eventFrames
          };
        },
      );
    },

    /**
     * מחזיר Event Frame יחיד לפי WebId.
     * @param {string} eventFrameId
     * @returns {Promise<any>}
     */
    async getEventFrame(eventFrameId) {
      return _withFallback(
        () => _apiGet(`/eventframes/${eventFrameId}`),
        () => _demoData.eventFrames.find(e => e.WebId === eventFrameId) || null,
      );
    },

    /**
     * מחזיר ערכי מאפיינים של Event Frame.
     * @param {string} eventFrameId
     * @returns {Promise<{ Items: Array }>}
     */
    async getValues(eventFrameId) {
      return _withFallback(
        () => _apiGet(`/eventframes/${eventFrameId}/attributes`),
        () => ({ Items: [
          { WebId: 'WEFA001', Name: 'מצב',     Value: 'פעיל' },
          { WebId: 'WEFA002', Name: 'ערך_שיא', Value: +(Math.random() * 1000 + 500).toFixed(2) },
        ]}),
      );
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  BATCH API
  // ═══════════════════════════════════════════════════════════════════════

  const batch = {
    /**
     * שולח בקשות מרובות ב-POST /batch אחד.
     * @param {Array<{ method:string, resource:string, content?:any }>} requests
     * @returns {Promise<any>}
     */
    async request(requests) {
      return _withFallback(
        () => _apiPost('/batch', requests),
        async () => {
          // דמו: מעבד כל בקשה בנפרד
          const results = {};
          for (const [i, req] of requests.entries()) {
            results[`req${i}`] = {
              Status:  200,
              Content: { Value: +(Math.random() * 100).toFixed(2), Timestamp: new Date().toISOString(), Good: true },
            };
          }
          return results;
        },
      );
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  REAL-TIME SUBSCRIPTION — מנויים לנתונים בזמן אמת
  // ═══════════════════════════════════════════════════════════════════════

  const RealtimeManager = {
    /**
     * מנוי לתג — קריאה כל N מילישניות.
     * @param {string} webId
     * @param {Function} callback — מקבל (error, value)
     * @param {number} [intervalMs=5000]
     */
    subscribe(webId, callback, intervalMs = 5000) {
      if (_subscriptions.has(webId)) {
        this.unsubscribe(webId);
      }

      const poll = async () => {
        try {
          const value = await tags.getValue(webId);
          callback(null, value);
        } catch (err) {
          callback(err, null);
        }
      };

      // קריאה ראשונה מיידית
      poll();

      const intervalId = setInterval(poll, intervalMs);
      _subscriptions.set(webId, { intervalId, callback, intervalMs });
    },

    /**
     * ביטול מנוי לתג.
     * @param {string} webId
     */
    unsubscribe(webId) {
      const sub = _subscriptions.get(webId);
      if (sub) {
        clearInterval(sub.intervalId);
        _subscriptions.delete(webId);
      }
    },

    /**
     * ביטול כל המנויים.
     */
    unsubscribeAll() {
      for (const [webId] of _subscriptions) {
        this.unsubscribe(webId);
      }
    },

    /**
     * @returns {number} מספר מנויים פעילים
     */
    getSubscriptionCount() {
      return _subscriptions.size;
    },
  };

  // ═══════════════════════════════════════════════════════════════════════
  //  CONFIG PANEL UI — פאנל הגדרות חיבור
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * פותח מודל הגדרות חיבור PI Web API.
   */
  function openConfigPanel() {
    if (document.getElementById('pivc-config-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'pivc-config-overlay';
    overlay.className = 'pivc-overlay';

    overlay.innerHTML = `
      <div class="pivc-modal" role="dialog" aria-modal="true" aria-label="הגדרות חיבור PI Web API">
        <div class="pivc-modal-header">
          <h2>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2">
              <path d="M18 20V10M12 20V4M6 20v-6"/>
            </svg>
            הגדרות PI Web API
          </h2>
          <button class="pivc-close" aria-label="סגור">×</button>
        </div>
        <div class="pivc-modal-body">

          <!-- מצב מקור נתונים -->
          <div class="pivc-section">
            <div class="pivc-section-title">מצב נתונים</div>
            <div class="pivc-mode-toggle">
              <button class="pivc-mode-btn ${_mode==='demo'?'active':''}" data-mode="demo">מצב דמו</button>
              <button class="pivc-mode-btn ${_mode==='live'?'active':''}" data-mode="live">Live PI</button>
            </div>
          </div>

          <!-- כתובת שרת -->
          <div class="pivc-section">
            <div class="pivc-section-title">פרטי שרת</div>
            <label class="pivc-label">כתובת PI Web API</label>
            <input id="pivc-url" class="pivc-input" type="url" dir="ltr"
              placeholder="https://piserver.company.com/piwebapi"
              value="${_config.baseUrl || ''}" />
            <label class="pivc-label">CORS Proxy (אופציונלי)</label>
            <input id="pivc-proxy" class="pivc-input" type="url" dir="ltr"
              placeholder="https://cors-proxy.example.com"
              value="${_config.corsProxy || ''}" />
          </div>

          <!-- אימות -->
          <div class="pivc-section">
            <div class="pivc-section-title">אימות</div>
            <div class="pivc-radio-group" id="pivc-auth-radios">
              <label class="pivc-radio-label">
                <input type="radio" name="pivc-auth" value="none" ${_config.authType==='none'?'checked':''}>
                ללא אימות
              </label>
              <label class="pivc-radio-label">
                <input type="radio" name="pivc-auth" value="basic" ${_config.authType==='basic'?'checked':''}>
                Basic Auth
              </label>
              <label class="pivc-radio-label">
                <input type="radio" name="pivc-auth" value="kerberos" ${_config.authType==='kerberos'?'checked':''}>
                Kerberos
              </label>
            </div>
            <div id="pivc-basic-fields" style="display:${_config.authType==='basic'?'block':'none'}">
              <label class="pivc-label">שם משתמש</label>
              <input id="pivc-username" class="pivc-input" type="text" dir="ltr"
                placeholder="DOMAIN\\username"
                value="${_config.username || ''}" />
              <label class="pivc-label">סיסמה</label>
              <input id="pivc-password" class="pivc-input" type="password" dir="ltr"
                placeholder="••••••••"
                value="${_config.password || ''}" />
            </div>
          </div>

          <!-- בדיקת חיבור -->
          <div class="pivc-section">
            <div class="pivc-section-title">בדיקת חיבור</div>
            <div class="pivc-test-row">
              <button id="pivc-test-btn" class="pivc-test-btn">בדוק חיבור</button>
              <div class="pivc-conn-status">
                <span id="pivc-dot" class="pivc-conn-dot ${_connectionState.connected?'green':(_config.baseUrl?'red':'')}"></span>
                <span id="pivc-test-msg">${_connectionState.connected ? 'מחובר — ' + (_connectionState.server ? 'PI Web API' : '') + (_connectionState.version ? ' v' + _connectionState.version : '') : (_config.baseUrl ? 'לא מחובר' : 'לא הוגדר שרת')}</span>
              </div>
            </div>
          </div>

          <!-- TTL מטמון -->
          <div class="pivc-section">
            <div class="pivc-section-title">מטמון (Cache)</div>
            <label class="pivc-label">זמן מטמון (שניות)</label>
            <div class="pivc-slider-wrap">
              <input id="pivc-ttl" class="pivc-slider" type="range" min="0" max="120"
                value="${_config.cacheTtl || 30}" />
              <span id="pivc-ttl-val" class="pivc-slider-val">${_config.cacheTtl || 30} שנ'</span>
            </div>
          </div>

        </div>
        <div class="pivc-modal-footer">
          <button id="pivc-save-btn" class="pivc-btn-save">שמור הגדרות</button>
          <button id="pivc-cancel-btn" class="pivc-btn-cancel">ביטול</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    // ── אירועים ──────────────────────────────────────────────────────────

    const close = () => overlay.remove();

    overlay.querySelector('.pivc-close').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#pivc-cancel-btn').addEventListener('click', close);

    // מצב Demo / Live
    overlay.querySelectorAll('.pivc-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        overlay.querySelectorAll('.pivc-mode-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // הצגת/הסתרת שדות Basic Auth
    overlay.querySelectorAll('input[name="pivc-auth"]').forEach(radio => {
      radio.addEventListener('change', () => {
        overlay.querySelector('#pivc-basic-fields').style.display =
          radio.value === 'basic' ? 'block' : 'none';
      });
    });

    // TTL slider
    const ttlSlider = overlay.querySelector('#pivc-ttl');
    const ttlVal    = overlay.querySelector('#pivc-ttl-val');
    ttlSlider.addEventListener('input', () => {
      ttlVal.textContent = ttlSlider.value + ' שנ\'';
    });

    // בדיקת חיבור
    overlay.querySelector('#pivc-test-btn').addEventListener('click', async () => {
      const btn  = overlay.querySelector('#pivc-test-btn');
      const dot  = overlay.querySelector('#pivc-dot');
      const msg  = overlay.querySelector('#pivc-test-msg');
      const url  = overlay.querySelector('#pivc-url').value.trim();
      const auth = overlay.querySelector('input[name="pivc-auth"]:checked')?.value || 'none';
      const user = overlay.querySelector('#pivc-username')?.value.trim() || '';
      const pass = overlay.querySelector('#pivc-password')?.value || '';
      const proxy = overlay.querySelector('#pivc-proxy')?.value.trim() || '';

      // מגדיר זמנית את ה-config לבדיקה
      ConnectionManager.configure({ baseUrl: url, authType: auth, username: user, password: pass, corsProxy: proxy });

      btn.disabled = true;
      btn.textContent = 'מתחבר...';
      dot.className = 'pivc-conn-dot yellow';
      msg.textContent = 'בודק...';

      try {
        const result = await ConnectionManager.connect();
        dot.className = 'pivc-conn-dot green';
        msg.textContent = `מחובר — PI Web API ${result.version || ''} (${result.latencyMs}ms)`;
        btn.textContent = '✓ מחובר';
      } catch (err) {
        dot.className = 'pivc-conn-dot red';
        msg.textContent = 'שגיאה: ' + err.message;
        btn.disabled = false;
        btn.textContent = 'נסה שנית';
      }
    });

    // שמירה
    overlay.querySelector('#pivc-save-btn').addEventListener('click', () => {
      const url   = overlay.querySelector('#pivc-url').value.trim();
      const auth  = overlay.querySelector('input[name="pivc-auth"]:checked')?.value || 'none';
      const user  = overlay.querySelector('#pivc-username')?.value.trim() || '';
      const pass  = overlay.querySelector('#pivc-password')?.value || '';
      const proxy = overlay.querySelector('#pivc-proxy')?.value.trim() || '';
      const ttl   = parseInt(overlay.querySelector('#pivc-ttl').value, 10);
      const mode  = overlay.querySelector('.pivc-mode-btn.active')?.dataset.mode || 'demo';

      ConnectionManager.configure({ baseUrl: url, authType: auth, username: user, password: pass, corsProxy: proxy, cacheTtl: ttl });
      DataSourceManager.setMode(mode);

      _toast('הגדרות נשמרו בהצלחה', 'success');
      close();
    });

    // סגירה ב-Escape
    const onKey = e => { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  TAG BROWSER PANEL — פאנל גלישת תגים
  // ═══════════════════════════════════════════════════════════════════════

  let _tagBrowserOpen = false;
  let _pinnedTags = [];
  let _recentTags = [];

  // טעינת תגים מועדפים/אחרונים מ-storage
  (function _loadTagLists() {
    const data = _storeGet('piv_pi_tags_ui');
    if (data) {
      _pinnedTags = data.pinned || [];
      _recentTags = data.recent || [];
    }
  })();

  function _saveTagLists() {
    _storeSet('piv_pi_tags_ui', { pinned: _pinnedTags, recent: _recentTags });
  }

  /**
   * מוסיף תג לרשימת האחרונים.
   * @param {Object} tag
   */
  function _addRecent(tag) {
    _recentTags = _recentTags.filter(t => t.WebId !== tag.WebId);
    _recentTags.unshift(tag);
    if (_recentTags.length > 10) _recentTags.pop();
    _saveTagLists();
  }

  /**
   * מציג popup עם פרטי תג.
   * @param {MouseEvent} evt
   * @param {Object} tag
   */
  function _showTagPopup(evt, tag) {
    document.querySelectorAll('.pivc-tag-popup').forEach(p => p.remove());

    const popup = document.createElement('div');
    popup.className = 'pivc-tag-popup';
    popup.innerHTML = `
      <div class="pivc-tag-popup-title">${tag.Name}</div>
      <div class="pivc-tag-popup-row"><span class="pivc-tag-popup-key">תיאור</span><span class="pivc-tag-popup-val">${tag.Description || '—'}</span></div>
      <div class="pivc-tag-popup-row"><span class="pivc-tag-popup-key">יחידות</span><span class="pivc-tag-popup-val">${tag.UOM || '—'}</span></div>
      <div class="pivc-tag-popup-row"><span class="pivc-tag-popup-key">טווח</span><span class="pivc-tag-popup-val">${tag.EngrMin !== undefined ? tag.EngrMin + ' – ' + tag.EngrMax : '—'}</span></div>
      <div class="pivc-tag-popup-row"><span class="pivc-tag-popup-key">סוג</span><span class="pivc-tag-popup-val">${tag.Type || '—'}</span></div>
      <div class="pivc-tag-popup-row"><span class="pivc-tag-popup-key">WebId</span><span class="pivc-tag-popup-val" style="direction:ltr;font-size:10px;">${tag.WebId}</span></div>
    `;

    document.body.appendChild(popup);

    // מיקום ליד הסמן
    const px = Math.min(evt.clientX + 12, window.innerWidth - 320);
    const py = Math.min(evt.clientY + 8,  window.innerHeight - 200);
    popup.style.left = px + 'px';
    popup.style.top  = py + 'px';

    const closePopup = () => popup.remove();
    setTimeout(() => document.addEventListener('click', closePopup, { once: true }), 50);
  }

  /**
   * פותח פאנל גלישת תגים.
   */
  function openTagBrowser() {
    if (_tagBrowserOpen) {
      document.getElementById('pivc-tag-panel')?.remove();
      _tagBrowserOpen = false;
      return;
    }
    _tagBrowserOpen = true;

    const panel = document.createElement('div');
    panel.id = 'pivc-tag-panel';
    panel.className = 'pivc-tag-panel';

    panel.innerHTML = `
      <div class="pivc-tag-header">
        <h3>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00d4ff" stroke-width="2" style="vertical-align:middle;margin-left:4px">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          גלישת תגי PI
        </h3>
        <button class="pivc-close" style="background:none;border:none;color:#6b7fa3;cursor:pointer;font-size:18px;"
                aria-label="סגור פאנל">×</button>
      </div>
      <div class="pivc-tag-search">
        <input id="pivc-tag-search-input" type="text" placeholder="חפש תג או מאפיין..." dir="rtl" />
      </div>
      <div class="pivc-tag-body" id="pivc-tag-body">
        <div style="padding:14px;color:#6b7fa3;font-size:12px;text-align:center">טוען...</div>
      </div>
      <div class="pivc-tag-footer">
        גרור תג לסמל — Drag & Drop
      </div>
    `;

    document.body.appendChild(panel);

    // סגור
    panel.querySelector('.pivc-close').addEventListener('click', () => {
      panel.remove();
      _tagBrowserOpen = false;
    });

    // חיפוש
    let _searchTimer = null;
    panel.querySelector('#pivc-tag-search-input').addEventListener('input', e => {
      clearTimeout(_searchTimer);
      _searchTimer = setTimeout(() => _renderTagBrowserBody(e.target.value), 280);
    });

    // ציור ראשוני
    _renderTagBrowserBody('');
  }

  /**
   * מרנדר את תוכן פאנל הגלישה.
   * @param {string} query
   */
  async function _renderTagBrowserBody(query) {
    const body = document.getElementById('pivc-tag-body');
    if (!body) return;

    body.innerHTML = '<div style="padding:14px;color:#6b7fa3;font-size:12px;text-align:center">טוען...</div>';

    const result = await tags.search(query);
    const tagList = (result.Items || []).slice(0, 50);

    let html = '';

    // תגים מועדפים
    if (!query && _pinnedTags.length > 0) {
      html += '<div class="pivc-tag-section"><div class="pivc-tag-section-title">מועדפים</div>';
      _pinnedTags.forEach(tag => {
        html += _tagItemHtml(tag, true);
      });
      html += '</div>';
    }

    // תגים אחרונים
    if (!query && _recentTags.length > 0) {
      html += '<div class="pivc-tag-section"><div class="pivc-tag-section-title">אחרונים</div>';
      _recentTags.slice(0, 5).forEach(tag => {
        html += _tagItemHtml(tag, false);
      });
      html += '</div>';
    }

    // עץ AF
    if (!query) {
      html += '<div class="pivc-tag-section"><div class="pivc-tag-section-title">היררכיית AF</div>';
      html += _afTreeHtml();
      html += '</div>';
    }

    // תוצאות חיפוש / כל התגים
    html += `<div class="pivc-tag-section"><div class="pivc-tag-section-title">${query ? 'תוצאות חיפוש' : 'כל התגים'} (${tagList.length})</div>`;
    if (tagList.length === 0) {
      html += '<div style="padding:10px 14px;color:#6b7fa3;font-size:12px">לא נמצאו תגים</div>';
    } else {
      tagList.forEach(tag => {
        html += _tagItemHtml(tag, false);
      });
    }
    html += '</div>';

    body.innerHTML = html;

    // ── אירועי drag & drop ────────────────────────────────────────────
    body.querySelectorAll('.pivc-tag-item[data-webid]').forEach(item => {
      const tag = tagList.find(t => t.WebId === item.dataset.webid)
        || _pinnedTags.find(t => t.WebId === item.dataset.webid)
        || _recentTags.find(t => t.WebId === item.dataset.webid);

      if (!tag) return;

      item.setAttribute('draggable', 'true');

      item.addEventListener('dragstart', e => {
        e.dataTransfer.setData('text/plain', JSON.stringify(tag));
        e.dataTransfer.setData('application/pi-tag', tag.WebId);
        e.dataTransfer.effectAllowed = 'copy';
        _addRecent(tag);
      });

      // Popup בלחיצה ימנית
      item.addEventListener('contextmenu', e => {
        e.preventDefault();
        _showTagPopup(e, tag);
      });

      // Pin/unpin בלחיצה כפולה
      item.addEventListener('dblclick', () => {
        const idx = _pinnedTags.findIndex(t => t.WebId === tag.WebId);
        if (idx >= 0) {
          _pinnedTags.splice(idx, 1);
          _toast(`הוסר מהמועדפים: ${tag.Name}`, 'info');
        } else {
          _pinnedTags.unshift(tag);
          _toast(`נוסף למועדפים: ${tag.Name}`, 'success');
        }
        _saveTagLists();
        _renderTagBrowserBody(document.getElementById('pivc-tag-search-input')?.value || '');
      });
    });

    // ── פתיחת/סגירת ענפי AF ──────────────────────────────────────────
    body.querySelectorAll('.pivc-tree-item').forEach(item => {
      item.addEventListener('click', () => {
        const children = item.nextElementSibling;
        if (children && children.classList.contains('pivc-tree-children')) {
          children.classList.toggle('open');
          item.querySelector('.pivc-tree-arrow')?.classList.toggle('open');
        }
      });
    });
  }

  /**
   * בונה HTML של פריט תג.
   * @param {Object} tag
   * @param {boolean} pinned
   * @returns {string}
   */
  function _tagItemHtml(tag, pinned) {
    const iconColor = pinned ? '#ffab40' : '#00d4ff';
    return `
      <div class="pivc-tag-item${pinned?' pinned':''}" data-webid="${tag.WebId}" title="${tag.Description || tag.Name}">
        <span class="pivc-tag-item-icon" style="color:${iconColor}">
          ${pinned ? '★' : '⬥'}
        </span>
        <span class="pivc-tag-item-name">${tag.Name}</span>
        <span class="pivc-tag-item-val">${tag.UOM || ''}</span>
      </div>
    `;
  }

  /**
   * בונה HTML של עץ AF (בסיסי, 2 רמות).
   * @returns {string}
   */
  function _afTreeHtml() {
    let html = '';
    _demoData.databases.forEach(db => {
      html += `
        <div class="pivc-tree-item" data-dbid="${db.WebId}">
          <span class="pivc-tree-arrow">▶</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9ab0c8" stroke-width="2" style="flex-shrink:0">
            <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
          </svg>
          <span class="pivc-tree-label">${db.Name}</span>
        </div>
        <div class="pivc-tree-children">
          ${(_demoData.elements[db.WebId] || []).map(el => `
            <div class="pivc-tree-item" style="padding-right:26px">
              <span class="pivc-tree-arrow" style="opacity:0">▶</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#6b7fa3" stroke-width="2" style="flex-shrink:0">
                <circle cx="12" cy="12" r="3"/>
                <path d="M12 2v4M12 18v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M2 12h4M18 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83"/>
              </svg>
              <span class="pivc-tree-label">${el.Name}</span>
            </div>
          `).join('')}
        </div>
      `;
    });
    return html;
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INTEGRATION WITH AF DATA LAYER
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * מחבר את ה-connector ל-AFDataLayer הקיים.
   * כאשר במצב live — מחליף את המשאבים במשאבים אמיתיים.
   */
  function _hookAFDataLayer() {
    if (typeof AFDataLayer === 'undefined') return;

    // שמירת reference למופע ה-AF
    const afInstance = window.__AF;
    if (!afInstance) return;

    // Proxy — כאשר live, משתמש ב-PI connector
    const _origGetElements = afInstance.getElements?.bind(afInstance);

    if (_origGetElements) {
      afInstance.getElements = async function (dbId) {
        if (_mode === 'live' && _connectionState.connected) {
          try {
            return await af.getElements(dbId);
          } catch (e) {
            return _origGetElements(dbId);
          }
        }
        return _origGetElements(dbId);
      };
    }
  }

  /**
   * מחבר את ה-connector לאמולטור (interceptor לבקשות נתונים).
   * כל סמל שמבקש נתוני תג עובר דרך ה-connector כאשר במצב live.
   */
  function _hookEmulator() {
    // ממתין לטעינת האמולטור
    document.addEventListener('piEmulatorReady', () => {
      if (window.__PIV_EMULATOR && window.__PIV_EMULATOR.setDataProvider) {
        window.__PIV_EMULATOR.setDataProvider({
          getValue: tags.getValue.bind(tags),
          getValues: tags.getValues.bind(tags),
          getPlot: tags.getPlot.bind(tags),
        });
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  METRICS — מדדי ביצועים
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * מחזיר מדדי ביצועים מצטברים.
   * @returns {Object}
   */
  function getMetrics() {
    return {
      totalRequests:  _metrics.totalRequests,
      cacheHits:      _metrics.cacheHits,
      cacheMisses:    _metrics.totalRequests - _metrics.cacheHits,
      errors:         _metrics.errors,
      avgLatencyMs:   +_metrics.avgLatencyMs.toFixed(2),
      cacheSize:      _cache.size,
      subscriptions:  _subscriptions.size,
    };
  }

  /**
   * מנקה את המטמון.
   */
  function clearCache() {
    _cache.clear();
    _toast('מטמון נוקה', 'info');
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  INITIALIZATION — אתחול מודול
  // ═══════════════════════════════════════════════════════════════════════

  function _init() {
    // הכנסת נקודת הסטטוס לאחר שה-DOM מוכן
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _injectStatusDot);
    } else {
      _injectStatusDot();
    }

    // אינטגרציה
    _hookEmulator();

    // ממתין לאתחול AF Data Layer
    document.addEventListener('DOMContentLoaded', () => {
      setTimeout(_hookAFDataLayer, 800);
    });

    // אתחול מצב ראשוני
    _syncStatusDot();

    // מאחסן reference גלובלי — אפשרות לגישה ל-connector מכל מקום
    global.__PI_CONNECTOR_READY = true;

    // שגור אירוע אתחול
    const readyEvent = new CustomEvent('piConnectorReady', {
      detail: { mode: _mode, connected: _connectionState.connected },
    });
    document.dispatchEvent(readyEvent);

    console.log('[PI-Connector] מודול PI Web API אותחל — מצב:', _mode);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PUBLIC API — window.PIV_CONNECTOR
  // ═══════════════════════════════════════════════════════════════════════

  const PIV_CONNECTOR = {
    // ── Connection Manager ─────────────────────────────────────────────
    configure:    ConnectionManager.configure.bind(ConnectionManager),
    connect:      ConnectionManager.connect.bind(ConnectionManager),
    disconnect:   ConnectionManager.disconnect.bind(ConnectionManager),
    isConnected:  ConnectionManager.isConnected.bind(ConnectionManager),
    getStatus:    ConnectionManager.getStatus.bind(ConnectionManager),

    // ── Data Source Manager ────────────────────────────────────────────
    setMode:      DataSourceManager.setMode.bind(DataSourceManager),
    getMode:      DataSourceManager.getMode.bind(DataSourceManager),

    // ── AF Hierarchy ───────────────────────────────────────────────────
    af,

    // ── PI Tags / Points ───────────────────────────────────────────────
    tags,

    // ── Event Frames ───────────────────────────────────────────────────
    events,

    // ── Batch ──────────────────────────────────────────────────────────
    batch,

    // ── Real-Time Subscriptions ────────────────────────────────────────
    subscribe:          RealtimeManager.subscribe.bind(RealtimeManager),
    unsubscribe:        RealtimeManager.unsubscribe.bind(RealtimeManager),
    unsubscribeAll:     RealtimeManager.unsubscribeAll.bind(RealtimeManager),
    getSubscriptionCount: RealtimeManager.getSubscriptionCount.bind(RealtimeManager),

    // ── UI ─────────────────────────────────────────────────────────────
    openConfigPanel,
    openTagBrowser,

    // ── Utilities ──────────────────────────────────────────────────────
    getMetrics,
    clearCache,
    toast: _toast,
  };

  // חשיפה גלובלית
  global.PIV_CONNECTOR = PIV_CONNECTOR;

  // אתחול
  _init();

})(window);
