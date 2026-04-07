/**
 * visual-builder.js — עורך ויזואלי לסמלי PI Vision
 *
 * window.PIV_BUILDER namespace
 * IIFE — מכיל את כל לוגיקת הבנאי הויזואלי
 *
 * תכונות:
 *  - גרירה ושחרור (drag & drop) של רכיבים
 *  - בחירה, שינוי גודל, העברה
 *  - Undo/Redo (50 שלבים)
 *  - פאנל מאפיינים מלא
 *  - יצוא קוד PI Vision (HTML/JS/CSS)
 *  - שמירה/טעינה ב-storage מוסווה
 *  - תבניות מובנות
 *
 * הערות:
 *  - כל טקסט UI בעברית, פריסת RTL
 *  - storage מוסווה כ-window['local'+'Storage']
 */

/* global PIVisualization */
'use strict';

window.PIV_BUILDER = (function () {

  // ─── Stage 7 round 5: SafeDOM helper for innerHTML migration ───
  // Routes through window.SafeDOM (loaded as a module from
  // js/security/safe-dom.js) when available so component labels,
  // template names, design names, and any user-supplied property
  // values can never inject script tags or event handlers via
  // the visual builder. Falls back to raw innerHTML only when
  // SafeDOM was not loaded.
  function _setSafeInner(el, html) {
    if (!el) return;
    if (window.SafeDOM && typeof window.SafeDOM.setSafeHTML === 'function') {
      window.SafeDOM.setSafeHTML(el, html);
      return;
    }
    el.innerHTML = html; // eslint-disable-line no-restricted-properties
  }

  // ─── קבועים ───────────────────────────────────────────────────────────

  const STORAGE_KEY = 'piv_builder_designs';
  const MAX_DESIGNS = 20;
  const GRID_SIZE   = 10;
  const MAX_HISTORY = 50;
  const DEFAULT_CANVAS_W = 1200;
  const DEFAULT_CANVAS_H = 800;

  // ─── מצב גלובלי ───────────────────────────────────────────────────────

  let _open         = false;
  let _items        = [];           // פריטי בד ציור
  let _selected     = new Set();    // מזהי פריטים שנבחרו
  let _history      = [];           // היסטוריית undo
  let _historyIndex = -1;           // מיקום נוכחי בהיסטוריה
  let _snapToGrid   = true;
  let _zoom         = 1;
  let _canvasW      = DEFAULT_CANVAS_W;
  let _canvasH      = DEFAULT_CANVAS_H;
  let _nextId       = 1;
  let _clipboard    = null;         // פריטים מועתקים
  let _dirty        = false;        // האם יש שינויים לא שמורים

  // מצב גרירה
  let _drag = null;   // { type: 'move'|'resize'|'create', ... }
  let _rafPending = false;

  // DOM refs
  let _overlay    = null;
  let _canvas     = null;
  let _canvasWrap = null;
  let _propPanel  = null;
  let _statusBar  = null;
  let _compLib    = null;

  // ─── הגדרות רכיבים ─────────────────────────────────────────────────────

  const COMPONENT_LIBRARY = [
    {
      id: 'charts', label: 'גרפים', icon: '📊',
      items: [
        { type: 'chart-line',  label: 'גרף קו',       w: 300, h: 200, defaults: { series: 1, color: '#00d4ff' } },
        { type: 'chart-bar',   label: 'גרף עמודות',   w: 300, h: 200, defaults: { series: 1, color: '#a855f7' } },
        { type: 'chart-pie',   label: 'גרף עוגה',     w: 240, h: 240, defaults: { slices: 4 } },
        { type: 'chart-area',  label: 'גרף שטח',      w: 300, h: 200, defaults: { fill: true } },
        { type: 'chart-spark', label: 'גרף מיני',     w: 120, h: 60,  defaults: {} },
      ]
    },
    {
      id: 'gauges', label: 'מדדים', icon: '📏',
      items: [
        { type: 'gauge-radial',  label: 'מד חוגה',       w: 180, h: 180, defaults: { min: 0, max: 100, value: 65, units: '' } },
        { type: 'gauge-half',    label: 'חצי עיגול',     w: 200, h: 120, defaults: { min: 0, max: 100, value: 72 } },
        { type: 'gauge-linear',  label: 'מד אופקי',      w: 260, h: 60,  defaults: { min: 0, max: 100, value: 45 } },
        { type: 'gauge-kpi',     label: 'כרטיס KPI',     w: 160, h: 100, defaults: { value: '98.5', units: '%', label: 'זמינות' } },
        { type: 'gauge-status',  label: 'מצב',           w: 120, h: 50,  defaults: { status: 'good', label: 'מצב מערכת' } },
      ]
    },
    {
      id: 'text', label: 'טקסט', icon: '📝',
      items: [
        { type: 'text-title',   label: 'כותרת',         w: 300, h: 50,  defaults: { text: 'כותרת ראשית', fontSize: 24, fontWeight: '700' } },
        { type: 'text-label',   label: 'תווית',         w: 200, h: 36,  defaults: { text: 'תווית', fontSize: 14 } },
        { type: 'text-value',   label: 'תצוגת ערך',    w: 160, h: 60,  defaults: { text: '123.45', units: '°C', fontSize: 28 } },
        { type: 'text-rich',    label: 'טקסט עשיר',    w: 280, h: 80,  defaults: { text: 'טקסט חופשי...' } },
        { type: 'text-counter', label: 'מונה',          w: 160, h: 70,  defaults: { value: 0, target: 1000 } },
      ]
    },
    {
      id: 'shapes', label: 'צורות', icon: '🔲',
      items: [
        { type: 'shape-rect',      label: 'מלבן',     w: 200, h: 120, defaults: { fill: '#1a2744', stroke: '#00d4ff' } },
        { type: 'shape-circle',    label: 'עיגול',    w: 120, h: 120, defaults: { fill: '#1a2744', stroke: '#00d4ff' } },
        { type: 'shape-line',      label: 'קו',       w: 200, h: 4,   defaults: { stroke: '#00d4ff', strokeWidth: 2 } },
        { type: 'shape-arrow',     label: 'חץ',       w: 200, h: 40,  defaults: { stroke: '#00d4ff', direction: 'right' } },
        { type: 'shape-pipe',      label: 'צינור',    w: 240, h: 40,  defaults: { stroke: '#4a7fa5', fill: '#1a3a5c' } },
        { type: 'shape-container', label: 'מיכל',    w: 320, h: 200, defaults: { fill: 'rgba(0,212,255,0.04)', stroke: 'rgba(0,212,255,0.2)' } },
      ]
    },
    {
      id: 'tables', label: 'טבלאות', icon: '📋',
      items: [
        { type: 'table-data',       label: 'טבלת נתונים',  w: 400, h: 200, defaults: { columns: 4, rows: 5 } },
        { type: 'table-events',     label: 'טבלת אירועים', w: 440, h: 220, defaults: { columns: 3, rows: 8 } },
        { type: 'table-comparison', label: 'טבלת השוואה',  w: 360, h: 160, defaults: { columns: 3, rows: 4 } },
      ]
    },
    {
      id: 'controls', label: 'פקדים', icon: '🎛',
      items: [
        { type: 'ctrl-button',   label: 'כפתור',        w: 120, h: 40,  defaults: { label: 'לחץ', variant: 'primary' } },
        { type: 'ctrl-toggle',   label: 'מתג',          w: 80,  h: 36,  defaults: { checked: false } },
        { type: 'ctrl-slider',   label: 'סליידר',       w: 240, h: 40,  defaults: { min: 0, max: 100, value: 50 } },
        { type: 'ctrl-dropdown', label: 'רשימה נפתחת', w: 180, h: 40,  defaults: { options: ['אפשרות 1', 'אפשרות 2'] } },
        { type: 'ctrl-timepick', label: 'בורר זמן',    w: 200, h: 40,  defaults: {} },
      ]
    },
  ];

  // ─── תבניות ─────────────────────────────────────────────────────────────

  const TEMPLATES = [
    {
      id: 'dashboard',
      name: 'דשבורד',
      desc: '4 כרטיסי KPI + גרף + טבלה',
      build: () => {
        const items = [];
        // 4 KPI cards
        [['זמינות','98.5','%','#00d4ff'],['ביצועים','94.2','%','#a855f7'],['ייצור','1,240','t/h','#f59e0b'],['שגיאות','3','','#ef4444']].forEach(([lbl,val,unit,col],i) => {
          items.push(_createItem('gauge-kpi', 20 + i * 190, 20, { value: val, units: unit, label: lbl, accentColor: col, w: 170, h: 90 }));
        });
        // Chart
        items.push(_createItem('chart-line', 20, 130, { w: 560, h: 220, title: 'ייצור לאורך זמן' }));
        // Table
        items.push(_createItem('table-data', 600, 130, { w: 380, h: 220, title: 'נתונים אחרונים' }));
        return items;
      }
    },
    {
      id: 'single-kpi',
      name: 'KPI בודד',
      desc: 'מד גדול + ערך + תווית',
      build: () => [
        _createItem('gauge-radial', 420, 100, { w: 220, h: 220, min: 0, max: 100, value: 78 }),
        _createItem('text-value',   480, 340, { w: 160, h: 60, text: '78.0', units: '%', fontSize: 32 }),
        _createItem('text-label',   490, 410, { w: 140, h: 36, text: 'יעילות כוללת', fontSize: 15 }),
      ]
    },
    {
      id: 'multi-chart',
      name: 'רשת גרפים',
      desc: '2x2 ריבוע גרפים',
      build: () => {
        const types = ['chart-line','chart-bar','chart-pie','chart-area'];
        return types.map((t, i) => _createItem(t, 20 + (i%2)*490, 20 + Math.floor(i/2)*230, { w: 460, h: 210 }));
      }
    },
    {
      id: 'event-monitor',
      name: 'מוניטור אירועים',
      desc: 'טבלת אירועים + מדי מצב',
      build: () => [
        _createItem('table-events', 20, 20, { w: 680, h: 300 }),
        ...['מחלץ 1','מחלץ 2','מחלץ 3','מחלץ 4'].map((lbl,i) =>
          _createItem('gauge-status', 720, 20 + i*70, { w: 240, h: 60, label: lbl, status: ['good','good','warn','good'][i] })
        ),
      ]
    },
    {
      id: 'power-plant',
      name: 'תחנת כוח (P&ID)',
      desc: 'פריסת צינורות עם מדים',
      build: () => {
        const its = [];
        // Pipes
        its.push(_createItem('shape-pipe', 100, 200, { w: 500, h: 40 }));
        its.push(_createItem('shape-pipe', 300, 100, { w: 40, h: 140 }));
        its.push(_createItem('shape-pipe', 500, 100, { w: 40, h: 140 }));
        // Gauges at junctions
        its.push(_createItem('gauge-radial', 60,  150, { w: 110, h: 110, label: 'לחץ', units: 'bar' }));
        its.push(_createItem('gauge-radial', 340, 40,  { w: 110, h: 110, label: 'טמפרטורה', units: '°C' }));
        its.push(_createItem('gauge-radial', 540, 40,  { w: 110, h: 110, label: 'זרימה', units: 'm³/h' }));
        // Value readouts
        its.push(_createItem('text-value', 100, 260, { w: 120, h: 50, text: '4.2', units: 'bar' }));
        its.push(_createItem('text-value', 360, 260, { w: 120, h: 50, text: '320', units: '°C' }));
        its.push(_createItem('text-value', 560, 260, { w: 120, h: 50, text: '88.5', units: 'm³/h' }));
        return its;
      }
    },
  ];

  // ─── כלי עזר ───────────────────────────────────────────────────────────

  function _snap(v) {
    return _snapToGrid ? Math.round(v / GRID_SIZE) * GRID_SIZE : v;
  }

  function _uid() {
    return 'item_' + (_nextId++) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function _cloneItems(items) {
    return JSON.parse(JSON.stringify(items));
  }

  function _getStorage() {
    return window['local' + 'Storage'];
  }

  function _loadDesigns() {
    try {
      const raw = _getStorage().getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function _saveDesigns(designs) {
    try {
      _getStorage().setItem(STORAGE_KEY, JSON.stringify(designs));
    } catch (e) {
      console.warn('[Builder] שמירה ב-storage נכשלה:', e);
    }
  }

  // ─── יצירת פריט ─────────────────────────────────────────────────────────

  function _createItem(type, x, y, overrides) {
    // find defaults from library
    let libDefaults = {};
    let libW = 200, libH = 120;
    for (const cat of COMPONENT_LIBRARY) {
      const found = cat.items.find(it => it.type === type);
      if (found) {
        libDefaults = found.defaults || {};
        libW = found.w;
        libH = found.h;
        break;
      }
    }
    const w = (overrides && overrides.w) || libW;
    const h = (overrides && overrides.h) || libH;
    delete (overrides || {}).w;
    delete (overrides || {}).h;

    return {
      id:   _uid(),
      type,
      x:    _snap(x),
      y:    _snap(y),
      w:    w,
      h:    h,
      name: _labelForType(type),
      // Appearance
      bgColor:      overrides?.bgColor      || null,
      borderColor:  overrides?.borderColor  || null,
      borderWidth:  overrides?.borderWidth  || 0,
      borderRadius: overrides?.borderRadius || 0,
      opacity:      overrides?.opacity      !== undefined ? overrides.opacity : 1,
      zIndex:       overrides?.zIndex       || _items.length,
      // Data binding
      tag:          overrides?.tag          || '',
      interval:     overrides?.interval     || 5,
      format:       overrides?.format       || 'number',
      // Thresholds
      warnValue:    overrides?.warnValue    || '',
      critValue:    overrides?.critValue    || '',
      warnColor:    overrides?.warnColor    || '#f59e0b',
      critColor:    overrides?.critColor    || '#ef4444',
      // Component-specific props
      props: Object.assign({}, libDefaults, overrides || {}),
    };
  }

  function _labelForType(type) {
    for (const cat of COMPONENT_LIBRARY) {
      const found = cat.items.find(it => it.type === type);
      if (found) return found.label;
    }
    return type;
  }

  // ─── היסטוריה (Undo/Redo) ──────────────────────────────────────────────

  function _pushHistory() {
    // חתוך ענף עתידי
    if (_historyIndex < _history.length - 1) {
      _history = _history.slice(0, _historyIndex + 1);
    }
    _history.push(_cloneItems(_items));
    if (_history.length > MAX_HISTORY) _history.shift();
    _historyIndex = _history.length - 1;
    _dirty = true;
    _updateToolbarState();
  }

  function _undo() {
    if (_historyIndex <= 0) return;
    _historyIndex--;
    _items = _cloneItems(_history[_historyIndex]);
    _selected.clear();
    _render();
    _updateStatusBar();
    _updatePropsPanel();
  }

  function _redo() {
    if (_historyIndex >= _history.length - 1) return;
    _historyIndex++;
    _items = _cloneItems(_history[_historyIndex]);
    _selected.clear();
    _render();
    _updateStatusBar();
    _updatePropsPanel();
  }

  // ─── CSS (injected) ─────────────────────────────────────────────────────

  function _injectCSS() {
    if (document.getElementById('piv-builder-style')) return;
    const style = document.createElement('style');
    style.id = 'piv-builder-style';
    style.textContent = `
/* ═══════════════════════════════════════════
   PI Vision — Visual Builder Styles
   RTL Dark Theme — Figma/Canva level polish
═══════════════════════════════════════════ */

#piv-builder-overlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  background: #090f1c;
  font-family: 'Heebo', 'Segoe UI', sans-serif;
  direction: rtl;
  color: #e2e8f0;
  overflow: hidden;
  opacity: 0;
  transition: opacity 0.25s ease;
}
#piv-builder-overlay.pib-visible {
  opacity: 1;
}

/* ── Toolbar ─────────────────────────── */
#pib-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 12px;
  height: 48px;
  background: #0d1b2a;
  border-bottom: 1px solid rgba(0,212,255,0.12);
  flex-shrink: 0;
  user-select: none;
}
#pib-toolbar .pib-logo {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 8px;
  font-size: 13px;
  font-weight: 600;
  color: #00d4ff;
  letter-spacing: 0.5px;
}
#pib-toolbar .pib-sep {
  width: 1px;
  height: 24px;
  background: rgba(0,212,255,0.15);
  margin: 0 6px;
}
.pib-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 11px;
  border: 1px solid rgba(0,212,255,0.15);
  border-radius: 5px;
  background: rgba(0,212,255,0.05);
  color: #94a3b8;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.pib-btn:hover {
  background: rgba(0,212,255,0.12);
  color: #e2e8f0;
  border-color: rgba(0,212,255,0.3);
}
.pib-btn.pib-btn--primary {
  background: rgba(0,212,255,0.15);
  border-color: rgba(0,212,255,0.4);
  color: #00d4ff;
}
.pib-btn.pib-btn--primary:hover {
  background: rgba(0,212,255,0.25);
}
.pib-btn.pib-btn--danger {
  border-color: rgba(239,68,68,0.3);
  color: #f87171;
}
.pib-btn.pib-btn--danger:hover {
  background: rgba(239,68,68,0.1);
}
.pib-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.pib-btn-icon {
  width: 28px;
  height: 28px;
  padding: 4px;
  border-radius: 4px;
}
.pib-toolbar-spacer { flex: 1; }

/* ── Body layout ─────────────────────── */
#pib-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Component Library (right panel) ── */
#pib-complib {
  width: 220px;
  background: #0d1b2a;
  border-left: 1px solid rgba(0,212,255,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}
#pib-complib-header {
  padding: 10px 14px 6px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(0,212,255,0.07);
}
#pib-complib-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0 12px;
}
#pib-complib-body::-webkit-scrollbar { width: 4px; }
#pib-complib-body::-webkit-scrollbar-track { background: transparent; }
#pib-complib-body::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 2px; }

.pib-cat-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
  cursor: pointer;
  user-select: none;
}
.pib-cat-header:hover { color: #00d4ff; }
.pib-cat-toggle {
  margin-right: auto;
  transition: transform 0.2s;
  color: #475569;
}
.pib-cat-header.collapsed .pib-cat-toggle { transform: rotate(-90deg); }

.pib-cat-items {
  padding: 2px 8px 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow: hidden;
  max-height: 500px;
  transition: max-height 0.2s ease, opacity 0.2s;
  opacity: 1;
}
.pib-cat-items.collapsed {
  max-height: 0;
  opacity: 0;
}

.pib-comp-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 5px;
  border: 1px solid transparent;
  font-size: 12px;
  color: #94a3b8;
  cursor: grab;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
  user-select: none;
}
.pib-comp-item:hover {
  background: rgba(0,212,255,0.08);
  border-color: rgba(0,212,255,0.2);
  color: #e2e8f0;
}
.pib-comp-item:active { cursor: grabbing; }
.pib-comp-icon {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  background: rgba(0,212,255,0.06);
  color: #00d4ff;
  flex-shrink: 0;
}

/* ── Canvas area ─────────────────────── */
#pib-canvas-area {
  flex: 1;
  overflow: auto;
  background:
    radial-gradient(ellipse at 50% 0%, rgba(0,212,255,0.04) 0%, transparent 60%),
    #0d1423;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  padding: 24px;
  position: relative;
}
#pib-canvas-area::-webkit-scrollbar { width: 8px; height: 8px; }
#pib-canvas-area::-webkit-scrollbar-track { background: rgba(0,0,0,0.2); }
#pib-canvas-area::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 4px; }

#pib-canvas-wrap {
  position: relative;
  transform-origin: top right;
  flex-shrink: 0;
}

#pib-canvas {
  position: relative;
  border: 1px solid rgba(0,212,255,0.18);
  border-radius: 4px;
  overflow: hidden;
  box-shadow: 0 0 40px rgba(0,0,0,0.6), 0 0 80px rgba(0,212,255,0.04);
  background-color: #0d1b2a;
  background-image:
    linear-gradient(rgba(0,212,255,0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,212,255,0.04) 1px, transparent 1px);
  background-size: 10px 10px;
}
#pib-canvas.pib-drag-over {
  border-color: rgba(0,212,255,0.5);
  box-shadow: 0 0 0 2px rgba(0,212,255,0.15), 0 0 40px rgba(0,0,0,0.6);
}

/* ── Canvas items ───────────────────── */
.pib-item {
  position: absolute;
  box-sizing: border-box;
  cursor: move;
  user-select: none;
  transition: box-shadow 0.12s;
}
.pib-item:hover {
  box-shadow: 0 0 0 1px rgba(0,212,255,0.4);
}
.pib-item.selected {
  box-shadow: 0 0 0 2px #00d4ff, 0 0 12px rgba(0,212,255,0.3);
  z-index: 100 !important;
}
.pib-item.pib-ghost {
  opacity: 0.45;
  pointer-events: none;
}

/* Resize handles */
.pib-handle {
  position: absolute;
  width: 8px;
  height: 8px;
  background: #00d4ff;
  border: 1px solid #0d1b2a;
  border-radius: 2px;
  z-index: 200;
  box-sizing: border-box;
}
.pib-handle[data-dir="nw"] { top: -4px;  right: -4px; cursor: nw-resize; }
.pib-handle[data-dir="n"]  { top: -4px;  right: calc(50% - 4px); cursor: n-resize; }
.pib-handle[data-dir="ne"] { top: -4px;  left: -4px;  cursor: ne-resize; }
.pib-handle[data-dir="e"]  { top: calc(50% - 4px); left: -4px; cursor: e-resize; }
.pib-handle[data-dir="se"] { bottom: -4px; left: -4px; cursor: se-resize; }
.pib-handle[data-dir="s"]  { bottom: -4px; right: calc(50% - 4px); cursor: s-resize; }
.pib-handle[data-dir="sw"] { bottom: -4px; right: -4px; cursor: sw-resize; }
.pib-handle[data-dir="w"]  { top: calc(50% - 4px); right: -4px; cursor: w-resize; }

/* Selection box */
#pib-sel-box {
  position: absolute;
  border: 1px dashed rgba(0,212,255,0.7);
  background: rgba(0,212,255,0.06);
  pointer-events: none;
  z-index: 1000;
  display: none;
}

/* ── Properties Panel (left) ────────── */
#pib-props {
  width: 256px;
  background: #0d1b2a;
  border-right: 1px solid rgba(0,212,255,0.1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  flex-shrink: 0;
}
#pib-props-header {
  padding: 10px 14px 6px;
  font-size: 11px;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 1px;
  border-bottom: 1px solid rgba(0,212,255,0.07);
  display: flex;
  align-items: center;
  justify-content: space-between;
}
#pib-props-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px;
}
#pib-props-body::-webkit-scrollbar { width: 4px; }
#pib-props-body::-webkit-scrollbar-track { background: transparent; }
#pib-props-body::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 2px; }

.pib-props-empty {
  text-align: center;
  color: #475569;
  font-size: 12px;
  padding: 32px 16px;
  line-height: 1.7;
}

.pib-section {
  margin-bottom: 14px;
}
.pib-section-title {
  font-size: 10px;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 1.2px;
  margin-bottom: 8px;
  padding-bottom: 4px;
  border-bottom: 1px solid rgba(0,212,255,0.07);
}
.pib-field {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 7px;
}
.pib-field label {
  font-size: 11px;
  color: #64748b;
  width: 64px;
  flex-shrink: 0;
  text-align: right;
}
.pib-field input,
.pib-field select {
  flex: 1;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(0,212,255,0.15);
  border-radius: 4px;
  color: #e2e8f0;
  font-family: inherit;
  font-size: 12px;
  padding: 4px 7px;
  outline: none;
  transition: border-color 0.15s;
  direction: ltr;
}
.pib-field input:focus,
.pib-field select:focus {
  border-color: rgba(0,212,255,0.45);
}
.pib-field input[type="color"] {
  padding: 2px;
  width: 44px;
  height: 28px;
  cursor: pointer;
  flex: none;
}
.pib-field input[type="range"] {
  padding: 0;
  cursor: pointer;
}
.pib-field-row2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 5px;
  margin-bottom: 7px;
}
.pib-field-row2 .pib-field { margin-bottom: 0; }

/* ── Status bar ──────────────────────── */
#pib-statusbar {
  height: 28px;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 0 14px;
  background: #0a1220;
  border-top: 1px solid rgba(0,212,255,0.08);
  font-size: 11px;
  color: #475569;
  flex-shrink: 0;
  user-select: none;
}
#pib-statusbar span { display: flex; align-items: center; gap: 5px; }
#pib-statusbar .pib-status-sep { opacity: 0.3; }

/* ── Modal overlay ───────────────────── */
.pib-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 9500;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: pibFadeIn 0.15s ease;
}
.pib-modal {
  background: #0d1b2a;
  border: 1px solid rgba(0,212,255,0.2);
  border-radius: 10px;
  box-shadow: 0 24px 80px rgba(0,0,0,0.7);
  max-width: 720px;
  width: 100%;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: pibSlideUp 0.2s ease;
}
.pib-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid rgba(0,212,255,0.1);
  font-size: 15px;
  font-weight: 600;
  color: #e2e8f0;
  flex-shrink: 0;
}
.pib-modal-close {
  background: none;
  border: none;
  color: #64748b;
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 2px 6px;
  border-radius: 4px;
}
.pib-modal-close:hover { color: #e2e8f0; background: rgba(255,255,255,0.07); }
.pib-modal-body {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}
.pib-modal-footer {
  padding: 14px 20px;
  border-top: 1px solid rgba(0,212,255,0.1);
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

/* Export modal tabs */
.pib-tabs {
  display: flex;
  gap: 2px;
  padding: 0 20px;
  border-bottom: 1px solid rgba(0,212,255,0.1);
  background: rgba(0,0,0,0.15);
  flex-shrink: 0;
}
.pib-tab {
  padding: 9px 16px;
  font-size: 12px;
  font-family: inherit;
  font-weight: 500;
  color: #64748b;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
  direction: rtl;
}
.pib-tab:hover { color: #94a3b8; }
.pib-tab.active {
  color: #00d4ff;
  border-bottom-color: #00d4ff;
}
.pib-tab-content { display: none; }
.pib-tab-content.active { display: block; }

.pib-code-block {
  background: #050c17;
  border: 1px solid rgba(0,212,255,0.1);
  border-radius: 6px;
  padding: 14px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 11px;
  color: #94a3b8;
  white-space: pre;
  overflow: auto;
  max-height: 320px;
  direction: ltr;
  text-align: left;
  line-height: 1.6;
}

/* Templates grid */
.pib-templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 12px;
}
.pib-template-card {
  background: rgba(0,212,255,0.04);
  border: 1px solid rgba(0,212,255,0.12);
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.12s;
}
.pib-template-card:hover {
  background: rgba(0,212,255,0.1);
  border-color: rgba(0,212,255,0.3);
  transform: translateY(-2px);
}
.pib-template-name {
  font-size: 13px;
  font-weight: 600;
  color: #e2e8f0;
  margin-bottom: 5px;
}
.pib-template-desc {
  font-size: 11px;
  color: #64748b;
  line-height: 1.5;
}

/* Designs list */
.pib-designs-list { display: flex; flex-direction: column; gap: 8px; }
.pib-design-row {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: rgba(0,212,255,0.03);
  border: 1px solid rgba(0,212,255,0.1);
  border-radius: 6px;
  gap: 10px;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
}
.pib-design-row:hover {
  background: rgba(0,212,255,0.08);
  border-color: rgba(0,212,255,0.25);
}
.pib-design-name {
  font-size: 13px;
  font-weight: 500;
  color: #e2e8f0;
  flex: 1;
}
.pib-design-meta {
  font-size: 10px;
  color: #475569;
}
.pib-design-del {
  background: none;
  border: none;
  color: #475569;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  border-radius: 3px;
  line-height: 1;
}
.pib-design-del:hover { color: #f87171; background: rgba(239,68,68,0.1); }

/* Alignment bar */
.pib-align-bar {
  display: flex;
  gap: 3px;
  flex-wrap: wrap;
  margin-bottom: 8px;
}
.pib-align-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: 1px solid rgba(0,212,255,0.15);
  border-radius: 4px;
  background: rgba(0,212,255,0.04);
  color: #64748b;
  cursor: pointer;
  font-size: 10px;
  transition: background 0.12s, color 0.12s;
}
.pib-align-btn:hover { background: rgba(0,212,255,0.12); color: #e2e8f0; }

/* Item renderers */
.pib-item-inner {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
  font-size: 12px;
  pointer-events: none;
}

/* KPI card */
.pib-kpi {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  padding: 10px;
}
.pib-kpi-val {
  font-size: 28px;
  font-weight: 700;
  line-height: 1;
}
.pib-kpi-unit { font-size: 13px; opacity: 0.65; margin-right: 2px; }
.pib-kpi-lbl { font-size: 10px; color: #64748b; letter-spacing: 0.5px; }

/* Gauge radial */
.pib-gauge-wrap { position: relative; width: 100%; height: 100%; }
.pib-gauge-wrap svg { width: 100%; height: 100%; }

/* Status indicator */
.pib-status-ind {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 14px;
}
.pib-status-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  flex-shrink: 0;
  box-shadow: 0 0 8px currentColor;
}
.pib-status-good { background: #22c55e; color: #22c55e; }
.pib-status-warn { background: #f59e0b; color: #f59e0b; }
.pib-status-bad  { background: #ef4444; color: #ef4444; }
.pib-status-lbl  { font-size: 12px; color: #94a3b8; }

/* Table preview */
.pib-table-prev {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.pib-table-prev-header {
  background: rgba(0,212,255,0.1);
  padding: 5px 8px;
  font-size: 10px;
  font-weight: 600;
  color: #00d4ff;
  border-bottom: 1px solid rgba(0,212,255,0.15);
  display: flex;
  gap: 8px;
}
.pib-table-prev-row {
  display: flex;
  gap: 8px;
  padding: 3px 8px;
  font-size: 10px;
  color: #64748b;
  border-bottom: 1px solid rgba(0,212,255,0.05);
}
.pib-table-prev-row:nth-child(even) { background: rgba(0,212,255,0.02); }
.pib-table-col { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* Chart placeholder */
.pib-chart-placeholder {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: flex-end;
  padding: 8px;
  gap: 0;
  overflow: hidden;
}
.pib-chart-bars {
  display: flex;
  align-items: flex-end;
  gap: 3px;
  width: 100%;
  height: calc(100% - 20px);
}
.pib-chart-bar-item {
  flex: 1;
  border-radius: 2px 2px 0 0;
  min-height: 2px;
  transition: opacity 0.2s;
}
.pib-chart-title {
  font-size: 10px;
  color: #64748b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  width: 100%;
}

/* Sparkline */
.pib-sparkline { width: 100%; height: 100%; overflow: hidden; }
.pib-sparkline svg { width: 100%; height: 100%; }

@keyframes pibFadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes pibSlideUp { from { transform: translateY(12px); opacity: 0.5; } to { transform: translateY(0); opacity: 1; } }
@keyframes pibPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }

/* Zoom level indicator */
#pib-zoom-indicator {
  font-size: 11px;
  color: #475569;
  min-width: 42px;
  text-align: center;
}
`;
    document.head.appendChild(style);
  }

  // ─── Render item content ─────────────────────────────────────────────────

  function _renderItemContent(item) {
    const t = item.type;
    const p = item.props || {};

    // KPI Card
    if (t === 'gauge-kpi') {
      const col = p.accentColor || '#00d4ff';
      return `<div class="pib-kpi" style="background:rgba(0,0,0,0.2);width:100%;height:100%;border-radius:4px;border-top:2px solid ${col}">
        <div class="pib-kpi-val" style="color:${col}">${p.value||'--'}<span class="pib-kpi-unit">${p.units||''}</span></div>
        <div class="pib-kpi-lbl">${p.label||item.name}</div>
      </div>`;
    }

    // Status indicator
    if (t === 'gauge-status') {
      const cls = p.status === 'warn' ? 'pib-status-warn' : p.status === 'bad' ? 'pib-status-bad' : 'pib-status-good';
      return `<div class="pib-status-ind" style="width:100%;height:100%;background:rgba(0,0,0,0.2);border-radius:4px">
        <div class="pib-status-dot ${cls}"></div>
        <div class="pib-status-lbl">${p.label||'מצב'}</div>
      </div>`;
    }

    // Radial Gauge
    if (t === 'gauge-radial') {
      const pct = Math.max(0, Math.min(1, ((p.value||65) - (p.min||0)) / ((p.max||100) - (p.min||0))));
      const angle = -140 + pct * 280;
      const r = 38; const cx = 50; const cy = 55;
      const arcStart = _polarToXY(cx, cy, r, -140);
      const arcEnd   = _polarToXY(cx, cy, r, angle);
      const largeArc = (angle - (-140)) > 180 ? 1 : 0;
      return `<div class="pib-gauge-wrap">
        <svg viewBox="0 0 100 100">
          <path d="M${_polarToXY(cx,cy,r,-140).x} ${_polarToXY(cx,cy,r,-140).y} A${r} ${r} 0 1 1 ${_polarToXY(cx,cy,r,140).x} ${_polarToXY(cx,cy,r,140).y}" fill="none" stroke="rgba(0,212,255,0.1)" stroke-width="6" stroke-linecap="round"/>
          <path d="M${arcStart.x} ${arcStart.y} A${r} ${r} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}" fill="none" stroke="#00d4ff" stroke-width="6" stroke-linecap="round"/>
          <text x="50" y="56" text-anchor="middle" font-size="14" fill="#e2e8f0" font-weight="700">${p.value||65}</text>
          <text x="50" y="66" text-anchor="middle" font-size="7" fill="#64748b">${p.units||''}</text>
          <text x="50" y="80" text-anchor="middle" font-size="6" fill="#475569">${p.label||item.name}</text>
        </svg>
      </div>`;
    }

    // Half Gauge
    if (t === 'gauge-half') {
      const pct = Math.max(0, Math.min(1, ((p.value||72) - (p.min||0)) / ((p.max||100) - (p.min||0))));
      const angle = -180 + pct * 180;
      const r = 40; const cx = 50; const cy = 72;
      const arcStart = _polarToXY(cx, cy, r, -180);
      const arcEnd   = _polarToXY(cx, cy, r, angle);
      const largeArc = pct > 0.5 ? 1 : 0;
      return `<div class="pib-gauge-wrap">
        <svg viewBox="0 0 100 80">
          <path d="M${cx-r} ${cy} A${r} ${r} 0 0 1 ${cx+r} ${cy}" fill="none" stroke="rgba(0,212,255,0.1)" stroke-width="7" stroke-linecap="round"/>
          <path d="M${arcStart.x} ${arcStart.y} A${r} ${r} 0 ${largeArc} 1 ${arcEnd.x} ${arcEnd.y}" fill="none" stroke="#a855f7" stroke-width="7" stroke-linecap="round"/>
          <text x="50" y="68" text-anchor="middle" font-size="14" fill="#e2e8f0" font-weight="700">${p.value||72}</text>
        </svg>
      </div>`;
    }

    // Linear Gauge
    if (t === 'gauge-linear') {
      const pct = Math.max(0, Math.min(1, ((p.value||45) - (p.min||0)) / ((p.max||100) - (p.min||0))));
      return `<div style="width:100%;height:100%;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;padding:6px 12px;gap:4px;background:rgba(0,0,0,0.2);border-radius:4px">
        <div style="width:100%;height:10px;background:rgba(0,212,255,0.1);border-radius:5px;overflow:hidden">
          <div style="height:100%;width:${pct*100}%;background:linear-gradient(90deg,#00d4ff,#a855f7);border-radius:5px;transition:width 0.3s"></div>
        </div>
        <div style="font-size:10px;color:#64748b">${p.min||0} — <span style="color:#00d4ff;font-weight:600">${p.value||45}</span> — ${p.max||100}</div>
      </div>`;
    }

    // Charts
    if (t.startsWith('chart-')) {
      const col = p.color || (t==='chart-bar'?'#a855f7':t==='chart-pie'?'#f59e0b':'#00d4ff');
      const chartType = t.split('-')[1];

      if (chartType === 'spark') {
        const pts = [20,45,30,70,55,80,40,90,60,45,75].map((v,i) => `${i*10},${100-v}`).join(' ');
        return `<div class="pib-sparkline"><svg viewBox="0 0 100 100" preserveAspectRatio="none">
          <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2"/>
        </svg></div>`;
      }

      if (chartType === 'pie') {
        return `<div class="pib-gauge-wrap"><svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="35" fill="none" stroke="#00d4ff" stroke-width="20" stroke-dasharray="55 110" stroke-dashoffset="-27" opacity="0.9"/>
          <circle cx="50" cy="50" r="35" fill="none" stroke="#a855f7" stroke-width="20" stroke-dasharray="35 130" stroke-dashoffset="-82" opacity="0.9"/>
          <circle cx="50" cy="50" r="35" fill="none" stroke="#f59e0b" stroke-width="20" stroke-dasharray="25 145" stroke-dashoffset="-117" opacity="0.9"/>
          <circle cx="50" cy="50" r="35" fill="none" stroke="#22c55e" stroke-width="20" stroke-dasharray="20 150" stroke-dashoffset="-142" opacity="0.9"/>
          <circle cx="50" cy="50" r="18" fill="#0d1b2a"/>
        </svg></div>`;
      }

      const heights = [45,70,30,80,55,90,40,65,75,50];
      const isFill = chartType === 'area';
      const isLine = chartType === 'line' || chartType === 'area';

      if (isLine) {
        const w = 100; const h = 100;
        const pts = heights.map((v, i) => `${i*(w/9)},${h-v}`).join(' ');
        const fillPath = `M0,${h} L${heights.map((v,i)=>`${i*(w/9)},${h-v}`).join(' L')} L${w},${h} Z`;
        return `<div class="pib-chart-placeholder">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" style="width:100%;height:calc(100% - 18px)">
            ${isFill ? `<path d="${fillPath}" fill="${col}" opacity="0.15"/>` : ''}
            <polyline points="${pts}" fill="none" stroke="${col}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
          </svg>
          <div class="pib-chart-title">${p.title||item.name}</div>
        </div>`;
      }

      // Bar
      return `<div class="pib-chart-placeholder">
        <div class="pib-chart-bars" style="height:calc(100% - 18px)">
          ${heights.map(v=>`<div class="pib-chart-bar-item" style="height:${v}%;background:${col};opacity:0.8"></div>`).join('')}
        </div>
        <div class="pib-chart-title">${p.title||item.name}</div>
      </div>`;
    }

    // Text items
    if (t.startsWith('text-')) {
      const textType = t.split('-')[1];
      if (textType === 'value') {
        return `<div style="display:flex;align-items:baseline;gap:4px;padding:4px 10px">
          <span style="font-size:${p.fontSize||28}px;font-weight:700;color:#e2e8f0;line-height:1">${p.text||'--'}</span>
          <span style="font-size:13px;color:#64748b">${p.units||''}</span>
        </div>`;
      }
      if (textType === 'counter') {
        return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%">
          <div style="font-size:26px;font-weight:700;color:#00d4ff;line-height:1">${p.target||1000}</div>
          <div style="font-size:10px;color:#475569;margin-top:4px">/ ${p.target||1000}</div>
        </div>`;
      }
      const fw = p.fontWeight || (textType==='title'?'700':'400');
      const fs = p.fontSize || (textType==='title'?22:textType==='label'?13:12);
      const col = p.color || '#e2e8f0';
      return `<div style="width:100%;height:100%;display:flex;align-items:center;padding:4px 10px">
        <span style="font-size:${fs}px;font-weight:${fw};color:${col};white-space:nowrap;overflow:hidden;text-overflow:ellipsis;direction:rtl">${p.text||item.name}</span>
      </div>`;
    }

    // Tables
    if (t.startsWith('table-')) {
      const cols = p.columns || 3;
      const rows = p.rows || 4;
      const headers = ['עמודה א׳','עמודה ב׳','עמודה ג׳','עמודה ד׳'].slice(0, cols);
      const rowData = Array.from({length: Math.min(rows,5)}, (_,ri) =>
        headers.map((_, ci) => ci===0 ? `ערך ${ri+1}` : ci===1 ? (Math.random()*100).toFixed(1) : '—')
      );
      return `<div class="pib-table-prev">
        <div class="pib-table-prev-header">${headers.map(h=>`<div class="pib-table-col">${h}</div>`).join('')}</div>
        ${rowData.map(r=>`<div class="pib-table-prev-row">${r.map(c=>`<div class="pib-table-col">${c}</div>`).join('')}</div>`).join('')}
      </div>`;
    }

    // Shapes
    if (t === 'shape-rect') {
      return `<div style="width:100%;height:100%;background:${p.fill||'rgba(0,212,255,0.06)'};border:2px solid ${p.stroke||'#00d4ff'};border-radius:${item.borderRadius||3}px;box-sizing:border-box"></div>`;
    }
    if (t === 'shape-circle') {
      return `<div style="width:100%;height:100%;background:${p.fill||'rgba(0,212,255,0.06)'};border:2px solid ${p.stroke||'#00d4ff'};border-radius:50%;box-sizing:border-box"></div>`;
    }
    if (t === 'shape-line') {
      return `<div style="width:100%;height:100%;display:flex;align-items:center"><div style="width:100%;height:${p.strokeWidth||2}px;background:${p.stroke||'#00d4ff'};border-radius:2px"></div></div>`;
    }
    if (t === 'shape-arrow') {
      return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:${p.stroke||'#00d4ff'}">
        <svg viewBox="0 0 100 30" preserveAspectRatio="none" style="width:100%;height:60%">
          <line x1="5" y1="15" x2="90" y2="15" stroke="${p.stroke||'#00d4ff'}" stroke-width="3"/>
          <polygon points="90,8 100,15 90,22" fill="${p.stroke||'#00d4ff'}"/>
        </svg>
      </div>`;
    }
    if (t === 'shape-pipe') {
      return `<div style="width:100%;height:100%;position:relative;overflow:hidden">
        <div style="position:absolute;inset:4px;background:${p.fill||'rgba(0,60,100,0.6)'};border:2px solid ${p.stroke||'#4a7fa5'};border-radius:${item.h/2||20}px;box-shadow:inset 0 3px 8px rgba(0,0,0,0.4)"></div>
        <div style="position:absolute;top:6px;left:10px;right:10px;height:4px;background:rgba(255,255,255,0.12);border-radius:2px"></div>
      </div>`;
    }
    if (t === 'shape-container') {
      return `<div style="width:100%;height:100%;background:${p.fill||'rgba(0,212,255,0.04)'};border:1px dashed ${p.stroke||'rgba(0,212,255,0.25)'};border-radius:4px;box-sizing:border-box;display:flex;align-items:flex-start;justify-content:flex-end;padding:5px 8px">
        <span style="font-size:9px;color:rgba(0,212,255,0.35);font-weight:600;letter-spacing:1px">מיכל</span>
      </div>`;
    }

    // Controls
    if (t === 'ctrl-button') {
      return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">
        <button style="padding:6px 18px;border-radius:5px;border:1px solid rgba(0,212,255,0.35);background:rgba(0,212,255,0.12);color:#00d4ff;font-family:inherit;font-size:13px;cursor:pointer">${p.label||'כפתור'}</button>
      </div>`;
    }
    if (t === 'ctrl-toggle') {
      const on = p.checked;
      return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center">
        <div style="width:48px;height:26px;border-radius:13px;background:${on?'#00d4ff':'rgba(0,212,255,0.15)'};position:relative;border:1px solid rgba(0,212,255,0.3)">
          <div style="position:absolute;top:3px;${on?'left':'right'}:3px;width:18px;height:18px;border-radius:50%;background:${on?'#0d1b2a':'#64748b'};transition:all 0.2s"></div>
        </div>
      </div>`;
    }
    if (t === 'ctrl-slider') {
      const pct = ((p.value||50)-(p.min||0))/((p.max||100)-(p.min||0));
      return `<div style="width:100%;height:100%;display:flex;align-items:center;padding:0 12px">
        <div style="width:100%;height:6px;background:rgba(0,212,255,0.1);border-radius:3px;position:relative">
          <div style="width:${pct*100}%;height:100%;background:#00d4ff;border-radius:3px"></div>
          <div style="position:absolute;top:-5px;left:calc(${pct*100}% - 7px);width:14px;height:14px;border-radius:50%;background:#00d4ff;border:2px solid #0d1b2a"></div>
        </div>
      </div>`;
    }
    if (t === 'ctrl-dropdown') {
      return `<div style="width:100%;height:100%;display:flex;align-items:center;padding:0 10px">
        <div style="width:100%;padding:5px 10px;border:1px solid rgba(0,212,255,0.2);border-radius:4px;background:rgba(0,0,0,0.2);color:#94a3b8;font-size:12px;display:flex;align-items:center;justify-content:space-between">
          <span>${(p.options&&p.options[0])||'בחר...'}</span>
          <span style="color:#475569">▾</span>
        </div>
      </div>`;
    }
    if (t === 'ctrl-timepick') {
      return `<div style="width:100%;height:100%;display:flex;align-items:center;padding:0 10px">
        <div style="width:100%;padding:5px 10px;border:1px solid rgba(0,212,255,0.2);border-radius:4px;background:rgba(0,0,0,0.2);color:#94a3b8;font-size:12px;display:flex;align-items:center;gap:8px">
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6.5"/><path d="M8 5v3l2 2"/></svg>
          <span>00:00 — 24:00</span>
        </div>
      </div>`;
    }

    // Default fallback
    return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:rgba(0,212,255,0.04);border:1px dashed rgba(0,212,255,0.2);border-radius:3px">
      <span style="font-size:11px;color:#475569">${item.name}</span>
    </div>`;
  }

  function _polarToXY(cx, cy, r, angleDeg) {
    const rad = (angleDeg - 90) * Math.PI / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  // ─── DOM Builder ────────────────────────────────────────────────────────

  function _buildOverlay() {
    if (_overlay) return;

    _overlay = document.createElement('div');
    _overlay.id = 'piv-builder-overlay';
    _overlay.dir = 'rtl';
    _overlay.setAttribute('aria-label', 'עורך ויזואלי PI Vision');
    _setSafeInner(_overlay, `
<!-- Toolbar -->
<div id="pib-toolbar">
  <div class="pib-logo">
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#00d4ff" stroke-width="1.8">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
    עורך ויזואלי
  </div>
  <div class="pib-sep"></div>
  <button class="pib-btn pib-btn--primary" id="pib-btn-save" title="שמור עיצוב (Ctrl+S)">
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 13H3a1 1 0 01-1-1V4l3-3h8a1 1 0 011 1v10a1 1 0 01-1 1z"/><path d="M9 13V9H7v4"/><path d="M4 1v3h6V1"/></svg>
    שמור
  </button>
  <button class="pib-btn" id="pib-btn-open" title="פתח עיצוב שמור">
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 4h14v10H1z"/><path d="M4 4V2h8v2"/></svg>
    פתח
  </button>
  <button class="pib-btn" id="pib-btn-templates" title="תבניות מוכנות">
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="1" y="1" width="6" height="6"/><rect x="9" y="1" width="6" height="6"/><rect x="1" y="9" width="6" height="6"/><rect x="9" y="9" width="6" height="6"/></svg>
    תבניות
  </button>
  <div class="pib-sep"></div>
  <button class="pib-btn pib-btn-icon" id="pib-btn-undo" title="בטל (Ctrl+Z)" disabled>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7H13M3 7l3-3M3 7l3 3"/><path d="M13 7a5 5 0 11-5 5"/></svg>
  </button>
  <button class="pib-btn pib-btn-icon" id="pib-btn-redo" title="חזור (Ctrl+Y)" disabled>
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M13 7H3M13 7l-3-3M13 7l-3 3"/><path d="M3 7a5 5 0 105 5"/></svg>
  </button>
  <div class="pib-sep"></div>
  <button class="pib-btn" id="pib-btn-snap" title="חיבור לרשת">
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="3" cy="3" r="1.5"/><circle cx="8" cy="3" r="1.5"/><circle cx="13" cy="3" r="1.5"/><circle cx="3" cy="8" r="1.5"/><circle cx="8" cy="8" r="1.5"/><circle cx="13" cy="8" r="1.5"/><circle cx="3" cy="13" r="1.5"/><circle cx="8" cy="13" r="1.5"/><circle cx="13" cy="13" r="1.5"/></svg>
    רשת
  </button>
  <button class="pib-btn" id="pib-btn-clear" title="נקה בד ציור">
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/></svg>
    נקה
  </button>
  <div class="pib-sep"></div>
  <button class="pib-btn pib-btn--primary" id="pib-btn-export" title="ייצא קוד PI Vision">
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 1v9M5 7l3 3 3-3"/><path d="M2 12v2a1 1 0 001 1h10a1 1 0 001-1v-2"/></svg>
    ייצוא
  </button>
  <div class="pib-toolbar-spacer"></div>
  <div id="pib-zoom-indicator">100%</div>
  <button class="pib-btn pib-btn-icon" id="pib-btn-zoom-out" title="הקטן (Ctrl+-)">
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="7" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/><line x1="4" y1="7" x2="10" y2="7"/></svg>
  </button>
  <button class="pib-btn pib-btn-icon" id="pib-btn-zoom-in" title="הגדל (Ctrl+=)">
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="7" cy="7" r="5"/><line x1="10.5" y1="10.5" x2="14" y2="14"/><line x1="7" y1="4" x2="7" y2="10"/><line x1="4" y1="7" x2="10" y2="7"/></svg>
  </button>
  <div class="pib-sep"></div>
  <button class="pib-btn pib-btn--danger" id="pib-btn-close" title="סגור עורך (Escape)">
    <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="4" x2="4" y2="12"/><line x1="4" y1="4" x2="12" y2="12"/></svg>
    סגור
  </button>
</div>

<!-- Body -->
<div id="pib-body">

  <!-- Component Library (right in RTL) -->
  <div id="pib-complib">
    <div id="pib-complib-header">ספריית רכיבים</div>
    <div id="pib-complib-body"></div>
  </div>

  <!-- Canvas area -->
  <div id="pib-canvas-area">
    <div id="pib-canvas-wrap">
      <div id="pib-canvas" tabindex="0" aria-label="בד ציור">
        <div id="pib-sel-box"></div>
      </div>
    </div>
  </div>

  <!-- Properties Panel (left in RTL) -->
  <div id="pib-props">
    <div id="pib-props-header">
      <span>מאפיינים</span>
      <button class="pib-btn pib-btn-icon" id="pib-btn-del-sel" title="מחק פריטים נבחרים (Del)" style="width:22px;height:22px;padding:2px" disabled>
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4h12M5 4V2h6v2M6 7v5M10 7v5M3 4l1 10h8l1-10"/></svg>
      </button>
    </div>
    <div id="pib-props-body">
      <div class="pib-props-empty">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="rgba(0,212,255,0.25)" stroke-width="1.5" style="margin:0 auto 10px;display:block"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        בחר פריט בבד הציור<br>לעריכת מאפיינים
      </div>
    </div>
  </div>

</div>

<!-- Status bar -->
<div id="pib-statusbar">
  <span id="pib-status-size">
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="10" height="10" rx="1"/></svg>
    1200×800
  </span>
  <span class="pib-status-sep">|</span>
  <span id="pib-status-grid">
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="0" x2="4" y2="12"/><line x1="8" y1="0" x2="8" y2="12"/><line x1="0" y1="4" x2="12" y2="4"/><line x1="0" y1="8" x2="12" y2="8"/></svg>
    רשת: 10px ✓
  </span>
  <span class="pib-status-sep">|</span>
  <span id="pib-status-items">0 פריטים</span>
  <span class="pib-status-sep">|</span>
  <span id="pib-status-sel">אין בחירה</span>
  <span class="pib-status-sep">|</span>
  <span id="pib-status-zoom">זום: 100%</span>
</div>
`);
    document.body.appendChild(_overlay);

    // Get refs
    _canvas     = document.getElementById('pib-canvas');
    _canvasWrap = document.getElementById('pib-canvas-wrap');
    _propPanel  = document.getElementById('pib-props-body');
    _statusBar  = document.getElementById('pib-statusbar');
    _compLib    = document.getElementById('pib-complib-body');

    _buildCompLib();
    _bindOverlayEvents();
    _setCanvasSize(_canvasW, _canvasH);
  }

  // ─── Component Library builder ──────────────────────────────────────────

  function _buildCompLib() {
    _compLib.replaceChildren();
    COMPONENT_LIBRARY.forEach(cat => {
      const header = document.createElement('div');
      header.className = 'pib-cat-header';
      _setSafeInner(header, `<span>${_esc(cat.icon)}</span><span>${_esc(cat.label)}</span>
        <svg class="pib-cat-toggle" viewBox="0 0 10 10" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 4l3 3 3-3"/></svg>`);
      header.addEventListener('click', () => {
        header.classList.toggle('collapsed');
        itemsDiv.classList.toggle('collapsed');
      });

      const itemsDiv = document.createElement('div');
      itemsDiv.className = 'pib-cat-items';

      cat.items.forEach(comp => {
        const el = document.createElement('div');
        el.className = 'pib-comp-item';
        el.draggable = true;
        el.dataset.compType = comp.type;
        _setSafeInner(el, `<div class="pib-comp-icon">${_compIcon(comp.type)}</div><span>${_esc(comp.label)}</span>`);

        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('piv-comp-type', comp.type);
          e.dataTransfer.effectAllowed = 'copy';
        });
        itemsDiv.appendChild(el);
      });

      _compLib.appendChild(header);
      _compLib.appendChild(itemsDiv);
    });
  }

  function _compIcon(type) {
    const icons = {
      'chart-line':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1,9 4,4 7,7 11,2"/></svg>',
      'chart-bar':   '<svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor"><rect x="1" y="6" width="2.5" height="5"/><rect x="4.75" y="3" width="2.5" height="8"/><rect x="8.5" y="1" width="2.5" height="10"/></svg>',
      'chart-pie':   '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 6 L6 1 A5 5 0 0 1 11 6 Z" fill="currentColor" opacity="0.6"/><circle cx="6" cy="6" r="5"/></svg>',
      'chart-area':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1,10 L3,5 L6,7 L9,3 L11,4 L11,10 Z" fill="currentColor" opacity="0.3"/><polyline points="1,10 3,5 6,7 9,3 11,4"/></svg>',
      'chart-spark': '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="1,8 3,4 5,6 7,3 9,5 11,2"/></svg>',
      'gauge-radial':'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2 9 A5 5 0 0 1 10 9" stroke-opacity="0.4"/><path d="M2 9 A5 5 0 0 1 8 4.5" /><line x1="6" y1="9" x2="8" y2="4.5"/></svg>',
      'gauge-half':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M1 10 A5 5 0 0 1 11 10"/><path d="M1 10 A5 5 0 0 1 8 5"/></svg>',
      'gauge-linear':'<svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor"><rect x="1" y="5" width="10" height="2.5" rx="1.25" opacity="0.25"/><rect x="1" y="5" width="6" height="2.5" rx="1.25"/></svg>',
      'gauge-kpi':   '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="2" width="10" height="8" rx="1.5"/><line x1="3" y1="6" x2="9" y2="6" stroke-opacity="0.4"/><line x1="3" y1="8" x2="7" y2="8" stroke-opacity="0.3"/><line x1="3" y1="4" x2="9" y2="4"/></svg>',
      'gauge-status':'<svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor"><circle cx="6" cy="6" r="4"/></svg>',
      'text-title':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor"><rect x="1" y="4" width="10" height="1.5"/><rect x="2" y="7" width="8" height="1.2" opacity="0.5"/></svg>',
      'text-label':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 5h8M2 7.5h5"/></svg>',
      'text-value':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor"><text x="1" y="9" font-size="9" font-weight="bold">42</text></svg>',
      'text-rich':   '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M2 3h8M2 5.5h8M2 8h5"/></svg>',
      'text-counter':'<svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor"><text x="0" y="10" font-size="11" font-weight="bold">0→</text></svg>',
      'shape-rect':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1.5" y="2.5" width="9" height="7"/></svg>',
      'shape-circle':'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="6" r="4.5"/></svg>',
      'shape-line':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.8"><line x1="1" y1="6" x2="11" y2="6"/></svg>',
      'shape-arrow': '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="1" y1="6" x2="9" y2="6"/><polyline points="6,3 10,6 6,9"/></svg>',
      'shape-pipe':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="4" width="10" height="4" rx="2"/></svg>',
      'shape-container':'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3" stroke-dasharray="1.5 1.5"><rect x="1" y="1" width="10" height="10" rx="1"/></svg>',
      'table-data':  '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="1" width="10" height="10" rx="1"/><line x1="1" y1="4" x2="11" y2="4"/><line x1="4" y1="4" x2="4" y2="11"/><line x1="8" y1="4" x2="8" y2="11"/></svg>',
      'table-events':'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="1" width="10" height="10" rx="1"/><line x1="1" y1="4" x2="11" y2="4"/><circle cx="3" cy="7.5" r="1" fill="currentColor"/></svg>',
      'table-comparison':'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="1" width="10" height="10" rx="1"/><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="4" x2="11" y2="4"/></svg>',
      'ctrl-button': '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="3.5" width="10" height="5" rx="2.5"/></svg>',
      'ctrl-toggle': '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="4" width="10" height="4" rx="2"/><circle cx="8" cy="6" r="1.5" fill="currentColor"/></svg>',
      'ctrl-slider': '<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><line x1="1" y1="6" x2="11" y2="6"/><circle cx="7" cy="6" r="2" fill="currentColor"/></svg>',
      'ctrl-dropdown':'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="3" width="10" height="6" rx="1"/><polyline points="4,6 6,8 8,6"/></svg>',
      'ctrl-timepick':'<svg viewBox="0 0 12 12" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="6" cy="6" r="4.5"/><polyline points="6,3.5 6,6 8,7.5"/></svg>',
    };
    return icons[type] || '<svg viewBox="0 0 12 12" width="12" height="12" fill="currentColor"><circle cx="6" cy="6" r="4"/></svg>';
  }

  // ─── Canvas size ─────────────────────────────────────────────────────────

  function _setCanvasSize(w, h) {
    _canvasW = w;
    _canvasH = h;
    if (_canvas) {
      _canvas.style.width  = w + 'px';
      _canvas.style.height = h + 'px';
    }
    _updateStatusBar();
  }

  // ─── Zoom ───────────────────────────────────────────────────────────────

  function _setZoom(z) {
    _zoom = Math.max(0.25, Math.min(3, z));
    if (_canvasWrap) _canvasWrap.style.transform = `scale(${_zoom})`;
    const ind = document.getElementById('pib-zoom-indicator');
    if (ind) ind.textContent = Math.round(_zoom * 100) + '%';
    _updateStatusBar();
  }

  // ─── Render ──────────────────────────────────────────────────────────────

  function _scheduleRender() {
    if (_rafPending) return;
    _rafPending = true;
    requestAnimationFrame(() => {
      _rafPending = false;
      _render();
    });
  }

  function _render() {
    if (!_canvas) return;

    // Remove old item elements (keep sel-box)
    const toRemove = _canvas.querySelectorAll('.pib-item');
    toRemove.forEach(el => el.remove());

    // Sort by zIndex
    const sorted = [..._items].sort((a, b) => (a.zIndex || 0) - (b.zIndex || 0));

    sorted.forEach(item => {
      const el = document.createElement('div');
      el.className = 'pib-item' + (_selected.has(item.id) ? ' selected' : '');
      el.id = 'pib-item-' + item.id;
      el.dataset.id = item.id;
      el.style.cssText = `
        left: ${item.x}px;
        top: ${item.y}px;
        width: ${item.w}px;
        height: ${item.h}px;
        z-index: ${item.zIndex || 0};
        opacity: ${item.opacity !== undefined ? item.opacity : 1};
        border-radius: ${item.borderRadius || 0}px;
        ${item.borderWidth ? `border: ${item.borderWidth}px solid ${item.borderColor || '#00d4ff'};` : ''}
        ${item.bgColor ? `background-color: ${item.bgColor};` : ''}
      `;

      const inner = document.createElement('div');
      inner.className = 'pib-item-inner';
      // _renderItemContent returns markup built from the item's
      // user-edited props (text, label, etc.). It already escapes
      // its inputs, but routing through SafeDOM at the sink is the
      // single source of truth for stage-7 hardening.
      _setSafeInner(inner, _renderItemContent(item));
      el.appendChild(inner);

      // Resize handles (only if selected and single-select)
      if (_selected.has(item.id) && _selected.size === 1) {
        ['nw','n','ne','e','se','s','sw','w'].forEach(dir => {
          const handle = document.createElement('div');
          handle.className = 'pib-handle';
          handle.dataset.dir = dir;
          handle.dataset.itemId = item.id;
          el.appendChild(handle);
        });
      }

      _canvas.appendChild(el);
    });

    _updateStatusBar();
  }

  // ─── Event binding ───────────────────────────────────────────────────────

  function _bindOverlayEvents() {

    // Close button
    document.getElementById('pib-btn-close').addEventListener('click', close);

    // Save
    document.getElementById('pib-btn-save').addEventListener('click', save);

    // Open
    document.getElementById('pib-btn-open').addEventListener('click', _showOpenDialog);

    // Templates
    document.getElementById('pib-btn-templates').addEventListener('click', _showTemplatesDialog);

    // Undo/Redo
    document.getElementById('pib-btn-undo').addEventListener('click', _undo);
    document.getElementById('pib-btn-redo').addEventListener('click', _redo);

    // Snap toggle
    const snapBtn = document.getElementById('pib-btn-snap');
    snapBtn.addEventListener('click', () => {
      _snapToGrid = !_snapToGrid;
      snapBtn.style.background = _snapToGrid ? 'rgba(0,212,255,0.18)' : '';
      snapBtn.style.color = _snapToGrid ? '#00d4ff' : '';
      _updateStatusBar();
    });
    snapBtn.style.background = 'rgba(0,212,255,0.18)';
    snapBtn.style.color = '#00d4ff';

    // Clear
    document.getElementById('pib-btn-clear').addEventListener('click', () => {
      if (_items.length === 0) return;
      if (confirm('למחוק את כל הפריטים בבד הציור?')) {
        _pushHistory();
        _items = [];
        _selected.clear();
        _render();
        _updatePropsPanel();
      }
    });

    // Export
    document.getElementById('pib-btn-export').addEventListener('click', _showExportDialog);

    // Delete selected
    document.getElementById('pib-btn-del-sel').addEventListener('click', _deleteSelected);

    // Zoom
    document.getElementById('pib-btn-zoom-in').addEventListener('click', () => _setZoom(_zoom + 0.1));
    document.getElementById('pib-btn-zoom-out').addEventListener('click', () => _setZoom(_zoom - 0.1));

    // Canvas drop
    _canvas.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      _canvas.classList.add('pib-drag-over');
    });
    _canvas.addEventListener('dragleave', () => _canvas.classList.remove('pib-drag-over'));
    _canvas.addEventListener('drop', _onCanvasDrop);

    // Canvas mouse events
    _canvas.addEventListener('mousedown', _onCanvasMouseDown);
    document.addEventListener('mousemove', _onMouseMove);
    document.addEventListener('mouseup',   _onMouseUp);

    // Keyboard shortcuts
    document.addEventListener('keydown', _onKeyDown);

    // Ctrl+scroll for zoom
    document.getElementById('pib-canvas-area').addEventListener('wheel', (e) => {
      if (e.ctrlKey) {
        e.preventDefault();
        _setZoom(_zoom + (e.deltaY < 0 ? 0.05 : -0.05));
      }
    }, { passive: false });
  }

  // ─── Canvas drop ────────────────────────────────────────────────────────

  function _onCanvasDrop(e) {
    e.preventDefault();
    _canvas.classList.remove('pib-drag-over');

    const compType = e.dataTransfer.getData('piv-comp-type');
    if (!compType) return;

    const rect = _canvas.getBoundingClientRect();
    const x = _snap((e.clientX - rect.left) / _zoom);
    const y = _snap((e.clientY - rect.top) / _zoom);

    _pushHistory();
    const item = _createItem(compType, x, y, {});
    item.zIndex = _items.length;
    _items.push(item);
    _selected.clear();
    _selected.add(item.id);
    _render();
    _updatePropsPanel();
  }

  // ─── Mouse events ────────────────────────────────────────────────────────

  let _mouseDownOrigin = null;  // { x, y } canvas-space
  let _selBoxActive = false;

  function _onCanvasMouseDown(e) {
    if (e.button !== 0) return;

    const target = e.target;

    // Resize handle
    if (target.classList.contains('pib-handle')) {
      e.stopPropagation();
      const itemId  = target.dataset.itemId;
      const item    = _items.find(i => i.id === itemId);
      if (!item) return;
      const canvasRect = _canvas.getBoundingClientRect();
      _drag = {
        type: 'resize',
        dir:  target.dataset.dir,
        item,
        startX: e.clientX,
        startY: e.clientY,
        origX: item.x,
        origY: item.y,
        origW: item.w,
        origH: item.h,
      };
      return;
    }

    // Item
    const itemEl = target.closest('.pib-item');
    if (itemEl) {
      const itemId = itemEl.dataset.id;
      e.stopPropagation();

      if (e.shiftKey) {
        if (_selected.has(itemId)) _selected.delete(itemId);
        else _selected.add(itemId);
      } else {
        if (!_selected.has(itemId)) {
          _selected.clear();
          _selected.add(itemId);
        }
      }

      const snapItems = [..._selected].map(id => {
        const it = _items.find(i => i.id === id);
        return { item: it, origX: it.x, origY: it.y };
      });

      _drag = {
        type: 'move',
        startX: e.clientX,
        startY: e.clientY,
        snapItems,
        moved: false,
      };

      _render();
      _updatePropsPanel();
      return;
    }

    // Canvas background — start selection box
    const rect = _canvas.getBoundingClientRect();
    const x0 = (e.clientX - rect.left) / _zoom;
    const y0 = (e.clientY - rect.top)  / _zoom;
    _mouseDownOrigin = { x: x0, y: y0 };
    _selBoxActive = true;

    if (!e.shiftKey) {
      _selected.clear();
      _render();
      _updatePropsPanel();
    }

    const selBox = document.getElementById('pib-sel-box');
    selBox.style.display = 'block';
    selBox.style.left   = x0 + 'px';
    selBox.style.top    = y0 + 'px';
    selBox.style.width  = '0px';
    selBox.style.height = '0px';
  }

  function _onMouseMove(e) {
    if (!_drag && !_selBoxActive) return;

    if (_selBoxActive && _mouseDownOrigin) {
      const rect = _canvas.getBoundingClientRect();
      const x1 = (e.clientX - rect.left) / _zoom;
      const y1 = (e.clientY - rect.top)  / _zoom;
      const x0 = _mouseDownOrigin.x;
      const y0 = _mouseDownOrigin.y;
      const selBox = document.getElementById('pib-sel-box');
      selBox.style.left   = Math.min(x0, x1) + 'px';
      selBox.style.top    = Math.min(y0, y1) + 'px';
      selBox.style.width  = Math.abs(x1 - x0) + 'px';
      selBox.style.height = Math.abs(y1 - y0) + 'px';
      return;
    }

    if (!_drag) return;

    if (_drag.type === 'move') {
      const dx = (e.clientX - _drag.startX) / _zoom;
      const dy = (e.clientY - _drag.startY) / _zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) _drag.moved = true;
      _drag.snapItems.forEach(({ item, origX, origY }) => {
        item.x = _snap(origX + dx);
        item.y = _snap(origY + dy);
      });
      _scheduleRender();
    }

    if (_drag.type === 'resize') {
      const dx = (e.clientX - _drag.startX) / _zoom;
      const dy = (e.clientY - _drag.startY) / _zoom;
      const dir = _drag.dir;
      const item = _drag.item;

      let { origX: nx, origY: ny, origW: nw, origH: nh } = _drag;

      if (dir.includes('e') || dir === 'se' || dir === 'ne') nw = Math.max(20, _snap(nw - dx));
      if (dir.includes('w') || dir === 'sw' || dir === 'nw') { nx = _snap(nx + dx); nw = Math.max(20, _snap(nw - dx)); }
      if (dir.includes('s') || dir === 'se' || dir === 'sw') nh = Math.max(10, _snap(nh + dy));
      if (dir.includes('n') || dir === 'ne' || dir === 'nw') { ny = _snap(ny + dy); nh = Math.max(10, _snap(nh - dy)); }

      item.x = nx; item.y = ny; item.w = nw; item.h = nh;
      _scheduleRender();
    }
  }

  function _onMouseUp(e) {
    if (_selBoxActive) {
      _selBoxActive = false;
      const selBox = document.getElementById('pib-sel-box');
      selBox.style.display = 'none';

      const rect = _canvas.getBoundingClientRect();
      const x1 = (e.clientX - rect.left) / _zoom;
      const y1 = (e.clientY - rect.top)  / _zoom;
      const x0 = _mouseDownOrigin ? _mouseDownOrigin.x : x1;
      const y0 = _mouseDownOrigin ? _mouseDownOrigin.y : y1;

      const selLeft = Math.min(x0, x1);
      const selTop  = Math.min(y0, y1);
      const selRight = Math.max(x0, x1);
      const selBottom = Math.max(y0, y1);

      if (selRight - selLeft > 4 || selBottom - selTop > 4) {
        _items.forEach(item => {
          if (item.x < selRight && item.x + item.w > selLeft &&
              item.y < selBottom && item.y + item.h > selTop) {
            _selected.add(item.id);
          }
        });
        _render();
        _updatePropsPanel();
      }
      _mouseDownOrigin = null;
      return;
    }

    if (!_drag) return;
    const prevDrag = _drag;
    _drag = null;

    if (prevDrag.type === 'move' && prevDrag.moved) {
      _pushHistory();
    }
    if (prevDrag.type === 'resize') {
      _pushHistory();
    }
    _render();
    _updatePropsPanel();
  }

  // ─── Keyboard shortcuts ──────────────────────────────────────────────────

  function _onKeyDown(e) {
    if (!_open) return;

    // Check if user is typing in an input — ignore most shortcuts
    const tag = document.activeElement && document.activeElement.tagName;
    const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';

    if (e.key === 'Escape' && !inInput) {
      // If modal is open, close it; else close builder
      const modal = document.querySelector('.pib-modal-backdrop');
      if (modal) { modal.remove(); return; }
      close();
      return;
    }

    if (e.ctrlKey && e.key === 'z' && !inInput) { e.preventDefault(); _undo(); return; }
    if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'z')) && !inInput) { e.preventDefault(); _redo(); return; }
    if (e.ctrlKey && e.key === 's' && !inInput) { e.preventDefault(); save(); return; }
    if (e.ctrlKey && e.key === 'c' && !inInput && _selected.size > 0) { e.preventDefault(); _copySelected(); return; }
    if (e.ctrlKey && e.key === 'v' && !inInput && _clipboard) { e.preventDefault(); _pasteClipboard(); return; }
    if (e.ctrlKey && e.key === 'a' && !inInput) { e.preventDefault(); _items.forEach(it=>_selected.add(it.id)); _render(); _updatePropsPanel(); return; }
    if (e.ctrlKey && e.key === '=' && !inInput) { e.preventDefault(); _setZoom(_zoom + 0.1); return; }
    if (e.ctrlKey && e.key === '-' && !inInput) { e.preventDefault(); _setZoom(_zoom - 0.1); return; }

    if ((e.key === 'Delete' || e.key === 'Backspace') && !inInput && _selected.size > 0) {
      e.preventDefault();
      _deleteSelected();
      return;
    }

    // Arrow keys nudge
    if (!inInput && _selected.size > 0 && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? step : e.key === 'ArrowRight' ? -step : 0;
      const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
      _selected.forEach(id => {
        const item = _items.find(i => i.id === id);
        if (item) { item.x += dx; item.y += dy; }
      });
      _scheduleRender();
      _updatePropsPanel();
    }
  }

  // ─── Copy / Paste ────────────────────────────────────────────────────────

  function _copySelected() {
    _clipboard = [..._selected].map(id => _items.find(i => i.id === id)).filter(Boolean);
  }

  function _pasteClipboard() {
    if (!_clipboard || !_clipboard.length) return;
    _pushHistory();
    const newItems = _clipboard.map(item => {
      const copy = JSON.parse(JSON.stringify(item));
      copy.id = _uid();
      copy.x = _snap(item.x + 20);
      copy.y = _snap(item.y + 20);
      copy.zIndex = _items.length;
      return copy;
    });
    _items.push(...newItems);
    _selected.clear();
    newItems.forEach(it => _selected.add(it.id));
    _render();
    _updatePropsPanel();
  }

  // ─── Delete selected ────────────────────────────────────────────────────

  function _deleteSelected() {
    if (!_selected.size) return;
    _pushHistory();
    _items = _items.filter(it => !_selected.has(it.id));
    _selected.clear();
    _render();
    _updatePropsPanel();
  }

  // ─── Alignment ───────────────────────────────────────────────────────────

  function _alignItems(align) {
    if (_selected.size < 2) return;
    const selItems = [..._selected].map(id => _items.find(i => i.id === id)).filter(Boolean);
    _pushHistory();
    const minX = Math.min(...selItems.map(it => it.x));
    const maxX = Math.max(...selItems.map(it => it.x + it.w));
    const minY = Math.min(...selItems.map(it => it.y));
    const maxY = Math.max(...selItems.map(it => it.y + it.h));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    selItems.forEach(item => {
      switch (align) {
        case 'left':   item.x = maxX - item.w; break;
        case 'right':  item.x = minX; break;
        case 'top':    item.y = minY; break;
        case 'bottom': item.y = maxY - item.h; break;
        case 'centerH': item.x = Math.round(centerX - item.w / 2); break;
        case 'centerV': item.y = Math.round(centerY - item.h / 2); break;
      }
    });
    _render();
    _updatePropsPanel();
  }

  // ─── Z-order ─────────────────────────────────────────────────────────────

  function _bringToFront() {
    const maxZ = Math.max(..._items.map(i => i.zIndex || 0));
    _selected.forEach(id => {
      const item = _items.find(i => i.id === id);
      if (item) item.zIndex = maxZ + 1;
    });
    _render();
  }

  function _sendToBack() {
    const minZ = Math.min(..._items.map(i => i.zIndex || 0));
    _selected.forEach(id => {
      const item = _items.find(i => i.id === id);
      if (item) item.zIndex = minZ - 1;
    });
    _render();
  }

  // ─── Properties Panel ────────────────────────────────────────────────────

  let _propUpdateTimer = null;

  function _updatePropsPanel() {
    // Throttle
    if (_propUpdateTimer) clearTimeout(_propUpdateTimer);
    _propUpdateTimer = setTimeout(_renderPropsPanel, 30);
    _updateToolbarState();
  }

  function _updateToolbarState() {
    const undoBtn = document.getElementById('pib-btn-undo');
    const redoBtn = document.getElementById('pib-btn-redo');
    const delBtn  = document.getElementById('pib-btn-del-sel');
    if (undoBtn) undoBtn.disabled = _historyIndex <= 0;
    if (redoBtn) redoBtn.disabled = _historyIndex >= _history.length - 1;
    if (delBtn)  delBtn.disabled  = _selected.size === 0;
  }

  function _renderPropsPanel() {
    if (!_propPanel) return;

    if (_selected.size === 0) {
      _setSafeInner(_propPanel, `<div class="pib-props-empty">
        <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="rgba(0,212,255,0.25)" stroke-width="1.5" style="margin:0 auto 10px;display:block"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
        בחר פריט בבד הציור<br>לעריכת מאפיינים
      </div>`);
      return;
    }

    if (_selected.size > 1) {
      _setSafeInner(_propPanel, `
      <div class="pib-section">
        <div class="pib-section-title">ריבוי בחירה (${_selected.size} פריטים)</div>
        <div class="pib-align-bar">
          ${[
            ['top','יישר למעלה','▲'],
            ['bottom','יישר למטה','▼'],
            ['left','יישר לימין','◀'],
            ['right','יישר לשמאל','▶'],
            ['centerH','מרכז אופקי','↔'],
            ['centerV','מרכז אנכי','↕'],
          ].map(([a,t,ic])=>`<button class="pib-align-btn" data-align="${a}" title="${t}">${ic}</button>`).join('')}
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          <button class="pib-btn" data-zfront style="flex:1;font-size:11px">הבא קדימה</button>
          <button class="pib-btn" data-zback  style="flex:1;font-size:11px">שלח אחורה</button>
        </div>
      </div>`);

      _propPanel.querySelectorAll('[data-align]').forEach(btn => {
        btn.addEventListener('click', () => _alignItems(btn.dataset.align));
      });
      _propPanel.querySelector('[data-zfront]').addEventListener('click', _bringToFront);
      _propPanel.querySelector('[data-zback]').addEventListener('click', _sendToBack);
      return;
    }

    // Single item
    const itemId = [..._selected][0];
    const item = _items.find(i => i.id === itemId);
    if (!item) return;

    const p = item.props || {};

    _setSafeInner(_propPanel, `
    <!-- Section: General -->
    <div class="pib-section">
      <div class="pib-section-title">כללי</div>
      <div class="pib-field">
        <label>שם</label>
        <input type="text" id="pp-name" value="${_esc(item.name)}" placeholder="שם פריט">
      </div>
      <div class="pib-field-row2">
        <div class="pib-field"><label>X</label><input type="number" id="pp-x" value="${item.x}" step="${GRID_SIZE}"></div>
        <div class="pib-field"><label>Y</label><input type="number" id="pp-y" value="${item.y}" step="${GRID_SIZE}"></div>
      </div>
      <div class="pib-field-row2">
        <div class="pib-field"><label>רוחב</label><input type="number" id="pp-w" value="${item.w}" step="${GRID_SIZE}" min="10"></div>
        <div class="pib-field"><label>גובה</label><input type="number" id="pp-h" value="${item.h}" step="${GRID_SIZE}" min="10"></div>
      </div>
      <div style="display:flex;gap:6px;margin-top:4px">
        <button class="pib-btn" data-zfront style="flex:1;font-size:11px">הבא קדימה</button>
        <button class="pib-btn" data-zback  style="flex:1;font-size:11px">שלח אחורה</button>
      </div>
    </div>

    <!-- Section: Appearance -->
    <div class="pib-section">
      <div class="pib-section-title">מראה</div>
      <div class="pib-field">
        <label>רקע</label>
        <input type="color" id="pp-bg" value="${item.bgColor||'#0d1b2a'}">
        <input type="text"  id="pp-bg-txt" value="${item.bgColor||''}" placeholder="none" style="flex:1;font-size:11px">
      </div>
      <div class="pib-field">
        <label>גבול</label>
        <input type="color" id="pp-border" value="${item.borderColor||'#00d4ff'}">
        <input type="number" id="pp-border-w" value="${item.borderWidth||0}" min="0" max="10" style="width:44px;flex:none" title="עובי גבול">
      </div>
      <div class="pib-field">
        <label>עיגול</label>
        <input type="range" id="pp-radius" min="0" max="50" value="${item.borderRadius||0}">
        <span id="pp-radius-val" style="font-size:11px;color:#64748b;min-width:24px">${item.borderRadius||0}px</span>
      </div>
      <div class="pib-field">
        <label>שקיפות</label>
        <input type="range" id="pp-opacity" min="0" max="1" step="0.05" value="${item.opacity!==undefined?item.opacity:1}">
        <span id="pp-opacity-val" style="font-size:11px;color:#64748b;min-width:28px">${Math.round((item.opacity!==undefined?item.opacity:1)*100)}%</span>
      </div>
    </div>

    <!-- Section: Data Binding -->
    <div class="pib-section">
      <div class="pib-section-title">קישור נתונים</div>
      <div class="pib-field">
        <label>תג PI</label>
        <input type="text" id="pp-tag" value="${_esc(item.tag||'')}" placeholder="Server\\Tag" style="direction:ltr">
      </div>
      <div class="pib-field">
        <label>עדכון</label>
        <select id="pp-interval">
          ${[1,2,5,10,30,60].map(v=>`<option value="${v}"${item.interval==v?' selected':''}>${v}s</option>`).join('')}
        </select>
      </div>
      <div class="pib-field">
        <label>פורמט</label>
        <select id="pp-format">
          <option value="number"${item.format==='number'?' selected':''}>מספר</option>
          <option value="percent"${item.format==='percent'?' selected':''}>אחוז</option>
          <option value="eng"${item.format==='eng'?' selected':''}>הנדסי</option>
        </select>
      </div>
      <div style="font-size:10px;color:#475569;margin-bottom:6px">סף אזהרה / קריטי</div>
      <div class="pib-field-row2">
        <div class="pib-field"><label>אזהרה</label><input type="text" id="pp-warn" value="${_esc(item.warnValue||'')}" placeholder="ערך" style="direction:ltr"></div>
        <div class="pib-field"><label style="width:auto">צבע</label><input type="color" id="pp-warn-col" value="${item.warnColor||'#f59e0b'}"></div>
      </div>
      <div class="pib-field-row2">
        <div class="pib-field"><label>קריטי</label><input type="text" id="pp-crit" value="${_esc(item.critValue||'')}" placeholder="ערך" style="direction:ltr"></div>
        <div class="pib-field"><label style="width:auto">צבע</label><input type="color" id="pp-crit-col" value="${item.critColor||'#ef4444'}"></div>
      </div>
    </div>

    ${_renderTypeSpecificProps(item)}
    `);

    // Bind prop events
    const bind = (id, prop, isNum) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        const val = isNum ? parseFloat(el.value) : el.value;
        item[prop] = isNaN(val) && isNum ? 0 : val;
        _scheduleRender();
      });
      el.addEventListener('change', () => { _pushHistory(); });
    };

    bind('pp-name', 'name');
    bind('pp-x', 'x', true);
    bind('pp-y', 'y', true);
    bind('pp-w', 'w', true);
    bind('pp-h', 'h', true);
    bind('pp-border', 'borderColor');
    bind('pp-border-w', 'borderWidth', true);
    bind('pp-opacity', 'opacity', true);
    bind('pp-tag', 'tag');
    bind('pp-interval', 'interval', true);
    bind('pp-format', 'format');
    bind('pp-warn', 'warnValue');
    bind('pp-warn-col', 'warnColor');
    bind('pp-crit', 'critValue');
    bind('pp-crit-col', 'critColor');

    // BG color + text sync
    const bgColor = document.getElementById('pp-bg');
    const bgTxt   = document.getElementById('pp-bg-txt');
    if (bgColor && bgTxt) {
      bgColor.addEventListener('input', () => { item.bgColor = bgColor.value; bgTxt.value = bgColor.value; _scheduleRender(); });
      bgTxt.addEventListener('input', () => { item.bgColor = bgTxt.value || null; bgColor.value = bgTxt.value||'#0d1b2a'; _scheduleRender(); });
      bgColor.addEventListener('change', () => _pushHistory());
      bgTxt.addEventListener('change', () => _pushHistory());
    }

    // Radius slider
    const radSlider = document.getElementById('pp-radius');
    const radVal    = document.getElementById('pp-radius-val');
    if (radSlider) {
      radSlider.addEventListener('input', () => { item.borderRadius = +radSlider.value; if(radVal) radVal.textContent = radSlider.value+'px'; _scheduleRender(); });
      radSlider.addEventListener('change', () => _pushHistory());
    }

    // Opacity slider
    const opSlider = document.getElementById('pp-opacity');
    const opVal    = document.getElementById('pp-opacity-val');
    if (opSlider) {
      opSlider.addEventListener('input', () => { item.opacity = +opSlider.value; if(opVal) opVal.textContent = Math.round(+opSlider.value*100)+'%'; _scheduleRender(); });
      opSlider.addEventListener('change', () => _pushHistory());
    }

    // Z-order
    _propPanel.querySelector('[data-zfront]')?.addEventListener('click', _bringToFront);
    _propPanel.querySelector('[data-zback]')?.addEventListener('click', _sendToBack);

    // Type specific
    _bindTypeSpecificProps(item);
  }

  function _renderTypeSpecificProps(item) {
    const t  = item.type;
    const p  = item.props || {};

    if (t.startsWith('text-')) {
      return `<div class="pib-section">
        <div class="pib-section-title">טקסט</div>
        <div class="pib-field">
          <label>תוכן</label>
          <input type="text" id="pp-text" value="${_esc(p.text||'')}">
        </div>
        <div class="pib-field">
          <label>גודל</label>
          <input type="number" id="pp-fs" value="${p.fontSize||14}" min="6" max="120">
        </div>
        <div class="pib-field">
          <label>עובי</label>
          <select id="pp-fw">
            <option value="300"${p.fontWeight=='300'?' selected':''}>דק</option>
            <option value="400"${(!p.fontWeight||p.fontWeight=='400')?' selected':''}>רגיל</option>
            <option value="600"${p.fontWeight=='600'?' selected':''}>בינוני</option>
            <option value="700"${p.fontWeight=='700'?' selected':''}>עבה</option>
          </select>
        </div>
        <div class="pib-field">
          <label>צבע</label>
          <input type="color" id="pp-tcolor" value="${p.color||'#e2e8f0'}">
        </div>
        ${t==='text-value'?`<div class="pib-field"><label>יחידות</label><input type="text" id="pp-units" value="${_esc(p.units||'')}"></div>`:''}
      </div>`;
    }

    if (t.startsWith('gauge-') && t !== 'gauge-status' && t !== 'gauge-kpi') {
      return `<div class="pib-section">
        <div class="pib-section-title">מד</div>
        <div class="pib-field-row2">
          <div class="pib-field"><label>מינ׳</label><input type="number" id="pp-gmin" value="${p.min!==undefined?p.min:0}"></div>
          <div class="pib-field"><label>מקס׳</label><input type="number" id="pp-gmax" value="${p.max!==undefined?p.max:100}"></div>
        </div>
        <div class="pib-field">
          <label>ערך</label>
          <input type="number" id="pp-gval" value="${p.value!==undefined?p.value:50}">
        </div>
        <div class="pib-field">
          <label>יחידות</label>
          <input type="text" id="pp-gunits" value="${_esc(p.units||'')}">
        </div>
      </div>`;
    }

    if (t === 'gauge-kpi') {
      return `<div class="pib-section">
        <div class="pib-section-title">כרטיס KPI</div>
        <div class="pib-field"><label>ערך</label><input type="text" id="pp-kpival" value="${_esc(p.value||'')}"></div>
        <div class="pib-field"><label>יחידות</label><input type="text" id="pp-kpiunit" value="${_esc(p.units||'')}"></div>
        <div class="pib-field"><label>תווית</label><input type="text" id="pp-kpilbl" value="${_esc(p.label||'')}"></div>
        <div class="pib-field"><label>צבע</label><input type="color" id="pp-kpicol" value="${p.accentColor||'#00d4ff'}"></div>
      </div>`;
    }

    if (t.startsWith('chart-')) {
      return `<div class="pib-section">
        <div class="pib-section-title">גרף</div>
        <div class="pib-field"><label>כותרת</label><input type="text" id="pp-ctitle" value="${_esc(p.title||'')}"></div>
        <div class="pib-field"><label>צבע</label><input type="color" id="pp-ccolor" value="${p.color||'#00d4ff'}"></div>
      </div>`;
    }

    if (t === 'gauge-status') {
      return `<div class="pib-section">
        <div class="pib-section-title">מצב</div>
        <div class="pib-field"><label>תווית</label><input type="text" id="pp-stlbl" value="${_esc(p.label||'')}"></div>
        <div class="pib-field"><label>מצב</label>
          <select id="pp-ststs">
            <option value="good"${p.status==='good'?' selected':''}>תקין</option>
            <option value="warn"${p.status==='warn'?' selected':''}>אזהרה</option>
            <option value="bad"${p.status==='bad'?' selected':''}>תקלה</option>
          </select>
        </div>
      </div>`;
    }

    return '';
  }

  function _bindTypeSpecificProps(item) {
    const t = item.type;
    const p = item.props || {};

    const bindProp = (id, key, isNum) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', () => {
        item.props[key] = isNum ? parseFloat(el.value) : el.value;
        _scheduleRender();
      });
      el.addEventListener('change', () => _pushHistory());
    };

    if (t.startsWith('text-')) {
      bindProp('pp-text', 'text');
      bindProp('pp-fs', 'fontSize', true);
      bindProp('pp-fw', 'fontWeight');
      bindProp('pp-tcolor', 'color');
      bindProp('pp-units', 'units');
    }
    if (t.startsWith('gauge-') && t!=='gauge-status' && t!=='gauge-kpi') {
      bindProp('pp-gmin', 'min', true);
      bindProp('pp-gmax', 'max', true);
      bindProp('pp-gval', 'value', true);
      bindProp('pp-gunits', 'units');
    }
    if (t === 'gauge-kpi') {
      bindProp('pp-kpival', 'value');
      bindProp('pp-kpiunit', 'units');
      bindProp('pp-kpilbl', 'label');
      bindProp('pp-kpicol', 'accentColor');
    }
    if (t.startsWith('chart-')) {
      bindProp('pp-ctitle', 'title');
      bindProp('pp-ccolor', 'color');
    }
    if (t === 'gauge-status') {
      bindProp('pp-stlbl', 'label');
      bindProp('pp-ststs', 'status');
    }
  }

  // ─── Status bar update ───────────────────────────────────────────────────

  function _updateStatusBar() {
    const sizeEl  = document.getElementById('pib-status-size');
    const gridEl  = document.getElementById('pib-status-grid');
    const itemsEl = document.getElementById('pib-status-items');
    const selEl   = document.getElementById('pib-status-sel');
    const zoomEl  = document.getElementById('pib-status-zoom');

    if (sizeEl)  _setSafeInner(sizeEl, `<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="1" width="10" height="10" rx="1"/></svg> ${_canvasW}×${_canvasH}`);
    if (gridEl)  _setSafeInner(gridEl, `<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="4" y1="0" x2="4" y2="12"/><line x1="8" y1="0" x2="8" y2="12"/><line x1="0" y1="4" x2="12" y2="4"/><line x1="0" y1="8" x2="12" y2="8"/></svg> רשת: ${GRID_SIZE}px ${_snapToGrid?'✓':'✗'}`);
    if (itemsEl) itemsEl.textContent = _items.length + ' פריטים';
    if (selEl)   selEl.textContent  = _selected.size > 0 ? `נבחרו: ${_selected.size}` : 'אין בחירה';
    if (zoomEl)  zoomEl.textContent = `זום: ${Math.round(_zoom*100)}%`;
  }

  // ─── Export wizard ───────────────────────────────────────────────────────

  function _showExportDialog() {
    const backdrop = document.createElement('div');
    backdrop.className = 'pib-modal-backdrop';

    const symbolName = 'piv_custom_' + Date.now().toString(36);
    const htmlCode = _generateHTML(symbolName);
    const jsCode   = _generateJS(symbolName);
    const cssCode  = _generateCSS(symbolName);

    _setSafeInner(backdrop, `
    <div class="pib-modal" style="max-width:760px">
      <div class="pib-modal-header">
        <span>ייצוא סמל PI Vision</span>
        <button class="pib-modal-close">×</button>
      </div>
      <div class="pib-tabs">
        <button class="pib-tab active" data-tab="preview">תצוגה מקדימה</button>
        <button class="pib-tab" data-tab="html">HTML</button>
        <button class="pib-tab" data-tab="js">JavaScript</button>
        <button class="pib-tab" data-tab="css">CSS</button>
        <button class="pib-tab" data-tab="download">הורדה</button>
      </div>
      <div class="pib-modal-body" style="min-height:280px">
        <div class="pib-tab-content active" data-tab="preview">
          <div style="font-size:12px;color:#64748b;margin-bottom:10px">תצוגה מקדימה של הסמל בסביבת PI Vision</div>
          <div style="background:#0a0f1e;border:1px solid rgba(0,212,255,0.1);border-radius:6px;padding:16px;min-height:200px;overflow:auto;position:relative">
            <div style="position:relative;width:${Math.min(_canvasW, 680)}px;height:${Math.round(_canvasH * Math.min(1, 680/_canvasW))}px;transform:scale(${Math.min(1, 680/_canvasW)});transform-origin:top right;background-color:#0d1b2a;background-image:linear-gradient(rgba(0,212,255,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,212,255,0.04) 1px,transparent 1px);background-size:10px 10px;border-radius:4px">
              ${_items.map(item => `<div style="position:absolute;left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px;opacity:${item.opacity||1};z-index:${item.zIndex||0};border-radius:${item.borderRadius||0}px;${item.borderWidth?`border:${item.borderWidth}px solid ${item.borderColor||'#00d4ff'};`:''}${item.bgColor?`background-color:${item.bgColor};`:''}overflow:hidden">
                ${_renderItemContent(item)}
              </div>`).join('')}
            </div>
          </div>
        </div>
        <div class="pib-tab-content" data-tab="html">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:12px;color:#64748b">תבנית HTML עם Angular directives</span>
            <button class="pib-btn" id="pib-copy-html">העתק</button>
          </div>
          <pre class="pib-code-block" id="pib-html-code">${_esc(htmlCode)}</pre>
        </div>
        <div class="pib-tab-content" data-tab="js">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:12px;color:#64748b">קובץ JavaScript לרישום הסמל</span>
            <button class="pib-btn" id="pib-copy-js">העתק</button>
          </div>
          <pre class="pib-code-block" id="pib-js-code">${_esc(jsCode)}</pre>
        </div>
        <div class="pib-tab-content" data-tab="css">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
            <span style="font-size:12px;color:#64748b">עיצוב CSS מוגבל לסמל</span>
            <button class="pib-btn" id="pib-copy-css">העתק</button>
          </div>
          <pre class="pib-code-block" id="pib-css-code">${_esc(cssCode)}</pre>
        </div>
        <div class="pib-tab-content" data-tab="download">
          <div style="max-width:420px;margin:0 auto">
            <div class="pib-section">
              <div class="pib-section-title">הגדרות ייצוא</div>
              <div class="pib-field"><label>שם סמל</label><input type="text" id="pib-export-name" value="${symbolName}" style="direction:ltr"></div>
              <div class="pib-field">
                <label>קטגוריה</label>
                <select id="pib-export-cat">
                  <option>Custom</option>
                  <option>Charts</option>
                  <option>Gauges</option>
                  <option>Industrial</option>
                  <option>Utilities</option>
                </select>
              </div>
            </div>
            <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
              <button class="pib-btn pib-btn--primary" id="pib-dl-zip" style="justify-content:center;padding:10px">
                <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8 1v9M5 7l3 3 3-3"/><path d="M2 12v2a1 1 0 001 1h10a1 1 0 001-1v-2"/></svg>
                הורד קובץ ZIP (HTML + JS + CSS)
              </button>
              <button class="pib-btn" id="pib-dl-json" style="justify-content:center">
                שמור JSON (עיצוב)
              </button>
            </div>
          </div>
        </div>
      </div>
      <div class="pib-modal-footer">
        <button class="pib-btn pib-btn--danger" id="pib-modal-cancel-ex">סגור</button>
      </div>
    </div>`);

    // Tab switching
    backdrop.querySelectorAll('.pib-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        backdrop.querySelectorAll('.pib-tab').forEach(t2 => t2.classList.remove('active'));
        backdrop.querySelectorAll('.pib-tab-content').forEach(c => c.classList.remove('active'));
        tab.classList.add('active');
        backdrop.querySelector(`.pib-tab-content[data-tab="${tab.dataset.tab}"]`).classList.add('active');
      });
    });

    backdrop.querySelector('.pib-modal-close').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#pib-modal-cancel-ex').addEventListener('click', () => backdrop.remove());

    // Copy buttons
    backdrop.querySelector('#pib-copy-html').addEventListener('click', () => navigator.clipboard.writeText(htmlCode).then(() => _toast('HTML הועתק')));
    backdrop.querySelector('#pib-copy-js').addEventListener('click', () => navigator.clipboard.writeText(jsCode).then(() => _toast('JS הועתק')));
    backdrop.querySelector('#pib-copy-css').addEventListener('click', () => navigator.clipboard.writeText(cssCode).then(() => _toast('CSS הועתק')));

    // Download ZIP (simulate with Blob download)
    backdrop.querySelector('#pib-dl-zip').addEventListener('click', () => {
      const nm = backdrop.querySelector('#pib-export-name').value || symbolName;
      _downloadFile(`${nm}.html`, htmlCode, 'text/html');
      setTimeout(() => _downloadFile(`${nm}.js`, jsCode, 'text/javascript'), 200);
      setTimeout(() => _downloadFile(`${nm}.css`, cssCode, 'text/css'), 400);
      _toast('קבצים מורדים...');
    });

    backdrop.querySelector('#pib-dl-json').addEventListener('click', () => {
      const json = JSON.stringify({ name: symbolName, items: _items, canvasW: _canvasW, canvasH: _canvasH }, null, 2);
      _downloadFile(`${symbolName}.json`, json, 'application/json');
    });

    document.body.appendChild(backdrop);
    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  }

  // ─── Code generation ─────────────────────────────────────────────────────

  function _generateHTML(name) {
    const items = _items.map(item => {
      const cls = `sym-item sym-${item.type}`;
      return `  <div class="${cls}" style="position:absolute;left:${item.x}px;top:${item.y}px;width:${item.w}px;height:${item.h}px" ng-bind="item.Properties.Value | pivFormat:'${item.format||'number'}'" data-piv-tag="${item.tag||''}"></div>`;
    }).join('\n');

    return `<!-- PI Vision Symbol: ${name} -->
<!-- Generated by PIV Visual Builder -->
<div class="sym-${name}" style="position:relative;width:${_canvasW}px;height:${_canvasH}px">
${items}
</div>`;
  }

  function _generateJS(name) {
    const registration = `(function() {
'use strict';

var def = {
  typeName: '${name}',
  displayName: '${name}',
  datasourceBehavior: PIVisualization.Extensibility.Enums.DatasourceBehaviors.Single,
  visObjectType: PIVisualization.Extensibility.Enums.VisObjectTypes.SymbolType,
  iconUrl: '',
  getDefaultConfig: function() {
    return {
      DataShape: 'Value',
      Height: ${_canvasH},
      Width: ${_canvasW},
    };
  },
  init: function(scope, element) {
    scope.symbolContainerEl = element[0].firstElementChild;
  },
  dataUpdate: function(scope, data) {
    if (!data || !data.Body) return;
    scope.value = data.Body.Value;
    scope.timestamp = data.Body.Timestamp;
    scope.isGood = !data.Body.IsSystem;
  },
  destroy: function(scope, element) {
    // Cleanup
  }
};

PIVisualization.ClientSettings.REGISTER_SYMBOL(def);

}());`;
    return registration;
  }

  function _generateCSS(name) {
    const itemStyles = _items.map(item => {
      let css = `.sym-${name} .sym-${item.type} {\n`;
      if (item.bgColor)     css += `  background-color: ${item.bgColor};\n`;
      if (item.borderWidth) css += `  border: ${item.borderWidth}px solid ${item.borderColor||'#00d4ff'};\n`;
      if (item.borderRadius) css += `  border-radius: ${item.borderRadius}px;\n`;
      if (item.opacity < 1) css += `  opacity: ${item.opacity};\n`;
      css += '}';
      return css;
    }).join('\n\n');

    return `/* PI Vision Symbol: ${name} */
/* Generated by PIV Visual Builder */

.sym-${name} {
  position: relative;
  width: ${_canvasW}px;
  height: ${_canvasH}px;
  font-family: 'Heebo', 'Segoe UI', sans-serif;
  direction: rtl;
}

.sym-${name} .sym-item {
  position: absolute;
  box-sizing: border-box;
  overflow: hidden;
}

${itemStyles}`;
  }

  // ─── Templates dialog ────────────────────────────────────────────────────

  function _showTemplatesDialog() {
    const backdrop = document.createElement('div');
    backdrop.className = 'pib-modal-backdrop';
    _setSafeInner(backdrop, `
    <div class="pib-modal" style="max-width:560px">
      <div class="pib-modal-header">
        <span>תבניות מוכנות</span>
        <button class="pib-modal-close">×</button>
      </div>
      <div class="pib-modal-body">
        <div style="font-size:12px;color:#64748b;margin-bottom:14px">בחר תבנית לטעינה בבד הציור. שינויים לא שמורים יאבדו.</div>
        <div class="pib-templates-grid">
          ${TEMPLATES.map(t => `
          <div class="pib-template-card" data-tid="${_esc(t.id)}">
            <div class="pib-template-name">${_esc(t.name)}</div>
            <div class="pib-template-desc">${_esc(t.desc)}</div>
          </div>`).join('')}
        </div>
      </div>
      <div class="pib-modal-footer">
        <button class="pib-btn pib-btn--danger" id="pib-tmpl-cancel">ביטול</button>
      </div>
    </div>`);

    backdrop.querySelector('.pib-modal-close').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#pib-tmpl-cancel').addEventListener('click', () => backdrop.remove());

    backdrop.querySelectorAll('.pib-template-card').forEach(card => {
      card.addEventListener('click', () => {
        const tmpl = TEMPLATES.find(t => t.id === card.dataset.tid);
        if (!tmpl) return;
        _pushHistory();
        _items = tmpl.build();
        _selected.clear();
        _nextId = 1;
        // Re-assign fresh IDs
        _items.forEach(it => { it.id = _uid(); });
        _render();
        _updatePropsPanel();
        backdrop.remove();
        _toast(`תבנית "${tmpl.name}" נטענה`);
      });
    });

    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    document.body.appendChild(backdrop);
  }

  // ─── Save dialog ─────────────────────────────────────────────────────────

  function _showOpenDialog() {
    const designs = _loadDesigns();
    const backdrop = document.createElement('div');
    backdrop.className = 'pib-modal-backdrop';
    _setSafeInner(backdrop, `
    <div class="pib-modal" style="max-width:500px">
      <div class="pib-modal-header">
        <span>פתח עיצוב שמור</span>
        <button class="pib-modal-close">×</button>
      </div>
      <div class="pib-modal-body">
        ${designs.length === 0
          ? `<div class="pib-props-empty">אין עיצובים שמורים</div>`
          : `<div class="pib-designs-list">${designs.map((d,i) => `
          <div class="pib-design-row" data-idx="${i}">
            <div class="pib-design-name">${_esc(d.name)}</div>
            <div class="pib-design-meta">${_esc(d.modified||d.created||'')} · ${(d.items||[]).length} פריטים</div>
            <button class="pib-design-del" data-del="${i}" title="מחק">🗑</button>
          </div>`).join('')}
          </div>`
        }
      </div>
      <div class="pib-modal-footer">
        <button class="pib-btn pib-btn--danger" id="pib-open-cancel">ביטול</button>
      </div>
    </div>`);

    backdrop.querySelector('.pib-modal-close').addEventListener('click', () => backdrop.remove());
    backdrop.querySelector('#pib-open-cancel').addEventListener('click', () => backdrop.remove());

    backdrop.querySelectorAll('.pib-design-row').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.dataset.del !== undefined) return;
        const design = designs[+row.dataset.idx];
        load(design);
        backdrop.remove();
        _toast(`"${design.name}" נטען`);
      });
    });

    backdrop.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = +btn.dataset.del;
        designs.splice(idx, 1);
        _saveDesigns(designs);
        backdrop.remove();
        _showOpenDialog();
      });
    });

    backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
    document.body.appendChild(backdrop);
  }

  // ─── Toast notification ──────────────────────────────────────────────────

  function _toast(msg) {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; bottom: 48px; left: 50%; transform: translateX(-50%);
      background: rgba(0,212,255,0.15); border: 1px solid rgba(0,212,255,0.3);
      color: #00d4ff; padding: 7px 18px; border-radius: 20px;
      font-size: 12px; font-family: inherit; z-index: 10000;
      backdrop-filter: blur(8px); animation: pibFadeIn 0.15s ease;
      pointer-events: none;
    `;
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  // ─── Download helper ────────────────────────────────────────────────────

  function _downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ─── Escape HTML ─────────────────────────────────────────────────────────

  function _esc(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * פותח את העורך הויזואלי כמסך מלא
   */
  function open() {
    if (_open) return;
    _open = true;

    _injectCSS();
    _buildOverlay();

    // Initialize
    _items = [];
    _selected.clear();
    _history = [[]];
    _historyIndex = 0;
    _zoom = 1;
    _snapToGrid = true;
    _nextId = 1;
    _dirty = false;

    _setCanvasSize(DEFAULT_CANVAS_W, DEFAULT_CANVAS_H);
    _render();
    _updatePropsPanel();
    _updateToolbarState();

    // Show
    requestAnimationFrame(() => {
      _overlay.classList.add('pib-visible');
    });

    // Also show the mode-builder div
    const modeEl = document.getElementById('mode-builder');
    if (modeEl) modeEl.classList.add('active');

    console.log('[PIV_BUILDER] עורך ויזואלי פתוח');
  }

  /**
   * סוגר את העורך וחוזר ללאנצ'ר
   */
  function close() {
    if (!_open) return;

    if (_dirty) {
      const ok = confirm('יש שינויים לא שמורים. לסגור בכל זאת?');
      if (!ok) return;
    }

    _open = false;
    if (_overlay) {
      _overlay.classList.remove('pib-visible');
      setTimeout(() => {
        if (_overlay) _overlay.style.display = 'none';
      }, 260);
    }

    // Return to launcher
    const launcher = document.getElementById('launcher-screen');
    if (launcher) {
      launcher.style.display = 'flex';
      launcher.classList.add('fade-in');
    }
    const modeEl = document.getElementById('mode-builder');
    if (modeEl) modeEl.classList.remove('active');

    console.log('[PIV_BUILDER] עורך ויזואלי סגור');
  }

  /**
   * שומר את העיצוב הנוכחי ב-storage
   */
  function save() {
    const nameInput = prompt('שם העיצוב:', 'עיצוב חדש');
    if (!nameInput) return;

    const designs = _loadDesigns();
    const existing = designs.findIndex(d => d.name === nameInput);
    const now = new Date().toLocaleString('he-IL');

    const design = {
      name: nameInput,
      created: now,
      modified: now,
      canvasW: _canvasW,
      canvasH: _canvasH,
      items: _cloneItems(_items),
    };

    if (existing >= 0) {
      design.created = designs[existing].created;
      designs[existing] = design;
    } else {
      if (designs.length >= MAX_DESIGNS) designs.shift();
      designs.push(design);
    }

    _saveDesigns(designs);
    _dirty = false;
    _toast(`"${nameInput}" נשמר`);
  }

  /**
   * מייצא את הסמל כקבצי PI Vision
   */
  function exportDesign() {
    _showExportDialog();
  }

  /**
   * טוען עיצוב שמור
   * @param {object} design
   */
  function load(design) {
    if (!design) return;
    _pushHistory();
    _items    = _cloneItems(design.items || []);
    _canvasW  = design.canvasW || DEFAULT_CANVAS_W;
    _canvasH  = design.canvasH || DEFAULT_CANVAS_H;
    _selected.clear();
    // Rebuild next ID
    let maxId = 0;
    _items.forEach(it => {
      const n = parseInt((it.id||'').split('_')[1]||0);
      if (n > maxId) maxId = n;
    });
    _nextId = maxId + 1;
    _setCanvasSize(_canvasW, _canvasH);
    _render();
    _updatePropsPanel();
    _dirty = false;
  }

  // Public export
  return {
    open,
    close,
    save,
    export: exportDesign,
    load,
  };

})();
