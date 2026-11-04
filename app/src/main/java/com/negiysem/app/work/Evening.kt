package com.negiysem.app.work

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.negiysem.app.MainActivity
import com.negiysem.app.R
import com.negiysem.app.data.Day
import com.negiysem.app.data.Outfit
import com.negiysem.app.data.Store
import org.json.JSONObject
import java.util.Calendar
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * The evening note about tomorrow, once the person turns it on in the app: at 21:00 on the phone's clock, tomorrow's
 * outfit for the place chosen in the app (a child with school hours: their school day) and what to get ready by the door,
 * e.g. "Yarın: Soğuk · 4° – 11°" / "Sabah 4°: montunu ve şemsiyeni kapının önüne koy."
 */
object Evening {
    private const val CHANNEL = "evening"
    private const val ID = 4200
    private const val WORK = "negiysem-evening"
    const val HOUR = 21

    /** The next 21:00 (today's if it is still ahead). REPLACE: one waiting at a time. */
    fun schedule(context: Context, now: Long = System.currentTimeMillis()) {
        val c = Calendar.getInstance().apply { timeInMillis = now; set(Calendar.HOUR_OF_DAY, HOUR); set(Calendar.MINUTE, 0); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0) }
        if (c.timeInMillis <= now + 60_000L) c.add(Calendar.DAY_OF_MONTH, 1)
        val req = OneTimeWorkRequestBuilder<EveningWorker>().setInitialDelay(c.timeInMillis - now, TimeUnit.MILLISECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork(WORK, ExistingWorkPolicy.REPLACE, req)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(WORK)
        NotificationManagerCompat.from(context).cancel(ID)
    }

    // Accusative forms for "… kapının önüne koy" (the page's ACC, plus the umbrella).
    private val ACC = mapOf("hirka" to "hırkanı", "ceket" to "ince ceketini", "mont" to "montunu", "kaban" to "kabanını", "sisme" to "şişme montunu",
        "parka" to "parkanı", "ruzgarlik" to "rüzgârlığını", "yagmurluk" to "yağmurluğunu", "semsiye" to "şemsiyeni", "bere" to "bereni",
        "atki" to "atkını", "eldiven" to "eldivenlerini", "kazak" to "kazağını", "sweatshirt" to "sweatshirtünü", "gozluk" to "güneş gözlüğünü", "krem" to "güneş kremini")
    private val OUTER = listOf("parka", "sisme", "kaban", "mont", "yagmurluk", "ruzgarlik", "ceket")
    private val READY = listOf("semsiye", "eldiven", "bere", "atki", "hirka", "ceket", "ruzgarlik", "yagmurluk", "gozluk", "krem")

    data class Note(val title: String, val text: String, val big: String)

    /** Tomorrow's note from the forecast kept; null when it doesn't reach tomorrow. */
    fun note(store: Store, main: JSONObject): Note? {
        val lang = store.lang
        val en = lang == "en"
        val school = store.school?.takeIf { store.who == "child" }?.let { (a, b) -> Day.school(main, a, b) }?.takeIf { it.offset == 1 }
        val inp = school?.input ?: Day.tomorrow(main) ?: return null
        val plan = Outfit.plan(inp, store.feel, store.act, store.who, store.missing, lang, store.cal)
        val apps = inp.window.map { it.app }
        val lo = apps.minOrNull() ?: return null
        val hi = apps.maxOrNull() ?: return null
        val title = (if (en) "Tomorrow: " else "Yarın: ") + Outfit.levelName(plan.level, lang) + " · " + Outfit.deg(lo) + " – " + Outfit.deg(hi)
        // What goes by the door: the outer layer worn, then what to take (rain gear and warm accessories first).
        val ready = ArrayList<Outfit.Item>()
        plan.wear.firstOrNull { it.g in OUTER }?.let { ready.add(it) }
        READY.forEach { g -> plan.take.firstOrNull { it.g == g }?.let { if (ready.size < 3 && ready.none { r -> r.g == g }) ready.add(it) } }
        val first = Outfit.deg(inp.window.first().app)
        val lead = when {
            school != null -> if (en) "School at ${school.inAt}, $first" else "Okul ${school.inAt}, $first"
            else -> if (en) "$first in the morning" else "Sabah $first"
        }
        val prep = when {
            ready.isEmpty() -> ""
            en -> "put your " + list(ready.map { it.label.lowercase(Locale.ROOT) }, " and ") + " by the door."
            else -> list(ready.map { ACC[it.g] ?: it.label.lowercase(Locale.forLanguageTag("tr")) }, " ve ") + " kapının önüne koy."
        }
        val head = plan.headline.replace("{", "").replace("}", "")
        val text = if (prep.isNotEmpty()) "$lead: $prep" else head
        val wear = (if (en) "Wear: " else "Giy: ") + plan.wear.joinToString(", ") { it.label } +
            if (plan.take.isNotEmpty()) (if (en) "\nTake: " else "\nYanına al: ") + plan.take.joinToString(", ") { it.label } else ""
        return Note(title, text, listOf(head, wear, if (prep.isNotEmpty()) "$lead: $prep" else "").filter { it.isNotEmpty() }.joinToString("\n\n"))
    }

    private fun list(items: List<String>, and: String): String =
        if (items.size <= 1) items.joinToString("") else items.dropLast(1).joinToString(", ") + and + items.last()

    @SuppressLint("MissingPermission") // allowed() is checked first
    fun post(context: Context): Boolean {
        if (!AlertNotifier.allowed(context)) return false
        val store = Store(context)
        val main = store.forecast?.let { runCatching { JSONObject(it) }.getOrNull() }?.optJSONObject("main") ?: return false
        val n = note(store, main) ?: return false
        val en = store.lang == "en"
        if (Build.VERSION.SDK_INT >= 26) context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(
            NotificationChannel(CHANNEL, if (en) "Tomorrow's outfit" else "Yarının kıyafeti", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = if (en) "Every evening at 21:00: what to wear tomorrow and what to get ready" else "Her akşam 21:00: yarın ne giyeceğin ve neyi hazırlayacağın"
            }
        )
        val open = PendingIntent.getActivity(
            context, 1,
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notif = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_shirt)
            .setColor(0xFF2E6B5E.toInt())
            .setContentTitle(n.title)
            .setContentText(n.text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(n.big))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setContentIntent(open)
            .setAutoCancel(true)
            // Gone by noon tomorrow.
            .setTimeoutAfter(15 * 3_600_000L)
            .build()
        return runCatching { NotificationManagerCompat.from(context).notify(ID, notif); true }.getOrDefault(false)
    }
}

class EveningWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val ctx = applicationContext
        if (!Store(ctx).eveningOn) return Result.success()
        // A run held back by the phone until late at night or the next day doesn't post an old evening's note.
        val h = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
        if (h in Evening.HOUR..23) {
            runCatching { com.negiysem.app.data.Updater.refresh(ctx) } // a fresh forecast when there's a connection
            runCatching { Evening.post(ctx) }
        }
        Evening.schedule(ctx)
        return Result.success()
    }
}
