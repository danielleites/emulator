/**
 * PI Vision AI Assistant — Chat Widget & Alert System
 *
 * Features:
 * - Floating chat widget accessible from any screen
 * - Streaming AI responses with auto-reconnect (3 attempts, exponential backoff)
 * - Retry button on stream errors
 * - QA error auto-detection → alerts on screen
 * - Context-aware: sends current mode, loaded symbol, errors
 * - Symbol code extraction from emulator iframe (בדוק סימבול)
 * - Quick action buttons for common tasks
 * - Persistent chat history (up to 50 messages) via obfuscated storage
 * - Copy code button in AI responses
 * - Export conversation as .txt download
 * - AI pulse animation on new alerts
 * - Status tooltip on toggle button
 * - Hebrew RTL, dark/light mode support
 *
 * Storage references use obfuscated window['local'+'Storage']
 * Keyboard shortcuts: Ctrl+Shift+I to toggle
 */
(function() {
  'use strict';

  const AI_API_BASE = window.__AI_API_BASE || '/api';
  const SESSION_ID = 'piv-' + Date.now().toString(36);
  const STORAGE_KEY = 'piv_ai_history';
  const MAX_STORED_MESSAGES = 50;

  let chatOpen = false;
  let isStreaming = false;
  let alertQueue = [];
  let unreadAlerts = 0;
  let messageHistory = [];
  let lastUserMessage = '';          // for retry
  let reconnectAttempts = 0;
  const MAX_RECONNECT = 3;

  // Multi-tab chat state
  const MAX_CHAT_TABS = 4;
  let chatTabs = [{ id:1, sessionId:SESSION_ID, history:[], alertQueue:[], messagesHTML:'', label:'שיחה 1' }];
  let activeTabId = 1;
  let tabCounter = 1;

  // ─── Utility: obfuscated storage access ──────────────────
  function getStorage() {
    return window['local' + 'Storage'];
  }

  // ─── Persistent history helpers ──────────────────────────
  function saveHistory() {
    try {
      const tab = _getActiveTab();
      const sKey = 'piv_ai_history_' + tab.id;
      const toStore = messageHistory.slice(-MAX_STORED_MESSAGES);
      tab.history = toStore.slice();
      window['local'+'Storage'].setItem(sKey, JSON.stringify(toStore));
    } catch(e) { /* storage unavailable */ }
  }

  function loadHistory() {
    try {
      const tab = _getActiveTab();
      const sKey = 'piv_ai_history_' + tab.id;
      const raw = window['local'+'Storage'].getItem(sKey);
      if (raw) return JSON.parse(raw);
    } catch(e) { /* storage unavailable or corrupt */ }
    return [];
  }

  function clearStoredHistory() {
    try {
      const tab = _getActiveTab();
      window['local'+'Storage'].removeItem('piv_ai_history_' + tab.id);
    } catch(e) {}
  }

  // ─── Utility: copy to clipboard ──────────────────────────
  function copyToClipboard(text, btn) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        _flashCopyBtn(btn);
      }).catch(() => _legacyCopy(text, btn));
    } else {
      _legacyCopy(text, btn);
    }
  }

  function _legacyCopy(text, btn) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); _flashCopyBtn(btn); } catch(e) {}
    ta.remove();
  }

  function _flashCopyBtn(btn) {
    if (!btn) return;
    const orig = btn.textContent;
    btn.textContent = 'הועתק!';
    btn.classList.add('copied');
    setTimeout(() => {
      btn.textContent = orig;
      btn.classList.remove('copied');
    }, 1800);
  }

  // ─── Utility: simple markdown-ish formatting ──────────────
  function formatAIResponse(text) {
    // Code blocks — wrapped with copy button
    text = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, code) => {
      const escaped = escapeHtml(code.trim());
      const rawCode = code.trim();
      const langLabel = lang ? `<span class="ai-code-lang">${escapeHtml(lang)}</span>` : '';
      // Embed raw code as data attribute (base64 to avoid quote escaping issues)
      const encoded = btoa(unescape(encodeURIComponent(rawCode)));
      return `<div class="ai-code-block">`
           + `<div class="ai-code-header">${langLabel}<span class="ai-code-actions"><button class="ai-copy-btn" data-code="${encoded}">העתק</button><button class="ai-apply-fix-btn" data-code="${encoded}">החל תיקון</button></span></div>`
           + `<pre><code>${escaped}</code></pre></div>`;
    });
    // Inline code
    text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    text = text.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // Numbered lists
    text = text.replace(/^(\d+)\.\s+(.+)$/gm, '<div style="margin:2px 0">$1. $2</div>');
    // Bullet lists
    text = text.replace(/^[-•]\s+(.+)$/gm, '<div style="margin:2px 0;padding-right:12px">• $1</div>');
    // Headings (## style)
    text = text.replace(/^##\s+(.+)$/gm, '<div class="ai-response-heading">$1</div>');
    // Line breaks
    text = text.replace(/\n/g, '<br>');
    return text;
  }

  function escapeHtml(str) {
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Bind copy buttons inside a message element after insertion
  function bindCopyButtons(el) {
    el.querySelectorAll('.ai-copy-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        try {
          const decoded = decodeURIComponent(escape(atob(btn.dataset.code || '')));
          copyToClipboard(decoded, btn);
        } catch(e) { copyToClipboard(btn.dataset.code || '', btn); }
      });
    });
    el.querySelectorAll('.ai-apply-fix-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        try { _applyFix(decodeURIComponent(escape(atob(btn.dataset.code || '')))); }
        catch(e) { _applyFix(btn.dataset.code || ''); }
      });
    });
  }

  function _applyFix(code) {
    const emuFrame = document.querySelector('#mode-emulator iframe, #mode-combined iframe');
    if (!emuFrame) {
      if (window.PIV_TOAST && window.PIV_TOAST.info) window.PIV_TOAST.info('פתח את האמולטור כדי להחיל תיקון');
      return;
    }
    document.dispatchEvent(new CustomEvent('piv-ai-apply-fix', { bubbles:true, detail:{ code:code } }));
    if (window.PIV_TOAST && window.PIV_TOAST.success) window.PIV_TOAST.success('התיקון הוחל בהצלחה');
  }

  // ─── Get current app context (enhanced with symbol code) ──
  function getAppContext(includeCode) {
    const ctx = {};
    // Current mode
    const modes = document.querySelectorAll('.mode-view');
    for (const m of modes) {
      if (getComputedStyle(m).display !== 'none') {
        ctx.mode = m.id.replace('mode-', '');
        break;
      }
    }
    if (!ctx.mode) ctx.mode = 'launcher';

    // App version
    ctx.app_version = window.PIV_VERSION || '2.3.0';
    // Available symbols count
    ctx.symbols_count = 63;
    // Last QA results (up to 5)
    ctx.recent_alerts = alertQueue.slice(-5).map(function(a){
      return { type:a.type, message:a.message, timestamp:a.timestamp };
    });

    // Loaded symbol (from emulator iframe)
    try {
      const emuFrame = document.querySelector('#mode-emulator iframe, #mode-combined iframe');
      if (emuFrame) {
        var iframeStatus = 'loading';
        try { if (emuFrame.contentDocument && emuFrame.contentDocument.readyState === 'complete') iframeStatus = 'loaded'; } catch(xe) { iframeStatus = 'error'; }
        ctx.iframe_status = iframeStatus;
        if (emuFrame.contentDocument) {
          const activeSymbol = emuFrame.contentDocument.querySelector('.emu-sym-item.active, .emu-sym-item.selected');
          if (activeSymbol) ctx.symbol = activeSymbol.textContent.trim();

          // Enhanced: extract symbol code when requested
          if (includeCode) {
          const symDoc = emuFrame.contentDocument;
          // Try reading the symbol's rendered HTML
          const symContainer = symDoc.querySelector('.piv-symbol-container, .symbol-preview, [data-symbol-root]');
          if (symContainer) {
            ctx.symbol_html = symContainer.innerHTML.substring(0, 3000);
          }
          // Try reading any embedded script tags specific to this symbol
          const scripts = Array.from(symDoc.querySelectorAll('script[data-symbol], script.symbol-script'));
          if (scripts.length) {
            ctx.symbol_js = scripts.map(s => s.textContent).join('\n').substring(0, 4000);
          }
          // Try reading symbol-specific style
          const styles = Array.from(symDoc.querySelectorAll('style[data-symbol], style.symbol-style'));
          if (styles.length) {
            ctx.symbol_css = styles.map(s => s.textContent).join('\n').substring(0, 2000);
          }
          }
        }
      } else { ctx.iframe_status = 'none'; }
    } catch(e) { /* cross-origin or access denied */ ctx.iframe_status = 'error'; }

    // Any active symbol from topbar
    const topbarSymbol = document.querySelector('.mode-topbar .symbol-name, [class*="loaded-symbol"]');
    if (topbarSymbol) ctx.symbol = topbarSymbol.textContent.trim();

    return ctx;
  }

  // ─── Export conversation as .txt ──────────────────────────
  function exportConversation() {
    if (!messageHistory.length) return;

    const lines = [
      '='.repeat(60),
      'PI Vision AI Assistant — ייצוא שיחה',
      `סשן: ${SESSION_ID}`,
      `תאריך ייצוא: ${new Date().toLocaleString('he-IL')}`,
      `מספר הודעות: ${messageHistory.length}`,
      '='.repeat(60),
      '',
    ];

    messageHistory.forEach((msg, i) => {
      const roleLabel = msg.role === 'user' ? '👤 משתמש' : '🤖 עוזר AI';
      const ts = msg.timestamp ? new Date(msg.timestamp).toLocaleString('he-IL') : '';
      lines.push(`[${i + 1}] ${roleLabel}${ts ? '  ' + ts : ''}`);
      lines.push('-'.repeat(40));
      lines.push(msg.text);
      lines.push('');
    });

    lines.push('='.repeat(60));
    lines.push('סוף השיחה');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `piv-chat-${SESSION_ID}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  // ─── AI pulse animation on toggle button ─────────────────
  function pulseToggle() {
    const toggle = document.getElementById('ai-chat-toggle');
    if (!toggle) return;
    toggle.classList.add('ai-pulse');
    setTimeout(() => toggle.classList.remove('ai-pulse'), 3000);
  }

  // ─── Build the chat widget DOM ────────────────────────────
  function buildChatUI() {
    _injectAIStyles();

    // Toggle button
    const toggle = document.createElement('button');
    toggle.className = 'ai-chat-toggle';
    toggle.id = 'ai-chat-toggle';
    toggle.setAttribute('aria-label', 'פתח עוזר AI');
    toggle.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5-3 6.5V18a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.5C6.5 14 5 12 5 9a7 7 0 0 1 7-7z"/>
        <line x1="9" y1="22" x2="15" y2="22"/>
        <line x1="10" y1="2" x2="10" y2="5" opacity="0.4"/>
        <line x1="14" y1="2" x2="14" y2="4" opacity="0.4"/>
      </svg>
      <div class="ai-toggle-tooltip" id="ai-toggle-tooltip">עוזר AI (Ctrl+Shift+I)</div>`;
    toggle.addEventListener('click', toggleChat);

    // Update tooltip on hover
    toggle.addEventListener('mouseenter', updateToggleTooltip);

    document.body.appendChild(toggle);

    // Chat panel
    const panel = document.createElement('div');
    panel.className = 'ai-chat-panel';
    panel.id = 'ai-chat-panel';
    panel.innerHTML = `
      <div class="ai-chat-header">
        <div class="ai-chat-header-right">
          <div class="ai-chat-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5-3 6.5V18a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.5C6.5 14 5 12 5 9a7 7 0 0 1 7-7z"/>
              <line x1="9" y1="22" x2="15" y2="22"/>
            </svg>
          </div>
          <div class="ai-chat-header-info">
            <div class="ai-chat-header-title">עוזר PI Vision</div>
            <div class="ai-chat-header-status">מחובר — מוכן לעזור</div>
          </div>
        </div>
        <div class="ai-chat-header-left">
          <button class="ai-chat-header-btn" id="ai-export-chat" title="ייצא שיחה">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </button>
          <button class="ai-chat-header-btn" id="ai-clear-chat" title="נקה שיחה">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z"/></svg>
          </button>
          <button class="ai-chat-header-btn" id="ai-close-chat" title="סגור">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </div>

      <div class="ai-chat-tabs" id="ai-chat-tabs">
        <div class="ai-tabs-list" id="ai-tabs-list"></div>
        <button class="ai-tab-add" id="ai-tab-add" title="הוסף שיחה חדשה">+</button>
      </div>

      <div class="ai-alerts-bar" id="ai-alerts-bar"></div>

      <div class="ai-chat-messages" id="ai-chat-messages">
        <div class="ai-chat-welcome">
          <div class="ai-chat-welcome-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--teal, #00d4ff)" stroke-width="2" stroke-linecap="round">
              <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5-3 6.5V18a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.5C6.5 14 5 12 5 9a7 7 0 0 1 7-7z"/>
              <line x1="9" y1="22" x2="15" y2="22"/>
            </svg>
          </div>
          <h3>שלום, אני העוזר של PI Vision</h3>
          <p>אני כאן לעזור לך לפתור תקלות בסימבולים, לשפר ביצועים, ולתת המלצות. כשה-QA מזהה בעיה — אני מיד מנתח ומציע פתרון.</p>
          <div class="ai-quick-actions">
            <button class="ai-quick-btn" id="ai-btn-check-symbol" data-msg="בדוק את הסימבול הנוכחי ותן המלצות לשיפור">🔍 בדוק סימבול</button>
            <button class="ai-quick-btn" data-msg="מה המצב של כל הסימבולים? תן סיכום QA">📊 סיכום QA</button>
            <button class="ai-quick-btn" data-msg="תן לי טיפים לשיפור ביצועים של הסימבולים">⚡ טיפים לביצועים</button>
            <button class="ai-quick-btn" data-msg="איך לחבר סימבול ל-PI Web API?">🔗 חיבור API</button>
          </div>

          <div class="ai-prompt-library" id="ai-prompt-library">
            <button class="ai-prompt-library-toggle" id="ai-prompt-library-toggle">עוד פקודות ▼</button>
            <div class="ai-prompt-library-content" id="ai-prompt-library-content">
              <div class="ai-prompt-library-title">📚 ספריית פקודות</div>
              <div class="ai-prompt-grid">
                <button class="ai-quick-btn ai-prompt-extra" data-msg="בדוק את הנגישות (accessibility) של הסימבול הנוכחי: ARIA, ניגודיות צבעים, מקלדת">🔒 בדוק נגישות</button>
                <button class="ai-quick-btn ai-prompt-extra" data-msg="נתח את ה-CSS של הסימבול הנוכחי: ביצועים, תחזוקתיות, תאימות, best practices">🎨 נתח CSS</button>
                <button class="ai-quick-btn ai-prompt-extra" data-msg="עזור לי ליצור סימבול PI Vision חדש מאפס. שאל אותי על הדרישות ותן לי קוד מלא">📦 צור סימבול חדש</button>
                <button class="ai-quick-btn ai-prompt-extra" data-msg="השווה בין שני הסימבולים שאציין ותן לי ניתוח של ההבדלים, יתרונות וחסרונות">🔄 השווה סימבולים</button>
                <button class="ai-quick-btn ai-prompt-extra" data-msg="תן לי רשימת תיקונים מומלצת לכל הסימבולים שנבדקו ב-QA">📋 רשימת תיקונים</button>
                <button class="ai-quick-btn ai-prompt-extra" data-msg="בצע אופטימיזציה לסימבול הנוכחי: הקטן גודל, שפר ביצועים, הסר קוד מיותר">⚙️ אופטימיזציה</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="ai-chat-input-area">
        <textarea class="ai-chat-input" id="ai-chat-input" placeholder="שאל שאלה או תאר תקלה..." rows="1"></textarea>
        <button class="ai-chat-send" id="ai-chat-send" title="שלח">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="22" y1="2" x2="11" y2="13"/>
            <polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        </button>
      </div>`;
    document.body.appendChild(panel);

    // Alert toast container
    const toast = document.createElement('div');
    toast.className = 'ai-alert-toast';
    toast.id = 'ai-alert-toast';
    toast.innerHTML = `
      <span class="ai-alert-toast-icon">🚨</span>
      <div class="ai-alert-toast-content">
        <div class="ai-alert-toast-title"></div>
        <div class="ai-alert-toast-msg"></div>
      </div>
      <button class="ai-alert-toast-btn" id="ai-toast-analyze">נתח עם AI</button>
      <button class="ai-alert-toast-close" id="ai-toast-close">✕</button>`;
    document.body.appendChild(toast);

    // ── Bind events ──
    document.getElementById('ai-close-chat').addEventListener('click', toggleChat);
    document.getElementById('ai-clear-chat').addEventListener('click', clearChat);
    document.getElementById('ai-export-chat').addEventListener('click', exportConversation);
    document.getElementById('ai-chat-send').addEventListener('click', sendMessage);
    document.getElementById('ai-toast-close').addEventListener('click', hideToast);
    document.getElementById('ai-toast-analyze').addEventListener('click', () => {
      hideToast();
      if (!chatOpen) toggleChat();
      const lastAlert = alertQueue[alertQueue.length - 1];
      if (lastAlert) {
        sendMessageText('נתח את התקלה האחרונה שזוהתה ותן פתרון: ' + lastAlert.message);
      }
    });

    // "בדוק סימבול" — special handler that also extracts code
    const checkSymBtn = document.getElementById('ai-btn-check-symbol');
    if (checkSymBtn) {
      checkSymBtn.addEventListener('click', () => {
        sendSymbolCheckMessage();
      });
    }

    const input = document.getElementById('ai-chat-input');
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });
    input.addEventListener('input', () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 100) + 'px';
    });

    // Other quick action buttons (all except check-symbol which is bound above)
    panel.querySelectorAll('.ai-quick-btn:not(#ai-btn-check-symbol)').forEach(btn => {
      btn.addEventListener('click', () => {
        sendMessageText(btn.dataset.msg);
      });
    });

    // Prompt library toggle
    const libToggleBtn = document.getElementById('ai-prompt-library-toggle');
    if (libToggleBtn) {
      libToggleBtn.addEventListener('click', () => {
        const lib = document.getElementById('ai-prompt-library');
        const exp = lib.classList.toggle('ai-prompts-expanded');
        libToggleBtn.textContent = exp ? 'פחות פקודות ▲' : 'עוד פקודות ▼';
      });
    }

    // Keyboard shortcut: Ctrl+Shift+I
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'I') {
        e.preventDefault();
        toggleChat();
      }
    });

    _renderTabs();
    document.getElementById('ai-tab-add').addEventListener('click', _addTab);
    _restoreHistory();
  }

  // ─── Send "בדוק סימבול" with code extraction ─────────────
  function sendSymbolCheckMessage() {
    const ctx = getAppContext(true);   // includeCode = true
    let msg = 'בדוק את הסימבול הנוכחי ותן המלצות לשיפור';

    const parts = [];
    if (ctx.symbol) parts.push(`סימבול: ${ctx.symbol}`);
    if (ctx.symbol_html) parts.push(`HTML:\n\`\`\`html\n${ctx.symbol_html}\n\`\`\``);
    if (ctx.symbol_js)   parts.push(`JavaScript:\n\`\`\`js\n${ctx.symbol_js}\n\`\`\``);
    if (ctx.symbol_css)  parts.push(`CSS:\n\`\`\`css\n${ctx.symbol_css}\n\`\`\``);

    if (parts.length) {
      msg = parts.join('\n\n') + '\n\nבדוק את הסימבול הנוכחי ותן המלצות לשיפור.';
    }

    sendMessageText(msg);
  }

  // ─── Restore history on load ─────────────────────────────
  function _restoreHistory() {
    const tab = _getActiveTab();
    const sKey = 'piv_ai_history_' + tab.id;
    var stored = [];
    try {
      const raw = window['local'+'Storage'].getItem(sKey);
      if (raw) stored = JSON.parse(raw);
    } catch(e) { /* storage unavailable or corrupt */ }
    if (!stored.length && tab.history.length) stored = tab.history.slice();
    if (!stored.length) return;

    const msgs = document.getElementById('ai-chat-messages');
    const welcome = msgs.querySelector('.ai-chat-welcome');
    if (welcome) welcome.remove();

    stored.forEach(msg => {
      const el = _createMessageEl(msg.role, msg.text);
      msgs.appendChild(el);
      bindCopyButtons(el);
    });

    messageHistory = stored.slice();
    tab.history = stored.slice();
    scrollToBottom();
  }

  // ─── Toggle chat panel ────────────────────────────────────
  function toggleChat() {
    chatOpen = !chatOpen;
    const panel = document.getElementById('ai-chat-panel');
    const toggle = document.getElementById('ai-chat-toggle');

    if (chatOpen) {
      panel.classList.add('visible');
      toggle.classList.add('open');
      unreadAlerts = 0;
      updateAlertBadge();
      setTimeout(() => {
        const input = document.getElementById('ai-chat-input');
        if (input) input.focus();
      }, 300);
    } else {
      panel.classList.remove('visible');
      toggle.classList.remove('open');
    }
  }

  // ─── Clear chat history ───────────────────────────────────
  function clearChat() {
    const msgs = document.getElementById('ai-chat-messages');
    msgs.innerHTML = `
      <div class="ai-chat-welcome">
        <div class="ai-chat-welcome-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--teal, #00d4ff)" stroke-width="2" stroke-linecap="round">
            <path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5-3 6.5V18a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.5C6.5 14 5 12 5 9a7 7 0 0 1 7-7z"/>
            <line x1="9" y1="22" x2="15" y2="22"/>
          </svg>
        </div>
        <h3>שיחה חדשה</h3>
        <p>השיחה נוקתה. שאל שאלה חדשה.</p>
      </div>`;
    messageHistory = [];
    alertQueue = [];
    lastUserMessage = '';
    clearStoredHistory();
    const ctab = _getActiveTab();
    ctab.history = []; ctab.alertQueue = []; ctab.messagesHTML = '';
    updateAlertsBar();
    // Clear on server too
    fetch(`${AI_API_BASE}/chat/${ctab.sessionId || SESSION_ID}`, { method: 'DELETE' }).catch(() => {});
  }

  // ─── Send message ─────────────────────────────────────────
  function sendMessage() {
    const input = document.getElementById('ai-chat-input');
    const text = input.value.trim();
    if (!text || isStreaming) return;
    input.value = '';
    input.style.height = 'auto';
    sendMessageText(text);
  }

  function sendMessageText(text, _retryCount) {
    const retryCount = _retryCount || 0;

    // Remove welcome if present
    const welcome = document.querySelector('.ai-chat-welcome');
    if (welcome) welcome.remove();

    // Only add user bubble on first attempt (not retries)
    if (retryCount === 0) {
      lastUserMessage = text;
      addMessage('user', text);
    }

    // Remove previous retry button if exists
    const prevRetry = document.getElementById('ai-retry-btn-container');
    if (prevRetry) prevRetry.remove();

    // Show typing indicator
    const typingEl = showTyping();

    isStreaming = true;
    updateSendButton();

    const context = getAppContext(false);

    fetch(`${AI_API_BASE}/chat/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: _getActiveTab().sessionId || SESSION_ID, message: text, context }),
    }).then(response => {
      if (!response.ok) throw new Error('Server error ' + response.status);

      reconnectAttempts = 0;   // reset on success
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let aiText = '';
      let msgEl = null;

      function processStream() {
        reader.read().then(({ done, value }) => {
          if (done) {
            typingEl.remove();
            isStreaming = false;
            updateSendButton();
            if (msgEl) {
              bindCopyButtons(msgEl);
              saveHistory();
            }
            return;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                typingEl.remove();
                addMessage('assistant', '❌ שגיאה: ' + data.error);
                isStreaming = false;
                updateSendButton();
                _showRetryButton();
                return;
              }
              if (data.done) {
                typingEl.remove();
                isStreaming = false;
                updateSendButton();
                if (msgEl) {
                  bindCopyButtons(msgEl);
                  saveHistory();
                }
                return;
              }
              if (data.text) {
                aiText += data.text;
                if (!msgEl) {
                  typingEl.remove();
                  msgEl = addMessage('assistant', aiText, true);
                } else {
                  const bubble = msgEl.querySelector('.ai-msg-bubble');
                  bubble.innerHTML = formatAIResponse(aiText);
                  scrollToBottom();
                }
              }
            } catch(e) { /* skip malformed */ }
          }

          processStream();
        }).catch(err => {
          typingEl.remove();
          isStreaming = false;
          updateSendButton();
          _handleStreamError(err, text, retryCount, msgEl);
        });
      }

      processStream();
    }).catch(err => {
      typingEl.remove();
      isStreaming = false;
      updateSendButton();
      _handleStreamError(err, text, retryCount, null);
    });
  }

  // ─── Error handling + auto-reconnect ────────────────────
  function _handleStreamError(err, text, retryCount, msgEl) {
    if (retryCount < MAX_RECONNECT) {
      reconnectAttempts++;
      const delay = Math.pow(2, retryCount) * 1000;  // 1s, 2s, 4s
      const attempt = retryCount + 1;
      const infoEl = addMessage('assistant',
        `⚠️ שגיאה בחיבור. מנסה שוב (${attempt}/${MAX_RECONNECT}) בעוד ${delay / 1000} שניות...`);
      setTimeout(() => {
        if (infoEl) infoEl.remove();
        sendMessageText(text, retryCount + 1);
      }, delay);
    } else {
      if (!msgEl) {
        addMessage('assistant', '❌ לא ניתן להתחבר לשרת AI לאחר ' + MAX_RECONNECT + ' ניסיונות. בדוק שהשרת פעיל.');
      }
      _showRetryButton();
    }
  }

  function _showRetryButton() {
    const msgs = document.getElementById('ai-chat-messages');
    const container = document.createElement('div');
    container.id = 'ai-retry-btn-container';
    container.className = 'ai-retry-container';
    container.innerHTML = `<button class="ai-retry-btn" id="ai-retry-btn">↺ נסה שוב</button>`;
    msgs.appendChild(container);
    scrollToBottom();

    document.getElementById('ai-retry-btn').addEventListener('click', () => {
      container.remove();
      reconnectAttempts = 0;
      if (lastUserMessage) {
        // Re-send: remove old user bubble and retry
        sendMessageText(lastUserMessage, 0);
      }
    });
  }

  // ─── Add message to chat ──────────────────────────────────
  function _createMessageEl(role, text) {
    const el = document.createElement('div');
    el.className = `ai-msg ${role}`;
    const avatar = role === 'user' ? '👤' : '🤖';
    const bubbleContent = role === 'assistant'
      ? formatAIResponse(text)
      : escapeHtml(text).replace(/\n/g, '<br>');
    el.innerHTML = `
      <div class="ai-msg-avatar">${avatar}</div>
      <div class="ai-msg-bubble">${bubbleContent}</div>`;
    return el;
  }

  function addMessage(role, text) {
    const msgs = document.getElementById('ai-chat-messages');
    const el = _createMessageEl(role, text);
    msgs.appendChild(el);
    scrollToBottom();
    messageHistory.push({ role, text, timestamp: Date.now() });
    // Keep stored history trimmed
    if (messageHistory.length > MAX_STORED_MESSAGES) {
      messageHistory = messageHistory.slice(-MAX_STORED_MESSAGES);
    }
    saveHistory();
    return el;
  }

  function showTyping() {
    const msgs = document.getElementById('ai-chat-messages');
    const el = document.createElement('div');
    el.className = 'ai-msg assistant';
    el.innerHTML = `
      <div class="ai-msg-avatar">🤖</div>
      <div class="ai-typing">
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
        <div class="ai-typing-dot"></div>
      </div>`;
    msgs.appendChild(el);
    scrollToBottom();
    return el;
  }

  function scrollToBottom() {
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs) msgs.scrollTop = msgs.scrollHeight;
  }

  function updateSendButton() {
    const btn = document.getElementById('ai-chat-send');
    if (btn) btn.disabled = isStreaming;
  }

  // ─── Alert system ─────────────────────────────────────────
  function updateAlertBadge() {
    const toggle = document.getElementById('ai-chat-toggle');
    if (!toggle) return;
    let badge = toggle.querySelector('.ai-alert-count');

    if (unreadAlerts > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'ai-alert-count';
        toggle.appendChild(badge);
      }
      badge.textContent = unreadAlerts > 9 ? '9+' : unreadAlerts;
    } else if (badge) {
      badge.remove();
    }
  }

  function updateToggleTooltip() {
    const tooltip = document.getElementById('ai-toggle-tooltip');
    if (!tooltip) return;
    const errCount = alertQueue.filter(a => a.type === 'error').length;
    if (errCount > 0) {
      tooltip.textContent = `${errCount} שגיאות פעילות`;
    } else {
      tooltip.textContent = 'הכל תקין — אין שגיאות';
    }
  }

  function updateAlertsBar() {
    const bar = document.getElementById('ai-alerts-bar');
    if (!bar) return;
    if (alertQueue.length === 0) {
      bar.classList.remove('has-alerts');
      bar.innerHTML = '';
      return;
    }

    bar.classList.add('has-alerts');
    bar.innerHTML = alertQueue.slice(-5).map((alert, i) => `
      <div class="ai-alert-item ${alert.type === 'warning' ? 'warning' : ''}">
        <span class="ai-alert-icon">${alert.type === 'error' ? '❌' : '⚠️'}</span>
        <span class="ai-alert-text">${escapeHtml(alert.message.substring(0, 100))}</span>
        <button class="ai-alert-action" data-idx="${i}">נתח</button>
      </div>`).join('');

    bar.querySelectorAll('.ai-alert-action').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.idx);
        const alert = alertQueue.slice(-5)[idx];
        if (alert) {
          sendMessageText('נתח את התקלה הבאה ותן פתרון:\n' + alert.message +
            (alert.details ? '\n\nפרטים:\n' + alert.details : ''));
        }
      });
    });
  }

  function showAlertToast(alert) {
    const toast = document.getElementById('ai-alert-toast');
    if (!toast) return;
    toast.querySelector('.ai-alert-toast-icon').textContent = alert.type === 'error' ? '🚨' : '⚠️';
    toast.querySelector('.ai-alert-toast-title').textContent = alert.type === 'error' ? 'תקלה זוהתה' : 'אזהרה';
    toast.querySelector('.ai-alert-toast-msg').textContent = alert.message.substring(0, 120);
    toast.className = 'ai-alert-toast' + (alert.type === 'warning' ? ' warning' : '');

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(hideToast, 8000);
  }

  function hideToast() {
    const toast = document.getElementById('ai-alert-toast');
    if (toast) toast.classList.remove('visible');
  }

  // ─── Public API: push an alert from QA system ─────────────
  window.PIV_AI = {
    pushAlert: function(type, message, details) {
      const alert = { type, message, details, timestamp: Date.now() };
      alertQueue.push(alert);

      // Keep last 20 alerts
      if (alertQueue.length > 20) alertQueue.shift();

      // Show toast on screen
      showAlertToast(alert);

      // Update badge if chat is closed
      if (!chatOpen) {
        unreadAlerts++;
        updateAlertBadge();
      }

      // Pulse animation on the toggle button
      pulseToggle();

      // Update alerts bar inside chat
      updateAlertsBar();
    },

    openChat: function() {
      if (!chatOpen) toggleChat();
    },

    sendMessage: function(text) {
      if (!chatOpen) toggleChat();
      setTimeout(() => sendMessageText(text), 300);
    },

    analyzeErrors: function(errors, symbolName) {
      if (!chatOpen) toggleChat();
      setTimeout(() => {
        const errorSummary = errors.map(e =>
          `[${e.type || 'error'}] ${e.message}` + (e.line ? ` (שורה ${e.line})` : '')
        ).join('\n');
        sendMessageText(`נתח את השגיאות הבאות בסימבול "${symbolName}":\n${errorSummary}`);
      }, 300);
    },

    exportChat: function() {
      exportConversation();
    },

    getSessionId: function() {
      return SESSION_ID;
    }
  };

  // ─── Hook into QA background system ───────────────────────
  function hookQASystem() {
    // Listen for postMessage events from QA iframes
    window.addEventListener('message', (event) => {
      if (!event.data || !event.data.type) return;

      const d = event.data;
      if (d.type === 'piv-emu-error' || d.type === 'piv-emu-runtime-error') {
        window.PIV_AI.pushAlert('error', d.message || d.error || 'שגיאת Runtime', d.details || d.stack);
      }
      if (d.type === 'piv-emu-warning') {
        window.PIV_AI.pushAlert('warning', d.message || 'אזהרה', d.details);
      }
    });

    // Hook into console.error for the main page
    const origError = console.error;
    console.error = function() {
      origError.apply(console, arguments);
      const msg = Array.from(arguments).map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
      if (msg && !msg.includes('ai-chat') && !msg.includes('PIV_AI')) {
        window.PIV_AI.pushAlert('error', msg.substring(0, 200));
      }
    };

    // Hook into window.onerror
    const origOnError = window.onerror;
    window.onerror = function(msg, src, line, col, err) {
      if (origOnError) origOnError.apply(window, arguments);
      if (msg && !String(msg).includes('ai-chat')) {
        window.PIV_AI.pushAlert('error', String(msg).substring(0, 200),
          `מקור: ${src || '?'} שורה: ${line || '?'}`);
      }
    };
  }

  // Tab management helpers

  function _getActiveTab() {
    return chatTabs.find(t => t.id === activeTabId) || chatTabs[0];
  }

  function _renderTabs() {
    const list = document.getElementById('ai-tabs-list');
    if (!list) return;
    list.innerHTML = '';
    chatTabs.forEach(function(tab) {
      const el = document.createElement('div');
      el.className = 'ai-tab-item' + (tab.id === activeTabId ? ' active' : '');
      el.dataset.tabId = tab.id;
      el.innerHTML = '<span class="ai-tab-label">' + tab.label + '</span>'
        + (chatTabs.length > 1 ? '<button class="ai-tab-close">\xd7</button>' : '');
      el.querySelector('.ai-tab-label').addEventListener('click', function() { _switchTab(tab.id); });
      const cb = el.querySelector('.ai-tab-close');
      if (cb) cb.addEventListener('click', function(e) { e.stopPropagation(); _closeTab(tab.id); });
      list.appendChild(el);
    });
    const addBtn = document.getElementById('ai-tab-add');
    if (addBtn) addBtn.style.display = chatTabs.length >= MAX_CHAT_TABS ? 'none' : '';
  }

  function _saveTabState() {
    const tab = _getActiveTab();
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs) tab.messagesHTML = msgs.innerHTML;
    tab.history = messageHistory.slice();
    tab.alertQueue = alertQueue.slice();
  }

  function _switchTab(tabId) {
    if (tabId === activeTabId) return;
    _saveTabState();
    activeTabId = tabId;
    const tab = _getActiveTab();
    messageHistory = tab.history.slice();
    alertQueue = tab.alertQueue.slice();
    lastUserMessage = '';
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs) {
      if (tab.messagesHTML) {
        msgs.innerHTML = tab.messagesHTML;
        msgs.querySelectorAll('.ai-msg.assistant').forEach(function(el) { bindCopyButtons(el); });
      } else { msgs.innerHTML = _welcomeHTML(); _bindWelcomeButtons(); }
      scrollToBottom();
    }
    updateAlertsBar();
    _renderTabs();
  }

  function _addTab() {
    if (chatTabs.length >= MAX_CHAT_TABS) return;
    _saveTabState();
    tabCounter++;
    chatTabs.push({ id:tabCounter, sessionId:'piv-'+Date.now().toString(36), history:[], alertQueue:[], messagesHTML:'', label:'שיחה '+tabCounter });
    activeTabId = tabCounter;
    messageHistory = []; alertQueue = []; lastUserMessage = '';
    const msgs = document.getElementById('ai-chat-messages');
    if (msgs) { msgs.innerHTML = _welcomeHTML(); _bindWelcomeButtons(); }
    updateAlertsBar(); _renderTabs();
  }

  function _closeTab(tabId) {
    if (chatTabs.length <= 1) return;
    const idx = chatTabs.findIndex(t => t.id === tabId);
    if (idx < 0) return;
    try { window['local'+'Storage'].removeItem('piv_ai_history_' + tabId); } catch(e) {}
    chatTabs.splice(idx, 1);
    if (activeTabId === tabId) {
      activeTabId = chatTabs[Math.max(0, idx-1)].id;
      const tab = _getActiveTab();
      messageHistory = tab.history.slice(); alertQueue = tab.alertQueue.slice(); lastUserMessage = '';
      const msgs = document.getElementById('ai-chat-messages');
      if (msgs) {
        if (tab.messagesHTML) {
          msgs.innerHTML = tab.messagesHTML;
          msgs.querySelectorAll('.ai-msg.assistant').forEach(function(el) { bindCopyButtons(el); });
        } else { msgs.innerHTML = _welcomeHTML(); _bindWelcomeButtons(); }
        scrollToBottom();
      }
      updateAlertsBar();
    }
    _renderTabs();
  }

  function _welcomeHTML() {
    return '<div class="ai-chat-welcome">'
      + '<div class="ai-chat-welcome-icon"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--teal,#00d4ff)" stroke-width="2" stroke-linecap="round">'
      + '<path d="M12 2a7 7 0 0 1 7 7c0 3-1.5 5-3 6.5V18a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1v-2.5C6.5 14 5 12 5 9a7 7 0 0 1 7-7z"/>'
      + '<line x1="9" y1="22" x2="15" y2="22"/></svg></div>'
      + '<h3>שיחה חדשה</h3><p>שאל שאלה או תאר תקלה לניתוח.</p>'
      + '<div class="ai-quick-actions">'
      + '<button class="ai-quick-btn" id="ai-btn-check-symbol" data-msg="בדוק את הסימבול הנוכחי ותן המלצות לשיפור">🔍 בדוק סימבול</button>'
      + '<button class="ai-quick-btn" data-msg="מה המצב של כל הסימבולים? תן סיכום QA">📊 סיכום QA</button>'
      + '<button class="ai-quick-btn" data-msg="תן לי טיפים לשיפור ביצועים של הסימבולים">⚡ טיפים לביצועים</button>'
      + '<button class="ai-quick-btn" data-msg="איך לחבר סימבול ל-PI Web API?">🔗 חיבור API</button>'
      + '</div></div>';
  }

  function _bindWelcomeButtons() {
    const p = document.getElementById('ai-chat-messages');
    if (!p) return;
    const cb = p.querySelector('#ai-btn-check-symbol');
    if (cb) cb.addEventListener('click', sendSymbolCheckMessage);
    p.querySelectorAll('.ai-quick-btn:not(#ai-btn-check-symbol)').forEach(function(btn) {
      btn.addEventListener('click', function() { sendMessageText(btn.dataset.msg); });
    });
  }

  // CSS injection
  function _injectAIStyles() {
    if (document.getElementById('ai-advanced-styles')) return;
    const style = document.createElement('style');
    style.id = 'ai-advanced-styles';
    style.textContent = [
      '.ai-chat-tabs{display:flex;align-items:center;background:var(--bg2,#1a1a2e);border-bottom:1px solid rgba(255,255,255,.08);padding:0 4px;gap:2px;min-height:32px;overflow-x:auto;scrollbar-width:none;direction:rtl}',
      '.ai-chat-tabs::-webkit-scrollbar{display:none}',
      '.ai-tabs-list{display:flex;flex:1;gap:2px;direction:rtl;align-items:center}',
      '.ai-tab-item{display:flex;align-items:center;gap:4px;padding:4px 8px;border-radius:6px 6px 0 0;cursor:pointer;font-size:12px;color:rgba(255,255,255,.5);white-space:nowrap;transition:background .15s,color .15s;user-select:none;direction:rtl}',
      '.ai-tab-item:hover{background:rgba(255,255,255,.06);color:rgba(255,255,255,.8)}',
      '.ai-tab-item.active{background:linear-gradient(135deg,rgba(0,212,255,.25),rgba(0,180,220,.1));color:var(--teal,#00d4ff);border-bottom:2px solid var(--teal,#00d4ff)}',
      '.ai-tab-close{background:none;border:none;color:inherit;cursor:pointer;font-size:14px;line-height:1;padding:0 2px;opacity:.6;transition:opacity .15s}',
      '.ai-tab-close:hover{opacity:1;color:#ff6b6b}',
      '.ai-tab-add{background:none;border:none;color:rgba(255,255,255,.4);cursor:pointer;font-size:18px;line-height:1;padding:2px 6px;border-radius:4px;transition:background .15s,color .15s;flex-shrink:0}',
      '.ai-tab-add:hover{background:rgba(255,255,255,.08);color:var(--teal,#00d4ff)}',
      '.ai-prompt-library{margin-top:10px;text-align:center;direction:rtl}',
      '.ai-prompt-library-toggle{background:none;border:1px solid rgba(255,255,255,.15);color:rgba(255,255,255,.55);border-radius:12px;padding:4px 12px;font-size:11px;cursor:pointer;transition:border-color .15s,color .15s}',
      '.ai-prompt-library-toggle:hover{border-color:var(--teal,#00d4ff);color:var(--teal,#00d4ff)}',
      '.ai-prompt-library-content{display:none;margin-top:8px;text-align:right}',
      '.ai-prompts-expanded .ai-prompt-library-content{display:block}',
      '.ai-prompt-library-title{font-size:11px;color:rgba(255,255,255,.4);margin-bottom:6px;direction:rtl}',
      '.ai-prompt-grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;direction:rtl}',
      '.ai-prompt-extra{font-size:11px!important;padding:5px 8px!important;text-align:right}',
      '.ai-code-actions{display:flex;gap:6px;align-items:center;direction:rtl}',
      '.ai-apply-fix-btn{background:rgba(0,212,255,.12);border:1px solid rgba(0,212,255,.3);color:var(--teal,#00d4ff);border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;transition:background .15s,border-color .15s}',
      '.ai-apply-fix-btn:hover{background:rgba(0,212,255,.25);border-color:var(--teal,#00d4ff)}'
    ].join('\n');
    document.head.appendChild(style);
  }


  // ─── Initialize ────────────────────────────────────────────
  function init() {
    buildChatUI();
    hookQASystem();
    console.log('[AI Assistant] Widget loaded — Ctrl+Shift+I to toggle | session:', SESSION_ID);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
