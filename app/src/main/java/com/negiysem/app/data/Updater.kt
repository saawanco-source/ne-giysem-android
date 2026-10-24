package com.negiysem.app.data

import android.content.Context
import com.negiysem.app.widget.NeGiysemWidget
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

/** Fetches the weather for the saved place and redraws every widget. */
object Updater {

    private fun getJson(url: String): JSONObject {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 12_000
            conn.readTimeout = 12_000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("User-Agent", "NeGiysem-Android/1.0")
            val code = conn.responseCode
            if (code !in 200..299) throw IOException("HTTP $code")
            val text = conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
            return JSONObject(text)
        } finally {
            conn.disconnect()
        }
    }

    private fun forecastUrl(lat: Double, lon: Double): String =
        "https://api.open-meteo.com/v1/forecast?latitude=%.4f&longitude=%.4f".format(java.util.Locale.US, lat, lon) +
            "&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,wind_gusts_10m,wind_direction_10m,is_day" +
            "&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,is_day" +
            "&daily=uv_index_max,sunset&timezone=auto&forecast_days=2"

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
            val wx = getJson(forecastUrl(lat, lon))
            val input = Outfit.parse(wx, store.hours) ?: throw IOException("unexpected forecast")
            val plan = Outfit.plan(input, store.feel, store.act)
            Store.widgetSnapshot(plan, input, name)
        }
        store.saveWidget(snapshot)
        NeGiysemWidget.pushAll(context, snapshot)
    }
}
