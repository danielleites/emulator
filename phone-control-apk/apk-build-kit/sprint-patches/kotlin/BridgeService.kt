package com.phonecontrol

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.SharedPreferences
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationCompat

/**
 * Sprint 9 + 10: Foreground Service שומר על חיבור פעיל לשרת Node.js.
 *
 * אחראי על:
 *  - notification קבועה ב-status bar (חובה ל-FGS)
 *  - WakeLock partial כדי לא לישון
 *  - שמירת serverUrl + token ל-SharedPreferences (לשימוש BootReceiver)
 *  - Sprint 10: קבלת broadcast מ-PCNotificationListenerService והעברה ל-RN EventEmitter
 */
class BridgeService : Service() {

    companion object {
        private const val TAG = "BridgeService"
        const val CHANNEL_ID = "phone_control_bridge"
        const val CHANNEL_NAME = "Phone Control Bridge"
        const val NOTIFICATION_ID = 9101

        const val EXTRA_SERVER_URL = "server_url"
        const val EXTRA_TOKEN = "token"
        const val ACTION_STOP = "com.phonecontrol.action.STOP"

        // === Sprint 10: broadcast מ-PCNotificationListenerService ===
        const val ACTION_NOTIFICATION_FORWARD = "com.phonecontrol.action.NOTIFICATION_FORWARD"
        const val EXTRA_NOTIFICATION_JSON = "notification_json"

        const val PREFS_NAME = "phone_control_bridge_prefs"
        const val PREF_SERVER_URL = "server_url"
        const val PREF_TOKEN = "token"
        const val PREF_SHOULD_RUN = "should_run"

        @Volatile
        var isRunning: Boolean = false
            private set

        // === Sprint 10: callback ל-RN module ל-emit אירועים ל-JS ===
        // BridgeServiceModule רושם את עצמו כאן כש-ReactContext זמין.
        @Volatile
        var jsNotificationSink: ((String) -> Unit)? = null

        fun start(context: Context, serverUrl: String, token: String) {
            val intent = Intent(context, BridgeService::class.java).apply {
                putExtra(EXTRA_SERVER_URL, serverUrl)
                putExtra(EXTRA_TOKEN, token)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            val intent = Intent(context, BridgeService::class.java).apply { action = ACTION_STOP }
            context.startService(intent)
        }
    }

    private var wakeLock: PowerManager.WakeLock? = null
    private var serverUrl: String = ""
    private var token: String = ""

    // === Sprint 10: receiver שמקבל את ה-broadcast מ-PCNotificationListenerService ===
    private val notificationForwardReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) {
            if (intent?.action != ACTION_NOTIFICATION_FORWARD) return
            val json = intent.getStringExtra(EXTRA_NOTIFICATION_JSON) ?: return
            // העברה ל-JS דרך ה-sink שה-RN module מספק.
            try {
                jsNotificationSink?.invoke(json)
                    ?: Log.w(TAG, "no js sink registered, dropping notification (len=${json.length})")
            } catch (e: Throwable) {
                Log.e(TAG, "jsNotificationSink threw: ${e.message}", e)
            }
        }
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        // רישום ה-receiver עם export-FALSE (פנימי בלבד) — חובה ל-Android 14+.
        val filter = IntentFilter(ACTION_NOTIFICATION_FORWARD)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(notificationForwardReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(notificationForwardReceiver, filter)
        }
        Log.i(TAG, "onCreate — notification forward receiver registered")
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            Log.i(TAG, "STOP requested")
            stopForegroundCompat()
            stopSelf()
            return START_NOT_STICKY
        }

        // קבלת serverUrl + token או טעינה מהפרסיסטנס
        val prefs = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        serverUrl = intent?.getStringExtra(EXTRA_SERVER_URL)
            ?: prefs.getString(PREF_SERVER_URL, "") ?: ""
        token = intent?.getStringExtra(EXTRA_TOKEN)
            ?: prefs.getString(PREF_TOKEN, "") ?: ""

        if (serverUrl.isEmpty()) {
            Log.w(TAG, "No serverUrl — stopping")
            stopSelf()
            return START_NOT_STICKY
        }

        // שמירה לרסטרט אחרי boot
        prefs.edit()
            .putString(PREF_SERVER_URL, serverUrl)
            .putString(PREF_TOKEN, token)
            .putBoolean(PREF_SHOULD_RUN, true)
            .apply()

        startInForeground()
        acquireWakeLock()
        isRunning = true

        // Sprint 10: heartbeat / WebSocket connect לכאן (בהמשך).
        Log.i(TAG, "started — server=$serverUrl")

        return START_STICKY
    }

    private fun startInForeground() {
        val notification = buildNotification()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            // Android 14: חובה foregroundServiceType מפורש
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE or
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun stopForegroundCompat() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
            @Suppress("DEPRECATION")
            stopForeground(true)
        }
        releaseWakeLock()
        isRunning = false
        // לאחר עצירה מפורשת — לא להפעיל מחדש בעת boot
        getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit().putBoolean(PREF_SHOULD_RUN, false).apply()
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val channel = NotificationChannel(
            CHANNEL_ID,
            CHANNEL_NAME,
            NotificationManager.IMPORTANCE_LOW, // ללא צליל
        ).apply {
            description = "חיבור רציף ל-Phone Control server"
            setShowBadge(false)
            enableVibration(false)
            setSound(null, null)
        }
        nm.createNotificationChannel(channel)
    }

    private fun buildNotification(): Notification {
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)
        val openPI = openIntent?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            )
        }
        val stopIntent = Intent(this, BridgeService::class.java).apply { action = ACTION_STOP }
        val stopPI = PendingIntent.getService(
            this, 1, stopIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        val builder = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_data_bluetooth) // placeholder; להחליף לאייקון משלך
            .setContentTitle("Phone Control")
            .setContentText("מחובר ל-$serverUrl")
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .addAction(android.R.drawable.ic_delete, "עצור", stopPI)

        if (openPI != null) builder.setContentIntent(openPI)
        return builder.build()
    }

    private fun acquireWakeLock() {
        if (wakeLock?.isHeld == true) return
        val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "PhoneControl::BridgeWL").apply {
            setReferenceCounted(false)
            acquire(/* timeout = */ 24L * 60L * 60L * 1000L) // 24h cap — re-acquired ברינדור
        }
    }

    private fun releaseWakeLock() {
        try { wakeLock?.release() } catch (_: Throwable) {}
        wakeLock = null
    }

    override fun onDestroy() {
        Log.i(TAG, "onDestroy")
        try { unregisterReceiver(notificationForwardReceiver) } catch (_: Throwable) {}
        releaseWakeLock()
        isRunning = false
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null
}
