/**
 * pi-webapi-mock.js — PI Web API Full Simulation Layer
 * =====================================================
 * גרסה: 1.0.0  |  תאריך: 2026-03-29
 * namespace: window.PIWebAPIMock
 *
 * ═══════════════════════════════════════════════════════════════
 * מה המודול הזה עושה:
 * ═══════════════════════════════════════════════════════════════
 * מדמה את ה-PI Web API REST endpoints באופן מלא בסביבה מקומית.
 * אין קריאות רשת אמיתיות — כל ה-responses מיוצרות בזמן ריצה ב-browser.
 *
 * Endpoints מדומים (PI Web API 2019+):
 *   GET  /piwebapi/                         — home/links
 *   GET  /piwebapi/system/versions          — server version info
 *   GET  /piwebapi/system/userinfo          — authenticated user
 *   GET  /piwebapi/dataservers              — list PI Data Archives
 *   GET  /piwebapi/dataservers/{webid}/points — tag search
 *   GET  /piwebapi/points/{webid}           — tag details
 *   GET  /piwebapi/points/{webid}/value     — current value (snapshot)
 *   GET  /piwebapi/points/{webid}/recorded  — recorded values (history)
 *   GET  /piwebapi/points/{webid}/interpolated — interpolated values
 *   GET  /piwebapi/points/{webid}/summary   — statistical summary
 *   GET  /piwebapi/assetservers             — AF servers list
 *   GET  /piwebapi/assetservers/{webid}/assetdatabases — databases
 *   GET  /piwebapi/assetdatabases/{webid}/elements — root elements
 *   GET  /piwebapi/elements/{webid}         — element details
 *   GET  /piwebapi/elements/{webid}/elements — child elements
 *   GET  /piwebapi/elements/{webid}/attributes — element attributes
 *   GET  /piwebapi/attributes/{webid}/value — attribute value
 *   GET  /piwebapi/attributes/{webid}/recorded — attribute history
 *   GET  /piwebapi/assetdatabases/{webid}/eventframes — event frames list
 *   GET  /piwebapi/eventframes/{webid}      — event frame details
 *   POST /piwebapi/streamsets/value         — batch snapshot (StreamSets)
 *   POST /piwebapi/streamsets/recorded      — batch recorded (StreamSets)
 *   POST /piwebapi/batch                    — generic batch request
 *   GET  /piwebapi/channels/{webid}         — WebSocket channel stub
 *
 * Auth modes מדומים:
 *   none   — ללא אימות (dev mode)
 *   basic  — Basic Auth (validator בודק credentials)
 *   kerberos — Negotiate (stub: מתנהג כ-success)
 *
 * Error modes:
 *   timeout       — מדמה עיכוב גדול
 *   unauthorized  — מחזיר 401
 *   notfound      — מחזיר 404
 *   servererror   — מחזיר 500
 *   partial       — תשובה חלקית (Items חלקיים)
 *
 * ═══════════════════════════════════════════════════════════════
 * שימוש:
 *   // אתחול
 *   PIWebAPIMock.init({ authMode: 'basic', username: 'demo', password: 'demo' });
 *
 *   // קריאה ל-endpoint (מחזיר Promise)
 *   const val = await PIWebAPIMock.request('GET', '/piwebapi/points/WTAG001/value');
 *
 *   // הפעלת error mode זמני
 *   PIWebAPIMock.setErrorMode('timeout', 5000);
 *
 *   // StreamSets — קבלת ערכים לרשימת WebIds
 *   const snap = await PIWebAPIMock.streamSetsValue(['WTAG001','WTAG002','WTAG003']);
 * ═══════════════════════════════════════════════════════════════
 */

;(function (global) {
  'use strict';

  // ═══════════════════════════════════════════════════════════════
  //  CONSTANTS
  // ═══════════════════════════════════════════════════════════════

  const VERSION = '1.0.0';
  const MOCK_PI_VERSION = '2019 SP3 Patch 3 (3.4.0.612)';
  const MOCK_AF_VERSION = '2.10.9.593';
  const MOCK_SERVER_NAME = 'PIServer-IEC-MOCK';
  const MOCK_AF_SERVER_NAME = 'PIAF-IEC-MOCK';

  // WebIds for servers and databases
  const DS_WEBID  = 'WDS_IEC_MOCK_001';       // Data Archive
  const AFS_WEBID = 'WAFS_IEC_MOCK_001';      // AF Server
  const ADB1_WEBID = 'WADB_IEC_POWERGRID';    // AF Database 1
  const ADB2_WEBID = 'WADB_IEC_RENEWABLE';    // AF Database 2

  // ═══════════════════════════════════════════════════════════════
  //  INTERNAL STATE
  // ═══════════════════════════════════════════════════════════════

  let _config = {
    authMode: 'none',    // 'none' | 'basic' | 'kerberos'
    username: '',
    password: '',
    latencyMs: 80,       // simulated network latency
    latencyJitter: 40,   // random jitter ± ms
    errorMode: null,     // null | 'timeout' | 'unauthorized' | 'notfound' | 'servererror' | 'partial'
    errorUntil: 0,       // timestamp until error mode is active
    cacheEnabled: true,
    cacheTtlMs: 30000,
  };

  const _requestLog = [];   // circular request log (last 200)
  const _cache = new Map(); // endpoint → { data, ts }

  let _totalRequests = 0;
  let _totalErrors = 0;
  let _totalCacheHits = 0;

  // ═══════════════════════════════════════════════════════════════
  //  DEMO DATA — PI Points (tags)
  // ═══════════════════════════════════════════════════════════════

  const PI_TAGS = [
    // Ashkelon power plant
    { WebId: 'WTAG001', Name: 'Ashkelon.Unit1.MW',         PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 600,   Descriptor: 'הספק פעיל יחידה 1 אשקלון',    Step: false },
    { WebId: 'WTAG002', Name: 'Ashkelon.Unit1.Temp_Steam',  PointType: 'Float32', EngineeringUnits: '°C',      Zero: 400,  Span: 200,   Descriptor: 'טמפרטורת קיטור יחידה 1',        Step: false },
    { WebId: 'WTAG003', Name: 'Ashkelon.Unit2.MW',          PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 600,   Descriptor: 'הספק פעיל יחידה 2 אשקלון',    Step: false },
    { WebId: 'WTAG004', Name: 'Ashkelon.Unit1.Vibration',   PointType: 'Float32', EngineeringUnits: 'mm/s',    Zero: 0,    Span: 15,    Descriptor: 'רטט ציר טורבינה 1',             Step: false },
    { WebId: 'WTAG005', Name: 'Ashkelon.CO2_Rate',          PointType: 'Float32', EngineeringUnits: 'g/kWh',   Zero: 0,    Span: 1200,  Descriptor: 'קצב פליטות CO2 אשקלון',        Step: false },
    // Hadera power plant
    { WebId: 'WTAG006', Name: 'Hadera.Unit1.MW',            PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 630,   Descriptor: 'הספק פעיל יחידה 1 חדרה',      Step: false },
    { WebId: 'WTAG007', Name: 'Hadera.Unit2.Efficiency',    PointType: 'Float32', EngineeringUnits: '%',        Zero: 20,   Span: 35,    Descriptor: 'יעילות יחידה 2 חדרה',          Step: false },
    { WebId: 'WTAG008', Name: 'Hadera.Unit1.Pressure',      PointType: 'Float32', EngineeringUnits: 'bar',      Zero: 80,   Span: 120,   Descriptor: 'לחץ קיטור יחידה 1 חדרה',      Step: false },
    { WebId: 'WTAG009', Name: 'Hadera.Unit1.FuelFlow',      PointType: 'Float32', EngineeringUnits: 't/h',      Zero: 0,    Span: 100,   Descriptor: 'ספיקת פחם יחידה 1 חדרה',      Step: false },
    // Rutenberg
    { WebId: 'WTAG010', Name: 'Rutenberg.Unit1.MW',         PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 562,   Descriptor: 'הספק פעיל יחידה 1 רוטנברג',   Step: false },
    { WebId: 'WTAG011', Name: 'Rutenberg.Unit1.CO2',        PointType: 'Float32', EngineeringUnits: 'ton/h',   Zero: 0,    Span: 200,   Descriptor: 'פליטות CO2 יחידה 1 רוטנברג',  Step: false },
    { WebId: 'WTAG012', Name: 'Rutenberg.Unit3.NOx',        PointType: 'Float32', EngineeringUnits: 'mg/Nm³',  Zero: 0,    Span: 200,   Descriptor: 'NOx יחידה 3 רוטנברג',          Step: false },
    // Orot Rabin
    { WebId: 'WTAG013', Name: 'OrotRabin.Unit1.MW',         PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 562,   Descriptor: 'הספק יחידה 1 אורות רבין',     Step: false },
    { WebId: 'WTAG014', Name: 'OrotRabin.Unit1.FuelFlow',   PointType: 'Float32', EngineeringUnits: 'MMSCFD',  Zero: 0,    Span: 5,     Descriptor: 'זרימת גז טבעי יחידה 1',         Step: false },
    // Reading
    { WebId: 'WTAG015', Name: 'Reading.Unit1.MW',           PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 151,   Descriptor: 'הספק יחידה 1 רידינג',          Step: false },
    { WebId: 'WTAG016', Name: 'Reading.Unit2.MW',           PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 151,   Descriptor: 'הספק יחידה 2 רידינג',          Step: false },
    // Grid-level
    { WebId: 'WTAG017', Name: 'IEC.Grid.TotalGeneration',   PointType: 'Float32', EngineeringUnits: 'GW',      Zero: 3,    Span: 13,    Descriptor: 'ייצור כולל רשת IEC',           Step: false },
    { WebId: 'WTAG018', Name: 'IEC.Grid.Frequency',         PointType: 'Float32', EngineeringUnits: 'Hz',      Zero: 49.5, Span: 1,     Descriptor: 'תדר רשת לאומי',                 Step: false },
    { WebId: 'WTAG019', Name: 'IEC.Grid.TotalDemand',       PointType: 'Float32', EngineeringUnits: 'GW',      Zero: 3,    Span: 13,    Descriptor: 'צריכה כוללת רשת IEC',          Step: false },
    { WebId: 'WTAG020', Name: 'IEC.Grid.ImportExport',      PointType: 'Float32', EngineeringUnits: 'MW',      Zero: -2000, Span: 4000, Descriptor: 'יבוא/ייצוא חשמל',               Step: false },
    // Renewable
    { WebId: 'WTAG021', Name: 'Renewable.Solar.Total',      PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 3000,  Descriptor: 'ייצור סולארי כולל',            Step: false },
    { WebId: 'WTAG022', Name: 'Renewable.Wind.Total',       PointType: 'Float32', EngineeringUnits: 'MW',      Zero: 0,    Span: 1000,  Descriptor: 'ייצור רוח כולל',               Step: false },
    { WebId: 'WTAG023', Name: 'Renewable.Storage.SOC',      PointType: 'Float32', EngineeringUnits: '%',        Zero: 0,    Span: 100,   Descriptor: 'רמת טעינה אגירת אנרגיה',       Step: false },
    // Digital/status tags
    { WebId: 'WTAG024', Name: 'Ashkelon.Unit1.Status',      PointType: 'Int32',   EngineeringUnits: '',         Zero: 0,    Span: 6,     Descriptor: 'מצב יחידה 1 אשקלון',           Step: true  },
    { WebId: 'WTAG025', Name: 'Hadera.Unit1.AlarmCount',    PointType: 'Int32',   EngineeringUnits: '',         Zero: 0,    Span: 100,   Descriptor: 'מספר אזעקות פעילות חדרה',      Step: true  },
    { WebId: 'WTAG026', Name: 'Rutenberg.GridProtection',   PointType: 'Digital', EngineeringUnits: '',         Zero: 0,    Span: 1,     Descriptor: 'מערכת הגנת רשת רוטנברג',       Step: true  },
    // String tags
    { WebId: 'WTAG027', Name: 'Ashkelon.OperatorMessage',   PointType: 'String',  EngineeringUnits: '',         Zero: 0,    Span: 0,     Descriptor: 'הודעת מפעיל אשקלון',            Step: true  },
    { WebId: 'WTAG028', Name: 'IEC.System.Mode',            PointType: 'String',  EngineeringUnits: '',         Zero: 0,    Span: 0,     Descriptor: 'מצב מערכת IEC',                 Step: true  },
  ];

  const _tagByWebId = {};
  const _tagByName = {};
  PI_TAGS.forEach(t => {
    _tagByWebId[t.WebId] = t;
    _tagByName[t.Name.toLowerCase()] = t;
  });

  // ═══════════════════════════════════════════════════════════════
  //  VALUE GENERATORS
  // ═══════════════════════════════════════════════════════════════

  // Running random walk state per tag
  const _walkState = {};

  /**
   * מייצר ערך נוכחי לתג עם random walk.
   */
  function _generateCurrentValue(tag) {
    if (!_walkState[tag.WebId]) {
      // Initialize at mid-range
      _walkState[tag.WebId] = tag.Zero + tag.Span * 0.65 + (Math.random() - 0.5) * tag.Span * 0.1;
    }

    if (tag.PointType === 'String') {
      const msgs = ['מצב תקין', 'בדיקת מערכות', 'תחזוקה יומית', 'כל מערכות תקינות', 'בקרה רגילה'];
      return msgs[Math.floor(Math.random() * msgs.length)];
    }
    if (tag.PointType === 'Digital') {
      return Math.random() > 0.05 ? 'פעיל' : 'כבוי';
    }
    if (tag.PointType === 'Int32') {
      if (tag.Name.includes('Status')) return Math.floor(Math.random() < 0.9 ? 1 : Math.random() * 6);
      if (tag.Name.includes('AlarmCount')) return Math.floor(Math.random() * 5);
      return Math.floor(tag.Zero + Math.random() * tag.Span);
    }

    // Float: random walk with mean reversion
    const mid = tag.Zero + tag.Span * 0.65;
    const maxDev = tag.Span * 0.3;
    let val = _walkState[tag.WebId];
    val += (Math.random() - 0.5) * tag.Span * 0.02;
    val += (mid - val) * 0.05; // mean reversion
    val = Math.max(tag.Zero, Math.min(tag.Zero + tag.Span, val));
    _walkState[tag.WebId] = val;
    return +val.toFixed(3);
  }

  /**
   * מייצר סדרת זמן היסטורית לתג.
   * @param {object} tag
   * @param {number} startMs  — timestamp ms
   * @param {number} endMs    — timestamp ms
   * @param {number} count    — max number of points
   * @param {'recorded'|'interpolated'} mode
   * @returns {Array<{Timestamp, Value, Good, Questionable, Substituted}>}
   */
  function _generateTimeSeries(tag, startMs, endMs, count, mode) {
    const items = [];
    const step = (endMs - startMs) / Math.max(count - 1, 1);
    let val = tag.Zero + tag.Span * 0.6;
    const mid = tag.Zero + tag.Span * 0.65;

    const rng = _seededRandom(tag.WebId.charCodeAt(4) * 1000 + startMs);

    for (let i = 0; i < count; i++) {
      const ts = startMs + i * step;

      if (tag.PointType === 'String') {
        items.push({ Timestamp: new Date(ts).toISOString(), Value: 'תקין', Good: true, Questionable: false, Substituted: false });
        continue;
      }
      if (tag.PointType === 'Digital') {
        items.push({ Timestamp: new Date(ts).toISOString(), Value: rng() > 0.05 ? 'פעיל' : 'כבוי', Good: true, Questionable: false, Substituted: false });
        continue;
      }
      if (tag.PointType === 'Int32') {
        items.push({ Timestamp: new Date(ts).toISOString(), Value: Math.floor(tag.Zero + rng() * tag.Span), Good: true, Questionable: false, Substituted: false });
        continue;
      }

      // Float with random walk + daily/seasonal cycles
      const hourOfDay = (ts % 86400000) / 3600000;
      const dayFactor = 1 + 0.1 * Math.sin((hourOfDay - 14) * Math.PI / 12); // peak at 14:00

      val += (rng() - 0.49) * tag.Span * 0.015;
      val += (mid * dayFactor - val) * 0.03;
      val = Math.max(tag.Zero, Math.min(tag.Zero + tag.Span, val));

      // Occasional spikes or dips (1% probability)
      const anomaly = rng() < 0.01;
      const displayVal = anomaly
        ? +(val + (rng() > 0.5 ? 1 : -1) * tag.Span * 0.15).toFixed(3)
        : +val.toFixed(3);

      items.push({
        Timestamp: new Date(ts).toISOString(),
        Value: Math.max(tag.Zero, Math.min(tag.Zero + tag.Span, displayVal)),
        Good: true,
        Questionable: anomaly,
        Substituted: false,
      });

      // In recorded mode, skip some timestamps (not every second)
      if (mode === 'recorded' && rng() < 0.2 && i < count - 1) {
        i++; // skip one point (simulates compression)
      }
    }

    return items;
  }

  /**
   * Computes statistical summary for a tag over a time range.
   */
  function _generateSummary(tag, startMs, endMs) {
    const items = _generateTimeSeries(tag, startMs, endMs, 200, 'interpolated');
    const nums = items.map(i => typeof i.Value === 'number' ? i.Value : null).filter(v => v !== null);
    if (!nums.length) return {};

    const min = Math.min(...nums);
    const max = Math.max(...nums);
    const avg = nums.reduce((a, b) => a + b, 0) / nums.length;
    const pct = [...nums].sort((a, b) => a - b);
    const p95 = pct[Math.floor(pct.length * 0.95)];

    return {
      Minimum:   { Value: +min.toFixed(3), Timestamp: new Date(startMs).toISOString() },
      Maximum:   { Value: +max.toFixed(3), Timestamp: new Date(endMs).toISOString() },
      Mean:      { Value: +avg.toFixed(3) },
      StdDev:    { Value: +(Math.sqrt(nums.reduce((s, v) => s + (v - avg) ** 2, 0) / nums.length)).toFixed(3) },
      Percentile95: { Value: +p95.toFixed(3) },
      Count:     { Value: nums.length },
      PercentGood: { Value: 100 },
    };
  }

  // Seeded pseudo-random generator
  function _seededRandom(seed) {
    let s = Math.abs(Math.floor(seed)) % 2147483647;
    return () => {
      s = (s * 16807) % 2147483647;
      return (s - 1) / 2147483646;
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  EVENT FRAMES
  // ═══════════════════════════════════════════════════════════════

  const EVENT_FRAMES = [
    {
      WebId: 'WEF001',
      Name: 'תחזוקה_מתוכננת_אשקלון_2026_Q1',
      StartTime: '2026-01-15T06:00:00Z',
      EndTime: '2026-01-22T18:00:00Z',
      IsActive: false,
      CategoryNames: ['תחזוקה'],
      TemplateName: 'Planned Maintenance',
      Description: 'תחזוקה שנתית מתוכננת — יחידה 1 ויחידה 2 אשקלון',
      Severity: 'Minor',
      ReferencedElementWebIds: ['WEL001'],
      Attributes: [
        { Name: 'סוג תחזוקה', Value: 'מונעת' },
        { Name: 'צוות אחראי', Value: 'צוות תחזוקה A' },
        { Name: 'משך מתוכנן', Value: '168 שעות' },
      ],
    },
    {
      WebId: 'WEF002',
      Name: 'תקלה_מחולל_חדרה_יחידה2_2025',
      StartTime: '2025-11-03T14:30:00Z',
      EndTime: '2025-11-04T09:15:00Z',
      IsActive: false,
      CategoryNames: ['תקלה', 'אלרט'],
      TemplateName: 'Unplanned Outage',
      Description: 'תקלת מחולל בלתי מתוכננת — יחידה 2 חדרה',
      Severity: 'Major',
      ReferencedElementWebIds: ['WEL002'],
      Attributes: [
        { Name: 'סיבת תקלה', Value: 'כשל מסב' },
        { Name: 'אובדן הספק', Value: '350 MW' },
        { Name: 'זמן תיקון', Value: '18:45 שעות' },
      ],
    },
    {
      WebId: 'WEF003',
      Name: 'שיא_עומס_קיץ_2025_אוגוסט',
      StartTime: '2025-08-12T11:00:00Z',
      EndTime: '2025-08-12T20:30:00Z',
      IsActive: false,
      CategoryNames: ['ניהול רשת', 'שיא עומס'],
      TemplateName: 'Peak Load Event',
      Description: 'שיא צריכת חשמל קיצי — 14,200 MW',
      Severity: 'Medium',
      ReferencedElementWebIds: [],
      Attributes: [
        { Name: 'שיא מדוד', Value: '14,200 MW' },
        { Name: 'שיא היסטורי', Value: 'כן' },
        { Name: 'אחוז מרווח', Value: '3.2%' },
      ],
    },
    {
      WebId: 'WEF004',
      Name: 'תחזוקה_מונעת_רוטנברג_Q2_2026',
      StartTime: '2026-04-05T00:00:00Z',
      EndTime: null, // Active / ongoing
      IsActive: true,
      CategoryNames: ['תחזוקה'],
      TemplateName: 'Planned Maintenance',
      Description: 'תחזוקה רבעונית מונעת — יחידה 3 ויחידה 4 רוטנברג',
      Severity: 'Minor',
      ReferencedElementWebIds: ['WEL004'],
      Attributes: [
        { Name: 'סוג תחזוקה', Value: 'בדיקה תקופתית' },
        { Name: 'אחראי', Value: 'יוסי לוי' },
      ],
    },
    {
      WebId: 'WEF005',
      Name: 'בדיקת_הגנות_רשת_IEC_2026',
      StartTime: '2026-03-15T08:00:00Z',
      EndTime: '2026-03-15T16:00:00Z',
      IsActive: false,
      CategoryNames: ['בדיקה', 'רשת'],
      TemplateName: 'Grid Test',
      Description: 'בדיקה שנתית של מערכות הגנת רשת',
      Severity: 'Minor',
      ReferencedElementWebIds: [],
      Attributes: [
        { Name: 'תוצאה', Value: 'עבר בהצלחה' },
        { Name: 'בודק', Value: 'ועדת הגנות' },
      ],
    },
  ];

  // ═══════════════════════════════════════════════════════════════
  //  AF HIERARCHY — minimal stubs (works alongside af-data-layer.js)
  // ═══════════════════════════════════════════════════════════════

  const AF_ELEMENTS = {
    'WEL001': { WebId: 'WEL001', Name: 'אשקלון',     Description: 'תחנת כוח אשקלון',     Path: '\\\\PIServer\\IEC\\אשקלון',     TemplateName: 'תחנת כוח', HasChildren: true },
    'WEL002': { WebId: 'WEL002', Name: 'חדרה',       Description: 'תחנת כוח חדרה',       Path: '\\\\PIServer\\IEC\\חדרה',       TemplateName: 'תחנת כוח', HasChildren: true },
    'WEL003': { WebId: 'WEL003', Name: 'אורות רבין', Description: 'תחנת כוח אורות רבין', Path: '\\\\PIServer\\IEC\\אורות_רבין', TemplateName: 'תחנת כוח', HasChildren: true },
    'WEL004': { WebId: 'WEL004', Name: 'רוטנברג',    Description: 'תחנת כוח רוטנברג',    Path: '\\\\PIServer\\IEC\\רוטנברג',    TemplateName: 'תחנת כוח', HasChildren: true },
    'WEL005': { WebId: 'WEL005', Name: 'רידינג',     Description: 'תחנת כוח רידינג',     Path: '\\\\PIServer\\IEC\\רידינג',     TemplateName: 'תחנת כוח', HasChildren: true },
  };

  // ═══════════════════════════════════════════════════════════════
  //  AUTH VALIDATOR
  // ═══════════════════════════════════════════════════════════════

  /**
   * מאמת בקשה לפי מצב auth.
   * @param {object} headers — key-value HTTP headers
   * @returns {{ ok: boolean, reason?: string }}
   */
  function _validateAuth(headers) {
    if (_config.authMode === 'none') return { ok: true };

    if (_config.authMode === 'kerberos') {
      const nego = (headers['Authorization'] || headers['authorization'] || '');
      if (nego.startsWith('Negotiate')) return { ok: true };
      return { ok: false, reason: 'Negotiate token required' };
    }

    if (_config.authMode === 'basic') {
      const auth = (headers['Authorization'] || headers['authorization'] || '');
      if (!auth.startsWith('Basic ')) return { ok: false, reason: 'Basic auth required' };
      try {
        const decoded = atob(auth.slice(6));
        const [user, pass] = decoded.split(':');
        if (user === _config.username && pass === _config.password) return { ok: true };
        return { ok: false, reason: 'Invalid credentials' };
      } catch (e) {
        return { ok: false, reason: 'Malformed Basic auth' };
      }
    }

    return { ok: true };
  }

  // ═══════════════════════════════════════════════════════════════
  //  TIME PARSING
  // ═══════════════════════════════════════════════════════════════

  /**
   * מפרסר ביטוי זמן של PI Web API.
   * תומך ב: ISO 8601, "*" (now), "*-1d", "*-8h", "t" (today), "y" (yesterday)
   */
  function _parseTime(expr) {
    if (!expr) return Date.now();
    const s = String(expr).trim();
    if (s === '*' || s === 'now') return Date.now();
    if (s === 't' || s === 'today') {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
    }
    if (s === 'y' || s === 'yesterday') {
      const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() - 86400000;
    }

    // Relative: *-Xd, *-Xh, *-Xm, *-Xs
    const relMatch = s.match(/^\*([+-])(\d+(?:\.\d+)?)([smhd])$/);
    if (relMatch) {
      const sign = relMatch[1] === '-' ? -1 : 1;
      const val  = parseFloat(relMatch[2]);
      const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[relMatch[3]];
      return Date.now() + sign * val * unit;
    }

    // ISO 8601
    const ms = Date.parse(s);
    return isNaN(ms) ? Date.now() : ms;
  }

  // ═══════════════════════════════════════════════════════════════
  //  LATENCY SIMULATION
  // ═══════════════════════════════════════════════════════════════

  function _simulateLatency() {
    const ms = _config.latencyMs + (Math.random() - 0.5) * _config.latencyJitter;
    return new Promise(r => setTimeout(r, Math.max(0, ms)));
  }

  // ═══════════════════════════════════════════════════════════════
  //  RESPONSE BUILDERS
  // ═══════════════════════════════════════════════════════════════

  function _tagLinks(webId) {
    const base = '/piwebapi/points/' + webId;
    return {
      Self: base,
      Value: base + '/value',
      RecordedValues: base + '/recorded',
      InterpolatedValues: base + '/interpolated',
      PlotValues: base + '/plot',
      SummaryValues: base + '/summary',
    };
  }

  function _elementLinks(webId) {
    const base = '/piwebapi/elements/' + webId;
    return {
      Self: base,
      Attributes: base + '/attributes',
      Elements: base + '/elements',
      EventFrames: base + '/eventframes',
    };
  }

  // ═══════════════════════════════════════════════════════════════
  //  ROUTE HANDLER
  // ═══════════════════════════════════════════════════════════════

  /**
   * מטפל בנתיב ומחזיר תשובה מדומה.
   * @param {string} method — GET | POST | PUT | DELETE
   * @param {string} path   — e.g. '/piwebapi/points/WTAG001/value'
   * @param {object} [params] — query params
   * @param {object} [body]   — request body (POST/PUT)
   * @param {object} [headers] — request headers
   * @returns {{ status: number, body: any }}
   */
  function _route(method, path, params, body, headers) {
    params  = params  || {};
    headers = headers || {};

    // Remove query string from path
    const [cleanPath] = path.split('?');
    const parts = cleanPath.replace(/^\/piwebapi\/?/, '').split('/').filter(Boolean);
    const p0 = parts[0] || '';
    const p1 = parts[1] || '';
    const p2 = parts[2] || '';
    const p3 = parts[3] || '';

    // ── Auth check ──
    const authResult = _validateAuth(headers);
    if (!authResult.ok) {
      return {
        status: 401,
        body: { Errors: [authResult.reason], Links: {} },
        headers: { 'WWW-Authenticate': _config.authMode === 'kerberos' ? 'Negotiate' : 'Basic realm="PI Web API"' },
      };
    }

    // ── Home ──
    if (!p0 || cleanPath === '/piwebapi' || cleanPath === '/piwebapi/') {
      return { status: 200, body: {
        Links: {
          Self: '/piwebapi/',
          AssetServers: '/piwebapi/assetservers',
          DataServers: '/piwebapi/dataservers',
          System: '/piwebapi/system',
          Batch: '/piwebapi/batch',
          StreamSets: '/piwebapi/streamsets',
        },
      }};
    }

    // ── System ──
    if (p0 === 'system') {
      if (p1 === 'versions') {
        return { status: 200, body: {
          'PI Web API': { Version: MOCK_PI_VERSION, Revision: 'Mock' },
          'PI Asset Framework (AF) Server': { Version: MOCK_AF_VERSION },
          'PI Data Archive': { Version: '3.4.395.64' },
          _IsMock: true,
        }};
      }
      if (p1 === 'userinfo') {
        return { status: 200, body: {
          IdentityType: _config.authMode === 'none' ? 'Anonymous' : 'ViSiOn',
          Name: _config.username || 'ANONYMOUS',
          IsImpersonated: false,
          _IsMock: true,
        }};
      }
      return { status: 200, body: { Description: 'PI Web API System (Mock)', Version: MOCK_PI_VERSION, _IsMock: true } };
    }

    // ── Data Servers ──
    if (p0 === 'dataservers') {
      if (!p1) {
        return { status: 200, body: {
          Items: [{
            WebId: DS_WEBID,
            Name: MOCK_SERVER_NAME,
            Description: 'PI Data Archive מדומה — IEC Power Grid',
            ServerVersion: '3.4.395.64',
            IsConnected: true,
            _IsMock: true,
            Links: { Self: '/piwebapi/dataservers/' + DS_WEBID, Points: '/piwebapi/dataservers/' + DS_WEBID + '/points' },
          }],
        }};
      }
      if (p2 === 'points' || (!p2 && p1 === DS_WEBID)) {
        // Tag search
        const query = (params.nameFilter || params.query || '*').toLowerCase().replace(/\*/g, '');
        const filtered = PI_TAGS.filter(t =>
          !query || t.Name.toLowerCase().includes(query) || t.Descriptor.includes(query)
        );
        const maxCount = Math.min(parseInt(params.maxCount || params.maxResults || '1000', 10), PI_TAGS.length);
        return { status: 200, body: {
          Items: filtered.slice(0, maxCount).map(t => Object.assign({}, t, { Links: _tagLinks(t.WebId) })),
          Links: { Self: '/piwebapi/dataservers/' + DS_WEBID + '/points' },
        }};
      }
    }

    // ── Points (Tags) ──
    if (p0 === 'points') {
      const tag = _tagByWebId[p1];
      if (!tag && p1) return { status: 404, body: { Errors: ['Point not found: ' + p1] } };

      if (!p2) {
        // Tag details
        return { status: 200, body: Object.assign({}, tag, { Links: _tagLinks(tag.WebId) }) };
      }

      const startMs = _parseTime(params.startTime || params.start || '*-1d');
      const endMs   = _parseTime(params.endTime   || params.end   || '*');
      const maxCount = Math.min(parseInt(params.maxCount || '1000', 10), 10000);

      if (p2 === 'value') {
        return { status: 200, body: {
          Timestamp: new Date().toISOString(),
          Value: _generateCurrentValue(tag),
          Good: true,
          Questionable: false,
          Substituted: false,
        }};
      }

      if (p2 === 'recorded') {
        const items = _generateTimeSeries(tag, startMs, endMs, Math.min(maxCount, 500), 'recorded');
        return { status: 200, body: { Items: items, Links: {} } };
      }

      if (p2 === 'interpolated') {
        const items = _generateTimeSeries(tag, startMs, endMs, Math.min(maxCount, 500), 'interpolated');
        return { status: 200, body: { Items: items, Links: {} } };
      }

      if (p2 === 'plot') {
        // Plot returns fewer points (for trend chart)
        const items = _generateTimeSeries(tag, startMs, endMs, Math.min(parseInt(params.intervals || '200', 10), 500), 'interpolated');
        return { status: 200, body: { Items: items, Links: {} } };
      }

      if (p2 === 'summary') {
        const summaryType = (params.summaryType || 'All');
        const summary = _generateSummary(tag, startMs, endMs);
        return { status: 200, body: { Items: [{ Type: summaryType, Value: summary }] } };
      }

      if (p2 === 'attributes') {
        return { status: 200, body: {
          Items: [
            { Name: 'PointType', Value: tag.PointType },
            { Name: 'EngineeringUnits', Value: tag.EngineeringUnits },
            { Name: 'Zero', Value: tag.Zero },
            { Name: 'Span', Value: tag.Span },
            { Name: 'Descriptor', Value: tag.Descriptor },
            { Name: 'Step', Value: tag.Step },
          ],
        }};
      }
    }

    // ── Asset Servers (AF) ──
    if (p0 === 'assetservers') {
      if (!p1) {
        return { status: 200, body: {
          Items: [{
            WebId: AFS_WEBID,
            Name: MOCK_AF_SERVER_NAME,
            Description: 'PI AF Server מדומה',
            IsConnected: true,
            _IsMock: true,
            Links: { Self: '/piwebapi/assetservers/' + AFS_WEBID, Databases: '/piwebapi/assetservers/' + AFS_WEBID + '/assetdatabases' },
          }],
        }};
      }
      if (p2 === 'assetdatabases') {
        return { status: 200, body: {
          Items: [
            { WebId: ADB1_WEBID, Name: 'IEC-PowerGrid',  Description: 'מאגר נכסי רשת החשמל הישראלית', Path: '\\\\' + MOCK_AF_SERVER_NAME + '\\IEC-PowerGrid',  _IsMock: true, Links: { Self: '/piwebapi/assetdatabases/' + ADB1_WEBID } },
            { WebId: ADB2_WEBID, Name: 'IEC-Renewable', Description: 'מאגר אנרגיה מתחדשת',             Path: '\\\\' + MOCK_AF_SERVER_NAME + '\\IEC-Renewable',  _IsMock: true, Links: { Self: '/piwebapi/assetdatabases/' + ADB2_WEBID } },
          ],
        }};
      }
      if (p2 === 'securitymappings') return { status: 200, body: { Items: [] } };
    }

    // ── Asset Databases ──
    if (p0 === 'assetdatabases') {
      if (!p2) {
        return { status: 200, body: {
          WebId: p1,
          Name: p1 === ADB1_WEBID ? 'IEC-PowerGrid' : 'IEC-Renewable',
          Links: { Elements: '/piwebapi/assetdatabases/' + p1 + '/elements', EventFrames: '/piwebapi/assetdatabases/' + p1 + '/eventframes' },
        }};
      }
      if (p2 === 'elements') {
        const elements = Object.values(AF_ELEMENTS);
        return { status: 200, body: {
          Items: elements.map(e => Object.assign({}, e, { Links: _elementLinks(e.WebId) })),
          Links: {},
        }};
      }
      if (p2 === 'eventframes') {
        const startMs = _parseTime(params.startTime || '*-30d');
        const endMs   = _parseTime(params.endTime   || '*');
        const filtered = EVENT_FRAMES.filter(ef => {
          const efStart = Date.parse(ef.StartTime);
          const efEnd   = ef.EndTime ? Date.parse(ef.EndTime) : Date.now();
          return efEnd >= startMs && efStart <= endMs;
        });
        return { status: 200, body: {
          Items: filtered.map(ef => Object.assign({}, ef, { Links: { Self: '/piwebapi/eventframes/' + ef.WebId } })),
          Links: {},
        }};
      }
    }

    // ── Elements ──
    if (p0 === 'elements') {
      const el = AF_ELEMENTS[p1];
      if (p1 && !el) return { status: 404, body: { Errors: ['Element not found: ' + p1] } };

      if (!p2) return { status: 200, body: Object.assign({}, el, { Links: _elementLinks(el.WebId) }) };

      if (p2 === 'elements') {
        // Return child elements stub
        return { status: 200, body: { Items: [], Links: {} } };
      }

      if (p2 === 'attributes') {
        // Map Hebrew element names to English tag name prefixes
        const _hebrewToEnglish = {
          'אשקלון': 'Ashkelon', 'חדרה': 'Hadera', 'אורות רבין': 'OrotRabin',
          'רוטנברג': 'Rutenberg', 'רידינג': 'Reading',
        };
        const engName = _hebrewToEnglish[el.Name] || el.Name;
        const relatedTags = PI_TAGS.filter(t => t.Name.toLowerCase().includes(engName.toLowerCase()));
        return { status: 200, body: {
          Items: relatedTags.map(t => ({
            WebId: 'WATTR_' + t.WebId,
            Name: t.Descriptor,
            Description: t.Descriptor,
            Type: t.PointType === 'Float32' ? 'Double' : t.PointType,
            DefaultUnitsOfMeasure: t.EngineeringUnits,
            Value: { Value: _generateCurrentValue(t), Timestamp: new Date().toISOString(), Good: true },
            Links: { Self: '/piwebapi/attributes/WATTR_' + t.WebId, Value: '/piwebapi/attributes/WATTR_' + t.WebId + '/value' },
          })),
          Links: {},
        }};
      }

      if (p2 === 'eventframes') {
        const related = EVENT_FRAMES.filter(ef => ef.ReferencedElementWebIds.includes(p1));
        return { status: 200, body: { Items: related, Links: {} } };
      }
    }

    // ── Attributes ──
    if (p0 === 'attributes') {
      const attrWebId = p1;
      const tagWebId  = attrWebId.replace('WATTR_', '');
      const tag       = _tagByWebId[tagWebId];

      if (p2 === 'value') {
        return { status: 200, body: {
          Value: tag ? _generateCurrentValue(tag) : 0,
          Timestamp: new Date().toISOString(),
          Good: true,
        }};
      }
      if (p2 === 'recorded' || p2 === 'interpolated') {
        if (!tag) return { status: 404, body: { Errors: ['Attribute not found'] } };
        const startMs = _parseTime(params.startTime || '*-1d');
        const endMs   = _parseTime(params.endTime   || '*');
        const items   = _generateTimeSeries(tag, startMs, endMs, 200, p2);
        return { status: 200, body: { Items: items, Links: {} } };
      }
      return { status: 200, body: { WebId: attrWebId, _IsMock: true } };
    }

    // ── Event Frames ──
    if (p0 === 'eventframes') {
      const ef = EVENT_FRAMES.find(e => e.WebId === p1);
      if (p1 && !ef) return { status: 404, body: { Errors: ['EventFrame not found: ' + p1] } };
      if (!p2) return { status: 200, body: Object.assign({}, ef, { Links: { Self: '/piwebapi/eventframes/' + ef.WebId } }) };
      if (p2 === 'attributes') return { status: 200, body: { Items: ef.Attributes || [], Links: {} } };
    }

    // ── StreamSets ──
    if (p0 === 'streamsets') {
      const webIds = (params.webId || (body && body.webIds) || []);
      const webIdArr = Array.isArray(webIds) ? webIds : String(webIds).split(',').map(s => s.trim()).filter(Boolean);

      if (p1 === 'value' || method === 'POST' && p1 === 'value') {
        const items = webIdArr.map(wid => {
          const tag = _tagByWebId[wid];
          if (!tag) return { WebId: wid, Exception: { Message: 'Point not found', StatusCode: 404 } };
          return { WebId: wid, Value: { Value: _generateCurrentValue(tag), Timestamp: new Date().toISOString(), Good: true } };
        });
        return { status: 200, body: { Items: items, Links: {} } };
      }

      if (p1 === 'recorded') {
        const startMs = _parseTime(params.startTime || '*-1h');
        const endMs   = _parseTime(params.endTime   || '*');
        const items = webIdArr.map(wid => {
          const tag = _tagByWebId[wid];
          if (!tag) return { WebId: wid, Exception: { Message: 'Point not found', StatusCode: 404 } };
          return { WebId: wid, Items: _generateTimeSeries(tag, startMs, endMs, 60, 'recorded') };
        });
        return { status: 200, body: { Items: items, Links: {} } };
      }

      if (p1 === 'interpolated') {
        const startMs = _parseTime(params.startTime || '*-1h');
        const endMs   = _parseTime(params.endTime   || '*');
        const items = webIdArr.map(wid => {
          const tag = _tagByWebId[wid];
          if (!tag) return { WebId: wid, Exception: { Message: 'Point not found', StatusCode: 404 } };
          return { WebId: wid, Items: _generateTimeSeries(tag, startMs, endMs, 60, 'interpolated') };
        });
        return { status: 200, body: { Items: items, Links: {} } };
      }

      return { status: 200, body: { Items: [], Links: {} } };
    }

    // ── Batch ──
    if (p0 === 'batch' && method === 'POST') {
      const batchBody = body || {};
      const results = {};
      for (const [key, req] of Object.entries(batchBody)) {
        const bPath    = req.Resource || req.resource || '';
        const bMethod  = (req.Method || req.method || 'GET').toUpperCase();
        const bParams  = req.Parameters || req.parameters || {};
        const bBody    = req.Content || req.content || null;
        const bClean   = bPath.replace(/^.*\/piwebapi/, '');
        try {
          const r = _route(bMethod, '/piwebapi' + bClean, bParams, bBody, headers);
          results[key] = { Status: r.status, Content: r.body };
        } catch (e) {
          results[key] = { Status: 500, Content: { Errors: [e.message] } };
        }
      }
      return { status: 207, body: results };
    }

    // ── Channels (WebSocket stub) ──
    if (p0 === 'channels') {
      return { status: 200, body: {
        WebId: p1,
        _IsMock: true,
        _Note: 'WebSocket channels are not available in simulation mode. Use polling via /recorded or /value endpoints.',
        Links: { Source: '/piwebapi/points/' + p1 + '/value' },
      }};
    }

    // ── Default 404 ──
    return { status: 404, body: { Errors: ['Endpoint not found: ' + cleanPath], _IsMock: true } };
  }

  // ═══════════════════════════════════════════════════════════════
  //  CACHE
  // ═══════════════════════════════════════════════════════════════

  function _cacheKey(method, path, params) {
    return method + ':' + path + ':' + JSON.stringify(params || {});
  }

  function _cacheGet(key) {
    if (!_config.cacheEnabled) return null;
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > _config.cacheTtlMs) { _cache.delete(key); return null; }
    _totalCacheHits++;
    return entry.data;
  }

  function _cacheSet(key, data) {
    if (!_config.cacheEnabled) return;
    _cache.set(key, { data, ts: Date.now() });
    // LRU: trim to 500 entries
    if (_cache.size > 500) {
      _cache.delete(_cache.keys().next().value);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC REQUEST FUNCTION
  // ═══════════════════════════════════════════════════════════════

  /**
   * הממשק הראשי לשליחת בקשות מדומות.
   * @param {string} method  — 'GET' | 'POST' | 'PUT' | 'DELETE'
   * @param {string} path    — e.g. '/piwebapi/points/WTAG001/value'
   * @param {object} [params] — query params as key-value
   * @param {object} [body]   — request body
   * @param {object} [headers] — HTTP headers (for auth)
   * @returns {Promise<{ status: number, body: any }>}
   */
  async function request(method, path, params, body, headers) {
    _totalRequests++;
    const t0 = performance.now();

    // Check active error mode
    const now = Date.now();
    const errMode = (_config.errorUntil > now) ? _config.errorMode : null;

    if (errMode === 'timeout') {
      await new Promise(r => setTimeout(r, 15000)); // simulate timeout
      throw new Error('Request timed out (simulated)');
    }
    if (errMode === 'unauthorized') {
      await _simulateLatency();
      return { status: 401, body: { Errors: ['Unauthorized (simulated error mode)'] } };
    }
    if (errMode === 'servererror') {
      await _simulateLatency();
      return { status: 500, body: { Errors: ['Internal Server Error (simulated)'] } };
    }

    // Cache check (GET only)
    const ck = _cacheKey(method, path, params);
    if (method === 'GET') {
      const cached = _cacheGet(ck);
      if (cached) {
        _logRequest(method, path, 200, performance.now() - t0, true);
        return cached;
      }
    }

    await _simulateLatency();

    let result;
    try {
      result = _route(method, path, params, body, headers || {});
    } catch (e) {
      _totalErrors++;
      _logRequest(method, path, 500, performance.now() - t0, false);
      throw e;
    }

    // Partial error mode: truncate Items
    if (errMode === 'partial' && result.body && result.body.Items) {
      const arr = result.body.Items;
      result.body.Items = arr.slice(0, Math.max(1, Math.floor(arr.length / 2)));
      result.body._PartialResponse = true;
    }

    if (result.status >= 400) _totalErrors++;

    _logRequest(method, path, result.status, performance.now() - t0, false);

    // Cache successful GETs
    if (method === 'GET' && result.status < 400) {
      _cacheSet(ck, result);
    }

    return result;
  }

  // ═══════════════════════════════════════════════════════════════
  //  STREAMSETS CONVENIENCE
  // ═══════════════════════════════════════════════════════════════

  /**
   * קבלת snapshot לרשימת WebIds.
   * @param {string[]} webIds
   * @returns {Promise<Array>}
   */
  async function streamSetsValue(webIds) {
    const r = await request('GET', '/piwebapi/streamsets/value', { webId: webIds.join(',') });
    return r.body && r.body.Items ? r.body.Items : [];
  }

  /**
   * קבלת נתונים היסטוריים לרשימת WebIds.
   * @param {string[]} webIds
   * @param {string} startTime
   * @param {string} endTime
   * @returns {Promise<Array>}
   */
  async function streamSetsRecorded(webIds, startTime, endTime) {
    const r = await request('GET', '/piwebapi/streamsets/recorded', {
      webId: webIds.join(','),
      startTime: startTime || '*-1h',
      endTime: endTime || '*',
    });
    return r.body && r.body.Items ? r.body.Items : [];
  }

  // ═══════════════════════════════════════════════════════════════
  //  BATCH CONVENIENCE
  // ═══════════════════════════════════════════════════════════════

  /**
   * שולח batch request.
   * @param {object} batchBody — { key: { Method, Resource, Parameters } }
   * @param {object} [headers]
   * @returns {Promise<object>}
   */
  async function batch(batchBody, headers) {
    const r = await request('POST', '/piwebapi/batch', {}, batchBody, headers);
    return r.body || {};
  }

  // ═══════════════════════════════════════════════════════════════
  //  REQUEST LOG
  // ═══════════════════════════════════════════════════════════════

  function _logRequest(method, path, status, latencyMs, fromCache) {
    _requestLog.push({
      ts: new Date().toISOString(),
      method,
      path,
      status,
      latencyMs: +latencyMs.toFixed(1),
      fromCache,
    });
    if (_requestLog.length > 200) _requestLog.shift();
  }

  // ═══════════════════════════════════════════════════════════════
  //  PUBLIC API
  // ═══════════════════════════════════════════════════════════════

  const PIWebAPIMock = {
    VERSION,

    /**
     * אתחול המודול.
     * @param {object} opts
     * @param {string} [opts.authMode]     — 'none' | 'basic' | 'kerberos'
     * @param {string} [opts.username]
     * @param {string} [opts.password]
     * @param {number} [opts.latencyMs]    — base simulated latency (ms)
     * @param {number} [opts.latencyJitter]
     * @param {boolean} [opts.cacheEnabled]
     * @param {number} [opts.cacheTtlMs]
     */
    init(opts) {
      Object.assign(_config, opts || {});
      console.info('[PIWebAPIMock] אותחל בהצלחה — auth:', _config.authMode, '| latency:', _config.latencyMs, 'ms');
    },

    /**
     * מגדיר error mode זמני.
     * @param {'timeout'|'unauthorized'|'notfound'|'servererror'|'partial'|null} mode
     * @param {number} [durationMs=10000]
     */
    setErrorMode(mode, durationMs) {
      _config.errorMode = mode;
      _config.errorUntil = mode ? Date.now() + (durationMs || 10000) : 0;
      console.info('[PIWebAPIMock] Error mode:', mode, '— למשך', (durationMs || 10000), 'ms');
    },

    /**
     * מבטל error mode.
     */
    clearErrorMode() {
      _config.errorMode = null;
      _config.errorUntil = 0;
    },

    /** ראה request() */
    request,

    /** StreamSets shortcuts */
    streamSetsValue,
    streamSetsRecorded,

    /** Batch requests */
    batch,

    /**
     * קבלת כל התגים הידועים.
     * @returns {Array}
     */
    getTags() { return PI_TAGS.slice(); },

    /**
     * חיפוש תגים לפי שם.
     * @param {string} query
     * @returns {Array}
     */
    searchTags(query) {
      const q = (query || '').toLowerCase().replace(/\*/g, '');
      return PI_TAGS.filter(t =>
        !q || t.Name.toLowerCase().includes(q) || t.Descriptor.includes(q)
      );
    },

    /**
     * קבלת EventFrames.
     * @param {object} [opts]
     * @param {string} [opts.startTime]
     * @param {string} [opts.endTime]
     * @param {boolean} [opts.activeOnly]
     * @returns {Array}
     */
    getEventFrames(opts) {
      opts = opts || {};
      const startMs = _parseTime(opts.startTime || '*-365d');
      const endMs   = _parseTime(opts.endTime   || '*');
      return EVENT_FRAMES.filter(ef => {
        if (opts.activeOnly && !ef.IsActive) return false;
        const efStart = Date.parse(ef.StartTime);
        const efEnd   = ef.EndTime ? Date.parse(ef.EndTime) : Date.now();
        return efEnd >= startMs && efStart <= endMs;
      });
    },

    /**
     * מצב נוכחי ומדדי ביצועים.
     * @returns {object}
     */
    getStatus() {
      return {
        mode: 'MOCK',
        isMock: true,
        version: VERSION,
        config: Object.assign({}, _config, { password: _config.password ? '***' : '' }),
        metrics: {
          totalRequests: _totalRequests,
          totalErrors: _totalErrors,
          totalCacheHits: _totalCacheHits,
          cacheSize: _cache.size,
          cacheHitRate: _totalRequests > 0 ? +(_totalCacheHits / _totalRequests * 100).toFixed(1) : 0,
        },
        tags: { count: PI_TAGS.length },
        eventFrames: { count: EVENT_FRAMES.length },
        afElements: { count: Object.keys(AF_ELEMENTS).length },
      };
    },

    /**
     * קבלת לוג בקשות אחרונות.
     * @param {number} [n=20]
     * @returns {Array}
     */
    getRequestLog(n) {
      return _requestLog.slice(-(n || 20));
    },

    /**
     * ניקוי מטמון.
     */
    clearCache() {
      _cache.clear();
    },

    // Expose for testing
    _parseTime,
    _generateTimeSeries,
    _generateSummary,
    _PI_TAGS: PI_TAGS,
    _EVENT_FRAMES: EVENT_FRAMES,
    _AF_ELEMENTS: AF_ELEMENTS,
  };

  global.PIWebAPIMock = PIWebAPIMock;

})(typeof window !== 'undefined' ? window : globalThis);
