package com.negiysem.app.work

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
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
import com.negiysem.app.data.PhoneTranslate
import com.negiysem.app.data.Store
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Calendar
import java.util.concurrent.TimeUnit
import kotlin.math.roundToInt

/**
 * The notes the person can turn on besides the warnings and the evening note (each once, each in its own channel):
 * - "live": a card on the lock screen and in the status bar (Android 16 Live Updates; an ordinary ongoing note before
 *   that) while rain is about to start, and during a routine trip, with its progress
 * - "depart": 40 minutes before each routine trip, what to wear for it
 * - "hourly": when an hour in the next three needs something the outfit worn now doesn't have ("15:00'ten itibaren şemsiye")
 * - "rules": the person's own warnings ("hissedilen 0°'nin altında: araba camı buzlanır")
 */
object Extras {
    private const val HOUR = 3_600_000L
    private const val MIN = 60_000L
    private const val ID_LIVE_RAIN = 4300
    private const val ID_LIVE_TRIP = 4301
    private const val ID_DEPART = 4310
    private const val ID_HOURLY = 4320
    private const val ID_RULE = 4400
    private val EXTRA = setOf("semsiye", "yagmurluk", "gozluk", "krem", "sapka", "bere", "eldiven", "atki",
        "ceket", "mont", "kaban", "sisme", "parka", "ruzgarlik", "hirka", "sweatshirt", "kazak")

    private fun en(store: Store) = store.lang == "en"
    private fun today(): String = java.time.LocalDate.now().toString()
    private fun hm(ms: Long): String { val c = Calendar.getInstance().apply { timeInMillis = ms }; return "%02d:%02d".format(c.get(Calendar.HOUR_OF_DAY), c.get(Calendar.MINUTE)) }
    private fun hourNow(): Int = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)

    /** Called after every refresh with the forecast kept: decides what to show now and what to schedule. */
    fun check(context: Context, main: JSONObject, now: Long = System.currentTimeMillis()) {
        val store = Store(context)
        if (!AlertNotifier.allowed(context)) return
        val routine = Day.parse(store.routineJson)?.takeIf { it.trips.isNotEmpty() }
        runCatching { if (store.notifOn("live")) liveRain(context, store, main, now) else cancel(context, ID_LIVE_RAIN) }
        runCatching { if (store.notifOn("live") && routine != null) liveTrip(context, store, routine, now) else cancel(context, ID_LIVE_TRIP) }
        runCatching { if (store.notifOn("depart") && routine != null) scheduleDepart(context, routine, now) }
        runCatching { if (store.notifOn("hourly")) hourly(context, store, main, now) }
        runCatching { if (store.notifOn("rules")) rules(context, store, main, now) }
    }

    fun cancel(context: Context, id: Int) = NotificationManagerCompat.from(context).cancel(id)
    /** Cancels the notes of one kind ("live", "depart", "hourly", "rules"), e.g. when it's turned off. */
    fun cancelKind(context: Context, kind: String) {
        when (kind) {
            "live" -> { cancel(context, ID_LIVE_RAIN); cancel(context, ID_LIVE_TRIP); WorkManager.getInstance(context).cancelUniqueWork(LIVE) }
            "depart" -> { cancel(context, ID_DEPART); WorkManager.getInstance(context).cancelUniqueWork(DEPART) }
            "hourly" -> cancel(context, ID_HOURLY)
            "rules" -> for (i in 0 until 90) cancel(context, ID_RULE + i)
        }
    }
    fun clear(context: Context) {
        listOf("live", "depart", "hourly", "rules").forEach { cancelKind(context, it) }
        listOf(ID_LIVE_RAIN, ID_LIVE_TRIP, ID_DEPART, ID_HOURLY).forEach { cancel(context, it) }
        WorkManager.getInstance(context).cancelUniqueWork(DEPART)
        WorkManager.getInstance(context).cancelUniqueWork(LIVE)
    }

    private fun channel(context: Context, id: String, tr: String, en: String, lang: String, importance: Int) {
        if (Build.VERSION.SDK_INT < 26) return
        context.getSystemService(NotificationManager::class.java)?.createNotificationChannel(NotificationChannel(id, if (lang == "en") en else tr, importance))
    }
    private fun open(context: Context, go: String? = null): PendingIntent = PendingIntent.getActivity(
        context, 2 + (go?.hashCode() ?: 0) % 1000,
        Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP).apply { if (go != null) putExtra("go", go) },
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    /** In the phone's language when the app is translated (with the model already on the phone). */
    private fun words(context: Context, store: Store, texts: List<String>): List<String> =
        store.xl.takeIf { it.isNotEmpty() }?.let { PhoneTranslate.translateNow(context, it, texts) } ?: texts

    @SuppressLint("MissingPermission")
    private fun post(context: Context, id: Int, n: android.app.Notification) { runCatching { NotificationManagerCompat.from(context).notify(id, n) } }

    /**
     * On a locked phone only a neutral line shows (no place names, times or the person's own words): the full note
     * appears once the phone is unlocked, whatever the lock-screen setting.
     */
    fun privateOnLock(context: Context, b: NotificationCompat.Builder, channel: String, en: Boolean, title: String, text: String): NotificationCompat.Builder =
        b.setVisibility(NotificationCompat.VISIBILITY_PRIVATE).setPublicVersion(
            NotificationCompat.Builder(context, channel).setSmallIcon(R.drawable.ic_stat_shirt).setContentTitle(title).setContentText(text).build()
        )

    /** Asks Android 16 to show an ongoing note as a Live Update (lock screen, status-bar chip); older versions ignore it. */
    private fun promoted(b: NotificationCompat.Builder): NotificationCompat.Builder = b.addExtras(Bundle().apply { putBoolean("android.requestPromotedOngoing", true) })

    /* ---- live: rain about to start ---- */
    private fun keyOf(wx: JSONObject, ms: Long): String = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH").withZone(ZoneOffset.UTC)
        .format(Instant.ofEpochMilli(ms + wx.optLong("utc_offset_seconds", 0L) * 1000))
    private fun idx(wx: JSONObject, ms: Long): Int {
        val t = wx.optJSONObject("hourly")?.optJSONArray("time") ?: return -1
        val k = keyOf(wx, ms)
        for (i in 0 until t.length()) if (t.optString(i).take(13) == k) return i
        return -1
    }
    private fun msOf(wx: JSONObject, time: String): Long =
        Instant.parse(time.take(16) + ":00Z").toEpochMilli() - wx.optLong("utc_offset_seconds", 0L) * 1000
    private fun wet(h: JSONObject, i: Int): Boolean {
        val c = h.optJSONArray("weather_code")?.optInt(i, 3) ?: 3
        val p = h.optJSONArray("precipitation_probability")?.optDouble(i, 0.0) ?: 0.0
        return (Outfit.isRain(c) && p >= 40) || (p >= 60 && !Outfit.isSnow(c))
    }

    private fun liveRain(context: Context, store: Store, wx: JSONObject, now: Long) {
        val h = wx.optJSONObject("hourly") ?: return
        val times = h.optJSONArray("time") ?: return
        val i0 = idx(wx, now); if (i0 < 0) return
        val e = en(store)
        // Dry now and wet within the next hour: until it starts. Wet now: until it stops (at most 6 hours ahead).
        var start = -1; var stop = -1
        if (!wet(h, i0) && i0 + 1 < times.length() && wet(h, i0 + 1)) start = i0 + 1
        if (start >= 0 || wet(h, i0)) {
            var j = if (start >= 0) start else i0
            while (j < times.length() && j < i0 + 7 && wet(h, j)) j++
            stop = j
        }
        if (stop < 0) { cancel(context, ID_LIVE_RAIN); return }
        val startMs = if (start >= 0) msOf(wx, times.optString(start)) else now
        val stopMs = if (stop < times.length()) msOf(wx, times.optString(stop)) else now + 6 * HOUR
        val title = if (start >= 0) (if (e) "Rain from about ${hm(startMs)}" else "Yağmur ${hm(startMs)} civarı başlıyor")
                    else (if (e) "Raining until about ${hm(stopMs)}" else "Yağmur ${hm(stopMs)} civarına kadar sürüyor")
        val text = if (e) "Take your umbrella; it lasts about ${((stopMs - startMs) / HOUR).coerceAtLeast(1)} h." else "Şemsiyeni al; yaklaşık ${((stopMs - startMs) / HOUR).coerceAtLeast(1)} saat sürüyor."
        val w = words(context, store, listOf(title, text))
        channel(context, "live", "Canlı kartlar", "Live cards", store.lang, NotificationManager.IMPORTANCE_DEFAULT)
        val b = NotificationCompat.Builder(context, "live")
            .setSmallIcon(R.drawable.ic_stat_shirt).setContentTitle(w[0]).setContentText(w[1])
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true).setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(open(context, "hours")).setWhen(if (start >= 0) startMs else stopMs).setUsesChronometer(true)
            .setChronometerCountDown(true).setTimeoutAfter((stopMs - now).coerceAtLeast(10 * MIN))
        post(context, ID_LIVE_RAIN, promoted(b).build())
    }

    /* ---- live: a routine trip, from 15 minutes before it starts until it ends ---- */
    private const val LIVE = "negiysem-live"
    private fun liveTrip(context: Context, store: Store, r: Day.Routine, now: Long) {
        val legs = Day.legs(r, now)
        val cur = legs.firstOrNull { now >= it.start - 15 * MIN && now < it.end }
        val next = legs.firstOrNull { it.start - 15 * MIN > now }
        // The next look: every 5 minutes during a trip, otherwise 15 minutes before the next one.
        val wake = when { cur != null -> now + 5 * MIN; next != null -> next.start - 15 * MIN; else -> 0L }
        if (wake > 0) WorkManager.getInstance(context).enqueueUniqueWork(LIVE, ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<ExtrasWorker>().setInitialDelay((wake - now).coerceAtLeast(MIN), TimeUnit.MILLISECONDS).build())
        if (cur == null) { cancel(context, ID_LIVE_TRIP); return }
        val e = en(store)
        val total = ((cur.end - cur.start) / MIN).toInt().coerceAtLeast(1)
        val done = ((now - cur.start) / MIN).toInt().coerceIn(0, total)
        // The step under way (or the first one, before the start).
        var acc = 0; var step = cur.route.steps.first()
        for (s in cur.route.steps) { if (done < acc + s.min) { step = s; break }; acc += s.min; step = s }
        val mode = mapOf("walk" to ("Yürüyüş" to "Walking"), "wait" to ("Durakta bekleme" to "Waiting at the stop"), "bus" to ("Otobüs" to "Bus"),
            "metrobus" to ("Metrobüs" to "Metrobus"), "metro" to ("Metro" to "Metro"), "marmaray" to ("Marmaray / tren" to "Marmaray / train"),
            "tram" to ("Tramvay" to "Tram"), "ferry" to ("Vapur" to "Ferry"), "car" to ("Araba / taksi" to "Car / taxi"))[step.m] ?: ("" to "")
        val from = Outfit.ownName(cur.from, store.lang); val to = Outfit.ownName(cur.to, store.lang)
        val title = "$from → $to · ${hm(cur.start)}–${hm(cur.end)}"
        val text = if (now < cur.start) (if (e) "Leaving in ${((cur.start - now) / MIN).coerceAtLeast(1)} min" else "${((cur.start - now) / MIN).coerceAtLeast(1)} dk sonra çıkıyorsun")
                   else (if (e) "Now: ${mode.second} · ${total - done} min to go" else "Şimdi: ${mode.first} · ${total - done} dk kaldı")
        val w = words(context, store, listOf(title, text))
        channel(context, "live", "Canlı kartlar", "Live cards", store.lang, NotificationManager.IMPORTANCE_DEFAULT)
        val b = NotificationCompat.Builder(context, "live")
            .setSmallIcon(R.drawable.ic_stat_shirt).setContentTitle(w[0]).setContentText(w[1])
            .setOngoing(true).setOnlyAlertOnce(true).setSilent(true).setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(total, done, false).setContentIntent(open(context)).setWhen(cur.end).setUsesChronometer(true).setChronometerCountDown(true)
            .setTimeoutAfter((cur.end - now).coerceAtLeast(MIN))
        privateOnLock(context, b, "live", e, "Ne Giysem?", if (e) "Trip under way · ${total - done} min to go" else "Yolculuk sürüyor · ${total - done} dk kaldı")
        post(context, ID_LIVE_TRIP, promoted(b).build())
    }

    /* ---- before the first trip ---- */
    private const val DEPART = "negiysem-depart"
    private fun dayOf(ms: Long): String = Instant.ofEpochMilli(ms).atZone(java.time.ZoneId.systemDefault()).toLocalDate().toString()
    private fun scheduleDepart(context: Context, r: Day.Routine, now: Long) {
        val store = Store(context)
        // The next trip whose note hasn't gone yet (each trip: home to school in the morning, back in the evening).
        val leg = Day.legs(r, now).firstOrNull { it.start - 40 * MIN > now + MIN && store.sent("depart") != dayOf(it.start) + "|" + it.trip.id } ?: return
        val at = leg.start - 40 * MIN
        WorkManager.getInstance(context).enqueueUniqueWork(DEPART, ExistingWorkPolicy.REPLACE,
            OneTimeWorkRequestBuilder<DepartWorker>().setInitialDelay((at - now).coerceAtLeast(0), TimeUnit.MILLISECONDS).build())
    }

    /** Posts the note for the trip starting in about 40 minutes (DepartWorker). */
    fun depart(context: Context, now: Long = System.currentTimeMillis()) {
        val store = Store(context)
        if (!store.notifOn("depart") || !AlertNotifier.allowed(context)) return
        val r = Day.parse(store.routineJson) ?: return
        val leg = Day.legs(r, now).firstOrNull { it.start in (now - 5 * MIN)..(now + 60 * MIN) } ?: return
        val key = dayOf(leg.start) + "|" + leg.trip.id
        if (store.sent("depart") == key) return
        val cached = store.forecast?.let { runCatching { JSONObject(it) }.getOrNull() } ?: return
        val byPlace = HashMap<String, JSONObject>()
        cached.optJSONObject("places")?.let { o -> o.keys().forEach { k -> o.optJSONObject(k)?.let { byPlace[k] = it } } }
        val inp = Day.compute(r, byPlace, now, store.lang)?.input ?: cached.optJSONObject("main")?.let { Outfit.parse(it, store.hours, cached.optLong("at")) } ?: return
        val plan = Outfit.plan(inp, store.feel, store.act, store.who, store.missing, store.lang, store.cal)
        val e = en(store)
        val mins = ((leg.start - now) / MIN).coerceAtLeast(1)
        val title = (if (e) "Leaving in $mins min" else "$mins dk sonra çıkıyorsun") + " · " + Outfit.ownName(leg.from, store.lang) + " → " + Outfit.ownName(leg.to, store.lang)
        val head = plan.headline.replace("{", "").replace("}", "")
        val wear = (if (e) "Wear: " else "Giy: ") + plan.wear.joinToString(", ") { it.label } +
            if (plan.take.isNotEmpty()) (if (e) " · Take: " else " · Yanına al: ") + plan.take.joinToString(", ") { it.label } else ""
        val w = words(context, store, listOf(title, head, wear))
        channel(context, "depart", "Çıkış öncesi", "Before you leave", store.lang, NotificationManager.IMPORTANCE_DEFAULT)
        val nb = NotificationCompat.Builder(context, "depart")
            .setSmallIcon(R.drawable.ic_stat_shirt).setContentTitle(w[0]).setContentText(w[1])
            .setStyle(NotificationCompat.BigTextStyle().bigText(w[1] + "\n" + w[2]))
            .setCategory(NotificationCompat.CATEGORY_REMINDER).setContentIntent(open(context)).setAutoCancel(true)
            .setTimeoutAfter((leg.end - now).coerceAtLeast(30 * MIN))
        val n = privateOnLock(context, nb, "depart", e, "Ne Giysem?", if (e) "Leaving in $mins min: what to wear" else "$mins dk sonra çıkıyorsun: ne giyeceğin").build()
        post(context, ID_DEPART, n)
        store.markSent("depart", key)
    }

    /* ---- hour by hour: something new to take along ---- */
    private fun hourly(context: Context, store: Store, wx: JSONObject, now: Long) {
        if (hourNow() !in 7..22) return
        // Compared with what this hour itself calls for (as the app's hourly strip does).
        val base = Day.hourInput(wx, now) ?: return
        val p0 = Outfit.plan(base, store.feel, store.act, store.who, store.missing, store.lang, store.cal)
        val have = (p0.wear + p0.take).map { it.g }.toSet()
        val sent = store.sent("hourly").let { if (it.startsWith(today() + "|")) it.substringAfter("|").split(",").toSet() else emptySet() }
        for (k in 1..3) {
            val ms = now + k * HOUR
            val inp = Day.hourInput(wx, ms) ?: continue
            val p = Outfit.plan(inp, store.feel, store.act, store.who, store.missing, store.lang, store.cal)
            val extra = (p.wear + p.take).filter { it.g in EXTRA && it.g !in have && it.g !in sent }
            if (extra.isEmpty()) continue
            val at = inp.window.first().time.substring(11, 16)
            val names = extra.take(3).joinToString(", ") { it.label.lowercase(if (en(store)) java.util.Locale.ROOT else java.util.Locale.forLanguageTag("tr")) }
            val title = if (en(store)) "From $at you'll need: $names" else "$at'ten itibaren lazım: $names"
            val text = if (en(store)) "Feels like ${Outfit.deg(inp.now.app)} then. Tap for the hour-by-hour outfit." else "O saatte hissedilen ${Outfit.deg(inp.now.app)}. Saat saat kıyafet için dokun."
            val w = words(context, store, listOf(title, text))
            channel(context, "hourly", "Saatlik değişiklikler", "Hour-by-hour changes", store.lang, NotificationManager.IMPORTANCE_DEFAULT)
            val n = NotificationCompat.Builder(context, "hourly")
                .setSmallIcon(R.drawable.ic_stat_shirt).setContentTitle(w[0]).setContentText(w[1])
                .setCategory(NotificationCompat.CATEGORY_RECOMMENDATION).setContentIntent(open(context, "hours")).setAutoCancel(true)
                .setTimeoutAfter((k + 2) * HOUR).build()
            post(context, ID_HOURLY, n)
            store.markSent("hourly", today() + "|" + (sent + extra.map { it.g }).joinToString(","))
            return
        }
    }

    /* ---- the person's own warnings (page: ruleHit) ---- */
    private fun rules(context: Context, store: Store, wx: JSONObject, now: Long) {
        val list = runCatching { JSONArray(store.rules) }.getOrNull() ?: return
        if (list.length() == 0) return
        val h = wx.optJSONObject("hourly") ?: return
        val times = h.optJSONArray("time") ?: return
        val i0 = idx(wx, now).coerceAtLeast(0)
        val night = hourNow() >= 23 || hourNow() < 7
        val sentToday = store.sent("rules").let { if (it.startsWith(today() + "|")) it.substringAfter("|").split(",").toMutableSet() else mutableSetOf() }
        val e = en(store)
        fun d(a: String, i: Int): Double = h.optJSONArray(a)?.let { if (i < it.length() && !it.isNull(i)) it.optDouble(i, Double.NaN) else Double.NaN } ?: Double.NaN
        for (n in 0 until list.length()) {
            val r = list.optJSONObject(n) ?: continue
            val id = r.optString("id"); if (id.isEmpty() || id in sentToday) continue
            val k = r.optString("k"); val v = r.optDouble("v", 0.0)
            var hitAt = -1; var value = Double.NaN
            for (j in i0 until minOf(times.length(), i0 + 12)) {
                val app = d("apparent_temperature", j).let { if (it.isNaN()) d("temperature_2m", j) else it }
                val t = d("temperature_2m", j)
                val x: Double? = when (k) {
                    "cold" -> app.takeIf { !it.isNaN() && it <= v }
                    "hot" -> app.takeIf { !it.isNaN() && it >= v }
                    "frost" -> t.takeIf { !it.isNaN() && it <= v }
                    "wind" -> maxOf(d("wind_speed_10m", j).let { if (it.isNaN()) 0.0 else it }, d("wind_gusts_10m", j).let { if (it.isNaN()) 0.0 else it }).takeIf { it >= v }
                    "rain" -> d("precipitation_probability", j).takeIf { !it.isNaN() && it >= v }
                    "snow" -> if (Outfit.isSnow(h.optJSONArray("weather_code")?.optInt(j, 3) ?: 3)) 0.0 else null
                    "uv" -> {
                        val hr = times.optString(j).substring(11, 13).toIntOrNull() ?: 0
                        val daily = wx.optJSONObject("daily"); val dt = daily?.optJSONArray("time")
                        var di = -1; if (dt != null) for (q in 0 until dt.length()) if (dt.optString(q) == times.optString(j).take(10)) { di = q; break }
                        val uv = if (di >= 0) daily?.optJSONArray("uv_index_max")?.optDouble(di, Double.NaN) ?: Double.NaN else Double.NaN
                        if (hr in 11..15 && !uv.isNaN() && uv >= v) uv else null
                    }
                    else -> null
                }
                if (x != null) { hitAt = j; value = x; break }
            }
            if (hitAt < 0) continue
            val at = msOf(wx, times.optString(hitAt))
            if (night && at - now > 3 * HOUR) continue
            val shown = when (k) { "wind" -> "${value.roundToInt()} km/" + (if (e) "h" else "sa"); "rain" -> if (e) "${value.roundToInt()}%" else "%${value.roundToInt()}"; "uv" -> "UV ${"%.1f".format(value)}"; "snow" -> if (e) "snow" else "kar"; else -> Outfit.deg(value) }
            val title = (if (at <= now + HOUR) (if (e) "Now" else "Şimdi") else hm(at)) + " · " + shown
            val w = words(context, store, listOf(title, r.optString("why")))
            channel(context, "rules", "Uyarılarım", "My warnings", store.lang, NotificationManager.IMPORTANCE_DEFAULT)
            val nb = NotificationCompat.Builder(context, "rules")
                .setSmallIcon(R.drawable.ic_stat_warn).setContentTitle(w[0]).setContentText(w[1])
                .setStyle(NotificationCompat.BigTextStyle().bigText(w[1]))
                .setCategory(NotificationCompat.CATEGORY_REMINDER).setContentIntent(open(context)).setAutoCancel(true)
                .setTimeoutAfter((at - now).coerceAtLeast(0) + 2 * HOUR)
            val notif = privateOnLock(context, nb, "rules", e, w[0], if (e) "One of your warnings" else "Uyarılarından biri").build()
            post(context, ID_RULE + (n % 90), notif)
            sentToday.add(id)
        }
        store.markSent("rules", today() + "|" + sentToday.joinToString(","))
    }
}

/** The live trip card's next look (every 5 minutes during a trip). */
class ExtrasWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val store = Store(applicationContext)
        val main = store.forecast?.let { runCatching { JSONObject(it) }.getOrNull() }?.optJSONObject("main") ?: return Result.success()
        runCatching { Extras.check(applicationContext, main) }
        return Result.success()
    }
}

/** 40 minutes before a routine trip: what to wear for it (refreshes the forecast first when it can). */
class DepartWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        runCatching { com.negiysem.app.data.Updater.refresh(applicationContext) }
        runCatching { Extras.depart(applicationContext) }
        return Result.success()
    }
}
