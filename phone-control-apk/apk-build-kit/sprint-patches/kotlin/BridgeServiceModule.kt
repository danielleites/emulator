package com.phonecontrol

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * BridgeServiceModule — מודול React Native שחושף את BridgeService ל-JS
 * Sprint 9: start/stop/updateToken/isRunning + battery optimization
 * Sprint 10: forwardNotification (לבדיקות) + isNotificationAccessGranted + requestNotificationAccess
 *           + רישום jsNotificationSink ששולח אירועי pc_notification ל-JS
 */
class BridgeServiceModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        // Sprint 10: רישום ה-sink שיורץ ע"י BroadcastReceiver של BridgeService
        // כל התראה שמגיעה מ-PCNotificationListenerService → תועבר ל-JS דרך אירוע pc_notification
        BridgeService.jsNotificationSink = { jsonPayload ->
            try {
                if (reactContext.hasActiveCatalystInstance()) {
                    reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                        .emit("pc_notification", jsonPayload)
                }
            } catch (e: Exception) {
                android.util.Log.e("BridgeServiceModule", "emit pc_notification failed", e)
            }
        }
    }

    override fun getName(): String = "BridgeService"

    // ===== Sprint 9: ניהול השירות =====

    @ReactMethod
    fun start(serverUrl: String, token: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, BridgeService::class.java).apply {
                putExtra(BridgeService.EXTRA_SERVER_URL, serverUrl)
                putExtra(BridgeService.EXTRA_TOKEN, token)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("START_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun stop(promise: Promise) {
        try {
            val intent = Intent(reactContext, BridgeService::class.java).apply {
                action = BridgeService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STOP_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun updateToken(token: String, promise: Promise) {
        try {
            val prefs = reactContext.getSharedPreferences(BridgeService.PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit().putString(BridgeService.PREF_TOKEN, token).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("UPDATE_TOKEN_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun isRunning(promise: Promise) {
        try {
            promise.resolve(BridgeService.isRunning)
        } catch (e: Exception) {
            promise.reject("IS_RUNNING_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun isIgnoringBatteryOptimizations(promise: Promise) {
        try {
            val pm = reactContext.getSystemService(Context.POWER_SERVICE) as PowerManager
            val pkg = reactContext.packageName
            promise.resolve(pm.isIgnoringBatteryOptimizations(pkg))
        } catch (e: Exception) {
            promise.reject("BATTERY_CHECK_FAILED", e.message, e)
        }
    }

    @ReactMethod
    fun requestIgnoreBatteryOptimizations(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
                data = Uri.parse("package:${reactContext.packageName}")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("BATTERY_REQUEST_FAILED", e.message, e)
        }
    }

    // ===== Sprint 10: NotificationListener =====

    /**
     * בודק אם למשתמש ניתנה הרשאת Notification Access ל-app שלנו
     * Android 14: בודק את Settings.Secure.enabled_notification_listeners
     */
    @ReactMethod
    fun isNotificationAccessGranted(promise: Promise) {
        try {
            val pkg = reactContext.packageName
            val enabledListeners = Settings.Secure.getString(
                reactContext.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            // הפורמט: "pkg1/.Listener1:pkg2/.Listener2"
            val granted = enabledListeners.split(":").any { entry ->
                entry.startsWith("$pkg/")
            }
            promise.resolve(granted)
        } catch (e: Exception) {
            promise.reject("NOTIF_ACCESS_CHECK_FAILED", e.message, e)
        }
    }

    /**
     * פותח את מסך ההגדרות של Notification Access כדי שהמשתמש יאשר ידנית
     */
    @ReactMethod
    fun requestNotificationAccess(promise: Promise) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("NOTIF_ACCESS_REQUEST_FAILED", e.message, e)
        }
    }

    /**
     * forwardNotification — בדיקת loopback: שולח התראה מזוייפת ל-JS
     * שימושי לבדיקה ידנית של ה-pipeline בלי להמתין להתראה אמיתית
     */
    @ReactMethod
    fun forwardNotification(jsonPayload: String, promise: Promise) {
        try {
            BridgeService.jsNotificationSink?.invoke(jsonPayload)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("FORWARD_FAILED", e.message, e)
        }
    }

    // ===== חובה ל-NativeEventEmitter (RN >= 0.65) =====

    @ReactMethod
    fun addListener(eventName: String) {
        // נדרש ע"י RN — לא צריך לוגיקה
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // נדרש ע"י RN — לא צריך לוגיקה
    }
}
