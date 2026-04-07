/**
 * versioning.js — גרסאות, changelog ו-"מה חדש?"
 *
 * מייצא:
 *  - APP_VERSION, BUILD_DATE, CHANGELOG
 *  - initVersioning() — מציג גרסה בפוטר ומאזין לכפתור "מה חדש?"
 */

'use strict';

// ─── נתוני גרסה ──────────────────────────────────────────────────

export const APP_VERSION = '4.2.0-R300';
export const BUILD_DATE  = '2026-04-05';

// Global version for non-module scripts
window.PIV_VERSION = '4.2.0';

/**
 * רשימת שינויים — גרסאות בסדר יורד
 * @type {Array<{version: string, date: string, entries: string[]}>}
 */
export const CHANGELOG = [
  {
    version: '3.0.0',
    date:    '2026-03-20',
    entries: [
      'Real-Time Collaboration — שיתוף פעולה בזמן אמת בין משתמשים',
      'WebSocket server — חדרים, נוכחות, פעילות, נעילת סמלים',
      'Presence Bar — אווטרים צבעוניים של משתמשים מחוברים',
      'מערכת הערות — הערות על סמלים, תגובות, פתרון',
      'צ׳אט צוותי + Activity Feed חי עם @mention',
      'PI Web API Plugin — חיבור ישיר לשרת PI אמיתי',
      'מעבר אוטומטי בין Demo ל-Live עם fallback',
      'Tag Browser חי — חיפוש, עץ AF, גרירת תגים לסמלים',
      'Real-Time Data Subscriptions — עדכון נתונים חיים',
      'עורך ויזואלי לסמלים — WYSIWYG מלא עם 29 רכיבים',
      'Canvas Editor — גרירה, שינוי גודל, יישור, Grid, Zoom',
      'Component Library — גרפים, מדדים, טקסט, צורות, טבלאות, פקדים',
      'Properties Panel — עריכת מאפיינים, data binding, ספים',
      'Export Wizard — ייצור קוד PI Vision תקני (HTML/JS/CSS)',
      '5 תבניות מוכנות — Dashboard, KPI, Multi-Chart, Events, Power Plant',
      'Undo/Redo, Copy/Paste, Alignment, Z-order — עריכה מקצועית',
    ],
  },
  {
    version: '2.4.0',
    date:    '2026-03-20',
    entries: [
      'סוכן AI אוטונומי עם Claude API — 4 כלים: סריקה, תיקון, יצירה, אופטימיזציה',
      'מנוע משימות (Task Queue) — הרצת משימות, מעקב תקדמות, תוצאות מפורטות',
      'פאנל סוכן באפליקציה — לוח משימות, פעולות מהירות, תצוגת תוצאות',
      'סריקת QA רוחבית לכל 63 הסמלים בלחיצת כפתור',
      'תיקון קוד אוטומטי — הסוכן מזהה בעיות ומתקן עם גיבוי',
      'יצירת סמלים חדשים — Claude מייצר HTML/JS/CSS מתבנית PI Vision',
      'אופטימיזציה אוטומטית — ביצועים, גודל, נגישות',
      'מצב אוטונומי — Claude מחליט איזה כלים להפעיל ומתי (עד 5 איטרציות)',
      'סוכן Desktop עצמאי — תוכנית Python/Tkinter עם ממשק מלא',
      'סוכן Desktop: סריקה אוטומטית, דוחות HTML, סנכרון עם שרת',
    ],
  },
  {
    version: '2.3.0',
    date:    '2026-03-20',
    entries: [
      'אבטחה: Rate Limiting (30 בקשות/דקה), סניטיזציית HTML, Pydantic validation, CORS מוגבל',
      'ביצועים: Virtual Scrolling בפלטת פקודות, Debounce חיפוש, Web Worker לניתוח QA',
      'ביצועים: Lazy Loading דינמי של מודולים כבדים',
      'UX: גרירת קבצים (Drag & Drop) לבדיקת QA',
      'UX: תצוגת Diff חזותית לשינויי קוד (Before/After)',
      'UX: מערכת מועדפים לסמלים (Favorites)',
      'UX: היסטוריית ניווט (Back/Forward) עם Ctrl+[/]',
      'UX: Toast הצלחה בנוסף לשגיאות + Stacking',
      'UX: Browser Notifications לשגיאות קריטיות ברקע',
      'AI: כפתור "החל תיקון" אוטומטי מתוך תשובות AI',
      'AI: הקשר מורחב — שליחת תוצאות QA, סטטוס iframe, גרסה',
      'AI: ספריית Prompt Templates מורחבת (10 פקודות)',
      'AI: תמיכה ב-4 שיחות מקבילות (Multi-Chat Tabs)',
      'תשתית: PWA מלא עם manifest.json והתקנה על Desktop/Mobile',
      'תשתית: Health Dashboard endpoint לניטור שרת',
      'תשתית: Bundle Size Monitor + Playwright test suite',
      'נגישות: ARIA מלא, Focus Management, Skip-to-Content',
      'נגישות: High Contrast + Reduced Motion support',
      'i18n: תמיכה בעברית + אנגלית עם מעבר דינמי',
      'Windows Agent: תהליך רקע לסריקת QA אוטומטית של סמלים',
      'Windows Agent: System Tray, File Watcher, API Bridge',
    ],
  },
  {
    version: '2.2.0',
    date:    '2026-03-20',
    entries: [
      'עוזר AI משופר — שליחת קוד סימבול לניתוח, retry אוטומטי, היסטוריית שיחה מתמשכת',
      'כפתור העתקת קוד בתשובות AI + ייצוא שיחה לקובץ טקסט',
      'חיפוש גלובלי (Ctrl+K) — Command Palette למצבים, סמלים ופקודות',
      'מסך טעינה אנימטיבי בכל כניסה למצב',
      'Breadcrumbs בסרגל העליון עם שם הסמל הנוכחי',
      'סטטיסטיקות QA בלוח הבקרה הראשי',
      'סיור הדרכה למשתמש חדש (Onboarding)',
      'Error Boundary — טיפול חכם בשגיאות עם הודעה ידידותית',
      'מטמון iframes — מעבר מהיר בין מצבים ללא טעינה מחדש',
      'אנימציות מעבר חלקות בין מצבים',
      'Service Worker חכם — stale-while-revalidate, cache versioning',
      'אנימציית pulse ב-AI כשיש שגיאה + tooltip סטטוס',
      'ניהול זיכרון Sessions בשרת עם TTL אוטומטי',
    ],
  },
  {
    version: '2.1.0',
    date:    '2026-03-20',
    entries: [
      'עוזר AI — צ׳אט צף עם streaming, ניתוח תקלות אוטומטי',
      'התראות QA → AI — זיהוי שגיאה ושליחה אוטומטית לעוזר',
      'פעולות מהירות: בדוק סימבול, סיכום QA, טיפים לביצועים',
    ],
  },
  {
    version: '2.0.0',
    date:    '2026-03-20',
    entries: [
      'מעבר בין ערכת נושא כהה/בהיר — נשמרת בין סשנים',
      'שחזור סשן אחרון עם toast הצעת שחזור',
      'קיצורי מקלדת: Ctrl+1/2/3/4, Ctrl+R, Escape, Ctrl+Shift+T/K',
      'דיאלוג קיצורי מקלדת מלא (Ctrl+Shift+K)',
      'התראות toast לשגיאות במצב אמולטור + QA',
      'תמיכה מלאה במסכי מובייל וטאבלט (RTL)',
      'תפריט המבורגר בסרגל הכלים במסכים קטנים',
      'Service Worker — טעינה מהירה ותמיכה מצב offline',
      'סנכרון ערכת נושא ל-iframes פעילים',
      'מערכת versioning עם changelog מובנה',
    ],
  },
  {
    version: '1.5.0',
    date:    '2025-12-01',
    entries: [
      'אמולטור PI Vision עם 63 סמלים מותאמים',
      'כלי QA אוטומטי — ניתוח קוד, Runtime, בדיקות ידניות',
      'דפדפן AF עם 853 אלמנטים ו-8,656 מאפיינים',
      'מצב משולב — QA ברקע עם לכידת שגיאות דינמית (F10)',
    ],
  },
  {
    version: '1.0.0',
    date:    '2025-09-15',
    entries: [
      'השקה ראשונית של חבילת PI Vision המאוחדת',
      'לוח בקרה עם 4 מצבי עבודה',
      'ממשק עברית RTL מלא',
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════
// בדיקת עדכונים (mock)
// ═══════════════════════════════════════════════════════════════════

/**
 * בדיקה אם יש גרסה חדשה יותר.
 * כאן השוואה פשוטה — בעולם אמיתי קוראים מ-endpoint.
 * @param {string} currentVersion - גרסה נוכחית
 * @returns {boolean}
 */
function _isNewerAvailable(currentVersion) {
  // Mock: תמיד מחזיר false — אין גרסה חדשה מהנוכחית
  // להחלפה: const remote = await fetch('/version.json').then(r => r.json());
  return false;
}

// ═══════════════════════════════════════════════════════════════════
// UI — הצגת גרסה בפוטר
// ═══════════════════════════════════════════════════════════════════

function _renderVersionArea() {
  const area = document.getElementById('version-info-area');
  if (!area) return;

  const hasUpdate = _isNewerAvailable(APP_VERSION);

  area.innerHTML = `
    <span class="version-badge">
      <span class="version-dot"></span>
      v${APP_VERSION}
    </span>
    <span class="version-badge">${BUILD_DATE}</span>
    ${hasUpdate ? `<span class="version-badge" style="border-color: rgba(255,186,0,0.4); color: #ffba00;">עדכון זמין!</span>` : ''}
    <button class="btn-whats-new" id="btn-whats-new">מה חדש? ✨</button>`;

  document.getElementById('btn-whats-new')?.addEventListener('click', _showChangelogModal);
}

// ═══════════════════════════════════════════════════════════════════
// UI — modal "מה חדש?"
// ═══════════════════════════════════════════════════════════════════

function _showChangelogModal() {
  if (document.getElementById('whats-new-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id        = 'whats-new-overlay';
  overlay.className = 'whats-new-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'מה חדש?');

  const versionsHTML = CHANGELOG.map((release) => {
    const items = release.entries.map(e => `<li>${e}</li>`).join('');
    return `
      <div class="changelog-version">
        <div>
          <span class="changelog-version-tag">v${release.version}</span>
          <span class="changelog-date">${release.date}</span>
        </div>
        <ul class="changelog-list">${items}</ul>
      </div>`;
  }).join('');

  overlay.innerHTML = `
    <div class="whats-new-dialog">
      <div class="whats-new-header">
        <h2>מה חדש בגרסה ${APP_VERSION}? ✨</h2>
        <button class="whats-new-close" aria-label="סגור" id="whats-new-close">✕</button>
      </div>
      <div class="whats-new-body">
        ${versionsHTML}
      </div>
    </div>`;

  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  document.getElementById('whats-new-close').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
}

// ═══════════════════════════════════════════════════════════════════
// initVersioning — אתחול מודול
// ═══════════════════════════════════════════════════════════════════

export function initVersioning() {
  // המתן ל-DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _renderVersionArea);
  } else {
    _renderVersionArea();
  }
}

export default initVersioning;
