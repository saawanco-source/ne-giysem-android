package com.negiysem.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.util.Locale

/** Small on-device store shared by the app screen, the widget and the background refresh. */
class Store(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("negiysem", Context.MODE_PRIVATE)

    val lat: Double? get() = prefs.getString("lat", null)?.toDoubleOrNull()
    val lon: Double? get() = prefs.getString("lon", null)?.toDoubleOrNull()
    val placeName: String? get() = prefs.getString("place", null)
    val feel: String get() = prefs.getString("feel", "normal") ?: "normal"
    val act: String get() = prefs.getString("act", "city") ?: "city"
    val hours: Int get() = prefs.getInt("hours", 6)
    /** The person the app screen is dressing: age group and the pieces missing from their wardrobe. */
    val who: String get() = prefs.getString("who", "me") ?: "me"
    val missing: Set<String> get() = prefs.getString("missing", "")?.split(",")?.filter { it.isNotBlank() }?.toSet() ?: emptySet()
    /**
     * "tr" or "en", as chosen on the app screen; until the app sends one, the phone's language decides
     * (Turkish on a Turkish phone, English otherwise), like the page.
     */
    val lang: String get() = prefs.getString("lang", null)?.takeIf { it == "tr" || it == "en" } ?: deviceLang()
    val widgetJson: String? get() = prefs.getString("widget", null)
    val routineJson: String? get() = prefs.getString("routine", null)
    /** When the forecast the widget shows was fetched (not when it was last redrawn from it). */
    val updatedAt: Long get() = prefs.getLong("updated", 0L)
    /**
     * The last forecasts fetched: {"at", "lat", "lon", "name", "main": forecast, "places": {trip place id: forecast}}.
     * Seven days hour by hour, so without a connection the widget still moves on with the clock.
     */
    val forecast: String? get() = prefs.getString("forecast", null)
    /** Set by "Tüm verilerimi sil": until a new place is chosen the widget stays empty (no location lookup). */
    val wiped: Boolean get() = prefs.getBoolean("wiped", false)
    /** Changes on every wipe, so a refresh that started before it never writes the deleted data back. */
    val generation: Int get() = prefs.getInt("gen", 0)

    /** The person turned severe-weather notifications on in the app (Android's own permission is checked separately). */
    val alertsOn: Boolean get() = prefs.getBoolean("alerts", false)
    /** Android's notification permission was asked at least once (after a refusal only the phone's settings can grant it). */
    val alertsAsked: Boolean get() = prefs.getBoolean("alertsAsked", false)
    /** Warnings already sent: {kind: {"lv", "until"}}, so one storm is announced once (again only if it gets worse). */
    val alerted: String? get() = prefs.getString("alerted", null)

    fun setAlerts(on: Boolean) { prefs.edit().putBoolean("alerts", on).apply() }
    fun markAlertsAsked() { prefs.edit().putBoolean("alertsAsked", true).apply() }
    fun saveAlerted(json: String) { prefs.edit().putString("alerted", json).apply() }

    fun isStale(maxAgeMs: Long = 15 * 60_000L) = System.currentTimeMillis() - updatedAt > maxAgeMs

    /**
     * Saves what the app screen sends over. Returns true when something the widget depends on changed,
     * so the caller can refresh it.
     */
    fun saveFromApp(json: String): Boolean {
        val o = runCatching { JSONObject(json) }.getOrNull() ?: return false
        val e = prefs.edit()
        var changed = false
        val feel = o.optString("feel", feel)
        val act = o.optString("act", act)
        val hours = o.optInt("hours", hours)
        val who = o.optString("who", "me").takeIf { it in setOf("me", "child", "elder") } ?: "me"
        val miss = o.optJSONArray("missing")?.let { a -> (0 until a.length()).map { a.optString(it) }.filter { it.matches(Regex("[a-z]{2,12}")) } }
            ?.sorted()?.joinToString(",") ?: ""
        if (feel != this.feel || act != this.act || hours != this.hours || who != this.who || miss != prefs.getString("missing", "")) changed = true
        e.putString("feel", feel).putString("act", act).putInt("hours", hours).putString("who", who).putString("missing", miss)
        // The widget speaks the app's language: a new one redraws it.
        val newLang = o.optString("lang", "").takeIf { it == "tr" || it == "en" }
        if (newLang != null) {
            if (newLang != prefs.getString("lang", null)) changed = true
            e.putString("lang", newLang)
        }
        val place = o.optJSONObject("place")
        if (place != null) {
            val la = place.optDouble("lat", Double.NaN)
            val lo = place.optDouble("lon", Double.NaN)
            if (!la.isNaN() && !lo.isNaN()) {
                val oldLat = lat; val oldLon = lon
                if (oldLat == null || oldLon == null || kotlin.math.abs(oldLat - la) > 0.01 || kotlin.math.abs(oldLon - lo) > 0.01) changed = true
                e.putString("lat", la.toString()).putString("lon", lo.toString())
                if (place.optString("name", "Konumun") != placeName) changed = true
                e.putString("place", place.optString("name", "Konumun"))
                e.remove("wiped")
            }
        }
        val routine = o.optJSONObject("routine")?.toString()
        if (routine != null && routine != routineJson) {
            changed = true
            e.putString("routine", routine)
        }
        e.apply()
        return changed
    }

    /** Forgets every place, routine, preference and cached forecast. */
    fun clear() {
        val gen = generation + 1
        prefs.edit().clear().putBoolean("wiped", true).putInt("gen", gen).commit()
    }

    fun saveForecast(json: String) {
        prefs.edit().putString("forecast", json).apply()
    }

    /** [fetchedAt]: when its forecast was fetched; a redraw from an older forecast keeps that time. */
    fun saveWidget(json: String, fetchedAt: Long) {
        prefs.edit().putString("widget", json).putLong("updated", fetchedAt).apply()
    }

    companion object {
        fun deviceLang(): String = if (Locale.getDefault().language == "tr") "tr" else "en"

        /** The compact snapshot the widget draws; its texts are in [lang], which the widget's own words follow too. */
        fun widgetSnapshot(
            plan: Outfit.Plan, input: Outfit.Input, place: String, next: String? = null, lang: String = "tr",
            updated: Long = System.currentTimeMillis(), alert: JSONObject? = null,
        ): String {
            val o = JSONObject()
            if (!next.isNullOrBlank()) o.put("next", next)
            o.put("lang", lang)
            o.put("level", plan.level)
            o.put("headline", plan.headline)
            o.put("temp", input.now.t)
            o.put("feels", input.now.app)
            o.put("cond", Outfit.condition(input.now.code, lang))
            o.put("isDay", input.now.isDay)
            o.put("place", place)
            o.put("updated", updated)
            o.put("wear", JSONArray().apply { plan.wear.forEach { put(JSONObject().put("g", it.g).put("label", it.label)) } })
            o.put("take", JSONArray().apply { plan.take.forEach { put(JSONObject().put("g", it.g).put("label", it.label)) } })
            o.put("pills", JSONArray().apply { plan.pills.forEach { put(it) } })
            if (alert != null) o.put("alert", alert)
            return o.toString()
        }
    }
}
