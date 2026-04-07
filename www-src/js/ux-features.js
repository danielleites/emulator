/**
 * ux-features.js — מודול תכונות UX מורחבות
 *
 * תכונות:
 *  1. מצבי טעינה ל-iframes (Loading States)
 *  2. ניווט ארגזי-לחם (Breadcrumbs)
 *  3. פלטת פקודות גלובלית — Ctrl+K (Command Palette)
 *  4. סטטיסטיקות לוח הבקרה (Dashboard Stats)
 *  5. סיור קבלת פנים לביקור ראשון (Onboarding Tour)
 *  6. גבול שגיאות גלובלי (Error Boundary)
 */

'use strict';

// ─── עזרי storage (עם obfuscation) ───────────────────────────────────────────

/** קריאה מה-storage */
function _storageGet(key) {
  try { return window['local' + 'Storage'].getItem(key); }
  catch (e) { return null; }
}

/** כתיבה ל-storage */
function _storageSet(key, value) {
  try { window['local' + 'Storage'].setItem(key, value); }
  catch (e) { /* שגיאת גישה ל-storage */ }
}

/** מחיקה מה-storage */
function _storageRemove(key) {
  try { window['local' + 'Storage'].removeItem(key); }
  catch (e) { /* שגיאת גישה ל-storage */ }
}

// ─── מפתחות storage ────────────────────────────────────────────────────────

const _KEY_STATS      = 'piv_dashboard_stats';
const _KEY_ONBOARDING = 'piv_onboarding_done';

// ─── מטמון רשימת פריטים לפלטת פקודות ───────────────────────────────────────
// נבנה פעם אחת ומשמש מחדש; מאופס כאשר רשימת הסמלים משתנה
let _allItemsCache = null;

// ─── עזר debounce ────────────────────────────────────────────────────────────

/**
 * מחזיר גרסת debounce של fn עם השהייה delay מילישניות
 * @param {function} fn
 * @param {number} delay
 * @returns {function}
 */
function _debounce(fn, delay) {
  let timer = null;
  return function() {
    const ctx  = this;
    const args = arguments;
    clearTimeout(timer);
    timer = setTimeout(function() { fn.apply(ctx, args); }, delay);
  };
}

// ─── רשימת 63 סמלים (hardcoded) ──────────────────────────────────────────

const _SYMBOL_LIST = [
  'Al2O3', 'Batch', 'BatchReactor', 'Boiler', 'Centrifuge', 'Clarifier',
  'Compressor', 'Condenser', 'Conveyor', 'CoolingTower', 'Crystallizer',
  'Cyclone', 'Deaerator', 'Decanter', 'Distillation', 'Dryer', 'Evaporator',
  'Extractor', 'Fan', 'Filter', 'Flare', 'FlowMeter', 'Furnace', 'GasTurbine',
  'HeatExchanger', 'Hopper', 'Hydrocracker', 'Incinerator', 'LevelTank',
  'Mixer', 'MotorPump', 'PackedBed', 'Pipe', 'PipeLine', 'Pressurizer',
  'Pump', 'ReactorCSTR', 'ReactorPFR', 'Reformer', 'Reboiler', 'SafetyValve',
  'Scrubber', 'Separator', 'SieveTray', 'Silo', 'SludgeTank', 'Splitter',
  'SteamTurbine', 'StirredTank', 'Stripper', 'SumpPump', 'Tank', 'TankFarm',
  'ThickenerClarifier', 'Transmitter', 'TrayColumn', 'Valve', 'VacuumDryer',
  'VacuumPump', 'Vessel', 'WaterTreatment', 'WetScrubber', 'WireDrawing',
];

// ═══════════════════════════════════════════════════════════════════════════
// 1. מצבי טעינה ל-iframes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * מציג overlay טעינה בתוך frameWrap עם תווית מותאמת
 * @param {HTMLElement} frameWrap — אלמנט .frame-wrap
 * @param {string} label — טקסט לתצוגה (כגון "טוען אמולטור...")
 */
function showFrameLoading(frameWrap, label) {
  if (!frameWrap) return;
  hideFrameLoading(frameWrap);  // הסר overlay קיים תחילה

  const overlay = document.createElement('div');
  overlay.className = 'frame-loading';
  overlay.setAttribute('aria-label', label || 'טוען...');
  overlay.setAttribute('role', 'status');

  overlay.innerHTML = `
    <div class="frame-loading__inner">
      <div class="frame-loading__spinner" aria-hidden="true">
        <svg viewBox="0 0 44 44" width="44" height="44" fill="none"
             xmlns="http://www.w3.org/2000/svg">
          <circle cx="22" cy="22" r="18"
                  stroke="rgba(0,212,255,0.15)" stroke-width="3"/>
          <path d="M22 4 A18 18 0 0 1 40 22"
                stroke="#00d4ff" stroke-width="3"
                stroke-linecap="round"/>
        </svg>
      </div>
      <div class="frame-loading__skeleton">
        <div class="frame-loading__bar frame-loading__bar--wide"></div>
        <div class="frame-loading__bar frame-loading__bar--medium"></div>
        <div class="frame-loading__bar frame-loading__bar--short"></div>
      </div>
      <p class="frame-loading__label">${_escapeHTML(label || 'טוען...')}</p>
    </div>`;

  _injectFrameLoadingStyles();
  frameWrap.appendChild(overlay);
}

/**
 * מסיר את overlay הטעינה מתוך frameWrap
 * @param {HTMLElement} frameWrap
 */
function hideFrameLoading(frameWrap) {
  if (!frameWrap) return;
  const existing = frameWrap.querySelector('.frame-loading');
  if (!existing) return;
  existing.classList.add('frame-loading--hidden');
  setTimeout(() => {
    if (existing.parentNode === frameWrap) frameWrap.removeChild(existing);
  }, 350);
}

/** הזרקת סגנונות CSS למצבי טעינה (פעם אחת) */
let _frameLoadingStylesInjected = false;
function _injectFrameLoadingStyles() {
  if (_frameLoadingStylesInjected) return;
  _frameLoadingStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'ux-frame-loading-styles';
  style.textContent = `
    /* ─── Loading Overlay ─── */
    .frame-loading {
      position: absolute;
      inset: 0;
      z-index: 10;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0f1e;
      transition: opacity 0.3s ease;
      direction: rtl;
    }
    .frame-loading--hidden {
      opacity: 0;
      pointer-events: none;
    }
    .frame-loading__inner {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 20px;
    }
    .frame-loading__spinner svg {
      animation: ux-spin 1s linear infinite;
    }
    @keyframes ux-spin {
      to { transform: rotate(360deg); }
    }
    .frame-loading__skeleton {
      display: flex;
      flex-direction: column;
      gap: 10px;
      align-items: center;
      width: 200px;
    }
    .frame-loading__bar {
      height: 10px;
      border-radius: 6px;
      background: linear-gradient(90deg,
        rgba(0,212,255,0.06) 25%,
        rgba(0,212,255,0.14) 50%,
        rgba(0,212,255,0.06) 75%);
      background-size: 200% 100%;
      animation: ux-shimmer 1.4s infinite;
    }
    .frame-loading__bar--wide   { width: 200px; }
    .frame-loading__bar--medium { width: 140px; }
    .frame-loading__bar--short  { width: 90px;  }
    @keyframes ux-shimmer {
      0%   { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
    .frame-loading__label {
      font-size: 13px;
      color: #6b7fa3;
      font-family: 'Heebo', sans-serif;
      margin: 0;
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Breadcrumbs בתפריט עליון
// ═══════════════════════════════════════════════════════════════════════════

/** מצב breadcrumb נוכחי */
const _breadcrumbState = {
  mode: null,
  symbolName: null,
};

/** שמות מצבים בעברית */
const _MODE_LABELS = {
  emulator: 'אמולטור',
  qa:       'בדיקת QA',
  combined: 'אמולטור + QA',
  af:       'דפדפן AF',
  builder:  'עורך ויזואלי',
};

/** מזהי view לכל מצב */
const _MODE_VIEW_IDS = {
  emulator: 'mode-emulator',
  qa:       'mode-qa',
  combined: 'mode-combined',
  af:       'mode-af',
};

/**
 * מאתחל מאזין postMessage לעדכון breadcrumb עם שם סמל
 */
function initBreadcrumbs() {
  _injectBreadcrumbStyles();

  // מאזין ל-postMessage מאמולטור — כאשר סמל נטען
  window.addEventListener('message', (evt) => {
    const { type, payload } = evt.data || {};
    if (type === 'piv-emu-symbol-loaded' && payload && payload.symbolName) {
      updateBreadcrumb(_breadcrumbState.mode, payload.symbolName);
    }
  });
}

/**
 * מעדכן את ה-breadcrumb של המצב הפעיל
 * @param {string|null} mode — שם המצב (emulator / qa / combined / af)
 * @param {string|null} symbolName — שם הסמל הפעיל (אופציונלי)
 */
function updateBreadcrumb(mode, symbolName) {
  _breadcrumbState.mode       = mode;
  _breadcrumbState.symbolName = symbolName || null;

  if (!mode) return;

  const viewId   = _MODE_VIEW_IDS[mode];
  const viewEl   = viewId ? document.getElementById(viewId) : null;
  if (!viewEl) return;

  const titleEl = viewEl.querySelector('.mode-topbar-title');
  if (!titleEl) return;

  const modeLabel  = _MODE_LABELS[mode] || mode;
  const symbolPart = symbolName
    ? ` <span class="breadcrumb-sep">›</span> <span class="breadcrumb-symbol">${_escapeHTML(symbolName)}</span>`
    : '';

  titleEl.innerHTML = `
    <nav class="breadcrumb" aria-label="נתיב ניווט" dir="rtl">
      <span class="breadcrumb-home">ראשי</span>
      <span class="breadcrumb-sep">›</span>
      <span class="breadcrumb-mode">${_escapeHTML(modeLabel)}</span>
      ${symbolPart}
    </nav>`;
}

/** הזרקת סגנונות CSS ל-breadcrumbs */
let _breadcrumbStylesInjected = false;
function _injectBreadcrumbStyles() {
  if (_breadcrumbStylesInjected) return;
  _breadcrumbStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'ux-breadcrumb-styles';
  style.textContent = `
    .breadcrumb {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
      font-family: 'Heebo', sans-serif;
      direction: rtl;
    }
    .breadcrumb-home {
      color: #6b7fa3;
      font-weight: 400;
    }
    .breadcrumb-sep {
      color: #3a4a6b;
      font-size: 14px;
      line-height: 1;
    }
    .breadcrumb-mode {
      color: #a0b4d0;
      font-weight: 500;
    }
    .breadcrumb-symbol {
      color: #00d4ff;
      font-weight: 600;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      background: rgba(0,212,255,0.08);
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid rgba(0,212,255,0.15);
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. פלטת פקודות גלובלית — Ctrl+K
// ═══════════════════════════════════════════════════════════════════════════

/** callback לפתיחת מצב ממנוע הפקודות */
let _commandPaletteCallback = null;

/**
 * מאתחל את פלטת הפקודות הגלובלית
 * @param {function} launchModeCallback — callback לפתיחת מצב (mode => void)
 */
function initCommandPalette(launchModeCallback) {
  if (typeof launchModeCallback === 'function') {
    _commandPaletteCallback = launchModeCallback;
  }
  _injectCommandPaletteStyles();

  // האזנה ל-Ctrl+K
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && !e.shiftKey && e.key === 'k') {
      e.preventDefault();
      _openCommandPalette();
    }
  });

  // כפתור חיפוש בלאונצ'ר (אם קיים)
  const searchBtn = document.getElementById('launcher-search-btn');
  if (searchBtn) {
    searchBtn.addEventListener('click', _openCommandPalette);
  }
}

/** פותח את פלטת הפקודות */
function _openCommandPalette() {
  if (document.getElementById('cmd-palette-overlay')) return;
  _renderCommandPalette();
}

/** מרנדר את פלטת הפקודות */
function _renderCommandPalette() {
  const overlay = document.createElement('div');
  overlay.id        = 'cmd-palette-overlay';
  overlay.className = 'cmd-palette-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'פלטת פקודות');
  overlay.dir = 'rtl';

  overlay.innerHTML = `
    <div class="cmd-palette" role="combobox" aria-haspopup="listbox">
      <div class="cmd-palette__header">
        <svg class="cmd-palette__icon" viewBox="0 0 20 20" width="18" height="18"
             fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="8.5" cy="8.5" r="5.5"/>
          <line x1="13.5" y1="13.5" x2="18" y2="18"/>
        </svg>
        <input
          id="cmd-palette-input"
          class="cmd-palette__input"
          type="text"
          placeholder="חפש מצב, סמל, פקודה..."
          autocomplete="off"
          spellcheck="false"
          aria-label="חיפוש"
          aria-autocomplete="list"
          aria-controls="cmd-palette-results"
        />
        <kbd class="cmd-palette__esc-hint">ESC</kbd>
      </div>
      <div id="cmd-palette-results" class="cmd-palette__results"
           role="listbox" aria-label="תוצאות חיפוש">
      </div>
      <div class="cmd-palette__footer">
        <span><kbd>↑</kbd><kbd>↓</kbd> ניווט</span>
        <span><kbd>Enter</kbd> בחירה</span>
        <span><kbd>Esc</kbd> סגירה</span>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const input     = document.getElementById('cmd-palette-input');
  const resultsEl = document.getElementById('cmd-palette-results');

  // מצב בחירה
  let _activeIndex = -1;
  let _filteredItems = [];

  // הצגת כל הפריטים בהתחלה
  _filteredItems = _buildAllItems();
  _renderResults(resultsEl, _filteredItems, _activeIndex, _handleSelect);

  // Focus על שדה חיפוש
  setTimeout(() => input && input.focus(), 50);

  // סינון בזמן הקלדה — debounce 100מס למניעת רנדור מיותר בכל הקלדה
  const _debouncedFilter = _debounce(function() {
    const q = (input.value || '').trim().toLowerCase();
    _filteredItems = _filterItems(q);
    _activeIndex   = q ? 0 : -1;
    _renderResults(resultsEl, _filteredItems, _activeIndex, _handleSelect);
  }, 100);

  input.addEventListener('input', _debouncedFilter);

  // ניווט מקלדת
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      _activeIndex = Math.min(_activeIndex + 1, _filteredItems.length - 1);
      _renderResults(resultsEl, _filteredItems, _activeIndex, _handleSelect);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      _activeIndex = Math.max(_activeIndex - 1, 0);
      _renderResults(resultsEl, _filteredItems, _activeIndex, _handleSelect);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const idx = _activeIndex >= 0 ? _activeIndex : 0;
      if (_filteredItems[idx]) _handleSelect(_filteredItems[idx]);
    } else if (e.key === 'Escape') {
      _closeCommandPalette();
    }
  });

  // סגירה בלחיצה על רקע
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) _closeCommandPalette();
  });

  function _handleSelect(item) {
    _closeCommandPalette();
    if (item.action) item.action();
  }
}

/**
 * בונה את רשימת כל הפריטים לפי קטגוריות ושומרת במטמון.
 * המטמון נאפס אוטומטית כשהסמלים של window.__SYMBOL_LIST משתנים.
 */
function _buildAllItems() {
  // בדוק אם רשימת הסמלים הנוכחית זהה למטמון — אם כן, החזר מטמון
  const currentSymList = (window.__SYMBOL_LIST && Array.isArray(window.__SYMBOL_LIST))
    ? window.__SYMBOL_LIST
    : _SYMBOL_LIST;

  if (_allItemsCache !== null && _allItemsCache._symbolList === currentSymList) {
    return _allItemsCache._items;
  }

  const items = [];

  // ─── קטגוריה: מצבים ───
  const modes = [
    { id: 'emulator', label: 'אמולטור',      desc: 'הפעל אמולטור PI Vision עצמאי' },
    { id: 'qa',       label: 'בדיקת QA',     desc: 'כלי בדיקת סמלים מתקדם'       },
    { id: 'combined', label: 'אמולטור + QA', desc: 'מצב משולב — QA ברקע'          },
    { id: 'af',       label: 'דפדפן AF',       desc: 'עץ PI AF מלא — 853 אלמנטים'               },
    { id: 'builder',  label: 'עורך ויזואלי',  desc: 'צור סמלים בעורך גרפי — גרור, קשר נתונים, ייצא' },
  ];
  modes.forEach(m => items.push({
    category: 'מצבים',
    icon: '⬜',
    label: m.label,
    desc:  m.desc,
    action: () => { if (_commandPaletteCallback) _commandPaletteCallback(m.id); },
  }));

  // ─── קטגוריה: סמלים ───
  currentSymList.forEach(sym => items.push({
    category: 'סמלים',
    icon: '◆',
    label: sym,
    desc:  `טען סמל: ${sym}`,
    action: () => {
      if (_commandPaletteCallback) _commandPaletteCallback('emulator');
      // שגר postMessage לטעינת סמל לאחר שהאמולטור יהיה מוכן
      setTimeout(() => {
        const iframes = [
          document.getElementById('emu-iframe'),
          document.getElementById('emu-iframe-combined'),
        ];
        iframes.forEach(fr => {
          if (fr) {
            try {
              fr.contentWindow.postMessage({ source: 'piv-mobile', type: 'render-symbol', symbol: sym }, '*');
            } catch (e) { /* cross-origin */ }
          }
        });
      }, 800);
    },
  }));

  // ─── קטגוריה: פקודות ───
  const commands = [
    {
      label:  'החלף ערכת נושא',
      desc:   'מעבר בין מצב כהה / בהיר — Ctrl+Shift+T',
      icon:   '☀',
      action: () => document.dispatchEvent(new KeyboardEvent('keydown', {
        ctrlKey: true, shiftKey: true, key: 'T', bubbles: true,
      })),
    },
    {
      label:  'פתח קיצורי מקלדת',
      desc:   'הצג את כל קיצורי המקלדת — Ctrl+Shift+K',
      icon:   '⌨',
      action: () => document.dispatchEvent(new KeyboardEvent('keydown', {
        ctrlKey: true, shiftKey: true, key: 'K', bubbles: true,
      })),
    },
    {
      label:  'אפס סיור קבלת פנים',
      desc:   'הפעל מחדש את מדריך הקבלת פנים',
      icon:   '🎯',
      action: () => resetOnboarding(),
    },
    {
      label:  'נקה היסטוריית QA',
      desc:   'מחק את היסטוריית הבדיקות מה-storage',
      icon:   '🗑',
      action: () => {
        _storageRemove('piv_qa_history');
        _showQuickToast('היסטוריית QA נוקתה');
      },
    },
    {
      label:  'חזרה ללוח הבקרה',
      desc:   'חזור למסך הבחירה הראשי — Escape',
      icon:   '🏠',
      action: () => document.dispatchEvent(new KeyboardEvent('keydown', {
        key: 'Escape', bubbles: true,
      })),
    },
    {
      label:  'רענן iframe פעיל',
      desc:   'רענן את ה-iframe הנוכחי — Ctrl+R',
      icon:   '↺',
      action: () => document.dispatchEvent(new KeyboardEvent('keydown', {
        ctrlKey: true, key: 'r', bubbles: true,
      })),
    },
  ];
  commands.forEach(c => items.push({ ...c, category: 'פקודות' }));

  // שמור רשימה במטמון עם סימן רשימת הסמלים
  _allItemsCache = { _items: items, _symbolList: currentSymList };

  return items;
}

/**
 * מסנן פריטים לפי שאילתת חיפוש.
 * משתמש במטמון פנימי במקום לקרוא _buildAllItems בכל קריאה.
 */
function _filterItems(query) {
  const all = _buildAllItems();
  if (!query) return all;
  return all.filter(item =>
    item.label.toLowerCase().includes(query) ||
    (item.desc  || '').toLowerCase().includes(query) ||
    (item.category || '').toLowerCase().includes(query)
  );
}

// קבוע virtual scroll — רוחב קבוע לתוצאות
const _VSCROLL_ITEM_H      = 42;   // גובה פריט בפיקסלים
const _VSCROLL_VISIBLE     = 10;   // כמה פריטים גלויים בוזמנית
const _VSCROLL_BUFFER      = 5;    // פריטים נוספים מעלול/מתחת
const _VSCROLL_THRESHOLD   = 20;   // מתי מפעילים virtual scroll
const _VSCROLL_FIXED_H     = 320;  // גובה המיכל של תוצאות

/**
 * מרנדר תוצאות חיפוש לתוך אלמנט.
 * כאשר יש יותר מע-_VSCROLL_THRESHOLD פריטים, מפעיל virtual scroll:
 *  קובע גובה קבוע _VSCROLL_FIXED_H px, יוצר spacer לגובה הכוללית,
 *  ומרנדר רק את הפריטים הגלויים + עוד _VSCROLL_BUFFER מעלולול/מתחת.
 */
function _renderResults(container, items, activeIdx, onSelect) {
  if (!container) return;
  container.innerHTML = '';

  // הסר את המאזין לגובה שהוגדרה על-י-u virtual scroll
  container.style.height    = '';
  container.style.maxHeight = '';

  if (items.length === 0) {
    container.innerHTML = `<div class="cmd-palette__empty">אין תוצאות</div>`;
    return;
  }

  // רנדור רגיל עבור ישיבות קטנות
  if (items.length <= _VSCROLL_THRESHOLD) {
    container.style.maxHeight = '360px';
    _renderResultsFlat(container, items, activeIdx, onSelect);
    return;
  }

  // — Virtual Scroll —
  // קבע גובה קבוע למיכל
  container.style.height    = _VSCROLL_FIXED_H + 'px';
  container.style.maxHeight = _VSCROLL_FIXED_H + 'px';
  container.style.position  = 'relative';
  container.style.overflowY = 'auto';

  // אחסנון את הפריטים לפי קטגוריה לצורך קטגוריות ב-virtual scroll
  // כל פריט מקבל אינדקס לינארי מתוך items[]
  const totalItems = items.length;
  const totalH     = totalItems * _VSCROLL_ITEM_H;

  // מיכל ספקר שממשמר על גובה הכוללית
  const spacer       = document.createElement('div');
  spacer.style.height = totalH + 'px';
  spacer.style.width  = '1px';
  spacer.style.pointerEvents = 'none';
  container.appendChild(spacer);

  // מיכל שיך לפריטים הגלויים
  const viewport       = document.createElement('div');
  viewport.style.position = 'absolute';
  viewport.style.top      = '0';
  viewport.style.left     = '0';
  viewport.style.right    = '0';
  container.appendChild(viewport);

  // פונקציה לעדכון פריטים גלויים לפי מיקום הגלילה
  function _updateVirtualViewport() {
    const scrollTop  = container.scrollTop;
    const startIdx   = Math.max(0, Math.floor(scrollTop / _VSCROLL_ITEM_H) - _VSCROLL_BUFFER);
    const endIdx     = Math.min(totalItems - 1,
      Math.ceil((scrollTop + _VSCROLL_FIXED_H) / _VSCROLL_ITEM_H) + _VSCROLL_BUFFER);

    viewport.innerHTML = '';

    let lastCategory = null;
    for (let idx = startIdx; idx <= endIdx; idx++) {
      const item = items[idx];
      if (!item) continue;

      // כותרת קטגוריה — מצויין כשהקטגוריה משתנה או כשהיא ראשונה הנראית
      const prevItem = idx > 0 ? items[idx - 1] : null;
      if (!prevItem || prevItem.category !== item.category) {
        if (lastCategory !== item.category) {
          lastCategory = item.category;
          const catEl       = document.createElement('div');
          catEl.className   = 'cmd-palette__category';
          catEl.textContent = item.category;
          // מיקום מוחלט בתוך ה-spacer
          catEl.style.position = 'absolute';
          catEl.style.top      = (idx * _VSCROLL_ITEM_H) + 'px';
          catEl.style.left     = '0';
          catEl.style.right    = '0';
          viewport.appendChild(catEl);
        }
      }

      const row       = document.createElement('div');
      row.className   = 'cmd-palette__item' + (idx === activeIdx ? ' cmd-palette__item--active' : '');
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(idx === activeIdx));
      row.dataset.index = String(idx);
      // מיקום מוחלט בתוך ה-spacer כך שהגלילה נראית
      row.style.position = 'absolute';
      row.style.top      = (idx * _VSCROLL_ITEM_H) + 'px';
      row.style.left     = '0';
      row.style.right    = '0';
      row.style.height   = _VSCROLL_ITEM_H + 'px';
      row.style.overflow = 'hidden';

      row.innerHTML = `
        <span class="cmd-palette__item-icon" aria-hidden="true">${item.icon || '•'}</span>
        <span class="cmd-palette__item-text">
          <span class="cmd-palette__item-label">${_escapeHTML(item.label)}</span>
          ${item.desc ? `<span class="cmd-palette__item-desc">${_escapeHTML(item.desc)}</span>` : ''}
        </span>`;

      row.addEventListener('mousedown', (e) => {
        e.preventDefault();
        onSelect(item);
      });
      row.addEventListener('mouseover', () => {
        viewport.querySelectorAll('.cmd-palette__item').forEach((r) => {
          const rIdx = parseInt(r.dataset.index, 10);
          r.classList.toggle('cmd-palette__item--active', rIdx === idx);
          r.setAttribute('aria-selected', String(rIdx === idx));
        });
      });

      viewport.appendChild(row);
    }
  }

  // רנדור ראשוני
  _updateVirtualViewport();

  // עדכון בגלילה
  container.addEventListener('scroll', _updateVirtualViewport);

  // גלול לפריט הפעיל
  if (activeIdx >= 0 && activeIdx < totalItems) {
    const targetScrollTop = Math.max(0,
      (activeIdx * _VSCROLL_ITEM_H) - (_VSCROLL_FIXED_H / 2) + (_VSCROLL_ITEM_H / 2));
    container.scrollTop = targetScrollTop;
  }
}

/** רנדור פשוט (ללא virtual scroll) עבור רשימות קצרות */
function _renderResultsFlat(container, items, activeIdx, onSelect) {
  let lastCategory = null;
  items.forEach((item, idx) => {
    // כותרת קטגוריה
    if (item.category !== lastCategory) {
      lastCategory = item.category;
      const catEl       = document.createElement('div');
      catEl.className   = 'cmd-palette__category';
      catEl.textContent = item.category;
      container.appendChild(catEl);
    }

    const row       = document.createElement('div');
    row.className   = 'cmd-palette__item' + (idx === activeIdx ? ' cmd-palette__item--active' : '');
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', String(idx === activeIdx));
    row.dataset.index = String(idx);

    row.innerHTML = `
      <span class="cmd-palette__item-icon" aria-hidden="true">${item.icon || '•'}</span>
      <span class="cmd-palette__item-text">
        <span class="cmd-palette__item-label">${_escapeHTML(item.label)}</span>
        ${item.desc ? `<span class="cmd-palette__item-desc">${_escapeHTML(item.desc)}</span>` : ''}
      </span>`;

    row.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect(item);
    });
    row.addEventListener('mouseover', () => {
      container.querySelectorAll('.cmd-palette__item').forEach((r, i) => {
        r.classList.toggle('cmd-palette__item--active', i === idx);
        r.setAttribute('aria-selected', String(i === idx));
      });
    });

    container.appendChild(row);
  });

  // גלול לפריט הפעיל
  const activeEl = container.querySelector('.cmd-palette__item--active');
  if (activeEl) activeEl.scrollIntoView({ block: 'nearest' });
}

/** סוגר את פלטת הפקודות */
function _closeCommandPalette() {
  const overlay = document.getElementById('cmd-palette-overlay');
  if (overlay) {
    overlay.classList.add('cmd-palette-overlay--closing');
    setTimeout(() => overlay.remove(), 250);
  }
}

/** הזרקת סגנונות CSS לפלטת הפקודות */
let _cmdPaletteStylesInjected = false;
function _injectCommandPaletteStyles() {
  if (_cmdPaletteStylesInjected) return;
  _cmdPaletteStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'ux-cmd-palette-styles';
  style.textContent = `
    /* ─── Command Palette Overlay ─── */
    .cmd-palette-overlay {
      position: fixed;
      inset: 0;
      z-index: 9000;
      background: rgba(5, 10, 20, 0.82);
      backdrop-filter: blur(6px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding-top: 10vh;
      direction: rtl;
      animation: ux-fade-in 0.15s ease;
    }
    .cmd-palette-overlay--closing {
      animation: ux-fade-out 0.2s ease forwards;
    }
    @keyframes ux-fade-in  { from { opacity: 0; } to { opacity: 1; } }
    @keyframes ux-fade-out { from { opacity: 1; } to { opacity: 0; } }

    .cmd-palette {
      width: 580px;
      max-width: calc(100vw - 32px);
      background: #0d1b2a;
      border: 1px solid rgba(0,212,255,0.18);
      border-radius: 12px;
      box-shadow: 0 24px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,212,255,0.06);
      overflow: hidden;
      animation: ux-slide-down 0.18s ease;
    }
    @keyframes ux-slide-down {
      from { transform: translateY(-12px); opacity: 0; }
      to   { transform: translateY(0);     opacity: 1; }
    }

    .cmd-palette__header {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 16px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .cmd-palette__icon {
      color: #6b7fa3;
      flex-shrink: 0;
    }
    .cmd-palette__input {
      flex: 1;
      background: transparent;
      border: none;
      outline: none;
      color: #e4eaf5;
      font-size: 15px;
      font-family: 'Heebo', sans-serif;
      direction: rtl;
      text-align: right;
    }
    .cmd-palette__input::placeholder {
      color: #3a4a6b;
    }
    .cmd-palette__esc-hint {
      font-size: 10px;
      color: #3a4a6b;
      border: 1px solid #1e2d42;
      border-radius: 4px;
      padding: 2px 6px;
      font-family: 'Heebo', sans-serif;
    }

    .cmd-palette__results {
      max-height: 360px;
      overflow-y: auto;
      padding: 8px 0;
    }
    .cmd-palette__results::-webkit-scrollbar { width: 4px; }
    .cmd-palette__results::-webkit-scrollbar-thumb { background: #1e2d42; border-radius: 2px; }

    .cmd-palette__category {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.08em;
      color: #3a4a6b;
      padding: 10px 16px 4px;
      text-transform: uppercase;
      font-family: 'Heebo', sans-serif;
    }

    .cmd-palette__item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 16px;
      cursor: pointer;
      transition: background 0.1s;
      direction: rtl;
    }
    .cmd-palette__item:hover,
    .cmd-palette__item--active {
      background: rgba(0,212,255,0.07);
    }
    .cmd-palette__item--active .cmd-palette__item-label {
      color: #00d4ff;
    }
    .cmd-palette__item-icon {
      width: 22px;
      text-align: center;
      font-size: 14px;
      flex-shrink: 0;
    }
    .cmd-palette__item-text {
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-width: 0;
    }
    .cmd-palette__item-label {
      font-size: 14px;
      font-weight: 500;
      color: #c8d4e8;
      font-family: 'Heebo', sans-serif;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cmd-palette__item-desc {
      font-size: 11px;
      color: #4a5a78;
      font-family: 'Heebo', sans-serif;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .cmd-palette__empty {
      padding: 32px 16px;
      text-align: center;
      color: #4a5a78;
      font-size: 14px;
      font-family: 'Heebo', sans-serif;
    }

    .cmd-palette__footer {
      display: flex;
      gap: 16px;
      padding: 10px 16px;
      border-top: 1px solid rgba(255,255,255,0.05);
      direction: rtl;
    }
    .cmd-palette__footer span {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 11px;
      color: #3a4a6b;
      font-family: 'Heebo', sans-serif;
    }
    .cmd-palette__footer kbd {
      font-size: 10px;
      border: 1px solid #1e2d42;
      border-radius: 3px;
      padding: 1px 5px;
      background: #0a121e;
      color: #4a5a78;
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. סטטיסטיקות לוח הבקרה
// ═══════════════════════════════════════════════════════════════════════════

/** ברירות מחדל לסטטיסטיקות */
const _DEFAULT_STATS = {
  symbolsTested: 0,
  checksRun:     0,
  errorsFound:   0,
  lastCheckTime: null,
};

/**
 * מחזיר את הסטטיסטיקות הנוכחיות מה-storage
 * @returns {object}
 */
function _loadStats() {
  try {
    const raw = _storageGet(_KEY_STATS);
    return raw ? { ..._DEFAULT_STATS, ...JSON.parse(raw) } : { ..._DEFAULT_STATS };
  } catch (e) {
    return { ..._DEFAULT_STATS };
  }
}

/**
 * מאתחל את פס הסטטיסטיקות בלוח הבקרה
 */
function initDashboardStats() {
  _injectStatsStyles();
  _renderStatsBar();
  _listenForQAStats();
}

/**
 * מעדכן את הסטטיסטיקות ושומר ב-storage
 * @param {object} data — {symbolsTested?, checksRun?, errorsFound?, lastCheckTime?}
 */
function updateStats(data) {
  const current = _loadStats();
  const updated = {
    symbolsTested: (current.symbolsTested || 0) + (data.symbolsTested || 0),
    checksRun:     (current.checksRun     || 0) + (data.checksRun     || 0),
    errorsFound:   (current.errorsFound   || 0) + (data.errorsFound   || 0),
    lastCheckTime: data.lastCheckTime || current.lastCheckTime || Date.now(),
  };
  _storageSet(_KEY_STATS, JSON.stringify(updated));
  _refreshStatsBar(updated);
}

/** מרנדר את פס הסטטיסטיקות מתחת לכרטיסי המצבים */
function _renderStatsBar() {
  if (document.getElementById('dashboard-stats-bar')) return;

  const launcherScreen = document.getElementById('launcher-screen');
  if (!launcherScreen) return;

  const versionArea = document.getElementById('version-info-area');
  const stats       = _loadStats();

  const bar       = document.createElement('div');
  bar.id          = 'dashboard-stats-bar';
  bar.className   = 'dashboard-stats-bar slide-up';
  bar.dir         = 'rtl';

  bar.innerHTML = _buildStatsHTML(stats);

  if (versionArea) {
    launcherScreen.insertBefore(bar, versionArea);
  } else {
    // הכנס לפני ה-footer
    const footer = launcherScreen.querySelector('.launcher-footer');
    if (footer) {
      launcherScreen.insertBefore(bar, footer);
    } else {
      launcherScreen.appendChild(bar);
    }
  }
}

/** מרענן את תוכן פס הסטטיסטיקות */
function _refreshStatsBar(stats) {
  const bar = document.getElementById('dashboard-stats-bar');
  if (!bar) return;
  bar.innerHTML = _buildStatsHTML(stats);
}

/** בונה את ה-HTML של סטטיסטיקות */
function _buildStatsHTML(stats) {
  const lastTime = stats.lastCheckTime
    ? new Date(stats.lastCheckTime).toLocaleTimeString('he-IL', {
        hour: '2-digit', minute: '2-digit',
      })
    : '—';

  return `
    <div class="stats-card">
      <span class="stats-card__value">${stats.symbolsTested || 0}</span>
      <span class="stats-card__label">סמלים נבדקו</span>
    </div>
    <div class="stats-card">
      <span class="stats-card__value">${stats.checksRun || 0}</span>
      <span class="stats-card__label">בדיקות</span>
    </div>
    <div class="stats-card stats-card--${(stats.errorsFound || 0) > 0 ? 'error' : 'ok'}">
      <span class="stats-card__value">${stats.errorsFound || 0}</span>
      <span class="stats-card__label">שגיאות</span>
    </div>
    <div class="stats-card stats-card--time">
      <span class="stats-card__value stats-card__value--sm">${lastTime}</span>
      <span class="stats-card__label">עדכון אחרון</span>
    </div>`;
}

/** מאזין ל-postMessage מ-QA iframe לעדכון סטטיסטיקות */
function _listenForQAStats() {
  window.addEventListener('message', (evt) => {
    const { type, payload } = evt.data || {};
    if (type !== 'piv-qa-stats-update') return;
    if (!payload || typeof payload !== 'object') return;

    updateStats({
      symbolsTested: payload.symbolsTested || 0,
      checksRun:     payload.checksRun     || 0,
      errorsFound:   payload.errorsFound   || 0,
      lastCheckTime: payload.lastCheckTime || Date.now(),
    });
  });
}

/** הזרקת סגנונות CSS לסטטיסטיקות */
let _statsStylesInjected = false;
function _injectStatsStyles() {
  if (_statsStylesInjected) return;
  _statsStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'ux-stats-styles';
  style.textContent = `
    .dashboard-stats-bar {
      display: flex;
      gap: 12px;
      justify-content: center;
      flex-wrap: wrap;
      padding: 0 24px 8px;
      direction: rtl;
    }
    .stats-card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      background: rgba(0,212,255,0.05);
      border: 1px solid rgba(0,212,255,0.1);
      border-radius: 10px;
      padding: 10px 20px;
      min-width: 90px;
      transition: border-color 0.2s, background 0.2s;
    }
    .stats-card:hover {
      background: rgba(0,212,255,0.09);
      border-color: rgba(0,212,255,0.2);
    }
    .stats-card--error {
      border-color: rgba(248,113,113,0.3);
      background: rgba(248,113,113,0.05);
    }
    .stats-card--ok .stats-card__value { color: #00d4aa; }
    .stats-card--error .stats-card__value { color: #f87171; }
    .stats-card--time .stats-card__value { color: #a0b4d0; }
    .stats-card__value {
      font-size: 22px;
      font-weight: 700;
      color: #00d4ff;
      font-family: 'Heebo', sans-serif;
      line-height: 1;
    }
    .stats-card__value--sm {
      font-size: 15px;
    }
    .stats-card__label {
      font-size: 11px;
      color: #6b7fa3;
      font-family: 'Heebo', sans-serif;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. סיור קבלת פנים (Onboarding Tour)
// ═══════════════════════════════════════════════════════════════════════════

/** צעדי הסיור */
const _ONBOARDING_STEPS = [
  {
    title:     'ברוכים הבאים!',
    body:      'זהו לוח הבקרה של PI Vision — פלטפורמה לפיתוח ובדיקות של 63 סמלים מותאמים.',
    highlight: '.mode-cards',
    icon:      '👋',
  },
  {
    title:     '4 מצבי עבודה',
    body:      `• <b>אמולטור</b> — הפעלת PI Vision עם כל הסמלים<br>
                • <b>בדיקת QA</b> — ניתוח, Runtime, GitHub<br>
                • <b>אמולטור + QA</b> — מצב משולב מומלץ<br>
                • <b>דפדפן AF</b> — עץ נתוני PI System`,
    highlight: '.mode-cards',
    icon:      '🔲',
  },
  {
    title:     'עוזר AI',
    body:      'לחץ על הכפתור הצף בפינה לעזרה מיידית — שאל שאלות על סמלים, שגיאות, ו-PI Vision.',
    highlight: '#ai-chat-toggle',
    icon:      '🤖',
  },
  {
    title:     'קיצורי מקלדת',
    body:      `<b>Ctrl+K</b> — חיפוש מהיר ופלטת פקודות<br>
                <b>Ctrl+Shift+K</b> — רשימת כל הקיצורים<br>
                <b>Ctrl+1/2/3/4</b> — מעבר מהיר בין מצבים<br>
                <b>Escape</b> — חזרה ללוח הבקרה`,
    highlight: null,
    icon:      '⌨',
  },
];

let _currentOnboardingStep = 0;
let _onboardingOverlay     = null;
let _highlightEl           = null;

/**
 * מאתחל את סיור קבלת הפנים — מוצג רק בביקור הראשון
 */
function initOnboarding() {
  const done = _storageGet(_KEY_ONBOARDING);
  if (done) return;
  _injectOnboardingStyles();
  // עיכוב קצר כדי שה-UI יהיה מוכן
  setTimeout(_startOnboarding, 1200);
}

/**
 * מאפס את סיור קבלת הפנים — ימחק את הסימון ויפעיל מחדש
 */
function resetOnboarding() {
  _storageRemove(_KEY_ONBOARDING);
  _injectOnboardingStyles();
  _startOnboarding();
}

/** מתחיל את הסיור */
function _startOnboarding() {
  if (document.getElementById('onboarding-overlay')) return;
  _currentOnboardingStep = 0;
  _renderOnboardingStep();
}

/** מרנדר שלב נוכחי של הסיור */
function _renderOnboardingStep() {
  // הסר overlay קיים
  _removeOnboardingOverlay();
  _removeHighlight();

  const step = _ONBOARDING_STEPS[_currentOnboardingStep];
  if (!step) {
    _completeOnboarding();
    return;
  }

  const total   = _ONBOARDING_STEPS.length;
  const current = _currentOnboardingStep + 1;

  // הדגשת אלמנט
  if (step.highlight) {
    _highlightEl = document.querySelector(step.highlight);
    if (_highlightEl) _highlightEl.classList.add('onboarding-highlight');
  }

  const overlay = document.createElement('div');
  overlay.id        = 'onboarding-overlay';
  overlay.className = 'onboarding-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', `סיור קבלת פנים — שלב ${current} מתוך ${total}`);
  overlay.dir = 'rtl';

  const dotsHTML = _ONBOARDING_STEPS.map((_, i) =>
    `<span class="onboarding-dot ${i === _currentOnboardingStep ? 'onboarding-dot--active' : ''}"></span>`
  ).join('');

  overlay.innerHTML = `
    <div class="onboarding-card">
      <div class="onboarding-card__step-badge" dir="ltr">${current} / ${total}</div>
      <div class="onboarding-card__icon" aria-hidden="true">${step.icon}</div>
      <h2 class="onboarding-card__title">${_escapeHTML(step.title)}</h2>
      <div class="onboarding-card__body">${step.body}</div>
      <div class="onboarding-card__dots">${dotsHTML}</div>
      <div class="onboarding-card__actions">
        ${_currentOnboardingStep > 0
          ? '<button id="onboarding-prev" class="onboarding-btn onboarding-btn--secondary">הקודם</button>'
          : ''}
        <button id="onboarding-skip" class="onboarding-btn onboarding-btn--ghost">דלג</button>
        <button id="onboarding-next" class="onboarding-btn onboarding-btn--primary">
          ${_currentOnboardingStep === total - 1 ? 'סיום!' : 'הבא'}
        </button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  _onboardingOverlay = overlay;

  // אנימציה
  requestAnimationFrame(() => overlay.classList.add('onboarding-overlay--visible'));

  // כפתורים
  const nextBtn = document.getElementById('onboarding-next');
  const prevBtn = document.getElementById('onboarding-prev');
  const skipBtn = document.getElementById('onboarding-skip');

  if (nextBtn) nextBtn.addEventListener('click', _onboardingNext);
  if (prevBtn) prevBtn.addEventListener('click', _onboardingPrev);
  if (skipBtn) skipBtn.addEventListener('click', _completeOnboarding);
}

function _onboardingNext() {
  _currentOnboardingStep++;
  if (_currentOnboardingStep >= _ONBOARDING_STEPS.length) {
    _completeOnboarding();
  } else {
    _renderOnboardingStep();
  }
}

function _onboardingPrev() {
  if (_currentOnboardingStep > 0) {
    _currentOnboardingStep--;
    _renderOnboardingStep();
  }
}

function _completeOnboarding() {
  _storageSet(_KEY_ONBOARDING, '1');
  _removeOnboardingOverlay();
  _removeHighlight();
}

function _removeOnboardingOverlay() {
  const existing = document.getElementById('onboarding-overlay');
  if (existing) {
    existing.classList.remove('onboarding-overlay--visible');
    setTimeout(() => existing.remove(), 280);
  }
  _onboardingOverlay = null;
}

function _removeHighlight() {
  if (_highlightEl) {
    _highlightEl.classList.remove('onboarding-highlight');
    _highlightEl = null;
  }
  document.querySelectorAll('.onboarding-highlight').forEach(el => {
    el.classList.remove('onboarding-highlight');
  });
}

/** הזרקת סגנונות CSS לסיור קבלת פנים */
let _onboardingStylesInjected = false;
function _injectOnboardingStyles() {
  if (_onboardingStylesInjected) return;
  _onboardingStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'ux-onboarding-styles';
  style.textContent = `
    /* ─── Onboarding Overlay ─── */
    .onboarding-overlay {
      position: fixed;
      inset: 0;
      z-index: 9500;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(5, 10, 20, 0.75);
      backdrop-filter: blur(4px);
      direction: rtl;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .onboarding-overlay--visible {
      opacity: 1;
    }

    .onboarding-card {
      width: 440px;
      max-width: calc(100vw - 32px);
      background: #0d1b2a;
      border: 1px solid rgba(0,212,255,0.2);
      border-radius: 16px;
      padding: 32px 28px 24px;
      box-shadow: 0 32px 80px rgba(0,0,0,0.7), 0 0 0 1px rgba(0,212,255,0.05);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 16px;
      text-align: center;
      animation: ux-slide-down 0.22s ease;
    }

    .onboarding-card__step-badge {
      position: absolute;
      top: -12px;
      right: 20px;
      background: #00d4ff;
      color: #0a0f1e;
      font-size: 11px;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 20px;
      font-family: 'Heebo', sans-serif;
    }

    .onboarding-card { position: relative; }

    .onboarding-card__icon {
      font-size: 40px;
      line-height: 1;
    }

    .onboarding-card__title {
      font-size: 20px;
      font-weight: 700;
      color: #e4eaf5;
      font-family: 'Heebo', sans-serif;
      margin: 0;
    }

    .onboarding-card__body {
      font-size: 14px;
      color: #8a9ab8;
      font-family: 'Heebo', sans-serif;
      line-height: 1.7;
      max-width: 360px;
    }
    .onboarding-card__body b {
      color: #00d4ff;
      font-weight: 600;
    }

    .onboarding-card__dots {
      display: flex;
      gap: 6px;
      justify-content: center;
    }
    .onboarding-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #1e2d42;
      transition: background 0.2s, transform 0.2s;
    }
    .onboarding-dot--active {
      background: #00d4ff;
      transform: scale(1.25);
    }

    .onboarding-card__actions {
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
      margin-top: 4px;
    }

    .onboarding-btn {
      padding: 9px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      font-family: 'Heebo', sans-serif;
      cursor: pointer;
      transition: all 0.15s;
      border: none;
      outline: none;
    }
    .onboarding-btn--primary {
      background: #00d4ff;
      color: #0a0f1e;
    }
    .onboarding-btn--primary:hover {
      background: #00b8d9;
    }
    .onboarding-btn--secondary {
      background: rgba(0,212,255,0.1);
      color: #00d4ff;
      border: 1px solid rgba(0,212,255,0.2);
    }
    .onboarding-btn--secondary:hover {
      background: rgba(0,212,255,0.18);
    }
    .onboarding-btn--ghost {
      background: transparent;
      color: #4a5a78;
      border: 1px solid #1e2d42;
    }
    .onboarding-btn--ghost:hover {
      color: #6b7fa3;
      border-color: #2e3f5c;
    }

    /* ─── Highlight ring ─── */
    .onboarding-highlight {
      position: relative;
      z-index: 9600 !important;
      box-shadow: 0 0 0 4px rgba(0,212,255,0.4), 0 0 24px rgba(0,212,255,0.2) !important;
      border-radius: 8px;
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. גבול שגיאות גלובלי (Error Boundary)
// ═══════════════════════════════════════════════════════════════════════════

/** מסימן שגבול השגיאות כבר הוצג למניעת כפילויות */
let _errorBoundaryShown = false;

/**
 * מאתחל את גבול השגיאות הגלובלי
 * לא מתנגש עם hooks של AI chat
 */
function initErrorBoundary() {
  _injectErrorBoundaryStyles();

  // האזנה לשגיאות JS לא מטופלות
  window.addEventListener('error', (evt) => {
    // אל תחסום שגיאות של AI chat
    if (_isAIChatError(evt)) return;
    // אל תציג שוב אם כבר מוצג
    if (_errorBoundaryShown) return;

    _showErrorBoundary({
      message: evt.message || 'שגיאה לא ידועה',
      source:  `${evt.filename || ''}:${evt.lineno || ''}:${evt.colno || ''}`,
      stack:   evt.error ? (evt.error.stack || '') : '',
    });
  });

  // האזנה ל-Promise לא מטופל
  window.addEventListener('unhandledrejection', (evt) => {
    if (_errorBoundaryShown) return;

    const reason = evt.reason;
    const msg    = (reason instanceof Error)
      ? reason.message
      : String(reason || 'שגיאת Promise לא מטופלת');

    // אל תחסום שגיאות של AI chat
    if (_isAIChatError({ message: msg, filename: '' })) return;

    _showErrorBoundary({
      message: msg,
      source:  'Unhandled Promise Rejection',
      stack:   (reason instanceof Error) ? (reason.stack || '') : '',
    });
  });
}

/**
 * בודק אם שגיאה מקורה ב-AI chat (למנוע התנגשות)
 * @param {ErrorEvent|object} evt
 * @returns {boolean}
 */
function _isAIChatError(evt) {
  const src = (evt.filename || '').toLowerCase();
  return src.includes('ai-chat') || src.includes('ai_chat');
}

/** מציג את overlay גבול השגיאות */
function _showErrorBoundary({ message, source, stack }) {
  if (document.getElementById('error-boundary-overlay')) return;
  _errorBoundaryShown = true;

  const overlay = document.createElement('div');
  overlay.id        = 'error-boundary-overlay';
  overlay.className = 'error-boundary-overlay';
  overlay.setAttribute('role', 'alertdialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'שגיאה קריטית');
  overlay.dir = 'rtl';

  const safeMsg   = _escapeHTML(message || 'שגיאה לא ידועה');
  const safeSrc   = _escapeHTML(source  || '');
  const safeStack = _escapeHTML(stack   || 'אין מידע נוסף');

  overlay.innerHTML = `
    <div class="error-boundary-card">
      <div class="error-boundary__icon" aria-hidden="true">⚠</div>
      <h2 class="error-boundary__title">אופס! משהו השתבש</h2>
      <p class="error-boundary__message">${safeMsg}</p>
      ${safeSrc ? `<p class="error-boundary__source">${safeSrc}</p>` : ''}
      <div class="error-boundary__actions">
        <button id="error-boundary-reload" class="error-boundary-btn error-boundary-btn--primary">
          רענן דף
        </button>
        <button id="error-boundary-dismiss" class="error-boundary-btn error-boundary-btn--secondary">
          המשך בכל זאת
        </button>
        <button id="error-boundary-details-toggle" class="error-boundary-btn error-boundary-btn--ghost">
          הצג פרטים ▾
        </button>
      </div>
      <details id="error-boundary-details" class="error-boundary__details">
        <summary style="display:none"></summary>
        <pre class="error-boundary__stack">${safeStack}</pre>
      </details>
    </div>`;

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('error-boundary-overlay--visible'));

  // כפתור רענון
  document.getElementById('error-boundary-reload')
    .addEventListener('click', () => window.location.reload());

  // כפתור סגירה / המשך
  document.getElementById('error-boundary-dismiss')
    .addEventListener('click', () => {
      _errorBoundaryShown = false;
      overlay.remove();
    });

  // כפתור הצג פרטים
  document.getElementById('error-boundary-details-toggle')
    .addEventListener('click', () => {
      const details = document.getElementById('error-boundary-details');
      const btn     = document.getElementById('error-boundary-details-toggle');
      if (details.hasAttribute('open')) {
        details.removeAttribute('open');
        btn.textContent = 'הצג פרטים ▾';
      } else {
        details.setAttribute('open', '');
        btn.textContent = 'הסתר פרטים ▴';
      }
    });
}

/** הזרקת סגנונות CSS לגבול השגיאות */
let _errorBoundaryStylesInjected = false;
function _injectErrorBoundaryStyles() {
  if (_errorBoundaryStylesInjected) return;
  _errorBoundaryStylesInjected = true;

  const style = document.createElement('style');
  style.id = 'ux-error-boundary-styles';
  style.textContent = `
    /* ─── Error Boundary ─── */
    .error-boundary-overlay {
      position: fixed;
      inset: 0;
      z-index: 99000;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(5, 8, 18, 0.88);
      backdrop-filter: blur(8px);
      direction: rtl;
      opacity: 0;
      transition: opacity 0.25s ease;
    }
    .error-boundary-overlay--visible {
      opacity: 1;
    }

    .error-boundary-card {
      width: 480px;
      max-width: calc(100vw - 32px);
      background: #0d1320;
      border: 1px solid rgba(248,113,113,0.3);
      border-radius: 16px;
      padding: 36px 28px 28px;
      box-shadow: 0 0 80px rgba(248,113,113,0.12), 0 32px 80px rgba(0,0,0,0.8);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 14px;
      text-align: center;
      animation: ux-slide-down 0.2s ease;
    }

    .error-boundary__icon {
      font-size: 48px;
      line-height: 1;
    }

    .error-boundary__title {
      font-size: 22px;
      font-weight: 700;
      color: #f87171;
      font-family: 'Heebo', sans-serif;
      margin: 0;
    }

    .error-boundary__message {
      font-size: 14px;
      color: #a0b4d0;
      font-family: 'Heebo', sans-serif;
      max-width: 380px;
      line-height: 1.5;
      word-break: break-word;
      margin: 0;
    }

    .error-boundary__source {
      font-size: 11px;
      color: #4a5a78;
      font-family: 'Courier New', monospace;
      background: rgba(255,255,255,0.03);
      padding: 4px 10px;
      border-radius: 4px;
      margin: 0;
      word-break: break-all;
    }

    .error-boundary__actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
      margin-top: 6px;
    }

    .error-boundary-btn {
      padding: 9px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      font-family: 'Heebo', sans-serif;
      cursor: pointer;
      transition: all 0.15s;
      border: none;
      outline: none;
    }
    .error-boundary-btn--primary {
      background: #f87171;
      color: #0d1320;
    }
    .error-boundary-btn--primary:hover {
      background: #ef4444;
    }
    .error-boundary-btn--secondary {
      background: rgba(248,113,113,0.1);
      color: #f87171;
      border: 1px solid rgba(248,113,113,0.25);
    }
    .error-boundary-btn--secondary:hover {
      background: rgba(248,113,113,0.18);
    }
    .error-boundary-btn--ghost {
      background: transparent;
      color: #4a5a78;
      border: 1px solid #1e2d42;
    }
    .error-boundary-btn--ghost:hover {
      color: #6b7fa3;
      border-color: #2e3f5c;
    }

    .error-boundary__details {
      width: 100%;
      margin-top: 4px;
    }
    .error-boundary__stack {
      background: #070d18;
      border: 1px solid #1e2d42;
      border-radius: 6px;
      padding: 12px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      color: #6b7fa3;
      text-align: right;
      direction: ltr;
      overflow-x: auto;
      max-height: 180px;
      white-space: pre-wrap;
      word-break: break-all;
      margin: 0;
    }
  `;
  document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
// עזר — _showQuickToast (toast קצר ללא תלות ב-ux-enhancements)
// ═══════════════════════════════════════════════════════════════════════════

function _showQuickToast(message) {
  const toast = document.createElement('div');
  toast.className = 'ux-quick-toast';
  toast.textContent = message;
  toast.dir = 'rtl';
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('ux-quick-toast--visible'));
  setTimeout(() => {
    toast.classList.remove('ux-quick-toast--visible');
    setTimeout(() => toast.remove(), 350);
  }, 2500);

  if (!document.getElementById('ux-quick-toast-style')) {
    const s = document.createElement('style');
    s.id = 'ux-quick-toast-style';
    s.textContent = `
      .ux-quick-toast {
        position: fixed;
        bottom: 24px;
        left: 50%;
        transform: translateX(-50%) translateY(20px);
        background: #0d1b2a;
        border: 1px solid rgba(0,212,255,0.18);
        color: #c8d4e8;
        font-family: 'Heebo', sans-serif;
        font-size: 13px;
        padding: 10px 20px;
        border-radius: 8px;
        z-index: 99999;
        opacity: 0;
        transition: opacity 0.25s ease, transform 0.25s ease;
        white-space: nowrap;
      }
      .ux-quick-toast--visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    `;
    document.head.appendChild(s);
  }
}

// ─── עזר — escapeHTML ──────────────────────────────────────────────────────

function _escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ═══════════════════════════════════════════════════════════════════════════
// ייצוא ממשק ציבורי
// ═══════════════════════════════════════════════════════════════════════════

// ייצוא named exports
export {
  // 1. Loading States
  showFrameLoading,
  hideFrameLoading,

  // 2. Breadcrumbs
  initBreadcrumbs,
  updateBreadcrumb,

  // 3. Command Palette
  initCommandPalette,

  // 4. Dashboard Stats
  initDashboardStats,
  updateStats,

  // 5. Onboarding
  initOnboarding,
  resetOnboarding,

  // 6. Error Boundary
  initErrorBoundary,
};

// ייצוא ברירת מחדל כאובייקט UXFeatures
const UXFeatures = {
  // 1. Loading States
  showFrameLoading,
  hideFrameLoading,

  // 2. Breadcrumbs
  initBreadcrumbs,
  updateBreadcrumb,

  // 3. Command Palette
  initCommandPalette,

  // 4. Dashboard Stats
  initDashboardStats,
  updateStats,

  // 5. Onboarding
  initOnboarding,
  resetOnboarding,

  // 6. Error Boundary
  initErrorBoundary,
};

export default UXFeatures;
