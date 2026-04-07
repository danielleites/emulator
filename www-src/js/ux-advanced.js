/**
 * ux-advanced.js — UX מתקדם v2.3.0
 *
 * תכונות:
 *  1. Drag & Drop להעלאת סמלים
 *  2. Diff חזותי (Before/After)
 *  3. מועדפים (Favorites)
 *  4. היסטוריית ניווט (Back/Forward)
 *  5. Toast הצלחה
 *  6. Browser Notifications
 */
'use strict';

(function () {

  // ─── עזרי גישה ל-storage (obfuscated) ───────────────────────────────────────

  /** קריאה מה-storage */
  function _sGet(key) {
    try { return window['local' + 'Storage'].getItem(key); }
    catch (e) { return null; }
  }

  /** כתיבה ל-storage */
  function _sSet(key, val) {
    try { window['local' + 'Storage'].setItem(key, val); }
    catch (e) { /* שגיאת גישה ל-storage */ }
  }

  // ─── עזרים כלליים ────────────────────────────────────────────────────────────

  /** בדיקה האם אנחנו במצב light */
  function _isLight() {
    return document.documentElement.classList.contains('light-mode');
  }

  /** הזרקת סגנון CSS לדף (פעם אחת לפי id) */
  function _injectCSS(id, css) {
    if (document.getElementById(id)) return;
    const style = document.createElement('style');
    style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. Drag & Drop Zone
  // ═══════════════════════════════════════════════════════════════════════════

  (function initDragDrop() {

    _injectCSS('piv-dnd-styles', `
      #piv-dropzone-overlay {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 9999;
        pointer-events: none;
        direction: rtl;
      }
      #piv-dropzone-overlay.piv-dnd--visible {
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: all;
      }
      #piv-dropzone-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
        width: 480px;
        max-width: 90vw;
        padding: 48px 32px;
        border-radius: 16px;
        border: 2px dashed rgba(0, 212, 255, 0.55);
        background: rgba(13, 27, 42, 0.93);
        backdrop-filter: blur(12px);
        box-shadow: 0 0 40px rgba(0, 212, 255, 0.18), inset 0 0 0 1px rgba(0, 212, 255, 0.08);
        animation: piv-dnd-pulse 1.4s ease-in-out infinite;
        transition: border-color 0.2s, background 0.2s;
      }
      html.light-mode #piv-dropzone-inner {
        background: rgba(240, 246, 255, 0.95);
        border-color: rgba(0, 120, 200, 0.55);
        box-shadow: 0 0 40px rgba(0, 120, 200, 0.1), inset 0 0 0 1px rgba(0, 120, 200, 0.08);
      }
      #piv-dropzone-overlay.piv-dnd--over #piv-dropzone-inner {
        border-color: rgba(0, 212, 255, 0.9);
        background: rgba(0, 212, 255, 0.07);
      }
      html.light-mode #piv-dropzone-overlay.piv-dnd--over #piv-dropzone-inner {
        border-color: rgba(0, 120, 200, 0.9);
        background: rgba(0, 120, 200, 0.05);
      }
      @keyframes piv-dnd-pulse {
        0%, 100% { box-shadow: 0 0 30px rgba(0,212,255,0.14), inset 0 0 0 1px rgba(0,212,255,0.08); }
        50%       { box-shadow: 0 0 52px rgba(0,212,255,0.28), inset 0 0 0 1px rgba(0,212,255,0.15); }
      }
      #piv-dropzone-icon svg {
        color: #00d4ff;
        filter: drop-shadow(0 0 6px rgba(0,212,255,0.5));
        animation: piv-dnd-bounce 1.4s ease-in-out infinite;
      }
      html.light-mode #piv-dropzone-icon svg {
        color: #0078c8;
        filter: drop-shadow(0 0 6px rgba(0,120,200,0.35));
      }
      @keyframes piv-dnd-bounce {
        0%, 100% { transform: translateY(0); }
        50%       { transform: translateY(-7px); }
      }
      #piv-dropzone-text {
        font-family: 'Heebo', sans-serif;
        font-size: 18px;
        font-weight: 600;
        color: #e2eaf7;
        text-align: center;
        letter-spacing: 0.01em;
        direction: rtl;
      }
      html.light-mode #piv-dropzone-text {
        color: #1a2744;
      }
      #piv-dropzone-sub {
        font-family: 'Heebo', sans-serif;
        font-size: 13px;
        color: #6b7fa3;
        text-align: center;
        direction: rtl;
      }
      #piv-dropzone-bg {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.55);
        backdrop-filter: blur(4px);
      }
    `);

    // Build overlay DOM
    const overlay = document.createElement('div');
    overlay.id = 'piv-dropzone-overlay';
    overlay.innerHTML = `
      <div id="piv-dropzone-bg"></div>
      <div id="piv-dropzone-inner">
        <div id="piv-dropzone-icon">
          <svg width="64" height="64" viewBox="0 0 64 64" fill="none"
               stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="8" y="12" width="48" height="40" rx="5"/>
            <path d="M32 36 V20"/>
            <path d="M24 27 L32 20 L40 27"/>
            <path d="M20 44 h24"/>
          </svg>
        </div>
        <div id="piv-dropzone-text">שחרר קבצים כאן לבדיקת QA</div>
        <div id="piv-dropzone-sub">.html &nbsp;·&nbsp; .js &nbsp;·&nbsp; .css</div>
      </div>
    `;
    document.body.appendChild(overlay);

    const _ALLOWED_EXTS = ['.html', '.js', '.css'];
    let _dragCounter = 0;

    /** בדיקה שיש לפחות קובץ מסוג מורשה בין הפריטים */
    function _hasAllowedFiles(items) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind !== 'file') continue;
        const name = (item.getAsFile ? (item.getAsFile() || {}).name : null) || '';
        if (_ALLOWED_EXTS.some(ext => name.endsWith(ext))) return true;
        // אם אין שם (סביבה מוגבלת) — מאפשרים בכל זאת
        if (!name) return true;
      }
      return false;
    }

    /** שליחת קובץ לאיפריים QA דרך postMessage */
    function _sendFileToQA(file) {
      const iframe = document.querySelector('#mode-qa .frame-wrap iframe') ||
                     document.querySelector('#mode-combined .frame-wrap iframe');
      if (!iframe) return;
      const reader = new FileReader();
      reader.onload = function (e) {
        try {
          iframe.contentWindow.postMessage({
            type: 'piv-qa-file-drop',
            fileName: file.name,
            fileContent: e.target.result,
            fileSize: file.size,
            mimeType: file.type
          }, '*');
        } catch (_e) { /* חסימת cross-origin — לא ניתן לשלוח */ }
      };
      reader.readAsText(file);
    }

    document.addEventListener('dragenter', function (e) {
      const items = e.dataTransfer && e.dataTransfer.items;
      if (!items || !items.length) return;
      _dragCounter++;
      overlay.classList.add('piv-dnd--visible');
    });

    document.addEventListener('dragleave', function (e) {
      _dragCounter--;
      if (_dragCounter <= 0) {
        _dragCounter = 0;
        overlay.classList.remove('piv-dnd--visible');
        overlay.classList.remove('piv-dnd--over');
      }
    });

    overlay.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      overlay.classList.add('piv-dnd--over');
    });

    overlay.addEventListener('dragleave', function () {
      overlay.classList.remove('piv-dnd--over');
    });

    overlay.addEventListener('drop', function (e) {
      e.preventDefault();
      _dragCounter = 0;
      overlay.classList.remove('piv-dnd--visible');
      overlay.classList.remove('piv-dnd--over');

      const files = e.dataTransfer && e.dataTransfer.files;
      if (!files || !files.length) return;

      let sent = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (_ALLOWED_EXTS.some(ext => file.name.endsWith(ext))) {
          _sendFileToQA(file);
          sent++;
        }
      }

      if (sent > 0 && window.PIV_TOAST) {
        window.PIV_TOAST.success('נשלחו ' + sent + ' קבצים לבדיקת QA');
      }
    });

    // סגירה בלחיצה על רקע
    document.getElementById('piv-dropzone-bg').addEventListener('click', function () {
      _dragCounter = 0;
      overlay.classList.remove('piv-dnd--visible');
      overlay.classList.remove('piv-dnd--over');
    });

    // חשיפה גלובלית לשימוש ידני
    window.PIV_DND = {
      show: function () { overlay.classList.add('piv-dnd--visible'); },
      hide: function () {
        _dragCounter = 0;
        overlay.classList.remove('piv-dnd--visible');
        overlay.classList.remove('piv-dnd--over');
      }
    };

  })(); // סוף Drag & Drop

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. Visual Diff (Code Diff Viewer)
  // ═══════════════════════════════════════════════════════════════════════════

  (function initDiff() {

    _injectCSS('piv-diff-styles', `
      #piv-diff-modal-bg {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.65);
        backdrop-filter: blur(5px);
        z-index: 10500;
        direction: rtl;
        align-items: center;
        justify-content: center;
      }
      #piv-diff-modal-bg.piv-diff--open {
        display: flex;
      }
      #piv-diff-modal {
        width: min(92vw, 1100px);
        max-height: 88vh;
        background: #0d1b2a;
        border-radius: 14px;
        border: 1px solid rgba(0,212,255,0.15);
        box-shadow: 0 24px 64px rgba(0,0,0,0.6);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        font-family: 'Heebo', sans-serif;
      }
      html.light-mode #piv-diff-modal {
        background: #f4f8ff;
        border-color: rgba(0,120,200,0.18);
        box-shadow: 0 24px 64px rgba(0,0,0,0.2);
      }
      #piv-diff-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 20px;
        border-bottom: 1px solid rgba(0,212,255,0.10);
        flex-shrink: 0;
      }
      html.light-mode #piv-diff-header {
        border-bottom-color: rgba(0,120,200,0.12);
      }
      #piv-diff-title {
        font-size: 15px;
        font-weight: 600;
        color: #e2eaf7;
        direction: rtl;
      }
      html.light-mode #piv-diff-title {
        color: #1a2744;
      }
      #piv-diff-close {
        width: 30px;
        height: 30px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 6px;
        background: rgba(255,255,255,0.06);
        color: #6b7fa3;
        cursor: pointer;
        font-size: 18px;
        line-height: 1;
        transition: background 0.15s, color 0.15s;
      }
      #piv-diff-close:hover {
        background: rgba(255,80,80,0.15);
        color: #ff6b6b;
      }
      html.light-mode #piv-diff-close {
        background: rgba(0,0,0,0.05);
        color: #5a6b88;
      }
      #piv-diff-legend {
        display: flex;
        gap: 18px;
        padding: 8px 20px;
        border-bottom: 1px solid rgba(255,255,255,0.06);
        flex-shrink: 0;
        flex-wrap: wrap;
      }
      html.light-mode #piv-diff-legend {
        border-bottom-color: rgba(0,0,0,0.07);
      }
      .piv-diff-legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        color: #6b7fa3;
        direction: rtl;
      }
      .piv-diff-legend-swatch {
        width: 12px;
        height: 12px;
        border-radius: 3px;
        flex-shrink: 0;
      }
      .piv-diff-legend-swatch--add { background: rgba(0,210,100,0.45); }
      .piv-diff-legend-swatch--del { background: rgba(255,80,80,0.4); }
      .piv-diff-legend-swatch--eq  { background: rgba(255,255,255,0.08); }
      html.light-mode .piv-diff-legend-swatch--add { background: rgba(0,170,80,0.3); }
      html.light-mode .piv-diff-legend-swatch--del { background: rgba(220,50,50,0.25); }
      html.light-mode .piv-diff-legend-swatch--eq  { background: rgba(0,0,0,0.06); }
      #piv-diff-cols-header {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0;
        flex-shrink: 0;
        border-bottom: 1px solid rgba(255,255,255,0.06);
      }
      html.light-mode #piv-diff-cols-header {
        border-bottom-color: rgba(0,0,0,0.07);
      }
      .piv-diff-col-label {
        padding: 7px 14px;
        font-size: 12px;
        font-weight: 600;
        color: #6b7fa3;
        text-align: center;
        direction: rtl;
      }
      .piv-diff-col-label:first-child {
        border-left: 1px solid rgba(255,255,255,0.06);
      }
      html.light-mode .piv-diff-col-label:first-child {
        border-left-color: rgba(0,0,0,0.07);
      }
      #piv-diff-body {
        display: grid;
        grid-template-columns: 1fr 1fr;
        overflow-y: auto;
        flex: 1;
      }
      #piv-diff-left, #piv-diff-right {
        overflow-x: auto;
        font-family: 'Courier New', Consolas, monospace;
        font-size: 12.5px;
        line-height: 1.6;
      }
      #piv-diff-left {
        border-left: 1px solid rgba(255,255,255,0.06);
      }
      html.light-mode #piv-diff-left {
        border-left-color: rgba(0,0,0,0.07);
      }
      .piv-diff-line {
        display: flex;
        align-items: flex-start;
        min-height: 22px;
        padding: 0 10px;
        white-space: pre;
        direction: ltr;
        text-align: left;
      }
      .piv-diff-line--add {
        background: rgba(0,210,100,0.13);
        color: #7fff9a;
      }
      .piv-diff-line--del {
        background: rgba(255,80,80,0.13);
        color: #ffaaaa;
        text-decoration: line-through;
        text-decoration-color: rgba(255,80,80,0.4);
      }
      .piv-diff-line--eq {
        color: #9aabcb;
      }
      html.light-mode .piv-diff-line--add {
        background: rgba(0,170,80,0.1);
        color: #186e35;
      }
      html.light-mode .piv-diff-line--del {
        background: rgba(220,50,50,0.1);
        color: #9c1c1c;
      }
      html.light-mode .piv-diff-line--eq {
        color: #3a4a66;
      }
      .piv-diff-line-num {
        min-width: 32px;
        color: rgba(107,127,163,0.5);
        user-select: none;
        font-size: 11px;
        padding-top: 1px;
        flex-shrink: 0;
        text-align: right;
        margin-left: 8px;
      }
      .piv-diff-line-gutter {
        min-width: 16px;
        color: rgba(107,127,163,0.6);
        user-select: none;
        font-size: 12px;
        flex-shrink: 0;
        margin-left: 4px;
      }
      .piv-diff-line--add .piv-diff-line-gutter { color: #7fff9a; }
      .piv-diff-line--del .piv-diff-line-gutter { color: #ffaaaa; }
      html.light-mode .piv-diff-line--add .piv-diff-line-gutter { color: #186e35; }
      html.light-mode .piv-diff-line--del .piv-diff-line-gutter { color: #9c1c1c; }
      .piv-diff-line-content { flex: 1; overflow: hidden; text-overflow: ellipsis; }
    `);

    // Build modal DOM
    const bg = document.createElement('div');
    bg.id = 'piv-diff-modal-bg';
    bg.innerHTML = `
      <div id="piv-diff-modal" role="dialog" aria-modal="true" aria-labelledby="piv-diff-title">
        <div id="piv-diff-header">
          <span id="piv-diff-title">השוואת קוד</span>
          <button id="piv-diff-close" title="סגור" aria-label="סגור">×</button>
        </div>
        <div id="piv-diff-legend">
          <span class="piv-diff-legend-item">
            <span class="piv-diff-legend-swatch piv-diff-legend-swatch--add"></span> תוספת
          </span>
          <span class="piv-diff-legend-item">
            <span class="piv-diff-legend-swatch piv-diff-legend-swatch--del"></span> מחיקה
          </span>
          <span class="piv-diff-legend-item">
            <span class="piv-diff-legend-swatch piv-diff-legend-swatch--eq"></span> ללא שינוי
          </span>
        </div>
        <div id="piv-diff-cols-header">
          <div class="piv-diff-col-label">אחרי</div>
          <div class="piv-diff-col-label">לפני</div>
        </div>
        <div id="piv-diff-body">
          <div id="piv-diff-right"></div>
          <div id="piv-diff-left"></div>
        </div>
      </div>
    `;
    document.body.appendChild(bg);

    const _modal    = document.getElementById('piv-diff-modal');
    const _titleEl  = document.getElementById('piv-diff-title');
    const _leftEl   = document.getElementById('piv-diff-left');
    const _rightEl  = document.getElementById('piv-diff-right');
    const _closeBtn = document.getElementById('piv-diff-close');

    _closeBtn.addEventListener('click', _close);
    bg.addEventListener('click', function (e) { if (e.target === bg) _close(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && bg.classList.contains('piv-diff--open')) _close();
    });

    function _close() {
      bg.classList.remove('piv-diff--open');
    }

    function _escapeHTML(str) {
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }

    /**
     * חישוב diff פשוט שורה-לפי-שורה (LCS)
     * מחזיר מערך אובייקטים: { type: 'eq'|'add'|'del', left, right }
     * @param {string[]} orig
     * @param {string[]} mod
     * @returns {Array<{type:string, orig:string|null, mod:string|null}>}
     */
    function _computeDiff(orig, mod) {
      const m = orig.length;
      const n = mod.length;

      // LCS DP — מוגבל ל-500 שורות לביצועים
      const maxLines = 500;
      const aLines = orig.slice(0, maxLines);
      const bLines = mod.slice(0, maxLines);
      const al = aLines.length;
      const bl = bLines.length;

      // בנייה רק על שתי שורות אחרונות לחיסכון בזיכרון
      let prev = new Uint16Array(bl + 1);
      let curr = new Uint16Array(bl + 1);
      const dp = [];
      for (let i = 0; i <= al; i++) dp.push(new Uint16Array(bl + 1));
      for (let i = 1; i <= al; i++) {
        for (let j = 1; j <= bl; j++) {
          if (aLines[i - 1] === bLines[j - 1]) {
            dp[i][j] = dp[i - 1][j - 1] + 1;
          } else {
            dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
          }
        }
      }

      // backtrack
      const result = [];
      let i = al, j = bl;
      while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
          result.push({ type: 'eq', orig: aLines[i - 1], mod: bLines[j - 1] });
          i--; j--;
        } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
          result.push({ type: 'add', orig: null, mod: bLines[j - 1] });
          j--;
        } else {
          result.push({ type: 'del', orig: aLines[i - 1], mod: null });
          i--;
        }
      }

      // שורות שחרגו מהמגבלה
      for (let k = maxLines; k < m; k++) {
        result.push({ type: 'del', orig: orig[k], mod: null });
      }
      for (let k = maxLines; k < n; k++) {
        result.push({ type: 'add', orig: null, mod: mod[k] });
      }

      return result.reverse();
    }

    /** עיבוד הצד הימני (modified) */
    function _renderSide(container, lines, side) {
      container.innerHTML = '';
      const frag = document.createDocumentFragment();
      let lineNum = 0;
      lines.forEach(function (entry) {
        const text = side === 'left' ? entry.orig : entry.mod;
        if (text === null) {
          // שורה ריקה (placeholder לצד הנגדי)
          const div = document.createElement('div');
          div.className = 'piv-diff-line';
          div.style.opacity = '0.25';
          div.innerHTML = '<span class="piv-diff-line-num">&nbsp;</span><span class="piv-diff-line-gutter">&nbsp;</span><span class="piv-diff-line-content">&nbsp;</span>';
          frag.appendChild(div);
          return;
        }
        lineNum++;
        const div = document.createElement('div');
        let cls = 'piv-diff-line';
        let gutter = ' ';
        if (entry.type === 'add') { cls += ' piv-diff-line--add'; gutter = '+'; }
        else if (entry.type === 'del') { cls += ' piv-diff-line--del'; gutter = '−'; }
        div.className = cls;
        div.innerHTML =
          '<span class="piv-diff-line-num">' + lineNum + '</span>' +
          '<span class="piv-diff-line-gutter">' + gutter + '</span>' +
          '<span class="piv-diff-line-content">' + _escapeHTML(text) + '</span>';
        frag.appendChild(div);
      });
      container.appendChild(frag);
    }

    window.PIV_DIFF = {
      /**
       * פתיחת מודל Diff
       * @param {string} originalCode — קוד מקורי (לפני)
       * @param {string} modifiedCode — קוד מעודכן (אחרי)
       * @param {string} [title] — כותרת
       */
      show: function (originalCode, modifiedCode, title) {
        _titleEl.textContent = title || 'השוואת קוד — לפני / אחרי';
        const origLines = String(originalCode).split('\n');
        const modLines  = String(modifiedCode).split('\n');
        const diff      = _computeDiff(origLines, modLines);
        _renderSide(_leftEl, diff, 'left');
        _renderSide(_rightEl, diff, 'right');
        bg.classList.add('piv-diff--open');
        _modal.focus && _modal.focus();
      },
      close: function () { _close(); },
      isOpen: function () { return bg.classList.contains('piv-diff--open'); }
    };

  })(); // סוף Visual Diff

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. Favorites System
  // ═══════════════════════════════════════════════════════════════════════════

  (function initFavorites() {

    // מפתח ב-storage (obfuscated key name)
    var _KEY = 'piv_favorites';

    function _load() {
      try {
        var raw = _sGet(_KEY);
        if (!raw) return [];
        var arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
      } catch (e) { return []; }
    }

    function _save(arr) {
      _sSet(_KEY, JSON.stringify(arr));
      // שידור אירוע שינוי מועדפים
      try {
        window.dispatchEvent(new CustomEvent('piv-favorites-changed', { detail: { favorites: arr.slice() } }));
      } catch (e) { /* ישן מדי */ }
    }

    window.PIV_FAVORITES = {
      /** הוספת סמל למועדפים */
      add: function (symbolName) {
        var list = _load();
        if (list.indexOf(symbolName) === -1) {
          list.push(symbolName);
          _save(list);
        }
        return list;
      },
      /** הסרת סמל מהמועדפים */
      remove: function (symbolName) {
        var list = _load().filter(function (s) { return s !== symbolName; });
        _save(list);
        return list;
      },
      /** קבלת כל המועדפים */
      getAll: function () {
        return _load();
      },
      /** בדיקה האם סמל מועדף */
      isBookmarked: function (symbolName) {
        return _load().indexOf(symbolName) !== -1;
      },
      /** הפעלת/ביטול מועדף */
      toggle: function (symbolName) {
        if (this.isBookmarked(symbolName)) {
          return this.remove(symbolName);
        } else {
          return this.add(symbolName);
        }
      }
    };

  })(); // סוף Favorites

  // ═══════════════════════════════════════════════════════════════════════════
  // 4. Navigation History
  // ═══════════════════════════════════════════════════════════════════════════

  (function initNavHistory() {

    const MAX_HISTORY = 50;

    var _stack   = [];   // מחסנית אחורה
    var _forward = [];   // מחסנית קדימה
    var _current = null; // מצב נוכחי

    /** שליחת אירוע ניווט */
    function _dispatchNavRequest(mode) {
      try {
        window.dispatchEvent(new CustomEvent('piv-nav-request', { detail: { mode: mode } }));
      } catch (e) { /* ישן מדי */ }
    }

    window.PIV_NAV_HISTORY = {
      /** רישום שינוי מצב להיסטוריה */
      push: function (mode) {
        if (!mode) return;
        if (_current === mode) return; // אין שינוי
        if (_current !== null) {
          _stack.push(_current);
          if (_stack.length > MAX_HISTORY) _stack.shift();
        }
        _current = mode;
        _forward = []; // מחיקת קדימה בניווט חדש
      },
      /** ניווט אחורה */
      back: function () {
        if (!this.canGoBack()) return false;
        if (_current !== null) _forward.unshift(_current);
        _current = _stack.pop();
        _dispatchNavRequest(_current);
        return true;
      },
      /** ניווט קדימה */
      forward: function () {
        if (!this.canGoForward()) return false;
        if (_current !== null) _stack.push(_current);
        _current = _forward.shift();
        _dispatchNavRequest(_current);
        return true;
      },
      /** האם ניתן לנווט אחורה */
      canGoBack: function () { return _stack.length > 0; },
      /** האם ניתן לנווט קדימה */
      canGoForward: function () { return _forward.length > 0; },
      /** קבלת מצב נוכחי */
      getCurrent: function () { return _current; },
      /** קבלת גודל המחסנית */
      stackSize: function () { return _stack.length; }
    };

    // ─── מאזין לשינויי מצב מה-launcher ────────────────────────────────────────
    window.addEventListener('piv-mode-changed', function (e) {
      if (e && e.detail && e.detail.mode) {
        window.PIV_NAV_HISTORY.push(e.detail.mode);
      }
    });

    // ─── קיצורי מקלדת: Ctrl+[ אחורה, Ctrl+] קדימה ───────────────────────────
    document.addEventListener('keydown', function (e) {
      if (!e.ctrlKey) return;
      if (e.key === '[' || e.key === 'BracketLeft') {
        e.preventDefault();
        if (window.PIV_NAV_HISTORY.canGoBack()) {
          window.PIV_NAV_HISTORY.back();
          if (window.PIV_TOAST) window.PIV_TOAST.info('ניווט אחורה');
        }
      } else if (e.key === ']' || e.key === 'BracketRight') {
        e.preventDefault();
        if (window.PIV_NAV_HISTORY.canGoForward()) {
          window.PIV_NAV_HISTORY.forward();
          if (window.PIV_TOAST) window.PIV_TOAST.info('ניווט קדימה');
        }
      }
    });

  })(); // סוף Navigation History

  // ═══════════════════════════════════════════════════════════════════════════
  // 5. Toast Notifications
  // ═══════════════════════════════════════════════════════════════════════════

  (function initToast() {

    _injectCSS('piv-toast-styles', `
      #piv-toast-container {
        position: fixed;
        bottom: 76px;
        left: 16px;
        right: auto;
        z-index: 11000;
        display: flex;
        flex-direction: column-reverse;
        gap: 8px;
        pointer-events: none;
        direction: rtl;
      }
      .piv-toast {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 240px;
        max-width: 340px;
        padding: 11px 14px;
        border-radius: 10px;
        font-family: 'Heebo', sans-serif;
        font-size: 13.5px;
        font-weight: 500;
        color: #e2eaf7;
        border-left: 4px solid transparent;
        box-shadow: 0 6px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.05);
        pointer-events: all;
        cursor: default;
        animation: piv-toast-in 0.28s cubic-bezier(0.34, 1.4, 0.64, 1) both;
        direction: rtl;
        position: relative;
        overflow: hidden;
        backdrop-filter: blur(10px);
        -webkit-backdrop-filter: blur(10px);
      }
      .piv-toast::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        height: 3px;
        background: currentColor;
        opacity: 0.3;
        animation: piv-toast-timer 4s linear forwards;
        width: 100%;
      }
      @keyframes piv-toast-timer {
        from { width: 100%; }
        to   { width: 0%; }
      }
      .piv-toast--success {
        background: rgba(10, 30, 20, 0.92);
        border-left-color: #00d28a;
      }
      .piv-toast--info {
        background: rgba(10, 20, 38, 0.92);
        border-left-color: #00d4ff;
      }
      .piv-toast--warning {
        background: rgba(28, 22, 8, 0.92);
        border-left-color: #f6b000;
      }
      .piv-toast--error {
        background: rgba(30, 10, 10, 0.92);
        border-left-color: #ff5252;
      }
      html.light-mode .piv-toast {
        color: #1a2744;
        box-shadow: 0 6px 24px rgba(0,0,0,0.12), inset 0 1px 0 rgba(255,255,255,0.6);
      }
      html.light-mode .piv-toast--success { background: rgba(235, 255, 245, 0.96); }
      html.light-mode .piv-toast--info    { background: rgba(235, 248, 255, 0.96); }
      html.light-mode .piv-toast--warning { background: rgba(255, 250, 225, 0.96); }
      html.light-mode .piv-toast--error   { background: rgba(255, 238, 238, 0.96); }
      .piv-toast-icon {
        flex-shrink: 0;
        width: 20px;
        height: 20px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        line-height: 1;
      }
      .piv-toast-icon--success { color: #00d28a; }
      .piv-toast-icon--info    { color: #00d4ff; }
      .piv-toast-icon--warning { color: #f6b000; }
      .piv-toast-icon--error   { color: #ff5252; }
      .piv-toast-msg {
        flex: 1;
        line-height: 1.4;
      }
      .piv-toast-close {
        flex-shrink: 0;
        width: 18px;
        height: 18px;
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        background: none;
        color: rgba(107,127,163,0.6);
        cursor: pointer;
        font-size: 14px;
        padding: 0;
        line-height: 1;
        transition: color 0.15s;
        border-radius: 4px;
      }
      .piv-toast-close:hover { color: #e2eaf7; }
      html.light-mode .piv-toast-close:hover { color: #1a2744; }
      @keyframes piv-toast-in {
        from { opacity: 0; transform: translateX(-24px) scale(0.94); }
        to   { opacity: 1; transform: translateX(0)    scale(1); }
      }
      .piv-toast--out {
        animation: piv-toast-out 0.22s ease-in forwards;
      }
      @keyframes piv-toast-out {
        from { opacity: 1; transform: translateX(0)    scale(1); }
        to   { opacity: 0; transform: translateX(-16px) scale(0.94); }
      }
    `);

    // אתחול container
    var _container = document.createElement('div');
    _container.id = 'piv-toast-container';
    document.body.appendChild(_container);

    var _ICONS = {
      success: '✓',
      info:    'ℹ',
      warning: '⚠',
      error:   '✕'
    };

    var _MAX_TOASTS = 3;
    var _activeToasts = [];

    function _dismissToast(el) {
      if (!el || !el.parentNode) return;
      el.classList.add('piv-toast--out');
      setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
        var idx = _activeToasts.indexOf(el);
        if (idx !== -1) _activeToasts.splice(idx, 1);
      }, 250);
    }

    /**
     * הצגת Toast
     * @param {string} message — הודעה
     * @param {'success'|'info'|'warning'|'error'} type — סוג
     */
    function _show(message, type) {
      type = type || 'info';

      // הסרת Toast ישן אם הגענו למגבלה
      while (_activeToasts.length >= _MAX_TOASTS) {
        _dismissToast(_activeToasts[0]);
      }

      var toast = document.createElement('div');
      toast.className = 'piv-toast piv-toast--' + type;
      toast.setAttribute('role', 'alert');
      toast.setAttribute('aria-live', 'assertive');
      toast.innerHTML =
        '<span class="piv-toast-icon piv-toast-icon--' + type + '">' + (_ICONS[type] || 'ℹ') + '</span>' +
        '<span class="piv-toast-msg">' + String(message) + '</span>' +
        '<button class="piv-toast-close" aria-label="סגור הודעה">×</button>';

      _container.appendChild(toast);
      _activeToasts.push(toast);

      // סגירה בלחיצה
      toast.querySelector('.piv-toast-close').addEventListener('click', function () {
        _dismissToast(toast);
      });

      // סגירה אוטומטית אחרי 4 שניות
      setTimeout(function () { _dismissToast(toast); }, 4000);

      return toast;
    }

    window.PIV_TOAST = {
      success: function (msg) { return _show(msg, 'success'); },
      info:    function (msg) { return _show(msg, 'info'); },
      warning: function (msg) { return _show(msg, 'warning'); },
      error:   function (msg) { return _show(msg, 'error'); }
    };

  })(); // סוף Toast

  // ═══════════════════════════════════════════════════════════════════════════
  // 6. Browser Notifications
  // ═══════════════════════════════════════════════════════════════════════════

  (function initBrowserNotify() {

    // מפתח ב-storage — האם כבר ביקשנו הרשאה
    var _KEY_PERM = 'piv_notif_asked';

    /** בדיקת תמיכה */
    function _isSupported() {
      return 'Notification' in window;
    }

    /** בדיקה אם הוראות מאושרות */
    function _isGranted() {
      return _isSupported() && Notification.permission === 'granted';
    }

    window.PIV_NOTIFY = {
      /** בקשת הרשאת התראות */
      requestPermission: function () {
        if (!_isSupported()) {
          if (window.PIV_TOAST) window.PIV_TOAST.warning('הדפדפן אינו תומך בהתראות');
          return Promise.resolve('denied');
        }
        if (_isGranted()) return Promise.resolve('granted');
        return Notification.requestPermission().then(function (perm) {
          _sSet(_KEY_PERM, '1');
          if (perm === 'granted') {
            if (window.PIV_TOAST) window.PIV_TOAST.success('התראות דפדפן הופעלו');
          } else {
            if (window.PIV_TOAST) window.PIV_TOAST.warning('הרשאת התראות נדחתה');
          }
          return perm;
        });
      },

      /**
       * שליחת התראת דפדפן
       * @param {string} title
       * @param {string} body
       * @param {Object} [options]
       * @returns {Notification|null}
       */
      send: function (title, body, options) {
        if (!_isGranted()) return null;
        try {
          var opts = Object.assign({
            body: body || '',
            icon: 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 32 32\'><rect width=\'32\' height=\'32\' rx=\'6\' fill=\'%230d1b2a\'/><path d=\'M8 16 L13 21 L24 11\' stroke=\'%2300d4ff\' stroke-width=\'3\' stroke-linecap=\'round\' stroke-linejoin=\'round\' fill=\'none\'/></svg>',
            badge: 'data:image/svg+xml,<svg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 16 16\'><circle cx=\'8\' cy=\'8\' r=\'7\' fill=\'%2300d4ff\'/></svg>',
            dir: 'rtl',
            lang: 'he'
          }, options || {});
          var notif = new Notification(title || 'PI Vision QA', opts);
          notif.onclick = function () { window.focus(); notif.close(); };
          return notif;
        } catch (e) { return null; }
      },

      /** בדיקה האם התראות מופעלות */
      isEnabled: function () { return _isGranted(); }
    };

    // ─── בקשת הרשאה אוטומטית בשגיאת QA קריטית ─────────────────────────────

    var _notifAsked = !!_sGet(_KEY_PERM);

    /**
     * מאזין לאירועי שגיאה קריטית מה-QA
     * כאשר האיפריים שולח הודעה עם type 'piv-qa-critical-error'
     */
    window.addEventListener('message', function (e) {
      if (!e.data || e.data.type !== 'piv-qa-critical-error') return;

      // אם הטאב לא פעיל — שלח התראת דפדפן
      if (document.hidden) {
        if (_isGranted()) {
          window.PIV_NOTIFY.send(
            'QA — שגיאה קריטית 🔴',
            e.data.message || 'נמצאה שגיאה קריטית בסמל',
            { tag: 'piv-qa-critical' }
          );
        }
      }

      // אם לא שאלנו עדיין — הצג Toast עם בקשה
      if (!_notifAsked && !_isGranted() && _isSupported()) {
        _notifAsked = true;
        if (window.PIV_TOAST) {
          window.PIV_TOAST.warning('אפשר התראות כדי לקבל עדכון גם כשהטאב ברקע');
        }
        // בקשת הרשאה אוטומטית אחרי 1.5 שניות
        setTimeout(function () {
          window.PIV_NOTIFY.requestPermission();
        }, 1500);
      }
    });

    // ─── בקשת הרשאה פרואקטיבית כאשר משתמש עובר למצב combined ───────────────
    window.addEventListener('piv-mode-changed', function (e) {
      if (!e || !e.detail || e.detail.mode !== 'combined') return;
      if (_notifAsked || _isGranted() || !_isSupported()) return;
      // חכה מעט לפני הבקשה
      setTimeout(function () {
        if (_isGranted() || _notifAsked) return;
        _notifAsked = true;
        if (window.PIV_TOAST) {
          window.PIV_TOAST.info('QA ברקע — אפשר התראות לעדכונים מיידיים');
        }
      }, 3000);
    });

  })(); // סוף Browser Notifications

  // ─── אתחול ─────────────────────────────────────────────────────────────────
  console.log('[PIV-UX-ADV] ux-advanced.js v2.3.0 — 6 מודולי UX מוכנים');
  console.log('[PIV-UX-ADV] PIV_DND, PIV_DIFF, PIV_FAVORITES, PIV_NAV_HISTORY, PIV_TOAST, PIV_NOTIFY');

})(); // סוף IIFE ראשי
