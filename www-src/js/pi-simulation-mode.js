/**
 * pi-simulation-mode.js — Full PI Simulation Mode Manager
 * =========================================================
 * גרסה: 1.0.0  |  תאריך: 2026-03-29
 * namespace: window.PISimulationMode
 *
 * ═══════════════════════════════════════════════════════════════
 * תיאור:
 * ═══════════════════════════════════════════════════════════════
 * מנהל מצב ה-FULL SIMULATION — שכבת אינטגרציה שמחברת בין:
 *   - PIWebAPIMock    (pi-webapi-mock.js)
 *   - AFDataLayer     (af-data-layer.js)
 *   - PIV_CONNECTOR   (pi-connector.js)
 *
 * שלושה מצבי הפעלה:
 *   DEMO              — מצב ברירת מחדל קיים, נתוני mock פשוטים
 *   FULL_SIMULATION   — מדמה PI Web API מלא עם AF hierarchy, event frames,
 *                       streamsets, auth modes, ו-real-time polling
 *   LIVE              — חיבור אמיתי ל-PI Web API (דורש שרת PI)
 *
 * ═══════════════════════════════════════════════════════════════
 * API ציבורי:
 * ═══════════════════════════════════════════════════════════════
 *   PISimulationMode.setMode('FULL_SIMULATION')   — עובר למצב מלא
 *   PISimulationMode.setMode('DEMO')              — חוזר למצב דמו
 *   PISimulationMode.getMode()                    — מחזיר מצב נוכחי
 *   PISimulationMode.getStatus()                  — סטטוס מפורט
 *   PISimulationMode.healthCheck()                — בדיקת תקינות
 *   PISimulationMode.startRealTimePolling(cb)     — polling real-time
 *   PISimulationMode.stopRealTimePolling()        — עצירת polling
 *   PISimulationMode.openDashboard()              — פתיחת dashboard UI
 *
 * ═══════════════════════════════════════════════════════════════
 * תלויות (נטענות לפני קובץ זה):
 *   - pi-webapi-mock.js    (window.PIWebAPIMock)
 *   - af-data-layer.js     (window.AFDataLayer)
 *   - pi-connector.js      (window.PIV_CONNECTOR)  [optional]
 * ═══════════════════════════════════════════════════════════════
 */

;(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  INTERNAL STATE
  // ═══════════════════════════════════════════════════════════════

  const MODES = { DEMO: 'DEMO', FULL_SIMULATION: 'FULL_SIMULATION', LIVE: 'LIVE' };

  let _currentMode = MODES.DEMO;
  let _afLayer = null;       // AFDataLayer instance
  let _mockApi = null;       // PIWebAPIMock reference
  let _pollingInterval = null;
  let _pollingCallbacks = [];
  let _pollingWebIds = [];
  let _pollingIntervalMs = 5000;
  let _dashboardEl = null;
  let _startedAt = null;

  // Health check results
  let _lastHealthCheck = null;

  // Real-time value cache (latest values per WebId)
  const _rtValues = {};

  // ═══════════════════════════════════════════════════════════════
  //  DEPENDENCY RESOLUTION
  // ═══════════════════════════════════════════════════════════════

  function _resolveDeps() {
    // Resolve PIWebAPIMock
    if (!_mockApi) {
      if (global.PIWebAPIMock) {
        _mockApi = global.PIWebAPIMock;
        _mockApi.init({ latencyMs: 60, latencyJitter: 30 });
      }
    }

    // Resolve / create AFDataLayer
    if (!_afLayer) {
      if (global.AFDataLayer) {
        try { _afLayer = new global.AFDataLayer(); } catch (e) {
          console.warn('[PISimMode] AFDataLayer instantiation failed:', e.message);
        }
      }
    }

    return { mockApi: !!_mockApi, afLayer: !!_afLayer, connector: !!global.PIV_CONNECTOR };
  }

  // ═══════════════════════════════════════════════════════════════
  //  MODE SWITCHING
  // ═══════════════════════════════════════════════════════════════

  /**
   * עובר למצב הנדרש.
   * @param {'DEMO'|'FULL_SIMULATION'|'LIVE'} mode
   * @param {object} [opts]
   */
  function setMode(mode, opts) {
    if (!MODES[mode]) {
      console.error('[PISimMode] מצב לא חוקי:', mode);
      return false;
    }

    const prev = _currentMode;
    _currentMode = mode;
    opts = opts || {};

    const deps = _resolveDeps();
    _startedAt = new Date().toISOString();

    if (mode === MODES.FULL_SIMULATION) {
      // Initialize mock API with auth mode
      if (_mockApi) {
        _mockApi.init({
          authMode: opts.authMode || 'none',
          username: opts.username || '',
          password: opts.password || '',
          latencyMs: opts.latencyMs !== undefined ? opts.latencyMs : 60,
          latencyJitter: opts.latencyJitter !== undefined ? opts.latencyJitter : 30,
          cacheEnabled: opts.cacheEnabled !== undefined ? opts.cacheEnabled : true,
          cacheTtlMs: opts.cacheTtlMs || 30000,
        });
      }

      // Auto-start polling if requested
      if (opts.autoPolling) {
        const webIds = opts.pollingWebIds || (deps.mockApi ? _mockApi.getTags().map(t => t.WebId).slice(0, 10) : []);
        startRealTimePolling(webIds, opts.pollingCallback, opts.pollingIntervalMs);
      }

      console.info('[PISimMode] ✅ עבר למצב FULL_SIMULATION');
      _emitEvent('modechange', { from: prev, to: mode });
      return true;
    }

    if (mode === MODES.DEMO) {
      stopRealTimePolling();
      if (_mockApi) _mockApi.clearCache();
      console.info('[PISimMode] ✅ עבר למצב DEMO');
      _emitEvent('modechange', { from: prev, to: mode });
      return true;
    }

    if (mode === MODES.LIVE) {
      if (!global.PIV_CONNECTOR) {
        console.warn('[PISimMode] ⚠️  PIV_CONNECTOR לא נמצא — לא ניתן לעבור למצב LIVE');
        _currentMode = prev; // revert
        return false;
      }
      console.info('[PISimMode] עבר למצב LIVE — נדרש שרת PI Web API אמיתי');
      _emitEvent('modechange', { from: prev, to: mode });
      return true;
    }

    return false;
  }

  function getMode() { return _currentMode; }

  // ═══════════════════════════════════════════════════════════════
  //  EVENT EMITTER (simple)
  // ═══════════════════════════════════════════════════════════════

  const _listeners = {};

  function on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }

  function off(event, cb) {
    if (_listeners[event]) {
      _listeners[event] = _listeners[event].filter(f => f !== cb);
    }
  }

  function _emitEvent(event, data) {
    (_listeners[event] || []).forEach(cb => { try { cb(data); } catch (e) {} });
  }

  // ═══════════════════════════════════════════════════════════════
  //  HEALTH CHECK
  // ═══════════════════════════════════════════════════════════════

  /**
   * בודק תקינות של כל השכבות.
   * @returns {Promise<object>}
   */
  async function healthCheck() {
    const t0 = performance.now();
    const checks = [];

    // 1. PIWebAPIMock
    try {
      if (_mockApi) {
        const r = await _mockApi.request('GET', '/piwebapi/system/versions');
        checks.push({
          name: 'PIWebAPIMock',
          status: r.status === 200 ? 'OK' : 'FAIL',
          detail: r.status === 200 ? ('v' + (_mockApi.VERSION || '?')) : 'HTTP ' + r.status,
        });
        // Tag query
        const tr = await _mockApi.request('GET', '/piwebapi/dataservers/' + 'WDS_IEC_MOCK_001' + '/points', { maxCount: '5' });
        checks.push({
          name: 'PIWebAPIMock.TagQuery',
          status: tr.status === 200 && tr.body.Items && tr.body.Items.length > 0 ? 'OK' : 'FAIL',
          detail: tr.body.Items ? tr.body.Items.length + ' tags returned' : 'no items',
        });
        // Snapshot value
        const vr = await _mockApi.request('GET', '/piwebapi/points/WTAG001/value');
        checks.push({
          name: 'PIWebAPIMock.Snapshot',
          status: vr.status === 200 && vr.body.Value !== undefined ? 'OK' : 'FAIL',
          detail: vr.body.Value !== undefined ? ('value=' + vr.body.Value) : 'no value',
        });
        // StreamSets
        const sr = await _mockApi.streamSetsValue(['WTAG001', 'WTAG002', 'WTAG003']);
        checks.push({
          name: 'PIWebAPIMock.StreamSets',
          status: sr.length === 3 ? 'OK' : 'WARN',
          detail: sr.length + '/3 items returned',
        });
        // EventFrames
        const efr = await _mockApi.request('GET', '/piwebapi/assetdatabases/WADB_IEC_POWERGRID/eventframes', { startTime: '*-365d' });
        checks.push({
          name: 'PIWebAPIMock.EventFrames',
          status: efr.status === 200 && efr.body.Items ? 'OK' : 'FAIL',
          detail: efr.body.Items ? efr.body.Items.length + ' event frames' : 'no items',
        });
        // Batch
        const br = await _mockApi.batch({
          req1: { Method: 'GET', Resource: '/piwebapi/points/WTAG001/value' },
          req2: { Method: 'GET', Resource: '/piwebapi/points/WTAG002/value' },
        });
        checks.push({
          name: 'PIWebAPIMock.Batch',
          status: br.req1 && br.req2 ? 'OK' : 'FAIL',
          detail: 'batch keys: ' + Object.keys(br).join(', '),
        });
      } else {
        checks.push({ name: 'PIWebAPIMock', status: 'MISSING', detail: 'pi-webapi-mock.js לא נטען' });
      }
    } catch (e) {
      checks.push({ name: 'PIWebAPIMock', status: 'ERROR', detail: e.message });
    }

    // 2. AFDataLayer
    try {
      if (_afLayer) {
        const stats = _afLayer.getStats();
        checks.push({
          name: 'AFDataLayer',
          status: stats.totalElements > 0 ? 'OK' : 'WARN',
          detail: stats.totalElements + ' elements, ' + stats.totalTags + ' tags, ' + stats.totalAttributes + ' attributes',
        });
        // Element navigation
        const roots = _afLayer.getRootElements();
        checks.push({
          name: 'AFDataLayer.Navigation',
          status: roots && roots.Items && roots.Items.length > 0 ? 'OK' : 'FAIL',
          detail: roots.Items ? roots.Items.length + ' root elements' : 'no elements',
        });
        // Tag search
        const ts = _afLayer.searchTags('הספק', 5);
        checks.push({
          name: 'AFDataLayer.TagSearch',
          status: ts && ts.Items && ts.Items.length > 0 ? 'OK' : 'WARN',
          detail: ts.Items ? ts.Items.length + ' tags found for "הספק"' : 'no results',
        });
        // Time series
        const firstTag = _afLayer.searchTags('', 1);
        if (firstTag && firstTag.Items && firstTag.Items[0]) {
          const wid = firstTag.Items[0].WebId;
          const ts2 = _afLayer.getRecordedValues(wid, '*-1d', '*', 10);
          checks.push({
            name: 'AFDataLayer.RecordedValues',
            status: ts2 && ts2.Items && ts2.Items.length > 0 ? 'OK' : 'WARN',
            detail: ts2.Items ? ts2.Items.length + ' recorded values' : 'no values',
          });
        }
        // Event frames
        const ef = _afLayer.getEventFrames ? _afLayer.getEventFrames({ startTime: '*-365d', endTime: '*' }) : null;
        if (ef) {
          checks.push({
            name: 'AFDataLayer.EventFrames',
            status: ef.Items && ef.Items.length > 0 ? 'OK' : 'WARN',
            detail: ef.Items ? ef.Items.length + ' event frames' : 'no event frames',
          });
        }
      } else {
        checks.push({ name: 'AFDataLayer', status: 'MISSING', detail: 'af-data-layer.js לא נטען' });
      }
    } catch (e) {
      checks.push({ name: 'AFDataLayer', status: 'ERROR', detail: e.message });
    }

    // 3. PIV_CONNECTOR
    if (global.PIV_CONNECTOR) {
      checks.push({
        name: 'PIV_CONNECTOR',
        status: 'OK',
        detail: 'נטען, מצב: ' + (global.PIV_CONNECTOR.getMode ? global.PIV_CONNECTOR.getMode() : 'demo'),
      });
    } else {
      checks.push({ name: 'PIV_CONNECTOR', status: 'MISSING', detail: 'pi-connector.js לא נטען (אופציונלי)' });
    }

    const elapsed = +(performance.now() - t0).toFixed(1);
    const allOk = checks.every(c => c.status === 'OK' || c.status === 'WARN');
    const hasErrors = checks.some(c => c.status === 'ERROR' || c.status === 'FAIL');

    _lastHealthCheck = {
      timestamp: new Date().toISOString(),
      mode: _currentMode,
      overall: hasErrors ? 'FAIL' : (allOk ? 'OK' : 'PARTIAL'),
      elapsedMs: elapsed,
      checks,
    };

    _emitEvent('healthcheck', _lastHealthCheck);
    return _lastHealthCheck;
  }

  // ═══════════════════════════════════════════════════════════════
  //  REAL-TIME POLLING
  // ═══════════════════════════════════════════════════════════════

  /**
   * מתחיל polling real-time עבור רשימת WebIds.
   * @param {string[]} webIds
   * @param {function} [callback]  — קרוי עם מערך { webId, value, timestamp }
   * @param {number} [intervalMs]  — ברירת מחדל: 5000ms
   */
  function startRealTimePolling(webIds, callback, intervalMs) {
    stopRealTimePolling();

    _pollingWebIds    = webIds || [];
    _pollingIntervalMs = intervalMs || 5000;
    if (callback) _pollingCallbacks.push(callback);

    if (_pollingWebIds.length === 0) {
      // Default: first 10 tags from mock
      if (_mockApi) {
        _pollingWebIds = _mockApi.getTags().slice(0, 10).map(t => t.WebId);
      }
    }

    _pollingInterval = setInterval(_pollValues, _pollingIntervalMs);
    _pollValues(); // immediate first poll
    console.info('[PISimMode] Real-time polling started — ' + _pollingWebIds.length + ' tags @ ' + _pollingIntervalMs + 'ms');
  }

  async function _pollValues() {
    if (!_mockApi && !_afLayer) return;

    let results = [];

    if (_currentMode === MODES.FULL_SIMULATION && _mockApi) {
      try {
        const items = await _mockApi.streamSetsValue(_pollingWebIds);
        results = items.map(item => ({
          webId:     item.WebId,
          value:     item.Value ? item.Value.Value : null,
          timestamp: item.Value ? item.Value.Timestamp : new Date().toISOString(),
          good:      item.Value ? item.Value.Good : false,
          error:     item.Exception || null,
        }));
      } catch (e) {
        console.warn('[PISimMode] Polling error:', e.message);
        return;
      }
    } else {
      // Demo mode: use AFDataLayer directly
      if (_afLayer) {
        results = _pollingWebIds.map(wid => {
          try {
            const v = _afLayer.getAttributeValue ? _afLayer.getAttributeValue(wid) : null;
            return { webId: wid, value: v ? v.Value : null, timestamp: new Date().toISOString(), good: true };
          } catch (e) {
            return { webId: wid, value: null, timestamp: new Date().toISOString(), good: false };
          }
        });
      }
    }

    // Update rt cache
    results.forEach(r => { _rtValues[r.webId] = r; });

    // Notify callbacks
    _pollingCallbacks.forEach(cb => {
      try { cb(results); } catch (e) { console.warn('[PISimMode] Callback error:', e.message); }
    });

    _emitEvent('values', results);
  }

  /**
   * מוסיף callback לpolling.
   */
  function addPollingCallback(cb) {
    if (typeof cb === 'function') _pollingCallbacks.push(cb);
  }

  /**
   * מסיר callback מpolling.
   */
  function removePollingCallback(cb) {
    _pollingCallbacks = _pollingCallbacks.filter(f => f !== cb);
  }

  /**
   * עוצר polling.
   */
  function stopRealTimePolling() {
    if (_pollingInterval) {
      clearInterval(_pollingInterval);
      _pollingInterval = null;
    }
    _pollingCallbacks = [];
    console.info('[PISimMode] Real-time polling stopped');
  }

  /**
   * קבלת ערך נוכחי מה-cache.
   */
  function getRTValue(webId) {
    return _rtValues[webId] || null;
  }

  // ═══════════════════════════════════════════════════════════════
  //  HIGH-LEVEL DATA ACCESS (delegates to mock/af)
  // ═══════════════════════════════════════════════════════════════

  /**
   * קבלת ערך snapshot לתג יחיד.
   * @param {string} webId
   * @returns {Promise<object>}
   */
  async function getSnapshot(webId) {
    if (_currentMode === MODES.FULL_SIMULATION && _mockApi) {
      const r = await _mockApi.request('GET', '/piwebapi/points/' + webId + '/value');
      return r.body;
    }
    if (_afLayer) {
      return _afLayer.getAttributeValue ? _afLayer.getAttributeValue(webId) : null;
    }
    return null;
  }

  /**
   * קבלת היסטוריה לתג.
   * @param {string} webId
   * @param {string} startTime
   * @param {string} endTime
   * @param {number} [maxCount]
   * @returns {Promise<object>}
   */
  async function getHistory(webId, startTime, endTime, maxCount) {
    if (_currentMode === MODES.FULL_SIMULATION && _mockApi) {
      const r = await _mockApi.request('GET', '/piwebapi/points/' + webId + '/recorded', {
        startTime: startTime || '*-1d',
        endTime: endTime || '*',
        maxCount: String(maxCount || 500),
      });
      return r.body;
    }
    if (_afLayer) {
      return _afLayer.getRecordedValues ? _afLayer.getRecordedValues(webId, startTime, endTime, maxCount) : null;
    }
    return null;
  }

  /**
   * קבלת event frames.
   * @param {object} [opts]
   * @returns {Promise<Array>}
   */
  async function getEventFrames(opts) {
    opts = opts || {};
    if (_currentMode === MODES.FULL_SIMULATION && _mockApi) {
      const r = await _mockApi.request('GET', '/piwebapi/assetdatabases/WADB_IEC_POWERGRID/eventframes', {
        startTime: opts.startTime || '*-30d',
        endTime: opts.endTime || '*',
      });
      return r.body && r.body.Items ? r.body.Items : [];
    }
    if (_afLayer && _afLayer.getEventFrames) {
      const r = _afLayer.getEventFrames(opts);
      return r.Items || [];
    }
    return [];
  }

  /**
   * קבלת AF hierarchy.
   * @returns {Promise<Array>}
   */
  async function getAFHierarchy() {
    if (_afLayer) {
      const roots = _afLayer.getRootElements();
      return roots.Items || [];
    }
    if (_currentMode === MODES.FULL_SIMULATION && _mockApi) {
      const r = await _mockApi.request('GET', '/piwebapi/assetdatabases/WADB_IEC_POWERGRID/elements');
      return r.body && r.body.Items ? r.body.Items : [];
    }
    return [];
  }

  // ═══════════════════════════════════════════════════════════════
  //  STATUS
  // ═══════════════════════════════════════════════════════════════

  function getStatus() {
    const deps = _resolveDeps();
    const mockStatus  = _mockApi ? _mockApi.getStatus() : null;
    const afStats     = _afLayer ? _afLayer.getStats() : null;

    return {
      mode: _currentMode,
      startedAt: _startedAt,
      isMock: _currentMode !== MODES.LIVE,
      isFullSimulation: _currentMode === MODES.FULL_SIMULATION,
      dependencies: {
        PIWebAPIMock: deps.mockApi ? 'loaded' : 'missing',
        AFDataLayer:  deps.afLayer ? 'loaded' : 'missing',
        PIV_CONNECTOR: deps.connector ? 'loaded' : 'missing (optional)',
      },
      polling: {
        active: !!_pollingInterval,
        webIds: _pollingWebIds.length,
        intervalMs: _pollingIntervalMs,
      },
      mock: mockStatus,
      af: afStats,
      lastHealthCheck: _lastHealthCheck,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  DASHBOARD UI
  // ═══════════════════════════════════════════════════════════════

  const _CSS_DASHBOARD = `
#pisim-dashboard {
  position: fixed;
  bottom: 16px;
  left: 16px;
  width: 420px;
  max-height: 80vh;
  overflow-y: auto;
  background: #0a1321;
  border: 1px solid rgba(0,212,255,0.25);
  border-radius: 10px;
  z-index: 97000;
  font-family: 'Heebo', 'Segoe UI', sans-serif;
  font-size: 12px;
  color: #c0d4e4;
  box-shadow: 0 8px 32px rgba(0,0,0,0.7);
  direction: rtl;
  animation: pisim-in 0.2s ease;
}
@keyframes pisim-in { from { opacity:0; transform:translateY(16px) } to { opacity:1; transform:translateY(0) } }
.pisim-hdr {
  display: flex; align-items: center; justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid rgba(0,212,255,0.1);
  font-weight: 600; color: #e8f4f8; font-size: 13px;
}
.pisim-hdr-right { display: flex; align-items: center; gap: 8px; }
.pisim-mode-badge {
  padding: 2px 10px; border-radius: 12px; font-size: 10px; font-weight: 700;
  letter-spacing: 0.06em; text-transform: uppercase;
}
.pisim-mode-badge.demo   { background: rgba(255,171,64,0.15); color: #ffab40; border: 1px solid rgba(255,171,64,0.3); }
.pisim-mode-badge.full   { background: rgba(0,230,118,0.12);  color: #00e676; border: 1px solid rgba(0,230,118,0.3);  }
.pisim-mode-badge.live   { background: rgba(0,212,255,0.12);  color: #00d4ff; border: 1px solid rgba(0,212,255,0.3);  }
.pisim-close {
  background: none; border: none; color: #6b7fa3; cursor: pointer;
  font-size: 16px; padding: 2px 4px; border-radius: 4px;
}
.pisim-close:hover { color: #e8f4f8; }
.pisim-body { padding: 12px 14px; }
.pisim-section { margin-bottom: 14px; }
.pisim-section-title {
  font-size: 10px; font-weight: 700; letter-spacing: 0.08em;
  color: #00d4ff; text-transform: uppercase; margin-bottom: 8px;
}
.pisim-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
.pisim-key { color: #6b7fa3; }
.pisim-val { color: #c0d4e4; font-weight: 500; }
.pisim-checks { margin-top: 4px; }
.pisim-check {
  display: flex; align-items: center; gap: 6px;
  padding: 3px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
}
.pisim-check:last-child { border-bottom: none; }
.pisim-check-dot {
  width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
}
.pisim-check-dot.ok     { background: #00e676; }
.pisim-check-dot.warn   { background: #ffab40; }
.pisim-check-dot.fail   { background: #ff5252; }
.pisim-check-dot.error  { background: #ff5252; }
.pisim-check-dot.missing { background: #6b7fa3; }
.pisim-check-name { flex: 1; color: #9ab0c8; font-size: 11px; }
.pisim-check-detail { color: #6b7fa3; font-size: 10px; max-width: 160px; text-align: left; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; }
.pisim-btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
.pisim-btn {
  padding: 6px 14px; border-radius: 5px; border: 1px solid rgba(0,212,255,0.2);
  background: rgba(0,212,255,0.06); color: #00d4ff; cursor: pointer;
  font-size: 11px; font-family: inherit; transition: all 0.15s;
}
.pisim-btn:hover { background: rgba(0,212,255,0.15); }
.pisim-btn.danger { border-color: rgba(255,82,82,0.25); color: #ff5252; background: rgba(255,82,82,0.06); }
.pisim-btn.danger:hover { background: rgba(255,82,82,0.14); }
.pisim-rt-table { width: 100%; border-collapse: collapse; margin-top: 4px; }
.pisim-rt-table th { color: #00d4ff; font-size: 10px; font-weight: 600; text-align: right; padding: 2px 4px; }
.pisim-rt-table td { font-size: 11px; padding: 3px 4px; border-bottom: 1px solid rgba(255,255,255,0.04); }
.pisim-rt-table tr:last-child td { border-bottom: none; }
.pisim-rt-good  { color: #00e676; }
.pisim-rt-warn  { color: #ffab40; }
.pisim-rt-error { color: #ff5252; }
`;

  function _injectDashboardCSS() {
    if (document.getElementById('pisim-dash-styles')) return;
    const s = document.createElement('style');
    s.id = 'pisim-dash-styles';
    s.textContent = _CSS_DASHBOARD;
    document.head.appendChild(s);
  }

  /**
   * פותח/מרענן את Dashboard ה-UI.
   */
  function openDashboard() {
    _injectDashboardCSS();

    if (_dashboardEl) {
      _refreshDashboard();
      return;
    }

    _dashboardEl = document.createElement('div');
    _dashboardEl.id = 'pisim-dashboard';
    document.body.appendChild(_dashboardEl);
    _refreshDashboard();

    // Auto-refresh every 3s when visible
    const refreshTimer = setInterval(() => {
      if (!document.getElementById('pisim-dashboard')) { clearInterval(refreshTimer); _dashboardEl = null; }
      else _refreshDashboard();
    }, 3000);
  }

  function _getBadgeClass() {
    return _currentMode === MODES.FULL_SIMULATION ? 'full' : (_currentMode === MODES.LIVE ? 'live' : 'demo');
  }

  function _modeLabel() {
    return _currentMode === MODES.FULL_SIMULATION ? 'Full Simulation' : _currentMode;
  }

  function _refreshDashboard() {
    if (!_dashboardEl) return;
    const status = getStatus();
    const deps = status.dependencies;
    const mock = status.mock;
    const af   = status.af;
    const hc   = status.lastHealthCheck;

    // RT values table (last 8)
    const rtKeys = Object.keys(_rtValues).slice(0, 8);
    const rtRows = rtKeys.map(wid => {
      const rv = _rtValues[wid];
      const cls = rv && rv.good ? 'pisim-rt-good' : 'pisim-rt-error';
      const val = rv && rv.value !== null && rv.value !== undefined ? +rv.value.toFixed ? +rv.value.toFixed(2) : rv.value : '—';
      const ts  = rv ? rv.timestamp.slice(11, 19) : '';
      return `<tr><td>${wid}</td><td class="${cls}">${val}</td><td style="color:#6b7fa3">${ts}</td></tr>`;
    }).join('');

    // Health check rows
    const hcRows = hc ? hc.checks.map(c =>
      `<div class="pisim-check">
        <div class="pisim-check-dot ${c.status.toLowerCase()}"></div>
        <div class="pisim-check-name">${c.name}</div>
        <div class="pisim-check-detail" title="${c.detail}">${c.detail}</div>
      </div>`
    ).join('') : '<div style="color:#6b7fa3;font-size:11px">לא בוצעה בדיקה עדיין — לחץ "Health Check"</div>';

    _dashboardEl.innerHTML = `
<div class="pisim-hdr">
  <div class="pisim-hdr-right">
    <span>🔬 PI Simulation Dashboard</span>
    <span class="pisim-mode-badge ${_getBadgeClass()}">${_modeLabel()}</span>
  </div>
  <button class="pisim-close" id="pisim-btn-close">✕</button>
</div>
<div class="pisim-body">
  <div class="pisim-section">
    <div class="pisim-section-title">מצב כללי</div>
    <div class="pisim-row"><span class="pisim-key">מצב:</span><span class="pisim-val">${_currentMode}</span></div>
    <div class="pisim-row"><span class="pisim-key">הופעל:</span><span class="pisim-val">${status.startedAt ? status.startedAt.slice(0,19).replace('T',' ') : '—'}</span></div>
    <div class="pisim-row"><span class="pisim-key">PIWebAPIMock:</span><span class="pisim-val">${deps.PIWebAPIMock}</span></div>
    <div class="pisim-row"><span class="pisim-key">AFDataLayer:</span><span class="pisim-val">${deps.AFDataLayer}</span></div>
    <div class="pisim-row"><span class="pisim-key">Polling:</span><span class="pisim-val">${status.polling.active ? '🟢 ' + status.polling.webIds + ' tags @ ' + status.polling.intervalMs + 'ms' : '⬜ כבוי'}</span></div>
    ${mock ? `
    <div class="pisim-row"><span class="pisim-key">בקשות:</span><span class="pisim-val">${mock.metrics.totalRequests}</span></div>
    <div class="pisim-row"><span class="pisim-key">שגיאות:</span><span class="pisim-val">${mock.metrics.totalErrors}</span></div>
    <div class="pisim-row"><span class="pisim-key">Cache hits:</span><span class="pisim-val">${mock.metrics.cacheHitRate}%</span></div>
    ` : ''}
    ${af ? `
    <div class="pisim-row"><span class="pisim-key">AF Elements:</span><span class="pisim-val">${af.totalElements}</span></div>
    <div class="pisim-row"><span class="pisim-key">AF Tags:</span><span class="pisim-val">${af.totalTags}</span></div>
    ` : ''}
  </div>

  <div class="pisim-section">
    <div class="pisim-section-title">Health Check ${hc ? `<span style="color:#6b7fa3;font-weight:400;font-size:10px">${hc.timestamp.slice(11,19)} — ${hc.elapsedMs}ms</span>` : ''}</div>
    <div class="pisim-checks">${hcRows}</div>
  </div>

  ${rtKeys.length > 0 ? `
  <div class="pisim-section">
    <div class="pisim-section-title">ערכים real-time (${rtKeys.length})</div>
    <table class="pisim-rt-table">
      <tr><th>WebId</th><th>ערך</th><th>שעה</th></tr>
      ${rtRows}
    </table>
  </div>
  ` : ''}

  <div class="pisim-btns">
    <button class="pisim-btn" id="pisim-btn-hc">Health Check</button>
    <button class="pisim-btn" id="pisim-btn-full">${_currentMode === MODES.FULL_SIMULATION ? '⏸ עצור Simulation' : '▶ Full Simulation'}</button>
    <button class="pisim-btn" id="pisim-btn-poll">${status.polling.active ? '⏹ עצור Polling' : '▶ התחל Polling'}</button>
    <button class="pisim-btn danger" id="pisim-btn-err">סמל שגיאה</button>
  </div>
</div>
`;

    // Button handlers
    const closeBtn = document.getElementById('pisim-btn-close');
    if (closeBtn) closeBtn.addEventListener('click', () => { _dashboardEl.remove(); _dashboardEl = null; });

    const hcBtn = document.getElementById('pisim-btn-hc');
    if (hcBtn) hcBtn.addEventListener('click', async () => {
      hcBtn.disabled = true; hcBtn.textContent = '⏳ בודק...';
      await healthCheck();
      hcBtn.disabled = false; hcBtn.textContent = 'Health Check';
      _refreshDashboard();
    });

    const fullBtn = document.getElementById('pisim-btn-full');
    if (fullBtn) fullBtn.addEventListener('click', () => {
      if (_currentMode === MODES.FULL_SIMULATION) { setMode(MODES.DEMO); }
      else { setMode(MODES.FULL_SIMULATION); }
      _refreshDashboard();
    });

    const pollBtn = document.getElementById('pisim-btn-poll');
    if (pollBtn) pollBtn.addEventListener('click', () => {
      if (status.polling.active) { stopRealTimePolling(); }
      else { startRealTimePolling(); }
      _refreshDashboard();
    });

    const errBtn = document.getElementById('pisim-btn-err');
    if (errBtn) errBtn.addEventListener('click', () => {
      if (_mockApi) {
        const modes = ['servererror', 'unauthorized', 'partial', null];
        const curr = _mockApi.getStatus().config.errorMode;
        const next = modes[(modes.indexOf(curr) + 1) % modes.length];
        _mockApi.setErrorMode(next, 8000);
        errBtn.textContent = next ? 'Error: ' + next : 'סמל שגיאה';
      }
    });
  }

  function closeDashboard() {
    if (_dashboardEl) { _dashboardEl.remove(); _dashboardEl = null; }
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUTO-INIT
  // ═══════════════════════════════════════════════════════════════

  // Auto-resolve deps when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _resolveDeps);
  } else {
    _resolveDeps();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  global.PISimulationMode = {
    // Mode management
    setMode,
    getMode,
    MODES,

    // Status & health
    getStatus,
    healthCheck,

    // Data access
    getSnapshot,
    getHistory,
    getEventFrames,
    getAFHierarchy,

    // Real-time
    startRealTimePolling,
    stopRealTimePolling,
    addPollingCallback,
    removePollingCallback,
    getRTValue,

    // Events
    on,
    off,

    // UI
    openDashboard,
    closeDashboard,

    // Internal access (for testing/debugging)
    _getMockApi()  { return _mockApi; },
    _getAfLayer()  { return _afLayer; },
  };

})(typeof window !== 'undefined' ? window : globalThis);
