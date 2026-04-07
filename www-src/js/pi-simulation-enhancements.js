/**
 * pi-simulation-enhancements.js — Production-Like Simulation Enhancements v1.0.0
 * ==================================================================================
 * תאריך: 2026-03-29
 * namespace: window.PISimEnhancements
 *
 * ═══════════════════════════════════════════════════════════════
 * תיאור:
 * ═══════════════════════════════════════════════════════════════
 * מרחיב את שכבת ה-Simulation במצבים production-like נוספים
 * שלא היו ב-PIWebAPIMock הבסיסי:
 *
 *  1. DIURNAL CYCLE        — ערכים מושפעים משעת היום (עומס שיא 14:00-21:00)
 *  2. PLANT SHUTDOWN       — דמוי כיבוי מתוכנן של יחידת ייצור
 *  3. MAINTENANCE WINDOW   — חלון תחזוקה עם ערכים "System Off" / Questionable
 *  4. STALE DATA           — נתונים ישנים (System.DateTime לא מתקדם)
 *  5. RATE LIMITING        — הגבלת קצב קריאות (HTTP 429)
 *  6. SLOW RESPONSE        — עיכוב גדול (מדמה שרת עמוס)
 *  7. CASCADING FAILURE    — כשל מדורג: שגיאה ב-X% מהבקשות
 *  8. WRITE AUDIT TRAIL    — רישום כתיבות מדומות עם rollback
 *  9. BAD DATA QUALITY     — נקודות עם Good=false, Questionable=true
 * 10. ALARM STORM          — burst של event frames ב-קצב מהיר
 *
 * ═══════════════════════════════════════════════════════════════
 * שימוש:
 * ═══════════════════════════════════════════════════════════════
 *   // הפעל diurnal cycle על PIWebAPIMock
 *   PISimEnhancements.install();
 *
 *   // הפעל תרחיש ספציפי
 *   PISimEnhancements.setScenario('plant_shutdown', { webIds: ['WTAG001','WTAG002'], durationMs: 30000 });
 *
 *   // קבלת ערכים עם diurnal cycle
 *   const v = PISimEnhancements.generateValue('WTAG001');
 *
 *   // הפעל alarm storm
 *   PISimEnhancements.startAlarmStorm({ count: 20, intervalMs: 500 });
 *
 *   // ביטול כל התרחישים
 *   PISimEnhancements.clearAllScenarios();
 *
 * ═══════════════════════════════════════════════════════════════
 * תלויות:
 *   - pi-webapi-mock.js  (window.PIWebAPIMock) — נדרש לinstall()
 * ═══════════════════════════════════════════════════════════════
 */

;(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  SCENARIO DEFINITIONS
  // ═══════════════════════════════════════════════════════════════

  const SCENARIOS = Object.freeze({
    NORMAL:            'normal',
    PLANT_SHUTDOWN:    'plant_shutdown',
    MAINTENANCE:       'maintenance',
    STALE_DATA:        'stale_data',
    RATE_LIMITED:      'rate_limited',
    SLOW_RESPONSE:     'slow_response',
    CASCADING_FAILURE: 'cascading_failure',
    BAD_DATA_QUALITY:  'bad_data_quality',
    ALARM_STORM:       'alarm_storm',
  });

  // ═══════════════════════════════════════════════════════════════
  //  INTERNAL STATE
  // ═══════════════════════════════════════════════════════════════

  let _activeScenarios = new Set();
  let _scenarioOptions  = {};
  let _scenarioTimers   = {};
  let _installed        = false;
  let _alarmStormTimer  = null;
  let _syntheticAlarms  = [];

  // Persistent diurnal state per tag (initialized per WebId)
  const _diurnalState = {};

  // Write audit trail (simulated writes)
  const _writeAudit = [];

  // ═══════════════════════════════════════════════════════════════
  //  DIURNAL CYCLE ENGINE
  // ═══════════════════════════════════════════════════════════════

  /**
   * מחשב מקדם דיורנלי לשעת היום הנוכחית.
   * שיא עומס: 14:00-21:00 (מקדם ≈ 1.18)
   * שפל: 02:00-06:00 (מקדם ≈ 0.52)
   *
   * @param {string} [tagName]  — שמות שונים מקבלים offset שונה
   * @returns {number}  — 0.0 – 1.5 (1.0 = normal operating)
   */
  function diurnalFactor(tagName) {
    const now = new Date();
    const hourOfDay = now.getHours() + now.getMinutes() / 60;

    // Base diurnal pattern: morning ramp → afternoon peak → evening shoulder → night valley
    //  0h-6h:  0.45-0.55 (overnight low)
    //  6h-12h: ramp up to 0.85
    // 12h-21h: peak 0.95-1.18 (demand peak with lunch dip around 13:00)
    // 21h-24h: shoulder/ramp down

    let base;
    if (hourOfDay < 6) {
      // Overnight: sinusoidal trough
      base = 0.45 + 0.08 * Math.sin((hourOfDay / 6) * Math.PI);
    } else if (hourOfDay < 12) {
      // Morning ramp
      base = 0.55 + 0.40 * ((hourOfDay - 6) / 6);
    } else if (hourOfDay < 13) {
      // Lunch dip
      base = 0.95 - 0.05 * Math.sin(((hourOfDay - 12) / 1) * Math.PI);
    } else if (hourOfDay < 21) {
      // Afternoon/evening peak
      base = 0.95 + 0.23 * Math.sin(((hourOfDay - 13) / 8) * Math.PI);
    } else {
      // Evening ramp down
      base = 0.85 - 0.40 * ((hourOfDay - 21) / 3);
    }

    // Tag-specific phase offset (different plants have slightly different load curves)
    const tagHash = tagName ? tagName.charCodeAt(0) + (tagName.charCodeAt(1) || 0) : 0;
    const phaseOffset = ((tagHash % 60) - 30) / 60 * 0.08; // ±0.08

    return Math.max(0.05, Math.min(1.5, base + phaseOffset));
  }

  /**
   * מייצר ערך production-like לתג עם diurnal cycle.
   * זוהי גרסה משופרת של _generateCurrentValue בmock.
   *
   * @param {string}  webId
   * @param {object}  tag     — { WebId, Zero, Span, PointType, Name, ... }
   * @param {boolean} [forceStale]  — אם true: מחזיר ערך ישן
   * @returns {{ Value, Timestamp, Good, Questionable, Substituted, SystemState? }}
   */
  function generateValue(webId, tag, forceStale) {
    if (!tag) {
      // Try to find tag from mock
      tag = global.PIWebAPIMock ? global.PIWebAPIMock.getTags().find(t => t.WebId === webId) : null;
    }
    if (!tag) return { Value: 0, Timestamp: new Date().toISOString(), Good: false, Questionable: true, Substituted: false };

    const now = Date.now();

    // ─── Stale data scenario ─────────────────────────────────────
    if (_activeScenarios.has(SCENARIOS.STALE_DATA) || forceStale) {
      const staleOpts = _scenarioOptions[SCENARIOS.STALE_DATA] || {};
      const staleAgeMs = staleOpts.ageMs || 3600000; // 1 hour default
      const staleTs = new Date(now - staleAgeMs - Math.random() * 300000).toISOString();
      const staleVal = _getLastKnownValue(webId, tag);
      return { Value: staleVal, Timestamp: staleTs, Good: false, Questionable: true, Substituted: false, SystemState: 'Shutdown' };
    }

    // ─── Plant shutdown scenario ──────────────────────────────────
    if (_activeScenarios.has(SCENARIOS.PLANT_SHUTDOWN)) {
      const sdOpts = _scenarioOptions[SCENARIOS.PLANT_SHUTDOWN] || {};
      const affectedIds = sdOpts.webIds || [];
      if (affectedIds.length === 0 || affectedIds.includes(webId)) {
        if (tag.PointType === 'Float32' || tag.PointType === 'Double') {
          // During shutdown: value ramps to zero or minimum
          const shutdownFraction = Math.max(0, Math.min(1, sdOpts._progress || 0.5));
          const runningVal = _getBaseValue(tag);
          const val = +(runningVal * (1 - shutdownFraction)).toFixed(3);
          return { Value: val, Timestamp: new Date().toISOString(), Good: true, Questionable: false, Substituted: false };
        }
        if (tag.PointType === 'Int32' && tag.Name.includes('Status')) {
          return { Value: 6, Timestamp: new Date().toISOString(), Good: true, Questionable: false, Substituted: false }; // 6 = כיבוי
        }
        if (tag.PointType === 'String') {
          return { Value: 'כיבוי מתוכנן', Timestamp: new Date().toISOString(), Good: true, Questionable: false, Substituted: false };
        }
      }
    }

    // ─── Maintenance window scenario ─────────────────────────────
    if (_activeScenarios.has(SCENARIOS.MAINTENANCE)) {
      const maintOpts = _scenarioOptions[SCENARIOS.MAINTENANCE] || {};
      const affectedIds = maintOpts.webIds || [];
      if (affectedIds.length === 0 || affectedIds.includes(webId)) {
        if (tag.PointType === 'Float32') {
          // During maintenance: tag is in "Shutdown" with periodic test pulses
          const isPulse = Math.random() < 0.15;
          const val = isPulse ? +(tag.Zero + tag.Span * 0.05 + Math.random() * tag.Span * 0.02).toFixed(3) : tag.Zero;
          return { Value: val, Timestamp: new Date().toISOString(), Good: true, Questionable: true, Substituted: false, SystemState: 'Maintenance' };
        }
      }
    }

    // ─── Bad data quality scenario ────────────────────────────────
    if (_activeScenarios.has(SCENARIOS.BAD_DATA_QUALITY)) {
      const bdOpts = _scenarioOptions[SCENARIOS.BAD_DATA_QUALITY] || {};
      const badRate = bdOpts.rate || 0.25; // 25% bad by default
      if (Math.random() < badRate) {
        const val = _getBaseValue(tag) * (0.5 + Math.random() * 1.0); // erratic
        return { Value: +val.toFixed(3), Timestamp: new Date().toISOString(), Good: false, Questionable: true, Substituted: Math.random() < 0.3, SystemState: 'Bad Input' };
      }
    }

    // ─── Normal production value with diurnal cycle ───────────────
    const factor   = diurnalFactor(tag.Name);
    const baseVal  = _getBaseValue(tag);
    const adjustedVal = tag.PointType === 'Float32' || tag.PointType === 'Double'
      ? Math.max(tag.Zero, Math.min(tag.Zero + tag.Span, baseVal * factor))
      : baseVal;

    // Occasional spike (1%)
    const isSpike = Math.random() < 0.01;
    const finalVal = isSpike
      ? Math.max(tag.Zero, Math.min(tag.Zero + tag.Span, adjustedVal * (1 + (Math.random() > 0.5 ? 0.15 : -0.15))))
      : adjustedVal;

    return {
      Value:       +(typeof finalVal === 'number' ? finalVal.toFixed(3) : finalVal),
      Timestamp:   new Date().toISOString(),
      Good:        !isSpike,
      Questionable: isSpike,
      Substituted: false,
    };
  }

  function _getBaseValue(tag) {
    if (!_diurnalState[tag.WebId]) {
      _diurnalState[tag.WebId] = tag.Zero + tag.Span * 0.65 + (Math.random() - 0.5) * tag.Span * 0.1;
    }
    if (tag.PointType === 'String') {
      const msgs = ['מצב תקין', 'בדיקת מערכות', 'כל מערכות תקינות', 'בקרה רגילה', 'פעולה תקינה'];
      return msgs[Math.floor(Date.now() / 30000) % msgs.length];
    }
    if (tag.PointType === 'Digital') return Math.random() > 0.03 ? 'פעיל' : 'כבוי';
    if (tag.PointType === 'Int32') {
      if (tag.Name.includes('Status')) return Math.random() < 0.93 ? 1 : Math.floor(Math.random() * 6);
      if (tag.Name.includes('Alarm')) return Math.floor(Math.random() * 4);
      return Math.floor(tag.Zero + Math.random() * tag.Span);
    }
    // Float: bounded random walk
    let val = _diurnalState[tag.WebId];
    val += (Math.random() - 0.49) * tag.Span * 0.018;
    val += ((tag.Zero + tag.Span * 0.65) - val) * 0.04;
    val = Math.max(tag.Zero, Math.min(tag.Zero + tag.Span, val));
    _diurnalState[tag.WebId] = val;
    return val;
  }

  function _getLastKnownValue(webId, tag) {
    return _diurnalState[webId] || (tag ? tag.Zero + tag.Span * 0.5 : 0);
  }

  // ═══════════════════════════════════════════════════════════════
  //  SCENARIO MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * מפעיל תרחיש production-like.
   *
   * @param {string} scenario    — SCENARIOS constant
   * @param {object} [opts]
   *   plant_shutdown:   { webIds?, durationMs?, rampMs? }
   *   maintenance:      { webIds?, durationMs? }
   *   stale_data:       { webIds?, ageMs? }
   *   rate_limited:     { requestsPerMin?, durationMs? }
   *   slow_response:    { extraLatencyMs?, durationMs? }
   *   cascading_failure:{ errorRate?, durationMs? }
   *   bad_data_quality: { rate?, webIds?, durationMs? }
   *   alarm_storm:      { count?, intervalMs? }
   */
  function setScenario(scenario, opts) {
    opts = opts || {};
    _activeScenarios.add(scenario);
    _scenarioOptions[scenario] = opts;

    console.info('[PISimEnhancements] תרחיש הופעל:', scenario, opts);

    // Auto-clear after durationMs if specified
    if (opts.durationMs) {
      clearTimeout(_scenarioTimers[scenario]);
      _scenarioTimers[scenario] = setTimeout(() => {
        clearScenario(scenario);
        console.info('[PISimEnhancements] תרחיש פג תוקף:', scenario);
      }, opts.durationMs);
    }

    // Install into PIWebAPIMock if loaded
    if (_installed && global.PIWebAPIMock) {
      if (scenario === SCENARIOS.RATE_LIMITED) {
        global.PIWebAPIMock.setErrorMode('ratelimited', opts.durationMs || 999999);
      }
      if (scenario === SCENARIOS.SLOW_RESPONSE) {
        global.PIWebAPIMock.init({
          latencyMs:     (opts.extraLatencyMs || 3000),
          latencyJitter: 500,
        });
      }
      if (scenario === SCENARIOS.CASCADING_FAILURE) {
        global.PIWebAPIMock.setErrorMode('servererror', opts.durationMs || 999999);
      }
    }

    // Simulate plant shutdown progress over rampMs
    if (scenario === SCENARIOS.PLANT_SHUTDOWN && opts.rampMs) {
      _scenarioOptions[scenario]._progress = 0;
      const steps = 20;
      const stepMs = opts.rampMs / steps;
      let step = 0;
      const rampTimer = setInterval(() => {
        step++;
        if (_scenarioOptions[scenario]) {
          _scenarioOptions[scenario]._progress = step / steps;
        }
        if (step >= steps) clearInterval(rampTimer);
      }, stepMs);
    }

    // Alarm storm: generate synthetic events
    if (scenario === SCENARIOS.ALARM_STORM) {
      _startAlarmStorm(opts);
    }

    _emitScenarioEvent(scenario, 'activated', opts);
  }

  /**
   * מבטל תרחיש ספציפי.
   * @param {string} scenario
   */
  function clearScenario(scenario) {
    _activeScenarios.delete(scenario);
    delete _scenarioOptions[scenario];
    clearTimeout(_scenarioTimers[scenario]);
    delete _scenarioTimers[scenario];

    // Restore mock settings
    if (_installed && global.PIWebAPIMock) {
      if ([SCENARIOS.RATE_LIMITED, SCENARIOS.CASCADING_FAILURE].includes(scenario)) {
        global.PIWebAPIMock.clearErrorMode();
      }
      if (scenario === SCENARIOS.SLOW_RESPONSE) {
        global.PIWebAPIMock.init({ latencyMs: 60, latencyJitter: 30 });
      }
    }
    if (scenario === SCENARIOS.ALARM_STORM) {
      _stopAlarmStorm();
    }
    _emitScenarioEvent(scenario, 'cleared', {});
    console.info('[PISimEnhancements] תרחיש בוטל:', scenario);
  }

  /**
   * מבטל את כל התרחישים הפעילים.
   */
  function clearAllScenarios() {
    const active = [..._activeScenarios];
    active.forEach(s => clearScenario(s));
    if (_installed && global.PIWebAPIMock) {
      global.PIWebAPIMock.clearErrorMode();
      global.PIWebAPIMock.init({ latencyMs: 60, latencyJitter: 30 });
    }
    console.info('[PISimEnhancements] כל התרחישים בוטלו');
  }

  /**
   * מחזיר רשימת תרחישים פעילים.
   */
  function getActiveScenarios() {
    return [..._activeScenarios].map(s => ({
      scenario: s,
      options:  Object.assign({}, _scenarioOptions[s], { password: undefined }),
    }));
  }

  // ═══════════════════════════════════════════════════════════════
  //  ALARM STORM
  // ═══════════════════════════════════════════════════════════════

  function _startAlarmStorm(opts) {
    _stopAlarmStorm();
    const count       = opts.count       || 15;
    const intervalMs  = opts.intervalMs  || 800;
    let fired = 0;

    const alarmNames = [
      'High Process Temperature', 'Low Drum Level', 'Vibration Limit Exceeded',
      'Fuel Pressure Low', 'Grid Frequency Deviation', 'CO2 Emission High',
      'Generator Trip', 'Turbine Overspeed', 'Cooling Water Low Flow',
      'Protection Relay Operated', 'Boiler Feed Pump Failure', 'Voltage Dip Detected',
      'Auxiliary Power Loss', 'NOx Level Critical', 'Steam Leak Detected',
    ];

    const units = ['Ashkelon.Unit1', 'Ashkelon.Unit2', 'Hadera.Unit1', 'Rutenberg.Unit3', 'OrotRabin.Unit2'];

    _alarmStormTimer = setInterval(() => {
      if (fired >= count) {
        _stopAlarmStorm();
        return;
      }
      const alarmName = alarmNames[Math.floor(Math.random() * alarmNames.length)];
      const unit = units[Math.floor(Math.random() * units.length)];
      const now = new Date().toISOString();
      const alarm = {
        WebId: 'WSYN_ALARM_' + (fired + 1),
        Name: unit + '.' + alarmName.replace(/ /g, '_'),
        Description: alarmName + ' — ' + unit,
        StartTime: now,
        EndTime: null,
        IsActive: true,
        Severity: ['Warning', 'Critical', 'Emergency'][Math.floor(Math.random() * 3)],
        Source: unit,
        synthetic: true,
      };
      _syntheticAlarms.push(alarm);
      if (_syntheticAlarms.length > 50) _syntheticAlarms.shift();
      fired++;
      _emitScenarioEvent(SCENARIOS.ALARM_STORM, 'alarm', alarm);
      console.info('[PISimEnhancements] Alarm:', alarm.Name, '(' + alarm.Severity + ')');
    }, intervalMs);
  }

  function _stopAlarmStorm() {
    if (_alarmStormTimer) { clearInterval(_alarmStormTimer); _alarmStormTimer = null; }
  }

  /**
   * מחזיר את רשימת ה-alarms הסינתטיים שנוצרו.
   */
  function getSyntheticAlarms() { return [..._syntheticAlarms]; }

  // ═══════════════════════════════════════════════════════════════
  //  WRITE AUDIT TRAIL
  // ═══════════════════════════════════════════════════════════════

  /**
   * מדמה כתיבת ערך לתג עם audit trail מלא.
   *
   * @param {string} webId
   * @param {number|string} newValue
   * @param {object} [opts]
   * @param {string} [opts.user]     — שם המשתמש הכותב
   * @param {string} [opts.reason]   — סיבת הכתיבה
   * @returns {object}  WriteAuditEntry
   */
  function simulateWrite(webId, newValue, opts) {
    opts = opts || {};
    const tag = global.PIWebAPIMock ? global.PIWebAPIMock.getTags().find(t => t.WebId === webId) : null;
    const prevValue = _diurnalState[webId] || (tag ? tag.Zero + tag.Span * 0.5 : null);

    const entry = {
      id:           _writeAudit.length + 1,
      webId,
      tagName:      tag ? tag.Name : webId,
      previousValue: prevValue,
      newValue,
      timestamp:    new Date().toISOString(),
      user:         opts.user || 'simulation_user',
      reason:       opts.reason || 'manual override',
      mode:         'SIMULATION',
      committed:    true,
      rollback:     false,
    };

    _writeAudit.push(entry);
    if (_writeAudit.length > 500) _writeAudit.shift();

    // Update diurnal state to reflect the write
    if (typeof newValue === 'number') {
      _diurnalState[webId] = newValue;
    }

    console.info('[PISimEnhancements] Write audit:', entry);
    _emitScenarioEvent('write', 'write', entry);
    return entry;
  }

  /**
   * Rollback אחרון כתיבה לWebId.
   * @param {string} webId
   * @returns {object|null}
   */
  function rollbackLastWrite(webId) {
    const entries = _writeAudit.filter(e => e.webId === webId && !e.rollback).reverse();
    if (!entries.length) return null;
    const last = entries[0];
    last.rollback = true;
    if (typeof last.previousValue === 'number') {
      _diurnalState[webId] = last.previousValue;
    }
    const rollEntry = {
      ...last,
      id:           _writeAudit.length + 1,
      newValue:     last.previousValue,
      previousValue: last.newValue,
      timestamp:    new Date().toISOString(),
      reason:       'rollback of write #' + last.id,
      rollback:     false,
    };
    _writeAudit.push(rollEntry);
    console.info('[PISimEnhancements] Rollback:', rollEntry);
    return rollEntry;
  }

  /**
   * מחזיר את audit trail הכתיבות.
   * @param {string} [webId]  — אם מסופק: מסנן לWebId בלבד
   */
  function getWriteAudit(webId) {
    if (webId) return _writeAudit.filter(e => e.webId === webId);
    return [..._writeAudit];
  }

  // ═══════════════════════════════════════════════════════════════
  //  INSTALL — hooks into PIWebAPIMock
  // ═══════════════════════════════════════════════════════════════

  /**
   * מתקין את ה-enhancements ב-PIWebAPIMock.
   * לאחר קריאה זו, generateValue ישתמש ב-diurnal cycle
   * ו-rate limiting יגיב ל-429.
   */
  function install() {
    if (_installed) { console.info('[PISimEnhancements] כבר מותקן'); return; }
    const mock = global.PIWebAPIMock;
    if (!mock) { console.warn('[PISimEnhancements] PIWebAPIMock לא נמצא — install לא בוצע'); return; }

    // Patch mock's error mode to add 429 support
    const origSetErrorMode = mock.setErrorMode.bind(mock);
    mock.setErrorMode = function (mode, durationMs) {
      if (mode === 'ratelimited') {
        // inject a custom hook
        _activeScenarios.add(SCENARIOS.RATE_LIMITED);
        setTimeout(() => { _activeScenarios.delete(SCENARIOS.RATE_LIMITED); }, durationMs || 999999);
        return;
      }
      origSetErrorMode(mode, durationMs);
    };

    _installed = true;
    console.info('[PISimEnhancements] התקנה הושלמה — diurnal cycle, scenarios, write audit מופעלים');
  }

  // ═══════════════════════════════════════════════════════════════
  //  RATE LIMIT CHECK
  // ═══════════════════════════════════════════════════════════════

  /**
   * בודק האם ה-rate limiting פעיל כעת.
   * @returns {{ limited: boolean, retryAfterMs?: number }}
   */
  function checkRateLimit() {
    if (_activeScenarios.has(SCENARIOS.RATE_LIMITED)) {
      return { limited: true, retryAfterMs: 5000, status: 429, message: 'Too Many Requests — שרת PI עמוס' };
    }
    return { limited: false };
  }

  // ═══════════════════════════════════════════════════════════════
  //  EVENT EMITTER (minimal)
  // ═══════════════════════════════════════════════════════════════

  const _listeners = {};

  function on(event, cb) {
    if (!_listeners[event]) _listeners[event] = [];
    _listeners[event].push(cb);
  }

  function off(event, cb) {
    if (_listeners[event]) _listeners[event] = _listeners[event].filter(f => f !== cb);
  }

  function _emitScenarioEvent(scenario, type, data) {
    const ev = { scenario, type, data, timestamp: new Date().toISOString() };
    (_listeners['scenario'] || []).forEach(cb => { try { cb(ev); } catch (_) {} });
    (_listeners[scenario]   || []).forEach(cb => { try { cb(ev); } catch (_) {} });
  }

  // ═══════════════════════════════════════════════════════════════
  //  STATUS REPORT
  // ═══════════════════════════════════════════════════════════════

  /**
   * מחזיר סטטוס נוכחי מלא.
   */
  function getStatus() {
    return {
      installed: _installed,
      activeScenarios: [..._activeScenarios],
      diurnalFactor: diurnalFactor(), // current global factor
      writeAuditCount: _writeAudit.length,
      syntheticAlarmCount: _syntheticAlarms.length,
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  AUTO-INSTALL on DOMContentLoaded
  // ═══════════════════════════════════════════════════════════════

  function _autoInstall() {
    if (global.PIWebAPIMock && !_installed) install();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoInstall);
  } else {
    _autoInstall();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  global.PISimEnhancements = {
    SCENARIOS,

    // Core
    install,
    getStatus,

    // Value generation
    generateValue,
    diurnalFactor,

    // Scenario management
    setScenario,
    clearScenario,
    clearAllScenarios,
    getActiveScenarios,

    // Alarms
    startAlarmStorm: (opts) => setScenario(SCENARIOS.ALARM_STORM, opts),
    getSyntheticAlarms,

    // Write audit
    simulateWrite,
    rollbackLastWrite,
    getWriteAudit,

    // Rate limiting
    checkRateLimit,

    // Events
    on,
    off,

    VERSION: '1.0.0',
  };

})(typeof window !== 'undefined' ? window : global);
