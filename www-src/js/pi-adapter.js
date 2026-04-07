/**
 * pi-adapter.js — PI Data Adapter Layer v1.0.0
 * ==============================================
 * תאריך: 2026-03-29
 * namespace: window.PIAdapter
 *
 * ═══════════════════════════════════════════════════════════════
 * תיאור:
 * ═══════════════════════════════════════════════════════════════
 * שכבת adapter מרכזית ונקייה שמפרידה לחלוטין בין שלושת מצבי
 * הנתונים. כל קוד שצורך נתוני PI Web API צריך לפנות אך ורק
 * לממשק זה — לא ישירות ל-PIWebAPIMock, AFDataLayer, או PIV_CONNECTOR.
 *
 * ┌─────────────────────────────────────────────────────────┐
 * │                      CONSUMER CODE                       │
 * │           (symbols, QA, dashboards, AI agent)            │
 * └────────────────────┬────────────────────────────────────┘
 *                      │  PIAdapter.getData(...)
 * ┌────────────────────▼────────────────────────────────────┐
 * │                     PI ADAPTER LAYER                      │
 * │  routes based on: DEMO | FULL_SIMULATION | LIVE          │
 * └──────┬─────────────────┬───────────────────┬────────────┘
 *        │                 │                   │
 *   ┌────▼────┐  ┌─────────▼────────┐  ┌──────▼──────┐
 *   │  DEMO   │  │ FULL_SIMULATION  │  │    LIVE     │
 *   │ in-line │  │ PIWebAPIMock +   │  │ PIV_CONNECT │
 *   │  mock   │  │ AFDataLayer      │  │ (real HTTP) │
 *   └─────────┘  └──────────────────┘  └─────────────┘
 *
 * ═══════════════════════════════════════════════════════════════
 * חוזה API (contract) — זהה בכל המצבים:
 * ═══════════════════════════════════════════════════════════════
 *
 *   PIAdapter.getMode()                     → 'DEMO'|'FULL_SIMULATION'|'LIVE'
 *   PIAdapter.setMode(mode, opts)           → Promise<{ok, message}>
 *   PIAdapter.getConfig()                   → object (current config)
 *
 *   PIAdapter.getSnapshot(webId)            → Promise<SnapshotValue>
 *   PIAdapter.getMultiSnapshot(webIds[])    → Promise<SnapshotValue[]>
 *   PIAdapter.getHistory(webId, start, end, maxCount) → Promise<RecordedValues>
 *   PIAdapter.getInterpolated(webId, start, end, count) → Promise<InterpolatedValues>
 *   PIAdapter.getSummary(webId, start, end) → Promise<SummaryValues>
 *
 *   PIAdapter.searchTags(nameFilter, maxCount) → Promise<{Items}>
 *   PIAdapter.getTagDetails(webId)          → Promise<TagDetails>
 *
 *   PIAdapter.getElements(parentWebId)      → Promise<{Items}>
 *   PIAdapter.getAttributes(elementWebId)  → Promise<{Items}>
 *   PIAdapter.getAttributeValue(webId)     → Promise<SnapshotValue>
 *
 *   PIAdapter.getEventFrames(opts)          → Promise<{Items}>
 *   PIAdapter.getDatabases()               → Promise<{Items}>
 *   PIAdapter.getDataServers()             → Promise<{Items}>
 *
 *   PIAdapter.writeValue(webId, value)     → Promise<WriteResult>
 *   PIAdapter.batchRequest(requests)       → Promise<BatchResult>
 *
 *   PIAdapter.subscribe(webIds, cb, intervalMs) → subscriptionId
 *   PIAdapter.unsubscribe(subscriptionId)       → void
 *
 *   PIAdapter.getMetrics()                 → object
 *   PIAdapter.on(event, cb)                → void
 *   PIAdapter.off(event, cb)               → void
 *
 * ═══════════════════════════════════════════════════════════════
 * מעבר ל-LIVE — רשימת inputs הנדרשים:
 * ═══════════════════════════════════════════════════════════════
 *   1. baseUrl    — https://your-pi-server/piwebapi
 *   2. authType   — 'basic' | 'kerberos' | 'none'
 *   3. username   — שם משתמש (רק ב-basic)
 *   4. password   — סיסמה (רק ב-basic)
 *   5. corsProxy  — (אופציונלי) URL proxy ל-CORS
 *   6. cacheTtl   — (אופציונלי) שניות cache (ברירת מחדל: 30)
 *
 * ═══════════════════════════════════════════════════════════════
 * תלויות:
 *   - pi-webapi-mock.js    (window.PIWebAPIMock)        [FULL_SIM]
 *   - af-data-layer.js     (window.AFDataLayer)         [FULL_SIM, DEMO]
 *   - pi-connector.js      (window.PIV_CONNECTOR)       [LIVE]
 *   - pi-simulation-mode.js (window.PISimulationMode)   [all, optional]
 * ═══════════════════════════════════════════════════════════════
 */

;(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  MODES
  // ═══════════════════════════════════════════════════════════════

  /** @enum {string} */
  const MODES = Object.freeze({
    DEMO:            'DEMO',
    FULL_SIMULATION: 'FULL_SIMULATION',
    LIVE:            'LIVE',
  });

  // ═══════════════════════════════════════════════════════════════
  //  INTERNAL STATE
  // ═══════════════════════════════════════════════════════════════

  let _mode    = MODES.DEMO;
  let _config  = {
    // LIVE config (all required for LIVE mode)
    baseUrl:   '',       // https://piserver/piwebapi
    authType:  'none',   // 'basic' | 'kerberos' | 'none'
    username:  '',
    password:  '',
    corsProxy: '',
    cacheTtl:  30,

    // FULL_SIMULATION config
    simLatencyMs:    60,
    simLatencyJitter: 30,
    simAuthMode:     'none',
  };

  // Runtime metrics
  const _metrics = {
    calls:      0,
    errors:     0,
    cacheHits:  0,
    avgLatency: 0,
    _latSum:    0,
  };

  // Active polling subscriptions: id → { intervalId, webIds, cb }
  const _subscriptions = new Map();
  let _subIdCounter = 0;

  // Event listeners
  const _listeners = {};

  // Resolved backend references (populated by _resolveDeps)
  let _mock = null;
  let _af   = null;

  // ═══════════════════════════════════════════════════════════════
  //  DEPENDENCY RESOLUTION
  // ═══════════════════════════════════════════════════════════════

  function _resolveDeps() {
    if (!_mock && global.PIWebAPIMock) {
      _mock = global.PIWebAPIMock;
    }
    if (!_af && global.AFDataLayer) {
      try { _af = new global.AFDataLayer(); } catch (_) {}
    }
    return { mock: !!_mock, af: !!_af, connector: !!global.PIV_CONNECTOR };
  }

  // ═══════════════════════════════════════════════════════════════
  //  EVENT EMITTER
  // ═══════════════════════════════════════════════════════════════

  function on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }

  function off(event, cb) {
    if (_listeners[event])
      _listeners[event] = _listeners[event].filter(f => f !== cb);
  }

  function _emit(event, data) {
    (_listeners[event] || []).forEach(cb => { try { cb(data); } catch (_) {} });
  }

  // ═══════════════════════════════════════════════════════════════
  //  METRICS TRACKING
  // ═══════════════════════════════════════════════════════════════

  function _track(latencyMs) {
    _metrics.calls++;
    _metrics._latSum += latencyMs;
    _metrics.avgLatency = +(_metrics._latSum / _metrics.calls).toFixed(1);
  }

  function _trackError() { _metrics.errors++; }
  function _trackCacheHit() { _metrics.cacheHits++; }

  // ═══════════════════════════════════════════════════════════════
  //  MODE MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * מחזיר את המצב הנוכחי.
   * @returns {'DEMO'|'FULL_SIMULATION'|'LIVE'}
   */
  function getMode() { return _mode; }

  /**
   * עובר למצב חדש.
   *
   * @param {'DEMO'|'FULL_SIMULATION'|'LIVE'} mode
   * @param {object} [opts]
   *   - לכל המצבים: ללא opts נדרשים
   *   - FULL_SIMULATION: { latencyMs, latencyJitter, authMode, username, password }
   *   - LIVE: { baseUrl, authType, username, password, corsProxy, cacheTtl }
   *
   * @returns {Promise<{ok: boolean, mode: string, message: string}>}
   */
  async function setMode(mode, opts) {
    if (!MODES[mode]) {
      return { ok: false, mode: _mode, message: 'מצב לא חוקי: ' + mode };
    }

    opts = opts || {};
    const prev = _mode;

    _resolveDeps();

    if (mode === MODES.LIVE) {
      // Validate LIVE config
      const check = _validateLiveConfig(opts.baseUrl || _config.baseUrl, opts);
      if (!check.valid) {
        return { ok: false, mode: _mode, message: 'הגדרות LIVE לא תקינות: ' + check.errors.join('; ') };
      }
      // Merge live config
      Object.assign(_config, {
        baseUrl:  opts.baseUrl  || _config.baseUrl,
        authType: opts.authType || _config.authType,
        username: opts.username || _config.username,
        password: opts.password || _config.password,
        corsProxy: opts.corsProxy || _config.corsProxy,
        cacheTtl: opts.cacheTtl  || _config.cacheTtl,
      });
      // Delegate to PIV_CONNECTOR if available
      if (global.PIV_CONNECTOR) {
        global.PIV_CONNECTOR.configure(_config);
      }
    }

    if (mode === MODES.FULL_SIMULATION) {
      if (_mock) {
        _mock.init({
          authMode:      opts.authMode      || _config.simAuthMode,
          username:      opts.username      || '',
          password:      opts.password      || '',
          latencyMs:     opts.latencyMs     !== undefined ? opts.latencyMs     : _config.simLatencyMs,
          latencyJitter: opts.latencyJitter !== undefined ? opts.latencyJitter : _config.simLatencyJitter,
          cacheEnabled:  true,
          cacheTtlMs:    30000,
        });
      }
    }

    _mode = mode;

    // Also sync PISimulationMode if loaded
    if (global.PISimulationMode && mode !== MODES.LIVE) {
      global.PISimulationMode.setMode(mode, opts);
    }

    const msg = { prev, mode, timestamp: new Date().toISOString() };
    _emit('modechange', msg);
    console.info('[PIAdapter] מצב עבר מ-' + prev + ' ל-' + mode);
    return { ok: true, mode, message: 'עבר בהצלחה ל-' + mode };
  }

  /**
   * מחזיר את הקונפיגורציה הנוכחית (ללא סיסמה).
   */
  function getConfig() {
    const cfg = Object.assign({}, _config);
    if (cfg.password) cfg.password = '***';
    return { mode: _mode, ...cfg };
  }

  /**
   * מגדיר ערכי config בלי לעבור מצב.
   * @param {object} patch
   */
  function configure(patch) {
    Object.assign(_config, patch);
  }

  // ═══════════════════════════════════════════════════════════════
  //  LIVE CONFIG VALIDATOR (internal)
  // ═══════════════════════════════════════════════════════════════

  /**
   * מאמת הגדרות LIVE — לא בודק חיבור, רק תקינות syntax.
   * @param {string} baseUrl
   * @param {object} opts
   * @returns {{ valid: boolean, errors: string[] }}
   */
  function _validateLiveConfig(baseUrl, opts) {
    const errors = [];
    if (!baseUrl || !baseUrl.trim()) {
      errors.push('baseUrl ריק');
    } else {
      try {
        const u = new URL(baseUrl);
        if (!['http:', 'https:'].includes(u.protocol)) {
          errors.push('baseUrl חייב להיות http/https');
        }
      } catch (_) {
        errors.push('baseUrl לא תקין (URL parsing)');
      }
    }

    const authType = (opts.authType || _config.authType || 'none').toLowerCase();
    if (!['basic', 'kerberos', 'none'].includes(authType)) {
      errors.push('authType לא תקין: ' + authType);
    }
    if (authType === 'basic') {
      if (!opts.username && !_config.username) errors.push('username נדרש ב-Basic auth');
      if (!opts.password && !_config.password) errors.push('password נדרש ב-Basic auth');
    }

    return { valid: errors.length === 0, errors };
  }

  // ═══════════════════════════════════════════════════════════════
  //  ROUTING HELPERS
  // ═══════════════════════════════════════════════════════════════

  /**
   * ממשק אחיד לקריאה מה-mock (FULL_SIMULATION ו-DEMO).
   */
  async function _mockGet(path, params) {
    if (!_mock) throw new Error('PIWebAPIMock לא נטען');
    const t0 = performance.now();
    const r = await _mock.request('GET', path, params);
    _track(performance.now() - t0);
    if (r.status === 404) throw Object.assign(new Error('404 Not Found: ' + path), { status: 404 });
    if (r.status !== 200) throw Object.assign(new Error('HTTP ' + r.status + ': ' + path), { status: r.status });
    return r.body;
  }

  /**
   * ממשק לקריאה מ-AFDataLayer (DEMO/FULL_SIMULATION).
   */
  function _afGet(fn, ...args) {
    if (!_af) throw new Error('AFDataLayer לא נטען');
    const t0 = performance.now();
    const result = fn(_af, ...args);
    _track(performance.now() - t0);
    if (result === null || result === undefined) throw new Error('AFDataLayer החזיר null');
    return result;
  }

  /**
   * ממשק לקריאה דרך PIV_CONNECTOR (LIVE).
   */
  async function _liveGet(endpoint, params) {
    if (!global.PIV_CONNECTOR) throw new Error('PIV_CONNECTOR לא נטען — לא ניתן לפעול ב-LIVE mode');
    const t0 = performance.now();
    try {
      const data = await global.PIV_CONNECTOR.DataAccess.get(endpoint, params);
      _track(performance.now() - t0);
      return data;
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA ACCESS — SNAPSHOTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * קבלת ערך נוכחי (snapshot) לתג יחיד.
   * @param {string} webId
   * @returns {Promise<{Value, Timestamp, Good, Questionable, Substituted, WebId}>}
   */
  async function getSnapshot(webId) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/points/' + webId + '/value');
      }
      // DEMO or FULL_SIMULATION — use mock
      const body = await _mockGet('/piwebapi/points/' + webId + '/value');
      return { ...body, WebId: webId };
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  /**
   * קבלת ערכים נוכחיים לרשימת תגים (StreamSets).
   * @param {string[]} webIds
   * @returns {Promise<Array<{WebId, Value, Timestamp, Good, Exception?}>>}
   */
  async function getMultiSnapshot(webIds) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/streamsets/value', { webId: webIds.join(',') });
      }
      if (!_mock) throw new Error('PIWebAPIMock לא נטען');
      const t0 = performance.now();
      const items = await _mock.streamSetsValue(webIds);
      _track(performance.now() - t0);
      return items;
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA ACCESS — HISTORY
  // ═══════════════════════════════════════════════════════════════

  /**
   * קבלת ערכים מוקלטים (recorded) לתג.
   * @param {string} webId
   * @param {string} startTime  — PI time expression, e.g. '*-7d' or ISO
   * @param {string} endTime    — PI time expression
   * @param {number} [maxCount] — ברירת מחדל: 1000
   * @returns {Promise<{Items: Array, Count: number}>}
   */
  async function getHistory(webId, startTime, endTime, maxCount) {
    _resolveDeps();
    startTime = startTime || '*-1d';
    endTime   = endTime   || '*';
    maxCount  = maxCount  || 1000;

    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/points/' + webId + '/recorded', {
          startTime, endTime, maxCount: String(maxCount),
        });
      }
      // Try mock first
      if (_mock) {
        const body = await _mockGet('/piwebapi/points/' + webId + '/recorded', {
          startTime, endTime, maxCount: String(maxCount),
        });
        return body;
      }
      // Fallback: AFDataLayer
      return _afGet((af) => af.getRecordedValues(webId, startTime, endTime, maxCount));
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  /**
   * קבלת ערכים interpolated לתג.
   * @param {string} webId
   * @param {string} startTime
   * @param {string} endTime
   * @param {number} [count]
   * @returns {Promise<{Items: Array}>}
   */
  async function getInterpolated(webId, startTime, endTime, count) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/points/' + webId + '/interpolated', {
          startTime: startTime || '*-1h',
          endTime:   endTime   || '*',
          maxCount:  String(count || 100),
        });
      }
      return await _mockGet('/piwebapi/points/' + webId + '/interpolated', {
        startTime: startTime || '*-1h',
        endTime:   endTime   || '*',
        maxCount:  String(count || 100),
      });
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  /**
   * קבלת summary סטטיסטי לתג.
   * @param {string} webId
   * @param {string} startTime
   * @param {string} endTime
   * @returns {Promise<{Items: Array}>}
   */
  async function getSummary(webId, startTime, endTime) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/points/' + webId + '/summary', {
          startTime: startTime || '*-7d', endTime: endTime || '*',
        });
      }
      return await _mockGet('/piwebapi/points/' + webId + '/summary', {
        startTime: startTime || '*-7d', endTime: endTime || '*',
      });
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA ACCESS — TAGS
  // ═══════════════════════════════════════════════════════════════

  /**
   * חיפוש תגים לפי שם.
   * @param {string} nameFilter  — wildcard מותר, עברית מותרת
   * @param {number} [maxCount]
   * @returns {Promise<{Items: Array}>}
   */
  async function searchTags(nameFilter, maxCount) {
    _resolveDeps();
    maxCount = maxCount || 100;
    try {
      if (_mode === MODES.LIVE) {
        const serverId = _config._dataServerId || 'default';
        return await _liveGet('/dataservers/' + serverId + '/points', {
          nameFilter: nameFilter || '*',
          maxCount: String(maxCount),
        });
      }
      // Try AFDataLayer (richer)
      if (_af) {
        const r = _af.searchTags(nameFilter || '*', maxCount);
        if (r && r.Items) return r;
      }
      // Fallback: mock
      if (_mock) {
        const tags = _mock.getTags();
        const filter = (nameFilter || '').toLowerCase().replace('*', '');
        const filtered = filter
          ? tags.filter(t => t.Name.toLowerCase().includes(filter) || (t.Descriptor || '').includes(nameFilter))
          : tags;
        return { Items: filtered.slice(0, maxCount), Count: filtered.length };
      }
      return { Items: [], Count: 0 };
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  /**
   * קבלת פרטי תג לפי WebId.
   * @param {string} webId
   * @returns {Promise<object>}
   */
  async function getTagDetails(webId) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/points/' + webId);
      }
      return await _mockGet('/piwebapi/points/' + webId);
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA ACCESS — AF HIERARCHY
  // ═══════════════════════════════════════════════════════════════

  /**
   * קבלת אלמנטים ילדים.
   * @param {string} [parentWebId]  — אם null/undefined: root elements
   * @returns {Promise<{Items: Array}>}
   */
  async function getElements(parentWebId) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        if (!parentWebId) {
          return await _liveGet('/assetdatabases/' + (_config._assetDbId || 'default') + '/elements');
        }
        return await _liveGet('/elements/' + parentWebId + '/elements');
      }
      if (_af) {
        if (!parentWebId) return _af.getRootElements();
        return _af.getChildElements(parentWebId);
      }
      if (_mock) {
        const path = parentWebId
          ? '/piwebapi/elements/' + parentWebId + '/elements'
          : '/piwebapi/assetdatabases/WADB_IEC_POWERGRID/elements';
        return await _mockGet(path);
      }
      return { Items: [] };
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  /**
   * קבלת attributes של אלמנט.
   * @param {string} elementWebId
   * @returns {Promise<{Items: Array}>}
   */
  async function getAttributes(elementWebId) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/elements/' + elementWebId + '/attributes');
      }
      if (_af) {
        const r = _af.getAttributes(elementWebId);
        if (r && r.Items) return r;
      }
      return await _mockGet('/piwebapi/elements/' + elementWebId + '/attributes');
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  /**
   * קבלת ערך attribute.
   * @param {string} webId
   * @returns {Promise<SnapshotValue>}
   */
  async function getAttributeValue(webId) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/attributes/' + webId + '/value');
      }
      if (_af && _af.getAttributeValue) {
        return _af.getAttributeValue(webId);
      }
      return await _mockGet('/piwebapi/attributes/' + webId + '/value');
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA ACCESS — EVENT FRAMES
  // ═══════════════════════════════════════════════════════════════

  /**
   * קבלת event frames.
   * @param {object} [opts]
   * @param {string} [opts.startTime]
   * @param {string} [opts.endTime]
   * @param {string} [opts.nameFilter]
   * @param {number} [opts.maxCount]
   * @param {string} [opts.databaseWebId]
   * @returns {Promise<{Items: Array}>}
   */
  async function getEventFrames(opts) {
    _resolveDeps();
    opts = opts || {};
    try {
      if (_mode === MODES.LIVE) {
        const dbId = opts.databaseWebId || _config._assetDbId || 'default';
        return await _liveGet('/assetdatabases/' + dbId + '/eventframes', {
          startTime:  opts.startTime  || '*-30d',
          endTime:    opts.endTime    || '*',
          nameFilter: opts.nameFilter || '',
          maxCount:   String(opts.maxCount || 1000),
        });
      }
      if (_af && _af.getEventFrames) {
        return _af.getEventFrames(opts);
      }
      return await _mockGet('/piwebapi/assetdatabases/WADB_IEC_POWERGRID/eventframes', {
        startTime: opts.startTime || '*-30d',
        endTime:   opts.endTime   || '*',
      });
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  DATA ACCESS — SERVERS / DATABASES
  // ═══════════════════════════════════════════════════════════════

  /**
   * קבלת רשימת Data Archive servers.
   * @returns {Promise<{Items: Array}>}
   */
  async function getDataServers() {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/dataservers');
      }
      return await _mockGet('/piwebapi/dataservers');
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  /**
   * קבלת רשימת Asset Databases.
   * @returns {Promise<{Items: Array}>}
   */
  async function getDatabases() {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        return await _liveGet('/assetservers/' + (_config._afServerId || 'default') + '/assetdatabases');
      }
      return await _mockGet('/piwebapi/assetservers/WAFS_IEC_MOCK_001/assetdatabases');
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  WRITE OPERATIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * כתיבת ערך לתג.
   *
   * ב-DEMO/FULL_SIMULATION: מחזיר WriteResult מדומה עם audit trail.
   * ב-LIVE: מבצע כתיבה אמיתית דרך PIV_CONNECTOR.
   *
   * @param {string} webId
   * @param {number|string|boolean} value
   * @param {string} [timestamp]  — ISO timestamp (ברירת מחדל: now)
   * @returns {Promise<{ok: boolean, webId, value, timestamp, mode, message}>}
   */
  async function writeValue(webId, value, timestamp) {
    _resolveDeps();
    const ts = timestamp || new Date().toISOString();

    if (_mode === MODES.LIVE) {
      if (!global.PIV_CONNECTOR) {
        throw new Error('PIV_CONNECTOR לא נטען — לא ניתן לכתוב ב-LIVE mode');
      }
      try {
        await global.PIV_CONNECTOR.DataAccess.writeValue(webId, { Value: value, Timestamp: ts });
        return { ok: true, webId, value, timestamp: ts, mode: 'LIVE', message: 'ערך נכתב בהצלחה לשרת PI' };
      } catch (err) {
        _trackError();
        throw err;
      }
    }

    // Simulation: stub write with audit log
    const entry = { webId, value, timestamp: ts, mode: _mode, writtenAt: new Date().toISOString() };
    _writeLog.push(entry);
    if (_writeLog.length > 200) _writeLog.shift();
    _emit('write', entry);
    console.info('[PIAdapter] Write stub (' + _mode + '):', entry);
    return { ok: true, ...entry, message: 'כתיבה מדומה (' + _mode + ') — לא נשמר בשרת PI אמיתי' };
  }

  /** Audit log for simulated writes */
  const _writeLog = [];

  /** מחזיר את ה-write audit log. */
  function getWriteLog() { return [..._writeLog]; }

  // ═══════════════════════════════════════════════════════════════
  //  BATCH REQUESTS
  // ═══════════════════════════════════════════════════════════════

  /**
   * שולח batch של בקשות.
   * @param {object} requests  — { key: { Method, Resource, [Body] } }
   * @returns {Promise<object>}
   */
  async function batchRequest(requests) {
    _resolveDeps();
    try {
      if (_mode === MODES.LIVE) {
        if (!global.PIV_CONNECTOR) throw new Error('PIV_CONNECTOR לא נטען');
        return await global.PIV_CONNECTOR.DataAccess.batch(requests);
      }
      if (!_mock) throw new Error('PIWebAPIMock לא נטען');
      const t0 = performance.now();
      const result = await _mock.batch(requests);
      _track(performance.now() - t0);
      return result;
    } catch (err) {
      _trackError();
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  REAL-TIME SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════

  /**
   * מנוי לעדכוני ערכים בזמן אמת.
   *
   * @param {string[]} webIds
   * @param {function} callback  — קרוי עם Array<{webId, value, timestamp, good}>
   * @param {number} [intervalMs]  — ברירת מחדל: 5000ms
   * @returns {string} subscriptionId
   */
  function subscribe(webIds, callback, intervalMs) {
    _resolveDeps();
    const id = 'sub_' + (++_subIdCounter);
    intervalMs = intervalMs || 5000;

    const poll = async () => {
      try {
        let results;
        if (_mode === MODES.LIVE && global.PIV_CONNECTOR) {
          results = await global.PIV_CONNECTOR.DataAccess.getMultiSnapshot(webIds);
        } else {
          results = await getMultiSnapshot(webIds);
        }
        // Normalize to unified format
        const normalized = results.map(item => ({
          webId:     item.WebId || item.webId,
          value:     item.Value ? item.Value.Value : (item.value !== undefined ? item.value : null),
          timestamp: item.Value ? item.Value.Timestamp : (item.timestamp || new Date().toISOString()),
          good:      item.Value ? item.Value.Good : (item.good !== false),
          error:     item.Exception ? item.Exception.Message : null,
        }));
        try { callback(normalized); } catch (_) {}
        _emit('subscription:values', { id, values: normalized });
      } catch (err) {
        _emit('subscription:error', { id, error: err.message });
      }
    };

    poll(); // immediate first tick
    const intervalId = setInterval(poll, intervalMs);
    _subscriptions.set(id, { intervalId, webIds, callback, intervalMs });
    _emit('subscription:started', { id, webIds, intervalMs });
    return id;
  }

  /**
   * ביטול מנוי.
   * @param {string} subscriptionId
   */
  function unsubscribe(subscriptionId) {
    const sub = _subscriptions.get(subscriptionId);
    if (sub) {
      clearInterval(sub.intervalId);
      _subscriptions.delete(subscriptionId);
      _emit('subscription:stopped', { id: subscriptionId });
    }
  }

  /** ביטול כל המנויים. */
  function unsubscribeAll() {
    _subscriptions.forEach((_, id) => unsubscribe(id));
  }

  // ═══════════════════════════════════════════════════════════════
  //  METRICS
  // ═══════════════════════════════════════════════════════════════

  /**
   * מחזיר מדדי ביצועים ומצב.
   */
  function getMetrics() {
    return {
      mode:          _mode,
      calls:         _metrics.calls,
      errors:        _metrics.errors,
      cacheHits:     _metrics.cacheHits,
      avgLatencyMs:  _metrics.avgLatency,
      subscriptions: _subscriptions.size,
      writesLogged:  _writeLog.length,
      backends: {
        mock:      !!_mock,
        afLayer:   !!_af,
        connector: !!global.PIV_CONNECTOR,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUTO-INIT
  // ═══════════════════════════════════════════════════════════════

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _resolveDeps);
  } else {
    _resolveDeps();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  global.PIAdapter = {
    // Constants
    MODES,

    // Mode management
    getMode,
    setMode,
    getConfig,
    configure,

    // Snapshots
    getSnapshot,
    getMultiSnapshot,

    // History
    getHistory,
    getInterpolated,
    getSummary,

    // Tags
    searchTags,
    getTagDetails,

    // AF Hierarchy
    getElements,
    getAttributes,
    getAttributeValue,

    // Event Frames & metadata
    getEventFrames,
    getDataServers,
    getDatabases,

    // Write
    writeValue,
    getWriteLog,

    // Batch
    batchRequest,

    // Subscriptions
    subscribe,
    unsubscribe,
    unsubscribeAll,

    // Metrics & events
    getMetrics,
    on,
    off,

    // Internal (for testing)
    _validateLiveConfig,
    _resolveDeps,
  };

})(typeof window !== 'undefined' ? window : global);
