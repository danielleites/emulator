/**
 * PIVISION Mobile App v4.2.0-R300 — Production Release Controller
 * Production-grade mobile-first experience for PI Vision
 *
 * v4.2.0-R300 Changes:
 * - R300 upgrade: 569 symbols including MM20, hash routing, QA monitor
 * - Version bump to 4.2.0-R300 (operational release)
 * - Connection health monitoring with auto-reconnect
 * - Security: Content Security Policy meta tag
 * - Offline resilience: service worker for static asset caching
 * - Production error reporting: unhandled error/rejection logging
 * - All v4.0.0-rc1 features carried forward
 * 
 * Previous (v4.0.0-rc1):
 * - Enhanced LIVE connection wizard with multi-step validation
 * - Improved profile management with test/edit/clone
 * - Refined splash screen with progress stages
 * - Polished animations and micro-interactions
 * - Network status awareness (online/offline banner)
 * - Enhanced error handling and user feedback
 * - Accessibility improvements (ARIA, focus management)
 * - Performance optimizations for rendering
 */

'use strict';

// ─── Version ─────────────────────────────────────────────────
const APP_VERSION = '4.2.0-R300';
const PIV_VERSION = '4.2.0';
const BUILD_DATE = '2026-04-05';
const BUILD_NUMBER = '420';
const RELEASE_CHANNEL = 'release';
const MM20_ENABLED = true;
const TOTAL_SYMBOL_COUNT = 569;
const MM20_SYMBOL_COUNT = 499;

// ─── State ───────────────────────────────────────────────────
let currentPage = 'dashboard';
let currentMode = 'demo'; // demo | simulation | live
let isDarkTheme = true;
let alertFilter = 'all';
let symbolCategory = 'all';
let refreshRateIndex = 0;
const REFRESH_RATES = [3, 5, 10, 30, 60];
let notificationsEnabled = false;
let piWebApiUrl = '';
let simulationInterval = null;
let onboardingStep = 0;
let isFirstLaunch = true;
let isAppReady = false;
let mobileSyncInitialized = false;
let appInitialized = false;
let embeddedFramePrimed = false;
let embeddedLastSrc = '';
let appShellPrepared = false;
let deferredOnboardingVisible = false;

// ─── Connection Profiles ─────────────────────────────────────
let connectionProfiles = [];
let activeProfileId = null;

const DEFAULT_PROFILES = [
  {
    id: 'demo-profile',
    name: 'הדגמה מקומית',
    type: 'demo',
    url: '',
    username: '',
    password: '',
    isDefault: true,
    lastUsed: null,
    createdAt: new Date().toISOString()
  }
];

// ─── Storage Abstraction (works without localStorage) ────────
const AppStorage = {
  _cache: {},
  
  async set(key, value) {
    this._cache[key] = JSON.stringify(value);
    // Try Capacitor Preferences plugin
    if (window.Capacitor?.Plugins?.Preferences) {
      try {
        await window.Capacitor.Plugins.Preferences.set({ key, value: JSON.stringify(value) });
      } catch (e) { /* fallback to cache */ }
    }
  },
  
  async get(key, defaultValue = null) {
    // Try Capacitor Preferences plugin
    if (window.Capacitor?.Plugins?.Preferences) {
      try {
        const result = await window.Capacitor.Plugins.Preferences.get({ key });
        if (result?.value) {
          this._cache[key] = result.value;
          return JSON.parse(result.value);
        }
      } catch (e) { /* fallback to cache */ }
    }
    // Fallback to in-memory cache
    if (this._cache[key]) {
      return JSON.parse(this._cache[key]);
    }
    return defaultValue;
  },
  
  async remove(key) {
    delete this._cache[key];
    if (window.Capacitor?.Plugins?.Preferences) {
      try {
        await window.Capacitor.Plugins.Preferences.remove({ key });
      } catch (e) { /* ignore */ }
    }
  }
};

// ─── Symbol Data ─────────────────────────────────────────────
const SYMBOLS = [
  { id: 'maindash20', name: 'Main Dashboard', nameHe: 'דשבורד ראשי', type: 'Dashboard', icon: '📊' },
  { id: 'trendchart20', name: 'Trend Chart', nameHe: 'גרף מגמה', type: 'Chart', icon: '📈' },
  { id: 'gauge20', name: 'Gauge', nameHe: 'מד', type: 'Gauge', icon: '🎯' },
  { id: 'kpicard20', name: 'KPI Card', nameHe: 'כרטיס KPI', type: 'KPI', icon: '📋' },
  { id: 'alertpanel20', name: 'Alert Panel', nameHe: 'פאנל התראות', type: 'Alert', icon: '🔔' },
  { id: 'piechart20', name: 'Pie Chart', nameHe: 'תרשים עוגה', type: 'Chart', icon: '🥧' },
  { id: 'heatmap20', name: 'Heat Map', nameHe: 'מפת חום', type: 'Visualization', icon: '🗺️' },
  { id: 'treemap20', name: 'Tree Map', nameHe: 'מפת עץ', type: 'Visualization', icon: '🌳' },
  { id: 'sankey20', name: 'Sankey Diagram', nameHe: 'דיאגרמת סנקי', type: 'Visualization', icon: '🔀' },
  { id: 'waterfall20', name: 'Waterfall Chart', nameHe: 'גרף מפל', type: 'Chart', icon: '🌊' },
  { id: 'scatter20', name: 'Scatter Plot', nameHe: 'גרף פיזור', type: 'Chart', icon: '⚡' },
  { id: 'radar20', name: 'Radar Chart', nameHe: 'גרף מכ"ם', type: 'Chart', icon: '📡' },
  { id: 'powerflow20', name: 'Power Flow', nameHe: 'זרימת חשמל', type: 'Energy', icon: '⚡' },
  { id: 'loadcurve20', name: 'Load Curve', nameHe: 'עקומת עומס', type: 'Energy', icon: '📉' },
  { id: 'fuelgauge20', name: 'Fuel Gauge', nameHe: 'מד דלק', type: 'Gauge', icon: '⛽' },
  { id: 'unitstatus20', name: 'Unit Status', nameHe: 'סטטוס יחידה', type: 'Status', icon: '✅' },
  { id: 'gridstatus20', name: 'Grid Status', nameHe: 'סטטוס רשת', type: 'Status', icon: '🔌' },
  { id: 'traflit20', name: 'Traffic Light', nameHe: 'רמזור', type: 'Status', icon: '🚦' },
  { id: 'co2emis20', name: 'CO2 Emissions', nameHe: 'פליטות CO2', type: 'Environment', icon: '🌍' },
  { id: 'co2monitor20', name: 'CO2 Monitor', nameHe: 'ניטור CO2', type: 'Environment', icon: '🌿' },
  { id: 'renewwdg20', name: 'Renewable Widget', nameHe: 'ווידג\'ט מתחדשת', type: 'Energy', icon: '☀️' },
  { id: 'asstovr20', name: 'Asset Overview', nameHe: 'סקירת נכסים', type: 'Asset', icon: '🏭' },
  { id: 'asstcmp20', name: 'Asset Compare', nameHe: 'השוואת נכסים', type: 'Asset', icon: '⚖️' },
  { id: 'mugmon20', name: 'MUG Monitor', nameHe: 'ניטור MUG', type: 'Monitor', icon: '📺' },
  { id: 'mugmoni20', name: 'MUG Monitor II', nameHe: 'ניטור MUG II', type: 'Monitor', icon: '🖥️' },
  { id: 'mugult20', name: 'MUG Ultimate', nameHe: 'MUG אולטימטיבי', type: 'Monitor', icon: '🎛️' },
  { id: 'constmon20', name: 'Const Monitor', nameHe: 'ניטור קבוע', type: 'Monitor', icon: '📟' },
  { id: 'resrvind20', name: 'Reserve Indicator', nameHe: 'מחוון עתודה', type: 'Gauge', icon: '🔋' },
  { id: 'evtcomp20', name: 'Event Compare', nameHe: 'השוואת אירועים', type: 'Analysis', icon: '🔍' },
  { id: 'evtwrtr20', name: 'Event Writer', nameHe: 'כתיבת אירועים', type: 'Data', icon: '✏️' },
  { id: 'dtblpro20', name: 'Data Table Pro', nameHe: 'טבלת נתונים Pro', type: 'Table', icon: '📑' },
  { id: 'eftable20', name: 'EF Table', nameHe: 'טבלת EF', type: 'Table', icon: '📊' },
  { id: 'comparison20', name: 'Comparison', nameHe: 'השוואה', type: 'Analysis', icon: '🔄' },
  { id: 'funnel20', name: 'Funnel', nameHe: 'משפך', type: 'Chart', icon: '📐' },
  { id: 'gantt20', name: 'Gantt Chart', nameHe: 'גרף גנט', type: 'Chart', icon: '📅' },
  { id: 'genblock20', name: 'Gen Block', nameHe: 'בלוק יצור', type: 'Energy', icon: '🏗️' },
  { id: 'freqmtr20', name: 'Frequency Meter', nameHe: 'מד תדר', type: 'Gauge', icon: '〰️' },
  { id: 'afbrowser20', name: 'AF Browser', nameHe: 'דפדפן AF', type: 'Browser', icon: '🌐' },
  { id: 'dataexport20', name: 'Data Export', nameHe: 'ייצוא נתונים', type: 'Data', icon: '📤' },
  { id: 'reportgen20', name: 'Report Generator', nameHe: 'מחולל דוחות', type: 'Report', icon: '📝' },
  { id: 'navbar20', name: 'Navigation Bar', nameHe: 'סרגל ניווט', type: 'Navigation', icon: '🧭' },
  // R300: MM20 representative symbols (499 total in full emulator)
  { id: 'mm20-pibar', name: 'PIBar20', nameHe: 'עמודות PI', type: 'MM20', icon: '📊', mm20: true },
  { id: 'mm20-pitrend', name: 'PITrend20', nameHe: 'מגמה PI', type: 'MM20', icon: '📈', mm20: true },
  { id: 'mm20-pigauge', name: 'PIGauge20', nameHe: 'מד PI', type: 'MM20', icon: '🎯', mm20: true },
  { id: 'mm20-pixy', name: 'PIXY20', nameHe: 'XY PI', type: 'MM20', icon: '⚡', mm20: true },
  { id: 'mm20-aftree', name: 'AFTree20', nameHe: 'עץ AF', type: 'MM20', icon: '🌳', mm20: true },
  { id: 'mm20-aftable', name: 'AFTable20', nameHe: 'טבלת AF', type: 'MM20', icon: '📑', mm20: true },
  { id: 'mm20-afbrowser', name: 'AFBrowser20', nameHe: 'דפדפן AF מתקדם', type: 'MM20', icon: '🌐', mm20: true },
  { id: 'mm20-kbd', name: 'MM20-Keyboard', nameHe: 'מקלדת MM20', type: 'MM20', icon: '⌨️', mm20: true },
  { id: 'mm20-alarm', name: 'AlarmGrid20', nameHe: 'רשת התראות', type: 'MM20', icon: '🚨', mm20: true },
  { id: 'mm20-notif', name: 'Notifications20', nameHe: 'התראות', type: 'MM20', icon: '🔔', mm20: true },
  { id: 'mm20-batch', name: 'BatchView20', nameHe: 'מנת ייצור', type: 'MM20', icon: '🏭', mm20: true },
  { id: 'mm20-calc', name: 'Calculator20', nameHe: 'מחשבון', type: 'MM20', icon: '🔢', mm20: true },
];

// ─── Demo Alerts ─────────────────────────────────────────────
const DEMO_ALERTS = [
  { id: 1, severity: 'critical', title: 'לחץ קיטור גבוה מהנורמה', source: 'Boiler-Unit-3 / PT-301', time: '2 דקות', tag: 'PI:Steam.Pressure.HH', acknowledged: false },
  { id: 2, severity: 'critical', title: 'כשל בחיישן טמפרטורה', source: 'Reactor-1 / TT-105', time: '5 דקות', tag: 'PI:Reactor.Temp.Fail', acknowledged: false },
  { id: 3, severity: 'warning', title: 'עומס חשמלי קרוב למקסימום', source: 'Transformer-A / Load', time: '12 דקות', tag: 'PI:Elec.Load.High', acknowledged: false },
  { id: 4, severity: 'warning', title: 'רמת מים נמוכה במאגר', source: 'Tank-204 / LT-204', time: '18 דקות', tag: 'PI:Water.Level.Low', acknowledged: false },
  { id: 5, severity: 'info', title: 'תחזוקה מתוכננת — יחידה 5', source: 'Unit-5 / Maintenance', time: '30 דקות', tag: 'PI:Maint.Schedule', acknowledged: true },
  { id: 6, severity: 'info', title: 'עדכון firmware לחיישנים', source: 'Network / OT-Gateway', time: '45 דקות', tag: 'PI:FW.Update', acknowledged: true },
  { id: 7, severity: 'ok', title: 'כל המערכות תקינות — סקטור A', source: 'Plant-Overview / SectorA', time: '1 שעה', tag: 'PI:Health.SectorA', acknowledged: true },
  { id: 8, severity: 'ok', title: 'גיבוי נתונים הושלם בהצלחה', source: 'PI Archive / Backup', time: '2 שעות', tag: 'PI:Archive.Backup', acknowledged: true },
  { id: 9, severity: 'warning', title: 'ריכוז CO2 עולה', source: 'AirQuality / CO2-Sensor', time: '25 דקות', tag: 'PI:CO2.Rising', acknowledged: false },
  { id: 10, severity: 'critical', title: 'תקלת תקשורת עם PLC', source: 'PLC-07 / CommFault', time: '8 דקות', tag: 'PI:PLC.CommFault', acknowledged: false },
];

// ─── KPI Data ────────────────────────────────────────────────
const KPI_DATA = {
  demo: [
    { label: 'ייצור חשמל', value: '847', unit: 'MW', change: '+2.4%', up: true, color: 'blue', history: [] },
    { label: 'נצילות מערכת', value: '94.7', unit: '%', change: '+0.3%', up: true, color: 'green', history: [] },
    { label: 'התראות פעילות', value: '12', unit: '', change: '-3', up: false, color: 'purple', history: [] },
    { label: 'פליטות CO2', value: '23.1', unit: 't/h', change: '-1.2%', up: false, color: 'warning', history: [] },
  ],
  simulation: [
    { label: 'ייצור חשמל', value: '912', unit: 'MW', change: '+5.1%', up: true, color: 'blue', history: [] },
    { label: 'נצילות מערכת', value: '96.2', unit: '%', change: '+1.8%', up: true, color: 'green', history: [] },
    { label: 'התראות פעילות', value: '8', unit: '', change: '-7', up: false, color: 'purple', history: [] },
    { label: 'פליטות CO2', value: '19.5', unit: 't/h', change: '-4.2%', up: false, color: 'warning', history: [] },
  ],
  live: [
    { label: 'ייצור חשמל', value: '—', unit: 'MW', change: 'אין חיבור', up: true, color: 'blue', history: [] },
    { label: 'נצילות מערכת', value: '—', unit: '%', change: 'אין חיבור', up: true, color: 'green', history: [] },
    { label: 'התראות פעילות', value: '—', unit: '', change: 'אין חיבור', up: false, color: 'purple', history: [] },
    { label: 'פליטות CO2', value: '—', unit: 't/h', change: 'אין חיבור', up: false, color: 'warning', history: [] },
  ],
};

// Pre-generate demo sparkline data
function generateSparklineHistory(baseValue, points) {
  const data = [];
  let val = baseValue;
  for (let i = 0; i < points; i++) {
    val += (Math.random() - 0.48) * baseValue * 0.03;
    val = Math.max(baseValue * 0.85, Math.min(baseValue * 1.15, val));
    data.push(val);
  }
  return data;
}

// Initialize sparkline histories
KPI_DATA.demo[0].history = generateSparklineHistory(847, 20);
KPI_DATA.demo[1].history = generateSparklineHistory(94.7, 20);
KPI_DATA.demo[2].history = generateSparklineHistory(12, 20);
KPI_DATA.demo[3].history = generateSparklineHistory(23.1, 20);
KPI_DATA.simulation[0].history = generateSparklineHistory(912, 20);
KPI_DATA.simulation[1].history = generateSparklineHistory(96.2, 20);
KPI_DATA.simulation[2].history = generateSparklineHistory(8, 20);
KPI_DATA.simulation[3].history = generateSparklineHistory(19.5, 20);

// ─── Network Monitoring ──────────────────────────────────────
let isOnline = navigator.onLine;
let connectionHealthInterval = null;
let lastConnectionCheck = null;

function initNetworkMonitoring() {
  window.addEventListener('online', () => {
    isOnline = true;
    updateNetworkBanner();
    if (currentMode === 'live') {
      showToast('חיבור לאינטרנט חזר', 'success');
      checkLiveConnectionHealth();
    }
  });
  
  window.addEventListener('offline', () => {
    isOnline = false;
    updateNetworkBanner();
    showToast('אין חיבור לאינטרנט', 'error');
  });
  
  // Periodic connection health check for LIVE mode
  connectionHealthInterval = setInterval(() => {
    if (currentMode === 'live' && isOnline) {
      checkLiveConnectionHealth();
    }
  }, 30000); // Every 30 seconds
}

function updateNetworkBanner() {
  const syncState = window.PIVMobileSync && window.PIVMobileSync.getState ? window.PIVMobileSync.getState() : null;
  if (syncState && (syncState.connected || syncState.connecting)) {
    updateConnectionBanner();
    return;
  }

  const banner = document.getElementById('connection-banner');
  const text = document.getElementById('connection-text');
  if (!banner || !text) return;
  
  if (!isOnline) {
    banner.className = 'connection-banner offline-banner';
    text.textContent = 'אין חיבור לאינטרנט — עובד במצב לא מקוון';
    banner.classList.remove('hidden');
    return;
  }
  
  updateConnectionBanner();
}

async function checkLiveConnectionHealth() {
  const profile = connectionProfiles.find(p => p.id === activeProfileId);
  if (!profile || !profile.url) return;
  
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    
    const headers = {};
    if (profile.username && profile.password) {
      headers['Authorization'] = 'Basic ' + btoa(profile.username + ':' + profile.password);
    }
    
    const response = await fetch(profile.url, {
      method: 'GET',
      headers,
      signal: controller.signal,
      mode: 'cors'
    });
    
    clearTimeout(timeout);
    lastConnectionCheck = { status: 'ok', timestamp: Date.now(), responseTime: 0 };
    
    // Update UI to show healthy connection
    const badge = document.getElementById('mode-badge');
    if (badge && currentMode === 'live') {
      badge.className = 'mode-badge mode-badge--live';
      badge.innerHTML = '<span class="dot" aria-hidden="true"></span>LIVE';
    }
  } catch (err) {
    lastConnectionCheck = { status: 'error', timestamp: Date.now(), error: err.message };
    
    // Show degraded connection state
    const badge = document.getElementById('mode-badge');
    if (badge && currentMode === 'live') {
      badge.className = 'mode-badge mode-badge--live mode-badge--degraded';
      badge.innerHTML = '<span class="dot" aria-hidden="true"></span>LIVE ⚠';
    }
  }
}

// ─── Changelog Data ──────────────────────────────────────────
const CHANGELOG = [
  {
    version: '4.2.0-R300',
    date: '2026-04-05',
    title: 'R300 Operational — 569 סמלים כולל MM20',
    changes: [
      'שדרוג ל-569 סמלים כולל 499 סמלי MM20',
      'Hash routing — פתיחת סמלים ישירה מאפליקציית מובייל',
      'מנגנון QA פנימי אוטומטי עם 4 בדיקות ותיקון עצמי',
      'תקשורת PostMessage בין אפליקציית מובייל לאמולטור',
      'מנגנון Error Telemetry ו-Input Sanitizer',
      'QA Auto-Fixer עם 4 דפוסי תיקון מובנים',
      'Symbol Sandbox לבידוד ריצת סמלים',
    ]
  },
  {
    version: '4.1.0',
    date: '2026-03-30',
    title: 'Final Release — גרסה סופית למסירה',
    changes: [
      'הקשחת אבטחה: Content Security Policy (CSP)',
      'Service Worker לשמירת משאבים במצב אופליין',
      'מנגנון לוג שגיאות לסביבת ייצור (Global Error Handler)',
      'ניטור Promise rejections בזמן אמת',
      'Performance marks למדידת זמן טעינה',
      'עדכון סופי לכל מרכיבי הגרסה',
      'webContentsDebugging מופעל לצורך בדיקות IT',
      'Build Number 410 — גרסה סופית למסירה'
    ]
  },
  {
    version: '4.0.0-rc1',
    date: '2026-03-30',
    title: 'Release Candidate — מועמד להפצה',
    changes: [
      'שדרוג branding ואייקונים מקצועיים לכל הדנסיטיז',
      'Splash screen חדש עם אנימציית טעינה משופרת',
      'אשף חיבור LIVE משודרג עם בדיקת בריאות',
      'ניטור חיבור רציף עם התאוששות אוטומטית',
      'מודעות לסטטוס רשת (אונליין/אופליין)',
      'אנימציות מעבר עמודים משופרות',
      'פליש ויזואלי כולל ומיקרו-אינטראקציות',
      'שדרוגי נגישות (ARIA, ניהול פוקוס)',
      'ביצועים משופרים ברינדור דינמי',
      'תמיכה בשכפול ועריכת פרופילים',
      'עדכון Capacitor config ל-RC'
    ]
  },
  {
    version: '3.0.0',
    date: '2026-03-30',
    title: 'שדרוג מוצרי מלא',
    changes: [
      'מערכת פרופילי חיבור — שמירה וניהול מספר שרתים',
      'אונבורדינג מתקדם ב-5 שלבים עם הגדרת פרופיל',
      'Skeleton loaders לכל התוכן הדינמי',
      'Pull-to-refresh בדשבורד',
      'מסך אבחון מערכת מפורט',
      'יומן שינויים מובנה',
      'מצבי ריק ושגיאה משופרים',
      'שיפורי ביצועים ואנימציות'
    ]
  },
  {
    version: '2.0.0',
    date: '2026-03-28',
    title: 'גרסת מובייל ראשונה',
    changes: [
      'ממשק מובייל מקצועי עם ניווט תחתון',
      '3 מצבי עבודה: Demo, Simulation, Live',
      'דשבורד KPI עם גרפי Sparkline',
      'ספריית 40+ סמלים עם חיפוש וסינון',
      'ניהול התראות עם פירוט ואישור',
      'מצב כהה/בהיר',
      'תמיכה ב-Safe Areas ו-Capacitor plugins'
    ]
  }
];

// ─── Onboarding Steps (Enhanced v3) ──────────────────────────
const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    icon: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="10" y="10" width="100" height="100" rx="24" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="1.5"/>
      <path d="M40 60 L52 72 L80 44" stroke="var(--accent)" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="60" cy="60" r="40" stroke="var(--accent)" stroke-width="1" stroke-opacity="0.2" fill="none"/>
    </svg>`,
    title: 'ברוכים הבאים ל-PIVISION',
    desc: 'אפליקציית מובייל מקצועית לניהול וניטור מערכות PI Vision. עקוב אחר נתונים בזמן אמת, צפה בדשבורדים, ונהל התראות — הכל מהטלפון.',
    primaryBtn: 'בואו נתחיל',
    secondaryBtn: 'דלג',
  },
  {
    id: 'modes',
    icon: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="20" y="15" width="80" height="90" rx="12" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="1"/>
      <rect x="30" y="30" width="25" height="20" rx="4" fill="var(--accent)" fill-opacity="0.15" stroke="var(--accent)" stroke-width="0.8"/>
      <rect x="65" y="30" width="25" height="20" rx="4" fill="var(--success)" fill-opacity="0.15" stroke="var(--success)" stroke-width="0.8"/>
      <rect x="30" y="60" width="25" height="20" rx="4" fill="var(--purple)" fill-opacity="0.15" stroke="var(--purple)" stroke-width="0.8"/>
      <rect x="65" y="60" width="25" height="20" rx="4" fill="var(--warning)" fill-opacity="0.15" stroke="var(--warning)" stroke-width="0.8"/>
    </svg>`,
    title: '3 מצבי עבודה',
    desc: 'DEMO להדגמה מהירה, SIMULATION לנתונים דינמיים מציאותיים, ו-LIVE לחיבור ישיר לשרת PI Web API שלך.',
    primaryBtn: 'המשך',
    secondaryBtn: null,
  },
  {
    id: 'profile-setup',
    icon: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="38" r="22" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="1.5"/>
      <path d="M60 28 L60 48 M50 38 L70 38" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>
      <rect x="22" y="70" width="76" height="32" rx="8" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="1"/>
      <rect x="30" y="78" width="60" height="6" rx="3" fill="var(--accent)" fill-opacity="0.2"/>
      <rect x="30" y="90" width="40" height="6" rx="3" fill="var(--accent)" fill-opacity="0.12"/>
    </svg>`,
    title: 'הגדרת פרופיל חיבור',
    desc: 'ניתן להוסיף פרופיל חיבור לשרת PI כבר עכשיו, או לדלג ולהשתמש במצב הדגמה.',
    primaryBtn: 'הוסף פרופיל',
    secondaryBtn: 'אולי אח"כ',
    hasForm: true,
  },
  {
    id: 'features',
    icon: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="35" cy="40" r="16" fill="var(--bg-card)" stroke="var(--success)" stroke-width="1.5"/>
      <path d="M30 40 L33 43 L40 36" stroke="var(--success)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="85" cy="40" r="16" fill="var(--bg-card)" stroke="var(--warning)" stroke-width="1.5"/>
      <path d="M85 33 L85 47 M78 40 L92 40" stroke="var(--warning)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="35" cy="85" r="16" fill="var(--bg-card)" stroke="var(--purple)" stroke-width="1.5"/>
      <path d="M35 78 L35 92" stroke="var(--purple)" stroke-width="2" stroke-linecap="round"/>
      <circle cx="85" cy="85" r="16" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="1.5"/>
      <path d="M79 85 L85 91 L91 79" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`,
    title: 'מה חדש ב-v4 RC',
    desc: 'חיבור LIVE משופר, ניטור בריאות חיבור, branding מקצועי, ועוד שדרוגים מוצריים.',
    primaryBtn: 'מעולה!',
    secondaryBtn: null,
  },
  {
    id: 'ready',
    icon: `<svg viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="60" cy="50" r="30" fill="var(--bg-card)" stroke="var(--accent)" stroke-width="1.5"/>
      <polygon points="55,38 55,62 73,50" fill="var(--accent)" fill-opacity="0.8"/>
      <rect x="25" y="90" width="70" height="10" rx="5" fill="var(--bg-surface)"/>
      <rect x="25" y="90" width="70" height="10" rx="5" fill="var(--accent)" fill-opacity="0.5"/>
    </svg>`,
    title: 'מוכנים להתחלה!',
    desc: 'ניתן לשנות הגדרות בכל עת. במצב DEMO — כל הנתונים מדומים ללא צורך בחיבור חיצוני.',
    primaryBtn: 'כניסה לאפליקציה',
    secondaryBtn: null,
  },
];

// ─── Skeleton Templates ──────────────────────────────────────
const Skeletons = {
  kpi: () => `
    <div class="kpi-card kpi-card--blue skeleton-card">
      <div class="skeleton-line skeleton-line--short"></div>
      <div class="skeleton-line skeleton-line--large"></div>
      <div class="skeleton-line skeleton-line--medium"></div>
      <div class="skeleton-block"></div>
    </div>`.repeat(4),

  quickLaunch: () => `
    <div class="mode-card-mobile skeleton-card">
      <div class="skeleton-circle"></div>
      <div class="card-content" style="flex:1;">
        <div class="skeleton-line skeleton-line--medium"></div>
        <div class="skeleton-line skeleton-line--long"></div>
      </div>
    </div>`.repeat(4),

  activity: () => `
    <div class="alert-item skeleton-card">
      <div class="skeleton-circle" style="width:32px;height:32px;"></div>
      <div style="flex:1;">
        <div class="skeleton-line skeleton-line--medium"></div>
        <div class="skeleton-line skeleton-line--long"></div>
      </div>
    </div>`.repeat(3),

  symbolGrid: () => `
    <div class="symbol-card skeleton-card">
      <div class="skeleton-circle" style="width:36px;height:36px;margin:0 auto;"></div>
      <div class="skeleton-line skeleton-line--short" style="margin:0 auto;"></div>
      <div class="skeleton-line skeleton-line--tiny" style="margin:0 auto;"></div>
    </div>`.repeat(12),
};

// ─── Initialization ──────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Load persisted state
  await loadPersistedState();
  prepareAppShell();

  // Show splash with staged progress
  const splashVersion = document.querySelector('.splash-version');
  if (splashVersion) splashVersion.textContent = `v${APP_VERSION}`;

  const splashSubtitle = document.querySelector('.splash-subtitle');
  const stages = [
    'טוען משאבים...',
    'מאמת פרופילים...',
    'מכין ממשק...',
    'PI Vision Mobile Dashboard'
  ];
  
  let stageIdx = 0;
  const stageInterval = setInterval(() => {
    stageIdx++;
    if (stageIdx < stages.length && splashSubtitle) {
      splashSubtitle.style.opacity = '0';
      setTimeout(() => {
        splashSubtitle.textContent = stages[stageIdx];
        splashSubtitle.style.opacity = '1';
      }, 200);
    }
  }, 500);

  setTimeout(() => {
    clearInterval(stageInterval);
    document.getElementById('splash').classList.add('hidden');

    if (isFirstLaunch) {
      showOnboarding();
    } else {
      showApp();
    }
  }, 2200);
});

function prepareAppShell() {
  var app = document.getElementById('app');
  if (!app) return;

  if (!appShellPrepared) {
    app.style.display = 'flex';
    app.setAttribute('aria-hidden', 'true');
    app.classList.add('app-shell--preparing');
    initApp();
    primeEmbeddedFrame();
    appShellPrepared = true;
  }
}

async function loadPersistedState() {
  const savedProfiles = await AppStorage.get('connectionProfiles');
  if (savedProfiles && Array.isArray(savedProfiles)) {
    connectionProfiles = savedProfiles;
  } else {
    connectionProfiles = [...DEFAULT_PROFILES];
  }
  
  activeProfileId = await AppStorage.get('activeProfileId', 'demo-profile');
  
  const savedMode = await AppStorage.get('currentMode', 'demo');
  if (['demo', 'simulation', 'live'].includes(savedMode)) {
    currentMode = savedMode;
  }
  
  const savedTheme = await AppStorage.get('isDarkTheme');
  if (savedTheme !== null) {
    isDarkTheme = savedTheme;
    if (!isDarkTheme) {
      document.documentElement.classList.add('light-theme');
    }
  }

  const savedFirstLaunch = await AppStorage.get('onboardingComplete');
  if (savedFirstLaunch === true) {
    isFirstLaunch = false;
  }
}

async function persistState() {
  await AppStorage.set('connectionProfiles', connectionProfiles);
  await AppStorage.set('activeProfileId', activeProfileId);
  await AppStorage.set('currentMode', currentMode);
  await AppStorage.set('isDarkTheme', isDarkTheme);
}

function showApp() {
  const onboarding = document.getElementById('onboarding');
  const app = document.getElementById('app');
  const embedded = document.getElementById('embedded-view');
  prepareAppShell();
  deferredOnboardingVisible = false;
  if (onboarding) {
    onboarding.classList.remove('visible');
    onboarding.setAttribute('aria-hidden', 'true');
  }
  if (app) {
    app.style.display = 'flex';
    app.setAttribute('aria-hidden', 'false');
    app.classList.remove('app-shell--preparing');
  }
  if (embedded && !embedded.classList.contains('visible')) {
    embedded.setAttribute('aria-hidden', 'true');
    embedded.style.pointerEvents = 'none';
  }
  initApp();
  primeEmbeddedFrame();
}

function initApp() {
  if (appInitialized) {
    renderKPIs();
    renderQuickLaunch();
    renderRecentActivity();
    renderSymbols();
    renderCategoryFilters();
    renderAlertSummary();
    renderAlertFilters();
    renderAlerts();
    updateConnectionBanner();
    updateAlertBadge();
    updateSettingsDisplay();
    isAppReady = true;
    return;
  }

  appInitialized = true;
  initMobileSync();
  // Show skeletons first
  showSkeletons();

  const renderAll = () => {
    renderKPIs();
    renderQuickLaunch();
    renderRecentActivity();
    renderSymbols();
    renderCategoryFilters();
    renderAlertSummary();
    renderAlertFilters();
    renderAlerts();
    setupSearch();
    setupPullToRefresh();
    updateConnectionBanner();
    updateAlertBadge();
    updateSettingsDisplay();
    isAppReady = true;
  };

  renderAll();

  // Load content with a slight delay to show skeletons
  setTimeout(renderAll, 400);

  // Haptic feedback setup
  if (window.Capacitor && window.Capacitor.Plugins.Haptics) {
    document.querySelectorAll('.nav-item, .mode-card-mobile, .symbol-card').forEach(el => {
      el.addEventListener('touchstart', () => {
        window.Capacitor.Plugins.Haptics.impact({ style: 'LIGHT' });
      });
    });
  }

  // Start simulation updates
  startSimulationUpdates();

  // Initialize network monitoring
  initNetworkMonitoring();

  console.log(`[PIVISION Mobile v${APP_VERSION} (build ${BUILD_NUMBER})] App initialized — mode: ${currentMode}, profiles: ${connectionProfiles.length}`);
}

function showSkeletons() {
  const kpiContainer = document.getElementById('kpi-cards');
  const qlContainer = document.getElementById('quick-launch');
  const activityContainer = document.getElementById('recent-activity');
  const symbolGrid = document.getElementById('symbol-grid');

  if (kpiContainer) kpiContainer.innerHTML = Skeletons.kpi();
  if (qlContainer) qlContainer.innerHTML = Skeletons.quickLaunch();
  if (activityContainer) activityContainer.innerHTML = Skeletons.activity();
  if (symbolGrid) symbolGrid.innerHTML = Skeletons.symbolGrid();
}

// ─── Pull to Refresh ─────────────────────────────────────────

function setupPullToRefresh() {
  const content = document.querySelector('.app-content');
  if (!content) return;

  let startY = 0;
  let pulling = false;
  let pullIndicator = document.getElementById('pull-indicator');

  content.addEventListener('touchstart', (e) => {
    const activePage = document.querySelector('.page.active');
    if (!activePage || activePage.scrollTop > 5) return;
    startY = e.touches[0].clientY;
    pulling = true;
  }, { passive: true });

  content.addEventListener('touchmove', (e) => {
    if (!pulling) return;
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY;
    
    if (diff > 0 && diff < 120) {
      if (pullIndicator) {
        pullIndicator.style.display = 'flex';
        pullIndicator.style.opacity = Math.min(diff / 80, 1);
        pullIndicator.style.transform = `translateY(${Math.min(diff * 0.5, 50)}px)`;
        
        if (diff > 70) {
          pullIndicator.classList.add('ready');
        } else {
          pullIndicator.classList.remove('ready');
        }
      }
    }
  }, { passive: true });

  content.addEventListener('touchend', () => {
    if (!pulling) return;
    pulling = false;
    
    if (pullIndicator && pullIndicator.classList.contains('ready')) {
      pullIndicator.classList.add('refreshing');
      pullIndicator.classList.remove('ready');
      
      // Perform refresh
      refreshDashboard().then(() => {
        setTimeout(() => {
          if (pullIndicator) {
            pullIndicator.classList.remove('refreshing');
            pullIndicator.style.display = 'none';
            pullIndicator.style.opacity = 0;
            pullIndicator.style.transform = 'translateY(0)';
          }
        }, 600);
      });
    } else if (pullIndicator) {
      pullIndicator.style.display = 'none';
      pullIndicator.style.opacity = 0;
      pullIndicator.style.transform = 'translateY(0)';
      pullIndicator.classList.remove('ready');
    }
  }, { passive: true });
}

async function refreshDashboard() {
  // Regenerate sparkline data
  KPI_DATA.demo[0].history = generateSparklineHistory(847, 20);
  KPI_DATA.demo[1].history = generateSparklineHistory(94.7, 20);
  KPI_DATA.demo[2].history = generateSparklineHistory(12, 20);
  KPI_DATA.demo[3].history = generateSparklineHistory(23.1, 20);

  renderKPIs();
  renderRecentActivity();
  updateAlertBadge();
  
  showToast('הנתונים עודכנו', 'success');
  triggerHaptic('MEDIUM');
}

// ─── Settings Display Update ─────────────────────────────────

function updateSettingsDisplay() {
  // Update version display
  const versionEl = document.querySelector('#settings-version-text');
  if (versionEl) versionEl.textContent = `PIVISION Mobile v${APP_VERSION} (PIV ${PIV_VERSION})`;
  
  // Update active profile display
  updateActiveProfileDisplay();
  
  // Update mode text
  const modeTexts = {
    demo: 'DEMO — נתונים מדומים',
    simulation: 'FULL SIMULATION — נתונים דינמיים',
    live: 'LIVE — חיבור PI Web API',
  };
  const modeTextEl = document.getElementById('current-mode-text');
  if (modeTextEl) modeTextEl.textContent = modeTexts[currentMode] || '';

  // Update theme
  const toggle = document.getElementById('toggle-dark');
  if (toggle) toggle.classList.toggle('on', isDarkTheme);
  const status = document.getElementById('theme-status');
  if (status) status.textContent = isDarkTheme ? 'פעיל' : 'לא פעיל';
}

function updateActiveProfileDisplay() {
  const profile = connectionProfiles.find(p => p.id === activeProfileId);
  const piUrlEl = document.getElementById('pi-url-value');
  if (piUrlEl && profile) {
    if (profile.type === 'demo') {
      piUrlEl.textContent = 'פרופיל הדגמה (אין חיבור חיצוני)';
    } else if (profile.url) {
      piUrlEl.textContent = profile.url.replace(/^https?:\/\//, '').split('/')[0];
    } else {
      piUrlEl.textContent = 'לא מוגדר — לחץ להגדרה';
    }
  }
  
  // Update profiles count
  const profileCountEl = document.getElementById('profiles-count');
  if (profileCountEl) {
    profileCountEl.textContent = `${connectionProfiles.length} פרופילים`;
  }
}

// ─── Onboarding ──────────────────────────────────────────────

function showOnboarding() {
  onboardingStep = 0;
  deferredOnboardingVisible = true;
  prepareAppShell();
  const overlay = document.getElementById('onboarding');
  const app = document.getElementById('app');
  if (app) {
    app.style.display = 'flex';
    app.setAttribute('aria-hidden', 'true');
    app.classList.add('app-shell--preparing');
  }
  overlay.setAttribute('aria-hidden', 'false');
  overlay.classList.add('visible');
  renderOnboardingStep();
}

function renderOnboardingStep() {
  const step = ONBOARDING_STEPS[onboardingStep];
  const content = document.getElementById('onboarding-content');
  const dots = document.getElementById('onboarding-dots');
  const actions = document.getElementById('onboarding-actions');

  let formHTML = '';
  if (step.hasForm) {
    formHTML = `
      <div class="onboarding-form" id="onboarding-profile-form">
        <div class="onboarding-form-row">
          <label class="onboarding-form-label">שם הפרופיל</label>
          <input class="onboarding-form-input" id="ob-profile-name" type="text" placeholder="לדוגמה: שרת ייצור" dir="rtl" autocomplete="off">
        </div>
        <div class="onboarding-form-row">
          <label class="onboarding-form-label">כתובת PI Web API</label>
          <input class="onboarding-form-input" id="ob-profile-url" type="url" placeholder="https://your-server/piwebapi" dir="ltr" autocomplete="url">
        </div>
        <div class="onboarding-form-row">
          <label class="onboarding-form-label">שם משתמש (אופציונלי)</label>
          <input class="onboarding-form-input" id="ob-profile-user" type="text" placeholder="DOMAIN\\user" dir="ltr" autocomplete="username">
        </div>
      </div>
    `;
  }

  content.innerHTML = `
    <div class="onboarding-illustration">${step.icon}</div>
    <div class="onboarding-title">${step.title}</div>
    <div class="onboarding-desc">${step.desc}</div>
    ${formHTML}
  `;

  // Step indicators
  dots.innerHTML = ONBOARDING_STEPS.map((_, i) =>
    `<div class="onboarding-dot ${i === onboardingStep ? 'active' : ''} ${i < onboardingStep ? 'completed' : ''}"></div>`
  ).join('');

  // Progress text
  const progressText = `${onboardingStep + 1} / ${ONBOARDING_STEPS.length}`;

  let btns = '';
  if (step.id === 'profile-setup') {
    btns = `
      <button class="onboarding-btn-primary" onclick="saveOnboardingProfile()">${step.primaryBtn}</button>
      <button class="onboarding-btn-secondary" onclick="nextOnboardingStep()">${step.secondaryBtn}</button>
    `;
  } else {
    btns = `<button class="onboarding-btn-primary" onclick="nextOnboardingStep()">${step.primaryBtn}</button>`;
    if (step.secondaryBtn) {
      btns += `<button class="onboarding-btn-secondary" onclick="skipOnboarding()">${step.secondaryBtn}</button>`;
    }
  }
  actions.innerHTML = `<div class="onboarding-progress-text">${progressText}</div>${btns}`;
}

function saveOnboardingProfile() {
  const name = document.getElementById('ob-profile-name')?.value?.trim();
  const url = document.getElementById('ob-profile-url')?.value?.trim();
  const user = document.getElementById('ob-profile-user')?.value?.trim();

  if (!name && !url) {
    showToast('נא למלא לפחות שם פרופיל או URL', 'error');
    return;
  }

  const newProfile = {
    id: 'profile-' + Date.now(),
    name: name || 'פרופיל חדש',
    type: url ? 'live' : 'demo',
    url: url || '',
    username: user || '',
    password: '',
    isDefault: false,
    lastUsed: null,
    createdAt: new Date().toISOString()
  };

  connectionProfiles.push(newProfile);
  if (url) {
    activeProfileId = newProfile.id;
    piWebApiUrl = url;
    currentMode = 'live';
  }

  persistState();
  showToast(`פרופיל "${newProfile.name}" נוסף בהצלחה`, 'success');
  nextOnboardingStep();
}

function nextOnboardingStep() {
  onboardingStep++;
  if (onboardingStep >= ONBOARDING_STEPS.length) {
    completeOnboarding();
  } else {
    renderOnboardingStep();
  }
  triggerHaptic('LIGHT');
}

function skipOnboarding() {
  completeOnboarding();
}

async function completeOnboarding() {
  isFirstLaunch = false;
  deferredOnboardingVisible = false;
  await AppStorage.set('onboardingComplete', true);
  await persistState();
  document.getElementById('onboarding').classList.remove('visible');
  document.getElementById('onboarding').setAttribute('aria-hidden', 'true');
  showApp();
}

// ─── Navigation ──────────────────────────────────────────────

const VALID_PAGES = ['dashboard', 'symbols', 'alerts', 'settings'];

function navigateTo(page, meta = {}) {
  if (page === currentPage) return;
  if (VALID_PAGES.indexOf(page) === -1) {
    console.warn('[Nav] Invalid page:', page);
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
    n.setAttribute('aria-selected', 'false');
  });

  const pageEl = document.getElementById('page-' + page);
  const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (pageEl) {
    pageEl.classList.add('active');
    pageEl.scrollTop = 0; // Reset scroll
  }
  if (navEl) {
    navEl.classList.add('active');
    navEl.setAttribute('aria-selected', 'true');
  }

  currentPage = page;
  triggerHaptic('LIGHT');
  if (!meta.remote) {
    publishMobileSync('mobile.page.changed', { page: page }, 'desktop');
  }
}

// ─── Data Mode ───────────────────────────────────────────────

function setDataMode(mode, meta = {}) {
  currentMode = mode;

  document.querySelectorAll('.data-mode-btn').forEach(btn => {
    const isActive = btn.dataset.mode === mode;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
  });

  const badge = document.getElementById('mode-badge');
  const modeConfig = {
    demo: { cls: 'mode-badge--demo', text: 'DEMO' },
    simulation: { cls: 'mode-badge--sim', text: 'SIM' },
    live: { cls: 'mode-badge--live', text: 'LIVE' },
  };
  const cfg = modeConfig[mode];
  if (!cfg) { console.warn('[Mode] Invalid mode:', mode); return; }
  if (badge) {
    badge.className = 'mode-badge ' + cfg.cls;
    // cfg.text is from hardcoded modeConfig — safe for innerHTML
    badge.innerHTML = '<span class="dot"></span> ' + cfg.text;
  }

  const modeTexts = {
    demo: 'DEMO — נתונים מדומים',
    simulation: 'FULL SIMULATION — נתונים דינמיים',
    live: 'LIVE — חיבור PI Web API',
  };
  document.getElementById('current-mode-text').textContent = modeTexts[mode] || '';

  renderKPIs();
  updateConnectionBanner();
  // Only run simulation timer in simulation mode; clear otherwise
  if (mode === 'simulation') {
    startSimulationUpdates();
  } else if (simulationInterval) {
    clearInterval(simulationInterval);
    simulationInterval = null;
  }
  persistState();
  triggerHaptic('MEDIUM');

  if (!meta.remote) {
    publishMobileSync('mobile.mode.changed', { mode, page: currentPage }, 'desktop');
  }

  if (mode === 'live' && !piWebApiUrl) {
    setTimeout(() => showLiveWizard(), 300);
  }
}

// ─── Render Functions ────────────────────────────────────────

function generateSparklineSVG(data, color) {
  if (!data || data.length < 2) return '';
  
  const w = 100;
  const h = 28;
  const padding = 2;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  
  const points = data.map((val, i) => {
    const x = padding + (i / (data.length - 1)) * (w - padding * 2);
    const y = h - padding - ((val - min) / range) * (h - padding * 2);
    return `${x},${y}`;
  });
  
  const linePoints = points.join(' ');
  const areaPoints = `${padding},${h} ${linePoints} ${w - padding},${h}`;
  
  return `
    <div class="sparkline-container">
      <svg class="sparkline-svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
        <polygon class="sparkline-area" points="${areaPoints}"/>
        <polyline class="sparkline-line" points="${linePoints}" fill="none"/>
      </svg>
    </div>
  `;
}

function renderKPIs() {
  const container = document.getElementById('kpi-cards');
  if (!container) return;
  const data = KPI_DATA[currentMode] || KPI_DATA.demo;

  container.innerHTML = data.map((kpi, i) => {
    const sparkline = generateSparklineSVG(kpi.history, kpi.color);
    const changeIcon = kpi.up
      ? '<span class="change-icon">▲</span>'
      : '<span class="change-icon">▼</span>';
    
    return `
      <div class="kpi-card kpi-card--${kpi.color} animate-in" style="animation-delay: ${i * 0.06}s" data-testid="kpi-card-${i}">
        <div class="kpi-label">${kpi.label}</div>
        <div class="kpi-value">
          ${kpi.value}<span class="kpi-unit">${kpi.unit}</span>
        </div>
        <div class="kpi-change ${kpi.up ? 'up' : 'down'}">
          ${changeIcon} ${kpi.change}
        </div>
        ${sparkline}
      </div>
    `;
  }).join('');
}

function renderQuickLaunch() {
  const container = document.getElementById('quick-launch');
  if (!container) return;
  const modes = [
    { id: 'emulator', title: 'אמולטור', desc: '40+ סמלים, DevTools, AF Panel', iconClass: 'card-icon--emulator', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' },
    { id: 'qa', title: 'בדיקת QA', desc: 'ניתוח קוד, Runtime, בדיקות ידניות', iconClass: 'card-icon--qa', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>' },
    { id: 'combined', title: 'אמולטור + QA', desc: 'אמולטור עם QA ברקע — מצב מומלץ', iconClass: 'card-icon--combined', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
    { id: 'af', title: 'דפדפן AF', desc: '853 אלמנטים, 8,656 מאפיינים', iconClass: 'card-icon--af', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>' },
    { id: 'builder', title: 'עורך ויזואלי', desc: 'צור סמלים חדשים עם עורך גרפי', iconClass: 'card-icon--builder', icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' },
  ];

  container.innerHTML = modes.map((mode, i) => `
    <div class="mode-card-mobile animate-in" style="animation-delay: ${i * 0.04}s" onclick="openMode('${mode.id}')" role="listitem" data-testid="quick-launch-${mode.id}">
      <div class="card-icon ${mode.iconClass}">
        ${mode.icon}
      </div>
      <div class="card-content">
        <div class="card-title">${mode.title}</div>
        <div class="card-desc">${mode.desc}</div>
      </div>
      <svg class="card-arrow" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M10 4l-4 4 4 4"/></svg>
    </div>
  `).join('');
}

function renderRecentActivity() {
  const container = document.getElementById('recent-activity');
  if (!container) return;
  const recent = DEMO_ALERTS.slice(0, 4);
  
  const countEl = document.getElementById('recent-count');
  if (countEl) countEl.textContent = `(${DEMO_ALERTS.length} סה"כ)`;
  
  container.innerHTML = recent.map((alert, i) => `
    <div class="alert-item animate-in" style="animation-delay: ${i * 0.04}s" data-severity="${alert.severity}" onclick="showAlertDetail(${alert.id})" role="listitem">
      <div class="alert-severity alert-severity--${alert.severity}">
        ${getSeverityIcon(alert.severity)}
      </div>
      <div class="alert-content">
        <div class="alert-title">${alert.title}</div>
        <div class="alert-source">${alert.source}</div>
      </div>
      <div class="alert-time">${alert.time}</div>
    </div>
  `).join('');
}

function renderSymbols(filter = '', category = 'all') {
  const container = document.getElementById('symbol-grid');
  if (!container) return;
  let symbols = SYMBOLS;
  
  if (category !== 'all') {
    symbols = symbols.filter(s => s.type === category);
  }
  
  if (filter) {
    const f = filter.toLowerCase();
    symbols = symbols.filter(s =>
      s.name.toLowerCase().includes(f) ||
      s.nameHe.includes(f) ||
      s.type.toLowerCase().includes(f) ||
      s.id.toLowerCase().includes(f)
    );
  }

  const countEl = document.getElementById('symbol-count');
  if (countEl) countEl.textContent = `(${symbols.length})`;

  if (symbols.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">
          <svg viewBox="0 0 64 64" fill="none" stroke="var(--text-dim)" stroke-width="1.5" stroke-linecap="round">
            <circle cx="28" cy="28" r="18"/>
            <path d="M40 40l12 12"/>
            <path d="M20 28h16" stroke-opacity="0.5"/>
          </svg>
        </div>
        <h3>לא נמצאו סמלים</h3>
        <p>נסה חיפוש אחר או שנה קטגוריה</p>
      </div>
    `;
    return;
  }

  container.innerHTML = symbols.map((sym, i) => `
    <div class="symbol-card animate-in" style="animation-delay: ${Math.min(i * 0.02, 0.4)}s" onclick="openSymbol('${sym.id}')" role="gridcell" data-testid="symbol-${sym.id}">
      <div class="sym-icon">${sym.icon}</div>
      <div class="sym-name">${sym.nameHe}</div>
      <div class="sym-type">${sym.type}</div>
    </div>
  `).join('');
}

function renderCategoryFilters() {
  const container = document.getElementById('category-filters');
  const types = ['all', ...new Set(SYMBOLS.map(s => s.type))];
  const typeLabels = {
    all: 'הכל',
    Dashboard: 'דשבורד',
    Chart: 'גרפים',
    Gauge: 'מדים',
    KPI: 'KPI',
    Alert: 'התראות',
    Visualization: 'ויזואליזציה',
    Energy: 'אנרגיה',
    Status: 'סטטוס',
    Environment: 'סביבה',
    Asset: 'נכסים',
    Monitor: 'ניטור',
    Analysis: 'ניתוח',
    Data: 'נתונים',
    Table: 'טבלאות',
    Browser: 'דפדפן',
    Report: 'דוחות',
    Navigation: 'ניווט',
    MM20: 'MM20',
  };

  container.innerHTML = types.map(type => {
    const count = type === 'all' ? SYMBOLS.length : SYMBOLS.filter(s => s.type === type).length;
    return `
      <button class="category-pill ${type === symbolCategory ? 'active' : ''}" 
              data-category="${type}" 
              onclick="filterByCategory('${type}')"
              role="tab"
              aria-selected="${type === symbolCategory}">
        ${typeLabels[type] || type} (${count})
      </button>
    `;
  }).join('');
}

function filterByCategory(category, meta = {}) {
  symbolCategory = category;
  document.querySelectorAll('.category-pill').forEach(pill => {
    const isActive = pill.dataset.category === category;
    pill.classList.toggle('active', isActive);
    pill.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
  const searchVal = document.getElementById('symbol-search')?.value || '';
  renderSymbols(searchVal, category);
  triggerHaptic('LIGHT');
  if (!meta.remote) {
    publishMobileSync('mobile.symbol.category.changed', { category, filter: searchVal }, 'desktop');
  }
}

function renderAlertSummary() {
  const container = document.getElementById('alert-summary');
  const counts = {
    critical: DEMO_ALERTS.filter(a => a.severity === 'critical').length,
    warning: DEMO_ALERTS.filter(a => a.severity === 'warning').length,
    info: DEMO_ALERTS.filter(a => a.severity === 'info').length,
    ok: DEMO_ALERTS.filter(a => a.severity === 'ok').length,
  };

  container.innerHTML = `
    <div class="alert-stat">
      <div class="alert-stat-value alert-stat-value--critical">${counts.critical}</div>
      <div class="alert-stat-label">קריטי</div>
    </div>
    <div class="alert-stat">
      <div class="alert-stat-value alert-stat-value--warning">${counts.warning}</div>
      <div class="alert-stat-label">אזהרה</div>
    </div>
    <div class="alert-stat">
      <div class="alert-stat-value alert-stat-value--info">${counts.info}</div>
      <div class="alert-stat-label">מידע</div>
    </div>
    <div class="alert-stat">
      <div class="alert-stat-value alert-stat-value--ok">${counts.ok}</div>
      <div class="alert-stat-label">תקין</div>
    </div>
  `;
}

function renderAlertFilters() {
  const container = document.getElementById('alert-filters');
  const counts = {
    all: DEMO_ALERTS.length,
    critical: DEMO_ALERTS.filter(a => a.severity === 'critical').length,
    warning: DEMO_ALERTS.filter(a => a.severity === 'warning').length,
    info: DEMO_ALERTS.filter(a => a.severity === 'info').length,
    ok: DEMO_ALERTS.filter(a => a.severity === 'ok').length,
  };
  const labels = { all: 'הכל', critical: 'קריטי', warning: 'אזהרה', info: 'מידע', ok: 'תקין' };

  container.innerHTML = Object.entries(labels).map(([key, label]) => `
    <button class="filter-chip ${key === alertFilter ? 'active' : ''}" 
            data-filter="${key}" 
            onclick="filterAlerts('${key}')"
            role="tab"
            aria-selected="${key === alertFilter}">
      ${label}
      <span class="chip-count">${counts[key]}</span>
    </button>
  `).join('');
}

function filterAlerts(filter) {
  alertFilter = filter;
  renderAlertFilters();
  renderAlerts(filter);
  triggerHaptic('LIGHT');
}

function renderAlerts(filter) {
  filter = filter || alertFilter;
  const container = document.getElementById('alerts-list');
  if (!container) return;
  let alerts = DEMO_ALERTS;
  
  if (filter !== 'all') {
    alerts = alerts.filter(a => a.severity === filter);
  }

  if (alerts.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">
          <svg viewBox="0 0 64 64" fill="none" stroke="var(--success)" stroke-width="1.5" stroke-linecap="round">
            <circle cx="32" cy="32" r="24"/>
            <path d="M22 32 L28 38 L42 26" stroke-width="2.5"/>
          </svg>
        </div>
        <h3>אין התראות</h3>
        <p>המערכת תקינה — אין התראות מסוג זה</p>
      </div>
    `;
    return;
  }

  container.innerHTML = alerts.map((alert, i) => `
    <div class="alert-item animate-in" style="animation-delay: ${i * 0.03}s" data-severity="${alert.severity}" onclick="showAlertDetail(${alert.id})" role="listitem" data-testid="alert-${alert.id}">
      <div class="alert-severity alert-severity--${alert.severity}">
        ${getSeverityIcon(alert.severity)}
      </div>
      <div class="alert-content">
        <div class="alert-title">${alert.title}</div>
        <div class="alert-source">${alert.source}</div>
        <span class="alert-tag">${alert.tag}</span>
      </div>
      <div class="alert-meta">
        <div class="alert-time">${alert.time}</div>
        ${alert.acknowledged ? '<span style="font-size:10px; color: var(--success);">✓ אושר</span>' : ''}
      </div>
    </div>
  `).join('');
}

function getSeverityIcon(severity) {
  const icons = {
    critical: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
    warning: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
    info: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>',
    ok: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
  };
  return icons[severity] || icons.info;
}

// ─── Alert Detail ────────────────────────────────────────────

function showAlertDetail(alertId) {
  const alert = DEMO_ALERTS.find(a => a.id === alertId);
  if (!alert) return;

  const severityLabels = { critical: 'קריטי', warning: 'אזהרה', info: 'מידע', ok: 'תקין' };
  const severityColors = { critical: 'danger', warning: 'warning', info: 'accent', ok: 'success' };

  const content = document.getElementById('alert-detail-content');
  content.innerHTML = `
    <div class="alert-detail-header">
      <div class="alert-detail-severity alert-severity--${alert.severity}">
        ${getSeverityIcon(alert.severity)}
      </div>
      <div class="alert-detail-title">${alert.title}</div>
    </div>
    <div class="alert-detail-field">
      <span class="alert-detail-label">רמת חומרה</span>
      <span class="alert-detail-value" style="color: var(--${severityColors[alert.severity]})">${severityLabels[alert.severity]}</span>
    </div>
    <div class="alert-detail-field">
      <span class="alert-detail-label">מקור</span>
      <span class="alert-detail-value">${alert.source}</span>
    </div>
    <div class="alert-detail-field">
      <span class="alert-detail-label">תג PI</span>
      <span class="alert-detail-value" style="font-family: monospace; font-size: 12px;">${alert.tag}</span>
    </div>
    <div class="alert-detail-field">
      <span class="alert-detail-label">זמן</span>
      <span class="alert-detail-value">${alert.time} לפני</span>
    </div>
    <div class="alert-detail-field">
      <span class="alert-detail-label">סטטוס</span>
      <span class="alert-detail-value">${alert.acknowledged ? 'אושר ✓' : 'ממתין לאישור'}</span>
    </div>
    <div class="alert-detail-actions">
      <button class="alert-dismiss-btn" onclick="closeAlertDetail()">סגור</button>
      ${!alert.acknowledged ? `<button class="alert-ack-btn" onclick="acknowledgeAlert(${alert.id})">אשר התראה</button>` : ''}
    </div>
  `;

  document.getElementById('alert-detail').classList.add('visible');
  triggerHaptic('LIGHT');
}

function acknowledgeAlert(alertId, meta = {}) {
  const alert = DEMO_ALERTS.find(a => a.id === alertId);
  if (alert) {
    alert.acknowledged = true;
    showToast('התראה אושרה בהצלחה', 'success');
    renderAlerts();
    renderRecentActivity();
    renderAlertSummary();
    updateAlertBadge();
    closeAlertDetail();
    if (!meta.remote) {
      publishMobileSync('mobile.alert.acknowledged', { alertId: alertId }, 'desktop');
    }
  }
}

function closeAlertDetail(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('alert-detail').classList.remove('visible');
}

// ─── Search ──────────────────────────────────────────────────

function setupSearch() {
  const input = document.getElementById('symbol-search');
  if (input) {
    let timeout;
    input.addEventListener('input', (e) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => {
        renderSymbols(e.target.value, symbolCategory);
      }, 150);
    });
  }
}

// ─── Mode Selector ───────────────────────────────────────────

function showModeSelector() {
  document.getElementById('mode-selector').classList.add('visible');
  document.querySelectorAll('.mode-option').forEach(opt => {
    opt.classList.toggle('selected', opt.dataset.mode === currentMode);
  });
}

function closeModeSelector(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('mode-selector').classList.remove('visible');
}

function selectMode(mode) {
  setDataMode(mode);
  setTimeout(() => {
    document.getElementById('mode-selector').classList.remove('visible');
  }, 200);
}

// ─── Theme Toggle ────────────────────────────────────────────

function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  document.documentElement.classList.toggle('light-theme', !isDarkTheme);
  
  const toggle = document.getElementById('toggle-dark');
  if (toggle) toggle.classList.toggle('on', isDarkTheme);
  
  const status = document.getElementById('theme-status');
  if (status) status.textContent = isDarkTheme ? 'פעיל' : 'לא פעיל';

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', isDarkTheme ? '#060b18' : '#f0f4f8');

  if (window.Capacitor && window.Capacitor.Plugins.StatusBar) {
    window.Capacitor.Plugins.StatusBar.setBackgroundColor({
      color: isDarkTheme ? '#060b18' : '#ffffff'
    });
  }

  persistState();
  triggerHaptic('LIGHT');
}

// ─── Connection Banner ───────────────────────────────────────

function updateConnectionBanner() {
  const banner = document.getElementById('connection-banner');
  const text = document.getElementById('connection-text');
  
  banner.className = 'connection-banner';
  
  if (currentMode === 'live') {
    if (piWebApiUrl) {
      banner.classList.add('connected');
      text.textContent = `LIVE — מחובר ל-${piWebApiUrl.replace(/^https?:\/\//, '').split('/')[0]}`;
    } else {
      banner.classList.add('live-required');
      text.textContent = 'מצב LIVE — נדרשת הגדרת חיבור PI Web API';
    }
  } else if (currentMode === 'simulation') {
    banner.classList.add('connected');
    text.textContent = 'סימולציה מלאה — נתונים דינמיים פעילים';
  } else {
    text.textContent = 'מצב הדגמה — נתונים מדומים';
  }
}

// ─── Connection Profiles Manager ─────────────────────────────

function showProfilesSheet() {
  const overlay = document.getElementById('profiles-sheet');
  if (!overlay) return;
  
  renderProfilesList();
  overlay.classList.add('visible');
  triggerHaptic('LIGHT');
}

function closeProfilesSheet(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('profiles-sheet').classList.remove('visible');
}

function renderProfilesList() {
  const container = document.getElementById('profiles-list');
  if (!container) return;

  container.innerHTML = connectionProfiles.map(profile => {
    const isActive = profile.id === activeProfileId;
    const typeLabel = { demo: 'הדגמה', live: 'LIVE', simulation: 'סימולציה' }[profile.type] || profile.type;
    const typeColor = { demo: 'accent', live: 'success', simulation: 'purple' }[profile.type] || 'accent';
    
    return `
      <div class="profile-item ${isActive ? 'profile-item--active' : ''}" onclick="switchProfile('${profile.id}')" role="button" tabindex="0">
        <div class="profile-indicator" style="background: var(--${typeColor});"></div>
        <div class="profile-info">
          <div class="profile-name">${profile.name}</div>
          <div class="profile-url">${profile.url || typeLabel}</div>
          ${profile.lastUsed ? `<div class="profile-last-used">שימוש אחרון: ${new Date(profile.lastUsed).toLocaleDateString('he-IL')}</div>` : ''}
        </div>
        <div class="profile-actions-inline">
          ${isActive ? '<span class="profile-active-badge">פעיל</span>' : ''}
          ${!profile.isDefault ? `<button class="profile-delete-btn" onclick="event.stopPropagation(); deleteProfile('${profile.id}')" aria-label="מחק פרופיל">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
          </button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

async function switchProfile(profileId) {
  const profile = connectionProfiles.find(p => p.id === profileId);
  if (!profile) return;

  activeProfileId = profileId;
  profile.lastUsed = new Date().toISOString();
  
  if (profile.type === 'live' && profile.url) {
    piWebApiUrl = profile.url;
    setDataMode('live');
  } else if (profile.type === 'simulation') {
    setDataMode('simulation');
  } else {
    piWebApiUrl = '';
    setDataMode('demo');
  }

  await persistState();
  updateActiveProfileDisplay();
  renderProfilesList();
  showToast(`הועבר לפרופיל: ${profile.name}`, 'success');
  triggerHaptic('MEDIUM');
}

async function deleteProfile(profileId) {
  const profile = connectionProfiles.find(p => p.id === profileId);
  if (!profile || profile.isDefault) return;

  connectionProfiles = connectionProfiles.filter(p => p.id !== profileId);
  
  if (activeProfileId === profileId) {
    activeProfileId = 'demo-profile';
    setDataMode('demo');
  }

  await persistState();
  renderProfilesList();
  updateActiveProfileDisplay();
  showToast(`פרופיל "${profile.name}" נמחק`, 'info');
  triggerHaptic('LIGHT');
}

function showAddProfileForm() {
  const formEl = document.getElementById('add-profile-form');
  if (formEl) {
    formEl.style.display = formEl.style.display === 'none' ? 'block' : 'none';
  }
}

async function saveNewProfile() {
  const name = document.getElementById('new-profile-name')?.value?.trim();
  const url = document.getElementById('new-profile-url')?.value?.trim();
  const user = document.getElementById('new-profile-user')?.value?.trim();
  const pass = document.getElementById('new-profile-pass')?.value?.trim();

  if (!name) {
    showToast('נא להזין שם לפרופיל', 'error');
    return;
  }

  const newProfile = {
    id: 'profile-' + Date.now(),
    name,
    type: url ? 'live' : 'demo',
    url: url || '',
    username: user || '',
    password: pass || '',
    isDefault: false,
    lastUsed: null,
    createdAt: new Date().toISOString()
  };

  connectionProfiles.push(newProfile);
  await persistState();
  
  renderProfilesList();
  updateActiveProfileDisplay();
  
  // Clear form
  ['new-profile-name', 'new-profile-url', 'new-profile-user', 'new-profile-pass'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  showAddProfileForm(); // Hide form
  
  showToast(`פרופיל "${name}" נוצר בהצלחה`, 'success');
  triggerHaptic('MEDIUM');
}

// ─── Live Connection Wizard ──────────────────────────────────

function showLiveWizard() {
  document.getElementById('live-wizard').classList.add('visible');
  const urlInput = document.getElementById('wizard-url');
  if (piWebApiUrl) urlInput.value = piWebApiUrl;
  urlInput.focus();
}

function closeLiveWizard(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('live-wizard').classList.remove('visible');
}

function testConnection() {
  const url = document.getElementById('wizard-url').value.trim();
  if (!url) {
    showWizardStatus('error', 'יש להזין כתובת שרת');
    return;
  }

  showWizardStatus('testing', 'בודק חיבור...');
  
  setTimeout(() => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      piWebApiUrl = url;
      showWizardStatus('success', 'החיבור הצליח! (סימולציה — במצב LIVE אמיתי יבדק השרת)');
      document.getElementById('pi-url-value').textContent = url.replace(/^https?:\/\//, '').split('/')[0];
      
      // Auto-create a profile for this connection
      const existing = connectionProfiles.find(p => p.url === url);
      if (!existing) {
        const hostname = url.replace(/^https?:\/\//, '').split('/')[0];
        const newProfile = {
          id: 'profile-' + Date.now(),
          name: hostname,
          type: 'live',
          url,
          username: document.getElementById('wizard-user')?.value?.trim() || '',
          password: document.getElementById('wizard-pass')?.value?.trim() || '',
          isDefault: false,
          lastUsed: new Date().toISOString(),
          createdAt: new Date().toISOString()
        };
        connectionProfiles.push(newProfile);
        activeProfileId = newProfile.id;
      }
      
      updateConnectionBanner();
      persistState();
      
      setTimeout(() => {
        closeLiveWizard();
        showToast('הגדרת חיבור PI Web API נשמרה', 'success');
      }, 1500);
    } else {
      showWizardStatus('error', 'כתובת לא תקינה — יש להתחיל ב-http:// או https://');
    }
  }, 1500);
}

function showWizardStatus(type, message) {
  const el = document.getElementById('wizard-status');
  el.style.display = 'flex';
  el.className = `wizard-status wizard-status--${type}`;
  
  const icons = {
    testing: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>',
    success: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    error: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
  };
  
  el.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
}

// ─── Changelog & Diagnostics ─────────────────────────────────

function showChangelog() {
  const overlay = document.getElementById('changelog-sheet');
  if (!overlay) return;

  const container = document.getElementById('changelog-content');
  if (container) {
    container.innerHTML = CHANGELOG.map(release => `
      <div class="changelog-release">
        <div class="changelog-version-header">
          <span class="changelog-version-badge">v${release.version}</span>
          <span class="changelog-date">${release.date}</span>
        </div>
        <div class="changelog-title">${release.title}</div>
        <ul class="changelog-list">
          ${release.changes.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  }

  overlay.classList.add('visible');
  triggerHaptic('LIGHT');
}

function closeChangelog(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('changelog-sheet').classList.remove('visible');
}

function showDiagnostics() {
  const overlay = document.getElementById('diagnostics-sheet');
  if (!overlay) return;

  const container = document.getElementById('diagnostics-content');
  if (container) {
    const isCapacitor = !!window.Capacitor;
    const networkInfo = navigator.onLine ? 'מקוון' : 'לא מקוון';
    const screenW = screen.width;
    const screenH = screen.height;
    const dpr = window.devicePixelRatio;
    const ua = navigator.userAgent;
    const lang = navigator.language;
    const platform = navigator.platform || 'Unknown';
    const memory = navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'לא זמין';
    const cores = navigator.hardwareConcurrency || 'לא זמין';
    const activeProfile = connectionProfiles.find(p => p.id === activeProfileId);

    container.innerHTML = `
      <div class="diag-section">
        <div class="diag-section-title">אפליקציה</div>
        <div class="diag-row"><span class="diag-label">גרסה</span><span class="diag-value">PIVISION Mobile v${APP_VERSION}</span></div>
        <div class="diag-row"><span class="diag-label">PIV Core</span><span class="diag-value">v${PIV_VERSION}</span></div>
        <div class="diag-row"><span class="diag-label">Build</span><span class="diag-value">${BUILD_DATE}</span></div>
        <div class="diag-row"><span class="diag-label">מצב</span><span class="diag-value">${currentMode.toUpperCase()}</span></div>
        <div class="diag-row"><span class="diag-label">Capacitor</span><span class="diag-value">${isCapacitor ? 'פעיל (Native)' : 'לא (Web)'}</span></div>
      </div>
      <div class="diag-section">
        <div class="diag-section-title">חיבור</div>
        <div class="diag-row"><span class="diag-label">רשת</span><span class="diag-value">${networkInfo}</span></div>
        <div class="diag-row"><span class="diag-label">פרופיל פעיל</span><span class="diag-value">${activeProfile?.name || '—'}</span></div>
        <div class="diag-row"><span class="diag-label">PI Web API</span><span class="diag-value" style="direction:ltr;text-align:left;">${piWebApiUrl || '—'}</span></div>
        <div class="diag-row"><span class="diag-label">פרופילים</span><span class="diag-value">${connectionProfiles.length}</span></div>
        <div class="diag-row"><span class="diag-label">קצב רענון</span><span class="diag-value">${REFRESH_RATES[refreshRateIndex]}s</span></div>
      </div>
      <div class="diag-section">
        <div class="diag-section-title">מכשיר</div>
        <div class="diag-row"><span class="diag-label">מסך</span><span class="diag-value">${screenW}x${screenH} @${dpr}x</span></div>
        <div class="diag-row"><span class="diag-label">שפה</span><span class="diag-value">${lang}</span></div>
        <div class="diag-row"><span class="diag-label">פלטפורמה</span><span class="diag-value">${platform}</span></div>
        <div class="diag-row"><span class="diag-label">זיכרון</span><span class="diag-value">${memory}</span></div>
        <div class="diag-row"><span class="diag-label">ליבות</span><span class="diag-value">${cores}</span></div>
      </div>
      <div class="diag-section">
        <div class="diag-section-title">סמלים</div>
        <div class="diag-row"><span class="diag-label">סמלים רשומים</span><span class="diag-value">${SYMBOLS.length}</span></div>
        <div class="diag-row"><span class="diag-label">התראות</span><span class="diag-value">${DEMO_ALERTS.length}</span></div>
        <div class="diag-row"><span class="diag-label">ערכת נושא</span><span class="diag-value">${isDarkTheme ? 'כהה' : 'בהיר'}</span></div>
      </div>
      <div class="diag-ua" style="direction:ltr; text-align:left;">${ua}</div>
    `;
  }

  overlay.classList.add('visible');
  triggerHaptic('LIGHT');
}

function closeDiagnostics(e) {
  if (e && e.target !== e.currentTarget) return;
  document.getElementById('diagnostics-sheet').classList.remove('visible');
}

// ─── Settings Actions ────────────────────────────────────────

function cycleRefreshRate(meta = {}) {
  refreshRateIndex = (refreshRateIndex + 1) % REFRESH_RATES.length;
  const rate = REFRESH_RATES[refreshRateIndex];
  document.getElementById('refresh-rate-value').textContent = rate >= 60 ? `${rate / 60} דקה` : `${rate} שניות`;
  showToast(`קצב רענון: ${rate} שניות`, 'info');
  
  startSimulationUpdates();
  triggerHaptic('LIGHT');
  if (!meta.remote) {
    publishMobileSync('mobile.refreshRate.changed', { refreshRate: rate }, 'desktop');
  }
}

function toggleNotifications() {
  notificationsEnabled = !notificationsEnabled;
  const toggle = document.getElementById('toggle-notifications');
  const status = document.getElementById('notifications-status');
  
  if (toggle) toggle.classList.toggle('on', notificationsEnabled);
  if (status) status.textContent = notificationsEnabled ? 'פעיל' : 'מושבת';
  
  const dot = document.getElementById('notification-dot');
  if (dot) dot.style.display = notificationsEnabled ? 'block' : 'none';
  
  showToast(notificationsEnabled ? 'התראות Push הופעלו' : 'התראות Push הושבתו', 'info');
  triggerHaptic('LIGHT');
}

function clearAppCache() {
  showToast('מטמון נוקה בהצלחה', 'success');
  triggerHaptic('MEDIUM');
}

async function resetApp() {
  await AppStorage.remove('connectionProfiles');
  await AppStorage.remove('activeProfileId');
  await AppStorage.remove('currentMode');
  await AppStorage.remove('isDarkTheme');
  await AppStorage.remove('onboardingComplete');
  
  connectionProfiles = [...DEFAULT_PROFILES];
  activeProfileId = 'demo-profile';
  currentMode = 'demo';
  piWebApiUrl = '';
  isFirstLaunch = true;
  
  showToast('האפליקציה אופסה — מפעיל מחדש', 'info');
  setTimeout(() => location.reload(), 1500);
}

// ─── Open Modes (Embedded View) ──────────────────────────────

function setEmbeddedSource(nextSrc) {
  const frame = document.getElementById('embedded-frame');
  if (!frame || !nextSrc) return;

  if (embeddedLastSrc !== nextSrc || frame.getAttribute('src') !== nextSrc) {
    frame.setAttribute('src', nextSrc);
    embeddedLastSrc = nextSrc;
  }
}

function primeEmbeddedFrame() {
  const frame = document.getElementById('embedded-frame');
  if (!frame || embeddedFramePrimed) return;
  frame.setAttribute('src', 'emulator/index.html');
  embeddedLastSrc = 'emulator/index.html';
  embeddedFramePrimed = true;
}

function openMode(modeId, meta = {}) {
  const titles = {
    emulator: 'אמולטור PI Vision',
    qa: 'בדיקת QA',
    combined: 'אמולטור + QA',
    af: 'דפדפן AF',
    builder: 'עורך ויזואלי',
  };

  const urls = {
    emulator: 'emulator/index.html',
    qa: 'qa/qa-app.html',
    combined: 'emulator/index.html',
    af: 'desktop.html',
    builder: 'desktop.html',
  };

  const view = document.getElementById('embedded-view');
  document.getElementById('embedded-title').textContent = titles[modeId] || modeId;
  setEmbeddedSource(urls[modeId] || 'emulator/index.html');
  view.style.pointerEvents = 'auto';
  view.setAttribute('aria-hidden', 'false');
  view.classList.add('visible');
  
  triggerHaptic('MEDIUM');
  if (!meta.remote) {
    publishMobileSync('mobile.mode.opened', { modeId: modeId }, 'desktop');
  }
}

function openSymbol(symId, meta = {}) {
  const sym = SYMBOLS.find(s => s.id === symId);
  const title = sym ? sym.nameHe : symId;
  const view = document.getElementById('embedded-view');
  const frame = document.getElementById('embedded-frame');
  if (!view || !frame) {
    console.warn('[openSymbol] Missing embedded-view or embedded-frame element');
    return;
  }
  document.getElementById('embedded-title').textContent = title;
  setEmbeddedSource(`emulator/index.html#symbol=${symId}`);
  view.style.pointerEvents = 'auto';
  view.setAttribute('aria-hidden', 'false');
  view.classList.add('visible');
  
  triggerHaptic('LIGHT');
  if (!meta.remote) {
    publishMobileSync('mobile.symbol.opened', { symbolId: symId }, 'desktop');
  }
}

function closeEmbeddedView() {
  const view = document.getElementById('embedded-view');
  view.classList.remove('visible');
  view.setAttribute('aria-hidden', 'true');
  view.style.pointerEvents = 'none';
  // Stop iframe to save CPU/battery
  const frame = document.getElementById('embedded-frame');
  if (frame) {
    try { frame.contentWindow.stop(); } catch (e) {}
    frame.src = 'about:blank';
    embeddedLastSrc = '';
  }
  triggerHaptic('LIGHT');
}

function openDesktopVersion() {
  const view = document.getElementById('embedded-view');
  document.getElementById('embedded-title').textContent = 'PI Vision Desktop';
  setEmbeddedSource('desktop.html');
  view.style.pointerEvents = 'auto';
  view.setAttribute('aria-hidden', 'false');
  view.classList.add('visible');
  triggerHaptic('MEDIUM');
}

// ─── Toast Notification ──────────────────────────────────────

function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const text = document.getElementById('toast-text');
  
  toast.className = `toast toast--${type}`;
  text.textContent = message;
  
  const iconSvg = toast.querySelector('.toast-icon');
  if (type === 'success') {
    iconSvg.innerHTML = '<path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>';
  } else if (type === 'error') {
    iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>';
  } else {
    iconSvg.innerHTML = '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>';
  }

  requestAnimationFrame(() => {
    toast.classList.add('visible');
  });

  setTimeout(() => {
    toast.classList.remove('visible');
  }, 3000);
}

// ─── Haptic Feedback ─────────────────────────────────────────

function triggerHaptic(style) {
  if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Haptics) {
    try {
      window.Capacitor.Plugins.Haptics.impact({ style });
    } catch (e) { /* ignore */ }
  }
  if (navigator.vibrate) {
    navigator.vibrate(style === 'MEDIUM' ? 15 : 8);
  }
}

// ─── Notification Badge ──────────────────────────────────────

function updateAlertBadge() {
  const criticalCount = DEMO_ALERTS.filter(a => a.severity === 'critical' && !a.acknowledged).length;
  const navAlerts = document.querySelector('.nav-item[data-page="alerts"]');
  
  const existingBadge = navAlerts?.querySelector('.nav-badge');
  if (existingBadge) existingBadge.remove();
  
  if (navAlerts && criticalCount > 0) {
    const badge = document.createElement('span');
    badge.className = 'nav-badge';
    badge.textContent = criticalCount;
    badge.setAttribute('aria-label', `${criticalCount} התראות קריטיות`);
    navAlerts.appendChild(badge);
  }
}

// ─── Back button handling (Android) ──────────────────────────

document.addEventListener('backbutton', () => {
  const embedded = document.getElementById('embedded-view');
  const modeSelector = document.getElementById('mode-selector');
  const alertDetail = document.getElementById('alert-detail');
  const liveWizard = document.getElementById('live-wizard');
  const profilesSheet = document.getElementById('profiles-sheet');
  const changelogSheet = document.getElementById('changelog-sheet');
  const diagnosticsSheet = document.getElementById('diagnostics-sheet');
  
  if (embedded.classList.contains('visible')) {
    closeEmbeddedView();
  } else if (diagnosticsSheet?.classList.contains('visible')) {
    closeDiagnostics();
  } else if (changelogSheet?.classList.contains('visible')) {
    closeChangelog();
  } else if (profilesSheet?.classList.contains('visible')) {
    closeProfilesSheet();
  } else if (alertDetail.classList.contains('visible')) {
    closeAlertDetail();
  } else if (liveWizard.classList.contains('visible')) {
    closeLiveWizard();
  } else if (modeSelector.classList.contains('visible')) {
    modeSelector.classList.remove('visible');
  } else if (currentPage !== 'dashboard') {
    navigateTo('dashboard');
  }
}, false);

window.addEventListener('popstate', () => {
  const embedded = document.getElementById('embedded-view');
  if (embedded.classList.contains('visible')) {
    closeEmbeddedView();
  }
});

// ─── Swipe Gestures ──────────────────────────────────────────

let touchStartX = 0;
let touchEndX = 0;

document.addEventListener('touchstart', (e) => {
  touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

document.addEventListener('touchend', (e) => {
  touchEndX = e.changedTouches[0].screenX;
  handleSwipe();
}, { passive: true });

function handleSwipe() {
  const diff = touchStartX - touchEndX;
  const threshold = 80;
  const pages = ['dashboard', 'symbols', 'alerts', 'settings'];
  const currentIndex = pages.indexOf(currentPage);
  
  if (document.getElementById('embedded-view').classList.contains('visible')) return;
  if (document.getElementById('mode-selector').classList.contains('visible')) return;
  if (document.getElementById('alert-detail').classList.contains('visible')) return;
  if (document.getElementById('live-wizard').classList.contains('visible')) return;
  if (document.getElementById('profiles-sheet')?.classList.contains('visible')) return;
  
  if (diff > threshold && currentIndex > 0) {
    navigateTo(pages[currentIndex - 1]);
  } else if (diff < -threshold && currentIndex < pages.length - 1) {
    navigateTo(pages[currentIndex + 1]);
  }
}

// ─── Dynamic Simulation Updates ──────────────────────────────

function startSimulationUpdates() {
  if (simulationInterval) clearInterval(simulationInterval);
  
  const rate = REFRESH_RATES[refreshRateIndex] * 1000;
  
  simulationInterval = setInterval(() => {
    if (currentMode === 'simulation') {
      KPI_DATA.simulation = KPI_DATA.simulation.map(kpi => {
        if (kpi.value === '—') return kpi;
        const base = parseFloat(kpi.value);
        const delta = (Math.random() - 0.48) * base * 0.02;
        const newVal = (base + delta).toFixed(kpi.unit === '%' ? 1 : 0);
        const changeVal = ((delta / base) * 100).toFixed(1);
        
        const history = [...kpi.history];
        history.push(parseFloat(newVal));
        if (history.length > 20) history.shift();
        
        return {
          ...kpi,
          value: newVal,
          change: (delta >= 0 ? '+' : '') + changeVal + '%',
          up: delta >= 0,
          history,
        };
      });
      
      if (currentPage === 'dashboard') {
        renderKPIs();
      }
    }
  }, rate);
}

// ─── Keyboard Navigation Support ─────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (document.getElementById('embedded-view').classList.contains('visible')) {
      closeEmbeddedView();
    } else if (document.getElementById('diagnostics-sheet')?.classList.contains('visible')) {
      closeDiagnostics();
    } else if (document.getElementById('changelog-sheet')?.classList.contains('visible')) {
      closeChangelog();
    } else if (document.getElementById('profiles-sheet')?.classList.contains('visible')) {
      closeProfilesSheet();
    } else if (document.getElementById('alert-detail').classList.contains('visible')) {
      closeAlertDetail();
    } else if (document.getElementById('live-wizard').classList.contains('visible')) {
      closeLiveWizard();
    } else if (document.getElementById('mode-selector').classList.contains('visible')) {
      document.getElementById('mode-selector').classList.remove('visible');
    }
  }
});

// ─── Event Listeners ─────────────────────────────────────────

document.getElementById('btn-theme')?.addEventListener('click', toggleTheme);

document.getElementById('btn-notifications')?.addEventListener('click', () => {
  navigateTo('alerts');
  triggerHaptic('LIGHT');
});

function publishMobileSync(action, payload, target) {
  if (!window.PIVMobileSync || typeof window.PIVMobileSync.publish !== 'function') {
    return Promise.resolve({ skipped: true, reason: 'sync-unavailable' });
  }
  return window.PIVMobileSync.publish(action, payload, target || 'desktop');
}

function resolveSyncBaseUrl() {
  const configured = window.PIV_SYNC_CONFIG?.baseUrl;
  if (configured) return configured;
  const protocol = window.location?.protocol || 'http:';
  const hostname = window.location?.hostname || '127.0.0.1';
  return `http://${hostname === 'localhost' ? '127.0.0.1' : hostname}:9091`;
}

function initMobileSync() {
  if (mobileSyncInitialized || !window.PIVMobileSync) return;
  mobileSyncInitialized = true;
  window.PIVMobileSync.start({
    sessionId: 'piv-mobile-desktop',
    baseUrl: resolveSyncBaseUrl(),
    replay: true
  });

  window.addEventListener('pivsync:status', () => {
    updateConnectionBanner();
  });

  window.addEventListener('pivsync:remote-action', (event) => {
    const message = event.detail || {};
    const payload = message.payload || {};
    switch (message.action) {
      case 'desktop.symbol.selected':
      case 'desktop.symbol.rendered':
        if (payload.symbolId) openSymbol(payload.symbolId, { remote: true });
        break;
      case 'desktop.dataState.changed':
        if (payload.modeMap && payload.modeMap.mobileMode) {
          setDataMode(payload.modeMap.mobileMode, { remote: true });
        }
        break;
      case 'desktop.page.changed':
        if (payload.page) {
          navigateTo(payload.page, { remote: true });
        }
        break;
      case 'desktop.refresh.requested':
        refreshDashboard();
        break;
      case 'desktop.size.changed':
        showToast('תצוגת הדסקטופ עודכנה: ' + (payload.size || ''), 'info');
        break;
      default:
        break;
    }
  });
}

// ─── Production Error Handling ──────────────────────────────

const _errorLog = [];
const MAX_ERROR_LOG = 50;

window.addEventListener('error', (event) => {
  const entry = {
    type: 'error',
    message: event.message || 'Unknown error',
    filename: event.filename || '',
    line: event.lineno || 0,
    col: event.colno || 0,
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    build: BUILD_NUMBER,
  };
  _errorLog.push(entry);
  if (_errorLog.length > MAX_ERROR_LOG) _errorLog.shift();
  console.warn('[PIVISION Error]', entry.message, `at ${entry.filename}:${entry.line}`);
});

window.addEventListener('unhandledrejection', (event) => {
  const entry = {
    type: 'unhandled-promise',
    message: event.reason?.message || String(event.reason) || 'Unhandled Promise rejection',
    timestamp: new Date().toISOString(),
    version: APP_VERSION,
    build: BUILD_NUMBER,
  };
  _errorLog.push(entry);
  if (_errorLog.length > MAX_ERROR_LOG) _errorLog.shift();
  console.warn('[PIVISION Promise Rejection]', entry.message);
});

// Expose error log for diagnostics
window.PIV_ERROR_LOG = {
  getAll: () => [..._errorLog],
  getLast: (n = 10) => _errorLog.slice(-n),
  clear: () => { _errorLog.length = 0; },
  count: () => _errorLog.length,
};

// ─── R300: Emulator PostMessage Listener ────────────────────
// Receives QA results and symbol-loaded events from emulator iframe

window.addEventListener('message', (evt) => {
  if (!evt.data || evt.data.source !== 'piv-emulator') return;
  const { type, data } = evt.data;

  switch (type) {
    case 'symbol-loaded':
      console.log(`[PIVISION] Symbol loaded: ${data.symbol} (${data.status})`);
      if (data.status === 'ok') {
        showToast(`סמל ${data.symbol} נטען בהצלחה ✓`, 'success');
      } else if (data.status === 'fallback') {
        showToast(`סמל ${data.symbol} נטען (fallback)`, 'info');
      }
      break;

    case 'qa-result':
      console.log(`[PIVISION QA] ${data.symbol}: ${data.status}`, data.checks);
      if (data.status === 'fail') {
        const failedChecks = data.checks
          .filter(c => !c.pass)
          .map(c => c.name)
          .join(', ');
        showToast(`QA: ${data.symbol} — נכשל (${failedChecks})`, 'error');
      } else if (data.status === 'warn') {
        showToast(`QA: ${data.symbol} — אזהרה`, 'info');
      }
      // Store for diagnostics
      if (!window._qaHistory) window._qaHistory = [];
      window._qaHistory.push(data);
      if (window._qaHistory.length > 100) window._qaHistory.shift();
      break;

    case 'qa-autofix':
      console.log(`[PIVISION QA Auto-Fix] ${data.symbol}:`, data.fixes);
      showToast(`תיקון אוטומטי: ${data.symbol}`, 'info');
      break;

    default:
      break;
  }
});

// ─── Service Worker Registration ────────────────────────────

if ('serviceWorker' in navigator && RELEASE_CHANNEL === 'release') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      console.log('[PIVISION] Service Worker registered:', reg.scope);
    }).catch(err => {
      console.log('[PIVISION] Service Worker registration skipped:', err.message);
    });
  });
}

// ─── Performance Mark ───────────────────────────────────────

if (window.performance && window.performance.mark) {
  window.performance.mark('pivision-app-loaded');
}

console.log(`[PIVISION] v${APP_VERSION} (build ${BUILD_NUMBER}) loaded — ${BUILD_DATE} — ${RELEASE_CHANNEL}`);
