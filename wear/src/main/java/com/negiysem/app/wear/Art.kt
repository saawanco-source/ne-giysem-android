package com.negiysem.app.wear

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapShader
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.RadialGradient
import android.graphics.RectF
import android.graphics.Shader
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.ContextCompat
import androidx.core.content.res.ResourcesCompat

/** The phone app's garment pictures (copied from app/src/main/res at build time) and the outfit card drawn from them. */
object Art {
    private val STICKERS = mapOf(
        "atki" to R.drawable.g_atki, "bere" to R.drawable.g_bere, "bot" to R.drawable.g_bot, "ceket" to R.drawable.g_ceket,
        "corap" to R.drawable.g_corap, "eldiven" to R.drawable.g_eldiven, "gozluk" to R.drawable.g_gozluk, "hirka" to R.drawable.g_hirka,
        "jean" to R.drawable.g_jean, "kaban" to R.drawable.g_kaban, "kazak" to R.drawable.g_kazak, "krem" to R.drawable.g_krem,
        "longsleeve" to R.drawable.g_longsleeve, "mont" to R.drawable.g_mont, "pantolon" to R.drawable.g_pantolon,
        "parka" to R.drawable.g_parka, "ruzgarlik" to R.drawable.g_ruzgarlik, "sandalet" to R.drawable.g_sandalet,
        "sapka" to R.drawable.g_sapka, "semsiye" to R.drawable.g_semsiye, "sisme" to R.drawable.g_sisme,
        "sneaker" to R.drawable.g_sneaker, "sort" to R.drawable.g_sort, "spor" to R.drawable.g_spor, "su" to R.drawable.g_su,
        "sweatshirt" to R.drawable.g_sweatshirt, "tayt" to R.drawable.g_tayt, "thermal" to R.drawable.g_thermal,
        "tshirt" to R.drawable.g_tshirt, "yagmurluk" to R.drawable.g_yagmurluk, "yuruyus" to R.drawable.g_yuruyus,
    )

    fun sticker(g: String?): Int = STICKERS[g] ?: R.drawable.g_tshirt

    /** The warning's colour, as on the phone's safety tape: amber for "Dikkat", orange for "Tehlikeli"; dark text on it. */
    fun warnBg(lv: Int) = if (lv == 2) 0xFFFF7A1A.toInt() else 0xFFF2B705.toInt()
    fun warnInk(lv: Int) = if (lv == 2) 0xFF1A0B02.toInt() else 0xFF1A1300.toInt()

    /** The level on a paper tag, as on the phone: cream paper, rust letters. */
    private const val PAPER = 0xFFF3EAD5.toInt()
    private const val RUST = 0xFF9C4A2A.toInt()
    const val CREAM = 0xFFF3EFE6.toInt()
    const val BG = 0xFF0A0F21.toInt()

    /** The watch face's own sky (watchface/tools/build_face.py: SKY, GLOW), so the card has no edge on it. */
    private val SKY = intArrayOf(BG, 0xFF131B37.toInt(), 0xFF26305A.toInt())
    private const val GLOW = 0x2EF3EAD5

    /** The app's serif (res/font, Instrument Serif, SIL Open Font License). */
    fun serif(context: Context): Typeface =
        runCatching { ResourcesCompat.getFont(context, R.font.instrument_serif) }.getOrNull() ?: Typeface.SERIF

    /**
     * The outfit card for Ne Giysem's own watch face: its photo-image slot is 274 × 168 on the 450 face (build_face.py,
     * CARD), drawn 1.5× for the watch's pixels, with the face's own sizes: temperature and level (or the warning), three
     * garments, the headline. Opaque, with the face's own sky behind it, so it covers the face's weather-based outfit
     * underneath (which shows whenever there is no card) without an edge. [round]: rounded corners, for the app screen.
     */
    fun card(context: Context, plan: Plan, now: Long = System.currentTimeMillis(), round: Boolean = false): Bitmap {
        val s = 1.5f
        val w = (274 * s).toInt()
        val h = (168 * s).toInt()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        // The face's sky where the card sits on it (CARD: 88, 180 on the 450 face).
        val ox = 88 * s
        val oy = 180 * s
        c.drawPaint(Paint().apply { shader = LinearGradient(0f, -oy, 0f, 450 * s - oy, SKY, floatArrayOf(0f, 0.45f, 1f), Shader.TileMode.CLAMP) })
        c.drawPaint(Paint().apply { shader = RadialGradient(370 * s - ox, 20 * s - oy, 300 * s, GLOW, GLOW and 0x00FFFFFF, Shader.TileMode.CLAMP) })
        val bold = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
        val serif = serif(context)

        // Row 1: temperature (in the serif, as on the phone), then the warning (or the level on its paper tag), centred together.
        val tp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = serif; textSize = 42 * s; color = CREAM }
        val warning = plan.liveWarning(now)
        val pp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = bold; textSize = 20 * s; color = warning?.let { warnInk(it.lv) } ?: RUST }
        val tempW = tp.measureText(plan.tempText)
        val gap = 10 * s
        // a warning is a pill; the level is a paper tag with its eyelet on the left
        val padL = if (warning == null) 20 * s else 12 * s
        val padR = if (warning == null) 10 * s else 12 * s
        val room = w - tempW - gap - padL - padR - 4 * s
        val words = if (warning == null) listOf(plan.levelName) else {
            val name = warning.short.ifBlank { warning.title }
            listOf("⚠ $name · ${warning.whenText}", "⚠ $name").filter { !it.endsWith(" · ") }
        }
        val pillLabel = words.firstOrNull { pp.measureText(it) <= room }
            ?: TextUtils.ellipsize(words.last(), pp, room, TextUtils.TruncateAt.END).toString()
        val pillW = if (pillLabel.isBlank()) 0f else pp.measureText(pillLabel) + padL + padR
        var x = (w - tempW - (if (pillW > 0) gap + pillW else 0f)) / 2
        val baseline1 = 38 * s
        c.drawText(plan.tempText, x, baseline1, tp)
        x += tempW + gap
        if (pillW > 0) {
            val ph = 36 * s
            val top = 6 * s
            val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = warning?.let { warnBg(it.lv) } ?: PAPER }
            val r = if (warning != null) ph / 2 else 6 * s
            c.drawRoundRect(RectF(x, top, x + pillW, top + ph), r, r, bg)
            if (warning == null) c.drawCircle(x + 11 * s, top + ph / 2, 4 * s, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = SKY[1] })
            c.drawText(pillLabel, x + padL, top + ph / 2 - (pp.descent() + pp.ascent()) / 2, pp)
        }

        // Row 2: up to three stickers, 70 px, 88 apart (as the face draws its own).
        val size = (70 * s).toInt()
        val step = 88 * s
        val items = plan.wear.take(3).ifEmpty { listOf(Garment("tshirt", "")) }
        val first = w / 2f - step * (items.size - 1) / 2f
        val top2 = (50 * s).toInt()
        items.forEachIndexed { i, g ->
            val d = ContextCompat.getDrawable(context, sticker(g.g)) ?: return@forEachIndexed
            val cx = (first + i * step).toInt()
            d.setBounds(cx - size / 2, top2, cx + size / 2, top2 + size)
            d.draw(c)
        }

        // Row 3: the headline, on one line: a little smaller when it is long, cut with … only if it still doesn't fit.
        val hp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = serif; color = CREAM }
        val roomH = w - 8 * s
        for (sp in floatArrayOf(24f, 22f, 20f, 18f)) { hp.textSize = sp * s; if (hp.measureText(plan.headline) <= roomH) break }
        val head = TextUtils.ellipsize(plan.headline, hp, roomH, TextUtils.TruncateAt.END).toString()
        c.drawText(head, (w - hp.measureText(head)) / 2, 152 * s, hp)
        if (!round) return bmp
        val out = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { shader = BitmapShader(bmp, Shader.TileMode.CLAMP, Shader.TileMode.CLAMP) }
        Canvas(out).drawRoundRect(RectF(0f, 0f, w.toFloat(), h.toFloat()), 24 * s, 24 * s, paint)
        bmp.recycle()
        return out
    }
}
