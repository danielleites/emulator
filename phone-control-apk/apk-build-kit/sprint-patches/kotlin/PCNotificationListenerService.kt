package com.phonecontrol

import android.app.Notification
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject

/**
 * Sprint 10: NotificationListenerService — מאזין לכל ההתראות של Android,
 * מסנן (own/ongoing/group-summary), ומעביר ל-BridgeService שמעביר ל-JS דרך EventEmitter.
 *
 * דורש את ההרשאה (לא runtime — דרך הגדרות המערכת):
 *   Settings → Notifications → Notification access → phone-control ON
 *
 * המשתמש חייב להפעיל ידנית. ה-app מבקש זאת דרך:
 *   BridgeServiceModule.requestNotificationAccess()
 */
class PCNotificationListenerService : NotificationListenerService() {

    companion object {
        private const val TAG = "PCNotifListener"

        // Dedup cache קצר טווח כדי למנוע fire כפול על update של אותה התראה.
        // key = "$pkg:$id:$tag", value = lastSentTs.
        private val recentlySent = HashMap<String, Long>()
        private const val DEDUP_WINDOW_MS = 3_000L

        // אפליקציות שמתעדכנות הרבה ולא רוצים להציף — מסוננות כברירת מחדל.
        // המשתמש יוכל לכבות סינון דרך setting עתידי.
        private val DEFAULT_IGNORED_PACKAGES = setOf(
            "com.phonecontrol",        // אנחנו עצמנו
            "android",                  // התראות מערכת שקופות
            "com.android.systemui",
            "com.google.android.gms",   // play services background sync
        )
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.i(TAG, "listener connected")
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.i(TAG, "listener disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn == null) return

        try {
            val pkg = sbn.packageName ?: return
            if (pkg in DEFAULT_IGNORED_PACKAGES) return

            val notification = sbn.notification ?: return
            val flags = notification.flags

            // סינון: התראות ongoing (שלא נעלמות עד שהאפליקציה מסירה), group summaries, ושקופות.
            if (flags and Notification.FLAG_ONGOING_EVENT != 0) return
            if (flags and Notification.FLAG_GROUP_SUMMARY != 0) return

            val extras = notification.extras ?: Bundle()
            val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString()?.trim()
                ?: extras.getString(Notification.EXTRA_TITLE)?.trim()
                ?: ""
            val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()
                ?: extras.getString(Notification.EXTRA_TEXT)?.trim()
                ?: ""
            val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()
                ?: ""
            val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString()?.trim()
                ?: ""
            val body = listOf(bigText, text).firstOrNull { it.isNotEmpty() } ?: ""

            // אם אין title וגם אין body — לא שווה לשלוח.
            if (title.isEmpty() && body.isEmpty()) return

            // dedup לפי key+ts — אם זו אותה התראה עודכנה תוך 3s, נדלג.
            val key = "${pkg}:${sbn.id}:${sbn.tag ?: ""}"
            val now = System.currentTimeMillis()
            val prev = recentlySent[key]
            if (prev != null && now - prev < DEDUP_WINDOW_MS) {
                return
            }
            recentlySent[key] = now
            cleanupDedup(now)

            // בניית JSON payload שיתאים ל-/api/notifications/inbound של השרת.
            val payload = JSONObject().apply {
                put("source", "android")
                put("app", pkg)
                put("title", title)
                put("body", body)
                put("subText", subText)
                put("ts", sbn.postTime)
                put("id", sbn.id)
                put("tag", sbn.tag ?: "")
                put("priority", priorityToString(notification.priority))
                put("category", notification.category ?: "")
                put("isClearable", sbn.isClearable)
            }

            Log.d(TAG, "forwarding from $pkg: ${title.take(50)}")

            // שליחה ל-BridgeService שיעביר ל-WebView/JS.
            // משתמשים ב-Intent מקומי במקום קישור ישיר כדי למנוע tight coupling.
            val forwardIntent = Intent(BridgeService.ACTION_NOTIFICATION_FORWARD).apply {
                setPackage(packageName)
                putExtra(BridgeService.EXTRA_NOTIFICATION_JSON, payload.toString())
            }
            sendBroadcast(forwardIntent)
        } catch (e: Throwable) {
            Log.e(TAG, "error processing notification: ${e.message}", e)
        }
    }

    override fun onNotificationRemoved(sbn: StatusBarNotification?) {
        // אופציונלי: שליחה של event הסרה אם נצטרך בעתיד (Sprint 11+).
        // לעת עתה לא מעבירים, כדי לא להציף את ה-server.
    }

    private fun priorityToString(p: Int): String = when {
        p >= Notification.PRIORITY_MAX -> "max"
        p >= Notification.PRIORITY_HIGH -> "high"
        p >= Notification.PRIORITY_DEFAULT -> "normal"
        p >= Notification.PRIORITY_LOW -> "low"
        else -> "min"
    }

    private fun cleanupDedup(now: Long) {
        // ניקוי תקופתי של ה-cache — שמירה רק על ה-100 האחרונים, ומחיקה של ישנים.
        if (recentlySent.size < 100) return
        val cutoff = now - 60_000L
        val iter = recentlySent.entries.iterator()
        while (iter.hasNext()) {
            val entry = iter.next()
            if (entry.value < cutoff) iter.remove()
        }
    }
}
