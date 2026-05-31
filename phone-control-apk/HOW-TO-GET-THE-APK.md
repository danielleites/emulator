# איך מקבלים את ה-APK של Phone Control

יש שתי דרכים לקבל קובץ APK חתום. הדרך הראשונה (ענן) לא דורשת להתקין כלום על המחשב.

---

## דרך 1 (מומלצת) — בנייה בענן עם GitHub Actions

ה-repo כולל workflow שבונה את ה-APK אוטומטית על שרתי GitHub (שם יש Android SDK
וגישת אינטרנט מלאה), ומעלה את ה-APK המוכן כקובץ להורדה.

1. היכנס ל-GitHub → לשונית **Actions** של ה-repo.
2. בחר את ה-workflow **"Build Phone Control APK"** מהרשימה משמאל.
3. לחץ **Run workflow** → בחר את ה-branch → **Run workflow**.
4. חכה ~10–15 דקות (הריצה הראשונה כוללת יצירת skeleton + הורדת תלויות).
5. כשהריצה הופכת ירוקה ✓ — היכנס אליה, גלול ל-**Artifacts** למטה, והורד את
   `phonecontrol-apk`. בתוך ה-zip יש `phonecontrol-latest.apk`.

ה-workflow גם רץ אוטומטית בכל push שמשנה משהו תחת `phone-control-apk/`.

### התקנה בטלפון
1. העבר את ה-APK לטלפון (Drive / מייל / USB).
2. הגדרות → אבטחה → אפשר התקנה ממקור לא ידוע.
3. פתח את ה-APK והתקן.
4. במסך ההגדרה הזן **כתובת שרת** (`http://<IP-של-המחשב>:8080`) ואת ה-**Token**
   (התוכן של `.token` בשרת phone-control).
5. אשר את ההרשאות: Battery optimization, POST_NOTIFICATIONS, ו-Notification Access
   (ידנית: הגדרות → הודעות → גישה להודעות → הפעל "Phone Control").

---

## דרך 2 — בנייה מקומית על המחשב שלך

דורש Node 18+, JDK 17, ו-Android Studio + SDK 34. ההוראות המלאות נמצאות ב-
[`apk-build-kit/INSTALL.md`](apk-build-kit/INSTALL.md). בקצרה:

```bash
cd phone-control-apk/apk-build-kit
chmod +x scripts/build-apk.sh
./scripts/build-apk.sh          # macOS / Linux
# או ב-Windows:
# powershell -ExecutionPolicy Bypass -File .\scripts\build-apk.ps1
```

ה-APK יישמר ב-`apk-build-kit/output/phonecontrol-latest.apk`.

---

## הערות חשובות

- **למה לא בניתי את ה-APK ישירות פה?** סביבת הריצה הזו חוסמת את שרתי Google
  (`maven.google.com` / `dl.google.com`), שמהם בנייה של אנדרואיד חייבת להוריד את
  ה-Android SDK ואת תלויות AndroidX / React-Native. לכן הבנייה מתבצעת ב-GitHub
  Actions, שם החיבור ל-Google פתוח.
- **keystore / חתימה:** הסקריפט יוצר keystore חדש (`phonecontrol-dev` כסיסמה).
  ב-CI נוצר keystore חדש בכל ריצה, כך שכל build חתום במפתח אחר — מתאים לשימוש אישי.
  אם תרצה לעדכן את האפליקציה תוך שמירה על אותה חתימה (install-over במקום הסרה),
  שמור keystore קבוע (למשל כ-GitHub Secret) והזרק אותו ל-build. לפרודקשן — שנה את
  סיסמת ה-keystore.
- שיניתי שורה אחת בלבד ב-`build-apk.sh`: קיבעתי את גרסת ה-CLI של React Native
  ל-`@react-native-community/cli@13.6.9` (במקום `@latest`) כדי שהבנייה תהיה
  יציבה ותואמת ל-RN 0.74.5 גם בעתיד.
