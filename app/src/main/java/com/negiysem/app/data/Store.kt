package com.negiysem.app.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/** Small on-device store shared by the app screen, the widget and the background refresh. */
class Store(context: Context) {
    private val prefs = context.applicationContext.getSharedPreferences("negiysem", Context.MODE_PRIVATE)

    val lat: Double? get() = prefs.getString("lat", null)?.toDoubleOrNull()
    val lon: Double? get() = prefs.getString("lon", null)?.toDoubleOrNull()
    val placeName: String? get() = prefs.getString("place", null)
    val feel: String get() = prefs.getString("feel", "normal") ?: "normal"
    val act: String get() = prefs.getString("act", "city") ?: "city"
    val hours: Int get() = prefs.getInt("hours", 6)
    val widgetJson: String? get() = prefs.getString("widget", null)
    val routineJson: String? get() = prefs.getString("routine", null)
    val updatedAt: Long get() = prefs.getLong("updated", 0L)
    /** Set by "Tüm verilerimi sil": until a new place is chosen the widget stays empty (no location lookup). */
    val wiped: Boolean get() = prefs.getBoolean("wiped", false)
    /** Changes on every wipe, so a refresh that started before it never writes the deleted data back. */
    val generation: Int get() = prefs.getInt("gen", 0)

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
        if (feel != this.feel || act != this.act || hours != this.hours) changed = true
        e.putString("feel", feel).putString("act", act).putInt("hours", hours)
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

    fun saveWidget(json: String) {
        prefs.edit().putString("widget", json).putLong("updated", System.currentTimeMillis()).apply()
    }

    companion object {
        /** The compact snapshot the widget draws. */
        fun widgetSnapshot(plan: Outfit.Plan, input: Outfit.Input, place: String, next: String? = null): String {
            val o = JSONObject()
            if (!next.isNullOrBlank()) o.put("next", next)
            o.put("level", plan.level)
            o.put("headline", plan.headline)
            o.put("temp", input.now.t)
            o.put("feels", input.now.app)
            o.put("cond", Outfit.condition(input.now.code))
            o.put("isDay", input.now.isDay)
            o.put("place", place)
            o.put("updated", System.currentTimeMillis())
            o.put("wear", JSONArray().apply { plan.wear.forEach { put(JSONObject().put("g", it.g).put("label", it.label)) } })
            o.put("take", JSONArray().apply { plan.take.forEach { put(JSONObject().put("g", it.g).put("label", it.label)) } })
            o.put("pills", JSONArray().apply { plan.pills.forEach { put(it) } })
            return o.toString()
        }
    }
}
