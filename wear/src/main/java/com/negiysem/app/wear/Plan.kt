package com.negiysem.app.wear

import android.content.Context
import android.graphics.Color
import android.text.format.DateFormat
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Date
import java.util.Locale

/** One garment of the phone's outfit: its sticker key ("mont") and its name in the phone app's language ("Mont"). */
data class Garment(val g: String, val label: String)

/** The most dangerous weather warning, as the phone's widget shows it; gone after [until]. */
data class Warning(val lv: Int, val title: String, val short: String, val whenText: String, val until: Long)

/**
 * The phone's widget snapshot (app: Store.widgetSnapshot), read on the watch. Texts come in the phone app's language.
 */
data class Plan(
    val lang: String,
    val level: Int,
    val levelName: String,
    val color: Int,
    val headline: String,
    val temp: Double,
    val feels: Double,
    val cond: String,
    val place: String,
    val wear: List<Garment>,
    val take: List<Garment>,
    val warning: Warning?,
    val next: String,
    /** When the phone fetched the forecast behind it. */
    val updated: Long,
) {
    val tempText: String get() = deg(temp)

    /** The garment that says most about the weather: the outer layer if there is one, else the first one worn. */
    val key: Garment? get() = wear.firstOrNull { it.g in OUTER } ?: wear.firstOrNull()

    fun liveWarning(now: Long = System.currentTimeMillis()): Warning? = warning?.takeIf { now < it.until }

    companion object {
        private val OUTER = listOf("parka", "sisme", "kaban", "mont", "yagmurluk", "ruzgarlik", "ceket", "kazak", "hirka", "sweatshirt")
        private val LEVEL_COLORS = longArrayOf(0xFF86AEFF, 0xFF9CCBF7, 0xFF86D6C6, 0xFFAEDD8E, 0xFFE6E86E, 0xFFFFD65E, 0xFFFFAD62, 0xFFFF8270)

        fun deg(v: Double): String {
            if (v.isNaN()) return "—"
            val r = Math.round(v).toInt()
            return (if (r < 0) "−${-r}" else "$r") + "°"
        }

        fun parse(json: String?): Plan? {
            if (json.isNullOrBlank()) return null
            return runCatching {
                val o = JSONObject(json)
                fun list(key: String): List<Garment> {
                    val a = o.optJSONArray(key) ?: return emptyList()
                    return (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { Garment(it.optString("g"), it.optString("label")) } }
                }
                val level = o.optInt("level", 4).coerceIn(0, 7)
                Plan(
                    lang = o.optString("lang", "tr").takeIf { it == "en" } ?: "tr",
                    level = level,
                    levelName = o.optString("levelName", ""),
                    color = runCatching { Color.parseColor(o.optString("color")) }.getOrDefault(LEVEL_COLORS[level].toInt()),
                    headline = o.optString("headline").replace("{", "").replace("}", ""),
                    temp = o.optDouble("temp", Double.NaN),
                    feels = o.optDouble("feels", Double.NaN),
                    cond = o.optString("cond"),
                    place = o.optString("place"),
                    wear = list("wear"),
                    take = list("take"),
                    warning = o.optJSONObject("alert")?.let { a ->
                        Warning(a.optInt("lv", 1).coerceIn(1, 2), a.optString("title"), a.optString("short"), a.optString("when"), a.optLong("until"))
                            .takeIf { it.title.isNotBlank() }
                    },
                    next = o.optString("next", ""),
                    updated = o.optLong("updated", 0L),
                )
            }.getOrNull()
        }

        /** What the complication pickers show before there is any data. */
        fun sample(turkish: Boolean) = Plan(
            lang = if (turkish) "tr" else "en", level = 4, levelName = if (turkish) "Serin" else "Cool", color = LEVEL_COLORS[4].toInt(),
            headline = if (turkish) "Sweatshirt havası, ince ceketi yanına al." else "Sweatshirt weather, take a light jacket.",
            temp = 15.0, feels = 13.0, cond = "", place = if (turkish) "Beşiktaş" else "Brighton",
            wear = listOf(Garment("sweatshirt", "Sweatshirt"), Garment("jean", if (turkish) "Jean" else "Jeans"), Garment("sneaker", "Sneaker")),
            take = listOf(Garment("ceket", if (turkish) "İnce ceket" else "Light jacket")), warning = null, next = "",
            updated = System.currentTimeMillis(),
        )
    }
}

/** The last snapshot from the phone. */
class PlanStore(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("negiysem-wear", Context.MODE_PRIVATE)

    val json: String? get() = prefs.getString("plan", null)
    fun plan(): Plan? = Plan.parse(json)
    fun save(json: String) { prefs.edit().putString("plan", json).putLong("received", System.currentTimeMillis()).putBoolean("wiped", false).apply() }
    /** The phone deleted everything: nothing is asked for until it sends something again. Active slots are kept. */
    fun clear() {
        val slots = activeSlots
        prefs.edit().clear().putBoolean("wiped", true).putStringSet("slots", slots).apply()
    }
    val wiped: Boolean get() = prefs.getBoolean("wiped", false)

    /** The complication's instances now on a watch face (ActiveSlots). */
    var activeSlots: Set<String>
        get() = prefs.getStringSet("slots", emptySet())?.toSet() ?: emptySet()
        set(v) { prefs.edit().putStringSet("slots", v).apply() }

    /** When the phone was last asked for a fresh outfit (PhoneListener.ask), so it isn't asked over and over. */
    var asked: Long
        get() = prefs.getLong("asked", 0L)
        set(v) { prefs.edit().putLong("asked", v).apply() }

    companion object {
        /**
         * Older than this, the outfit may no longer fit the weather: the complication shows nothing instead (the phone's
         * widget says "Son güncelleme" after two hours), and the watch asks the phone for a new one.
         */
        const val MAX_AGE_MS = 3 * 3_600_000L

        /** "08:10", "dün 08:10" / "yesterday 08:10", "24 Eki 08:10": when something happened, with the day when it isn't today. */
        fun stamp(context: Context, ms: Long): String {
            val at = Instant.ofEpochMilli(ms).atZone(ZoneId.systemDefault())
            val time = DateFormat.getTimeFormat(context).format(Date(ms))
            return when (ChronoUnit.DAYS.between(at.toLocalDate(), LocalDate.now())) {
                0L -> time
                1L -> context.getString(R.string.yesterday_at, time)
                else -> at.format(DateTimeFormatter.ofPattern("d MMM", Locale.getDefault())) + " " + time
            }
        }
    }
}
