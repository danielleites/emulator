/**
 * qa-background.js — Silent Background QA Engine
 * Runs invisibly alongside the emulator, capturing:
 *  - Console errors/warnings from emulator iframe (via postMessage)
 *  - Runtime exceptions
 *  - User-reported feedback
 *  - Performance anomalies
 * 
 * Provides an overlay panel toggled by F10.
 */

'use strict';

const QABackground = (() => {

  // ─── State ──────────────────────────────────────────────────
  let _active = false;
  let _overlayVisible = false;
  let _overlayEl = null;
  let _logListEl = null;
  let _badgeEl = null;
  let _filterLevel = 'all';

  const _logs = [];     // { id, timestamp, level, source, message, details, symbolName }
  let _logId = 0;
  let _unreadCount = 0;

  // Stats
  const _stats = {
    errors: 0,
    warnings: 0,
    info: 0,
    userReports: 0,
    startTime: null,
    symbolsChecked: new Set()
  };

  // ─── Public API ─────────────────────────────────────────────

  function start() {
    if (_active) return;
    _active = true;
    _stats.startTime = Date.now();
    _unreadCount = 0;

    // Listen for emulator postMessages
    window.addEventListener('message', _handlePostMessage);

    // Capture local console errors
    window.addEventListener('error', _handleWindowError);
    window.addEventListener('unhandledrejection', _handleUnhandledRejection);

    // Build overlay (hidden initially)
    _buildOverlay();

    // F10 hotkey
    document.addEventListener('keydown', _handleKeyDown);

    _addLog('info', 'מערכת', 'בדיקת QA ברקע הופעלה');
  }

  function stop() {
    if (!_active) return;
    _active = false;

    window.removeEventListener('message', _handlePostMessage);
    window.removeEventListener('error', _handleWindowError);
    window.removeEventListener('unhandledrejection', _handleUnhandledRejection);
    document.removeEventListener('keydown', _handleKeyDown);

    if (_overlayEl && _overlayEl.parentNode) {
      _overlayEl.parentNode.removeChild(_overlayEl);
    }
    _overlayEl = null;
    _logListEl = null;
  }

  function isActive() { return _active; }

  function getLogs() { return [..._logs]; }

  function getStats() {
    return {
      ..._stats,
      symbolsChecked: _stats.symbolsChecked.size,
      totalLogs: _logs.length,
      uptime: _stats.startTime ? Date.now() - _stats.startTime : 0
    };
  }

  function addUserReport(message, symbolName = '') {
    _stats.userReports++;
    _addLog('user-report', 'משתמש', message, null, symbolName);
  }

  function toggleOverlay() {
    _overlayVisible = !_overlayVisible;
    if (_overlayEl) {
      _overlayEl.classList.toggle('qabg-visible', _overlayVisible);
      if (_overlayVisible) {
        _unreadCount = 0;
        _updateBadge();
        _renderLogs();
      }
    }
  }

  function showOverlay() {
    _overlayVisible = true;
    if (_overlayEl) {
      _overlayEl.classList.add('qabg-visible');
      _unreadCount = 0;
      _updateBadge();
      _renderLogs();
    }
  }

  function hideOverlay() {
    _overlayVisible = false;
    if (_overlayEl) _overlayEl.classList.remove('qabg-visible');
  }

  function clearLogs() {
    _logs.length = 0;
    _stats.errors = 0;
    _stats.warnings = 0;
    _stats.info = 0;
    _stats.userReports = 0;
    _unreadCount = 0;
    _updateBadge();
    _renderLogs();
  }

  // ─── Internal: Log Management ───────────────────────────────

  function _addLog(level, source, message, details = null, symbolName = '') {
    const entry = {
      id: ++_logId,
      timestamp: Date.now(),
      level,       // 'error' | 'warning' | 'info' | 'user-report'
      source,      // 'אמולטור' | 'F12' | 'Runtime' | 'מערכת' | 'משתמש'
      message,
      details,
      symbolName
    };

    _logs.unshift(entry); // newest first
    if (_logs.length > 500) _logs.pop(); // cap

    // Update stats
    if (level === 'error') _stats.errors++;
    else if (level === 'warning') _stats.warnings++;
    else if (level === 'info') _stats.info++;

    if (symbolName) _stats.symbolsChecked.add(symbolName);

    if (!_overlayVisible) {
      _unreadCount++;
      _updateBadge();
    } else {
      _renderLogs();
    }

    // Dispatch event for external listeners
    document.dispatchEvent(new CustomEvent('qa-background-log', { detail: entry }));
  }

  // ─── Internal: Event Handlers ───────────────────────────────

  function _handlePostMessage(event) {
    if (!event.data || typeof event.data !== 'object') return;
    const { type, payload } = event.data;

    switch (type) {
      case 'piv-emu-error':
        _addLog('error', 'אמולטור', payload?.message || 'שגיאה לא ידועה', payload, payload?.symbolName || '');
        break;

      case 'piv-emu-warning':
        _addLog('warning', 'אמולטור', payload?.message || 'אזהרה', payload, payload?.symbolName || '');
        break;

      case 'piv-emu-log':
        _addLog('info', 'אמולטור', payload?.message || 'הודעה', payload, payload?.symbolName || '');
        break;

      case 'piv-emu-console':
        // Direct console capture from emulator
        const lvl = payload?.level === 'error' ? 'error' : payload?.level === 'warn' ? 'warning' : 'info';
        _addLog(lvl, 'F12', payload?.message || '', payload, payload?.symbolName || '');
        break;

      case 'piv-emu-symbol-loaded':
        _addLog('info', 'אמולטור', `סמל נטען: ${payload?.symbolName || '?'}`, null, payload?.symbolName || '');
        _stats.symbolsChecked.add(payload?.symbolName);
        break;

      case 'piv-emu-runtime-error':
        _addLog('error', 'Runtime', payload?.message || 'שגיאת Runtime', payload, payload?.symbolName || '');
        break;
    }
  }

  function _handleWindowError(event) {
    _addLog('error', 'F12', event.message || 'שגיאה לא צפויה', {
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno
    });
  }

  function _handleUnhandledRejection(event) {
    const msg = event.reason?.message || String(event.reason) || 'Promise rejected';
    _addLog('error', 'F12', msg, { reason: String(event.reason) });
  }

  function _handleKeyDown(e) {
    if (e.key === 'F10') {
      e.preventDefault();
      toggleOverlay();
    }
  }

  // ─── Internal: Overlay UI ───────────────────────────────────

  function _buildOverlay() {
    if (_overlayEl) return;

    _overlayEl = document.createElement('div');
    _overlayEl.id = 'qa-bg-overlay';
    _overlayEl.className = 'qabg-overlay';
    _overlayEl.innerHTML = `
      <div class="qabg-panel">
        <div class="qabg-header">
          <div class="qabg-header-right">
            <svg width="20" height="20" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="36" height="36" rx="8" fill="#0f3460"/>
              <path d="M10 18 L15 23 L26 13" stroke="#00d4ff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span class="qabg-title">QA ברקע</span>
            <span class="qabg-hint">F10</span>
          </div>
          <div class="qabg-header-left">
            <div class="qabg-stats-mini">
              <span class="qabg-stat-error" id="qabg-stat-err">0</span>
              <span class="qabg-stat-warn" id="qabg-stat-warn">0</span>
              <span class="qabg-stat-info" id="qabg-stat-info">0</span>
            </div>
            <button class="qabg-btn" id="qabg-clear" title="נקה לוג">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5"/>
              </svg>
            </button>
            <button class="qabg-btn" id="qabg-close" title="סגור (F10)">
              <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M4 4l8 8M12 4l-8 8"/>
              </svg>
            </button>
          </div>
        </div>

        <div class="qabg-filters">
          <button class="qabg-filter active" data-level="all">הכל</button>
          <button class="qabg-filter" data-level="error">שגיאות</button>
          <button class="qabg-filter" data-level="warning">אזהרות</button>
          <button class="qabg-filter" data-level="info">מידע</button>
          <button class="qabg-filter" data-level="user-report">דיווחים</button>
        </div>

        <div class="qabg-user-report">
          <input type="text" id="qabg-report-input" class="qabg-report-input" 
                 placeholder="דווח על בעיה..." dir="rtl">
          <button class="qabg-report-btn" id="qabg-report-btn" title="שלח דיווח">
            <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M14 2L7 9M14 2l-5 12-2-5-5-2z"/>
            </svg>
          </button>
        </div>

        <div class="qabg-log-list" id="qabg-log-list">
          <div class="qabg-empty">אין רשומות עדיין — שגיאות ואזהרות יופיעו כאן</div>
        </div>
      </div>
    `;

    document.body.appendChild(_overlayEl);

    // Wire up events
    _overlayEl.querySelector('#qabg-close').addEventListener('click', hideOverlay);
    _overlayEl.querySelector('#qabg-clear').addEventListener('click', clearLogs);

    // Filters
    _overlayEl.querySelectorAll('.qabg-filter').forEach(btn => {
      btn.addEventListener('click', () => {
        _overlayEl.querySelectorAll('.qabg-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _filterLevel = btn.dataset.level;
        _renderLogs();
      });
    });

    // User report
    const reportInput = _overlayEl.querySelector('#qabg-report-input');
    const reportBtn = _overlayEl.querySelector('#qabg-report-btn');
    
    reportBtn.addEventListener('click', () => {
      const msg = reportInput.value.trim();
      if (msg) {
        addUserReport(msg);
        reportInput.value = '';
      }
    });

    reportInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        reportBtn.click();
      }
    });

    // Cache refs
    _logListEl = _overlayEl.querySelector('#qabg-log-list');

    // Build floating badge
    _buildBadge();
  }

  function _buildBadge() {
    _badgeEl = document.createElement('div');
    _badgeEl.id = 'qa-bg-badge';
    _badgeEl.className = 'qabg-badge';
    _badgeEl.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 36 36" fill="none">
        <path d="M18 6 L28 10 L28 18 C28 24 18 30 18 30 C18 30 8 24 8 18 L8 10 Z" stroke="#00d4ff" stroke-width="2" fill="rgba(0,212,255,0.1)"/>
        <path d="M13 18 L16 21 L23 14" stroke="#00d4ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      <span class="qabg-badge-count" id="qabg-badge-count" style="display:none">0</span>
    `;
    _badgeEl.title = 'QA ברקע — F10 לפתיחה';
    _badgeEl.addEventListener('click', toggleOverlay);
    document.body.appendChild(_badgeEl);
  }

  function _updateBadge() {
    const countEl = document.getElementById('qabg-badge-count');
    if (countEl) {
      if (_unreadCount > 0) {
        countEl.textContent = _unreadCount > 99 ? '99+' : _unreadCount;
        countEl.style.display = 'flex';
      } else {
        countEl.style.display = 'none';
      }
    }

    // Update mini stats in header
    const errEl = document.getElementById('qabg-stat-err');
    const warnEl = document.getElementById('qabg-stat-warn');
    const infoEl = document.getElementById('qabg-stat-info');
    if (errEl) errEl.textContent = _stats.errors;
    if (warnEl) warnEl.textContent = _stats.warnings;
    if (infoEl) infoEl.textContent = _stats.info;
  }

  function _renderLogs() {
    if (!_logListEl) return;

    const filtered = _filterLevel === 'all' 
      ? _logs 
      : _logs.filter(l => l.level === _filterLevel);

    if (filtered.length === 0) {
      _logListEl.innerHTML = '<div class="qabg-empty">אין רשומות' + 
        (_filterLevel !== 'all' ? ' בסינון זה' : ' עדיין') + '</div>';
      return;
    }

    _logListEl.innerHTML = filtered.slice(0, 200).map(log => {
      const time = new Date(log.timestamp);
      const timeStr = time.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const levelIcon = log.level === 'error' ? '❌' 
        : log.level === 'warning' ? '⚠️' 
        : log.level === 'user-report' ? '📝' 
        : 'ℹ️';
      const levelClass = `qabg-log-${log.level}`;

      return `
        <div class="qabg-log-entry ${levelClass}">
          <div class="qabg-log-meta">
            <span class="qabg-log-icon">${levelIcon}</span>
            <span class="qabg-log-time">${timeStr}</span>
            <span class="qabg-log-source">${_escHtml(log.source)}</span>
            ${log.symbolName ? `<span class="qabg-log-symbol">${_escHtml(log.symbolName)}</span>` : ''}
          </div>
          <div class="qabg-log-msg">${_escHtml(log.message)}</div>
          ${log.details ? `<pre class="qabg-log-details">${_escHtml(typeof log.details === 'string' ? log.details : JSON.stringify(log.details, null, 2))}</pre>` : ''}
        </div>
      `;
    }).join('');

    _updateBadge();
  }

  function _escHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Export ─────────────────────────────────────────────────

  return {
    start,
    stop,
    isActive,
    getLogs,
    getStats,
    addUserReport,
    toggleOverlay,
    showOverlay,
    hideOverlay,
    clearLogs
  };

})();

export default QABackground;
