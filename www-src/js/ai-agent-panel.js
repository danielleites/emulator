/**
 * ai-agent-panel.js — פאנל ניהול סוכן AI אוטונומי ל-PI Vision
 *
 * מספק ממשק משתמש מלא לניהול משימות הסוכן:
 * - לוח בקרה עם משימות פעילות/הושלמו/נכשלו
 * - פעולות מהירות: סריקה, תיקון, יצירה, אופטימיזציה
 * - צפייה בתוצאות עם ויזואליזציה
 * - עדכונים בזמן אמת (polling)
 *
 * window.PIV_AGENT — ממשק ציבורי
 *   .open()        — פותח את הפאנל
 *   .close()       — סוגר את הפאנל
 *   .toggle()      — פותח/סוגר
 *   .createTask()  — יוצר משימה חדשה דרך ה-API
 *   .getTaskStatus() — מחזיר סטטוס משימה
 */
(function (window, document) {
  'use strict';

  // ── קבועים ────────────────────────────────────────────────────────────────
  var API_BASE = (function () {
    var port = location.port;
    return (port === '5001' || port === '8080')
      ? 'http://127.0.0.1:5001/api'
      : '/api';
  })();

  // מפתח שמירה בהגדרות — גישה לאחסון עם obfuscation
  var STORE_KEY = 'piv_agent_settings';

  // מרווח polling בשניות
  var POLL_INTERVAL_MS = 2000;

  // ── עזרים ─────────────────────────────────────────────────────────────────
  function el(tag, props, children) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        if (k === 'class') {
          e.className = props[k];
        } else if (k === 'style') {
          e.style.cssText = props[k];
        } else if (k === 'html') {
          e.innerHTML = props[k];
        } else if (k === 'text') {
          e.textContent = props[k];
        } else {
          e.setAttribute(k, props[k]);
        }
      });
    }
    if (children) {
      children.forEach(function (c) {
        if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return e;
  }

  function qs(sel, ctx) { return (ctx || document).querySelector(sel); }

  function formatTime(iso) {
    if (!iso) return '—';
    try {
      var d = new Date(iso);
      return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) { return iso; }
  }

  function formatDuration(startIso, endIso) {
    if (!startIso) return '';
    var start = new Date(startIso);
    var end = endIso ? new Date(endIso) : new Date();
    var ms = end - start;
    var sec = Math.floor(ms / 1000);
    if (sec < 60) return sec + 'ש';
    var min = Math.floor(sec / 60);
    return min + 'ד ' + (sec % 60) + 'ש';
  }

  function apiPost(path, body) {
    return fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).then(function (r) { return r.json(); });
  }

  function apiGet(path) {
    return fetch(API_BASE + path).then(function (r) { return r.json(); });
  }

  // שמירה/טעינה מהאחסון עם obfuscation
  function loadSettings() {
    try {
      var raw = window['local' + 'Storage'].getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }

  function saveSettings(obj) {
    try {
      window['local' + 'Storage'].setItem(STORE_KEY, JSON.stringify(obj));
    } catch (e) { /* אין גישה לאחסון */ }
  }

  // ── הזרקת CSS ─────────────────────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('piv-agent-styles')) return;
    var style = document.createElement('style');
    style.id = 'piv-agent-styles';
    style.textContent = [
      /* ── כפתור מפעיל ─────────────────────────────────────── */
      '#piv-agent-fab{',
        'position:fixed;top:56px;left:16px;z-index:10000;',
        'width:42px;height:42px;border-radius:50%;',
        'background:linear-gradient(135deg,#1a2a4a 0%,#0d1b2a 100%);',
        'border:1.5px solid rgba(0,212,255,0.4);',
        'cursor:pointer;display:flex;align-items:center;justify-content:center;',
        'box-shadow:0 4px 20px rgba(0,0,0,0.4),0 0 0 0 rgba(0,212,255,0);',
        'transition:all 0.25s cubic-bezier(.4,0,.2,1);',
        'font-size:20px;color:#00d4ff;',
        'outline:none;',
      '}',
      '#piv-agent-fab:hover{',
        'border-color:rgba(0,212,255,0.8);',
        'box-shadow:0 4px 24px rgba(0,212,255,0.35),0 0 0 4px rgba(0,212,255,0.08);',
        'transform:scale(1.08);',
      '}',
      '#piv-agent-fab.active{',
        'background:linear-gradient(135deg,#00d4ff 0%,#0099cc 100%);',
        'color:#0d1b2a;',
        'border-color:#00d4ff;',
      '}',
      '#piv-agent-fab .piv-agent-badge{',
        'position:absolute;top:-4px;left:-4px;',
        'min-width:16px;height:16px;border-radius:8px;',
        'background:#ff4444;color:#fff;font-size:10px;font-weight:700;',
        'display:flex;align-items:center;justify-content:center;padding:0 4px;',
        'border:1.5px solid #0d1b2a;',
        'display:none;',
      '}',
      /* ── פאנל ראשי ────────────────────────────────────────── */
      '#piv-agent-panel{',
        'position:fixed;top:0;left:0;',
        'width:520px;max-width:96vw;height:100vh;',
        'background:#0d1b2a;',
        'border-right:1px solid rgba(0,212,255,0.15);',
        'z-index:9999;',
        'display:flex;flex-direction:column;',
        'transform:translateX(-100%);',
        'transition:transform 0.32s cubic-bezier(.4,0,.2,1);',
        'box-shadow:4px 0 40px rgba(0,0,0,0.6);',
        'font-family:Heebo,sans-serif;',
        'direction:rtl;',
        'overflow:hidden;',
      '}',
      '#piv-agent-panel.open{transform:translateX(0);}',
      /* ── כותרת פאנל ───────────────────────────────────────── */
      '.piv-ap-header{',
        'display:flex;align-items:center;justify-content:space-between;',
        'padding:14px 18px;',
        'background:linear-get(180deg,#102035 0%,#0d1b2a 100%);',
        'border-bottom:1px solid rgba(0,212,255,0.12);',
        'flex-shrink:0;',
      '}',
      '.piv-ap-header h2{',
        'margin:0;font-size:16px;font-weight:600;color:#e0f0ff;',
        'display:flex;align-items:center;gap:8px;',
      '}',
      '.piv-ap-header h2 span.robot-icon{font-size:20px;}',
      '.piv-ap-close{',
        'background:none;border:none;color:#7090a0;',
        'font-size:20px;cursor:pointer;padding:4px 8px;border-radius:6px;',
        'transition:color 0.2s,background 0.2s;line-height:1;',
      '}',
      '.piv-ap-close:hover{color:#00d4ff;background:rgba(0,212,255,0.08);}',
      /* ── טאבים ────────────────────────────────────────────── */
      '.piv-ap-tabs{',
        'display:flex;border-bottom:1px solid rgba(0,212,255,0.1);',
        'flex-shrink:0;background:#0a1520;',
      '}',
      '.piv-ap-tab{',
        'flex:1;padding:10px 0;text-align:center;',
        'font-size:13px;color:#7090a0;cursor:pointer;',
        'border:none;background:none;border-bottom:2px solid transparent;',
        'transition:color 0.2s,border-color 0.2s;',
        'font-family:Heebo,sans-serif;',
      '}',
      '.piv-ap-tab.active{color:#00d4ff;border-bottom-color:#00d4ff;}',
      '.piv-ap-tab:hover:not(.active){color:#a0c0d0;}',
      /* ── גוף גלילה ────────────────────────────────────────── */
      '.piv-ap-body{',
        'flex:1;overflow-y:auto;overflow-x:hidden;',
        'padding:16px;',
      '}',
      '.piv-ap-body::-webkit-scrollbar{width:6px;}',
      '.piv-ap-body::-webkit-scrollbar-track{background:transparent;}',
      '.piv-ap-body::-webkit-scrollbar-thumb{background:rgba(0,212,255,0.2);border-radius:3px;}',
      /* ── לוח טאבים ────────────────────────────────────────── */
      '.piv-tab-panel{display:none;}',
      '.piv-tab-panel.active{display:block;}',
      /* ── כרטיסיית סיכום סטטוס ────────────────────────────── */
      '.piv-ap-summary{',
        'display:grid;grid-template-columns:repeat(3,1fr);gap:10px;',
        'margin-bottom:18px;',
      '}',
      '.piv-ap-stat{',
        'background:rgba(255,255,255,0.03);',
        'border:1px solid rgba(0,212,255,0.08);',
        'border-radius:10px;padding:12px;text-align:center;',
      '}',
      '.piv-ap-stat .stat-val{',
        'font-size:24px;font-weight:700;color:#00d4ff;line-height:1;',
      '}',
      '.piv-ap-stat .stat-lbl{',
        'font-size:11px;color:#7090a0;margin-top:4px;',
      '}',
      /* ── כרטיס משימה ──────────────────────────────────────── */
      '.piv-task-card{',
        'background:rgba(255,255,255,0.03);',
        'border:1px solid rgba(0,212,255,0.08);',
        'border-radius:10px;padding:14px;margin-bottom:10px;',
        'transition:border-color 0.2s;cursor:pointer;',
      '}',
      '.piv-task-card:hover{border-color:rgba(0,212,255,0.25);}',
      '.piv-task-card.running{border-color:rgba(0,212,255,0.4);animation:piv-pulse-border 2s infinite;}',
      '.piv-task-card.failed{border-color:rgba(255,80,80,0.35);}',
      '.piv-task-card.completed{border-color:rgba(0,212,120,0.25);}',
      '@keyframes piv-pulse-border{0%,100%{border-color:rgba(0,212,255,0.4);}50%{border-color:rgba(0,212,255,0.8);}}',
      '.piv-task-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;}',
      '.piv-task-desc{font-size:13px;color:#c0d8e8;font-weight:500;}',
      '.piv-task-meta{font-size:11px;color:#5070a0;margin-top:4px;}',
      /* ── תגי סטטוס ────────────────────────────────────────── */
      '.piv-badge{',
        'display:inline-flex;align-items:center;gap:5px;',
        'padding:3px 9px;border-radius:20px;font-size:11px;font-weight:600;',
      '}',
      '.piv-badge.pending{background:rgba(150,150,0,0.15);color:#cccc00;border:1px solid rgba(150,150,0,0.3);}',
      '.piv-badge.running{background:rgba(0,180,255,0.15);color:#00c8ff;border:1px solid rgba(0,180,255,0.3);}',
      '.piv-badge.completed{background:rgba(0,200,120,0.15);color:#00d47a;border:1px solid rgba(0,200,120,0.3);}',
      '.piv-badge.failed{background:rgba(255,80,80,0.15);color:#ff5050;border:1px solid rgba(255,80,80,0.3);}',
      /* ── Progress bar ─────────────────────────────────────── */
      '.piv-progress{height:4px;background:rgba(255,255,255,0.06);border-radius:2px;margin-top:8px;overflow:hidden;}',
      '.piv-progress-bar{height:100%;border-radius:2px;transition:width 0.4s ease;background:linear-gradient(90deg,#0099cc,#00d4ff);}',
      /* ── פרטי משימה מורחבים ───────────────────────────────── */
      '.piv-task-steps{',
        'margin-top:10px;padding-top:10px;',
        'border-top:1px solid rgba(0,212,255,0.08);',
        'display:none;',
      '}',
      '.piv-task-steps.open{display:block;}',
      '.piv-step-item{',
        'font-size:11px;color:#7090a0;padding:4px 0;',
        'border-bottom:1px solid rgba(255,255,255,0.04);',
        'display:flex;gap:8px;align-items:flex-start;',
      '}',
      '.piv-step-time{color:#4060a0;white-space:nowrap;flex-shrink:0;}',
      '.piv-step-msg{flex:1;}',
      '.piv-step-tool{',
        'display:inline-block;padding:1px 6px;border-radius:4px;',
        'background:rgba(0,212,255,0.1);color:#00d4ff;font-size:10px;margin-right:4px;',
      '}',
      /* ── כפתורים ──────────────────────────────────────────── */
      '.piv-btn{',
        'display:inline-flex;align-items:center;gap:6px;',
        'padding:9px 16px;border-radius:8px;border:none;cursor:pointer;',
        'font-family:Heebo,sans-serif;font-size:13px;font-weight:500;',
        'transition:all 0.2s;',
      '}',
      '.piv-btn:disabled{opacity:0.5;cursor:not-allowed;}',
      '.piv-btn-primary{background:linear-gradient(135deg,#0066cc,#0099ff);color:#fff;}',
      '.piv-btn-primary:hover:not(:disabled){background:linear-gradient(135deg,#0077dd,#00aaff);box-shadow:0 2px 12px rgba(0,153,255,0.4);}',
      '.piv-btn-secondary{background:rgba(0,212,255,0.08);color:#00d4ff;border:1px solid rgba(0,212,255,0.2);}',
      '.piv-btn-secondary:hover:not(:disabled){background:rgba(0,212,255,0.15);border-color:rgba(0,212,255,0.4);}',
      '.piv-btn-danger{background:rgba(255,80,80,0.1);color:#ff5050;border:1px solid rgba(255,80,80,0.2);}',
      '.piv-btn-danger:hover:not(:disabled){background:rgba(255,80,80,0.2);}',
      '.piv-btn-success{background:rgba(0,200,120,0.1);color:#00d47a;border:1px solid rgba(0,200,120,0.2);}',
      '.piv-btn-success:hover:not(:disabled){background:rgba(0,200,120,0.2);}',
      '.piv-btn-full{width:100%;justify-content:center;}',
      '.piv-btn-sm{padding:5px 12px;font-size:12px;}',
      /* ── פעולות מהירות ────────────────────────────────────── */
      '.piv-quick-grid{',
        'display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:18px;',
      '}',
      '.piv-quick-btn{',
        'background:rgba(255,255,255,0.04);',
        'border:1px solid rgba(0,212,255,0.1);',
        'border-radius:10px;padding:14px;cursor:pointer;',
        'text-align:center;transition:all 0.2s;',
        'font-family:Heebo,sans-serif;',
      '}',
      '.piv-quick-btn:hover{background:rgba(0,212,255,0.07);border-color:rgba(0,212,255,0.3);}',
      '.piv-quick-btn .q-icon{font-size:24px;margin-bottom:6px;}',
      '.piv-quick-btn .q-label{font-size:13px;color:#c0d8e8;font-weight:500;}',
      '.piv-quick-btn .q-desc{font-size:11px;color:#5070a0;margin-top:2px;}',
      /* ── טפסים ────────────────────────────────────────────── */
      '.piv-form-section{',
        'background:rgba(255,255,255,0.03);',
        'border:1px solid rgba(0,212,255,0.1);',
        'border-radius:10px;padding:16px;margin-bottom:14px;',
        'display:none;',
      '}',
      '.piv-form-section.open{display:block;}',
      '.piv-form-section h3{',
        'margin:0 0 14px;font-size:14px;color:#a0c8e8;font-weight:600;',
        'display:flex;align-items:center;gap:8px;',
      '}',
      '.piv-field{margin-bottom:12px;}',
      '.piv-field label{',
        'display:block;font-size:12px;color:#7090a0;margin-bottom:5px;',
      '}',
      '.piv-field input,.piv-field select,.piv-field textarea{',
        'width:100%;box-sizing:border-box;',
        'background:rgba(0,0,0,0.3);',
        'border:1px solid rgba(0,212,255,0.15);',
        'border-radius:7px;padding:8px 12px;',
        'color:#d0e8f8;font-family:Heebo,sans-serif;font-size:13px;',
        'outline:none;transition:border-color 0.2s;direction:rtl;',
      '}',
      '.piv-field input:focus,.piv-field select:focus,.piv-field textarea:focus{',
        'border-color:rgba(0,212,255,0.5);',
      '}',
      '.piv-field select option{background:#0d1b2a;color:#d0e8f8;}',
      '.piv-field textarea{resize:vertical;min-height:80px;}',
      '.piv-field-row{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
      /* ── מציג תוצאות ──────────────────────────────────────── */
      '.piv-result-view{',
        'background:rgba(0,0,0,0.3);',
        'border:1px solid rgba(0,212,255,0.1);',
        'border-radius:10px;padding:16px;margin-bottom:14px;',
        'display:none;',
      '}',
      '.piv-result-view.open{display:block;}',
      '.piv-result-view h3{',
        'margin:0 0 12px;font-size:14px;color:#a0c8e8;',
        'display:flex;align-items:center;gap:8px;justify-content:space-between;',
      '}',
      /* ── רשימת ממצאים ─────────────────────────────────────── */
      '.piv-issue-list{list-style:none;margin:0;padding:0;}',
      '.piv-issue-item{',
        'padding:8px 10px;border-radius:7px;margin-bottom:6px;',
        'font-size:12px;display:flex;gap:8px;align-items:flex-start;',
      '}',
      '.piv-issue-item.error{background:rgba(255,60,60,0.08);border-right:3px solid #ff3c3c;color:#ffaaaa;}',
      '.piv-issue-item.warning{background:rgba(255,180,0,0.08);border-right:3px solid #ffb400;color:#ffd080;}',
      '.piv-issue-item.info{background:rgba(0,180,255,0.06);border-right:3px solid #00b4ff;color:#80c8ff;}',
      '.piv-issue-sev{font-weight:700;font-size:10px;text-transform:uppercase;white-space:nowrap;padding-top:1px;}',
      '.piv-issue-msg{flex:1;}',
      '.piv-issue-loc{font-size:10px;opacity:0.6;margin-top:2px;}',
      '.piv-issue-code{',
        'font-family:monospace;font-size:10px;',
        'background:rgba(0,0,0,0.4);padding:3px 6px;border-radius:4px;',
        'margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:380px;',
      '}',
      /* ── ציון ─────────────────────────────────────────────── */
      '.piv-score-ring{',
        'display:flex;align-items:center;gap:12px;margin-bottom:14px;',
        'padding:12px;background:rgba(255,255,255,0.03);border-radius:10px;',
      '}',
      '.piv-score-num{',
        'font-size:40px;font-weight:700;line-height:1;',
      '}',
      '.piv-score-num.good{color:#00d47a;}',
      '.piv-score-num.ok{color:#ffb400;}',
      '.piv-score-num.bad{color:#ff5050;}',
      '.piv-score-details{flex:1;}',
      '.piv-score-label{font-size:13px;color:#c0d8e8;font-weight:600;}',
      '.piv-score-sub{font-size:11px;color:#5070a0;margin-top:3px;}',
      /* ── קוד preview ──────────────────────────────────────── */
      '.piv-code-preview{',
        'background:rgba(0,0,0,0.5);',
        'border:1px solid rgba(0,212,255,0.1);',
        'border-radius:7px;padding:10px;',
        'font-family:monospace;font-size:11px;color:#80c8a0;',
        'overflow-x:auto;max-height:180px;overflow-y:auto;',
        'white-space:pre;margin-bottom:8px;',
      '}',
      '.piv-code-preview::-webkit-scrollbar{width:4px;height:4px;}',
      '.piv-code-preview::-webkit-scrollbar-thumb{background:rgba(0,212,255,0.2);border-radius:2px;}',
      /* ── השוואת גודל ──────────────────────────────────────── */
      '.piv-size-cmp{',
        'display:flex;flex-direction:column;gap:8px;margin-bottom:12px;',
      '}',
      '.piv-size-row{',
        'display:flex;align-items:center;gap:10px;font-size:12px;',
      '}',
      '.piv-size-label{color:#7090a0;width:32px;text-align:left;}',
      '.piv-size-bar-wrap{flex:1;height:6px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden;}',
      '.piv-size-bar-orig{height:100%;background:rgba(0,100,200,0.6);border-radius:3px;}',
      '.piv-size-bar-opt{height:100%;background:rgba(0,200,120,0.6);border-radius:3px;margin-top:-6px;}',
      '.piv-size-val{color:#c0d8e8;width:60px;text-align:right;}',
      '.piv-size-delta{font-size:11px;width:44px;text-align:right;}',
      '.piv-size-delta.positive{color:#ff7070;}',
      '.piv-size-delta.negative{color:#00d47a;}',
      /* ── סרגל כלים תחתון ──────────────────────────────────── */
      '.piv-ap-footer{',
        'flex-shrink:0;padding:12px 16px;',
        'border-top:1px solid rgba(0,212,255,0.1);',
        'background:#0a1520;',
        'display:flex;gap:8px;align-items:center;',
      '}',
      '.piv-ap-footer .piv-status-dot{',
        'width:8px;height:8px;border-radius:50%;',
        'background:#5070a0;flex-shrink:0;',
        'transition:background 0.3s;',
      '}',
      '.piv-ap-footer .piv-status-dot.active{background:#00d47a;animation:piv-blink 1.5s infinite;}',
      '@keyframes piv-blink{0%,100%{opacity:1;}50%{opacity:0.4;}}',
      '.piv-ap-footer .piv-status-text{font-size:11px;color:#5070a0;flex:1;}',
      /* ── ריק/שגיאה ────────────────────────────────────────── */
      '.piv-empty{',
        'text-align:center;padding:40px 20px;color:#5070a0;',
      '}',
      '.piv-empty .e-icon{font-size:36px;margin-bottom:10px;}',
      '.piv-empty .e-msg{font-size:13px;}',
      '.piv-error-banner{',
        'background:rgba(255,60,60,0.1);border:1px solid rgba(255,60,60,0.3);',
        'border-radius:8px;padding:10px 14px;color:#ff9090;font-size:12px;',
        'margin-bottom:12px;',
      '}',
      /* ── overlay ─────────────────────────────────────────── */
      '#piv-agent-overlay{',
        'position:fixed;inset:0;z-index:9998;',
        'background:rgba(0,0,0,0.4);backdrop-filter:blur(2px);',
        'display:none;',
        'transition:opacity 0.3s;',
      '}',
      '#piv-agent-overlay.open{display:block;}',
      /* ── Loader spinner ───────────────────────────────────── */
      '.piv-spinner{',
        'display:inline-block;width:16px;height:16px;',
        'border:2px solid rgba(0,212,255,0.2);',
        'border-top-color:#00d4ff;',
        'border-radius:50%;animation:piv-spin 0.8s linear infinite;',
        'vertical-align:middle;',
      '}',
      '@keyframes piv-spin{to{transform:rotate(360deg)}}',
      /* ── responsive ───────────────────────────────────────── */
      '@media(max-width:560px){',
        '#piv-agent-panel{width:100vw;}',
        '.piv-quick-grid{grid-template-columns:1fr;}',
        '.piv-field-row{grid-template-columns:1fr;}',
      '}',
    ].join('');
    document.head.appendChild(style);
  }

  // ── בניית DOM ─────────────────────────────────────────────────────────────
  function buildPanel() {
    // Overlay
    var overlay = el('div', { id: 'piv-agent-overlay' });
    document.body.appendChild(overlay);

    // FAB button
    var fab = el('button', { id: 'piv-agent-fab', title: 'סוכן AI', 'aria-label': 'פאנל סוכן AI' }, [
      el('span', { text: '🤖' }),
      el('span', { class: 'piv-agent-badge', id: 'piv-agent-fab-badge', text: '0' }),
    ]);
    document.body.appendChild(fab);

    // Main panel
    var panel = el('div', { id: 'piv-agent-panel', role: 'dialog', 'aria-label': 'פאנל סוכן AI', 'aria-modal': 'true' });

    // Header
    var header = el('div', { class: 'piv-ap-header' }, [
      el('h2', {}, [
        el('span', { class: 'robot-icon', text: '🤖' }),
        document.createTextNode(' סוכן AI אוטונומי'),
      ]),
      el('button', { class: 'piv-ap-close', id: 'piv-agent-close', 'aria-label': 'סגור', title: 'סגור פאנל', text: '✕' }),
    ]);
    panel.appendChild(header);

    // Tabs
    var tabs = el('div', { class: 'piv-ap-tabs', role: 'tablist' }, [
      el('button', { class: 'piv-ap-tab active', 'data-tab': 'dashboard', role: 'tab', text: 'לוח בקרה' }),
      el('button', { class: 'piv-ap-tab', 'data-tab': 'actions', role: 'tab', text: 'פעולות' }),
      el('button', { class: 'piv-ap-tab', 'data-tab': 'results', role: 'tab', text: 'תוצאות' }),
    ]);
    panel.appendChild(tabs);

    // Body
    var body = el('div', { class: 'piv-ap-body' });

    // ── Tab: Dashboard ────────────────────────────────────────────────
    var tabDash = el('div', { class: 'piv-tab-panel active', 'data-tab': 'dashboard' });

    // Stats summary
    var summary = el('div', { class: 'piv-ap-summary', id: 'piv-ap-summary' }, [
      el('div', { class: 'piv-ap-stat' }, [
        el('div', { class: 'stat-val', id: 'stat-total', text: '0' }),
        el('div', { class: 'stat-lbl', text: 'סה"כ משימות' }),
      ]),
      el('div', { class: 'piv-ap-stat' }, [
        el('div', { class: 'stat-val', id: 'stat-running', text: '0' }),
        el('div', { class: 'stat-lbl', text: 'רצות עכשיו' }),
      ]),
      el('div', { class: 'piv-ap-stat' }, [
        el('div', { class: 'stat-val', id: 'stat-failed', text: '0' }),
        el('div', { class: 'stat-lbl', text: 'נכשלו' }),
      ]),
    ]);
    tabDash.appendChild(summary);

    // Refresh + clear buttons
    var dashActions = el('div', { style: 'display:flex;gap:8px;margin-bottom:14px;' }, [
      el('button', {
        class: 'piv-btn piv-btn-secondary piv-btn-sm',
        id: 'piv-ap-refresh-btn',
        text: '↻ רענן',
      }),
      el('button', {
        class: 'piv-btn piv-btn-secondary piv-btn-sm',
        id: 'piv-ap-scan-all-btn',
        text: '⚡ סרוק הכל',
      }),
    ]);
    tabDash.appendChild(dashActions);

    // Tasks list
    var taskList = el('div', { id: 'piv-task-list' });
    var emptyDash = el('div', { class: 'piv-empty', id: 'piv-tasks-empty' }, [
      el('div', { class: 'e-icon', text: '📋' }),
      el('div', { class: 'e-msg', text: 'אין משימות עדיין — הפעל פעולה מהטאב "פעולות"' }),
    ]);
    taskList.appendChild(emptyDash);
    tabDash.appendChild(taskList);
    body.appendChild(tabDash);

    // ── Tab: Actions ──────────────────────────────────────────────────
    var tabActions = el('div', { class: 'piv-tab-panel', 'data-tab': 'actions' });

    // Quick action grid
    var quickGrid = el('div', { class: 'piv-quick-grid' });
    var quickActions = [
      { id: 'qa-scan-all',   icon: '🔍', label: 'סרוק הכל',     desc: 'סריקת QA לכל הסמלים' },
      { id: 'qa-scan-one',   icon: '📡', label: 'סרוק סמל',     desc: 'סרוק סמל ספציפי' },
      { id: 'qa-fix',        icon: '🔧', label: 'תקן קוד',      desc: 'תיקון אוטומטי' },
      { id: 'qa-generate',   icon: '✨', label: 'צור סמל',      desc: 'יצירת סמל חדש' },
      { id: 'qa-optimize',   icon: '⚡', label: 'אופטימיזציה',  desc: 'שפר ביצועים' },
      { id: 'qa-free',       icon: '🤖', label: 'משימה חופשית', desc: 'AI אוטונומי' },
    ];
    quickActions.forEach(function (qa) {
      var btn = el('button', { class: 'piv-quick-btn', 'data-action': qa.id }, [
        el('div', { class: 'q-icon', text: qa.icon }),
        el('div', { class: 'q-label', text: qa.label }),
        el('div', { class: 'q-desc', text: qa.desc }),
      ]);
      quickGrid.appendChild(btn);
    });
    tabActions.appendChild(quickGrid);

    // ── Form: Scan one symbol ─────────────────────────────────────────
    var formScanOne = el('div', { class: 'piv-form-section', id: 'form-scan-one' }, [
      el('h3', {}, [ el('span', { text: '📡' }), document.createTextNode(' סרוק סמל ספציפי') ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'שם הסמל' }),
        el('input', { type: 'text', id: 'scan-symbol-name', placeholder: 'לדוגמה: TrendBar' }),
      ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'סוג סריקה' }),
        buildSelect('scan-type', [
          { val: 'quick', lbl: 'מהירה (quick)' },
          { val: 'deep',  lbl: 'מעמיקה (deep)' },
          { val: 'full',  lbl: 'מלאה כולל ביצועים (full)' },
        ]),
      ]),
      el('button', { class: 'piv-btn piv-btn-primary piv-btn-full', id: 'run-scan-one', text: 'הרץ סריקה' }),
    ]);
    tabActions.appendChild(formScanOne);

    // ── Form: Fix code ────────────────────────────────────────────────
    var formFix = el('div', { class: 'piv-form-section', id: 'form-fix' }, [
      el('h3', {}, [ el('span', { text: '🔧' }), document.createTextNode(' תיקון קוד אוטומטי') ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'שם הסמל' }),
        el('input', { type: 'text', id: 'fix-symbol-name', placeholder: 'שם הסמל לתיקון' }),
      ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'תיאור הבעיה' }),
        el('textarea', { id: 'fix-issue-desc', placeholder: 'תאר את הבעיה שיש לתקן...' }),
      ]),
      el('div', { class: 'piv-field-row' }, [
        el('div', { class: 'piv-field' }, [
          el('label', { text: 'סוג קובץ' }),
          buildSelect('fix-file-type', [
            { val: 'all', lbl: 'כל הקבצים' },
            { val: 'js',  lbl: 'JavaScript' },
            { val: 'html', lbl: 'HTML' },
            { val: 'css', lbl: 'CSS' },
          ]),
        ]),
        el('div', { class: 'piv-field' }, [
          el('label', { text: 'החל אוטומטית' }),
          buildSelect('fix-auto-apply', [
            { val: 'false', lbl: 'לא — רק הצג' },
            { val: 'true',  lbl: 'כן — הכנס שינוי' },
          ]),
        ]),
      ]),
      el('button', { class: 'piv-btn piv-btn-primary piv-btn-full', id: 'run-fix', text: 'תקן קוד' }),
    ]);
    tabActions.appendChild(formFix);

    // ── Form: Generate symbol ─────────────────────────────────────────
    var formGen = el('div', { class: 'piv-form-section', id: 'form-generate' }, [
      el('h3', {}, [ el('span', { text: '✨' }), document.createTextNode(' יצירת סמל חדש') ]),
      el('div', { class: 'piv-field-row' }, [
        el('div', { class: 'piv-field' }, [
          el('label', { text: 'שם הסמל (CamelCase)' }),
          el('input', { type: 'text', id: 'gen-symbol-name', placeholder: 'לדוגמה: StatusGauge' }),
        ]),
        el('div', { class: 'piv-field' }, [
          el('label', { text: 'קטגוריה' }),
          buildSelect('gen-category', [
            { val: 'monitoring',  lbl: 'ניטור' },
            { val: 'charts',      lbl: 'גרפים' },
            { val: 'data',        lbl: 'נתונים' },
            { val: 'navigation',  lbl: 'ניווט' },
            { val: 'indicators',  lbl: 'מחוונים' },
            { val: 'controls',    lbl: 'בקרות' },
          ]),
        ]),
      ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'תיאור הסמל' }),
        el('textarea', { id: 'gen-description', placeholder: 'תאר מה הסמל צריך לעשות...' }),
      ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'תגי PI (מופרדים בפסיק)' }),
        el('input', { type: 'text', id: 'gen-pi-tags', placeholder: 'לדוגמה: Temperature, Pressure, Flow' }),
      ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'תכונות נדרשות (מופרדות בפסיק)' }),
        el('input', { type: 'text', id: 'gen-features', placeholder: 'לדוגמה: RTL, dark-mode, responsive' }),
      ]),
      el('button', { class: 'piv-btn piv-btn-primary piv-btn-full', id: 'run-generate', text: 'צור סמל' }),
    ]);
    tabActions.appendChild(formGen);

    // ── Form: Optimize ────────────────────────────────────────────────
    var formOpt = el('div', { class: 'piv-form-section', id: 'form-optimize' }, [
      el('h3', {}, [ el('span', { text: '⚡' }), document.createTextNode(' אופטימיזציה לסמל') ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'שם הסמל' }),
        el('input', { type: 'text', id: 'opt-symbol-name', placeholder: 'שם הסמל לאופטימיזציה' }),
      ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'סוג אופטימיזציה' }),
        buildSelect('opt-type', [
          { val: 'all',          lbl: 'הכל — ביצועים + גודל + נגישות' },
          { val: 'performance',  lbl: 'ביצועים בלבד' },
          { val: 'size',         lbl: 'הקטנת גודל קובץ' },
          { val: 'accessibility', lbl: 'נגישות (Accessibility)' },
        ]),
      ]),
      el('button', { class: 'piv-btn piv-btn-primary piv-btn-full', id: 'run-optimize', text: 'בצע אופטימיזציה' }),
    ]);
    tabActions.appendChild(formOpt);

    // ── Form: Free-form autonomous task ──────────────────────────────
    var formFree = el('div', { class: 'piv-form-section', id: 'form-free' }, [
      el('h3', {}, [ el('span', { text: '🤖' }), document.createTextNode(' משימה אוטונומית') ]),
      el('div', { class: 'piv-field' }, [
        el('label', { text: 'תאר את המשימה לסוכן AI' }),
        el('textarea', { id: 'free-request', placeholder: 'לדוגמה: סרוק את הסמל TrendBar ותקן את כל הבעיות שתמצא...', style: 'min-height:100px;' }),
      ]),
      el('button', { class: 'piv-btn piv-btn-primary piv-btn-full', id: 'run-free', text: '🤖 הפעל סוכן' }),
    ]);
    tabActions.appendChild(formFree);
    body.appendChild(tabActions);

    // ── Tab: Results ──────────────────────────────────────────────────
    var tabResults = el('div', { class: 'piv-tab-panel', 'data-tab': 'results' });

    var resultsEmpty = el('div', { class: 'piv-empty', id: 'piv-results-empty' }, [
      el('div', { class: 'e-icon', text: '📊' }),
      el('div', { class: 'e-msg', text: 'תוצאות ממשימות שהושלמו יוצגו כאן' }),
    ]);
    tabResults.appendChild(resultsEmpty);

    var resultsContainer = el('div', { id: 'piv-results-container' });
    tabResults.appendChild(resultsContainer);
    body.appendChild(tabResults);

    panel.appendChild(body);

    // Footer
    var footer = el('div', { class: 'piv-ap-footer' }, [
      el('span', { class: 'piv-status-dot', id: 'piv-agent-status-dot' }),
      el('span', { class: 'piv-status-text', id: 'piv-agent-status-text', text: 'סוכן מוכן' }),
      el('button', { class: 'piv-btn piv-btn-secondary piv-btn-sm', id: 'piv-clear-tasks', text: 'נקה' }),
    ]);
    panel.appendChild(footer);

    document.body.appendChild(panel);
    return { panel: panel, fab: fab, overlay: overlay };
  }

  function buildSelect(id, options) {
    var sel = el('select', { id: id });
    options.forEach(function (o) {
      var opt = el('option', { value: o.val, text: o.lbl });
      sel.appendChild(opt);
    });
    return sel;
  }

  // ── STATE ─────────────────────────────────────────────────────────────────
  var state = {
    isOpen: false,
    activeTab: 'dashboard',
    tasks: [],
    pollingTimers: {},       // taskId -> intervalId
    expandedTasks: {},       // taskId -> bool
    selectedTaskId: null,
  };

  // ── CORE AGENT MODULE ─────────────────────────────────────────────────────
  var PIV_AGENT = {

    open: function () {
      state.isOpen = true;
      qs('#piv-agent-panel').classList.add('open');
      qs('#piv-agent-overlay').classList.add('open');
      qs('#piv-agent-fab').classList.add('active');
      PIV_AGENT.refreshTasks();
      var settings = loadSettings();
      settings.panelOpen = true;
      saveSettings(settings);
    },

    close: function () {
      state.isOpen = false;
      qs('#piv-agent-panel').classList.remove('open');
      qs('#piv-agent-overlay').classList.remove('open');
      qs('#piv-agent-fab').classList.remove('active');
      var settings = loadSettings();
      settings.panelOpen = false;
      saveSettings(settings);
    },

    toggle: function () {
      state.isOpen ? PIV_AGENT.close() : PIV_AGENT.open();
    },

    // ── יצירת משימה דרך ה-API ────────────────────────────────────────────
    createTask: function (type, params, description) {
      return apiPost('/agent/task', { type: type, params: params, description: description || '' })
        .then(function (data) {
          if (data.task_id) {
            PIV_AGENT._startPolling(data.task_id);
            PIV_AGENT.setTab('dashboard');
            if (!state.isOpen) PIV_AGENT.open();
            PIV_AGENT.refreshTasks();
            PIV_AGENT._setStatus('רץ', true);
          }
          return data;
        })
        .catch(function (err) {
          PIV_AGENT._showError('שגיאה ביצירת משימה: ' + err.message);
          return null;
        });
    },

    // ── קריאת סטטוס משימה ───────────────────────────────────────────────
    getTaskStatus: function (taskId) {
      return apiGet('/agent/task/' + taskId);
    },

    // ── רענון רשימת משימות ──────────────────────────────────────────────
    refreshTasks: function () {
      return apiGet('/agent/tasks')
        .then(function (data) {
          if (data && data.tasks) {
            state.tasks = data.tasks.slice().reverse(); // newest first
            PIV_AGENT._renderTasks();
            PIV_AGENT._updateStats();

            // Resume polling for running/pending tasks
            state.tasks.forEach(function (t) {
              if ((t.status === 'running' || t.status === 'pending') && !state.pollingTimers[t.id]) {
                PIV_AGENT._startPolling(t.id);
              }
            });
          }
        })
        .catch(function () { /* ignore network errors */ });
    },

    // ── Polling ──────────────────────────────────────────────────────────
    _startPolling: function (taskId) {
      if (state.pollingTimers[taskId]) return;
      state.pollingTimers[taskId] = setInterval(function () {
        PIV_AGENT.getTaskStatus(taskId)
          .then(function (task) {
            if (!task || task.error) return;
            // Update task in state
            var found = false;
            state.tasks = state.tasks.map(function (t) {
              if (t.id === taskId) { found = true; return task; }
              return t;
            });
            if (!found) state.tasks.unshift(task);
            PIV_AGENT._renderTasks();
            PIV_AGENT._updateStats();

            // Stop polling when done
            if (task.status === 'completed' || task.status === 'failed') {
              PIV_AGENT._stopPolling(taskId);
              PIV_AGENT._setStatus('סוכן מוכן', false);
              if (task.status === 'completed' && task.result) {
                PIV_AGENT._addResult(task);
                PIV_AGENT._updateFabBadge();
              }
            }
          })
          .catch(function () { /* network error during polling */ });
      }, POLL_INTERVAL_MS);
    },

    _stopPolling: function (taskId) {
      if (state.pollingTimers[taskId]) {
        clearInterval(state.pollingTimers[taskId]);
        delete state.pollingTimers[taskId];
      }
    },

    // ── ציור רשימת משימות ─────────────────────────────────────────────────
    _renderTasks: function () {
      var list = qs('#piv-task-list');
      if (!list) return;

      var emptyEl = qs('#piv-tasks-empty');
      if (emptyEl) emptyEl.style.display = state.tasks.length ? 'none' : '';

      // Remove existing task cards
      var existing = list.querySelectorAll('.piv-task-card');
      existing.forEach(function (c) { c.remove(); });

      state.tasks.forEach(function (task) {
        list.appendChild(PIV_AGENT._buildTaskCard(task));
      });
    },

    _buildTaskCard: function (task) {
      var isExpanded = state.expandedTasks[task.id];
      var card = el('div', {
        class: 'piv-task-card ' + task.status,
        'data-task-id': task.id,
      });

      var statusLabel = {
        pending: 'ממתין', running: 'רץ', completed: 'הושלם', failed: 'נכשל'
      }[task.status] || task.status;

      var header = el('div', { class: 'piv-task-header' }, [
        el('span', { class: 'piv-task-desc', text: task.description || task.type }),
        el('span', { class: 'piv-badge ' + task.status, text: statusLabel }),
      ]);
      card.appendChild(header);

      var meta = el('div', { class: 'piv-task-meta' });
      meta.textContent = '🕒 ' + formatTime(task.created_at);
      if (task.completed_at) {
        meta.textContent += ' · ⏱ ' + formatDuration(task.started_at, task.completed_at);
      }
      meta.textContent += ' · ' + task.type;
      card.appendChild(meta);

      if (task.status === 'running') {
        var prog = el('div', { class: 'piv-progress' });
        var progBar = el('div', {
          class: 'piv-progress-bar',
          style: 'width:' + (task.progress || 0) + '%',
        });
        prog.appendChild(progBar);
        card.appendChild(prog);
      }

      if (task.status === 'failed' && task.error) {
        var errDiv = el('div', {
          class: 'piv-error-banner',
          text: '❌ ' + task.error,
        });
        card.appendChild(errDiv);
      }

      // Steps (expandable)
      if (task.steps && task.steps.length) {
        var stepsWrap = el('div', { class: 'piv-task-steps' + (isExpanded ? ' open' : '') });
        task.steps.forEach(function (s) {
          var row = el('div', { class: 'piv-step-item' });
          row.appendChild(el('span', { class: 'piv-step-time', text: formatTime(s.time) }));
          var msg = el('span', { class: 'piv-step-msg' });
          if (s.tool) {
            msg.appendChild(el('span', { class: 'piv-step-tool', text: s.tool }));
          }
          msg.appendChild(document.createTextNode(s.message || ''));
          row.appendChild(msg);
          stepsWrap.appendChild(row);
        });
        card.appendChild(stepsWrap);
      }

      // Result actions row
      if (task.status === 'completed' && task.result) {
        var actRow = el('div', { style: 'display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;' }, [
          el('button', {
            class: 'piv-btn piv-btn-secondary piv-btn-sm',
            'data-task-result': task.id,
            text: '📊 הצג תוצאות',
          }),
          task.steps && task.steps.length
            ? el('button', {
              class: 'piv-btn piv-btn-secondary piv-btn-sm',
              'data-task-toggle': task.id,
              text: isExpanded ? '▲ הסתר שלבים' : '▼ שלבים',
            })
            : null,
        ]);
        card.appendChild(actRow);
      } else if (task.steps && task.steps.length) {
        var toggleRow = el('div', { style: 'margin-top:8px;' }, [
          el('button', {
            class: 'piv-btn piv-btn-secondary piv-btn-sm',
            'data-task-toggle': task.id,
            text: isExpanded ? '▲ הסתר שלבים' : '▼ הצג שלבים',
          }),
        ]);
        card.appendChild(toggleRow);
      }

      return card;
    },

    // ── עדכון סטטיסטיקות ─────────────────────────────────────────────────
    _updateStats: function () {
      var total = state.tasks.length;
      var running = state.tasks.filter(function (t) { return t.status === 'running' || t.status === 'pending'; }).length;
      var failed = state.tasks.filter(function (t) { return t.status === 'failed'; }).length;

      var el1 = qs('#stat-total'); if (el1) el1.textContent = total;
      var el2 = qs('#stat-running'); if (el2) el2.textContent = running;
      var el3 = qs('#stat-failed'); if (el3) el3.textContent = failed;
    },

    // ── FAB badge עדכון ───────────────────────────────────────────────────
    _updateFabBadge: function () {
      var badge = qs('#piv-agent-fab-badge');
      if (!badge) return;
      var completed = state.tasks.filter(function (t) { return t.status === 'completed'; }).length;
      if (completed > 0 && !state.isOpen) {
        badge.textContent = completed;
        badge.style.display = 'flex';
      } else {
        badge.style.display = 'none';
      }
    },

    // ── הוספת תוצאה לטאב Results ─────────────────────────────────────────
    _addResult: function (task) {
      var container = qs('#piv-results-container');
      var emptyEl = qs('#piv-results-empty');
      if (!container) return;
      if (emptyEl) emptyEl.style.display = 'none';

      var resultView = el('div', { class: 'piv-result-view open', id: 'result-' + task.id });
      var titleRow = el('h3', {}, [
        el('span', { text: task.description || task.type }),
        el('span', { class: 'piv-badge completed', text: '✓ הושלם' }),
      ]);
      resultView.appendChild(titleRow);

      var result = task.result || {};

      if (task.type === 'scan_symbol' || task.type === 'batch_scan') {
        resultView.appendChild(PIV_AGENT._buildScanResult(result, task.type));
      } else if (task.type === 'fix_code') {
        resultView.appendChild(PIV_AGENT._buildFixResult(result));
      } else if (task.type === 'generate_symbol') {
        resultView.appendChild(PIV_AGENT._buildGenerateResult(result));
      } else if (task.type === 'optimize_symbol') {
        resultView.appendChild(PIV_AGENT._buildOptimizeResult(result));
      } else if (task.type === 'autonomous') {
        resultView.appendChild(PIV_AGENT._buildAutonomousResult(result));
      } else {
        var pre = el('pre', { style: 'font-size:11px;color:#80c8a0;white-space:pre-wrap;', text: JSON.stringify(result, null, 2).slice(0, 2000) });
        resultView.appendChild(pre);
      }

      // Prepend (newest first)
      container.insertBefore(resultView, container.firstChild);
    },

    // ── בניית תוצאת סריקה ────────────────────────────────────────────────
    _buildScanResult: function (result, taskType) {
      var wrap = el('div');

      if (taskType === 'batch_scan') {
        // Batch summary
        var batchSummary = el('div', { class: 'piv-score-ring' }, [
          el('div', {
            class: 'piv-score-num ' + PIV_AGENT._scoreClass(result.average_score || 0),
            text: (result.average_score || 0) + '',
          }),
          el('div', { class: 'piv-score-details' }, [
            el('div', { class: 'piv-score-label', text: 'ציון ממוצע' }),
            el('div', { class: 'piv-score-sub', text: 'נסרקו ' + (result.scanned || 0) + ' סמלים · ' + (result.total_issues || 0) + ' ממצאים' }),
          ]),
        ]);
        wrap.appendChild(batchSummary);

        if (result.summary_by_severity) {
          var sevRow = el('div', { style: 'display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap;' });
          var sev = result.summary_by_severity;
          sevRow.appendChild(el('span', { class: 'piv-badge failed', text: '❌ ' + (sev.errors || 0) + ' שגיאות' }));
          sevRow.appendChild(el('span', { class: 'piv-badge pending', text: '⚠ ' + (sev.warnings || 0) + ' אזהרות' }));
          sevRow.appendChild(el('span', { class: 'piv-badge running', text: 'ℹ ' + (sev.info || 0) + ' מידע' }));
          wrap.appendChild(sevRow);
        }

        if (result.worst && result.worst.length) {
          wrap.appendChild(el('div', { style: 'font-size:12px;color:#7090a0;margin-bottom:6px;', text: '5 הסמלים הגרועים ביותר:' }));
          result.worst.forEach(function (w) {
            var row = el('div', {
              style: 'display:flex;justify-content:space-between;padding:5px 8px;background:rgba(255,80,80,0.05);border-radius:5px;margin-bottom:4px;font-size:12px;',
            }, [
              el('span', { text: w.symbol || '—' }),
              el('span', { class: 'piv-score-num ' + PIV_AGENT._scoreClass(w.score), style: 'font-size:14px;', text: w.score + '' }),
            ]);
            wrap.appendChild(row);
          });
        }
        return wrap;
      }

      // Single scan
      var score = result.score || 0;
      var scoreEl = el('div', { class: 'piv-score-ring' }, [
        el('div', { class: 'piv-score-num ' + PIV_AGENT._scoreClass(score), text: score + '' }),
        el('div', { class: 'piv-score-details' }, [
          el('div', { class: 'piv-score-label', text: result.symbol || 'סמל' }),
          el('div', {
            class: 'piv-score-sub',
            text: (result.issue_count || 0) + ' ממצאים · סריקת ' + (result.scan_type || 'quick'),
          }),
        ]),
      ]);
      wrap.appendChild(scoreEl);

      if (result.issues && result.issues.length) {
        var issueList = el('ul', { class: 'piv-issue-list' });
        result.issues.forEach(function (issue) {
          var item = el('li', { class: 'piv-issue-item ' + (issue.severity || 'info') });
          item.appendChild(el('span', { class: 'piv-issue-sev', text: issue.severity || '' }));
          var msgWrap = el('div', { class: 'piv-issue-msg' }, [
            el('div', { text: issue.message || '' }),
            el('div', { class: 'piv-issue-loc', text: (issue.file || '') + (issue.line ? ' · שורה ' + issue.line : '') }),
          ]);
          if (issue.code_snippet) {
            msgWrap.appendChild(el('div', { class: 'piv-issue-code', text: issue.code_snippet }));
          }
          item.appendChild(msgWrap);
          issueList.appendChild(item);
        });
        wrap.appendChild(issueList);
      } else {
        wrap.appendChild(el('div', { class: 'piv-empty', text: '✅ לא נמצאו ממצאים בסריקה זו' }));
      }

      return wrap;
    },

    // ── בניית תוצאת תיקון קוד ────────────────────────────────────────────
    _buildFixResult: function (result) {
      var wrap = el('div');
      if (result.error) {
        wrap.appendChild(el('div', { class: 'piv-error-banner', text: result.error }));
        return wrap;
      }

      wrap.appendChild(el('div', {
        style: 'font-size:12px;color:#c0d8e8;margin-bottom:10px;',
        text: '✅ תיקון בוצע עבור: ' + (result.symbol || '') + (result.auto_applied ? ' (הוחל אוטומטית)' : ' (הצעה בלבד)'),
      }));

      if (result.files_changed && result.files_changed.length) {
        wrap.appendChild(el('div', {
          style: 'font-size:11px;color:#7090a0;margin-bottom:8px;',
          text: 'קבצים שונו: ' + result.files_changed.join(', '),
        }));
      }

      if (result.fixed_files) {
        Object.keys(result.fixed_files).forEach(function (ext) {
          wrap.appendChild(el('div', { style: 'font-size:11px;color:#7090a0;margin-bottom:3px;font-weight:600;text-transform:uppercase;', text: ext + ':' }));
          wrap.appendChild(el('pre', { class: 'piv-code-preview', text: result.fixed_files[ext] || '' }));
        });
      }

      if (result.full_response) {
        var details = el('details', { style: 'margin-top:10px;' });
        details.appendChild(el('summary', { style: 'font-size:12px;color:#7090a0;cursor:pointer;', text: 'תגובת AI מלאה' }));
        details.appendChild(el('pre', { style: 'font-size:11px;color:#80c8a0;white-space:pre-wrap;margin-top:8px;', text: result.full_response }));
        wrap.appendChild(details);
      }

      return wrap;
    },

    // ── בניית תוצאת יצירת סמל ────────────────────────────────────────────
    _buildGenerateResult: function (result) {
      var wrap = el('div');
      if (result.error) {
        wrap.appendChild(el('div', { class: 'piv-error-banner', text: result.error }));
        return wrap;
      }

      wrap.appendChild(el('div', {
        style: 'font-size:12px;color:#c0d8e8;margin-bottom:10px;',
        text: '✨ סמל חדש נוצר: ' + (result.symbol || ''),
      }));

      if (result.description) {
        wrap.appendChild(el('div', { style: 'font-size:11px;color:#7090a0;margin-bottom:10px;', text: result.description }));
      }

      if (result.generated_files && result.generated_files.length) {
        wrap.appendChild(el('div', {
          style: 'font-size:11px;color:#7090a0;margin-bottom:8px;',
          text: 'קבצים שנוצרו: ' + result.generated_files.join(', '),
        }));
      }

      if (result.preview) {
        Object.keys(result.preview).forEach(function (ext) {
          wrap.appendChild(el('div', { style: 'font-size:11px;color:#7090a0;margin-bottom:3px;font-weight:600;text-transform:uppercase;', text: ext + ':' }));
          wrap.appendChild(el('pre', { class: 'piv-code-preview', text: result.preview[ext] || '' }));
        });
      }

      if (result.written_paths && Object.keys(result.written_paths).length) {
        var pathsWrap = el('div', { style: 'margin-top:10px;' });
        Object.values(result.written_paths).forEach(function (p) {
          pathsWrap.appendChild(el('div', { style: 'font-size:10px;color:#4060a0;', text: '📁 ' + p }));
        });
        wrap.appendChild(pathsWrap);
      }

      return wrap;
    },

    // ── בניית תוצאת אופטימיזציה ──────────────────────────────────────────
    _buildOptimizeResult: function (result) {
      var wrap = el('div');
      if (result.error) {
        wrap.appendChild(el('div', { class: 'piv-error-banner', text: result.error }));
        return wrap;
      }

      wrap.appendChild(el('div', {
        style: 'font-size:12px;color:#c0d8e8;margin-bottom:10px;',
        text: '⚡ אופטימיזציה הושלמה עבור: ' + (result.symbol || '') + ' (' + (result.optimization_type || 'all') + ')',
      }));

      if (result.size_diff && Object.keys(result.size_diff).length) {
        wrap.appendChild(el('div', { style: 'font-size:12px;color:#a0c8e8;margin-bottom:8px;', text: 'השוואת גודל:' }));
        var sizeCmp = el('div', { class: 'piv-size-cmp' });

        Object.keys(result.size_diff).forEach(function (ext) {
          var sd = result.size_diff[ext];
          if (!sd) return;
          var maxSize = sd.original || 1;
          var origPct = 100;
          var optPct = Math.round((sd.optimized / maxSize) * 100);
          var delta = sd.change_pct || 0;
          var deltaClass = delta > 0 ? 'positive' : 'negative';
          var deltaSign = delta > 0 ? '+' : '';

          var row = el('div', { class: 'piv-size-row' }, [
            el('span', { class: 'piv-size-label', text: ext.toUpperCase() }),
            el('div', { class: 'piv-size-bar-wrap' }, [
              el('div', { class: 'piv-size-bar-orig', style: 'width:' + origPct + '%' }),
              el('div', { class: 'piv-size-bar-opt', style: 'width:' + optPct + '%' }),
            ]),
            el('span', { class: 'piv-size-val', text: Math.round(sd.original / 1024 * 10) / 10 + 'KB' }),
            el('span', { class: 'piv-size-delta ' + deltaClass, text: deltaSign + delta + '%' }),
          ]);
          sizeCmp.appendChild(row);
        });
        wrap.appendChild(sizeCmp);
      }

      if (result.preview) {
        Object.keys(result.preview).forEach(function (ext) {
          wrap.appendChild(el('div', { style: 'font-size:11px;color:#7090a0;margin-bottom:3px;font-weight:600;text-transform:uppercase;', text: ext + ':' }));
          wrap.appendChild(el('pre', { class: 'piv-code-preview', text: result.preview[ext] || '' }));
        });
      }

      return wrap;
    },

    // ── בניית תוצאת משימה אוטונומית ──────────────────────────────────────
    _buildAutonomousResult: function (result) {
      var wrap = el('div');

      if (result.final_answer) {
        var answerBox = el('div', {
          style: 'background:rgba(0,212,255,0.05);border:1px solid rgba(0,212,255,0.15);border-radius:8px;padding:12px;margin-bottom:12px;',
        });
        answerBox.appendChild(el('div', { style: 'font-size:11px;color:#7090a0;margin-bottom:6px;', text: '🤖 תשובת הסוכן:' }));
        answerBox.appendChild(el('div', { style: 'font-size:13px;color:#d0e8f8;white-space:pre-wrap;', text: result.final_answer }));
        wrap.appendChild(answerBox);
      }

      if (result.steps && result.steps.length) {
        var stepsWrap = el('details', { style: 'margin-top:10px;' });
        stepsWrap.appendChild(el('summary', { style: 'font-size:12px;color:#7090a0;cursor:pointer;', text: 'שלבי הביצוע (' + result.steps.length + ')' }));
        var stepsList = el('div', { style: 'margin-top:8px;' });
        result.steps.forEach(function (s, i) {
          var stepDiv = el('div', { style: 'padding:6px;border-bottom:1px solid rgba(255,255,255,0.04);font-size:11px;' }, [
            el('div', { style: 'color:#a0c8e8;font-weight:600;', text: (i + 1) + '. ' + (s.tool || '') }),
            el('div', { style: 'color:#5070a0;margin-top:2px;', text: s.output_summary || '' }),
          ]);
          stepsList.appendChild(stepDiv);
        });
        stepsWrap.appendChild(stepsList);
        wrap.appendChild(stepsWrap);
      }

      return wrap;
    },

    _scoreClass: function (score) {
      return score >= 80 ? 'good' : score >= 50 ? 'ok' : 'bad';
    },

    // ── שינוי טאב ─────────────────────────────────────────────────────────
    setTab: function (tabName) {
      state.activeTab = tabName;
      document.querySelectorAll('.piv-ap-tab').forEach(function (t) {
        t.classList.toggle('active', t.dataset.tab === tabName);
      });
      document.querySelectorAll('.piv-tab-panel').forEach(function (p) {
        p.classList.toggle('active', p.dataset.tab === tabName);
      });
    },

    // ── סטטוס בפוטר ───────────────────────────────────────────────────────
    _setStatus: function (text, active) {
      var dot = qs('#piv-agent-status-dot');
      var txt = qs('#piv-agent-status-text');
      if (dot) dot.classList.toggle('active', !!active);
      if (txt) txt.textContent = text;
    },

    // ── הצגת שגיאה ───────────────────────────────────────────────────────
    _showError: function (msg) {
      var container = qs('.piv-ap-body .piv-tab-panel.active');
      if (!container) return;
      var banner = el('div', { class: 'piv-error-banner', text: msg });
      container.insertBefore(banner, container.firstChild);
      setTimeout(function () { if (banner.parentNode) banner.parentNode.removeChild(banner); }, 5000);
    },

    // ── חיבור אירועים ─────────────────────────────────────────────────────
    _bindEvents: function () {
      // FAB toggle
      qs('#piv-agent-fab').addEventListener('click', function () {
        PIV_AGENT.toggle();
        qs('#piv-agent-fab-badge').style.display = 'none';
      });

      // Close button + overlay
      qs('#piv-agent-close').addEventListener('click', PIV_AGENT.close);
      qs('#piv-agent-overlay').addEventListener('click', PIV_AGENT.close);

      // ESC key
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape' && state.isOpen) PIV_AGENT.close();
      });

      // Tab switching
      document.querySelectorAll('.piv-ap-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          PIV_AGENT.setTab(tab.dataset.tab);
        });
      });

      // Refresh button
      var refreshBtn = qs('#piv-ap-refresh-btn');
      if (refreshBtn) refreshBtn.addEventListener('click', function () {
        refreshBtn.textContent = '↻ מרענן...';
        refreshBtn.disabled = true;
        PIV_AGENT.refreshTasks().then(function () {
          refreshBtn.textContent = '↻ רענן';
          refreshBtn.disabled = false;
        });
      });

      // Scan all (dashboard quick button)
      var scanAllBtn = qs('#piv-ap-scan-all-btn');
      if (scanAllBtn) scanAllBtn.addEventListener('click', function () {
        PIV_AGENT._runScanAll('quick');
      });

      // Quick action grid buttons
      document.querySelectorAll('.piv-quick-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var action = btn.dataset.action;
          // Close all forms first
          document.querySelectorAll('.piv-form-section.open').forEach(function (f) { f.classList.remove('open'); });
          if (action === 'qa-scan-all') {
            PIV_AGENT._runScanAll('quick');
          } else if (action === 'qa-scan-one') {
            var f = qs('#form-scan-one'); if (f) f.classList.add('open');
          } else if (action === 'qa-fix') {
            var f = qs('#form-fix'); if (f) f.classList.add('open');
          } else if (action === 'qa-generate') {
            var f = qs('#form-generate'); if (f) f.classList.add('open');
          } else if (action === 'qa-optimize') {
            var f = qs('#form-optimize'); if (f) f.classList.add('open');
          } else if (action === 'qa-free') {
            var f = qs('#form-free'); if (f) f.classList.add('open');
          }
        });
      });

      // Run: Scan one
      var runScanOne = qs('#run-scan-one');
      if (runScanOne) runScanOne.addEventListener('click', function () {
        var name = (qs('#scan-symbol-name').value || '').trim();
        var type = qs('#scan-type').value;
        if (!name) { PIV_AGENT._showError('נא להזין שם סמל'); return; }
        PIV_AGENT.createTask('scan_symbol', { symbol_name: name, scan_type: type }, 'סריקת ' + name);
        qs('#form-scan-one').classList.remove('open');
      });

      // Run: Fix
      var runFix = qs('#run-fix');
      if (runFix) runFix.addEventListener('click', function () {
        var name = (qs('#fix-symbol-name').value || '').trim();
        var issue = (qs('#fix-issue-desc').value || '').trim();
        var fileType = qs('#fix-file-type').value;
        var autoApply = qs('#fix-auto-apply').value === 'true';
        if (!name || !issue) { PIV_AGENT._showError('נא למלא שם סמל ותיאור בעיה'); return; }
        PIV_AGENT.createTask('fix_code', {
          symbol_name: name,
          issue_description: issue,
          file_type: fileType,
          auto_apply: autoApply,
        }, 'תיקון ' + name);
        qs('#form-fix').classList.remove('open');
      });

      // Run: Generate
      var runGen = qs('#run-generate');
      if (runGen) runGen.addEventListener('click', function () {
        var name = (qs('#gen-symbol-name').value || '').trim();
        var desc = (qs('#gen-description').value || '').trim();
        var cat = qs('#gen-category').value;
        var tagsRaw = (qs('#gen-pi-tags').value || '').trim();
        var featRaw = (qs('#gen-features').value || '').trim();
        if (!name || !desc) { PIV_AGENT._showError('נא למלא שם וסמל ותיאור'); return; }
        var piTags = tagsRaw ? tagsRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : undefined;
        var features = featRaw ? featRaw.split(',').map(function (t) { return t.trim(); }).filter(Boolean) : undefined;
        PIV_AGENT.createTask('generate_symbol', {
          symbol_name: name,
          description: desc,
          category: cat,
          pi_tags: piTags,
          features: features,
        }, 'יצירת ' + name);
        qs('#form-generate').classList.remove('open');
      });

      // Run: Optimize
      var runOpt = qs('#run-optimize');
      if (runOpt) runOpt.addEventListener('click', function () {
        var name = (qs('#opt-symbol-name').value || '').trim();
        var optType = qs('#opt-type').value;
        if (!name) { PIV_AGENT._showError('נא להזין שם סמל'); return; }
        PIV_AGENT.createTask('optimize_symbol', {
          symbol_name: name,
          optimization_type: optType,
        }, 'אופטימיזציה: ' + name);
        qs('#form-optimize').classList.remove('open');
      });

      // Run: Free autonomous
      var runFree = qs('#run-free');
      if (runFree) runFree.addEventListener('click', function () {
        var req = (qs('#free-request').value || '').trim();
        if (!req) { PIV_AGENT._showError('נא לתאר את המשימה'); return; }
        PIV_AGENT.createTask('autonomous', { request: req }, 'משימה חופשית');
        qs('#free-request').value = '';
        qs('#form-free').classList.remove('open');
      });

      // Clear tasks button
      var clearBtn = qs('#piv-clear-tasks');
      if (clearBtn) clearBtn.addEventListener('click', function () {
        state.tasks = [];
        Object.keys(state.pollingTimers).forEach(function (id) { PIV_AGENT._stopPolling(id); });
        state.pollingTimers = {};
        state.expandedTasks = {};
        PIV_AGENT._renderTasks();
        PIV_AGENT._updateStats();
        var rc = qs('#piv-results-container');
        if (rc) rc.innerHTML = '';
        var re = qs('#piv-results-empty');
        if (re) re.style.display = '';
        qs('#piv-agent-fab-badge').style.display = 'none';
      });

      // Task list delegation
      qs('#piv-task-list').addEventListener('click', function (e) {
        var toggleBtn = e.target.closest('[data-task-toggle]');
        var resultBtn = e.target.closest('[data-task-result]');

        if (toggleBtn) {
          var taskId = toggleBtn.dataset.taskToggle;
          state.expandedTasks[taskId] = !state.expandedTasks[taskId];
          PIV_AGENT._renderTasks();
        }

        if (resultBtn) {
          var taskId = resultBtn.dataset.taskResult;
          var task = state.tasks.find(function (t) { return t.id === taskId; });
          if (task) {
            PIV_AGENT._addResult(task);
            PIV_AGENT.setTab('results');
          }
        }
      });
    },

    // ── פעולת סרוק הכל ───────────────────────────────────────────────────
    _runScanAll: function (scanType) {
      PIV_AGENT._setStatus('מתחיל סריקה מלאה...', true);
      apiPost('/agent/scan-all', { scan_type: scanType || 'quick' })
        .then(function (data) {
          if (data && data.task_id) {
            PIV_AGENT._startPolling(data.task_id);
            PIV_AGENT.refreshTasks();
          }
        })
        .catch(function (err) {
          PIV_AGENT._showError('שגיאה בהפעלת סריקה: ' + err.message);
          PIV_AGENT._setStatus('שגיאה', false);
        });
    },

    // ── אתחול ────────────────────────────────────────────────────────────
    init: function () {
      injectStyles();
      buildPanel();
      PIV_AGENT._bindEvents();

      // Restore panel state from storage
      var settings = loadSettings();
      if (settings.panelOpen) {
        // Delay open so DOM is fully settled
        setTimeout(function () { PIV_AGENT.open(); }, 300);
      }

      // Initial task load
      PIV_AGENT.refreshTasks();

      // Periodic background refresh every 10 seconds when panel is open
      setInterval(function () {
        if (state.isOpen && state.activeTab === 'dashboard') {
          PIV_AGENT.refreshTasks();
        }
      }, 10000);

      console.log('[PIV_AGENT] סוכן AI אוטונומי מוכן — window.PIV_AGENT זמין');
    },
  };

  // ── חשיפה גלובלית ─────────────────────────────────────────────────────────
  window.PIV_AGENT = PIV_AGENT;

  // ── אתחול לאחר טעינת ה-DOM ────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', PIV_AGENT.init.bind(PIV_AGENT));
  } else {
    PIV_AGENT.init();
  }

}(window, document));
