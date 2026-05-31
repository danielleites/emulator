#!/usr/bin/env bash
# ============================================================================
# Phone Control — Build APK Script (Linux / macOS)
# ============================================================================
# סקריפט אחד שעושה הכל:
#  1. בדיקת prerequisites (Node, JDK, Android SDK)
#  2. יצירת keystore חתימה (פעם אחת)
#  3. יצירת skeleton של React Native (אם לא קיים)
#  4. הזרקת קבצי Sprint 9 + 10 (Kotlin, TypeScript, Manifest)
#  5. npm install
#  6. gradlew assembleRelease → APK חתום
#  7. העתקת ה-APK ל-./output/
# ============================================================================

set -e  # break on error

# ===== הגדרות (אפשר לעדכן) =====
PROJECT_NAME="PhoneControl"
PACKAGE_NAME="com.phonecontrol"
APP_DISPLAY_NAME="Phone Control"
RN_VERSION="0.74.5"

# Keystore — פעם אחת בלבד! שמור אותו!
KEYSTORE_PASSWORD="phonecontrol-dev"  # שנה לפרודקשן!
KEY_ALIAS="phonecontrol-key"
KEY_PASSWORD="phonecontrol-dev"

# נתיבים
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROJECT_DIR="$KIT_DIR/$PROJECT_NAME"
OUTPUT_DIR="$KIT_DIR/output"
SPRINT_PATCHES_DIR="$KIT_DIR/sprint-patches"

# צבעים
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log()  { echo -e "${BLUE}[$(date +%H:%M:%S)]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}⚠${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; }

# ============================================================================
# שלב 1: בדיקת prerequisites
# ============================================================================
check_prerequisites() {
  log "בודק prerequisites..."
  local missing=0

  # Node.js >= 18
  if ! command -v node &> /dev/null; then
    err "Node.js לא מותקן. התקן מ-https://nodejs.org/ (גרסה 18+)"
    missing=1
  else
    local node_version=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$node_version" -lt 18 ]; then
      err "Node.js גרסה $node_version — נדרש 18+"
      missing=1
    else
      ok "Node.js $(node -v)"
    fi
  fi

  # npm
  if ! command -v npm &> /dev/null; then
    err "npm לא נמצא"
    missing=1
  else
    ok "npm $(npm -v)"
  fi

  # Java JDK 17 (RN 0.74 דורש 17)
  if ! command -v java &> /dev/null; then
    err "Java לא מותקן. התקן JDK 17 מ-https://adoptium.net/"
    missing=1
  else
    local java_version=$(java -version 2>&1 | head -1 | awk -F '"' '{print $2}' | cut -d. -f1)
    if [ "$java_version" -lt 17 ]; then
      err "Java גרסה $java_version — נדרש JDK 17 (RN 0.74)"
      missing=1
    else
      ok "Java $(java -version 2>&1 | head -1 | awk -F '"' '{print $2}')"
    fi
  fi

  # Android SDK
  if [ -z "$ANDROID_HOME" ] && [ -z "$ANDROID_SDK_ROOT" ]; then
    err "ANDROID_HOME לא מוגדר. התקן Android Studio או command-line tools"
    err "  https://developer.android.com/studio#command-tools"
    missing=1
  else
    local sdk_dir="${ANDROID_HOME:-$ANDROID_SDK_ROOT}"
    ok "Android SDK: $sdk_dir"
    if [ ! -d "$sdk_dir/platforms" ]; then
      warn "אין platforms בתוך $sdk_dir/platforms — נסה: sdkmanager 'platforms;android-34'"
    fi
  fi

  if [ $missing -eq 1 ]; then
    err "חסרים prerequisites. ראה הוראות ב-INSTALL-MANUAL.md"
    exit 1
  fi
  ok "כל הדרישות מותקנות"
}

# ============================================================================
# שלב 2: keystore
# ============================================================================
create_keystore() {
  local keystore_path="$KIT_DIR/phonecontrol-release.keystore"
  if [ -f "$keystore_path" ]; then
    ok "keystore קיים: $keystore_path (לא נוצר חדש)"
    return
  fi
  log "יוצר keystore חדש..."
  keytool -genkeypair -v \
    -keystore "$keystore_path" \
    -alias "$KEY_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KEYSTORE_PASSWORD" \
    -keypass "$KEY_PASSWORD" \
    -dname "CN=PhoneControl,OU=Dev,O=Self,L=TelAviv,ST=TA,C=IL"
  ok "keystore נוצר: $keystore_path"
  warn "*** שמור את הקובץ הזה! בלעדיו לא תוכל לעדכן את האפליקציה ***"
}

# ============================================================================
# שלב 3: יצירת React Native skeleton
# ============================================================================
create_rn_skeleton() {
  if [ -d "$PROJECT_DIR" ]; then
    ok "פרויקט RN קיים: $PROJECT_DIR (לא נוצר מחדש)"
    return
  fi
  log "יוצר פרויקט RN חדש (זה ייקח 2-5 דקות)..."
  cd "$KIT_DIR"
  npx --yes @react-native-community/cli@13.6.9 init "$PROJECT_NAME" \
    --version "$RN_VERSION" \
    --skip-install \
    --package-name "$PACKAGE_NAME" 2>&1 | tail -20
  if [ ! -d "$PROJECT_DIR" ]; then
    err "יצירת RN skeleton נכשלה"
    exit 1
  fi
  ok "RN skeleton נוצר ב-$PROJECT_DIR"
}

# ============================================================================
# שלב 4: הזרקת קבצי Sprint
# ============================================================================
inject_sprint_files() {
  log "מזריק קבצי Sprint 9+10 + WebView wiring..."
  
  # קוד Kotlin
  mkdir -p "$PROJECT_DIR/android/app/src/main/java/com/phonecontrol"
  cp "$SPRINT_PATCHES_DIR/kotlin/"*.kt "$PROJECT_DIR/android/app/src/main/java/com/phonecontrol/"
  ok "Kotlin files copied"

  # AndroidManifest
  cp "$SPRINT_PATCHES_DIR/manifest/AndroidManifest.xml" "$PROJECT_DIR/android/app/src/main/AndroidManifest.xml"
  ok "AndroidManifest.xml replaced"

  # MainApplication.kt — רישום ה-package
  cp "$SPRINT_PATCHES_DIR/kotlin/MainApplication.kt" "$PROJECT_DIR/android/app/src/main/java/com/phonecontrol/MainApplication.kt"
  ok "MainApplication.kt replaced"

  # build.gradle ל-signing
  cp "$SPRINT_PATCHES_DIR/gradle/app-build.gradle" "$PROJECT_DIR/android/app/build.gradle"
  ok "android/app/build.gradle replaced (with signing config)"

  # gradle.properties — keystore credentials
  cat >> "$PROJECT_DIR/android/gradle.properties" <<EOF

# === Phone Control signing ===
MYAPP_RELEASE_STORE_FILE=phonecontrol-release.keystore
MYAPP_RELEASE_KEY_ALIAS=$KEY_ALIAS
MYAPP_RELEASE_STORE_PASSWORD=$KEYSTORE_PASSWORD
MYAPP_RELEASE_KEY_PASSWORD=$KEY_PASSWORD
EOF
  ok "gradle.properties updated"

  # העתקת ה-keystore לתיקיית android/app/
  cp "$KIT_DIR/phonecontrol-release.keystore" "$PROJECT_DIR/android/app/phonecontrol-release.keystore"
  ok "keystore copied to android/app/"

  # TypeScript
  mkdir -p "$PROJECT_DIR/src/native"
  cp "$SPRINT_PATCHES_DIR/ts/BridgeService.ts" "$PROJECT_DIR/src/native/BridgeService.ts"
  cp "$SPRINT_PATCHES_DIR/ts/App.tsx" "$PROJECT_DIR/App.tsx"
  ok "TypeScript files copied"

  # package.json — תלויות נוספות
  cd "$PROJECT_DIR"
  node "$SPRINT_PATCHES_DIR/scripts/merge-package-json.js"
  ok "package.json updated with react-native-webview"
}

# ============================================================================
# שלב 5: npm install
# ============================================================================
install_deps() {
  log "מתקין תלויות npm (יכול לקחת 3-5 דקות)..."
  cd "$PROJECT_DIR"
  npm install --legacy-peer-deps 2>&1 | tail -10
  ok "npm install הושלם"
}

# ============================================================================
# שלב 6: build APK
# ============================================================================
build_apk() {
  log "בונה APK release..."
  cd "$PROJECT_DIR/android"
  chmod +x ./gradlew
  ./gradlew clean assembleRelease --no-daemon 2>&1 | tail -30
  
  local apk_path="$PROJECT_DIR/android/app/build/outputs/apk/release/app-release.apk"
  if [ ! -f "$apk_path" ]; then
    err "Build נכשל — APK לא נמצא ב-$apk_path"
    exit 1
  fi
  ok "APK נבנה בהצלחה"
  
  # העתקה ל-output
  mkdir -p "$OUTPUT_DIR"
  local final_apk="$OUTPUT_DIR/phonecontrol-$(date +%Y%m%d-%H%M%S).apk"
  cp "$apk_path" "$final_apk"
  cp "$apk_path" "$OUTPUT_DIR/phonecontrol-latest.apk"
  
  local size=$(du -h "$final_apk" | cut -f1)
  ok "APK מוכן: $final_apk ($size)"
  ok "Latest: $OUTPUT_DIR/phonecontrol-latest.apk"
}

# ============================================================================
# main
# ============================================================================
main() {
  echo ""
  echo "╔════════════════════════════════════════════╗"
  echo "║   Phone Control — APK Build Pipeline      ║"
  echo "╚════════════════════════════════════════════╝"
  echo ""
  
  check_prerequisites
  create_keystore
  create_rn_skeleton
  inject_sprint_files
  install_deps
  build_apk
  
  echo ""
  echo "╔════════════════════════════════════════════╗"
  echo "║              ✓ BUILD SUCCESSFUL            ║"
  echo "╚════════════════════════════════════════════╝"
  echo ""
  echo "התקנה בטלפון:"
  echo "  1. העבר את $OUTPUT_DIR/phonecontrol-latest.apk לטלפון"
  echo "  2. הפעל את ה-APK והרשה התקנה ממקור לא ידוע"
  echo "  3. תן הרשאת notification access (Sprint 10)"
  echo "  4. תן הרשאת battery optimization exemption (Sprint 9)"
  echo ""
}

main "$@"
