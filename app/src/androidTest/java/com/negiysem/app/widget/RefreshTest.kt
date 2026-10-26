package com.negiysem.app.widget

import android.content.Context
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import com.negiysem.app.data.MetDirect
import com.negiysem.app.data.Store
import com.negiysem.app.data.Updater
import kotlinx.coroutines.runBlocking
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File

/**
 * The widget's whole refresh on a real phone, against the live server: from nothing (the connection's location),
 * after the app screen sends a place and a routine, and after "Tüm verilerimi sil". Each step must leave a snapshot
 * the widget can draw. A report goes to files/widget-shots/yenileme.txt (CI pulls it with the pictures).
 */
@RunWith(AndroidJUnit4::class)
class RefreshTest {
    private val ctx: Context = InstrumentationRegistry.getInstrumentation().targetContext
    private val log = StringBuilder()

    private fun step(name: String, block: suspend () -> Unit) {
        val t0 = System.currentTimeMillis()
        try {
            runBlocking { block() }
            log.appendLine("OK   $name (${System.currentTimeMillis() - t0} ms)")
        } catch (e: Throwable) {
            log.appendLine("HATA $name: ${e.javaClass.name}: ${e.message}")
            e.stackTrace.take(12).forEach { log.appendLine("       at $it") }
            write()
            throw e
        }
    }

    private fun write() {
        val dir = File(ctx.filesDir, "widget-shots").apply { mkdirs() }
        File(dir, "yenileme.txt").writeText(log.toString())
    }

    /** The snapshot the widget would draw now; fails when there is none or it can't be read. */
    private fun snapshot(): JSONObject {
        val json = Store(ctx).widgetJson
        assertNotNull("no snapshot saved", json)
        val o = JSONObject(json!!)
        log.appendLine("     anlık görüntü: " + json.take(400))
        assertTrue("snapshot without a temperature: $json", o.has("temp") && o.has("place") && o.has("headline"))
        return o
    }

    @Test
    fun refreshesFromScratchFromTheAppAndAfterAWipe() {
        ctx.getSharedPreferences("negiysem", Context.MODE_PRIVATE).edit().clear().commit()
        step("ilk kurulum, yer yok: bağlantının konumuyla") {
            assertTrue("refresh reported a failed fetch", Updater.refresh(ctx))
            snapshot()
        }
        step("uygulama bir yer ve rutin gönderiyor") {
            val routine = JSONObject(
                """{"dayMode":true,
                "places":[{"id":"ev","name":"Ev","lat":40.9796,"lon":28.7214},{"id":"okul","name":"Okul","lat":41.1720,"lon":28.9876},
                          {"id":"spor","name":"Spor salonu","lat":41.0430,"lon":29.0070}],
                "routes":[{"id":"r1","from":"ev","to":"okul","name":"Metrobüs + M2","steps":[{"m":"walk","min":8,"slope":"flat"},{"m":"wait","min":4},
                          {"m":"metrobus","min":45},{"m":"metro","min":25},{"m":"walk","min":10,"slope":"up"}]}],
                "trips":[{"id":"t1","from":"ev","to":"okul","time":"08:00","days":[0,1,2,3,4,5,6]},
                         {"id":"t2","from":"okul","to":"spor","time":"17:30","days":[1,3,5]}],
                "choice":{"date":"","picks":{}}}"""
            )
            val app = JSONObject().put("lang", "tr").put("feel", "normal").put("act", "city").put("hours", 6)
                .put("place", JSONObject().put("name", "Avcılar").put("lat", 40.9796).put("lon", 28.7214))
                .put("who", "me").put("missing", org.json.JSONArray()).put("routine", routine)
            assertTrue("the app's data counted as unchanged", Store(ctx).saveFromApp(app.toString()))
            assertTrue("refresh reported a failed fetch", Updater.refresh(ctx))
            assertEquals("Avcılar", snapshot().optString("place"))
        }
        step("tüm veriler silindi, sonra yeni yer") {
            Store(ctx).clear()
            Updater.refresh(ctx)
            assertEquals(null, Store(ctx).widgetJson)
            val app = JSONObject().put("lang", "en").put("place", JSONObject().put("name", "Kadıköy").put("lat", 40.9903).put("lon", 29.0277))
            Store(ctx).saveFromApp(app.toString())
            assertTrue("refresh reported a failed fetch", Updater.refresh(ctx))
            val o = snapshot()
            assertEquals("Kadıköy", o.optString("place"))
            assertEquals("en", o.optString("lang"))
        }
        step("sunucuya ulaşılamıyor: MET Norway'den doğrudan") {
            val app = JSONObject().put("lang", "tr").put("place", JSONObject().put("name", "Beşiktaş").put("lat", 41.043).put("lon", 29.007))
            Store(ctx).saveFromApp(app.toString())
            Store(ctx).clearApiDown()
            log.appendLine("     JavaScript sandbox: " + MetDirect.supported())
            Updater.apiBase = "https://ne-giysem.invalid" // never resolves, like a blocked address
            try {
                Updater.refresh(ctx)
            } finally {
                Updater.apiBase = com.negiysem.app.Config.API
            }
            assertTrue("the server should now count as out of reach", Store(ctx).apiDown)
            val o = snapshot()
            assertEquals("Beşiktaş", o.optString("place"))
            val fc = JSONObject(Store(ctx).forecast!!).getJSONObject("main")
            log.appendLine("     MET'ten: " + fc.optString("timezone") + " " + fc.optJSONObject("current")?.toString()?.take(160))
            assertEquals("Europe/Istanbul", fc.optString("timezone"))
            Store(ctx).clearApiDown()
        }
        write()
    }
}
