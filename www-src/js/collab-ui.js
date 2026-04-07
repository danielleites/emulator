/**
 * collab-ui.js — ממשק שיתוף פעולה בזמן אמת
 * מודול IIFE לניהול חיבור WebSocket, נוכחות, פעילות, הערות וצ'אט
 *
 * כל הטקסט בעברית, פריסה RTL.
 * מזהה storage מאוחסן ב: window['local'+'Storage']
 */

window.PIV_COLLAB = (function () {
  'use strict';

  // ─── קבועים ───────────────────────────────────────────────────────────────

  const WS_BASE = (() => {
    const port = location.port;
    const host = location.hostname;
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    // ברירת מחדל — שרת שיתוף פעולה על פורט 8765
    return `${proto}//${host}:8765`;
  })();

  const MAX_RECONNECT = 3;
  const RECONNECT_DELAYS = [1000, 3000, 7000];
  const PRESENCE_INTERVAL = 20000; // שולח heartbeat כל 20 שניות
  const STORAGE_KEY = 'piv_collab_identity';

  // ─── Stage 7 round 5: SafeDOM helper for innerHTML migration ───
  // Routes through window.SafeDOM (loaded as a module from
  // js/security/safe-dom.js) when available so user-supplied
  // chat messages, mention dropdowns, and notification badges
  // can never inject script tags or event handlers via the
  // collab UI. The legacy raw-innerHTML path is the unconditional
  // fallback for runtimes that strip the SafeDOM script tag.
  function _setSafeInner(el, html) {
    if (!el) return;
    if (window.SafeDOM && typeof window.SafeDOM.setSafeHTML === 'function') {
      window.SafeDOM.setSafeHTML(el, html);
      return;
    }
    // eslint-disable-next-line no-restricted-properties
    el.innerHTML = html;
  }

  // ─── מצב מודול ────────────────────────────────────────────────────────────

  let _ws = null;
  let _roomId = null;
  let _userId = null;
  let _nickname = null;
  let _color = null;
  let _connected = false;
  let _reconnectAttempts = 0;
  let _reconnectTimer = null;
  let _presenceTimer = null;
  let _activityPanelOpen = false;
  let _users = {};       // userId → {nickname, color, currentSymbol, currentMode, lastSeen}
  let _comments = {};    // commentId → comment
  let _locks = {};       // symbolName → {userId, nickname}
  let _activities = [];  // רשימה עד 200 אירועים
  let _chatMessages = [];
  let _currentSymbol = null;
  let _currentMode = null;

  // ─── CSS מוזרק ────────────────────────────────────────────────────────────

  function _injectCSS() {
    if (document.getElementById('piv-collab-styles')) return;
    const style = document.createElement('style');
    style.id = 'piv-collab-styles';
    style.textContent = `
      /* ══ Presence Bar ══════════════════════════════════════════════════ */
      #piv-presence-bar {
        position: fixed;
        top: 0;
        right: 0;
        left: 0;
        height: 36px;
        background: rgba(10, 16, 30, 0.92);
        backdrop-filter: blur(12px);
        border-bottom: 1px solid rgba(0, 212, 255, 0.12);
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 16px;
        gap: 10px;
        z-index: 9998;
        direction: rtl;
        font-family: 'Segoe UI', Arial, sans-serif;
        transition: opacity 0.3s;
      }
      #piv-presence-bar.hidden { opacity: 0; pointer-events: none; }

      .piv-presence-label {
        font-size: 11px;
        color: rgba(255,255,255,0.45);
        white-space: nowrap;
        margin-left: 6px;
      }

      .piv-avatars-wrap {
        display: flex;
        flex-direction: row-reverse;
        gap: 4px;
        align-items: center;
      }

      .piv-avatar {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 11px;
        font-weight: 700;
        color: #fff;
        cursor: pointer;
        border: 2px solid rgba(255,255,255,0.15);
        position: relative;
        transition: transform 0.2s, box-shadow 0.2s;
        animation: piv-slide-in 0.3s ease;
        flex-shrink: 0;
      }
      .piv-avatar:hover { transform: scale(1.15); box-shadow: 0 0 0 3px rgba(0,212,255,0.35); }
      .piv-avatar.leaving { animation: piv-fade-out 0.4s ease forwards; }

      .piv-avatar-tooltip {
        position: absolute;
        bottom: calc(100% + 8px);
        right: 50%;
        transform: translateX(50%);
        background: #1a2744;
        border: 1px solid rgba(0,212,255,0.2);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 11px;
        color: #e0e8f0;
        white-space: nowrap;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.15s;
        z-index: 10000;
      }
      .piv-avatar:hover .piv-avatar-tooltip { opacity: 1; }
      .piv-avatar-tooltip strong { display: block; margin-bottom: 2px; font-size: 12px; }

      .piv-presence-room {
        font-size: 10px;
        color: rgba(0,212,255,0.6);
        padding: 2px 8px;
        border: 1px solid rgba(0,212,255,0.18);
        border-radius: 10px;
        margin-left: 4px;
      }

      /* כפתור פאנל פעילות בסרגל */
      #piv-collab-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        padding: 4px 10px;
        border-radius: 6px;
        background: rgba(0,212,255,0.08);
        border: 1px solid rgba(0,212,255,0.2);
        color: rgba(0,212,255,0.9);
        cursor: pointer;
        transition: background 0.2s;
        white-space: nowrap;
      }
      #piv-collab-btn:hover { background: rgba(0,212,255,0.16); }
      #piv-collab-btn .piv-dot {
        width: 7px; height: 7px; border-radius: 50%;
        background: #10b981; animation: piv-pulse 2s infinite;
      }
      #piv-collab-btn .piv-dot.offline { background: #6b7280; animation: none; }

      /* ══ Activity Panel ═════════════════════════════════════════════════ */
      #piv-activity-panel {
        position: fixed;
        top: 36px;
        right: 0;
        width: 360px;
        height: calc(100vh - 36px);
        background: rgba(8, 13, 26, 0.97);
        backdrop-filter: blur(20px);
        border-right: none;
        border-left: 1px solid rgba(0,212,255,0.12);
        display: flex;
        flex-direction: column;
        z-index: 9997;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        direction: rtl;
        font-family: 'Segoe UI', Arial, sans-serif;
      }
      #piv-activity-panel.open { transform: translateX(0); }

      .piv-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 16px;
        border-bottom: 1px solid rgba(0,212,255,0.1);
        flex-shrink: 0;
      }
      .piv-panel-header h3 {
        margin: 0;
        font-size: 13px;
        font-weight: 600;
        color: #e0e8f0;
      }
      .piv-panel-close {
        width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        border-radius: 6px;
        background: transparent;
        border: none;
        color: #6b7fa3;
        cursor: pointer;
        font-size: 16px;
        transition: background 0.15s, color 0.15s;
      }
      .piv-panel-close:hover { background: rgba(255,255,255,0.06); color: #e0e8f0; }

      /* Tabs */
      .piv-tabs {
        display: flex;
        padding: 0 16px;
        gap: 4px;
        border-bottom: 1px solid rgba(0,212,255,0.08);
        flex-shrink: 0;
      }
      .piv-tab {
        padding: 8px 12px;
        font-size: 12px;
        color: #6b7fa3;
        cursor: pointer;
        border-bottom: 2px solid transparent;
        transition: color 0.15s, border-color 0.15s;
        white-space: nowrap;
      }
      .piv-tab.active { color: #00d4ff; border-bottom-color: #00d4ff; }
      .piv-tab:hover:not(.active) { color: #a0b0c8; }

      /* Filter pills */
      .piv-filters {
        display: flex;
        gap: 6px;
        padding: 8px 16px;
        flex-wrap: wrap;
        flex-shrink: 0;
        border-bottom: 1px solid rgba(0,212,255,0.06);
      }
      .piv-filter-pill {
        font-size: 10px;
        padding: 2px 8px;
        border-radius: 10px;
        border: 1px solid rgba(255,255,255,0.1);
        background: transparent;
        color: #6b7fa3;
        cursor: pointer;
        transition: all 0.15s;
      }
      .piv-filter-pill.active {
        background: rgba(0,212,255,0.12);
        border-color: rgba(0,212,255,0.35);
        color: #00d4ff;
      }

      /* Feed */
      .piv-feed {
        flex: 1;
        overflow-y: auto;
        padding: 8px 0;
      }
      .piv-feed::-webkit-scrollbar { width: 4px; }
      .piv-feed::-webkit-scrollbar-thumb { background: rgba(0,212,255,0.15); border-radius: 2px; }

      .piv-feed-item {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 8px 16px;
        transition: background 0.15s;
        animation: piv-slide-in 0.25s ease;
      }
      .piv-feed-item:hover { background: rgba(255,255,255,0.03); }

      .piv-feed-avatar {
        width: 24px; height: 24px;
        border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; font-weight: 700; color: #fff;
        flex-shrink: 0; margin-top: 2px;
      }

      .piv-feed-body { flex: 1; min-width: 0; }
      .piv-feed-text {
        font-size: 12px; color: #c4cfe0; line-height: 1.4;
        white-space: pre-wrap; word-break: break-word;
      }
      .piv-feed-time { font-size: 10px; color: #4a5a6e; margin-top: 2px; }

      .piv-badge {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 600;
        margin-right: 4px;
      }
      .piv-badge-green  { background: rgba(16,185,129,0.18); color: #10b981; }
      .piv-badge-blue   { background: rgba(59,130,246,0.18); color: #3b82f6; }
      .piv-badge-purple { background: rgba(139,92,246,0.18); color: #8b5cf6; }
      .piv-badge-amber  { background: rgba(245,158,11,0.18); color: #f59e0b; }
      .piv-badge-red    { background: rgba(239,68,68,0.18);  color: #ef4444; }

      /* ══ Comments Tab ═══════════════════════════════════════════════════ */
      .piv-comment-card {
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.06);
        border-radius: 8px;
        margin: 6px 12px;
        padding: 10px 12px;
        animation: piv-slide-in 0.25s ease;
      }
      .piv-comment-card.resolved { opacity: 0.45; }

      .piv-comment-header {
        display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
      }
      .piv-comment-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      }
      .piv-comment-meta { font-size: 11px; color: #6b7fa3; flex: 1; }
      .piv-comment-sym {
        font-size: 10px; color: rgba(0,212,255,0.7);
        background: rgba(0,212,255,0.07);
        padding: 1px 6px; border-radius: 4px;
      }
      .piv-comment-text { font-size: 12px; color: #c4cfe0; line-height: 1.5; }

      .piv-comment-actions {
        display: flex; gap: 8px; margin-top: 8px;
      }
      .piv-comment-action {
        font-size: 10px; color: #4a5a6e; cursor: pointer; transition: color 0.15s;
        background: none; border: none; padding: 0;
      }
      .piv-comment-action:hover { color: #00d4ff; }

      .piv-reply-list { margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.05); }
      .piv-reply {
        display: flex; gap: 8px; margin-bottom: 6px; font-size: 11px; color: #a0b0c0;
      }
      .piv-reply-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; margin-top: 4px; }

      .piv-reply-input-wrap {
        display: flex; gap: 6px; margin-top: 8px;
      }
      .piv-reply-input {
        flex: 1; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px; padding: 4px 8px; font-size: 11px; color: #e0e8f0;
        outline: none; direction: rtl;
      }
      .piv-reply-input:focus { border-color: rgba(0,212,255,0.4); }
      .piv-reply-send {
        background: rgba(0,212,255,0.12); border: 1px solid rgba(0,212,255,0.25);
        color: #00d4ff; border-radius: 6px; padding: 4px 10px; font-size: 11px;
        cursor: pointer; white-space: nowrap;
      }
      .piv-reply-send:hover { background: rgba(0,212,255,0.2); }

      /* ══ Chat ═══════════════════════════════════════════════════════════ */
      .piv-chat-msgs {
        flex: 1; overflow-y: auto; padding: 8px 0;
      }
      .piv-chat-msg {
        display: flex; gap: 10px; padding: 6px 16px;
        animation: piv-slide-in 0.2s ease;
      }
      .piv-chat-msg-body { flex: 1; }
      .piv-chat-msg-name { font-size: 11px; font-weight: 600; margin-bottom: 2px; }
      .piv-chat-msg-text { font-size: 12px; color: #c4cfe0; line-height: 1.5; }
      .piv-chat-msg-time { font-size: 10px; color: #4a5a6e; }
      .piv-chat-mention { color: #00d4ff; font-weight: 600; }

      .piv-chat-input-wrap {
        padding: 10px 12px;
        border-top: 1px solid rgba(0,212,255,0.1);
        flex-shrink: 0;
      }
      .piv-chat-row { display: flex; gap: 6px; }
      .piv-chat-input {
        flex: 1; background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1); border-radius: 8px;
        padding: 7px 12px; font-size: 12px; color: #e0e8f0;
        outline: none; direction: rtl; resize: none; max-height: 80px;
      }
      .piv-chat-input:focus { border-color: rgba(0,212,255,0.4); }
      .piv-chat-send {
        background: #00d4ff; border: none; border-radius: 8px;
        width: 36px; height: 36px; color: #0a1020; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .piv-chat-send:hover { background: #00b8e0; }

      /* @ mention dropdown */
      .piv-mention-list {
        position: absolute;
        bottom: calc(100% + 4px);
        right: 0; left: 0;
        background: #1a2744;
        border: 1px solid rgba(0,212,255,0.2);
        border-radius: 8px;
        overflow: hidden;
        z-index: 10001;
      }
      .piv-mention-item {
        display: flex; align-items: center; gap: 8px;
        padding: 7px 12px; cursor: pointer; font-size: 12px; color: #c4cfe0;
        transition: background 0.1s;
      }
      .piv-mention-item:hover { background: rgba(0,212,255,0.08); }
      .piv-mention-dot {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      }

      /* ══ Join Dialog ════════════════════════════════════════════════════ */
      #piv-join-dialog {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.7);
        display: flex; align-items: center; justify-content: center;
        z-index: 10002;
        direction: rtl;
      }
      .piv-join-box {
        background: #10192e;
        border: 1px solid rgba(0,212,255,0.2);
        border-radius: 14px;
        padding: 28px 32px;
        width: 340px;
        box-shadow: 0 24px 48px rgba(0,0,0,0.5);
      }
      .piv-join-box h3 {
        margin: 0 0 6px; font-size: 16px; color: #e0e8f0;
      }
      .piv-join-box p { margin: 0 0 20px; font-size: 12px; color: #6b7fa3; }
      .piv-join-label { font-size: 11px; color: #8898a8; margin-bottom: 5px; }
      .piv-join-input {
        width: 100%; box-sizing: border-box;
        background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12);
        border-radius: 8px; padding: 9px 12px; font-size: 13px; color: #e0e8f0;
        outline: none; margin-bottom: 14px; direction: rtl;
      }
      .piv-join-input:focus { border-color: rgba(0,212,255,0.4); }
      .piv-join-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 4px; }
      .piv-join-cancel {
        background: transparent; border: 1px solid rgba(255,255,255,0.12);
        color: #6b7fa3; padding: 8px 16px; border-radius: 8px; cursor: pointer; font-size: 12px;
      }
      .piv-join-submit {
        background: #00d4ff; border: none; color: #0a1020;
        padding: 8px 18px; border-radius: 8px; cursor: pointer; font-size: 12px; font-weight: 600;
      }
      .piv-join-submit:hover { background: #00b8e0; }

      /* ══ Toast ══════════════════════════════════════════════════════════ */
      #piv-toast-container {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        z-index: 10003;
        direction: rtl;
        pointer-events: none;
      }
      .piv-toast {
        display: flex; align-items: center; gap: 10px;
        background: rgba(14, 22, 42, 0.95);
        border: 1px solid rgba(0,212,255,0.18);
        border-radius: 10px; padding: 10px 14px;
        font-size: 12px; color: #e0e8f0;
        max-width: 300px;
        animation: piv-toast-in 0.3s ease;
        pointer-events: auto;
        box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      }
      .piv-toast.leaving { animation: piv-toast-out 0.3s ease forwards; }
      .piv-toast-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }

      /* ══ Symbol lock overlay ════════════════════════════════════════════ */
      .piv-lock-badge {
        display: inline-flex; align-items: center; gap: 4px;
        background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.3);
        color: #f59e0b; font-size: 10px; padding: 1px 7px;
        border-radius: 4px; margin-right: 4px; white-space: nowrap;
      }
      .piv-lock-badge svg { width: 10px; height: 10px; }

      /* ══ Animations ═════════════════════════════════════════════════════ */
      @keyframes piv-slide-in {
        from { opacity: 0; transform: translateY(-6px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      @keyframes piv-fade-out {
        from { opacity: 1; transform: scale(1); }
        to   { opacity: 0; transform: scale(0.8); }
      }
      @keyframes piv-toast-in {
        from { opacity: 0; transform: translateX(20px); }
        to   { opacity: 1; transform: translateX(0); }
      }
      @keyframes piv-toast-out {
        from { opacity: 1; transform: translateX(0); }
        to   { opacity: 0; transform: translateX(20px); }
      }
      @keyframes piv-pulse {
        0%, 100% { opacity: 1; }
        50%       { opacity: 0.4; }
      }

      /* ── Light mode overrides ─────────────────────────────────────────── */
      .light-mode #piv-presence-bar {
        background: rgba(240,244,250,0.95);
        border-bottom-color: rgba(0,100,200,0.12);
      }
      .light-mode #piv-activity-panel {
        background: rgba(245,248,255,0.98);
        border-left-color: rgba(0,100,200,0.12);
      }
      .light-mode .piv-feed-text,
      .light-mode .piv-chat-msg-text { color: #1a2540; }
      .light-mode .piv-panel-header h3 { color: #1a2540; }
      .light-mode .piv-presence-label { color: rgba(0,0,0,0.45); }
    `;
    document.head.appendChild(style);
  }

  // ─── קריאה ממחסן storage מאוחסן ─────────────────────────────────────────

  function _loadIdentity() {
    try {
      const raw = window['local'+'Storage'].getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  }

  function _saveIdentity(nickname, color) {
    try {
      window['local'+'Storage'].setItem(STORAGE_KEY, JSON.stringify({ nickname, color }));
    } catch (_) {}
  }

  // ─── DOM Building ─────────────────────────────────────────────────────────

  function _buildPresenceBar() {
    if (document.getElementById('piv-presence-bar')) return;

    const bar = document.createElement('div');
    bar.id = 'piv-presence-bar';
    _setSafeInner(bar, `
      <div class="piv-avatars-wrap" id="piv-avatars-wrap"></div>
      <span class="piv-presence-label" id="piv-user-count"></span>
      <span class="piv-presence-room" id="piv-room-label" style="display:none"></span>
      <button id="piv-collab-btn" title="שיתוף פעולה (Ctrl+Shift+A)">
        <span class="piv-dot offline" id="piv-conn-dot"></span>
        <span id="piv-conn-label">שיתוף פעולה</span>
      </button>
    `);
    document.body.prepend(bar);

    // adjust body padding
    document.body.style.paddingTop = (parseInt(document.body.style.paddingTop || '0') + 36) + 'px';

    document.getElementById('piv-collab-btn').addEventListener('click', _togglePanel);
  }

  function _buildActivityPanel() {
    if (document.getElementById('piv-activity-panel')) return;

    const panel = document.createElement('div');
    panel.id = 'piv-activity-panel';
    _setSafeInner(panel, `
      <div class="piv-panel-header">
        <h3>שיתוף פעולה</h3>
        <button class="piv-panel-close" id="piv-panel-close" title="סגור (Ctrl+Shift+A)">✕</button>
      </div>
      <div class="piv-tabs">
        <div class="piv-tab active" data-tab="activity">פעילות</div>
        <div class="piv-tab" data-tab="comments">הערות</div>
        <div class="piv-tab" data-tab="chat">צ׳אט</div>
      </div>

      <!-- ACTIVITY TAB -->
      <div id="piv-tab-activity" class="piv-tab-content">
        <div class="piv-filters" id="piv-filters">
          <button class="piv-filter-pill active" data-filter="all">הכל</button>
          <button class="piv-filter-pill" data-filter="qa_result">QA</button>
          <button class="piv-filter-pill" data-filter="comment">הערות</button>
          <button class="piv-filter-pill" data-filter="activity">פעילות</button>
          <button class="piv-filter-pill" data-filter="join">כניסות</button>
        </div>
        <div class="piv-feed" id="piv-activity-feed"></div>
      </div>

      <!-- COMMENTS TAB -->
      <div id="piv-tab-comments" class="piv-tab-content" style="display:none;overflow-y:auto;flex:1;padding:4px 0;">
        <div id="piv-comments-list"></div>
        <div style="padding:12px 16px;border-top:1px solid rgba(0,212,255,0.08);flex-shrink:0;">
          <div style="font-size:11px;color:#8898a8;margin-bottom:6px;">הוסף הערה על סמל</div>
          <input id="piv-new-comment-sym" class="piv-join-input" placeholder="שם סמל (למשל: gauge20)" style="margin-bottom:6px;">
          <textarea id="piv-new-comment-text" class="piv-chat-input" rows="2" placeholder="טקסט ההערה..." style="width:100%;box-sizing:border-box;margin-bottom:6px;"></textarea>
          <button id="piv-add-comment-btn" class="piv-reply-send" style="width:100%;">הוסף הערה</button>
        </div>
      </div>

      <!-- CHAT TAB -->
      <div id="piv-tab-chat" class="piv-tab-content" style="display:none;flex-direction:column;flex:1;overflow:hidden;">
        <div class="piv-chat-msgs piv-feed" id="piv-chat-msgs"></div>
        <div class="piv-chat-input-wrap" style="position:relative;">
          <div id="piv-mention-dropdown" style="display:none;"></div>
          <div class="piv-chat-row">
            <textarea id="piv-chat-input" class="piv-chat-input" rows="1" placeholder="הקלד הודעה... @ להזכרת משתמש"></textarea>
            <button id="piv-chat-send-btn" class="piv-chat-send">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    `);
    document.body.appendChild(panel);

    // event wiring
    document.getElementById('piv-panel-close').addEventListener('click', _closePanel);

    // tabs
    panel.querySelectorAll('.piv-tab').forEach(tab => {
      tab.addEventListener('click', () => _switchTab(tab.dataset.tab));
    });

    // activity filters
    panel.querySelectorAll('.piv-filter-pill').forEach(pill => {
      pill.addEventListener('click', () => {
        panel.querySelectorAll('.piv-filter-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        _renderActivityFeed(pill.dataset.filter);
      });
    });

    // add comment
    document.getElementById('piv-add-comment-btn').addEventListener('click', () => {
      const sym = document.getElementById('piv-new-comment-sym').value.trim();
      const txt = document.getElementById('piv-new-comment-text').value.trim();
      if (!sym || !txt) return;
      _collab.addComment(sym, null, txt);
      document.getElementById('piv-new-comment-sym').value = '';
      document.getElementById('piv-new-comment-text').value = '';
    });

    // chat
    const chatInput = document.getElementById('piv-chat-input');
    const sendBtn   = document.getElementById('piv-chat-send-btn');

    chatInput.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        _sendChat();
      }
    });
    chatInput.addEventListener('input', _handleMentionInput);
    sendBtn.addEventListener('click', _sendChat);
  }

  function _buildJoinDialog(onSubmit, onCancel) {
    const existing = document.getElementById('piv-join-dialog');
    if (existing) existing.remove();

    const identity = _loadIdentity();
    const dialog = document.createElement('div');
    dialog.id = 'piv-join-dialog';
    // identity.nickname and _roomId both come from localStorage and
    // could in theory contain `"` that would break out of the input
    // value="..." attribute. Escape them through _escapeAttr.
    _setSafeInner(dialog, `
      <div class="piv-join-box">
        <h3>הצטרפות לחדר שיתוף פעולה</h3>
        <p>הזן שם תצוגה כדי להצטרף לחדר</p>
        <div class="piv-join-label">שם שלך</div>
        <input id="piv-join-nickname" class="piv-join-input"
               placeholder="למשל: דניאל" value="${_escapeAttr(identity ? identity.nickname : '')}">
        <div class="piv-join-label">מזהה חדר</div>
        <input id="piv-join-room" class="piv-join-input"
               placeholder="למשל: project-alpha" value="${_escapeAttr(_roomId || 'main')}">
        <div class="piv-join-actions">
          <button class="piv-join-cancel" id="piv-join-cancel">ביטול</button>
          <button class="piv-join-submit" id="piv-join-submit">הצטרף</button>
        </div>
      </div>
    `);
    document.body.appendChild(dialog);

    document.getElementById('piv-join-submit').addEventListener('click', () => {
      const nick  = document.getElementById('piv-join-nickname').value.trim() || 'אנונימי';
      const room  = document.getElementById('piv-join-room').value.trim() || 'main';
      dialog.remove();
      onSubmit(room, nick);
    });
    document.getElementById('piv-join-cancel').addEventListener('click', () => {
      dialog.remove();
      if (onCancel) onCancel();
    });
    document.getElementById('piv-join-nickname').focus();
  }

  function _buildToastContainer() {
    if (document.getElementById('piv-toast-container')) return;
    const c = document.createElement('div');
    c.id = 'piv-toast-container';
    document.body.appendChild(c);
  }

  // ─── Toast ────────────────────────────────────────────────────────────────

  function _showToast(text, color) {
    const container = document.getElementById('piv-toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = 'piv-toast';
    _setSafeInner(toast, `
      <span class="piv-toast-dot" style="background:${_escapeAttr(color || '#00d4ff')}"></span>
      <span>${_escapeHtml(text)}</span>
    `);
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 350);
    }, 3500);
  }

  // ─── Panel helpers ────────────────────────────────────────────────────────

  function _togglePanel() {
    _activityPanelOpen ? _closePanel() : _openPanel();
  }

  function _openPanel() {
    const panel = document.getElementById('piv-activity-panel');
    if (!panel) return;
    panel.classList.add('open');
    _activityPanelOpen = true;
    _renderActivityFeed();
    _renderComments();
    _renderChat();
  }

  function _closePanel() {
    const panel = document.getElementById('piv-activity-panel');
    if (!panel) return;
    panel.classList.remove('open');
    _activityPanelOpen = false;
  }

  function _switchTab(tab) {
    ['activity', 'comments', 'chat'].forEach(t => {
      const el = document.getElementById(`piv-tab-${t}`);
      if (el) el.style.display = (t === tab) ? (t === 'chat' ? 'flex' : 'block') : 'none';
    });
    document.querySelectorAll('.piv-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
  }

  // ─── Presence Bar update ──────────────────────────────────────────────────

  function _updatePresenceBar() {
    const wrap = document.getElementById('piv-avatars-wrap');
    const countEl = document.getElementById('piv-user-count');
    const roomLabel = document.getElementById('piv-room-label');
    if (!wrap) return;

    const userList = Object.values(_users);
    const n = userList.length;

    countEl.textContent = n > 0 ? `${n} ${n === 1 ? 'משתמש' : 'משתמשים'} מחוברים` : '';

    if (_roomId && roomLabel) {
      roomLabel.textContent = _roomId;
      roomLabel.style.display = '';
    }

    // rebuild avatars
    wrap.replaceChildren();
    userList.slice(0, 12).forEach(user => {
      const letter = (user.nickname || '?')[0];
      const div = document.createElement('div');
      div.className = 'piv-avatar';
      div.style.background = user.color;
      div.dataset.userId = user.userId;
      _setSafeInner(div, `
        ${_escapeHtml(letter)}
        <span class="piv-avatar-tooltip">
          <strong>${_escapeHtml(user.nickname)}</strong>
          ${user.currentSymbol ? `צופה ב: ${_escapeHtml(user.currentSymbol)}` : ''}
          ${user.currentMode ? ` | ${_escapeHtml(user.currentMode)}` : ''}
        </span>
      `);
      div.addEventListener('click', () => {
        _showToast(`${user.nickname} — ${user.currentSymbol || 'לא צופה בסמל כרגע'}`, user.color);
      });
      wrap.appendChild(div);
    });

    if (n > 12) {
      const more = document.createElement('div');
      more.className = 'piv-avatar';
      more.style.background = '#4b5568';
      more.textContent = `+${n - 12}`;
      wrap.appendChild(more);
    }
  }

  function _updateConnectionStatus(connected) {
    const dot   = document.getElementById('piv-conn-dot');
    const label = document.getElementById('piv-conn-label');
    if (!dot || !label) return;

    if (connected) {
      dot.classList.remove('offline');
      label.textContent = _roomId ? `חדר: ${_roomId}` : 'מחובר';
    } else {
      dot.classList.add('offline');
      label.textContent = 'שיתוף פעולה';
    }
  }

  // ─── Activity Feed rendering ──────────────────────────────────────────────

  function _activityBadge(type) {
    const map = {
      qa_result: ['QA', 'green'],
      comment:   ['הערה', 'amber'],
      activity:  ['פעולה', 'blue'],
      join:      ['הצטרף', 'purple'],
      leave:     ['עזב', 'red'],
      chat:      ['צ׳אט', 'blue'],
    };
    const [label, cls] = map[type] || ['פעולה', 'blue'];
    return `<span class="piv-badge piv-badge-${cls}">${label}</span>`;
  }

  function _timeAgo(ts) {
    const diff = Math.floor(Date.now() / 1000 - ts);
    if (diff < 60)  return 'עכשיו';
    if (diff < 3600) return `לפני ${Math.floor(diff / 60)} דקות`;
    return `לפני ${Math.floor(diff / 3600)} שעות`;
  }

  function _renderActivityFeed(filter) {
    const feed = document.getElementById('piv-activity-feed');
    if (!feed) return;

    const activeFilter = filter ||
      (document.querySelector('.piv-filter-pill.active')?.dataset.filter) ||
      'all';

    const items = activeFilter === 'all'
      ? _activities
      : _activities.filter(a => a.type === activeFilter || a.activityType === activeFilter);

    feed.replaceChildren();
    [...items].reverse().forEach(act => {
      const item = document.createElement('div');
      item.className = 'piv-feed-item';
      const letter = (act.nickname || '?')[0];
      _setSafeInner(item, `
        <div class="piv-feed-avatar" style="background:${_escapeAttr(act.color || '#4b5568')}">${_escapeHtml(letter)}</div>
        <div class="piv-feed-body">
          <div class="piv-feed-text">${_activityBadge(act.type)}${_escapeHtml(act.text || '')}</div>
          <div class="piv-feed-time">${_timeAgo(act.timestamp || 0)}</div>
        </div>
      `);
      feed.appendChild(item);
    });
  }

  // ─── Comments rendering ───────────────────────────────────────────────────

  function _renderComments() {
    const list = document.getElementById('piv-comments-list');
    if (!list) return;
    list.replaceChildren();

    Object.values(_comments).forEach(c => {
      const card = document.createElement('div');
      card.className = `piv-comment-card${c.resolved ? ' resolved' : ''}`;
      card.id = `piv-comment-${c.commentId}`;

      const repliesHtml = c.replies.length ? `
        <div class="piv-reply-list">
          ${c.replies.map(r => `
            <div class="piv-reply">
              <div class="piv-reply-dot" style="background:${_escapeAttr(r.color)}"></div>
              <div><strong style="color:${_escapeAttr(r.color)}">${_escapeHtml(r.nickname)}</strong>: ${_escapeHtml(r.text)}</div>
            </div>
          `).join('')}
        </div>
      ` : '';

      _setSafeInner(card, `
        <div class="piv-comment-header">
          <div class="piv-comment-dot" style="background:${_escapeAttr(c.color)}"></div>
          <div class="piv-comment-meta">${_escapeHtml(c.nickname)}</div>
          <span class="piv-comment-sym">${_escapeHtml(c.symbolName)}</span>
          ${c.lineNumber != null ? `<span class="piv-comment-sym">שורה ${c.lineNumber}</span>` : ''}
        </div>
        <div class="piv-comment-text">${_escapeHtml(c.text)}</div>
        ${repliesHtml}
        <div class="piv-reply-input-wrap">
          <input class="piv-reply-input" placeholder="השב..." data-comment="${_escapeAttr(c.commentId)}">
          <button class="piv-reply-send" data-comment="${_escapeAttr(c.commentId)}">שלח</button>
        </div>
        <div class="piv-comment-actions">
          ${c.resolved
            ? `<button class="piv-comment-action" data-unresolve="${_escapeAttr(c.commentId)}">פתח מחדש</button>`
            : `<button class="piv-comment-action" data-resolve="${_escapeAttr(c.commentId)}">✓ סמן כפתור</button>`
          }
        </div>
      `);
      list.appendChild(card);
    });

    // Wire resolve/unresolve/reply
    list.querySelectorAll('[data-resolve]').forEach(btn => {
      btn.addEventListener('click', () => _resolveComment(btn.dataset.resolve));
    });
    list.querySelectorAll('[data-unresolve]').forEach(btn => {
      btn.addEventListener('click', () => _unresolveComment(btn.dataset.unresolve));
    });
    list.querySelectorAll('.piv-reply-send').forEach(btn => {
      btn.addEventListener('click', () => {
        const cid = btn.dataset.comment;
        const inp = list.querySelector(`.piv-reply-input[data-comment="${cid}"]`);
        if (inp && inp.value.trim()) {
          _sendReply(cid, inp.value.trim());
          inp.value = '';
        }
      });
    });
  }

  // ─── Chat rendering ───────────────────────────────────────────────────────

  function _renderChat() {
    const msgs = document.getElementById('piv-chat-msgs');
    if (!msgs) return;
    msgs.replaceChildren();
    _chatMessages.forEach(m => _appendChatMessage(m));
  }

  function _appendChatMessage(m) {
    const msgs = document.getElementById('piv-chat-msgs');
    if (!msgs) return;
    const div = document.createElement('div');
    div.className = 'piv-chat-msg';
    const letter = (m.nickname || '?')[0];
    // formattedText is already escaped via _escapeHtml on m.text BEFORE
    // the @mention span is injected, so the spans pass through
    // SafeDOM as legitimate markup.
    const formattedText = _escapeHtml(m.text).replace(/@(\S+)/g,
      '<span class="piv-chat-mention">@$1</span>');
    _setSafeInner(div, `
      <div class="piv-feed-avatar" style="background:${_escapeAttr(m.color || '#4b5568')}">${_escapeHtml(letter)}</div>
      <div class="piv-chat-msg-body">
        <div class="piv-chat-msg-name" style="color:${_escapeAttr(m.color)}">${_escapeHtml(m.nickname)}</div>
        <div class="piv-chat-msg-text">${formattedText}</div>
        <div class="piv-chat-msg-time">${_timeAgo(m.timestamp || 0)}</div>
      </div>
    `);
    msgs.appendChild(div);
    msgs.scrollTop = msgs.scrollHeight;
  }

  // ─── @ mention handling ───────────────────────────────────────────────────

  function _handleMentionInput(e) {
    const input = e.target;
    const val   = input.value;
    const atIdx = val.lastIndexOf('@');
    const dropdown = document.getElementById('piv-mention-dropdown');
    if (!dropdown) return;

    if (atIdx === -1 || atIdx < val.length - 15) {
      dropdown.style.display = 'none';
      return;
    }

    const query = val.slice(atIdx + 1).toLowerCase();
    const matches = Object.values(_users).filter(
      u => u.userId !== _userId && u.nickname.toLowerCase().includes(query)
    );

    if (!matches.length) { dropdown.style.display = 'none'; return; }

    dropdown.className = 'piv-mention-list';
    dropdown.style.display = 'block';
    _setSafeInner(dropdown, matches.slice(0, 5).map(u => `
      <div class="piv-mention-item" data-nick="${_escapeAttr(u.nickname)}">
        <div class="piv-mention-dot" style="background:${_escapeAttr(u.color)}"></div>
        ${_escapeHtml(u.nickname)}
      </div>
    `).join(''));

    dropdown.querySelectorAll('.piv-mention-item').forEach(item => {
      item.addEventListener('click', () => {
        const nick = item.dataset.nick;
        input.value = val.slice(0, atIdx) + '@' + nick + ' ';
        dropdown.style.display = 'none';
        input.focus();
      });
    });
  }

  function _sendChat() {
    const input = document.getElementById('piv-chat-input');
    if (!input) return;
    const text = input.value.trim();
    if (!text || !_connected) return;

    // extract @mentions
    const mentions = [];
    const re = /@(\S+)/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const nick = m[1];
      const found = Object.values(_users).find(u => u.nickname === nick);
      if (found) mentions.push(found.userId);
    }

    _send({ type: 'chat', payload: { text, mentions } });
    input.value = '';

    const dropdown = document.getElementById('piv-mention-dropdown');
    if (dropdown) dropdown.style.display = 'none';
  }

  // ─── WebSocket ────────────────────────────────────────────────────────────

  function _connect(roomId, nickname) {
    _roomId = roomId;
    _nickname = nickname;

    const identity = _loadIdentity();
    const color = (identity && identity.nickname === nickname) ? identity.color : null;

    const url = `${WS_BASE}/ws/collab/${encodeURIComponent(roomId)}`;
    logger.log(`[Collab] מתחבר: ${url}`);

    _ws = new WebSocket(url);

    _ws.onopen = () => {
      logger.log('[Collab] WebSocket פתוח');
      _reconnectAttempts = 0;
      // שלח join
      _send({ type: 'join', payload: { nickname, color } });
    };

    _ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        _handleMessage(msg);
      } catch(err) {
        logger.warn('[Collab] הודעה לא תקינה:', err);
      }
    };

    _ws.onclose = (e) => {
      _connected = false;
      _updateConnectionStatus(false);
      logger.log('[Collab] WebSocket נסגר — קוד:', e.code);

      if (e.code !== 1000 && e.code !== 4003 && _reconnectAttempts < MAX_RECONNECT) {
        const delay = RECONNECT_DELAYS[_reconnectAttempts] || 7000;
        _reconnectAttempts++;
        logger.log(`[Collab] ניסיון חיבור מחדש ${_reconnectAttempts}/${MAX_RECONNECT} בעוד ${delay}ms`);
        _showToast(`מנסה להתחבר מחדש... (${_reconnectAttempts}/${MAX_RECONNECT})`, '#f59e0b');
        _reconnectTimer = setTimeout(() => _connect(roomId, nickname), delay);
      } else if (_reconnectAttempts >= MAX_RECONNECT) {
        _showToast('החיבור לשרת שיתוף הפעולה נכשל', '#ef4444');
      }
    };

    _ws.onerror = (err) => {
      logger.warn('[Collab] שגיאת WebSocket:', err);
    };
  }

  function _send(obj) {
    if (_ws && _ws.readyState === WebSocket.OPEN) {
      _ws.send(JSON.stringify(obj));
    }
  }

  // ─── Message handler ──────────────────────────────────────────────────────

  function _handleMessage(msg) {
    switch (msg.type) {

      case 'joined': {
        const p = msg.payload;
        _userId    = p.userId;
        _nickname  = p.nickname;
        _color     = p.color;
        _connected = true;
        _saveIdentity(_nickname, _color);
        _updateConnectionStatus(true);

        // load room state
        if (p.room && p.room.users) {
          _users = {};
          p.room.users.forEach(u => { _users[u.userId] = u; });
        }
        if (p.room && p.room.symbolLocks) {
          _locks = p.room.symbolLocks;
        }
        if (p.room && p.room.recentActivity) {
          _activities = p.room.recentActivity;
        }
        if (p.comments) {
          _comments = {};
          p.comments.forEach(c => { _comments[c.commentId] = c; });
        }

        _updatePresenceBar();
        _showToast(`הצטרפת לחדר "${_roomId}" בתור ${_nickname}`, _color);
        _startPresenceHeartbeat();
        break;
      }

      case 'user_joined': {
        const p = msg.payload;
        _users = {};
        p.roomUsers.forEach(u => { _users[u.userId] = u; });
        _updatePresenceBar();
        _showToast(`${p.user.nickname} הצטרף לחדר`, p.user.color);

        const act = {
          type: 'join',
          userId: p.user.userId,
          nickname: p.user.nickname,
          color: p.user.color,
          text: `${p.user.nickname} הצטרף לחדר`,
          timestamp: Date.now() / 1000,
        };
        _pushActivity(act);
        break;
      }

      case 'user_left': {
        const p = msg.payload;
        const who = _users[p.userId];
        _users = {};
        p.roomUsers.forEach(u => { _users[u.userId] = u; });
        _updatePresenceBar();
        if (who) {
          _showToast(`${p.nickname} עזב את החדר`, '#6b7280');
          _pushActivity({
            type: 'leave',
            userId: p.userId,
            nickname: p.nickname,
            color: who.color,
            text: `${p.nickname} עזב את החדר`,
            timestamp: Date.now() / 1000,
          });
        }
        break;
      }

      case 'presence_update': {
        const u = msg.payload;
        if (_users[u.userId]) {
          _users[u.userId] = Object.assign(_users[u.userId], u);
        } else {
          _users[u.userId] = u;
        }
        _updatePresenceBar();
        break;
      }

      case 'activity': {
        const act = msg.payload;
        _pushActivity(act);
        _showToast(act.text || 'פעילות חדשה', act.color);
        break;
      }

      case 'comment_added': {
        const c = msg.payload;
        _comments[c.commentId] = c;
        _pushActivity({
          type: 'comment',
          userId: c.userId,
          nickname: c.nickname,
          color: c.color,
          text: `${c.nickname} הוסיף הערה על ${c.symbolName}`,
          timestamp: Date.now() / 1000,
        });
        _showToast(`הערה חדשה על ${c.symbolName}`, c.color);
        if (_activityPanelOpen) _renderComments();
        _applyCommentDots();
        break;
      }

      case 'comment_reply': {
        const { commentId, reply } = msg.payload;
        if (_comments[commentId]) {
          _comments[commentId].replies.push(reply);
          if (_activityPanelOpen) _renderComments();
        }
        break;
      }

      case 'comment_resolved': {
        if (_comments[msg.payload.commentId]) {
          _comments[msg.payload.commentId].resolved = true;
          if (_activityPanelOpen) _renderComments();
        }
        break;
      }

      case 'comment_unresolved': {
        if (_comments[msg.payload.commentId]) {
          _comments[msg.payload.commentId].resolved = false;
          if (_activityPanelOpen) _renderComments();
        }
        break;
      }

      case 'symbol_locked': {
        const l = msg.payload;
        _locks[l.symbolName] = l;
        _applyLockIndicators();
        if (l.userId !== _userId) {
          _showToast(`${l.nickname} ננעל לעריכה: ${l.symbolName}`, '#f59e0b');
        }
        break;
      }

      case 'symbol_unlocked': {
        delete _locks[msg.payload.symbolName];
        _applyLockIndicators();
        break;
      }

      case 'lock_denied': {
        const p = msg.payload;
        _showToast(`הסמל "${p.symbolName}" כבר נעול על ידי ${p.lockedBy}`, '#ef4444');
        break;
      }

      case 'chat': {
        const m = msg.payload;
        _chatMessages.push(m);
        if (_chatMessages.length > 200) _chatMessages.shift();
        _appendChatMessage(m);

        // toast if mentions me or panel is closed
        if (!_activityPanelOpen || document.querySelector('.piv-tab[data-tab="chat"]:not(.active)')) {
          _showToast(`${m.nickname}: ${m.text.slice(0, 60)}`, m.color);
        }
        break;
      }

      case 'error': {
        _showToast(`שגיאה: ${msg.message || ''}`, '#ef4444');
        break;
      }
    }
  }

  // ─── Presence heartbeat ───────────────────────────────────────────────────

  function _startPresenceHeartbeat() {
    clearInterval(_presenceTimer);
    _presenceTimer = setInterval(() => {
      if (_connected) {
        _send({
          type: 'presence',
          payload: {
            mode:   _currentMode,
            symbol: _currentSymbol,
          },
        });
      }
    }, PRESENCE_INTERVAL);
  }

  // ─── Activity buffer ──────────────────────────────────────────────────────

  function _pushActivity(act) {
    _activities.push(act);
    if (_activities.length > 200) _activities.shift();
    if (_activityPanelOpen) _renderActivityFeed();
  }

  // ─── Symbol lock UI indicators ────────────────────────────────────────────

  function _applyLockIndicators() {
    // Remove old lock badges
    document.querySelectorAll('.piv-lock-badge').forEach(el => el.remove());

    Object.entries(_locks).forEach(([symName, lock]) => {
      if (lock.userId === _userId) return; // own locks not highlighted

      // Find elements that display this symbol name (command palette, emulator)
      const candidates = document.querySelectorAll(
        `[data-symbol="${symName}"], [data-sym="${symName}"], .sym-item[data-name="${symName}"]`
      );
      candidates.forEach(el => {
        const badge = document.createElement('span');
        badge.className = 'piv-lock-badge';
        _setSafeInner(badge, `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2"/>
            <path d="M7 11V7a5 5 0 0110 0v4"/>
          </svg>
          נערך על ידי ${_escapeHtml(lock.nickname)}
        `);
        el.style.outline = '2px solid rgba(245,158,11,0.45)';
        el.appendChild(badge);
      });
    });
  }

  // ─── Comment dot indicators ───────────────────────────────────────────────

  function _applyCommentDots() {
    document.querySelectorAll('.piv-comment-indicator').forEach(el => el.remove());

    const bySymbol = {};
    Object.values(_comments).filter(c => !c.resolved).forEach(c => {
      (bySymbol[c.symbolName] = bySymbol[c.symbolName] || []).push(c);
    });

    Object.entries(bySymbol).forEach(([symName, comments]) => {
      const candidates = document.querySelectorAll(
        `[data-symbol="${symName}"], [data-sym="${symName}"], .sym-item[data-name="${symName}"]`
      );
      candidates.forEach(el => {
        const dot = document.createElement('span');
        dot.className = 'piv-comment-indicator';
        dot.style.cssText = `
          display:inline-block;width:7px;height:7px;border-radius:50%;
          background:#f59e0b;margin-right:4px;vertical-align:middle;
          cursor:pointer;
        `;
        dot.title = `${comments.length} הערות`;
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          _openPanel();
          _switchTab('comments');
        });
        el.prepend(dot);
      });
    });
  }

  // ─── Comment actions ──────────────────────────────────────────────────────

  function _resolveComment(commentId) {
    _send({ type: 'comment', payload: { subtype: 'resolve', commentId } });
    if (_comments[commentId]) {
      _comments[commentId].resolved = true;
      _renderComments();
    }
  }

  function _unresolveComment(commentId) {
    _send({ type: 'comment', payload: { subtype: 'unresolve', commentId } });
    if (_comments[commentId]) {
      _comments[commentId].resolved = false;
      _renderComments();
    }
  }

  function _sendReply(commentId, text) {
    _send({ type: 'comment', payload: { subtype: 'reply', commentId, text } });
  }

  // ─── App event integration ────────────────────────────────────────────────

  function _setupAppEventListeners() {
    // Mode changes
    document.addEventListener('piv:mode-change', (e) => {
      _currentMode = e.detail?.mode;
      if (_connected) {
        _send({
          type: 'activity',
          payload: {
            activityType: 'mode',
            text: `${_nickname} עבר למצב: ${_currentMode || 'לא ידוע'}`,
          },
        });
      }
    });

    // QA results
    document.addEventListener('piv:qa-complete', (e) => {
      const d = e.detail || {};
      if (_connected) {
        _send({
          type: 'qa_result',
          payload: {
            symbolName:   d.symbolName || '',
            errorCount:   d.errorCount || 0,
            warnCount:    d.warnCount || 0,
            scannedCount: d.scannedCount || 0,
            text: `${_nickname} סרק ${d.scannedCount || 0} סמלים — ${d.errorCount || 0} שגיאות`,
          },
        });
      }
    });

    // Symbol viewing
    document.addEventListener('piv:symbol-view', (e) => {
      _currentSymbol = e.detail?.symbolName;
      if (_connected) {
        _send({
          type: 'presence',
          payload: { mode: _currentMode, symbol: _currentSymbol },
        });
      }
    });

    // AI chat messages
    document.addEventListener('piv:ai-message', (e) => {
      const d = e.detail || {};
      if (_connected) {
        _send({
          type: 'activity',
          payload: {
            activityType: 'ai',
            text: `${_nickname} שאל את ה-AI: ${(d.text || '').slice(0, 80)}`,
          },
        });
      }
    });

    // Agent tasks
    document.addEventListener('piv:agent-task', (e) => {
      const d = e.detail || {};
      if (_connected) {
        _send({
          type: 'activity',
          payload: {
            activityType: 'agent',
            text: `${_nickname} הפעיל משימת סוכן: ${d.task || ''}`,
          },
        });
      }
    });
  }

  // ─── Keyboard shortcut ────────────────────────────────────────────────────

  function _setupKeyboardShortcut() {
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        _togglePanel();
      }
    });
  }

  // ─── Utility ──────────────────────────────────────────────────────────────

  function _escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _escapeAttr(s) {
    return String(s).replace(/"/g, '&quot;');
  }

  // minimal logger — avoids console pollution in production
  const logger = {
    log:  (...a) => console.log('[PIV-Collab]', ...a),
    warn: (...a) => console.warn('[PIV-Collab]', ...a),
  };

  // ─── Init ─────────────────────────────────────────────────────────────────

  function _init() {
    _injectCSS();
    _buildPresenceBar();
    _buildActivityPanel();
    _buildToastContainer();
    _setupKeyboardShortcut();
    _setupAppEventListeners();
    logger.log('מוכן — לחץ Ctrl+Shift+A לפאנל שיתוף פעולה');
  }

  // Run after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // ─── Public API ───────────────────────────────────────────────────────────

  const _collab = {
    /**
     * התחבר לחדר שיתוף פעולה
     * @param {string} roomId  - מזהה חדר
     * @param {string} nickname - שם תצוגה
     */
    connect(roomId, nickname) {
      if (_ws && _ws.readyState === WebSocket.OPEN) {
        logger.warn('כבר מחובר — מתנתק תחילה');
        this.disconnect();
      }
      _connect(roomId, nickname);
    },

    /**
     * התנתק מהחדר
     */
    disconnect() {
      clearInterval(_presenceTimer);
      clearTimeout(_reconnectTimer);
      _reconnectAttempts = MAX_RECONNECT; // prevent auto-reconnect
      if (_ws) {
        _send({ type: 'leave', payload: {} });
        _ws.close(1000, 'disconnect');
        _ws = null;
      }
      _connected = false;
      _updateConnectionStatus(false);
    },

    /**
     * בדיקת מצב חיבור
     */
    isConnected() { return _connected; },

    /**
     * הצגת דיאלוג הצטרפות
     */
    showJoinDialog() {
      _buildJoinDialog((room, nick) => {
        this.connect(room, nick);
      });
    },

    /**
     * הוסף הערה על סמל
     * @param {string} symbolName - שם הסמל
     * @param {number|null} lineNumber - מספר שורה (אופציונלי)
     * @param {string} text - טקסט ההערה
     */
    addComment(symbolName, lineNumber, text) {
      if (!_connected) {
        _showToast('יש להתחבר תחילה כדי להוסיף הערות', '#ef4444');
        return;
      }
      _send({
        type: 'comment',
        payload: { subtype: 'add', symbolName, lineNumber, text },
      });
    },

    /**
     * נעל סמל לעריכה
     * @param {string} symbolName
     */
    lockSymbol(symbolName) {
      _send({ type: 'symbol_lock', payload: { symbolName } });
    },

    /**
     * שחרר נעילת סמל
     * @param {string} symbolName
     */
    unlockSymbol(symbolName) {
      _send({ type: 'symbol_unlock', payload: { symbolName } });
    },

    /**
     * שדר פעילות כללית
     * @param {string} activityType - סוג הפעילות
     * @param {string} text - תיאור
     * @param {object} data - נתונים נוספים
     */
    broadcastActivity(activityType, text, data) {
      _send({ type: 'activity', payload: { activityType, text, data: data || {} } });
    },

    /**
     * עדכון סמל שנצפה כרגע
     */
    setCurrentSymbol(symbolName) {
      _currentSymbol = symbolName;
      document.dispatchEvent(new CustomEvent('piv:symbol-view', { detail: { symbolName } }));
    },

    /**
     * פתח / סגור פאנל
     */
    togglePanel: _togglePanel,
    openPanel:   _openPanel,
    closePanel:  _closePanel,

    /**
     * הצג toast
     */
    showToast: _showToast,

    // Getters
    get users() { return { ..._users }; },
    get comments() { return { ..._comments }; },
    get locks() { return { ..._locks }; },
    get myUserId() { return _userId; },
    get myNickname() { return _nickname; },
    get myColor() { return _color; },
    get roomId() { return _roomId; },
  };

  return _collab;

})();
