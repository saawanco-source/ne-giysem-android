package com.negiysem.app.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Calendar
import kotlin.math.max
import kotlin.math.roundToInt

/** "My day": the routine from the app screen, turned into outdoor moments and a route suggestion (same rules as index.html). */
object Day {

    data class Place(val id: String, val name: String, val lat: Double, val lon: Double)
    data class Step(val m: String, val min: Int, val slope: String)
    data class Route(val id: String, val from: String, val to: String, val name: String, val steps: List<Step>)
    data class Trip(val id: String, val from: String, val to: String, val time: String, val days: List<Int>)
    data class Routine(val dayMode: Boolean, val places: List<Place>, val routes: List<Route>, val trips: List<Trip>)

    private data class W(val time: String, val app: Double, val t: Double, val p: Double, val code: Int, val wind: Double, val day: Boolean)
    private data class Out(val time: String, val end: Long, val min: Int, val app: Double, val t: Double, val p: Double,
                           val code: Int, val wind: Double, val day: Boolean, val place: String)
    private data class Ex(val out: List<Out>, val total: Int, val outMin: Int, val start: Long, val end: Long)

    data class Result(val input: Outfit.Input?, val next: String?)

    private const val WAIT_HEAT = -1.5
    private fun slopeHeat(s: String) = when (s) { "up" -> 3.5; "steep" -> 5.0; else -> 2.0 }
    private fun isOutdoor(m: String) = m == "walk" || m == "wait"

    fun parse(json: String?): Routine? {
        if (json.isNullOrBlank()) return null
        return runCatching {
            val o = JSONObject(json)
            fun arr(k: String): JSONArray = o.optJSONArray(k) ?: JSONArray()
            val places = arr("places").let { a ->
                (0 until a.length()).mapNotNull { i ->
                    val p = a.optJSONObject(i) ?: return@mapNotNull null
                    val lat = p.optDouble("lat", Double.NaN); val lon = p.optDouble("lon", Double.NaN)
                    if (lat.isNaN() || lon.isNaN()) null else Place(p.optString("id"), p.optString("name"), lat, lon)
                }
            }
            val routes = arr("routes").let { a ->
                (0 until a.length()).mapNotNull { i ->
                    val r = a.optJSONObject(i) ?: return@mapNotNull null
                    val st = r.optJSONArray("steps") ?: JSONArray()
                    val steps = (0 until st.length()).mapNotNull { j ->
                        st.optJSONObject(j)?.let { s -> Step(s.optString("m", "bus"), max(0, s.optInt("min", 0)), s.optString("slope", "flat")) }
                    }
                    Route(r.optString("id"), r.optString("from"), r.optString("to"), r.optString("name", "Rota"), steps)
                }
            }
            val trips = arr("trips").let { a ->
                (0 until a.length()).mapNotNull { i ->
                    val t = a.optJSONObject(i) ?: return@mapNotNull null
                    val d = t.optJSONArray("days") ?: JSONArray()
                    Trip(t.optString("id"), t.optString("from"), t.optString("to"), t.optString("time", "08:00"), (0 until d.length()).map { d.optInt(it, -1) })
                }
            }
            Routine(o.optBoolean("dayMode", true), places, routes, trips)
        }.getOrNull()
    }

    /** Places the forecast is needed for, in a fixed order. */
    fun tripPlaces(r: Routine): List<Place> {
        val ids = LinkedHashSet<String>()
        r.trips.forEach { ids.add(it.from); ids.add(it.to) }
        return ids.mapNotNull { id -> r.places.firstOrNull { it.id == id } }
    }

    private fun JSONArray?.dbl(i: Int): Double = if (this == null || i >= length() || isNull(i)) Double.NaN else optDouble(i, Double.NaN)

    private fun wxAt(wx: JSONObject?, ms: Long): W? {
        val h = wx?.optJSONObject("hourly") ?: return null
        val times = h.optJSONArray("time") ?: return null
        val key = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH").withZone(ZoneOffset.UTC)
            .format(Instant.ofEpochMilli(ms + wx.optLong("utc_offset_seconds", 0L) * 1000))
        var i = -1
        for (k in 0 until times.length()) if (times.optString(k).take(13) == key) { i = k; break }
        if (i < 0) return null
        val app = h.optJSONArray("apparent_temperature").dbl(i)
        if (app.isNaN()) return null
        return W(
            time = times.optString(i), app = app, t = h.optJSONArray("temperature_2m").dbl(i),
            p = h.optJSONArray("precipitation_probability").dbl(i).let { if (it.isNaN()) 0.0 else it },
            code = h.optJSONArray("weather_code")?.optInt(i, 3) ?: 3,
            wind = h.optJSONArray("wind_speed_10m").dbl(i).let { if (it.isNaN()) 0.0 else it },
            day = (h.optJSONArray("is_day")?.optInt(i, 1) ?: 1) == 1
        )
    }

    private fun exposure(trip: Trip, route: Route, start: Long, byPlace: Map<String, JSONObject>): Ex {
        val total = max(1, route.steps.sumOf { it.min })
        var t = start
        var acc = 0
        var outMin = 0
        val out = ArrayList<Out>()
        for (st in route.steps) {
            val mid = t + st.min * 30_000L
            val frac = (acc + st.min / 2.0) / total
            val pid = if (frac < 0.5) trip.from else trip.to
            val w = wxAt(byPlace[pid], mid)
            val end = t + st.min * 60_000L
            if (isOutdoor(st.m)) {
                outMin += st.min
                if (w != null) {
                    val heat = if (st.m == "walk") slopeHeat(st.slope) else WAIT_HEAT
                    out.add(Out(w.time, end, st.min, w.app + heat, w.t, w.p, w.code, if (st.m == "wait") w.wind else w.wind * 0.6, w.day, pid))
                }
            }
            t = end
            acc += st.min
        }
        return Ex(out, total, outMin, start, start + total * 60_000L)
    }

    private fun score(ex: Ex): Double {
        var s = ex.total.toDouble()
        for (e in ex.out) s += e.min * (e.p / 100.0) * 2.5 + e.min * max(0.0, 10 - e.app) / 8 + e.min * max(0.0, e.app - 28) / 6
        return s
    }

    private fun atTime(hhmm: String, dayOffset: Int): Long {
        val parts = hhmm.split(":")
        val c = Calendar.getInstance()
        c.add(Calendar.DAY_OF_YEAR, dayOffset)
        c.set(Calendar.HOUR_OF_DAY, parts.getOrNull(0)?.toIntOrNull() ?: 8)
        c.set(Calendar.MINUTE, parts.getOrNull(1)?.toIntOrNull() ?: 0)
        c.set(Calendar.SECOND, 0)
        c.set(Calendar.MILLISECOND, 0)
        return c.timeInMillis
    }

    private data class Item(val trip: Trip, val route: Route?, val ex: Ex?, val tomorrow: Boolean)

    fun compute(r: Routine, byPlace: Map<String, JSONObject>, now: Long = System.currentTimeMillis()): Result? {
        if (!r.dayMode || r.trips.isEmpty() || byPlace.isEmpty()) return null
        val todayDow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1 // 0 = Sunday, like JavaScript
        fun place(id: String) = r.places.firstOrNull { it.id == id }

        fun pick(offset: Int): List<Item> {
            val dow = (todayDow + offset) % 7
            val list = ArrayList<Item>()
            for (t in r.trips.filter { dow in it.days && place(it.from) != null && place(it.to) != null }.sortedBy { it.time }) {
                val start = atTime(t.time, offset)
                val routes = r.routes.filter { it.from == t.from && it.to == t.to && it.steps.isNotEmpty() }
                if (routes.isEmpty()) { if (start > now) list.add(Item(t, null, null, offset > 0)); continue }
                val best = routes.map { it to exposure(t, it, start, byPlace) }.minByOrNull { score(it.second) } ?: continue
                if (best.second.end < now) continue
                list.add(Item(t, best.first, best.second, offset > 0))
            }
            return list
        }

        var items = pick(0)
        if (items.isEmpty() && Calendar.getInstance().get(Calendar.HOUR_OF_DAY) >= 17) items = pick(1)
        if (items.isEmpty()) return Result(null, null)

        val first = items.first()
        val fromName = place(first.trip.from)?.name ?: ""
        val toName = place(first.trip.to)?.name ?: ""
        val next = buildString {
            if (first.tomorrow) append("Yarın ")
            append(first.trip.time).append(" ").append(fromName).append(" → ").append(toName)
            if (first.route != null && first.ex != null) append(" · ").append(first.route.name).append(" · dışarıda ").append(first.ex.outMin).append(" dk")
        }

        val exps = items.flatMap { it.ex?.out ?: emptyList() }.filter { it.end > now }
        if (exps.isEmpty()) return Result(null, next)
        val e0 = exps.first()
        val daily = byPlace[e0.place]?.optJSONObject("daily")
        val dTimes = daily?.optJSONArray("time")
        var di = -1
        if (dTimes != null) for (i in 0 until dTimes.length()) if (dTimes.optString(i) == e0.time.take(10)) { di = i; break }
        val uv = if (di >= 0) daily?.optJSONArray("uv_index_max").dbl(di).takeIf { !it.isNaN() } else null
        val input = Outfit.Input(
            now = Outfit.Now(t = if (e0.t.isNaN()) e0.app else e0.t, app = e0.app, code = e0.code, isDay = e0.day,
                wind = e0.wind, gust = 0.0, dir = null, rh = null, precip = 0.0),
            window = exps.map { Outfit.Hour(it.time, it.app, it.p, it.code, it.wind) },
            uvMax = uv,
            uvDay = exps.any { (it.time.substring(11, 13).toIntOrNull() ?: 0) in 10..16 }
        )
        return Result(input, next)
    }

    fun roundMinutes(v: Double) = v.roundToInt()
}
