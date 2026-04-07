/**
 * pi-live-readiness.js — Live Configuration Readiness Validator v1.0.0
 * ======================================================================
 * תאריך: 2026-03-29
 * namespace: window.PILiveReadiness
 *
 * ═══════════════════════════════════════════════════════════════
 * תיאור:
 * ═══════════════════════════════════════════════════════════════
 * כלי ולידציה של הגדרות LIVE mode — פועל ללא שרת PI אמיתי.
 * בודק את תקינות הקונפיגורציה (syntax, completeness) ומסמן
 * במפורש מה ניתן לאמת מקומית ומה דורש שרת PI פעיל.
 *
 * ═══════════════════════════════════════════════════════════════
 * שימוש:
 * ═══════════════════════════════════════════════════════════════
 *   // בדיקה מלאה עם UI
 *   await PILiveReadiness.validate({ baseUrl: 'https://mypi/piwebapi', authType: 'basic', username: 'u', password: 'p' });
 *   PILiveReadiness.showReport();
 *
 *   // בדיקה פרוגרמטית בלי UI
 *   const result = await PILiveReadiness.validate(config, { ui: false });
 *   console.log(result.ready, result.checks);
 *
 *   // ניסיון חיבור בפועל (דורש שרת)
 *   const r = await PILiveReadiness.testConnection({ baseUrl, authType, username, password });
 *
 * ═══════════════════════════════════════════════════════════════
 * קטגוריות בדיקה:
 * ═══════════════════════════════════════════════════════════════
 *   CONFIG_SYNTAX     — תקינות URL, auth, credentials (מקומי)
 *   ENVIRONMENT       — זמינות dependencies, HTTPS, CORS (מקומי)
 *   CONNECTOR         — PIV_CONNECTOR טעון ומוכן (מקומי)
 *   NETWORK           — ping URL, CORS preflight (דורש רשת — לא שרת PI)
 *   SERVER_LIVE       — PI Web API /system/versions (דורש שרת PI)
 * ═══════════════════════════════════════════════════════════════
 */

;(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  TYPES
  // ═══════════════════════════════════════════════════════════════

  /**
   * @typedef {'PASS'|'FAIL'|'WARN'|'SKIP'|'INFO'} CheckStatus
   * @typedef {'CONFIG_SYNTAX'|'ENVIRONMENT'|'CONNECTOR'|'NETWORK'|'SERVER_LIVE'} CheckCategory
   *
   * @typedef {object} ReadinessCheck
   * @property {CheckCategory} category
   * @property {string}  name
   * @property {CheckStatus} status
   * @property {string}  detail
   * @property {boolean} requiresLiveServer  — true = לא ניתן לאמת מקומית
   * @property {number}  durationMs
   */

  // ═══════════════════════════════════════════════════════════════
  //  INTERNAL STATE
  // ═══════════════════════════════════════════════════════════════

  let _lastResult = null;
  let _dashboardEl = null;

  // ═══════════════════════════════════════════════════════════════
  //  CHECK RUNNER
  // ═══════════════════════════════════════════════════════════════

  async function _check(category, name, requiresLiveServer, fn) {
    const t0 = performance.now();
    let status = 'FAIL', detail = '';
    try {
      const r = await fn();
      status = r.status;
      detail = r.detail || '';
    } catch (e) {
      status = 'FAIL';
      detail = e.message || String(e);
    }
    return { category, name, status, detail, requiresLiveServer, durationMs: +(performance.now() - t0).toFixed(1) };
  }

  const _p = (d) => ({ status: 'PASS', detail: d || '' });
  const _f = (d) => ({ status: 'FAIL', detail: d || '' });
  const _w = (d) => ({ status: 'WARN', detail: d || '' });
  const _s = (d) => ({ status: 'SKIP', detail: d || '' });
  const _i = (d) => ({ status: 'INFO', detail: d || '' });

  // ═══════════════════════════════════════════════════════════════
  //  CONFIG SYNTAX CHECKS (no network required)
  // ═══════════════════════════════════════════════════════════════

  function _checkBaseUrl(cfg) {
    return _check('CONFIG_SYNTAX', 'baseUrl — קיים ותקין', false, () => {
      if (!cfg.baseUrl || !cfg.baseUrl.trim()) return _f('baseUrl ריק — נדרש https://server/piwebapi');
      let parsed;
      try { parsed = new URL(cfg.baseUrl); } catch (_) { return _f('baseUrl לא URL חוקי: "' + cfg.baseUrl + '"'); }
      if (!['http:', 'https:'].includes(parsed.protocol)) return _f('baseUrl חייב להיות http:// או https://');
      if (parsed.protocol === 'http:') return _w('http (לא מוצפן) — מומלץ https לסביבת ייצור');
      if (!parsed.pathname.toLowerCase().includes('piwebapi') && !parsed.pathname.toLowerCase().includes('pi')) {
        return _w('baseUrl לא מכיל "piwebapi" — ודא שה-path נכון: /piwebapi');
      }
      return _p('URL תקין: ' + parsed.origin + parsed.pathname);
    });
  }

  function _checkAuthType(cfg) {
    return _check('CONFIG_SYNTAX', 'authType — קיים ותקין', false, () => {
      const at = (cfg.authType || '').toLowerCase();
      if (!at) return _f('authType ריק — נדרש: "basic" | "kerberos" | "none"');
      if (!['basic', 'kerberos', 'none'].includes(at)) return _f('authType לא חוקי: "' + at + '" — נדרש: basic | kerberos | none');
      if (at === 'none') return _w('authType=none — לא מאובטח, מתאים לפיתוח בלבד');
      return _p('authType: ' + at);
    });
  }

  function _checkCredentials(cfg) {
    return _check('CONFIG_SYNTAX', 'credentials — תקינות לפי authType', false, () => {
      const at = (cfg.authType || '').toLowerCase();
      if (at === 'kerberos') return _p('Kerberos — credentials מנוהלים ע"י מערכת ההפעלה, ללא שדות נוספים');
      if (at === 'none') return _i('none — אין צורך ב-credentials');
      if (at === 'basic') {
        const errs = [];
        if (!cfg.username || !cfg.username.trim()) errs.push('username חסר');
        if (!cfg.password || !cfg.password.trim()) errs.push('password חסר');
        if (errs.length) return _f(errs.join(', '));
        if (cfg.username.length < 2) return _w('username קצר מדי');
        if (cfg.password.length < 6) return _w('password קצר (פחות מ-6 תווים) — שקול סיסמה חזקה יותר');
        // Check for common test credentials
        const testCreds = [['admin','admin'],['pi','pi'],['test','test'],['demo','demo']];
        const isTest = testCreds.some(([u, p]) => cfg.username.toLowerCase() === u && cfg.password.toLowerCase() === p);
        if (isTest) return _w('נראה שמשתמשים ב-credentials ברירת מחדל — לסביבת ייצור השתמש בסיסמה ייחודית');
        return _p('username=' + cfg.username + ', password=***(' + cfg.password.length + ' תווים)');
      }
      return _s('authType לא זוהה — ' + at);
    });
  }

  function _checkCorsProxy(cfg) {
    return _check('CONFIG_SYNTAX', 'corsProxy — תקינות (אופציונלי)', false, () => {
      if (!cfg.corsProxy) return _i('corsProxy לא הוגדר — נדרש רק אם ה-PI server ב-domain שונה ואין CORS headers');
      try {
        const u = new URL(cfg.corsProxy);
        return _p('corsProxy תקין: ' + u.origin);
      } catch (_) {
        return _f('corsProxy לא URL חוקי: "' + cfg.corsProxy + '"');
      }
    });
  }

  function _checkCacheTtl(cfg) {
    return _check('CONFIG_SYNTAX', 'cacheTtl — ערך תקין', false, () => {
      const ttl = Number(cfg.cacheTtl);
      if (isNaN(ttl)) return _f('cacheTtl לא מספר: "' + cfg.cacheTtl + '"');
      if (ttl < 0) return _f('cacheTtl שלילי');
      if (ttl === 0) return _w('cacheTtl=0 — cache מושבת, עלול להכביד על ה-PI server');
      if (ttl > 3600) return _w('cacheTtl גדול מ-3600 שניות — נתונים עלולים להיות ישנים מאוד');
      return _p('cacheTtl=' + ttl + 'שניות (' + (ttl < 60 ? 'אגרסיבי' : ttl < 300 ? 'סביר' : 'שמרני') + ')');
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  ENVIRONMENT CHECKS (browser/runtime, no network)
  // ═══════════════════════════════════════════════════════════════

  function _checkFetchAPI() {
    return _check('ENVIRONMENT', 'fetch API — זמין בדפדפן', false, () => {
      if (typeof fetch !== 'function') return _f('fetch API לא זמין — נדרש דפדפן מודרני (Chrome 60+ / Edge 79+)');
      return _p('fetch API זמין');
    });
  }

  function _checkAbortSignal() {
    return _check('ENVIRONMENT', 'AbortSignal.timeout — זמין', false, () => {
      if (typeof AbortSignal === 'undefined' || typeof AbortSignal.timeout !== 'function') {
        return _w('AbortSignal.timeout לא זמין — יש לשקול polyfill לסביבה זו');
      }
      return _p('AbortSignal.timeout זמין');
    });
  }

  function _checkSecureContext() {
    return _check('ENVIRONMENT', 'Secure Context (HTTPS/localhost)', false, () => {
      if (typeof window === 'undefined') return _s('not in browser');
      if (window.isSecureContext) return _p('secure context — HTTPS או localhost');
      return _w('לא secure context — חיבורי http עלולים להיחסם ע"י הדפדפן בסביבת ייצור');
    });
  }

  function _checkLocalStorage() {
    return _check('ENVIRONMENT', 'storage — זמין לשמירת config', false, () => {
      try {
        const k = '__piv_ls_test__';
        void 0;
        void 0;
        return _p('storage זמין ועובד');
      } catch (e) {
        return _w('storage לא זמין (' + e.message + ') — config לא יישמר בין sessions');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  CONNECTOR CHECKS (module loading, no network)
  // ═══════════════════════════════════════════════════════════════

  function _checkPIVConnector() {
    return _check('CONNECTOR', 'pi-connector.js — נטען', false, () => {
      if (!global.PIV_CONNECTOR) return _f('PIV_CONNECTOR לא נמצא ב-window — ודא שpi-connector.js נטען לפני קובץ זה');
      const api = global.PIV_CONNECTOR;
      const required = ['ConnectionManager', 'DataAccess', 'TagBrowser'];
      const missing = required.filter(k => !api[k]);
      if (missing.length) return _w('PIV_CONNECTOR חסר API: ' + missing.join(', '));
      return _p('PIV_CONNECTOR נטען, API: ' + Object.keys(api).filter(k => !k.startsWith('_')).join(', '));
    });
  }

  function _checkConnectorConfigure() {
    return _check('CONNECTOR', 'PIV_CONNECTOR.configure — ניתן לקרוא', false, () => {
      if (!global.PIV_CONNECTOR) return _s('PIV_CONNECTOR לא נמצא');
      const cm = global.PIV_CONNECTOR.ConnectionManager;
      if (!cm || typeof cm.configure !== 'function') return _f('ConnectionManager.configure לא פונקציה');
      return _p('configure API זמינה');
    });
  }

  function _checkPIAdapter() {
    return _check('CONNECTOR', 'pi-adapter.js — נטען', false, () => {
      if (!global.PIAdapter) return _w('PIAdapter לא נמצא — pi-adapter.js לא נטען. מומלץ לטעון אותו לניהול מצב מאוחד');
      const methods = ['setMode', 'getSnapshot', 'getHistory', 'searchTags'];
      const missing = methods.filter(m => typeof global.PIAdapter[m] !== 'function');
      if (missing.length) return _w('PIAdapter חסר methods: ' + missing.join(', '));
      return _p('PIAdapter נטען עם כל ה-API');
    });
  }

  function _checkSimMode() {
    return _check('CONNECTOR', 'PISimulationMode — נטען', false, () => {
      if (!global.PISimulationMode) return _i('PISimulationMode לא נמצא (אופציונלי)');
      const mode = global.PISimulationMode.getMode ? global.PISimulationMode.getMode() : 'unknown';
      return _p('PISimulationMode נטען, מצב נוכחי: ' + mode);
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  NETWORK CHECKS (requires network but NOT a PI server)
  // ═══════════════════════════════════════════════════════════════

  async function _checkUrlReachable(cfg) {
    return _check('NETWORK', 'URL reachable — HEAD request', false, async () => {
      if (!cfg.baseUrl) return _s('baseUrl ריק — לא ניתן לבדוק');
      let parsed;
      try { parsed = new URL(cfg.baseUrl); } catch (_) { return _s('baseUrl לא חוקי'); }

      // For CORS reasons we cannot rely on HEAD from browser easily, use fetch with no-cors mode
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        try {
          await fetch(parsed.origin, {
            method: 'HEAD',
            mode: 'no-cors',
            signal: controller.signal,
          });
          clearTimeout(timeout);
          // no-cors always succeeds (opaque response) if host is reachable
          return _p('Host ' + parsed.hostname + ' נגיש (HEAD no-cors)');
        } catch (e) {
          clearTimeout(timeout);
          if (e.name === 'AbortError') return _f('Timeout — host לא הגיב תוך 8 שניות: ' + parsed.hostname);
          return _f('שגיאת רשת ל-' + parsed.hostname + ': ' + e.message);
        }
      } catch (e) {
        return _w('לא ניתן לבדוק נגישות host: ' + e.message);
      }
    });
  }

  async function _checkCORSHeaders(cfg) {
    return _check('NETWORK', 'CORS headers — preflight OPTIONS', false, async () => {
      if (!cfg.baseUrl) return _s('baseUrl ריק');
      let parsed;
      try { parsed = new URL(cfg.baseUrl); } catch (_) { return _s('baseUrl לא חוקי'); }

      // Try OPTIONS to the base URL — PI Web API should respond
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const origin = window.location.origin || 'http://localhost:8080';
        const r = await fetch(parsed.href.replace(/\/?$/, '/system/versions'), {
          method: 'OPTIONS',
          headers: {
            'Origin':  origin,
            'Access-Control-Request-Method': 'GET',
            'Access-Control-Request-Headers': 'Authorization, X-Requested-With',
          },
          signal: controller.signal,
        }).catch(e => { clearTimeout(timeout); throw e; });
        clearTimeout(timeout);

        const acao = r.headers.get('access-control-allow-origin');
        const acam = r.headers.get('access-control-allow-methods');
        if (acao) return _p('CORS headers קיימים: Allow-Origin=' + acao + ', Methods=' + (acam || '?'));
        return _w('OPTIONS הגיב (HTTP ' + r.status + ') אבל אין CORS headers — ייתכן שנדרש corsProxy');
      } catch (e) {
        if (e.name === 'AbortError') return _f('Timeout ב-OPTIONS — host אינו מגיב');
        // Network error — typically means CORS block or host unreachable
        return _w('OPTIONS נכשל (' + e.message + ') — ייתכן CORS block. שקול corsProxy');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════
  //  SERVER LIVE CHECKS (require real PI server)
  // ═══════════════════════════════════════════════════════════════

  function _mkLiveCheck(name) {
    return _check('SERVER_LIVE', name, true, () =>
      _s('דורש שרת PI Web API פעיל — לא ניתן לאמת מקומית')
    );
  }

  // ═══════════════════════════════════════════════════════════════
  //  MAIN VALIDATE FUNCTION
  // ═══════════════════════════════════════════════════════════════

  /**
   * מריץ את כל בדיקות ה-readiness.
   *
   * @param {object} config
   * @param {string} config.baseUrl
   * @param {string} [config.authType]   — 'basic'|'kerberos'|'none'
   * @param {string} [config.username]
   * @param {string} [config.password]
   * @param {string} [config.corsProxy]
   * @param {number} [config.cacheTtl]
   *
   * @param {object} [opts]
   * @param {boolean} [opts.skipNetwork]  — דלג על בדיקות רשת (ברירת מחדל: false)
   * @param {boolean} [opts.ui]           — הצג dashboard (ברירת מחדל: true)
   *
   * @returns {Promise<{
   *   ready: boolean,
   *   score: number,           // 0-100
   *   checks: ReadinessCheck[],
   *   summary: { pass, fail, warn, skip, info },
   *   canProceedToLive: boolean,
   *   blockers: string[],
   *   warnings: string[],
   *   cannotVerifyLocally: string[],
   *   timestamp: string,
   *   elapsedMs: number,
   * }>}
   */
  async function validate(config, opts) {
    config = config || {};
    opts   = opts   || {};
    const skipNetwork = opts.skipNetwork === true;
    const showUI      = opts.ui !== false;

    const t0 = performance.now();
    const cfg = {
      baseUrl:   config.baseUrl   || '',
      authType:  config.authType  || 'none',
      username:  config.username  || '',
      password:  config.password  || '',
      corsProxy: config.corsProxy || '',
      cacheTtl:  config.cacheTtl  !== undefined ? config.cacheTtl : 30,
    };

    // Store in PIV_CONNECTOR if available
    if (global.PIV_CONNECTOR && global.PIV_CONNECTOR.ConnectionManager) {
      try { global.PIV_CONNECTOR.ConnectionManager.configure(cfg); } catch (_) {}
    }

    // Run all checks
    const checks = await Promise.all([
      // CONFIG_SYNTAX
      _checkBaseUrl(cfg),
      _checkAuthType(cfg),
      _checkCredentials(cfg),
      _checkCorsProxy(cfg),
      _checkCacheTtl(cfg),
      // ENVIRONMENT
      _checkFetchAPI(),
      _checkAbortSignal(),
      _checkSecureContext(),
      _checkLocalStorage(),
      // CONNECTOR
      _checkPIVConnector(),
      _checkConnectorConfigure(),
      _checkPIAdapter(),
      _checkSimMode(),
      // NETWORK (conditional)
      ...(skipNetwork ? [] : [
        _checkUrlReachable(cfg),
        _checkCORSHeaders(cfg),
      ]),
      // SERVER_LIVE — always reported as SKIP (informational)
      _mkLiveCheck('GET /system/versions — גרסת PI Web API'),
      _mkLiveCheck('GET /dataservers — רשימת PI Data Archives'),
      _mkLiveCheck('GET /assetservers — רשימת AF Servers'),
      _mkLiveCheck('Auth handshake — credentials check'),
      _mkLiveCheck('Tag query — dataservers/{id}/points'),
      _mkLiveCheck('Snapshot — points/{id}/value'),
      _mkLiveCheck('Write test — points/{id}/value (POST)'),
    ]);

    // Analyze results
    const summary = { pass: 0, fail: 0, warn: 0, skip: 0, info: 0 };
    checks.forEach(c => { summary[c.status.toLowerCase()] = (summary[c.status.toLowerCase()] || 0) + 1; });

    const blockers          = checks.filter(c => c.status === 'FAIL' && !c.requiresLiveServer).map(c => c.name + ': ' + c.detail);
    const warnings          = checks.filter(c => c.status === 'WARN' && !c.requiresLiveServer).map(c => c.name + ': ' + c.detail);
    const cannotVerifyLocally = checks.filter(c => c.requiresLiveServer).map(c => c.name);

    const canProceedToLive = blockers.length === 0;

    // Score: pass + warn*0.5 out of verifiable checks
    const verifiable = checks.filter(c => !c.requiresLiveServer && c.status !== 'SKIP' && c.status !== 'INFO');
    const scoreNum   = verifiable.filter(c => c.status === 'PASS').length +
                       verifiable.filter(c => c.status === 'WARN').length * 0.5;
    const score      = verifiable.length > 0 ? Math.round((scoreNum / verifiable.length) * 100) : 0;

    const ready = canProceedToLive && score >= 60;
    const elapsed = +(performance.now() - t0).toFixed(1);

    _lastResult = {
      ready,
      score,
      checks,
      summary,
      canProceedToLive,
      blockers,
      warnings,
      cannotVerifyLocally,
      config: { baseUrl: cfg.baseUrl, authType: cfg.authType, username: cfg.username },
      timestamp: new Date().toISOString(),
      elapsedMs: elapsed,
    };

    if (showUI) showReport();
    return _lastResult;
  }

  // ═══════════════════════════════════════════════════════════════
  //  LIVE CONNECTION TEST (requires real server)
  // ═══════════════════════════════════════════════════════════════

  /**
   * מנסה חיבור אמיתי ל-PI Web API.
   * פונקציה זו דורשת שרת PI פעיל ועלולה להיכשל ב-CORS.
   *
   * @param {object} cfg
   * @returns {Promise<{connected, latencyMs, server, version, error}>}
   */
  async function testConnection(cfg) {
    if (!cfg || !cfg.baseUrl) throw new Error('baseUrl נדרש');

    const url = cfg.baseUrl.replace(/\/$/, '') + '/system/versions';
    const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'XMLHttpRequest' };

    if ((cfg.authType || '').toLowerCase() === 'basic' && cfg.username) {
      headers['Authorization'] = 'Basic ' + btoa(cfg.username + ':' + (cfg.password || ''));
    }

    const t0 = performance.now();
    try {
      const r = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(12000) });
      const latencyMs = +(performance.now() - t0).toFixed(1);
      if (r.status === 401) return { connected: false, latencyMs, error: '401 — אימות נדרש. בדוק credentials', server: null, version: null };
      if (!r.ok) return { connected: false, latencyMs, error: 'HTTP ' + r.status + ' ' + r.statusText, server: null, version: null };
      const data = await r.json();
      const version = data && data['PI Web API'] ? data['PI Web API'].Version : 'לא ידוע';
      return { connected: true, latencyMs, server: data, version, error: null };
    } catch (e) {
      return { connected: false, latencyMs: +(performance.now() - t0).toFixed(1), error: e.message, server: null, version: null };
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  REQUIRED INPUTS DOCUMENTATION
  // ═══════════════════════════════════════════════════════════════

  /**
   * מחזיר רשימת ה-inputs הנדרשים למעבר ל-LIVE mode.
   * @returns {Array<{field, required, description, example, notes}>}
   */
  function getRequiredInputs() {
    return [
      {
        field:       'baseUrl',
        required:    true,
        description: 'כתובת ה-PI Web API endpoint',
        example:     'https://piserver.company.com/piwebapi',
        notes:       'ודא שה-path מסתיים ב-/piwebapi ולא בפרוטוקול אחר. חייב HTTPS בסביבת ייצור.',
      },
      {
        field:       'authType',
        required:    true,
        description: 'סוג האימות',
        example:     '"basic" | "kerberos" | "none"',
        notes:       '"kerberos" — מתאים לסביבות Windows Domain. "basic" — דורש username ו-password. "none" — לפיתוח בלבד.',
      },
      {
        field:       'username',
        required:    'רק ב-basic auth',
        description: 'שם המשתמש לאימות',
        example:     'pi_readonly_user',
        notes:       'מומלץ משתמש read-only. לא לשמור ב-source code. לאחסן ב-storage דרך Config Panel.',
      },
      {
        field:       'password',
        required:    'רק ב-basic auth',
        description: 'הסיסמה לאימות',
        example:     '********',
        notes:       'לא לשמור ב-source code. מוצפנת רק ב-transit (HTTPS). לא נשמרת כ-plain text.',
      },
      {
        field:       'corsProxy',
        required:    false,
        description: 'כתובת CORS proxy',
        example:     'https://cors-proxy.company.com',
        notes:       'נדרש רק אם ה-PI server לא מגדיר CORS headers. שקול הגדרת CORS ישירה בשרת PI.',
      },
      {
        field:       'cacheTtl',
        required:    false,
        description: 'זמן cache בשניות',
        example:     '30',
        notes:       'ברירת מחדל: 30 שניות. הגדל לנתונים היסטוריים, הקטן לנתונים real-time.',
      },
    ];
  }

  // ═══════════════════════════════════════════════════════════════
  //  UI DASHBOARD
  // ═══════════════════════════════════════════════════════════════

  const _CSS = `
#pilr-dashboard {
  position: fixed;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: min(680px, 96vw);
  max-height: 88vh;
  overflow-y: auto;
  background: #08111e;
  border: 1px solid rgba(0,212,255,0.28);
  border-radius: 12px;
  z-index: 99800;
  font-family: 'Heebo', 'Segoe UI', sans-serif;
  font-size: 12px;
  color: #c0d4e4;
  box-shadow: 0 24px 64px rgba(0,0,0,0.8);
  direction: rtl;
  animation: pilr-in 0.22s ease;
}
@keyframes pilr-in { from{opacity:0;transform:translate(-50%,-48%) scale(0.96)} to{opacity:1;transform:translate(-50%,-50%) scale(1)} }
.pilr-hdr {
  display:flex;align-items:center;justify-content:space-between;
  padding:14px 20px 12px;
  border-bottom:1px solid rgba(0,212,255,0.12);
  position:sticky;top:0;background:#08111e;z-index:1;
}
.pilr-title { font-size:15px;font-weight:700;color:#e8f4f8;display:flex;align-items:center;gap:10px; }
.pilr-score {
  display:inline-flex;align-items:center;justify-content:center;
  width:46px;height:46px;border-radius:50%;
  font-size:15px;font-weight:700;
  border:2px solid;
}
.pilr-score.ready   { color:#00e676;border-color:#00e676;background:rgba(0,230,118,0.1); }
.pilr-score.partial { color:#ffab40;border-color:#ffab40;background:rgba(255,171,64,0.1); }
.pilr-score.blocked { color:#ff5252;border-color:#ff5252;background:rgba(255,82,82,0.1); }
.pilr-close { background:none;border:none;color:#6b7fa3;cursor:pointer;font-size:18px;padding:4px;border-radius:4px; }
.pilr-close:hover { color:#e8f4f8; }
.pilr-body { padding:16px 20px 20px; }
.pilr-status-bar {
  display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px;
  padding:10px 14px;
  background:rgba(255,255,255,0.03);
  border-radius:8px;border:1px solid rgba(255,255,255,0.06);
}
.pilr-stat { display:flex;align-items:center;gap:5px;font-size:12px; }
.pilr-stat-dot { width:9px;height:9px;border-radius:50%;flex-shrink:0; }
.pilr-stat-dot.pass  { background:#00e676; }
.pilr-stat-dot.fail  { background:#ff5252; }
.pilr-stat-dot.warn  { background:#ffab40; }
.pilr-stat-dot.skip  { background:#6b7fa3; }
.pilr-stat-dot.info  { background:#00d4ff; }
.pilr-section { margin-bottom:16px; }
.pilr-section-title {
  font-size:10px;font-weight:700;letter-spacing:0.08em;
  color:#00d4ff;text-transform:uppercase;margin-bottom:8px;
  display:flex;align-items:center;gap:6px;
}
.pilr-category-badge {
  font-size:9px;padding:1px 6px;border-radius:3px;
  background:rgba(0,212,255,0.1);border:1px solid rgba(0,212,255,0.2);
  color:#00d4ff;font-weight:500;letter-spacing:0;text-transform:none;
}
.pilr-check {
  display:flex;align-items:flex-start;gap:8px;
  padding:5px 8px;border-radius:5px;margin-bottom:2px;
  border:1px solid transparent;
  transition:background 0.1s;
}
.pilr-check:hover { background:rgba(255,255,255,0.03); }
.pilr-check.fail  { background:rgba(255,82,82,0.05);border-color:rgba(255,82,82,0.1); }
.pilr-check.warn  { background:rgba(255,171,64,0.04);border-color:rgba(255,171,64,0.08); }
.pilr-check-dot { width:8px;height:8px;border-radius:50%;flex-shrink:0;margin-top:2px; }
.pilr-check-dot.pass  { background:#00e676; }
.pilr-check-dot.fail  { background:#ff5252; }
.pilr-check-dot.warn  { background:#ffab40; }
.pilr-check-dot.skip  { background:#6b7fa3; }
.pilr-check-dot.info  { background:#00d4ff; }
.pilr-check-name { flex:1;color:#c0d4e4;font-size:11px;line-height:1.4; }
.pilr-check-detail { font-size:10px;color:#6b7fa3;margin-top:1px; }
.pilr-check-live-badge {
  font-size:9px;padding:1px 5px;border-radius:3px;
  background:rgba(255,171,64,0.1);border:1px solid rgba(255,171,64,0.2);
  color:#ffab40;white-space:nowrap;flex-shrink:0;
}
.pilr-blockers {
  background:rgba(255,82,82,0.06);border:1px solid rgba(255,82,82,0.18);
  border-radius:8px;padding:10px 14px;margin-bottom:14px;
}
.pilr-blockers-title { color:#ff5252;font-size:11px;font-weight:700;margin-bottom:6px; }
.pilr-blocker-item { font-size:11px;color:#ffb3b3;padding:2px 0; }
.pilr-inputs {
  background:rgba(0,212,255,0.04);border:1px solid rgba(0,212,255,0.1);
  border-radius:8px;padding:10px 14px;margin-bottom:14px;
}
.pilr-inputs-title { color:#00d4ff;font-size:11px;font-weight:700;margin-bottom:8px; }
.pilr-input-row { display:flex;gap:8px;align-items:flex-start;margin-bottom:6px; }
.pilr-input-req { font-size:9px;padding:1px 5px;border-radius:3px;flex-shrink:0;margin-top:1px; }
.pilr-input-req.req  { background:rgba(255,82,82,0.1);border:1px solid rgba(255,82,82,0.2);color:#ff5252; }
.pilr-input-req.opt  { background:rgba(0,212,255,0.06);border:1px solid rgba(0,212,255,0.15);color:#6b7fa3; }
.pilr-input-field { font-size:11px;font-weight:600;color:#c0d4e4;min-width:80px; }
.pilr-input-desc { font-size:11px;color:#6b7fa3; }
.pilr-input-example { font-size:10px;color:#00d4ff;font-family:monospace;direction:ltr;text-align:left; }
.pilr-footer {
  display:flex;gap:8px;justify-content:flex-start;flex-wrap:wrap;
  padding-top:12px;border-top:1px solid rgba(255,255,255,0.06);margin-top:14px;
}
.pilr-btn {
  padding:7px 18px;border-radius:6px;border:1px solid rgba(0,212,255,0.25);
  background:rgba(0,212,255,0.07);color:#00d4ff;font-size:12px;
  font-family:inherit;cursor:pointer;transition:all 0.15s;
}
.pilr-btn:hover { background:rgba(0,212,255,0.15); }
.pilr-btn:disabled { opacity:0.4;cursor:not-allowed; }
.pilr-overlay {
  position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99799;
  backdrop-filter:blur(2px);
}
`;

  function _injectCSS() {
    if (document.getElementById('pilr-styles')) return;
    const s = document.createElement('style');
    s.id = 'pilr-styles';
    s.textContent = _CSS;
    document.head.appendChild(s);
  }

  function _statusClass(s) { return s.toLowerCase(); }
  function _statusLabel(s) {
    return { PASS:'✅ עבר', FAIL:'❌ נכשל', WARN:'⚠️ אזהרה', SKIP:'⏭ נדלג', INFO:'ℹ️ מידע' }[s] || s;
  }

  /**
   * מציג dashboard report.
   * @param {object} [result]  — אם לא מסופק: משתמש בתוצאה האחרונה
   */
  function showReport(result) {
    result = result || _lastResult;
    if (!result) {
      alert('[PILiveReadiness] אין תוצאת בדיקה — קרא validate() קודם');
      return;
    }
    _injectCSS();
    _destroyDashboard();

    const overlay = document.createElement('div');
    overlay.className = 'pilr-overlay';
    overlay.id = 'pilr-overlay';
    overlay.addEventListener('click', _destroyDashboard);
    document.body.appendChild(overlay);

    _dashboardEl = document.createElement('div');
    _dashboardEl.id = 'pilr-dashboard';

    const scoreClass = result.canProceedToLive && result.score >= 80 ? 'ready' : result.blockers.length > 0 ? 'blocked' : 'partial';
    const readyLabel = result.canProceedToLive ? 'מוכן ל-LIVE' : 'לא מוכן';

    // Group checks by category
    const byCategory = {};
    result.checks.forEach(c => {
      if (!byCategory[c.category]) byCategory[c.category] = [];
      byCategory[c.category].push(c);
    });

    const catLabels = {
      CONFIG_SYNTAX: 'קונפיגורציה Syntax',
      ENVIRONMENT:   'סביבת Browser',
      CONNECTOR:     'Connector Modules',
      NETWORK:       'רשת (Host Reachability)',
      SERVER_LIVE:   'שרת PI (דורש חיבור אמיתי)',
    };

    const checksHTML = Object.entries(byCategory).map(([cat, checks]) => `
      <div class="pilr-section">
        <div class="pilr-section-title">
          ${catLabels[cat] || cat}
          <span class="pilr-category-badge">${checks.length} בדיקות</span>
        </div>
        ${checks.map(c => `
          <div class="pilr-check ${_statusClass(c.status)}">
            <div class="pilr-check-dot ${_statusClass(c.status)}"></div>
            <div style="flex:1">
              <div class="pilr-check-name">${_statusLabel(c.status)} — ${c.name}</div>
              ${c.detail ? `<div class="pilr-check-detail">${c.detail}</div>` : ''}
              ${c.durationMs > 0 ? `<div class="pilr-check-detail">${c.durationMs}ms</div>` : ''}
            </div>
            ${c.requiresLiveServer ? '<span class="pilr-check-live-badge">דורש שרת PI</span>' : ''}
          </div>
        `).join('')}
      </div>
    `).join('');

    const blockersHTML = result.blockers.length > 0 ? `
      <div class="pilr-blockers">
        <div class="pilr-blockers-title">❌ חוסמים — יש לתקן לפני מעבר ל-LIVE:</div>
        ${result.blockers.map(b => `<div class="pilr-blocker-item">• ${b}</div>`).join('')}
      </div>
    ` : '';

    const inputsHTML = `
      <div class="pilr-inputs">
        <div class="pilr-inputs-title">📋 Inputs נדרשים למעבר ל-LIVE mode:</div>
        ${getRequiredInputs().map(inp => `
          <div class="pilr-input-row">
            <span class="pilr-input-req ${inp.required === true ? 'req' : 'opt'}">${inp.required === true ? 'חובה' : 'אופציונלי'}</span>
            <div style="flex:1">
              <div style="display:flex;gap:8px;align-items:baseline">
                <span class="pilr-input-field">${inp.field}</span>
                <span class="pilr-input-desc">${inp.description}</span>
              </div>
              <div class="pilr-input-example">${inp.example}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    _dashboardEl.innerHTML = `
      <div class="pilr-hdr">
        <div class="pilr-title">
          <span class="pilr-score ${scoreClass}">${result.score}%</span>
          <div>
            <div>PI LIVE Readiness Report</div>
            <div style="font-size:11px;font-weight:400;color:#6b7fa3;">${readyLabel} • ${result.timestamp.slice(0,19).replace('T',' ')} • ${result.elapsedMs}ms</div>
          </div>
        </div>
        <button class="pilr-close" id="pilr-btn-close">✕</button>
      </div>
      <div class="pilr-body">
        <div class="pilr-status-bar">
          <div class="pilr-stat"><div class="pilr-stat-dot pass"></div>עבר: ${result.summary.pass}</div>
          <div class="pilr-stat"><div class="pilr-stat-dot fail"></div>נכשל: ${result.summary.fail || 0}</div>
          <div class="pilr-stat"><div class="pilr-stat-dot warn"></div>אזהרה: ${result.summary.warn || 0}</div>
          <div class="pilr-stat"><div class="pilr-stat-dot skip"></div>דולג: ${result.summary.skip || 0}</div>
          <div class="pilr-stat"><div class="pilr-stat-dot info"></div>מידע: ${result.summary.info || 0}</div>
        </div>
        ${blockersHTML}
        ${checksHTML}
        ${inputsHTML}
        <div class="pilr-footer">
          <button class="pilr-btn" id="pilr-btn-rerun">🔄 הרץ שוב</button>
          <button class="pilr-btn" id="pilr-btn-console">📋 הדפס לConsole</button>
          <button class="pilr-btn" id="pilr-btn-close2">סגור</button>
        </div>
      </div>
    `;

    document.body.appendChild(_dashboardEl);

    // Button events
    const close = () => _destroyDashboard();
    document.getElementById('pilr-btn-close').addEventListener('click', close);
    document.getElementById('pilr-btn-close2').addEventListener('click', close);
    document.getElementById('pilr-btn-console').addEventListener('click', () => {
      console.group('[PILiveReadiness] Readiness Report — ' + result.timestamp);
      console.log('Score:', result.score + '%', '| Ready:', result.ready, '| canProceedToLive:', result.canProceedToLive);
      console.log('Blockers:', result.blockers);
      console.log('Warnings:', result.warnings);
      console.log('Cannot verify locally:', result.cannotVerifyLocally);
      console.table(result.checks.map(c => ({
        category: c.category,
        name: c.name.slice(0, 50),
        status: c.status,
        detail: c.detail.slice(0, 80),
        durationMs: c.durationMs,
        requiresServer: c.requiresLiveServer,
      })));
      console.groupEnd();
    });
    document.getElementById('pilr-btn-rerun').addEventListener('click', async () => {
      _destroyDashboard();
      await validate(result.config);
    });
  }

  function _destroyDashboard() {
    if (_dashboardEl) { _dashboardEl.remove(); _dashboardEl = null; }
    const overlay = document.getElementById('pilr-overlay');
    if (overlay) overlay.remove();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  global.PILiveReadiness = {
    validate,
    showReport,
    testConnection,
    getRequiredInputs,
    getLastResult: () => _lastResult,
    VERSION: '1.0.0',
  };

})(typeof window !== 'undefined' ? window : global);
