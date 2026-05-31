# ============================================================================
# Phone Control — Build APK Script (Windows PowerShell)
# ============================================================================
# הרצה: powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
# ============================================================================

$ErrorActionPreference = "Stop"

# ===== הגדרות =====
$PROJECT_NAME = "PhoneControl"
$PACKAGE_NAME = "com.phonecontrol"
$RN_VERSION = "0.74.5"
$KEYSTORE_PASSWORD = "phonecontrol-dev"
$KEY_ALIAS = "phonecontrol-key"
$KEY_PASSWORD = "phonecontrol-dev"

$SCRIPT_DIR = Split-Path -Parent $MyInvocation.MyCommand.Path
$KIT_DIR = (Get-Item $SCRIPT_DIR).Parent.FullName
$PROJECT_DIR = Join-Path $KIT_DIR $PROJECT_NAME
$OUTPUT_DIR = Join-Path $KIT_DIR "output"
$SPRINT_PATCHES_DIR = Join-Path $KIT_DIR "sprint-patches"

function Log    { param($msg) Write-Host "[$(Get-Date -Format HH:mm:ss)] $msg" -ForegroundColor Blue }
function Ok     { param($msg) Write-Host "✓ $msg" -ForegroundColor Green }
function Warn   { param($msg) Write-Host "⚠ $msg" -ForegroundColor Yellow }
function ErrMsg { param($msg) Write-Host "✗ $msg" -ForegroundColor Red }

# ============================================================================
# 1. Prerequisites
# ============================================================================
function Test-Prerequisites {
    Log "בודק prerequisites..."
    $missing = $false
    
    try {
        $nodeVer = node -v
        $nodeMajor = [int]($nodeVer -replace 'v','' -split '\.')[0]
        if ($nodeMajor -lt 18) {
            ErrMsg "Node.js גרסה $nodeMajor — נדרש 18+"
            $missing = $true
        } else {
            Ok "Node.js $nodeVer"
        }
    } catch {
        ErrMsg "Node.js לא מותקן. הורד מ-https://nodejs.org/"
        $missing = $true
    }
    
    try {
        $javaOutput = (java -version 2>&1)[0]
        if ($javaOutput -match '"(\d+)') {
            $javaMajor = [int]$Matches[1]
            if ($javaMajor -lt 17) {
                ErrMsg "Java $javaMajor — נדרש JDK 17"
                $missing = $true
            } else {
                Ok "Java $javaOutput"
            }
        }
    } catch {
        ErrMsg "Java לא מותקן. הורד JDK 17 מ-https://adoptium.net/"
        $missing = $true
    }
    
    if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
        ErrMsg "ANDROID_HOME לא מוגדר. התקן Android Studio"
        $missing = $true
    } else {
        $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { $env:ANDROID_SDK_ROOT }
        Ok "Android SDK: $sdk"
    }
    
    if ($missing) {
        ErrMsg "חסרים prerequisites — ראה INSTALL-MANUAL.md"
        exit 1
    }
    Ok "כל הדרישות מותקנות"
}

# ============================================================================
# 2. Keystore
# ============================================================================
function New-Keystore {
    $keystorePath = Join-Path $KIT_DIR "phonecontrol-release.keystore"
    if (Test-Path $keystorePath) {
        Ok "keystore קיים: $keystorePath"
        return
    }
    Log "יוצר keystore..."
    & keytool -genkeypair -v `
        -keystore $keystorePath `
        -alias $KEY_ALIAS `
        -keyalg RSA -keysize 2048 -validity 10000 `
        -storepass $KEYSTORE_PASSWORD `
        -keypass $KEY_PASSWORD `
        -dname "CN=PhoneControl,OU=Dev,O=Self,L=TelAviv,ST=TA,C=IL"
    Ok "keystore נוצר: $keystorePath"
    Warn "*** שמור את הקובץ הזה! בלעדיו אי אפשר לעדכן את ה-APK ***"
}

# ============================================================================
# 3. RN skeleton
# ============================================================================
function New-RNSkeleton {
    if (Test-Path $PROJECT_DIR) {
        Ok "פרויקט RN קיים: $PROJECT_DIR"
        return
    }
    Log "יוצר RN skeleton (2-5 דקות)..."
    Push-Location $KIT_DIR
    & npx --yes "@react-native-community/cli@latest" init $PROJECT_NAME `
        --version $RN_VERSION `
        --skip-install `
        --package-name $PACKAGE_NAME
    Pop-Location
    if (-not (Test-Path $PROJECT_DIR)) {
        ErrMsg "יצירת RN skeleton נכשלה"
        exit 1
    }
    Ok "RN skeleton נוצר"
}

# ============================================================================
# 4. Inject Sprint files
# ============================================================================
function Add-SprintFiles {
    Log "מזריק קבצי Sprint..."
    
    $kotlinDir = Join-Path $PROJECT_DIR "android\app\src\main\java\com\phonecontrol"
    New-Item -ItemType Directory -Force -Path $kotlinDir | Out-Null
    Copy-Item -Path (Join-Path $SPRINT_PATCHES_DIR "kotlin\*.kt") -Destination $kotlinDir -Force
    Ok "Kotlin files copied"
    
    Copy-Item -Path (Join-Path $SPRINT_PATCHES_DIR "manifest\AndroidManifest.xml") `
              -Destination (Join-Path $PROJECT_DIR "android\app\src\main\AndroidManifest.xml") -Force
    Ok "AndroidManifest.xml replaced"
    
    Copy-Item -Path (Join-Path $SPRINT_PATCHES_DIR "gradle\app-build.gradle") `
              -Destination (Join-Path $PROJECT_DIR "android\app\build.gradle") -Force
    Ok "build.gradle replaced"
    
    $gradleProps = Join-Path $PROJECT_DIR "android\gradle.properties"
    Add-Content -Path $gradleProps -Value @"

# === Phone Control signing ===
MYAPP_RELEASE_STORE_FILE=phonecontrol-release.keystore
MYAPP_RELEASE_KEY_ALIAS=$KEY_ALIAS
MYAPP_RELEASE_STORE_PASSWORD=$KEYSTORE_PASSWORD
MYAPP_RELEASE_KEY_PASSWORD=$KEY_PASSWORD
"@
    Ok "gradle.properties updated"
    
    Copy-Item -Path (Join-Path $KIT_DIR "phonecontrol-release.keystore") `
              -Destination (Join-Path $PROJECT_DIR "android\app\phonecontrol-release.keystore") -Force
    Ok "keystore copied"
    
    $nativeDir = Join-Path $PROJECT_DIR "src\native"
    New-Item -ItemType Directory -Force -Path $nativeDir | Out-Null
    Copy-Item -Path (Join-Path $SPRINT_PATCHES_DIR "ts\BridgeService.ts") -Destination $nativeDir -Force
    Copy-Item -Path (Join-Path $SPRINT_PATCHES_DIR "ts\App.tsx") -Destination (Join-Path $PROJECT_DIR "App.tsx") -Force
    Ok "TS files copied"
    
    Push-Location $PROJECT_DIR
    & node (Join-Path $SPRINT_PATCHES_DIR "scripts\merge-package-json.cjs")
    Pop-Location
    Ok "package.json updated"
}

# ============================================================================
# 5. npm install + build
# ============================================================================
function Install-Deps {
    Log "מתקין תלויות (3-5 דקות)..."
    Push-Location $PROJECT_DIR
    & npm install --legacy-peer-deps
    Pop-Location
    Ok "npm install הושלם"
}

function Build-APK {
    Log "בונה APK release..."
    Push-Location (Join-Path $PROJECT_DIR "android")
    & .\gradlew.bat clean assembleRelease --no-daemon
    Pop-Location
    
    $apkPath = Join-Path $PROJECT_DIR "android\app\build\outputs\apk\release\app-release.apk"
    if (-not (Test-Path $apkPath)) {
        ErrMsg "Build נכשל"
        exit 1
    }
    
    New-Item -ItemType Directory -Force -Path $OUTPUT_DIR | Out-Null
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $finalApk = Join-Path $OUTPUT_DIR "phonecontrol-$timestamp.apk"
    Copy-Item $apkPath $finalApk
    Copy-Item $apkPath (Join-Path $OUTPUT_DIR "phonecontrol-latest.apk")
    
    $size = (Get-Item $finalApk).Length / 1MB
    Ok "APK מוכן: $finalApk ($([math]::Round($size,1)) MB)"
}

# ============================================================================
# main
# ============================================================================
Write-Host ""
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║   Phone Control — APK Build Pipeline      ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Cyan
Write-Host ""

Test-Prerequisites
New-Keystore
New-RNSkeleton
Add-SprintFiles
Install-Deps
Build-APK

Write-Host ""
Write-Host "╔════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║              ✓ BUILD SUCCESSFUL            ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Green
Write-Host ""
Write-Host "התקנה: העבר את $OUTPUT_DIR\phonecontrol-latest.apk לטלפון"
