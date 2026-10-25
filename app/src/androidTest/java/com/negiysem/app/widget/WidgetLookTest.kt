package com.negiysem.app.widget

import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Rect
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.VectorDrawable
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
        ageHours: Int = 0, alert: JSONObject? = null,
    ) = JSONObject()
        .put("lang", lang).put("level", level).put("temp", temp).put("feels", feels).put("cond", cond)
        .put("isDay", day).put("place", place).put("headline", headline).put("wear", wear).put("take", take)
        .put("pills", JSONArray(pills)).put("next", next)
        .put("updated", System.currentTimeMillis() - ageHours * 3_600_000L)
        .apply { if (alert != null) put("alert", alert) }
        .toString()

    /** A weather warning as Updater puts it in the snapshot (Alerts), lasting a few more hours. */
    private fun warning(lv: Int, title: String, short: String, whenText: String) = JSONObject()
        .put("k", "x").put("lv", lv).put("title", title).put("short", short).put("when", whenText)
        .put("until", System.currentTimeMillis() + 4 * 3_600_000L).put("more", 0)

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
                listOf("Rüzgâr 45 km/sa", "Kar 14:00'te"), next = "08:15 Bakırköy → Etiler", ageHours = 3,
                alert = warning(2, "Dolu ve gök gürültülü sağanak", "Dolu", "23:00–yarın 02:00")
            ), "tr"
        ),
        Case(
            "uyari", plan(
                "tr", 5, 19.0, 17.0, "Kapalı", "Beşiktaş", "Kapüşonlu yağmurluğunu giy; rüzgarda şemsiye uçar.",
                garments("longsleeve" to "Uzun kollu", "yagmurluk" to "Yağmurluk", "jean" to "Jean", "bot" to "Bot"),
                garments("su" to "Su"), listOf("Fırtına", "Yağmur %90"),
                alert = warning(2, "Fırtına", "Fırtına", "14:00–18:00")
            ), "tr"
        ),
        Case(
            "en", plan(
                "en", 2, 4.0, 1.0, "Light rain", "Manchester", "Coat and scarf time; take an umbrella, rain from 14:00.",
                garments("kazak" to "Jumper", "kaban" to "Coat", "pantolon" to "Thick trousers", "bot" to "Boots"),
                garments("semsiye" to "Umbrella", "atki" to "Scarf"), listOf("Rain at 14:00"),
                alert = warning(1, "Heavy rain", "Downpour", "14:00–17:00")
            ), "en"
        ),
        Case(
            "gece", plan(
                "tr", 6, 24.0, 25.0, "Açık", "Kadıköy", "Bugün tişört havası.",
                garments("tshirt" to "Tişört", "jean" to "Jean", "sneaker" to "Sneaker"), JSONArray(), listOf("UV 7"), day = false,
                alert = warning(1, "Yoğun sis", "Sis", "02:00–07:00")
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
        // Like a home screen: the widget is laid out first, and only then does the TextClock (once attached) fill in
        // the time. A new layout happens only if a view asks for one, so a clock that doesn't ask stays too narrow.
        // Narrow digits first ("11:11"), then wide ones: the minute ticking over must not cut the time.
        val exactly = { px: Int -> View.MeasureSpec.makeMeasureSpec(px, View.MeasureSpec.EXACTLY) }
        walk(host, 0, 0) { view, _, _ -> if (view is TextClock) view.text = "11:11" }
        host.measure(exactly(wPx), exactly(hPx))
        host.layout(0, 0, wPx, hPx)
        walk(host, 0, 0) { view, _, _ -> if (view is TextClock) view.text = "20:44" }
        if (host.isLayoutRequested) {
            host.measure(exactly(wPx), exactly(hPx))
            host.layout(0, 0, wPx, hPx)
        }

        val bmp = Bitmap.createBitmap(wPx, hPx, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(bmp)
        canvas.drawColor(0xFF5B6675.toInt())
        host.draw(canvas)

        // The widget's own background (palette under the level colour), from a blank spot in its left margin.
        val bg = bmp.getPixel((wPx * 0.02f).toInt().coerceAtLeast(2), hPx / 2)
        notes += "zemin #%06X".format(bg and 0xFFFFFF)
        val items = mutableListOf<Pair<String, Rect>>()
        walk(host, 0, 0) { view, x, y ->
            if (view.width == 0 || view.height == 0) return@walk
            when (view) {
                is TextClock -> {
                    // match_parent with gravity end|bottom: the digits sit at the frame's bottom-right.
                    val text = view.text.toString()
                    val tw = view.paint.measureText(text)
                    val room = view.width - view.totalPaddingLeft - view.totalPaddingRight
                    if (tw > room + 1 || (view.layout?.getEllipsisCount(0) ?: 0) > 0) {
                        problems += "saat sığmıyor: '$text' ${tw.roundToInt()} px, yer $room px"
                    }
                    val fm = view.paint.fontMetrics
                    val right = x + view.width - view.totalPaddingRight
                    val bottom = y + view.height - view.totalPaddingBottom
                    items += "saat" to Rect((right - tw).toInt(), (bottom - (fm.descent - fm.ascent)).toInt(), right, bottom)
                    // A TextClock draws only once a window shows it; draw its time where it would be, with its own paint.
                    view.paint.color = view.currentTextColor
                    canvas.drawText(text, right - tw, bottom - fm.descent, view.paint)
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
                    if (layout.getEllipsisCount(0) == 0 && layout.getLineRight(0) > view.width - view.totalPaddingLeft - view.totalPaddingRight + 2) {
                        problems += "taştı $label"
                    }
                    val rect = Rect(
                        (x + view.totalPaddingLeft + left).toInt(), top,
                        (x + view.totalPaddingLeft + right).toInt(), top + minOf(layout.height, room)
                    )
                    items += label to rect
                    // Readable on what is behind it (the widget, a pill, the warning's pill): WCAG AA 4.5:1.
                    // Behind = the commonest colour in the text's box (the letters cover far less than half of it).
                    val behind = commonest(bmp, rect) ?: bg
                    val ratio = contrast(over(view.currentTextColor, behind), behind)
                    if (ratio < 4.5) problems += "okunaksız $label (kontrast %.1f)".format(ratio)
                }
                // Stickers and icons only: Glance also uses pictures for backgrounds and the (transparent) tap ripple.
                is ImageView -> if (view.drawable is VectorDrawable || view.drawable is BitmapDrawable) {
                    items += "resim" to Rect(x, y, x + view.width, y + view.height)
                }
            }
        }
        png.outputStream().use { bmp.compress(Bitmap.CompressFormat.PNG, 100, it) }
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

    /** The colour most pixels in [r] have (every second pixel looked at); null for an empty box. */
    private fun commonest(bmp: Bitmap, r: Rect): Int? {
        val box = Rect(r)
        if (!box.intersect(0, 0, bmp.width, bmp.height) || box.isEmpty) return null
        val counts = HashMap<Int, Int>()
        for (yy in box.top until box.bottom step 2) for (xx in box.left until box.right step 2) {
            val c = bmp.getPixel(xx, yy)
            counts[c] = (counts[c] ?: 0) + 1
        }
        return counts.maxByOrNull { it.value }?.key
    }

    /** [fg] (possibly see-through) laid over the opaque [bg]. */
    private fun over(fg: Int, bg: Int): Int {
        val a = (fg ushr 24) / 255f
        fun ch(shift: Int) = ((((fg shr shift) and 0xFF) * a + ((bg shr shift) and 0xFF) * (1 - a))).roundToInt()
        return (0xFF shl 24) or (ch(16) shl 16) or (ch(8) shl 8) or ch(0)
    }

    private fun luminance(c: Int): Double {
        fun lin(v: Int): Double { val s = v / 255.0; return if (s <= 0.03928) s / 12.92 else Math.pow((s + 0.055) / 1.055, 2.4) }
        return 0.2126 * lin((c shr 16) and 0xFF) + 0.7152 * lin((c shr 8) and 0xFF) + 0.0722 * lin(c and 0xFF)
    }

    private fun contrast(a: Int, b: Int): Double {
        val la = luminance(a)
        val lb = luminance(b)
        return (maxOf(la, lb) + 0.05) / (minOf(la, lb) + 0.05)
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
