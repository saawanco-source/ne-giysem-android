package com.negiysem.app.data

import android.content.Context
import com.negiysem.app.Config
import com.negiysem.app.widget.NeGiysemWidget
import com.negiysem.app.work.AlertNotifier
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.json.JSONTokener
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

/** Fetches the weather for the saved place (and every routine place) and redraws every widget. */
object Updater {

    /** The app's server; tests point it somewhere unreachable to try the way without it. */
    @Volatile internal var apiBase: String = Config.API

    /** The server answered, but with an error (a connection that didn't get through is a plain IOException). */
    private class HttpError(val code: Int) : IOException("HTTP $code")

    private fun getText(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 10_000
            conn.readTimeout = 12_000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("User-Agent", MetDirect.USER_AGENT)
            val code = conn.responseCode
            if (code !in 200..299) throw HttpError(code)
            return conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /**
     * The server for this request, or "" when there is none or it couldn't be reached lately (then the free services
     * are asked directly: MET Norway for the weather, BigDataCloud for the rough location).
     */
    private fun server(store: Store): String = apiBase.takeIf { it.isNotEmpty() && !store.apiDown } ?: ""

    /**
     * Runs [call] against the server; a connection that doesn't get through marks it unreachable for a while, and so does
     * a server that is out of its daily quota or failing (429, 5xx): the free services are asked instead.
     */
    private fun <T> viaServer(store: Store, call: () -> T): T = try {
        call()
    } catch (e: HttpError) {
        if (e.code == 429 || e.code >= 500) { store.markApiDown(); throw IOException("server ${e.code}") }
        throw e
    } catch (e: IOException) {
        store.markApiDown()
        throw e
    }

    private fun getJson(url: String): JSONObject = JSONObject(getText(url))

    /** Open-Meteo answers a single object for one place and a list for several. */
    private fun coords(points: List<Pair<Double, Double>>, fmt: String): String =
        "latitude=" + points.joinToString(",") { String.format(Locale.US, fmt, it.first) } +
            "&longitude=" + points.joinToString(",") { String.format(Locale.US, fmt, it.second) }

    private fun getForecasts(context: Context, store: Store, points: List<Pair<Double, Double>>): List<JSONObject> {
        val q = coords(points, "%.4f")
        if (apiBase.isNotEmpty()) {
            // The app's own server answers in the same shape (MET Norway data); out of reach, MET Norway directly.
            // It takes 8 points a request and works at 2 decimals (about 1 km): home and work aren't sent more precisely.
            val api = server(store)
            if (api.isNotEmpty()) {
                try {
                    return points.chunked(8).flatMap { part -> parseForecasts(viaServer(store) { getText("$api/api/forecast?" + coords(part, "%.2f")) }) }
                } catch (e: HttpError) {
                    throw e
                } catch (e: IOException) { /* unreachable: MET directly, below */ }
            }
            return MetDirect.forecasts(context, points)
        }
        // Development without a server: Open-Meteo directly (non-commercial).
        val url = "https://api.open-meteo.com/v1/forecast?" + q +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day" +
            "&hourly=temperature_2m,apparent_temperature,precipitation_probability,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day" +
            "&daily=uv_index_max,sunset&timezone=auto&forecast_days=7"
        return parseForecasts(getText(url))
    }

    private fun parseForecasts(text: String): List<JSONObject> {
        return when (val v = JSONTokener(text).nextValue()) {
            is JSONArray -> (0 until v.length()).mapNotNull { v.optJSONObject(it) }
            is JSONObject -> listOf(v)
            else -> throw IOException("unexpected forecast")
        }
    }

    /**
     * Fetches the forecasts (when there is a connection) and redraws every widget from the newest ones kept.
     * Without a connection the widget is still redrawn for the current hour from the forecast fetched last.
     * Returns whether the fetch worked; throws only when there is nothing at all to draw.
     */
    suspend fun refresh(context: Context): Boolean {
        val store = Store(context)
        val gen = store.generation
        if (store.wiped && store.lat == null) {
            // Everything was deleted in the app: show the empty widget, look nothing up.
            NeGiysemWidget.pushAll(context, "")
            return true
        }
        val failure: Exception? = withContext(Dispatchers.IO) {
            try { fetch(context, store, gen); null } catch (e: Exception) { e }
        }
        val cached = store.forecast?.let { runCatching { JSONObject(it) }.getOrNull() }?.takeIf { forThisPlace(store, it) }
            ?: throw (failure ?: IOException("no forecast"))
        val snapshot = withContext(Dispatchers.IO) { snapshot(store, cached) }
            ?: throw (failure ?: IOException("forecast no longer covers this hour"))
        if (Store(context).generation != gen) return failure == null // data was deleted while this refresh ran
        store.saveWidget(snapshot, cached.optLong("at"))
        store.clearFail()
        NeGiysemWidget.pushAll(context, snapshot)
        WatchSync.send(context, snapshot)
        cached.optJSONObject("main")?.let { main ->
            runCatching { AlertNotifier.check(context, main, Outfit.ownName(store.placeName ?: cached.optString("name", "Konumun"), store.lang)) }
        }
        return failure == null
    }

    /** Looks the forecasts up for the saved place (or the connection's rough location) and every routine place. */
    private fun fetch(context: Context, store: Store, gen: Int) {
        val lang = store.lang
        var lat = store.lat
        var lon = store.lon
        var name = store.placeName ?: "Konumun"
        if (lat == null || lon == null) {
            // No place chosen in the app yet: approximate location from the internet connection.
            val bdc = "https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=$lang"
            val api = server(store)
            val ip = if (api.isEmpty()) getJson(bdc) else try {
                JSONObject(viaServer(store) { getText("$api/api/ip") })
            } catch (e: HttpError) {
                throw e
            } catch (e: IOException) {
                getJson(bdc)
            }
            val la = ip.optDouble("latitude", Double.NaN)
            val lo = ip.optDouble("longitude", Double.NaN)
            if (la.isNaN() || lo.isNaN()) throw IOException("no location")
            lat = la
            lon = lo
            // A JSON null ("city": null when the network's location has no city) is no name, not the text "null".
            fun text(k: String) = if (ip.isNull(k)) "" else ip.optString(k)
            name = text("city").ifBlank { text("locality") }.ifBlank { "Konumun" }
        }
        val routine = Day.parse(store.routineJson)?.takeIf { it.dayMode && it.trips.isNotEmpty() }
        val tripPlaces = routine?.let { Day.tripPlaces(it) } ?: emptyList()
        val all = getForecasts(context, store, listOf(lat to lon) + tripPlaces.map { it.lat to it.lon })
        val main = all.firstOrNull() ?: throw IOException("unexpected forecast")
        val places = JSONObject()
        tripPlaces.forEachIndexed { i, p -> all.getOrNull(i + 1)?.let { places.put(p.id, it) } }
        if (store.generation != gen) return // deleted meanwhile: keep nothing
        store.saveForecast(
            JSONObject().put("at", System.currentTimeMillis()).put("lat", lat).put("lon", lon).put("name", name)
                .put("main", main).put("places", places).toString()
        )
    }

    /** A kept forecast belongs to the place chosen now (one from the connection's location is fine without a choice). */
    private fun forThisPlace(store: Store, cached: JSONObject): Boolean {
        val lat = store.lat ?: return true
        val lon = store.lon ?: return true
        return kotlin.math.abs(cached.optDouble("lat", 999.0) - lat) < 0.01 && kotlin.math.abs(cached.optDouble("lon", 999.0) - lon) < 0.01
    }

    /** The widget's snapshot for this hour from a kept forecast; null when it no longer covers the current hour. */
    private fun snapshot(store: Store, cached: JSONObject): String? {
        val lang = store.lang
        val at = cached.optLong("at")
        val main = cached.optJSONObject("main") ?: return null
        val byPlace = HashMap<String, JSONObject>()
        cached.optJSONObject("places")?.let { o -> o.keys().forEach { k -> o.optJSONObject(k)?.let { byPlace[k] = it } } }
        val routine = Day.parse(store.routineJson)?.takeIf { it.dayMode && it.trips.isNotEmpty() }
        // Within 45 minutes of the fetch the measured "now" is used, after that the forecast for the current hour.
        val input = Outfit.parse(main, store.hours, at) ?: return null
        val day = routine?.let { Day.compute(it, byPlace, lang = lang) }
        val plan = Outfit.plan(day?.input ?: input, store.feel, store.act, store.who, store.missing, lang)
        val name = store.placeName ?: cached.optString("name", "Konumun")
        return Store.widgetSnapshot(plan, input, Outfit.ownName(name, lang), day?.next, lang, at, alertFor(main, lang))
    }

    /**
     * The most dangerous warning for the widget: its words, when it ends (the widget drops it then) and how many others
     * there are. The widget is redrawn every half hour, so "yarın" and the hours stay right.
     */
    private fun alertFor(main: JSONObject, lang: String, now: Long = System.currentTimeMillis()): JSONObject? {
        val all = Alerts.find(main, now)
        val a = all.firstOrNull() ?: return null
        return JSONObject().put("k", a.k).put("lv", a.lv)
            .put("title", Alerts.info(main, a, now, lang).title).put("short", Alerts.short(a, lang))
            .put("when", Alerts.whenText(main, a, now, lang)).put("until", Alerts.untilMs(main, a)).put("more", all.size - 1)
    }
}
