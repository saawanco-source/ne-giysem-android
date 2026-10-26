package com.negiysem.app

import android.annotation.SuppressLint
import android.content.Context
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Handler
import android.os.Looper
import androidx.core.location.LocationManagerCompat

/**
 * The phone's position for the app screen, straight from Android. The WebView's own geolocation asks only the network
 * provider for a low-accuracy position, which fails on phones where that provider is off or slow (e.g. without Google's
 * location accuracy); this asks every provider the phone has (fused, network, GPS) at once and takes the first answer.
 */
class NativeLocator(private val context: Context) {

    /** Answer: a position, or null and why ("geo_off": the phone's location is off; "geo_timeout"; "geo_unavailable"). */
    fun interface Answer { fun done(location: Location?, error: String?) }

    /** Call only with a location permission granted. */
    @SuppressLint("MissingPermission")
    fun locate(answer: Answer) {
        val lm = context.getSystemService(LocationManager::class.java) ?: return answer.done(null, "geo_unavailable")
        if (!LocationManagerCompat.isLocationEnabled(lm)) return answer.done(null, "geo_off")
        val providers = runCatching { lm.getProviders(true) }.getOrDefault(emptyList())
        fun last(): Location? = providers.mapNotNull { runCatching { lm.getLastKnownLocation(it) }.getOrNull() }.maxByOrNull { it.time }
        // A position from the last few minutes is good enough for the weather; no need to wait for a new one.
        last()?.takeIf { System.currentTimeMillis() - it.time < RECENT_MS }?.let { return answer.done(it, null) }
        val use = listOf("fused", LocationManager.NETWORK_PROVIDER, LocationManager.GPS_PROVIDER).filter { it in providers }.ifEmpty { providers }
        // Without a fresh answer an older position will do, if it's from today (not from another trip days ago).
        fun older(): Location? = last()?.takeIf { System.currentTimeMillis() - it.time < OLDEST_MS }
        if (use.isEmpty()) { val l = older(); return answer.done(l, if (l == null) "geo_unavailable" else null) }

        val main = Handler(Looper.getMainLooper())
        val stops = mutableListOf<() -> Unit>()
        var left = use.size
        var done = false
        fun finish(loc: Location?, final: Boolean) {
            if (done) return
            if (loc == null && !final) { if (--left > 0) return }
            done = true
            main.removeCallbacksAndMessages(null)
            stops.forEach { runCatching { it() } }
            val l = loc ?: older()
            answer.done(l, if (l == null) "geo_timeout" else null)
        }
        for (p in use) {
            if (Build.VERSION.SDK_INT >= 30) {
                val cs = CancellationSignal()
                stops += { cs.cancel() }
                runCatching { lm.getCurrentLocation(p, cs, context.mainExecutor) { finish(it, false) } }.onFailure { finish(null, false) }
            } else {
                // Every method is written out: on Android 8–10 they are abstract, and a missing one would crash.
                val l = object : LocationListener {
                    override fun onLocationChanged(location: Location) = finish(location, false)
                    @Deprecated("Android 8–10 only")
                    override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
                    override fun onProviderEnabled(provider: String) {}
                    override fun onProviderDisabled(provider: String) {}
                }
                stops += { lm.removeUpdates(l) }
                runCatching { lm.requestLocationUpdates(p, 0L, 0f, l, Looper.getMainLooper()) }.onFailure { finish(null, false) }
            }
        }
        main.postDelayed({ finish(null, true) }, TIMEOUT_MS)
    }

    private companion object {
        const val RECENT_MS = 5 * 60_000L
        const val OLDEST_MS = 6 * 3_600_000L
        const val TIMEOUT_MS = 20_000L
    }
}
