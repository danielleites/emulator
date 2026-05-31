# Phone Control — חבילה מלאה (כל הפרויקט)

ZIP אחד שמכיל את כל מה שצריך כדי להריץ את המערכת מאפס: שרת + UI + כל ה-sprints 1-10 + ערכת בנייה של APK לאנדרואיד.

---

## מה יש בחבילה

```
full-bundle/
├── README-START-HERE.md           ← אתה כאן
├── phone-control-server/          ← השרת המלא (Node.js) עם כל Sprint 1-10
│   ├── server.js                  (7,085 שורות — מאוחד)
│   ├── package.json
│   ├── public/                    (UI: index.html, command-center.js, ...)
│   ├── modules/                   (Sprint 5-8: timeline, bridge-monitor, ...)
│   ├── timeline/                  (Sprint 6)
│   ├── command-center/            (Sprint 7)
│   ├── bridge-monitor/            (Sprint 8)
│   ├── system-telemetry/          (Sprint 5)
│   ├── stocks/                    (sub-feature)
│   ├── desktop/                   (PowerShell scripts ל-Windows)
│   ├── tests/                     (80+ logic tests)
│   ├── scripts/                   (CLI utilities)
│   ├── state.db                   (SQLite — נקי)
│   ├── HANDOFF.md                 (תיעוד פיתוח)
│   └── README.md                  (תיעוד שרת)
│
├── apk-build-kit/                 ← ערכת בניית APK לאנדרואיד
│   ├── INSTALL.md                 (מדריך מלא להתקנת כלים + build)
│   ├── scripts/
│   │   ├── build-apk.sh           (macOS/Linux — אחד-לחיצה build)
│   │   └── build-apk.ps1          (Windows)
│   └── sprint-patches/            (Kotlin, TS, Manifest שמוזרק ל-RN skeleton)
│       ├── kotlin/                (5 קבצי Android: BridgeService, NotificationListener, ...)
│       ├── manifest/              (AndroidManifest.xml)
│       ├── gradle/                (build.gradle עם signing)
│       ├── ts/                    (App.tsx + BridgeService.ts)
│       └── scripts/               (merge-package-json.js)
│
└── sprint-patches-source/         ← מקור של ה-patches (אופציונלי, לתיעוד)
    ├── sprint9/                   (Foreground Service — APK foundation)
    └── sprint10/                  (Notification Listener)
```

---

## התחלה מהירה — 3 דרכים

### דרך 1: רק להריץ את השרת (5 דקות)

מה צריך: Node.js 18+ מותקן על המחשב.

```bash
cd phone-control-server
npm install        # 2-3 דקות
node server.js     # השרת עולה על http://localhost:8080
```

פתח דפדפן ב-`http://localhost:8080` — צריך לראות את ה-Command Center.

ה-token נמצא בקובץ `.token` (תקבל אותו אוטומטית בהפעלה הראשונה).

### דרך 2: רק לבנות APK (10-15 דק' פעם ראשונה)

מה צריך: Node.js 18+, JDK 17, Android Studio + SDK 34 (ראה `apk-build-kit/INSTALL.md` להוראות התקנה מלאות).

```bash
cd apk-build-kit
./scripts/build-apk.sh    # macOS/Linux
# או:
.\scripts\build-apk.ps1   # Windows
```

ה-APK יישמר ב-`apk-build-kit/output/phonecontrol-latest.apk`.

### דרך 3: לפרוס את הכל מקצה לקצה

1. **שרת:** הרץ את phone-control-server על מחשב שירוץ תמיד (Windows desktop, Raspberry Pi, VPS)
2. **APK:** בנה אותו על מחשב פיתוח, התקן בטלפון
3. **חיבור:** באפליקציה הזן את כתובת השרת + ה-token, ואשר את ההרשאות

---

## מה יש בכל Sprint

| Sprint | שם | תכלית | קבצים |
|--------|----|------|--------|
| 1-4 | בסיס | SSE push, screenshot, file picker, AI chat | server.js, public/app.js |
| 5 | System Telemetry | מטריקות מערכת (CPU, RAM, disk, batt) | system-telemetry/ |
| 6 | Timeline | אירועים בזמן אמת + FTS5 search + hash chain | timeline/ |
| 7 | Command Center UX | dashboard מאוחד עם metrics, tabs, push controls | command-center/, public/command-center.js |
| 8 | Bridge Monitor | health-check רציף של חיבור הטלפון | bridge-monitor/ |
| 9 | Android Foreground Service | APK רץ ברקע עם persistent connection | apk-build-kit/sprint-patches/kotlin/BridgeService.kt |
| 10 | Notification Listener | מאזין התראות → classify עם Haiku → timeline | apk-build-kit/sprint-patches/kotlin/PCNotificationListenerService.kt |

---

## מה כבר התקתקתם בפנים (ויש לכם בידיים)

### Pre-Sprint-10 fixes (כבר מוטמעים ב-server.js)
- ✅ Sprint 5-8 mount order תקין (5 → 8 → 6 → 7) בשורות 2044-2159
- ✅ `/api/metrics` endpoint עם checkAuth
- ✅ Graceful shutdown handler
- ✅ Boot log ללא token חשוף
- ✅ 0 endpoint conflicts (נבדק)
- ✅ 80/80 logic tests passing
- ✅ Synergy מוכח: ping טלפון → events.jsonl → timeline UI

### Sprint 10 — Notification Listener (חדש)
- ✅ PCNotificationListenerService עם dedup 3 שניות
- ✅ סינון: own app, ongoing, group summary, system packages
- ✅ Broadcast → BridgeService → RN EventEmitter → WebView → POST `/api/notifications/inbound`
- ✅ Haiku classify (כבר קיים בשרת)
- ✅ 39/39 logic tests passing

---

## דרישות מערכת

### לשרת
- Node.js 18+
- 200MB RAM פנוי
- 100MB דיסק (ללא events.jsonl שגדל עם הזמן)
- אופציונלי: Claude Code CLI (`claude` בנתיב) לאינטגרציית Haiku

### ל-APK build
- Node.js 18+
- JDK 17 (Adoptium Temurin מומלץ)
- Android Studio + SDK 34 + Build-Tools 34.0.0 + NDK 26.1
- ~5GB דיסק פנוי (RN + Gradle cache)
- חיבור אינטרנט בפעם הראשונה (Gradle dependencies)

### לטלפון
- Android 7+ (API 24+)
- ~50MB דיסק
- הרשאת Notification Access (ידנית בהגדרות)
- מומלץ: Battery optimization exemption

---

## גרסאות

- **שרת:** 1.10 (Sprint 10 applied)
- **APK:** versionCode 10, versionName "1.0.10"
- **תאימות:** Android 7-15

---

## תיעוד נוסף

| קובץ | תוכן |
|------|------|
| `phone-control-server/README.md` | תיעוד השרת |
| `phone-control-server/HANDOFF.md` | תיעוד פיתוח מלא + ארכיטקטורה |
| `apk-build-kit/INSTALL.md` | מדריך מקיף לבניית APK + troubleshooting |
| `sprint-patches-source/sprint10/INSTALL.md` | תיעוד מפורט של Sprint 10 |

---

## אם משהו לא עובד

1. **השרת לא עולה** → `cd phone-control-server && npm install` ובדוק `node -v` (חייב 18+)
2. **APK build נכשל** → קרא את `apk-build-kit/INSTALL.md` section "Troubleshooting" (11 בעיות נפוצות)
3. **APK רץ אבל לא מתחבר** → וודא שהטלפון והמחשב באותה רשת WiFi + כתובת ה-IP נכונה
4. **התראות לא מגיעות** → בדוק שאישרת Notification Access ב-Settings → Notifications → Special access

---

**בנוי במאי 2026 · 10 sprints · 7,085 שורות שרת · 22 קבצי Build Kit**
