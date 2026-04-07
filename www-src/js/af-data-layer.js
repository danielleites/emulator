/**
 * af-data-layer.js — Comprehensive AF (Asset Framework) Data Layer
 *
 * ═══════════════════════════════════════════════════════════════
 * DATA SOURCE: PURE MOCK — אין תקשורת רשת אמיתית ל-PI Server
 * ═══════════════════════════════════════════════════════════════
 * קובץ זה הוא שכבת נתונים מבוקרת לחלוטין (pure JavaScript mock).
 * כל הנתונים מושבים בזמן הריצה בדפדפן.
 * לא מתרחשת כל קריאת רשת לשרת PI Web API.
 *
 * פרטים נתונים מוקים:
 *   אתרים: 5 | אלמנטים: 853 | מאפיינים: 8,656 | תגי PI: 2,670
 *   היסטוריה: 3 שנים (generated) | פורמט תגובה: PI Web API compatible
 *
 * לחיבור ל-AF אמיתי: החלף מודול זה בשכבת HTTP המתקשרת ל-PI Web API באמצעות pi-connector.js.
 * ═══════════════════════════════════════════════════════════════
 *
 * Provides a full mock of the OSIsoft PI AF hierarchy with:
 * - 5 power plant sites (אשקלון, חדרה, אורות רבין, רוטנברג, רידינג)
 * - Multi-level hierarchy: Site → Area → Unit → Equipment → Instrument
 * - Rich attributes: Double, String, Int32, Enum, DateTime, Boolean
 * - 3 years of historical time-series data for numeric tags
 * - PI Web API compatible response formats
 * - Event Frames with start/end times
 * - Tag search, recorded/interpolated values, summaries
 *
 * Usage:
 *   const af = new AFDataLayer();
 *   af.getElements('\\\\PIServer\\IEC');              // browse root
 *   af.getAttributes(elementWebId);                   // get attributes
 *   af.getRecordedValues(tagWebId, start, end, 1000); // historical data
 *   af.searchTags('טמפרטורה');                        // tag search
 */

'use strict';

const AFDataLayer = (() => {

  // ═══════════════════════════════════════════════════════════════
  //  CONSTANTS & HELPERS
  // ═══════════════════════════════════════════════════════════════

  const GUID = () => {
    const s4 = () => Math.floor((1 + Math.random()) * 0x10000).toString(16).substring(1);
    return s4()+s4()+'-'+s4()+'-'+s4()+'-'+s4()+'-'+s4()+s4()+s4();
  };

  const webId = (prefix, path) => {
    // Create deterministic webId from path
    let hash = 0;
    const str = prefix + ':' + path;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return 'W' + prefix + Math.abs(hash).toString(36).toUpperCase().padStart(12, '0');
  };

  // Time constants
  const HOUR = 3600000;
  const DAY = 86400000;
  const YEAR = 365.25 * DAY;
  const NOW = Date.now();
  const THREE_YEARS_AGO = NOW - (3 * YEAR);

  // ═══════════════════════════════════════════════════════════════
  //  ENUM SETS — used for status/type attributes
  // ═══════════════════════════════════════════════════════════════

  const ENUM_SETS = {
    'UnitStatus': {
      values: { 0: 'לא פעיל', 1: 'עובד', 2: 'תחזוקה', 3: 'השבתה מתוכננת', 4: 'תקלה', 5: 'הפעלה', 6: 'כיבוי' },
      description: 'מצב יחידת ייצור'
    },
    'FuelType': {
      values: { 0: 'גז טבעי', 1: 'פחם', 2: 'סולר', 3: 'ביו-גז', 4: 'משולב' },
      description: 'סוג דלק'
    },
    'AlarmSeverity': {
      values: { 0: 'מידע', 1: 'אזהרה', 2: 'קריטי', 3: 'חירום' },
      description: 'רמת חומרה'
    },
    'MaintenanceType': {
      values: { 0: 'שוטפת', 1: 'מונעת', 2: 'מתקנת', 3: 'שדרוג', 4: 'בדיקה תקופתית' },
      description: 'סוג תחזוקה'
    },
    'EmissionLevel': {
      values: { 0: 'תקין', 1: 'מעל סף', 2: 'חריגה', 3: 'חירום סביבתי' },
      description: 'רמת פליטות'
    },
    'CoolingMethod': {
      values: { 0: 'מי ים', 1: 'מגדל קירור', 2: 'אוויר', 3: 'משולב' },
      description: 'שיטת קירור'
    },
    'ProtectionZone': {
      values: { 0: 'אזור A', 1: 'אזור B', 2: 'אזור C', 3: 'אזור D' },
      description: 'אזור הגנה'
    }
  };

  // ═══════════════════════════════════════════════════════════════
  //  SITE DEFINITIONS — 5 power plants with full detail
  // ═══════════════════════════════════════════════════════════════

  const SITES = [
    {
      name: 'אשקלון',
      nameEn: 'Ashkelon',
      type: 'גז טבעי',
      capacity: 2250,
      commissioned: '2002',
      cooling: 'מי ים',
      units: [
        { name: 'יחידה 1', capacity: 375, turbineType: 'GE 9FA', fuelType: 0 },
        { name: 'יחידה 2', capacity: 375, turbineType: 'GE 9FA', fuelType: 0 },
        { name: 'יחידה 3', capacity: 375, turbineType: 'GE 9FA', fuelType: 0 },
        { name: 'יחידה 4', capacity: 375, turbineType: 'Siemens V94.3A', fuelType: 0 },
        { name: 'קיטור 1', capacity: 375, turbineType: 'Steam Turbine', fuelType: 0 },
        { name: 'קיטור 2', capacity: 375, turbineType: 'Steam Turbine', fuelType: 0 }
      ],
      areas: ['דוד קיטור', 'טורבינת גז', 'טורבינת קיטור', 'מערכת קירור', 'חשמל', 'מערכות עזר', 'סביבה']
    },
    {
      name: 'חדרה',
      nameEn: 'Hadera',
      type: 'פחם/גז',
      capacity: 2590,
      commissioned: '1984',
      cooling: 'מי ים',
      units: [
        { name: 'יחידה 1', capacity: 350, turbineType: 'ABB Steam', fuelType: 1 },
        { name: 'יחידה 2', capacity: 350, turbineType: 'ABB Steam', fuelType: 1 },
        { name: 'יחידה 3', capacity: 350, turbineType: 'ABB Steam', fuelType: 1 },
        { name: 'יחידה 4', capacity: 350, turbineType: 'ABB Steam', fuelType: 1 },
        { name: 'גז 5', capacity: 420, turbineType: 'GE 9FA', fuelType: 0 },
        { name: 'גז 6', capacity: 420, turbineType: 'GE 9FA', fuelType: 0 }
      ],
      areas: ['דוד קיטור', 'טורבינת גז', 'טורבינת קיטור', 'מערכת קירור', 'חשמל', 'מערכות עזר', 'סביבה', 'מזקקה פחם']
    },
    {
      name: 'אורות רבין',
      nameEn: 'Orot Rabin',
      type: 'פחם/גז',
      capacity: 2590,
      commissioned: '1976',
      cooling: 'מי ים',
      units: [
        { name: 'יחידה 1', capacity: 350, turbineType: 'Alstom Steam', fuelType: 1 },
        { name: 'יחידה 2', capacity: 350, turbineType: 'Alstom Steam', fuelType: 1 },
        { name: 'יחידה 3', capacity: 350, turbineType: 'Alstom Steam', fuelType: 1 },
        { name: 'יחידה 4', capacity: 350, turbineType: 'Alstom Steam', fuelType: 1 },
        { name: 'גז 5', capacity: 420, turbineType: 'Siemens SGT5-4000F', fuelType: 0 },
        { name: 'גז 6', capacity: 420, turbineType: 'Siemens SGT5-4000F', fuelType: 0 }
      ],
      areas: ['דוד קיטור', 'טורבינת גז', 'טורבינת קיטור', 'מערכת קירור', 'חשמל', 'מערכות עזר', 'סביבה', 'מזקקה פחם']
    },
    {
      name: 'רוטנברג',
      nameEn: 'Rutenberg',
      type: 'פחם',
      capacity: 2250,
      commissioned: '1989',
      cooling: 'מי ים',
      units: [
        { name: 'יחידה 1', capacity: 562.5, turbineType: 'ABB Steam', fuelType: 1 },
        { name: 'יחידה 2', capacity: 562.5, turbineType: 'ABB Steam', fuelType: 1 },
        { name: 'יחידה 3', capacity: 562.5, turbineType: 'ABB Steam', fuelType: 1 },
        { name: 'יחידה 4', capacity: 562.5, turbineType: 'ABB Steam', fuelType: 1 }
      ],
      areas: ['דוד קיטור', 'טורבינת קיטור', 'מערכת קירור', 'חשמל', 'מערכות עזר', 'סביבה', 'מזקקה פחם', 'ביטחון']
    },
    {
      name: 'רידינג',
      nameEn: 'Reading',
      type: 'גז טבעי',
      capacity: 604,
      commissioned: '1999',
      cooling: 'אוויר',
      units: [
        { name: 'גז 1', capacity: 151, turbineType: 'GE LM6000', fuelType: 0 },
        { name: 'גז 2', capacity: 151, turbineType: 'GE LM6000', fuelType: 0 },
        { name: 'גז 3', capacity: 151, turbineType: 'GE LM6000', fuelType: 0 },
        { name: 'גז 4', capacity: 151, turbineType: 'GE LM6000', fuelType: 0 }
      ],
      areas: ['טורבינת גז', 'מערכת קירור', 'חשמל', 'מערכות עזר', 'סביבה']
    }
  ];

  // ═══════════════════════════════════════════════════════════════
  //  EQUIPMENT TEMPLATES — per area type
  // ═══════════════════════════════════════════════════════════════

  const EQUIPMENT_TEMPLATES = {
    'דוד קיטור': [
      { name: 'מבער ראשי', instruments: ['טמפרטורת להבה', 'לחץ גז כניסה', 'ספיקת דלק', 'O2 בארובה'] },
      { name: 'ארובה', instruments: ['טמפרטורת גזים', 'NOx', 'SO2', 'חלקיקים', 'CO'] },
      { name: 'מחמם מוקדם', instruments: ['טמפ\' כניסה', 'טמפ\' יציאה', 'הפרש לחץ'] },
      { name: 'דרום קיטור', instruments: ['לחץ קיטור ראשי', 'טמפ\' קיטור ראשי', 'ספיקת קיטור', 'מפלס מים'] }
    ],
    'טורבינת גז': [
      { name: 'מדחס', instruments: ['לחץ כניסה', 'לחץ יציאה', 'טמפ\' כניסה', 'טמפ\' יציאה', 'רטט'] },
      { name: 'תא שריפה', instruments: ['טמפרטורת להבה', 'לחץ', 'ספיקת דלק'] },
      { name: 'טורבינה', instruments: ['מהירות סיבוב', 'טמפ\' כניסה', 'טמפ\' יציאה', 'רטט ציר', 'הספק'] },
      { name: 'גנרטור', instruments: ['מתח', 'זרם', 'הספק פעיל', 'הספק ריאקטיבי', 'טמפ\' סלילים'] }
    ],
    'טורבינת קיטור': [
      { name: 'LP טורבינה', instruments: ['מהירות', 'רטט', 'טמפ\' כניסה', 'לחץ כניסה'] },
      { name: 'HP טורבינה', instruments: ['מהירות', 'רטט', 'טמפ\' כניסה', 'לחץ כניסה'] },
      { name: 'עיבוי', instruments: ['ואקום', 'טמפ\' מי קירור כניסה', 'טמפ\' מי קירור יציאה'] },
      { name: 'גנרטור', instruments: ['מתח', 'זרם', 'הספק', 'קוספי', 'טמפ\' ליבה'] }
    ],
    'מערכת קירור': [
      { name: 'משאבת קירור ראשית', instruments: ['לחץ כניסה', 'לחץ יציאה', 'ספיקה', 'טמפרטורה', 'זרם מנוע'] },
      { name: 'מגדל קירור', instruments: ['טמפ\' כניסה', 'טמפ\' יציאה', 'לחות', 'מפלס'] },
      { name: 'מחליף חום', instruments: ['טמפ\' צד חם', 'טמפ\' צד קר', 'הפרש לחץ'] }
    ],
    'חשמל': [
      { name: 'שנאי ראשי', instruments: ['מתח ראשי', 'מתח משני', 'זרם', 'טמפ\' שמן', 'הספק'] },
      { name: 'לוח חלוקה', instruments: ['מתח', 'זרם', 'תדר', 'קוספי'] },
      { name: 'מערכת הארקה', instruments: ['התנגדות הארקה', 'זרם דליפה'] }
    ],
    'מערכות עזר': [
      { name: 'מערכת שמן', instruments: ['לחץ שמן', 'טמפ\' שמן', 'מפלס מיכל', 'ספיקה'] },
      { name: 'מערכת אוויר דחוס', instruments: ['לחץ', 'טמפרטורה', 'נקודת טל', 'ספיקה'] },
      { name: 'מערכת מים', instruments: ['לחץ', 'ספיקה', 'מוליכות', 'pH'] }
    ],
    'סביבה': [
      { name: 'תחנת ניטור', instruments: ['NOx', 'SO2', 'CO', 'חלקיקים PM10', 'PM2.5', 'O3'] },
      { name: 'רעש', instruments: ['dB(A) גבול צפון', 'dB(A) גבול דרום'] },
      { name: 'מי שפכים', instruments: ['pH', 'מוליכות', 'טמפרטורה', 'BOD', 'TSS'] }
    ],
    'מזקקה פחם': [
      { name: 'מסוע', instruments: ['מהירות', 'עומס', 'טמפ\' מנוע', 'רטט'] },
      { name: 'מגרסה', instruments: ['מהירות', 'זרם', 'טמפרטורה', 'רטט'] },
      { name: 'סילו', instruments: ['מפלס', 'טמפרטורה', 'לחות'] }
    ],
    'ביטחון': [
      { name: 'מצלמות', instruments: ['סטטוס מצלמה 1', 'סטטוס מצלמה 2'] },
      { name: 'גדר חשמלית', instruments: ['מתח', 'סטטוס'] }
    ]
  };

  // ═══════════════════════════════════════════════════════════════
  //  ATTRIBUTE TEMPLATES — per instrument type
  // ═══════════════════════════════════════════════════════════════

  const INSTRUMENT_PROFILES = {
    // Temperature instruments
    'טמפרטורה': { uom: '°C', min: 15, max: 650, typical: 350, noise: 5, type: 'Double' },
    'טמפ\'': { uom: '°C', min: 15, max: 650, typical: 280, noise: 8, type: 'Double' },
    'טמפרטורת להבה': { uom: '°C', min: 800, max: 1400, typical: 1100, noise: 20, type: 'Double' },
    'טמפ\' כניסה': { uom: '°C', min: 100, max: 600, typical: 350, noise: 5, type: 'Double' },
    'טמפ\' יציאה': { uom: '°C', min: 50, max: 400, typical: 200, noise: 5, type: 'Double' },
    'טמפ\' גזים': { uom: '°C', min: 100, max: 500, typical: 300, noise: 8, type: 'Double' },
    'טמפ\' שמן': { uom: '°C', min: 30, max: 90, typical: 55, noise: 2, type: 'Double' },
    'טמפ\' סלילים': { uom: '°C', min: 40, max: 130, typical: 85, noise: 3, type: 'Double' },
    'טמפ\' מי קירור כניסה': { uom: '°C', min: 15, max: 32, typical: 22, noise: 1, type: 'Double' },
    'טמפ\' מי קירור יציאה': { uom: '°C', min: 25, max: 45, typical: 35, noise: 1, type: 'Double' },
    'טמפ\' קיטור ראשי': { uom: '°C', min: 400, max: 570, typical: 540, noise: 3, type: 'Double' },
    'טמפ\' צד חם': { uom: '°C', min: 50, max: 200, typical: 120, noise: 3, type: 'Double' },
    'טמפ\' צד קר': { uom: '°C', min: 20, max: 80, typical: 45, noise: 2, type: 'Double' },
    'טמפ\' ליבה': { uom: '°C', min: 50, max: 120, typical: 80, noise: 2, type: 'Double' },
    'טמפ\' מנוע': { uom: '°C', min: 30, max: 100, typical: 65, noise: 3, type: 'Double' },
    // Pressure instruments
    'לחץ': { uom: 'bar', min: 0, max: 200, typical: 80, noise: 2, type: 'Double' },
    'לחץ כניסה': { uom: 'bar', min: 0, max: 50, typical: 25, noise: 1, type: 'Double' },
    'לחץ יציאה': { uom: 'bar', min: 10, max: 200, typical: 100, noise: 2, type: 'Double' },
    'לחץ גז כניסה': { uom: 'bar', min: 15, max: 45, typical: 30, noise: 0.5, type: 'Double' },
    'לחץ קיטור ראשי': { uom: 'bar', min: 80, max: 180, typical: 140, noise: 2, type: 'Double' },
    'לחץ שמן': { uom: 'bar', min: 0, max: 10, typical: 4.5, noise: 0.3, type: 'Double' },
    'הפרש לחץ': { uom: 'mbar', min: 0, max: 500, typical: 150, noise: 10, type: 'Double' },
    'ואקום': { uom: 'mbar(a)', min: 30, max: 80, typical: 50, noise: 2, type: 'Double' },
    // Flow instruments
    'ספיקה': { uom: 'm³/h', min: 0, max: 5000, typical: 2000, noise: 50, type: 'Double' },
    'ספיקת דלק': { uom: 'kg/s', min: 0, max: 50, typical: 25, noise: 1, type: 'Double' },
    'ספיקת קיטור': { uom: 'ton/h', min: 0, max: 800, typical: 400, noise: 10, type: 'Double' },
    'זרימה': { uom: 'm³/h', min: 0, max: 3000, typical: 1500, noise: 30, type: 'Double' },
    // Electrical instruments
    'מתח': { uom: 'kV', min: 0, max: 420, typical: 22, noise: 0.3, type: 'Double' },
    'מתח ראשי': { uom: 'kV', min: 130, max: 170, typical: 161, noise: 0.5, type: 'Double' },
    'מתח משני': { uom: 'kV', min: 20, max: 25, typical: 22, noise: 0.2, type: 'Double' },
    'זרם': { uom: 'A', min: 0, max: 20000, typical: 8000, noise: 100, type: 'Double' },
    'זרם מנוע': { uom: 'A', min: 0, max: 500, typical: 200, noise: 5, type: 'Double' },
    'זרם דליפה': { uom: 'mA', min: 0, max: 30, typical: 2, noise: 0.5, type: 'Double' },
    'תדר': { uom: 'Hz', min: 49.5, max: 50.5, typical: 50.0, noise: 0.02, type: 'Double' },
    'הספק': { uom: 'MW', min: 0, max: 600, typical: 350, noise: 5, type: 'Double' },
    'הספק פעיל': { uom: 'MW', min: 0, max: 500, typical: 350, noise: 5, type: 'Double' },
    'הספק ריאקטיבי': { uom: 'MVAR', min: -100, max: 200, typical: 50, noise: 3, type: 'Double' },
    'קוספי': { uom: '', min: 0.85, max: 1.0, typical: 0.95, noise: 0.01, type: 'Double' },
    'התנגדות הארקה': { uom: 'Ω', min: 0, max: 5, typical: 0.5, noise: 0.1, type: 'Double' },
    // Speed/vibration
    'מהירות': { uom: 'RPM', min: 0, max: 3600, typical: 3000, noise: 5, type: 'Double' },
    'מהירות סיבוב': { uom: 'RPM', min: 0, max: 3600, typical: 3000, noise: 3, type: 'Double' },
    'רטט': { uom: 'mm/s', min: 0, max: 15, typical: 3.5, noise: 0.5, type: 'Double' },
    'רטט ציר': { uom: 'μm', min: 0, max: 200, typical: 45, noise: 5, type: 'Double' },
    // Level
    'מפלס': { uom: '%', min: 0, max: 100, typical: 65, noise: 2, type: 'Double' },
    'מפלס מים': { uom: '%', min: 30, max: 80, typical: 55, noise: 1, type: 'Double' },
    'מפלס מיכל': { uom: '%', min: 10, max: 95, typical: 60, noise: 2, type: 'Double' },
    // Emissions/environment
    'NOx': { uom: 'mg/Nm³', min: 0, max: 200, typical: 55, noise: 5, type: 'Double' },
    'SO2': { uom: 'mg/Nm³', min: 0, max: 400, typical: 80, noise: 8, type: 'Double' },
    'CO': { uom: 'mg/Nm³', min: 0, max: 100, typical: 15, noise: 3, type: 'Double' },
    'O2 בארובה': { uom: '%', min: 0, max: 21, typical: 3.5, noise: 0.3, type: 'Double' },
    'O3': { uom: 'ppb', min: 0, max: 200, typical: 40, noise: 5, type: 'Double' },
    'חלקיקים': { uom: 'mg/Nm³', min: 0, max: 50, typical: 10, noise: 2, type: 'Double' },
    'חלקיקים PM10': { uom: 'μg/m³', min: 0, max: 150, typical: 35, noise: 5, type: 'Double' },
    'PM2.5': { uom: 'μg/m³', min: 0, max: 75, typical: 15, noise: 3, type: 'Double' },
    'dB(A) גבול צפון': { uom: 'dB(A)', min: 35, max: 75, typical: 55, noise: 2, type: 'Double' },
    'dB(A) גבול דרום': { uom: 'dB(A)', min: 35, max: 75, typical: 52, noise: 2, type: 'Double' },
    // Water quality
    'pH': { uom: '', min: 5, max: 9, typical: 7.2, noise: 0.2, type: 'Double' },
    'מוליכות': { uom: 'μS/cm', min: 0, max: 5000, typical: 800, noise: 50, type: 'Double' },
    'BOD': { uom: 'mg/L', min: 0, max: 50, typical: 12, noise: 2, type: 'Double' },
    'TSS': { uom: 'mg/L', min: 0, max: 100, typical: 20, noise: 3, type: 'Double' },
    'נקודת טל': { uom: '°C', min: -40, max: 10, typical: -20, noise: 2, type: 'Double' },
    // Misc
    'עומס': { uom: 'ton', min: 0, max: 100, typical: 40, noise: 3, type: 'Double' },
    'לחות': { uom: '%RH', min: 10, max: 95, typical: 50, noise: 3, type: 'Double' },
    // Status instruments (digital)
    'סטטוס': { uom: '', values: ['פעיל', 'כבוי'], type: 'Digital' },
    'סטטוס מצלמה 1': { uom: '', values: ['תקין', 'תקלה'], type: 'Digital' },
    'סטטוס מצלמה 2': { uom: '', values: ['תקין', 'תקלה'], type: 'Digital' }
  };

  // ═══════════════════════════════════════════════════════════════
  //  STATIC ATTRIBUTE TEMPLATES — non-tag attributes per element
  // ═══════════════════════════════════════════════════════════════

  const SITE_ATTRIBUTES = [
    { name: 'שם אתר', type: 'String', category: 'כללי' },
    { name: 'שם באנגלית', type: 'String', category: 'כללי' },
    { name: 'הספק מותקן', type: 'Double', uom: 'MW', category: 'כללי' },
    { name: 'שנת הקמה', type: 'String', category: 'כללי' },
    { name: 'סוג תחנה', type: 'String', category: 'כללי' },
    { name: 'שיטת קירור', type: 'Enum', enumSet: 'CoolingMethod', category: 'כללי' },
    { name: 'מספר יחידות', type: 'Int32', category: 'כללי' },
    { name: 'קו רוחב', type: 'Double', category: 'מיקום' },
    { name: 'קו אורך', type: 'Double', category: 'מיקום' },
    { name: 'כתובת', type: 'String', category: 'מיקום' },
    { name: 'טלפון מוקד', type: 'String', category: 'קשר' },
    { name: 'מנהל תחנה', type: 'String', category: 'קשר' },
    { name: 'רישיון עסק', type: 'String', category: 'רגולציה' },
    { name: 'תוקף רישיון', type: 'DateTime', category: 'רגולציה' },
    { name: 'אזור הגנה', type: 'Enum', enumSet: 'ProtectionZone', category: 'רגולציה' },
    { name: 'סף פליטות NOx', type: 'Double', uom: 'mg/Nm³', category: 'סביבה' },
    { name: 'סף פליטות SO2', type: 'Double', uom: 'mg/Nm³', category: 'סביבה' },
    { name: 'פעיל', type: 'Boolean', category: 'סטטוס' }
  ];

  const UNIT_ATTRIBUTES = [
    { name: 'שם יחידה', type: 'String', category: 'כללי' },
    { name: 'הספק מותקן', type: 'Double', uom: 'MW', category: 'כללי' },
    { name: 'סוג טורבינה', type: 'String', category: 'כללי' },
    { name: 'סוג דלק', type: 'Enum', enumSet: 'FuelType', category: 'כללי' },
    { name: 'מצב יחידה', type: 'Enum', enumSet: 'UnitStatus', category: 'סטטוס' },
    { name: 'שעות פעילות מצטברות', type: 'Double', uom: 'h', category: 'תחזוקה' },
    { name: 'תאריך תחזוקה אחרונה', type: 'DateTime', category: 'תחזוקה' },
    { name: 'סוג תחזוקה אחרונה', type: 'Enum', enumSet: 'MaintenanceType', category: 'תחזוקה' },
    { name: 'יעילות תרמית', type: 'Double', uom: '%', category: 'ביצועים' },
    { name: 'זמינות שנתית', type: 'Double', uom: '%', category: 'ביצועים' },
    { name: 'גורם ניצולת', type: 'Double', uom: '%', category: 'ביצועים' },
    { name: 'מספר סידורי', type: 'String', category: 'זיהוי' },
    { name: 'יצרן', type: 'String', category: 'זיהוי' }
  ];

  const EQUIPMENT_ATTRIBUTES = [
    { name: 'שם ציוד', type: 'String', category: 'כללי' },
    { name: 'יצרן', type: 'String', category: 'כללי' },
    { name: 'מספר סידורי', type: 'String', category: 'כללי' },
    { name: 'שנת התקנה', type: 'Int32', category: 'כללי' },
    { name: 'סטטוס', type: 'Enum', enumSet: 'UnitStatus', category: 'סטטוס' },
    { name: 'שעות פעילות', type: 'Double', uom: 'h', category: 'תחזוקה' },
    { name: 'תאריך כיול אחרון', type: 'DateTime', category: 'תחזוקה' },
    { name: 'מרווח כיול', type: 'Int32', uom: 'ימים', category: 'תחזוקה' },
    { name: 'הערות', type: 'String', category: 'כללי' }
  ];

  // ═══════════════════════════════════════════════════════════════
  //  SEEDED RANDOM — deterministic data generation
  // ═══════════════════════════════════════════════════════════════

  function seededRandom(seed) {
    let s = seed;
    return function() {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function hashStr(str) {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash) + str.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  }

  // ═══════════════════════════════════════════════════════════════
  //  CLASS: AFDataLayer
  // ═══════════════════════════════════════════════════════════════

  class AFDataLayer {

    constructor() {
      this._elements = {};    // webId → element
      this._attributes = {};  // webId → attribute
      this._tags = {};        // webId → tag (PI Point)
      this._tagsByName = {};  // tag name → tag
      this._rootElements = []; // top-level site elements
      this._eventFrames = []; 
      this._initialized = false;

      this._buildHierarchy();
      this._buildEventFrames();
      this._initialized = true;
    }

    // ─── Build Full Hierarchy ──────────────────────────────────

    _buildHierarchy() {
      const SERVER = 'PIServer-IEC';
      const DB = 'IEC-PowerGrid';
      const rootPath = '\\\\' + SERVER + '\\' + DB;

      SITES.forEach(site => {
        const sitePath = rootPath + '\\' + site.name;
        const siteWid = webId('E', sitePath);
        
        // Create site element
        const siteEl = {
          WebId: siteWid,
          Name: site.name,
          Description: 'תחנת כוח ' + site.name + ' — ' + site.type + ', ' + site.capacity + ' MW',
          Path: sitePath,
          TemplateName: 'תחנת כוח',
          HasChildren: true,
          CategoryNames: ['כללי', 'מיקום', 'קשר', 'רגולציה', 'סביבה', 'סטטוס'],
          Links: { Self: '/elements/' + siteWid, Attributes: '/elements/' + siteWid + '/attributes', Elements: '/elements/' + siteWid + '/elements' },
          _children: [],
          _attributes: [],
          _siteData: site
        };

        this._elements[siteWid] = siteEl;
        this._rootElements.push(siteEl);

        // Create site-level attributes
        this._createSiteAttributes(siteEl, site);

        // Create units under site
        site.units.forEach((unit, ui) => {
          const unitPath = sitePath + '\\' + unit.name;
          const unitWid = webId('E', unitPath);
          
          const unitEl = {
            WebId: unitWid,
            Name: unit.name,
            Description: unit.turbineType + ' — ' + unit.capacity + ' MW',
            Path: unitPath,
            TemplateName: 'יחידת ייצור',
            HasChildren: true,
            CategoryNames: ['כללי', 'סטטוס', 'תחזוקה', 'ביצועים', 'זיהוי'],
            Links: { Self: '/elements/' + unitWid, Attributes: '/elements/' + unitWid + '/attributes', Elements: '/elements/' + unitWid + '/elements' },
            _children: [],
            _attributes: [],
            _unitData: unit,
            _parentWebId: siteWid
          };

          this._elements[unitWid] = unitEl;
          siteEl._children.push(unitEl);

          // Create unit-level attributes
          this._createUnitAttributes(unitEl, unit, site);

          // Create areas under unit
          site.areas.forEach(areaName => {
            const areaPath = unitPath + '\\' + areaName;
            const areaWid = webId('E', areaPath);
            
            const areaEl = {
              WebId: areaWid,
              Name: areaName,
              Description: areaName + ' — ' + unit.name + ', ' + site.name,
              Path: areaPath,
              TemplateName: 'אזור',
              HasChildren: true,
              CategoryNames: ['כללי'],
              Links: { Self: '/elements/' + areaWid, Attributes: '/elements/' + areaWid + '/attributes', Elements: '/elements/' + areaWid + '/elements' },
              _children: [],
              _attributes: [],
              _parentWebId: unitWid
            };

            this._elements[areaWid] = areaEl;
            unitEl._children.push(areaEl);

            // Create equipment under area
            const equipTemplates = EQUIPMENT_TEMPLATES[areaName] || [];
            equipTemplates.forEach(equip => {
              const equipPath = areaPath + '\\' + equip.name;
              const equipWid = webId('E', equipPath);
              
              const equipEl = {
                WebId: equipWid,
                Name: equip.name,
                Description: equip.name + ' — ' + areaName,
                Path: equipPath,
                TemplateName: 'ציוד',
                HasChildren: false,
                CategoryNames: ['כללי', 'סטטוס', 'תחזוקה'],
                Links: { Self: '/elements/' + equipWid, Attributes: '/elements/' + equipWid + '/attributes' },
                _children: [],
                _attributes: [],
                _parentWebId: areaWid
              };

              this._elements[equipWid] = equipEl;
              areaEl._children.push(equipEl);

              // Create equipment-level static attributes
              this._createEquipmentAttributes(equipEl, equip, site);

              // Create instrument/tag attributes
              equip.instruments.forEach(instrName => {
                this._createInstrumentTag(equipEl, instrName, site, unit, areaName, equip.name);
              });
            });
          });
        });
      });
    }

    _createSiteAttributes(siteEl, site) {
      const siteLocations = {
        'אשקלון': { lat: 31.66, lon: 34.55, addr: 'אזור התעשייה דרום, אשקלון', phone: '08-6712345', manager: 'יוסי כהן' },
        'חדרה': { lat: 32.45, lon: 34.88, addr: 'חוף הים, חדרה', phone: '04-6321234', manager: 'רחל לוי' },
        'אורות רבין': { lat: 32.39, lon: 34.87, addr: 'חדרה דרום', phone: '04-6334567', manager: 'דוד אברהם' },
        'רוטנברג': { lat: 31.33, lon: 34.43, addr: 'אשקלון דרום', phone: '08-6745678', manager: 'מיכאל שרון' },
        'רידינג': { lat: 32.10, lon: 34.77, addr: 'דרך נמל תל אביב', phone: '03-5124567', manager: 'שרה גולן' }
      };
      const loc = siteLocations[site.name] || { lat: 32, lon: 34.8, addr: '', phone: '', manager: '' };
      
      const vals = {
        'שם אתר': site.name,
        'שם באנגלית': site.nameEn,
        'הספק מותקן': site.capacity,
        'שנת הקמה': site.commissioned,
        'סוג תחנה': site.type,
        'שיטת קירור': site.cooling === 'מי ים' ? 0 : (site.cooling === 'אוויר' ? 2 : 3),
        'מספר יחידות': site.units.length,
        'קו רוחב': loc.lat,
        'קו אורך': loc.lon,
        'כתובת': loc.addr,
        'טלפון מוקד': loc.phone,
        'מנהל תחנה': loc.manager,
        'רישיון עסק': 'IEC-' + site.nameEn.toUpperCase().replace(/\s/g,'') + '-2024',
        'תוקף רישיון': '2027-12-31T00:00:00Z',
        'אזור הגנה': Math.floor(Math.random()*4),
        'סף פליטות NOx': 150,
        'סף פליטות SO2': 200,
        'פעיל': true
      };

      SITE_ATTRIBUTES.forEach(attrDef => {
        const attrPath = siteEl.Path + '|' + attrDef.name;
        const attrWid = webId('A', attrPath);
        const attr = {
          WebId: attrWid,
          Name: attrDef.name,
          Description: attrDef.name + ' של ' + site.name,
          Type: attrDef.type,
          TypeQualifier: attrDef.enumSet || '',
          DefaultUnitsOfMeasure: attrDef.uom || '',
          CategoryNames: [attrDef.category],
          Value: { Value: vals[attrDef.name], Timestamp: new Date().toISOString(), Good: true },
          Path: attrPath,
          HasChildren: false,
          IsConfigurationItem: true,
          Links: { Self: '/attributes/' + attrWid },
          _elementWebId: siteEl.WebId,
          _isTag: false
        };
        this._attributes[attrWid] = attr;
        siteEl._attributes.push(attr);
      });
    }

    _createUnitAttributes(unitEl, unit, site) {
      const rng = seededRandom(hashStr(unitEl.Path));
      const vals = {
        'שם יחידה': unit.name,
        'הספק מותקן': unit.capacity,
        'סוג טורבינה': unit.turbineType,
        'סוג דלק': unit.fuelType,
        'מצב יחידה': 1, // עובד
        'שעות פעילות מצטברות': Math.floor(30000 + rng() * 70000),
        'תאריך תחזוקה אחרונה': new Date(NOW - Math.floor(rng() * 180 * DAY)).toISOString(),
        'סוג תחזוקה אחרונה': Math.floor(rng() * 5),
        'יעילות תרמית': +(35 + rng() * 15).toFixed(1),
        'זמינות שנתית': +(88 + rng() * 10).toFixed(1),
        'גורם ניצולת': +(50 + rng() * 40).toFixed(1),
        'מספר סידורי': 'SN-' + site.nameEn.substring(0,3).toUpperCase() + '-' + String(Math.floor(1000 + rng()*9000)),
        'יצרן': unit.turbineType.split(' ')[0]
      };

      UNIT_ATTRIBUTES.forEach(attrDef => {
        const attrPath = unitEl.Path + '|' + attrDef.name;
        const attrWid = webId('A', attrPath);
        const attr = {
          WebId: attrWid,
          Name: attrDef.name,
          Description: attrDef.name + ' של ' + unit.name,
          Type: attrDef.type,
          TypeQualifier: attrDef.enumSet || '',
          DefaultUnitsOfMeasure: attrDef.uom || '',
          CategoryNames: [attrDef.category],
          Value: { Value: vals[attrDef.name], Timestamp: new Date().toISOString(), Good: true },
          Path: attrPath,
          HasChildren: false,
          IsConfigurationItem: attrDef.type !== 'Double',
          Links: { Self: '/attributes/' + attrWid },
          _elementWebId: unitEl.WebId,
          _isTag: attrDef.type === 'Double' && attrDef.uom
        };
        this._attributes[attrWid] = attr;
        unitEl._attributes.push(attr);

        // If it's a numeric attribute, also register as tag
        if (attr._isTag) {
          const tagName = site.name + '.' + unit.name + '.' + attrDef.name;
          attr._tagName = tagName;
          attr._profile = { uom: attrDef.uom, min: 0, max: unit.capacity * 2, typical: vals[attrDef.name], noise: vals[attrDef.name] * 0.02, type: 'Double' };
          this._tags[attrWid] = attr;
          this._tagsByName[tagName] = attr;
        }
      });
    }

    _createEquipmentAttributes(equipEl, equip, site) {
      const rng = seededRandom(hashStr(equipEl.Path));
      const manufacturers = ['Siemens', 'ABB', 'GE', 'Emerson', 'Honeywell', 'Yokogawa', 'Endress+Hauser', 'Schneider'];
      const vals = {
        'שם ציוד': equip.name,
        'יצרן': manufacturers[Math.floor(rng() * manufacturers.length)],
        'מספר סידורי': 'EQ-' + String(Math.floor(10000 + rng()*90000)),
        'שנת התקנה': 2000 + Math.floor(rng() * 24),
        'סטטוס': 1,
        'שעות פעילות': Math.floor(5000 + rng() * 50000),
        'תאריך כיול אחרון': new Date(NOW - Math.floor(rng() * 365 * DAY)).toISOString(),
        'מרווח כיול': [90, 180, 365][Math.floor(rng() * 3)],
        'הערות': ''
      };

      EQUIPMENT_ATTRIBUTES.forEach(attrDef => {
        const attrPath = equipEl.Path + '|' + attrDef.name;
        const attrWid = webId('A', attrPath);
        const attr = {
          WebId: attrWid,
          Name: attrDef.name,
          Description: attrDef.name,
          Type: attrDef.type,
          TypeQualifier: attrDef.enumSet || '',
          DefaultUnitsOfMeasure: attrDef.uom || '',
          CategoryNames: [attrDef.category],
          Value: { Value: vals[attrDef.name], Timestamp: new Date().toISOString(), Good: true },
          Path: attrPath,
          HasChildren: false,
          IsConfigurationItem: true,
          Links: { Self: '/attributes/' + attrWid },
          _elementWebId: equipEl.WebId,
          _isTag: false
        };
        this._attributes[attrWid] = attr;
        equipEl._attributes.push(attr);
      });
    }

    _createInstrumentTag(equipEl, instrName, site, unit, areaName, equipName) {
      // Find matching profile
      let profile = INSTRUMENT_PROFILES[instrName];
      if (!profile) {
        // Try partial match
        for (const key of Object.keys(INSTRUMENT_PROFILES)) {
          if (instrName.includes(key) || key.includes(instrName)) {
            profile = INSTRUMENT_PROFILES[key];
            break;
          }
        }
      }
      if (!profile) {
        profile = { uom: '', min: 0, max: 100, typical: 50, noise: 5, type: 'Double' };
      }

      const tagName = site.name + '.' + unit.name + '.' + areaName + '.' + equipName + '.' + instrName;
      const attrPath = equipEl.Path + '|' + instrName;
      const attrWid = webId('T', attrPath);

      // Scale profile based on unit capacity
      const scaleFactor = unit.capacity / 400; // normalized
      const scaledTypical = profile.type === 'Digital' ? 0 : profile.typical * (profile.uom === 'MW' ? scaleFactor : 1);

      const rng = seededRandom(hashStr(tagName));
      const currentValue = profile.type === 'Digital' 
        ? (rng() > 0.1 ? profile.values[0] : profile.values[1])
        : +(scaledTypical + (rng() - 0.5) * profile.noise * 2).toFixed(2);

      const attr = {
        WebId: attrWid,
        Name: instrName,
        Description: instrName + ' — ' + equipName + ', ' + areaName + ', ' + unit.name + ', ' + site.name,
        Type: profile.type === 'Digital' ? 'String' : 'Double',
        TypeQualifier: '',
        DefaultUnitsOfMeasure: profile.uom,
        CategoryNames: ['מדידה'],
        Value: { 
          Value: currentValue, 
          Timestamp: new Date().toISOString(), 
          Good: rng() > 0.02,
          UnitsAbbreviation: profile.uom
        },
        Path: attrPath,
        HasChildren: false,
        IsConfigurationItem: false,
        Links: { Self: '/attributes/' + attrWid, RecordedData: '/streams/' + attrWid + '/recorded' },
        _elementWebId: equipEl.WebId,
        _isTag: true,
        _tagName: tagName,
        _profile: profile,
        _scaledTypical: scaledTypical,
        _site: site.name,
        _unit: unit.name,
        _area: areaName,
        _equipment: equipName
      };

      this._attributes[attrWid] = attr;
      equipEl._attributes.push(attr);
      this._tags[attrWid] = attr;
      this._tagsByName[tagName] = attr;
    }

    // ─── Event Frames ──────────────────────────────────────────

    _buildEventFrames() {
      const rng = seededRandom(42);
      const efTemplates = ['השבתה מתוכננת', 'תקלה', 'תחזוקה שוטפת', 'חריגה סביבתית', 'עומס יתר', 'בדיקה תקופתית'];
      const severities = ['מידע', 'אזהרה', 'קריטי'];

      SITES.forEach(site => {
        site.units.forEach(unit => {
          // Generate 20-40 event frames per unit over 3 years
          const count = 20 + Math.floor(rng() * 20);
          for (let i = 0; i < count; i++) {
            const startOffset = Math.floor(rng() * 3 * YEAR);
            const duration = Math.floor(rng() * 72 * HOUR) + HOUR; // 1-72 hours
            const startTime = new Date(THREE_YEARS_AGO + startOffset);
            const endTime = new Date(startTime.getTime() + duration);
            const template = efTemplates[Math.floor(rng() * efTemplates.length)];
            const severity = severities[Math.floor(rng() * severities.length)];

            this._eventFrames.push({
              WebId: 'WEF' + Math.abs(hashStr(site.name + unit.name + i)).toString(36).toUpperCase().padStart(12,'0'),
              Name: template + ' — ' + unit.name,
              Description: template + ' ב' + unit.name + ', ' + site.name,
              TemplateName: template,
              StartTime: startTime.toISOString(),
              EndTime: endTime.toISOString(),
              Severity: severity,
              AcknowledgedBy: rng() > 0.3 ? 'מנהל משמרת' : '',
              IsAcknowledged: rng() > 0.3,
              ReferencedElements: [
                { WebId: webId('E', '\\\\PIServer-IEC\\IEC-PowerGrid\\' + site.name + '\\' + unit.name), Name: unit.name }
              ],
              _site: site.name,
              _unit: unit.name
            });
          }
        });
      });

      // Sort by start time descending
      this._eventFrames.sort((a, b) => new Date(b.StartTime) - new Date(a.StartTime));
    }

    // ═══════════════════════════════════════════════════════════════
    //  PUBLIC API — PI Web API Compatible
    // ═══════════════════════════════════════════════════════════════

    // ─── Element Browsing ──────────────────────────────────────

    /** Get root AF elements (sites) */
    getRootElements() {
      return {
        Items: this._rootElements.map(e => this._sanitizeElement(e))
      };
    }

    /** Get child elements of a parent */
    getChildElements(parentWebId) {
      const parent = this._elements[parentWebId];
      if (!parent) return { Items: [] };
      return {
        Items: (parent._children || []).map(e => this._sanitizeElement(e))
      };
    }

    /** Get element by WebId */
    getElement(wid) {
      const el = this._elements[wid];
      return el ? this._sanitizeElement(el) : null;
    }

    /** Get element by path */
    getElementByPath(path) {
      for (const wid of Object.keys(this._elements)) {
        if (this._elements[wid].Path === path) return this._sanitizeElement(this._elements[wid]);
      }
      return null;
    }

    /** Search elements by name */
    searchElements(query, maxResults = 50) {
      const q = (query || '').toLowerCase();
      const results = [];
      for (const wid of Object.keys(this._elements)) {
        const el = this._elements[wid];
        if (el.Name.toLowerCase().includes(q) || el.Description.toLowerCase().includes(q) || el.Path.toLowerCase().includes(q)) {
          results.push(this._sanitizeElement(el));
          if (results.length >= maxResults) break;
        }
      }
      return { Items: results, TotalCount: results.length };
    }

    // ─── Attribute Browsing ────────────────────────────────────

    /** Get attributes of an element */
    getAttributes(elementWebId, category) {
      const el = this._elements[elementWebId];
      if (!el) return { Items: [] };
      let attrs = el._attributes || [];
      if (category) {
        attrs = attrs.filter(a => a.CategoryNames.includes(category));
      }
      return {
        Items: attrs.map(a => this._sanitizeAttribute(a))
      };
    }

    /** Get single attribute */
    getAttribute(attrWebId) {
      const attr = this._attributes[attrWebId];
      return attr ? this._sanitizeAttribute(attr) : null;
    }

    /** Get current value of an attribute */
    getAttributeValue(attrWebId) {
      const attr = this._attributes[attrWebId];
      if (!attr) return null;

      // For tags, generate fresh current value
      if (attr._isTag && attr._profile && attr._profile.type !== 'Digital') {
        const p = attr._profile;
        const t = attr._scaledTypical || p.typical;
        const v = t + (Math.random() - 0.5) * p.noise * 2;
        return {
          Value: +v.toFixed(3),
          Timestamp: new Date().toISOString(),
          Good: Math.random() > 0.01,
          UnitsAbbreviation: p.uom
        };
      }
      return attr.Value;
    }

    // ─── Tag Search ────────────────────────────────────────────

    /** Search PI tags by name/description */
    searchTags(query, maxResults = 100) {
      const q = (query || '').toLowerCase();
      const results = [];
      for (const wid of Object.keys(this._tags)) {
        const tag = this._tags[wid];
        const name = (tag._tagName || '').toLowerCase();
        const desc = (tag.Description || '').toLowerCase();
        if (name.includes(q) || desc.includes(q) || tag.Name.toLowerCase().includes(q)) {
          results.push({
            WebId: tag.WebId,
            Name: tag._tagName,
            Description: tag.Description,
            PointType: tag._profile.type === 'Digital' ? 'Digital' : 'Float64',
            EngineeringUnits: tag._profile.uom,
            Path: tag.Path,
            _site: tag._site,
            _unit: tag._unit,
            _area: tag._area,
            _equipment: tag._equipment
          });
          if (results.length >= maxResults) break;
        }
      }
      return { Items: results, TotalCount: results.length };
    }

    /** Get all tags grouped by category */
    getTagCategories() {
      const cats = {};
      for (const wid of Object.keys(this._tags)) {
        const tag = this._tags[wid];
        const cat = this._guessCategory(tag);
        if (!cats[cat]) cats[cat] = [];
        cats[cat].push({
          WebId: tag.WebId,
          Name: tag._tagName || tag.Name,
          Description: tag.Description,
          UOM: tag._profile.uom
        });
      }
      return cats;
    }

    _guessCategory(tag) {
      const name = (tag.Name || '').toLowerCase();
      if (name.includes('טמפ') || name.includes('temp')) return 'טמפרטורה';
      if (name.includes('לחץ') || name.includes('press') || name.includes('ואקום')) return 'לחץ';
      if (name.includes('ספיקה') || name.includes('זרימה') || name.includes('flow')) return 'זרימה';
      if (name.includes('מתח') || name.includes('זרם') || name.includes('הספק') || name.includes('קוספי') || name.includes('תדר')) return 'חשמל';
      if (name.includes('מהירות') || name.includes('סיבוב') || name.includes('rpm')) return 'מהירות';
      if (name.includes('רטט') || name.includes('vib')) return 'רטט';
      if (name.includes('מפלס') || name.includes('level')) return 'מפלס';
      if (name.includes('nox') || name.includes('so2') || name.includes('co') || name.includes('pm') || name.includes('חלקיקים') || name.includes('db') || name.includes('ph') || name.includes('bod') || name.includes('tss') || name.includes('o3')) return 'סביבה';
      if (name.includes('סטטוס') || name.includes('status')) return 'סטטוס';
      return 'כללי';
    }

    // ─── Historical Data ───────────────────────────────────────

    /**
     * Generate recorded (actual) values for a tag over a time range
     * @param {string} tagWebId 
     * @param {string|Date|number} startTime 
     * @param {string|Date|number} endTime 
     * @param {number} maxCount - max data points
     * @returns {object} PI Web API style response
     */
    getRecordedValues(tagWebId, startTime, endTime, maxCount = 1000) {
      const tag = this._tags[tagWebId];
      if (!tag || !tag._profile) return { Items: [] };

      const start = this._parseTime(startTime || THREE_YEARS_AGO);
      const end = this._parseTime(endTime || NOW);
      const range = end - start;
      const profile = tag._profile;

      if (profile.type === 'Digital') {
        return this._generateDigitalValues(tag, start, end, maxCount);
      }

      const typical = tag._scaledTypical || profile.typical;
      const rng = seededRandom(hashStr(tag._tagName || tag.WebId));

      // Determine interval based on range and maxCount
      const interval = Math.max(range / maxCount, 60000); // min 1 minute
      const items = [];
      let prevVal = typical;

      for (let t = start; t <= end && items.length < maxCount; t += interval) {
        // Generate realistic data with:
        // 1. Daily cycle (sinusoidal)
        // 2. Random walk
        // 3. Occasional spikes
        // 4. Seasonal variation

        const dayFrac = (t % DAY) / DAY;
        const yearFrac = ((t - THREE_YEARS_AGO) % YEAR) / YEAR;

        // Daily cycle (peak at noon, trough at night)
        const dailyCycle = Math.sin(dayFrac * Math.PI * 2 - Math.PI / 2) * profile.noise * 0.5;

        // Seasonal variation (warmer in summer)
        const seasonal = Math.sin(yearFrac * Math.PI * 2) * profile.noise * 0.3;

        // Random walk
        const randomWalk = (rng() - 0.5) * profile.noise * 0.4;

        // Occasional spike (2% chance)
        const spike = rng() < 0.02 ? (rng() - 0.5) * profile.noise * 5 : 0;

        let value = typical + dailyCycle + seasonal + randomWalk + spike;

        // Smooth with previous value
        value = prevVal * 0.7 + value * 0.3;

        // Clamp to range
        value = Math.max(profile.min, Math.min(profile.max, value));
        prevVal = value;

        // Occasional bad quality (0.5%)
        const good = rng() > 0.005;

        items.push({
          Timestamp: new Date(t).toISOString(),
          Value: +value.toFixed(3),
          Good: good,
          UnitsAbbreviation: profile.uom,
          Questionable: !good
        });
      }

      return { Items: items };
    }

    _generateDigitalValues(tag, start, end, maxCount) {
      const rng = seededRandom(hashStr(tag._tagName || tag.WebId));
      const items = [];
      const values = tag._profile.values || ['פעיל', 'כבוי'];
      let currentState = 0;
      let t = start;

      while (t <= end && items.length < maxCount) {
        items.push({
          Timestamp: new Date(t).toISOString(),
          Value: values[currentState],
          Good: true
        });

        // State changes are less frequent — 12h to 72h intervals
        const stateHoldTime = (12 + rng() * 60) * HOUR;
        t += stateHoldTime;

        // Toggle state with 20% probability
        if (rng() < 0.2) {
          currentState = (currentState + 1) % values.length;
        }
      }

      return { Items: items };
    }

    /**
     * Generate interpolated values at regular intervals
     */
    getInterpolatedValues(tagWebId, startTime, endTime, interval) {
      const tag = this._tags[tagWebId];
      if (!tag || !tag._profile) return { Items: [] };

      const start = this._parseTime(startTime || THREE_YEARS_AGO);
      const end = this._parseTime(endTime || NOW);
      const profile = tag._profile;
      const typical = tag._scaledTypical || profile.typical;
      const intervalMs = this._parseInterval(interval || '1h');
      const rng = seededRandom(hashStr((tag._tagName || '') + 'interp'));

      const items = [];
      let prevVal = typical;

      for (let t = start; t <= end; t += intervalMs) {
        const dayFrac = (t % DAY) / DAY;
        const yearFrac = ((t - THREE_YEARS_AGO) % YEAR) / YEAR;
        const dailyCycle = Math.sin(dayFrac * Math.PI * 2 - Math.PI / 2) * profile.noise * 0.5;
        const seasonal = Math.sin(yearFrac * Math.PI * 2) * profile.noise * 0.3;
        const noise = (rng() - 0.5) * profile.noise * 0.3;
        let value = typical + dailyCycle + seasonal + noise;
        value = prevVal * 0.8 + value * 0.2;
        value = Math.max(profile.min, Math.min(profile.max, value));
        prevVal = value;

        items.push({
          Timestamp: new Date(t).toISOString(),
          Value: +value.toFixed(3),
          Good: true,
          UnitsAbbreviation: profile.uom
        });
      }

      return { Items: items };
    }

    /**
     * Get summary statistics over time range
     */
    getSummaryValues(tagWebId, startTime, endTime, summaryType) {
      const recorded = this.getRecordedValues(tagWebId, startTime, endTime, 5000);
      if (!recorded.Items.length) return { Items: [] };

      const values = recorded.Items.filter(i => i.Good).map(i => i.Value);
      if (!values.length) return { Items: [] };

      const min = Math.min(...values);
      const max = Math.max(...values);
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      const stddev = Math.sqrt(values.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / values.length);

      return {
        Items: [{
          Type: summaryType || 'Total',
          Value: {
            Minimum: { Value: +min.toFixed(3), Timestamp: recorded.Items[0].Timestamp },
            Maximum: { Value: +max.toFixed(3), Timestamp: recorded.Items[0].Timestamp },
            Average: { Value: +avg.toFixed(3) },
            StdDev: { Value: +stddev.toFixed(3) },
            Total: { Value: +sum.toFixed(3) },
            Count: { Value: values.length },
            Range: { Value: +(max - min).toFixed(3) }
          }
        }]
      };
    }

    // ─── Event Frames ──────────────────────────────────────────

    /** Get event frames, optionally filtered */
    getEventFrames(opts = {}) {
      let frames = this._eventFrames;

      if (opts.site) {
        frames = frames.filter(f => f._site === opts.site);
      }
      if (opts.unit) {
        frames = frames.filter(f => f._unit === opts.unit);
      }
      if (opts.template) {
        frames = frames.filter(f => f.TemplateName === opts.template);
      }
      if (opts.severity) {
        frames = frames.filter(f => f.Severity === opts.severity);
      }
      if (opts.startTime) {
        const st = this._parseTime(opts.startTime);
        frames = frames.filter(f => new Date(f.StartTime).getTime() >= st);
      }
      if (opts.endTime) {
        const et = this._parseTime(opts.endTime);
        frames = frames.filter(f => new Date(f.StartTime).getTime() <= et);
      }

      const maxCount = opts.maxCount || 100;
      return {
        Items: frames.slice(0, maxCount),
        TotalCount: frames.length
      };
    }

    // ─── Enum Sets ─────────────────────────────────────────────

    getEnumSets() {
      return ENUM_SETS;
    }

    getEnumSet(name) {
      return ENUM_SETS[name] || null;
    }

    // ─── Statistics ────────────────────────────────────────────

    getStats() {
      return {
        totalElements: Object.keys(this._elements).length,
        totalAttributes: Object.keys(this._attributes).length,
        totalTags: Object.keys(this._tags).length,
        totalEventFrames: this._eventFrames.length,
        sites: this._rootElements.map(s => s.Name),
        enumSets: Object.keys(ENUM_SETS)
      };
    }

    // ─── Helpers ───────────────────────────────────────────────

    _sanitizeElement(el) {
      // Return public-facing element without internal fields
      return {
        WebId: el.WebId,
        Name: el.Name,
        Description: el.Description,
        Path: el.Path,
        TemplateName: el.TemplateName,
        HasChildren: el.HasChildren || (el._children && el._children.length > 0),
        CategoryNames: el.CategoryNames,
        Links: el.Links,
        ChildCount: (el._children || []).length,
        AttributeCount: (el._attributes || []).length
      };
    }

    _sanitizeAttribute(attr) {
      return {
        WebId: attr.WebId,
        Name: attr.Name,
        Description: attr.Description,
        Type: attr.Type,
        TypeQualifier: attr.TypeQualifier,
        DefaultUnitsOfMeasure: attr.DefaultUnitsOfMeasure,
        CategoryNames: attr.CategoryNames,
        Value: attr.Value,
        Path: attr.Path,
        HasChildren: attr.HasChildren,
        IsConfigurationItem: attr.IsConfigurationItem,
        IsTag: attr._isTag || false,
        TagName: attr._tagName || null,
        Links: attr.Links
      };
    }

    _parseTime(t) {
      if (typeof t === 'number') return t;
      if (t instanceof Date) return t.getTime();
      // Handle relative times like '*-3d', '*-1y', 'y', 't'
      const s = String(t).toLowerCase().trim();
      if (s === '*' || s === 'now') return NOW;
      if (s === 't' || s === 'today') return NOW - (NOW % DAY);
      if (s === 'y' || s === 'yesterday') return NOW - (NOW % DAY) - DAY;
      
      const relMatch = s.match(/^\*\s*-\s*(\d+)(m|h|d|w|mo|y)$/);
      if (relMatch) {
        const n = parseInt(relMatch[1]);
        const unit = relMatch[2];
        const multipliers = { m: 60000, h: HOUR, d: DAY, w: 7*DAY, mo: 30*DAY, y: YEAR };
        return NOW - n * (multipliers[unit] || DAY);
      }

      return new Date(t).getTime() || NOW;
    }

    _parseInterval(interval) {
      const s = String(interval).toLowerCase().trim();
      const m = s.match(/^(\d+)\s*(s|m|min|h|d)$/);
      if (m) {
        const n = parseInt(m[1]);
        const u = m[2];
        const mult = { s: 1000, m: 60000, min: 60000, h: HOUR, d: DAY };
        return n * (mult[u] || HOUR);
      }
      return HOUR; // default 1h
    }

    // ═══════════════════════════════════════════════════════════════
    //  MOCK PI WEB API — Express-style request handler
    // ═══════════════════════════════════════════════════════════════

    /**
     * Handle a mock PI Web API request
     * @param {string} path - API path (e.g., '/elements/WE123/attributes')
     * @param {object} params - query parameters
     * @returns {object} response data
     */
    handleRequest(path, params = {}) {
      const p = path.replace(/^\/+/, '').split('/');

      // GET /elements — root
      if (p[0] === 'elements' && p.length === 1) {
        return this.getRootElements();
      }

      // GET /elements/{webId}
      if (p[0] === 'elements' && p.length === 2) {
        return this.getElement(p[1]) || { error: 'Element not found' };
      }

      // GET /elements/{webId}/elements — children
      if (p[0] === 'elements' && p.length === 3 && p[2] === 'elements') {
        return this.getChildElements(p[1]);
      }

      // GET /elements/{webId}/attributes
      if (p[0] === 'elements' && p.length === 3 && p[2] === 'attributes') {
        return this.getAttributes(p[1], params.categoryName);
      }

      // GET /attributes/{webId}
      if (p[0] === 'attributes' && p.length === 2) {
        return this.getAttribute(p[1]) || { error: 'Attribute not found' };
      }

      // GET /attributes/{webId}/value
      if (p[0] === 'attributes' && p.length === 3 && p[2] === 'value') {
        return this.getAttributeValue(p[1]) || { error: 'Attribute not found' };
      }

      // GET /streams/{webId}/recorded
      if (p[0] === 'streams' && p.length === 3 && p[2] === 'recorded') {
        return this.getRecordedValues(p[1], params.startTime, params.endTime, params.maxCount);
      }

      // GET /streams/{webId}/interpolated
      if (p[0] === 'streams' && p.length === 3 && p[2] === 'interpolated') {
        return this.getInterpolatedValues(p[1], params.startTime, params.endTime, params.interval);
      }

      // GET /streams/{webId}/summary
      if (p[0] === 'streams' && p.length === 3 && p[2] === 'summary') {
        return this.getSummaryValues(p[1], params.startTime, params.endTime, params.summaryType);
      }

      // GET /search/tags
      if (p[0] === 'search' && p[1] === 'tags') {
        return this.searchTags(params.q || params.query, params.maxCount);
      }

      // GET /search/elements
      if (p[0] === 'search' && p[1] === 'elements') {
        return this.searchElements(params.q || params.query, params.maxCount);
      }

      // GET /eventframes
      if (p[0] === 'eventframes') {
        return this.getEventFrames(params);
      }

      // GET /enumsets
      if (p[0] === 'enumsets' && p.length === 1) {
        return this.getEnumSets();
      }
      if (p[0] === 'enumsets' && p.length === 2) {
        return this.getEnumSet(p[1]) || { error: 'EnumSet not found' };
      }

      // GET /stats
      if (p[0] === 'stats') {
        return this.getStats();
      }

      return { error: 'Unknown endpoint: ' + path };
    }
  }

  return AFDataLayer;

})();

// Export for browser globals and Node.js
if (typeof window !== 'undefined') {
  window.AFDataLayer = AFDataLayer;
}
if (typeof globalThis !== 'undefined') {
  globalThis.AFDataLayer = AFDataLayer;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AFDataLayer;
}
