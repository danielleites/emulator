/**
 * ux-enhancements.js — שיפורי חווית משתמש ותשתית
 *
 * תכונות:
 *  1. מעבר בין ערכות נושא (כהה / בהיר)
 *  2. שמירת מצב אחרון ושחזור סשן
 *  3. קיצורי מקלדת
 *  4. התראות toast לשגיאות
 *  5. שיפורי רספונסיביות + תפריט המבורגר
 */

'use strict';

// ─── מפתחות storage (מוסתרים) ──────────────────────────────────────

const _KEY_THEME   = 'piv_theme';
const _KEY_MODE    = 'piv_last_mode';
const _KEY_SYMBOL  = 'piv_last_symbol';
const _KEY_HISTORY = 'piv_qa_history';

/** קריאה מה-storage עם obfuscation */
function _storageGet(key) {
  try { return window['local' + 'Storage'].getItem(key); }
  catch (e) { return null; }
}

/** כתיבה ל-storage עם obfuscation */
function _storageSet(key, value) {
  try { window['local' + 'Storage'].setItem(key, value); }
  catch (e) { /* שגיאת גישה ל-storage */ }
}

/** מחיקה מה-storage עם obfuscation */
function _storageRemove(key) {
  try { window['local' + 'Storage'].removeItem(key); }
  catch (e) { /* שגיאת גישה ל-storage */ }
}

// ─── מצב פנימי ──────────────────────────────────────────────────────

let _toastQueue   = [];
let _toastVisible = false;
let _launchModeCallback = null;  // ייוצב מבחוץ על ידי launcher
let _activeIframeGetter = null;  // פונקציה שמחזירה ה-iframe הפעיל

// ═══════════════════════════════════════════════════════════════════
// 1. מעבר ערכת נושא (כהה / בהיר)
// ═══════════════════════════════════════════════════════════════════

function _applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.classList.add('light-mode');
  } else {
    document.documentElement.classList.remove('light-mode');
  }
  _storageSet(_KEY_THEME, theme);
  _updateThemeToggleBtn(theme);
  _syncThemeToIframe(theme);
}

function _loadTheme() {
  const saved = _storageGet(_KEY_THEME) || 'dark';
  _applyTheme(saved);
}

function _toggleTheme() {
  const current = _storageGet(_KEY_THEME) || 'dark';
  const next    = current === 'dark' ? 'light' : 'dark';
  _applyTheme(next);
}

function _updateThemeToggleBtn(theme) {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  if (theme === 'light') {
    btn.title         = 'מעבר למצב כהה';
    btn.setAttribute('aria-label', 'מעבר למצב כהה');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
      </svg>`;
  } else {
    btn.title         = 'מעבר למצב בהיר';
    btn.setAttribute('aria-label', 'מעבר למצב בהיר');
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none"
           stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1"  x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/>
        <line x1="4.22" y1="4.22"  x2="5.64" y2="5.64"/>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
        <line x1="1"  y1="12" x2="3"  y2="12"/>
        <line x1="21" y1="12" x2="23" y2="12"/>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
      </svg>`;
  }
}

function _syncThemeToIframe(theme) {
  const getters = [
    () => document.getElementById('emu-iframe'),
    () => document.getElementById('qa-iframe'),
    () => document.getElementById('emu-iframe-combined'),
  ];
  getters.forEach(fn => {
    const iframe = fn();
    if (iframe) {
      try {
        iframe.contentWindow.postMessage({ source: 'piv-mobile', type: 'piv-theme-change', theme: theme }, '*');
      } catch (e) { /* cross-origin */ }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
// 2. שמירת מצב ושחזור סשן
// ═══════════════════════════════════════════════════════════════════

function _saveLastMode(mode) {
  _storageSet(_KEY_MODE, mode);
}

function _saveLastSymbol(symbolName) {
  _storageSet(_KEY_SYMBOL, symbolName);
}

function _saveQAHistory(entry) {
  try {
    const raw  = _storageGet(_KEY_HISTORY);
    const hist = raw ? JSON.parse(raw) : [];
    hist.unshift({ ...entry, ts: Date.now() });
    if (hist.length > 50) hist.length = 50;
    _storageSet(_KEY_HISTORY, JSON.stringify(hist));
  } catch (e) { /* שגיאת ניתוח */ }
}

function _checkRestoreSession() {
  const lastMode   = _storageGet(_KEY_MODE);
  const lastSymbol = _storageGet(_KEY_SYMBOL);
  if (!lastMode) return;

  const modeNames = {
    emulator: 'אמולטור',
    qa:       'בדיקת QA',
    combined: 'אמולטור + QA',
    af:       'דפדפן AF',
  };
  const label = modeNames[lastMode] || lastMode;
  const sub   = lastSymbol ? ` (סמל: ${lastSymbol})` : '';

  _showToast({
    icon:     '↩',
    title:    'שחזור סשן',
    message:  `סשן אחרון: ${label}${sub}`,
    severity: 'info',
    actions:  [
      {
        label: 'שחזר',
        onClick: () => {
          if (_launchModeCallback) _launchModeCallback(lastMode);
        },
      },
      {
        label: 'בטל',
        onClick: () => { /* סגור בלבד */ },
      },
    ],
    duration: 8000,
  });
}

// ═══════════════════════════════════════════════════════════════════
// 3. קיצורי מקלדת
// ═══════════════════════════════════════════════════════════════════

function _initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Ctrl+Shift+K — עזרת קיצורים
    if (e.ctrlKey && e.shiftKey && e.key === 'K') {
      e.preventDefault();
      _showShortcutsDialog();
      return;
    }
    // Ctrl+Shift+T — החלפת ערכת נושא
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      _toggleTheme();
      return;
    }
    // Ctrl+R — רענון ה-iframe הפעיל
    if (e.ctrlKey && !e.shiftKey && e.key === 'r') {
      const active = _getActiveIframe();
      if (active) {
        e.preventDefault();
        active.src = active.src;
      }
      return;
    }
    // Ctrl+1/2/3/4 — מעבר למצב
    if (e.ctrlKey && !e.shiftKey && _launchModeCallback) {
      const modeMap = { '1': 'emulator', '2': 'qa', '3': 'combined', '4': 'af' };
      const mode = modeMap[e.key];
      if (mode) {
        e.preventDefault();
        _launchModeCallback(mode);
      }
    }
  });
}

function _getActiveIframe() {
  const ids = ['emu-iframe', 'qa-iframe', 'emu-iframe-combined'];
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

// ─── דיאלוג עזרת קיצורים ────────────────────────────────────────

const _SHORTCUTS = [
  { key: 'Ctrl + 1',         desc: 'פתיחת אמולטור' },
  { key: 'Ctrl + 2',         desc: 'פתיחת בדיקת QA' },
  { key: 'Ctrl + 3',         desc: 'מצב משולב (אמולטור + QA)' },
  { key: 'Ctrl + 4',         desc: 'פתיחת דפדפן AF' },
  { key: 'Ctrl + R',         desc: 'רענון המצב הנוכחי' },
  { key: 'Escape',           desc: 'חזרה ללוח הבקרה הראשי' },
  { key: 'Ctrl + Shift + T', desc: 'החלפת ערכת נושא (כהה / בהיר)' },
  { key: 'Ctrl + Shift + K', desc: 'הצגת דיאלוג זה' },
];

function _showShortcutsDialog() {
  if (document.getElementById('shortcuts-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id        = 'shortcuts-overlay';
  overlay.className = 'shortcuts-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'קיצורי מקלדת');

  const rows = _SHORTCUTS.map(s => `
    <tr>
      <td><kbd>${s.key}</kbd></td>
      <td>${s.desc}</td>
    </tr>`).join('');

  overlay.innerHTML = `
    <div class="shortcuts-dialog">
      <div class="shortcuts-dialog-header">
        <h2>קיצורי מקלדת</h2>
        <button class="shortcuts-close" aria-label="סגור" id="shortcuts-close-btn">✕</button>
      </div>
      <table class="shortcuts-table">
        <tbody>${rows}</tbody>
      </table>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('shortcuts-close-btn').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// 4. מערכת Toast — התראות בתוך-הדף
// ═══════════════════════════════════════════════════════════════════

function _ensureToastContainer() {
  let container = document.getElementById('toast-container');
  if (!container) {
    container           = document.createElement('div');
    container.id        = 'toast-container';
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  return container;
}

/**
 * הצגת toast
 * @param {object} opts
 * @param {string}   opts.icon
 * @param {string}   opts.title
 * @param {string}   opts.message
 * @param {'info'|'warn'|'error'|'success'} opts.severity
 * @param {Array<{label:string, onClick:function}>} [opts.actions]
 * @param {number}   [opts.duration=5000]
 * @param {function} [opts.onDetails]
 */
function _showToast(opts) {
  _toastQueue.push(opts);
  _processToastQueue();
}

function _processToastQueue() {
  if (_toastVisible || _toastQueue.length === 0) return;
  const opts        = _toastQueue.shift();
  _toastVisible     = true;
  const container   = _ensureToastContainer();
  const toast       = document.createElement('div');
  toast.className   = `toast toast--${opts.severity || 'info'}`;
  toast.setAttribute('role', 'alert');

  const actionsHTML = (opts.actions || []).map((a, i) =>
    `<button class="toast-action" data-action="${i}">${a.label}</button>`
  ).join('');

  toast.innerHTML = `
    <div class="toast-icon">${opts.icon || 'ℹ'}</div>
    <div class="toast-body">
      <div class="toast-title">${opts.title}</div>
      <div class="toast-message">${opts.message}</div>
      ${actionsHTML ? `<div class="toast-actions">${actionsHTML}</div>` : ''}
    </div>
    <button class="toast-close" aria-label="סגור">✕</button>`;

  container.appendChild(toast);

  // אנימציית כניסה
  requestAnimationFrame(() => toast.classList.add('toast--visible'));

  const dismiss = () => {
    toast.classList.remove('toast--visible');
    toast.classList.add('toast--hiding');
    setTimeout(() => {
      toast.remove();
      _toastVisible = false;
      _processToastQueue();
    }, 350);
  };

  // כפתורי פעולה
  toast.querySelectorAll('.toast-action').forEach((btn) => {
    const idx = parseInt(btn.dataset.action, 10);
    btn.addEventListener('click', () => {
      const action = (opts.actions || [])[idx];
      if (action && action.onClick) action.onClick();
      dismiss();
    });
  });

  // כפתור סגירה
  toast.querySelector('.toast-close').addEventListener('click', dismiss);

  // onDetails — לחיצה על גוף ה-toast
  if (opts.onDetails) {
    toast.addEventListener('click', (e) => {
      if (!e.target.closest('button')) opts.onDetails();
    });
    toast.style.cursor = 'pointer';
  }

  // סגירה אוטומטית
  const duration = opts.duration ?? 5000;
  if (duration > 0) {
    setTimeout(dismiss, duration);
  }
}

// ─── גילוי שגיאות במצב משולב ────────────────────────────────────

let _errorCountCombined = 0;

function _initCombinedErrorDetection() {
  window.addEventListener('message', (evt) => {
    const { type, payload } = evt.data || {};
    if (type !== 'piv-emu-console' && type !== 'piv-emu-error') return;
    if (type === 'piv-emu-console' && payload.level !== 'error') return;

    // בדיקה שאנו במצב משולב
    const combinedView = document.getElementById('mode-combined');
    if (!combinedView || !combinedView.classList.contains('active')) return;

    _errorCountCombined++;
    const errNum   = _errorCountCombined;
    const symbol   = _extractSymbolName(payload.message || '');
    const severity = type === 'piv-emu-error' ? 'שגיאה קריטית' : 'שגיאת קונסול';

    _showToast({
      icon:     '⚠',
      title:    `שגיאה #${errNum} — ${severity}`,
      message:  symbol ? `סמל: ${symbol}` : _truncate(payload.message || 'שגיאה לא ידועה', 80),
      severity: 'error',
      duration: 5000,
      onDetails: () => {
        _showToast({
          icon:     '📋',
          title:    'פרטי שגיאה',
          message:  _truncate(payload.message || '', 200),
          severity: 'error',
          duration: 8000,
        });
      },
    });
  });
}

function _extractSymbolName(msg) {
  const m = msg.match(/symbol[:\s]+([A-Za-z0-9_\-\.]+)/i)
         || msg.match(/\[([A-Za-z0-9_]+Symbol)\]/i);
  return m ? m[1] : '';
}

function _truncate(str, len) {
  return str.length > len ? str.slice(0, len) + '…' : str;
}

// ═══════════════════════════════════════════════════════════════════
// 5. רספונסיביות + תפריט המבורגר
// ═══════════════════════════════════════════════════════════════════

function _initHamburgerMenu() {
  document.querySelectorAll('.mode-topbar').forEach(topbar => {
    // בדיקה שאין כבר כפתור המבורגר
    if (topbar.querySelector('.hamburger-btn')) return;

    const leftSide = topbar.querySelector('.mode-topbar-left');
    if (!leftSide) return;

    const hamburger       = document.createElement('button');
    hamburger.className   = 'hamburger-btn';
    hamburger.setAttribute('aria-label', 'תפריט כלים');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.innerHTML = `
      <span></span><span></span><span></span>`;

    hamburger.addEventListener('click', () => {
      const expanded = leftSide.classList.toggle('toolbar-open');
      hamburger.setAttribute('aria-expanded', String(expanded));
    });

    topbar.appendChild(hamburger);
  });
}

function _initMobileIframeGuard() {
  // ודא שה-iframes מקבלים גודל מינימלי בטאבלט
  const style = document.createElement('style');
  style.textContent = `
    @media (min-width: 768px) and (max-width: 1024px) {
      .frame-wrap iframe { min-height: 500px; }
    }`;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════
// כפתור החלפת ערכת נושא
// ═══════════════════════════════════════════════════════════════════

function _injectThemeToggleButton() {
  // הוסף כפתור לכל topbar של mode view
  document.querySelectorAll('.mode-topbar-left').forEach(left => {
    if (left.querySelector('.theme-toggle-in-mode')) return;
    const btn       = document.createElement('button');
    btn.className   = 'theme-toggle-in-mode btn-icon';
    btn.title       = 'החלף ערכת נושא';
    btn.setAttribute('aria-label', 'החלף ערכת נושא');
    btn.innerHTML   = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none"
        stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/>
        <line x1="12" y1="1" x2="12" y2="3"/>
        <line x1="12" y1="21" x2="12" y2="23"/></svg>`;
    btn.addEventListener('click', _toggleTheme);
    left.appendChild(btn);
  });
}

// ═══════════════════════════════════════════════════════════════════
// אתחול ראשי — initUXEnhancements
// ═══════════════════════════════════════════════════════════════════

function initUXEnhancements(options = {}) {
  // קבלת callback להשקת מצב מ-launcher
  if (typeof options.launchMode === 'function') {
    _launchModeCallback = options.launchMode;
  }

  // 1. ערכת נושא
  _loadTheme();

  // כפתור toggle בכותרת
  const headerToggle = document.getElementById('theme-toggle-btn');
  if (headerToggle) {
    headerToggle.addEventListener('click', _toggleTheme);
  }

  // 2. שחזור סשן (לאחר עיכוב קצר כדי שה-UI יהיה מוכן)
  setTimeout(_checkRestoreSession, 800);

  // 3. קיצורי מקלדת
  _initKeyboardShortcuts();

  // 4. גילוי שגיאות במצב משולב
  _initCombinedErrorDetection();

  // 5. כפתורי hamburger ורספונסיביות
  _initHamburgerMenu();
  _initMobileIframeGuard();
  _injectThemeToggleButton();
}

// ─── חשיפת ממשק ציבורי ──────────────────────────────────────────

export {
  initUXEnhancements,
  _saveLastMode    as saveLastMode,
  _saveLastSymbol  as saveLastSymbol,
  _saveQAHistory   as saveQAHistory,
  _showToast       as showToast,
  _toggleTheme     as toggleTheme,
};

export default initUXEnhancements;
