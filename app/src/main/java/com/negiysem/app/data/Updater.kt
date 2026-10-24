package com.negiysem.app.data

import android.content.Context
import com.negiysem.app.widget.NeGiysemWidget
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

    private fun getText(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 12_000
            conn.readTimeout = 12_000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("User-Agent", "NeGiysem-Android/1.1")
            val code = conn.responseCode
            if (code !in 200..299) throw IOException("HTTP $code")
            return conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    private fun getJson(url: String): JSONObject = JSONObject(getText(url))

    /** Open-Meteo answers a single object for one place and a list for several. */
    private fun getForecasts(points: List<Pair<Double, Double>>): List<JSONObject> {
        val url = "https://api.open-meteo.com/v1/forecast" +
            "?latitude=" + points.joinToString(",") { String.format(Locale.US, "%.4f", it.first) } +
            "&longitude=" + points.joinToString(",") { String.format(Locale.US, "%.4f", it.second) } +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day" +
            "&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,is_day" +
            "&daily=uv_index_max,sunset&timezone=auto&forecast_days=7"
        return when (val v = JSONTokener(getText(url)).nextValue()) {
            is JSONArray -> (0 until v.length()).mapNotNull { v.optJSONObject(it) }
            is JSONObject -> listOf(v)
            else -> throw IOException("unexpected forecast")
        }
    }

    suspend fun refresh(context: Context) {
        val store = Store(context)
        val snapshot = withContext(Dispatchers.IO) {
            var lat = store.lat
            var lon = store.lon
            var name = store.placeName ?: "Konumun"
            if (lat == null || lon == null) {
                // No place chosen in the app yet: approximate location from the internet connection.
                val ip = getJson("https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=tr")
                val la = ip.optDouble("latitude", Double.NaN)
                val lo = ip.optDouble("longitude", Double.NaN)
                if (la.isNaN() || lo.isNaN()) throw IOException("no location")
                lat = la
                lon = lo
                name = ip.optString("city").ifBlank { ip.optString("locality") }.ifBlank { "Konumun" }
            }
            val routine = Day.parse(store.routineJson)?.takeIf { it.dayMode && it.trips.isNotEmpty() }
            val tripPlaces = routine?.let { Day.tripPlaces(it) } ?: emptyList()
            val all = getForecasts(listOf(lat to lon) + tripPlaces.map { it.lat to it.lon })
            val wx = all.firstOrNull() ?: throw IOException("unexpected forecast")
            val byPlace = HashMap<String, JSONObject>()
            tripPlaces.forEachIndexed { i, p -> all.getOrNull(i + 1)?.let { byPlace[p.id] = it } }

            val input = Outfit.parse(wx, store.hours) ?: throw IOException("unexpected forecast")
            val day = routine?.let { Day.compute(it, byPlace) }
            val plan = Outfit.plan(day?.input ?: input, store.feel, store.act)
            Store.widgetSnapshot(plan, input, name, day?.next)
        }
        store.saveWidget(snapshot)
        NeGiysemWidget.pushAll(context, snapshot)
    }
}
