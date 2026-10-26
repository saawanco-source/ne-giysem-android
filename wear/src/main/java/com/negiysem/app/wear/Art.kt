package com.negiysem.app.wear

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import android.text.TextUtils
import androidx.core.content.ContextCompat

/** The phone app's stickers (copied from app/src/main/res at build time) and the outfit card drawn from them. */
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

    /** The warning pill's colours, as on the phone: yellow for "Dikkat", orange for "Tehlikeli", dark text. */
    fun warnBg(lv: Int) = if (lv == 2) 0xFFFF8A5B.toInt() else 0xFFFFE27A.toInt()
    fun warnInk(lv: Int) = if (lv == 2) 0xFF2A0C00.toInt() else 0xFF2A2100.toInt()

    private const val INK = 0xFF14161F.toInt()
    const val BG = 0xFF0B0D16.toInt()

    /**
     * The outfit card for Ne Giysem's own watch face: its photo-image slot is 274 × 168 on the 450 face (build_face.py,
     * CARD), drawn 1.5× for the watch's pixels, with the face's own sizes: temperature and level (or the warning), three
     * stickers, the headline. Opaque, so it covers the face's weather-based outfit underneath, which shows whenever
     * there is no card.
     */
    fun card(context: Context, plan: Plan, now: Long = System.currentTimeMillis()): Bitmap {
        val s = 1.5f
        val w = (274 * s).toInt()
        val h = (168 * s).toInt()
        val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val c = Canvas(bmp)
        c.drawColor(BG)
        val bold = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)

        // Row 1: temperature, then the warning (or the level) on a pill, centred together.
        val tp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = bold; textSize = 38 * s; color = Color.WHITE }
        val warning = plan.liveWarning(now)
        val pp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = bold; textSize = 20 * s; color = warning?.let { warnInk(it.lv) } ?: INK }
        val tempW = tp.measureText(plan.tempText)
        val gap = 10 * s
        val padH = 12 * s
        val room = w - tempW - gap - 2 * padH - 4 * s
        val words = if (warning == null) listOf(plan.levelName) else {
            val name = warning.short.ifBlank { warning.title }
            listOf("⚠ $name · ${warning.whenText}", "⚠ $name").filter { !it.endsWith(" · ") }
        }
        val pillLabel = words.firstOrNull { pp.measureText(it) <= room }
            ?: TextUtils.ellipsize(words.last(), pp, room, TextUtils.TruncateAt.END).toString()
        val pillW = if (pillLabel.isBlank()) 0f else pp.measureText(pillLabel) + 2 * padH
        var x = (w - tempW - (if (pillW > 0) gap + pillW else 0f)) / 2
        val baseline1 = 38 * s
        c.drawText(plan.tempText, x, baseline1, tp)
        x += tempW + gap
        if (pillW > 0) {
            val ph = 36 * s
            val top = 6 * s
            val bg = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = warning?.let { warnBg(it.lv) } ?: plan.color }
            c.drawRoundRect(RectF(x, top, x + pillW, top + ph), ph / 2, ph / 2, bg)
            c.drawText(pillLabel, x + padH, top + ph / 2 - (pp.descent() + pp.ascent()) / 2, pp)
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
        val hp = TextPaint(Paint.ANTI_ALIAS_FLAG).apply { typeface = bold; color = Color.WHITE }
        val roomH = w - 8 * s
        for (sp in floatArrayOf(20f, 18f, 16f)) { hp.textSize = sp * s; if (hp.measureText(plan.headline) <= roomH) break }
        val head = TextUtils.ellipsize(plan.headline, hp, roomH, TextUtils.TruncateAt.END).toString()
        c.drawText(head, (w - hp.measureText(head)) / 2, 152 * s, hp)
        return bmp
    }
}
