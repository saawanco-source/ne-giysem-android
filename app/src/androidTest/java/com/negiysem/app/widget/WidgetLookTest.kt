package com.negiysem.app.widget

import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.RemoteViews
import android.widget.TextClock
import android.widget.TextView
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.datastore.preferences.core.mutablePreferencesOf
import androidx.glance.appwidget.compose
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.platform.app.InstrumentationRegistry
import kotlinx.coroutines.runBlocking
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import java.io.File
import kotlin.math.roundToInt

/**
 * Draws the widget the way a home screen would, for many sizes, texts and font sizes, and checks that nothing
 * overlaps, sticks out of the widget or is clipped. Pictures and a report go to files/widget-shots (CI pulls them).
 */
@RunWith(AndroidJUnit4::class)
class WidgetLookTest {
    private val inst = InstrumentationRegistry.getInstrumentation()
    private val app: Context = inst.targetContext

    private class Case(val name: String, val json: String?, val lang: String)

    private fun garments(vararg p: Pair<String, String>) = JSONArray(p.map { JSONObject().put("g", it.first).put("label", it.second) })

    private fun plan(
        lang: String, level: Int, temp: Double, feels: Double, cond: String, place: String, headline: String,
        wear: JSONArray, take: JSONArray, pills: List<String> = emptyList(), next: String = "", day: Boolean = true,
        ageHours: Int = 0,
    ) = JSONObject()
        .put("lang", lang).put("level", level).put("temp", temp).put("feels", feels).put("cond", cond)
        .put("isDay", day).put("place", place).put("headline", headline).put("wear", wear).put("take", take)
        .put("pills", JSONArray(pills)).put("next", next)
        .put("updated", System.currentTimeMillis() - ageHours * 3_600_000L)
        .toString()

    private val cases = listOf(
        Case(
            "tr", plan(
                "tr", 4, 16.0, 13.0, "Parçalı bulutlu", "Cihangir", "Sweatshirt havası, ince ceketi yanına al.",
                garments("sweatshirt" to "Sweatshirt", "jean" to "Jean", "sneaker" to "Sneaker"), garments("ceket" to "İnce ceket")
            ), "tr"
        ),
        Case(
            "uzun", plan(
                "tr", 0, -12.4, -19.0, "Kar sağanağı", "Kemalpaşa Mahallesi",
                "Kat kat giy: termal, kazak, parka. Rüzgâr çok sert, eldiven ve atkıyı unutma.",
                garments("thermal" to "Termal içlik", "kazak" to "Kazak", "parka" to "Parka", "pantolon" to "Kalın pantolon", "bot" to "Bot"),
                garments("eldiven" to "Eldiven", "atki" to "Atkı", "bere" to "Bere"),
                listOf("Rüzgâr 45 km/sa", "Kar 14:00'te"), next = "08:15 Bakırköy → Etiler", ageHours = 3
            ), "tr"
        ),
        Case(
            "en", plan(
                "en", 2, 4.0, 1.0, "Light rain", "Manchester", "Coat and scarf time; take an umbrella, rain from 14:00.",
                garments("kazak" to "Jumper", "kaban" to "Coat", "pantolon" to "Thick trousers", "bot" to "Boots"),
                garments("semsiye" to "Umbrella", "atki" to "Scarf"), listOf("Rain at 14:00")
            ), "en"
        ),
        Case(
            "gece", plan(
                "tr", 6, 24.0, 25.0, "Açık", "Kadıköy", "Bugün tişört havası.",
                garments("tshirt" to "Tişört", "jean" to "Jean", "sneaker" to "Sneaker"), JSONArray(), listOf("UV 7"), day = false
            ), "tr"
        ),
        Case("bos", null, "tr"),
    )

    private val sizes = listOf(
        110 to 110, 160 to 110, 250 to 110, 320 to 110, 360 to 110,
        250 to 160, 320 to 160, 360 to 184, 412 to 184,
        250 to 250, 360 to 276, 250 to 310, 360 to 380, 530 to 450,
    )

    @Test
    fun everySizeFits() {
        val out = File(app.filesDir, "widget-shots").apply { deleteRecursively(); mkdirs() }
        val problems = mutableListOf<String>()
        val report = StringBuilder()
        for (fontScale in listOf(1.0f, 1.3f)) {
            val config = Configuration(app.resources.configuration).apply { this.fontScale = fontScale }
            val ctx = app.createConfigurationContext(config)
            val tag = if (fontScale == 1f) "f100" else "f130"
            for (c in cases) for ((w, h) in sizes) {
                val name = "${c.name}_${tag}_${w}x$h"
                val state = mutablePreferencesOf(NeGiysemWidget.PLAN to (c.json ?: ""), NeGiysemWidget.LANG to c.lang)
                val views = runBlocking { NeGiysemWidget().compose(ctx, size = DpSize(w.dp, h.dp), state = state) }
                val fit = fitFor(ctx, c.json, c.lang, w - 2f, h - 2f)
                val found = mutableListOf<String>()
                val notes = mutableListOf<String>()
                inst.runOnMainSync { render(ctx, views, w, h, File(out, "$name.png"), found, notes) }
                report.appendLine("$name  $fit" + (if (notes.isEmpty()) "" else "  | " + notes.joinToString("; ")))
                found.forEach { report.appendLine("   !! $it"); problems += "$name: $it" }
            }
        }
        File(out, "rapor.txt").writeText(report.toString())
        assertTrue(problems.take(40).joinToString("\n"), problems.isEmpty())
    }

    /** Lays the widget out at [wDp] × [hDp], draws it into [png] and checks every visible text, picture and the clock. */
    private fun render(
        ctx: Context, views: RemoteViews, wDp: Int, hDp: Int, png: File, problems: MutableList<String>, notes: MutableList<String>,
    ) {
        val density = ctx.resources.displayMetrics.density
        val wPx = (wDp * density).roundToInt()
        val hPx = (hDp * density).roundToInt()
        val host = FrameLayout(ctx)
        val v = views.apply(ctx, host)
        host.addView(v, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        // TextClock fills in the time only once attached to a window; give it one for the picture.
        walk(host, 0, 0) { view, _, _ -> if (view is TextClock) view.text = "20:44" }
        host.measure(View.MeasureSpec.makeMeasureSpec(wPx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(hPx, View.MeasureSpec.EXACTLY))
        host.layout(0, 0, wPx, hPx)

        val bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(0xFF5B6675.toInt())
        host.draw(canvas)
        png.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }

        val items = mutableListOf<Pair<String, Rect>>()
        walk(host, 0, 0) { view, x, y ->
            if (view.width == 0 || view.height == 0) return@walk
            when (view) {
                is TextClock -> {
                    // match_parent with gravity end|bottom: the digits sit at the frame's bottom-right.
                    val text = view.text.toString()
                    val tw = view.paint.measureText(text)
                    val fm = view.paint.fontMetrics
                    val right = x + view.width - view.totalPaddingRight
                    val bottom = y + view.height - view.totalPaddingBottom
                    items += "saat" to Rect((right - tw).toInt(), (bottom - (fm.descent - fm.ascent)).toInt(), right, bottom)
                }
                is TextView -> {
                    val layout = view.layout ?: return@walk
                    if (view.text.isNullOrEmpty()) return@walk
                    val label = "\"" + view.text.toString().take(24) + "\""
                    var left = Float.MAX_VALUE
                    var right = 0f
                    for (i in 0 until layout.lineCount) {
                        left = minOf(left, layout.getLineLeft(i))
                        right = maxOf(right, layout.getLineRight(i))
                        if (layout.getEllipsisCount(i) > 0) notes += "kısaltıldı $label"
                    }
                    val top = y + view.totalPaddingTop
                    val room = view.height - view.totalPaddingTop - view.totalPaddingBottom
                    if (layout.height > room + 2) problems += "kırpıldı $label (${layout.height} > $room px)"
                    if (layout.getLineRight(0) > view.width - view.totalPaddingLeft - view.totalPaddingRight + 2) problems += "taştı $label"
                    items += label to Rect(
                        (x + view.totalPaddingLeft + left).toInt(), top,
                        (x + view.totalPaddingLeft + right).toInt(), top + minOf(layout.height, room)
                    )
                }
                is ImageView -> if (view.drawable != null) items += "resim" to Rect(x, y, x + view.width, y + view.height)
            }
        }
        val box = Rect(0, 0, wPx, hPx)
        for ((label, r) in items) if (!box.contains(r)) problems += "widget dışına çıktı $label $r"
        for (a in items.indices) for (b in a + 1 until items.size) {
            val r = Rect(items[a].second)
            // A pixel of touching is rounding; real overlaps are wider.
            if (r.intersect(items[b].second) && r.width() > 1 && r.height() > 1) {
                problems += "üst üste: ${items[a].first} ve ${items[b].first} (${r.width()}×${r.height()} px)"
            }
        }
    }

    /** Every visible view with its position in the widget (not attached to a window, so isShown can't be used). */
    private fun walk(v: View, x: Int, y: Int, visit: (View, Int, Int) -> Unit) {
        if (v.visibility != View.VISIBLE) return
        visit(v, x, y)
        if (v is ViewGroup) for (i in 0 until v.childCount) {
            val c = v.getChildAt(i)
            walk(c, x + c.left - v.scrollX, y + c.top - v.scrollY, visit)
        }
    }
}
