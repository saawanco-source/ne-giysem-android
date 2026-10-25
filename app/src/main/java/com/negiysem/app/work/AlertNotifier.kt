package com.negiysem.app.work

import android.Manifest
import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.negiysem.app.MainActivity
import com.negiysem.app.R
import com.negiysem.app.data.Alerts
import com.negiysem.app.data.Store
import org.json.JSONObject
import java.util.Calendar

/**
 * Severe-weather notifications, once the person turns them on in the app. Each warning is announced once, and again
 * only when it gets worse ("Dikkat" → "Tehlikeli"). At night (23:00–07:00 on the phone's clock) only what starts within
 * three hours is announced; the rest waits for the morning. Fog alone ("Dikkat") never makes a notification.
 */
object AlertNotifier {
    private const val DANGER = "alerts-danger"
    private const val CAUTION = "alerts-caution"
    private const val ID_BASE = 4100
    private const val HOUR = 3_600_000L

    /** Android lets this app post notifications (on 13+ the person granted it; on any version they're not turned off). */
    fun allowed(context: Context): Boolean {
        val granted = Build.VERSION.SDK_INT < 33 ||
            context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
        return granted && NotificationManagerCompat.from(context).areNotificationsEnabled()
    }

    /** Looks at the warnings in [wx] (the chosen place's forecast) and announces the new ones. */
    fun check(context: Context, wx: JSONObject, place: String, now: Long = System.currentTimeMillis()) {
        val store = Store(context)
        if (!store.alertsOn || !allowed(context)) return
        val lang = store.lang
        val sent = runCatching { JSONObject(store.alerted ?: "{}") }.getOrDefault(JSONObject())
        val hour = Calendar.getInstance().apply { timeInMillis = now }.get(Calendar.HOUR_OF_DAY)
        val night = hour >= 23 || hour < 7
        for (a in Alerts.find(wx, now)) {
            if (a.k == "fog" && a.lv < 2) continue
            val from = Alerts.fromMs(wx, a)
            val until = Alerts.untilMs(wx, a)
            val prev = sent.optJSONObject(a.k)
            // The same event when it starts before (or within three hours after) the end of the one announced.
            val same = prev != null && from <= prev.optLong("until") + 3 * HOUR
            if (same && a.lv <= prev!!.optInt("lv")) {
                prev.put("until", maxOf(prev.optLong("until"), until))
                continue
            }
            if (night && from - now > 3 * HOUR) continue
            if (!post(context, wx, a, place, lang, now, until)) return
            sent.put(a.k, JSONObject().put("lv", a.lv).put("until", maxOf(until, if (same) prev!!.optLong("until") else 0L)))
        }
        // Forget events that ended more than two days ago.
        for (k in sent.keys().asSequence().toList()) {
            if ((sent.optJSONObject(k)?.optLong("until", 0L) ?: 0L) < now - 48 * HOUR) sent.remove(k)
        }
        store.saveAlerted(sent.toString())
    }

    /** Removes every warning on screen (notifications turned off in the app, or all data deleted). */
    fun clear(context: Context) {
        val nm = NotificationManagerCompat.from(context)
        Alerts.KINDS.indices.forEach { nm.cancel(ID_BASE + it) }
    }

    private fun channels(context: Context, lang: String) {
        if (Build.VERSION.SDK_INT < 26) return
        val en = lang == "en"
        val nm = context.getSystemService(NotificationManager::class.java) ?: return
        nm.createNotificationChannel(
            NotificationChannel(DANGER, if (en) "Dangerous weather" else "Tehlikeli hava", NotificationManager.IMPORTANCE_HIGH).apply {
                description = if (en) "Storms, floods, heavy snow, extreme heat or cold (\"Danger\")" else "Fırtına, sel, yoğun kar, aşırı sıcak ya da soğuk (\"Tehlikeli\")"
            }
        )
        nm.createNotificationChannel(
            NotificationChannel(CAUTION, if (en) "Weather warnings" else "Hava uyarıları", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = if (en) "Weather to be careful about (\"Caution\")" else "Dikkat edilmesi gereken hava (\"Dikkat\")"
            }
        )
    }

    @SuppressLint("MissingPermission") // allowed() was checked by the caller
    private fun post(context: Context, wx: JSONObject, a: Alerts.Alert, place: String, lang: String, now: Long, until: Long): Boolean {
        channels(context, lang)
        val info = Alerts.info(wx, a, now, lang)
        val open = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val big = info.whenText + "\n\n" + info.tips.joinToString("\n") { "• $it" } + "\n\n" + Alerts.note(wx, lang)
        val n = NotificationCompat.Builder(context, if (a.lv == 2) DANGER else CAUTION)
            .setSmallIcon(R.drawable.ic_stat_warn)
            .setColor(if (a.lv == 2) 0xFFE8603A.toInt() else 0xFFC99A00.toInt())
            .setContentTitle(info.title + " · " + info.level)
            .setContentText(info.whenText)
            .setSubText(place)
            .setStyle(NotificationCompat.BigTextStyle().bigText(big))
            .setPriority(if (a.lv == 2) NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION)
            .setContentIntent(open)
            .setAutoCancel(true)
            .setOnlyAlertOnce(true)
            .setWhen(now)
            // Gone by itself once the weather it warns about is over.
            .setTimeoutAfter(maxOf(until - now, HOUR))
            .build()
        return runCatching { NotificationManagerCompat.from(context).notify(ID_BASE + Alerts.KINDS.indexOf(a.k), n); true }.getOrDefault(false)
    }
}
