# Phone Control APK — מדריך התקנה מקומי (Build C)

מדריך בנייה מאפס של APK חתום על המחשב שלך. הסקריפט עושה את כל העבודה — אתה רק צריך להתקין את הכלים פעם אחת.

---

## מה כלול

| קובץ | תפקיד |
|------|--------|
| `scripts/build-apk.sh` | סקריפט build אוטומטי ל-Linux/macOS |
| `scripts/build-apk.ps1` | סקריפט build אוטומטי ל-Windows PowerShell |
| `sprint-patches/kotlin/*.kt` | קוד אנדרואיד (Sprint 9+10) |
| `sprint-patches/ts/App.tsx` | קוד React Native משולב (WebView+Bridge+Listener) |
| `sprint-patches/manifest/AndroidManifest.xml` | Manifest מלא עם כל ההרשאות |
| `sprint-patches/gradle/app-build.gradle` | build.gradle עם signing config |
| `sprint-patches/scripts/merge-package-json.cjs` | מוסיף react-native-webview |

---

## דרישות מקדימות

### 1) Node.js 18+
- **macOS:** `brew install node`
- **Linux (Ubuntu):** `curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install nodejs`
- **Windows:** הורד מ-[nodejs.org](https://nodejs.org/) (LTS)
- בדיקה: `node -v` → צריך להחזיר v18.x.x ומעלה

### 2) JDK 17 (חובה ל-React Native 0.74)
- הורד מ-[Adoptium Temurin 17](https://adoptium.net/temurin/releases/?version=17)
- **macOS Homebrew:** `brew install --cask temurin@17`
- **Linux:** `sudo apt install openjdk-17-jdk`
- **Windows:** התקן את ה-MSI ובחר "Set JAVA_HOME"
- בדיקה: `java -version` → צריך להחזיר `openjdk version "17.x"`

### 3) Android Studio + SDK
1. הורד את [Android Studio](https://developer.android.com/studio) (גרסה Hedgehog ומעלה)
2. במהלך ההתקנה, אשר התקנת Android SDK
3. פתח Android Studio → SDK Manager → התקן:
   - **Android SDK Platform 34** (Android 14)
   - **Android SDK Build-Tools 34.0.0**
   - **Android SDK Platform-Tools** (adb)
   - **NDK 26.1.10909125** (תחת SDK Tools tab — סמן "Show Package Details")

### 4) משתני סביבה

#### macOS / Linux — הוסף ל-`~/.zshrc` או `~/.bashrc`:
```bash
export ANDROID_HOME=$HOME/Library/Android/sdk    # macOS
# export ANDROID_HOME=$HOME/Android/Sdk           # Linux
export PATH=$PATH:$ANDROID_HOME/emulator
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
```
ואז: `source ~/.zshrc` (או פתח טרמינל חדש)

#### Windows — דרך System Properties → Environment Variables:
- `ANDROID_HOME` = `C:\Users\<USER>\AppData\Local\Android\Sdk`
- `JAVA_HOME` = `C:\Program Files\Eclipse Adoptium\jdk-17.x.x-hotspot`
- הוסף ל-PATH: `%ANDROID_HOME%\platform-tools`, `%ANDROID_HOME%\emulator`

#### בדיקה סופית:
```bash
echo $ANDROID_HOME    # macOS/Linux
echo $env:ANDROID_HOME # Windows PowerShell
adb --version
```

---

## הרצת ה-build

### macOS / Linux
```bash
cd apk-build-kit
chmod +x scripts/build-apk.sh
./scripts/build-apk.sh
```

### Windows
```powershell
cd apk-build-kit
powershell -ExecutionPolicy Bypass -File .\scripts\build-apk.ps1
```

**זמן ראשון:** 10-15 דקות (כולל יצירת RN skeleton + npm install + gradle).  
**זמני build הבאים:** 2-3 דקות (רק `assembleRelease`).

### מה הסקריפט עושה (אוטומטי)
1. ✓ בודק שהכלים מותקנים (Node, JDK, Android SDK)
2. ✓ יוצר keystore חתימה (`phonecontrol-release.keystore`) — **פעם אחת בלבד**
3. ✓ יוצר RN skeleton (`npx @react-native-community/cli init PhoneControl`)
4. ✓ מזריק את כל קבצי Sprint 9+10 (Kotlin, TS, Manifest, gradle)
5. ✓ `npm install` (כולל react-native-webview)
6. ✓ `./gradlew assembleRelease`
7. ✓ מעתיק את ה-APK ל-`output/phonecontrol-latest.apk`

---

## תוצאה

```
apk-build-kit/
├── output/
│   ├── phonecontrol-20260531-153000.apk   ← מתויג בזמן
│   └── phonecontrol-latest.apk            ← תמיד האחרון
├── phonecontrol-release.keystore          ← *** שמור! לעדכון בעתיד ***
└── PhoneControl/                          ← פרויקט RN המלא
```

---

## התקנה בטלפון

### דרך 1: USB + ADB (מומלץ)
```bash
adb install -r output/phonecontrol-latest.apk
```

### דרך 2: העברה ידנית
1. העבר את ה-APK לטלפון (Bluetooth, Email, Drive)
2. בטלפון: הגדרות → אבטחה → אפשר התקנה ממקור לא ידוע
3. פתח את ה-APK והתקן
4. **פתח את האפליקציה** — תופיע מסך הגדרה:
   - **כתובת שרת:** `http://192.168.X.X:8080` (IP של המחשב עם server.js)
   - **Token:** התוכן של `.token` בפרויקט phone-control
5. אחרי "התחבר" — האפליקציה תבקש 2 הרשאות:
   - **Battery optimization exemption** — אישור
   - **POST_NOTIFICATIONS** — אישור (Android 13+)

### הרשאת Notification Listener (Sprint 10)
דורש אישור ידני (לא ניתן ב-runtime):
1. ב-WebView לחץ על כפתור "הפעל מאזין התראות" (אם יש)
2. או ידנית: הגדרות → הודעות → גישה להודעות → הפעל "Phone Control"
3. וודא: `PCNative.checkNotificationAccess()` בקונסול מחזיר `true`

---

## עדכון APK (גרסה חדשה)

1. עדכן את הקוד שלך (server.js, sprint patches וכו')
2. אם הוספת קבצים חדשים — תעדכן את `sprint-patches/` 
3. עדכן `versionCode` ב-`sprint-patches/gradle/app-build.gradle` (10 → 11)
4. הרץ שוב את הסקריפט — הוא ידלג על שלבים שכבר נעשו (skeleton, keystore)
5. התקן: `adb install -r output/phonecontrol-latest.apk`

**חשוב:** ה-keystore נשאר אותו → ההתקנה תהיה upgrade ולא נדרשת הסרה.

---

## Smoke tests אחרי התקנה

```bash
# 1. ה-app רץ
adb shell pm list packages | grep phonecontrol
# צפוי: package:com.phonecontrol

# 2. ה-services פעילים
adb shell dumpsys activity services | grep -E "BridgeService|PCNotification"
# צפוי: 2 services in running state

# 3. WebView מתחבר לשרת
adb logcat -s ReactNativeJS:V | grep -i "BridgeService started"

# 4. בדיקת notification listener
adb shell dumpsys notification | grep -A2 "PCNotificationListener"
# צפוי: "Connected: true" אחרי שאישרת ב-Settings

# 5. בדיקת loopback (שלח התראה מזוייפת)
# בקונסול JS של ה-WebView:
# BridgeService.forwardNotification({app:'com.test',title:'test',body:'x',ts:Date.now(),id:1})
# → אמור להופיע בלוג events.jsonl של השרת
```

---

## Troubleshooting

| תופעה | פתרון |
|--------|--------|
| `SDK location not found` | הגדר `ANDROID_HOME` במשתני סביבה |
| `Could not find tools.jar` | Java 17 — וודא `JAVA_HOME` מצביע נכון |
| `NDK not found` | Android Studio → SDK Manager → SDK Tools → סמן NDK |
| `gradlew: Permission denied` | `chmod +x android/gradlew` |
| `Execution failed for task ':app:bundleReleaseJsAndAssets'` | מחק `node_modules` והרץ `npm install` מחדש |
| Build נופל ב-Hermes | בדוק ש-`hermesEnabled=true` ב-`android/gradle.properties` |
| `INSTALL_FAILED_UPDATE_INCOMPATIBLE` | חתימה שונה — הסר את האפליקציה ידנית ואז התקן |
| `Default activity not found` | וודא ש-`MainActivity` קיים ב-Manifest עם `LAUNCHER` category |
| APK נבנה אבל נופל בהפעלה | `adb logcat | grep -i fatal` — לרוב חסר WebView או async-storage |
| הרשאת Notification Listener מאופסת אחרי restart | תופעת Android — בקש מהמשתמש לאשר שוב |

---

## אבטחה ופרודקשן

### לפני הפצה אמיתית:
1. **שנה את סיסמת ה-keystore** ב-`build-apk.sh` (לא `phonecontrol-dev`)
2. **שמור את ה-keystore בכספת** — אובדן = אי-יכולת לעדכן
3. **enableProguardInReleaseBuilds = true** ב-build.gradle (חוסך ~30% גודל)
4. **שקול signing v3** (ל-Android 11+ key rotation)

### Backup של keystore
```bash
# העתק למיקום בטוח (USB, cloud מוצפן)
cp apk-build-kit/phonecontrol-release.keystore ~/backup/
gpg -c ~/backup/phonecontrol-release.keystore   # הצפנה
```

---

## מה הלאה

- **רוצה debug build?** הרץ `cd PhoneControl/android && ./gradlew assembleDebug` (לא צריך keystore)
- **רוצה לטעון על מספר מכשירים?** `adb devices` ואז `adb -s <serial> install -r ...`
- **רוצה לעקוב אחרי לוגים בזמן אמת?** `adb logcat -s ReactNativeJS:V BridgeService:V PCNotificationListener:V`
- **רוצה להעלות ל-Play Store?** תצטרך AAB (`./gradlew bundleRelease`) ו-Google Play Console account

---

**גרסה:** Build Kit v1 · **תאימות:** RN 0.74.5, Android 7-15 (API 24-35), Kotlin 1.9
