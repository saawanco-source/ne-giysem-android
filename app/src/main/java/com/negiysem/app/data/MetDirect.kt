package com.negiysem.app.data

import android.content.Context
import androidx.javascriptengine.JavaScriptSandbox
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.concurrent.TimeUnit

/**
 * The weather without the app's server (when it can't be reached, e.g. *.pages.dev blocked by the network):
 * MET Norway's forecast fetched directly, made into the same Open-Meteo-shaped forecast the server answers with by the
 * server's own code (assets www/forecast-lib.js, built from web/functions/_lib) running in Android's JavaScript sandbox.
 */
object MetDirect {
    /** MET asks every app to name itself and give a way to reach its maker. */
    const val USER_AGENT = "NeGiysem-Android/2.0 (+https://ne-giysem.pages.dev; saawanco@gmail.com)"

    /** MET's address; tests point it somewhere unreachable. */
    @Volatile internal var base = "https://api.met.no"

    private fun metUrl(lat: Double, lon: Double) =
        "$base/weatherapi/locationforecast/2.0/complete?lat=%.2f&lon=%.2f".format(Locale.US, lat, lon)

    private fun get(url: String): String {
        val conn = URL(url).openConnection() as HttpURLConnection
        try {
            conn.connectTimeout = 12_000
            conn.readTimeout = 15_000
            conn.setRequestProperty("Accept", "application/json")
            conn.setRequestProperty("User-Agent", USER_AGENT)
            val code = conn.responseCode
            if (code !in 200..299) throw IOException("MET HTTP $code")
            return conn.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            conn.disconnect()
        }
    }

    /** Whether this phone can run the builder (Android's JavaScript sandbox comes with an up-to-date WebView). */
    fun supported(): Boolean = runCatching { JavaScriptSandbox.isSupported() }.getOrDefault(false)

    /** Forecasts for [points] (lat to lon), in order. Blocking: call from a background thread. */
    fun forecasts(context: Context, points: List<Pair<Double, Double>>, now: Long = System.currentTimeMillis()): List<JSONObject> {
        if (!supported()) throw IOException("no JavaScript sandbox on this phone")
        // The same ~1 km cell is fetched once.
        val cells = points.map { (la, lo) -> Math.round(la * 100) / 100.0 to Math.round(lo * 100) / 100.0 }
        val met = cells.distinct().associateWith { (la, lo) -> get(metUrl(la, lo)) }
        val sandbox = JavaScriptSandbox.createConnectedInstanceAsync(context.applicationContext).get(15, TimeUnit.SECONDS)
        try {
            val isolate = sandbox.createIsolate()
            try {
                val lib = context.assets.open("www/forecast-lib.js").bufferedReader(Charsets.UTF_8).use { it.readText() }
                isolate.evaluateJavaScriptAsync("$lib\n;typeof NGForecast").get(15, TimeUnit.SECONDS)
                return cells.map { cell ->
                    val js = "JSON.stringify(NGForecast.fromMet(${met.getValue(cell)}, ${cell.first}, ${cell.second}, $now))"
                    JSONObject(isolate.evaluateJavaScriptAsync(js).get(20, TimeUnit.SECONDS))
                }
            } finally {
                isolate.close()
            }
        } finally {
            sandbox.close()
        }
    }
}
