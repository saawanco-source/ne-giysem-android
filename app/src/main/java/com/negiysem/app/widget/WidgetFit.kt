package com.negiysem.app.widget

import kotlin.math.max

/**
 * Sizes for the widget: the largest text, stickers and clock that fit the widget's real size with nothing
 * overlapping or clipped, for the texts it shows right now (long place names, long headlines, English, the
 * phone's font size). Plain Kotlin: the widget measures with the phone's font ([TextMeter]); tests can use
 * any meter.
 *
 * Every length here is in dp, every text size in sp.
 */
interface TextMeter {
    /** Width of [text] on one line. */
    fun width(text: String, sp: Float, bold: Boolean): Float

    /** Height of [text] wrapped at [maxWidth], and how many lines it takes (at most [maxLines]). */
    fun block(text: String, sp: Float, bold: Boolean, maxWidth: Float, maxLines: Int): Pair<Float, Int>

    /** Height of one line of text. */
    fun lineHeight(sp: Float, bold: Boolean): Float = block("Ağ", sp, bold, 100_000f, 1).first

    /** Width and height of the clock's widest time ("00:00"…) at [sp]. */
    fun clockWidth(sp: Float): Float
    fun clockHeight(sp: Float): Float
}

/** What the widget is about to show, as far as sizes go. */
class FitInput(
    val width: Float,
    val height: Float,
    /** "16°". */
    val temp: String,
    /** First header line ("Cihangir · Serin"), second header line ("Hissedilen 13° · Parçalı bulutlu"). */
    val place: String,
    val sub: String,
    /** The small layout's line under the temperature (level name or "Son güncelleme 08:10"). */
    val small: String,
    val headline: String,
    /** "Yanına al: İnce ceket" (empty: nothing to carry) and the short form beside the stickers ("+ İnce ceket"). */
    val takeLine: String,
    val takeShort: String,
    val pills: List<String>,
    /** Labels of the stickers, in order (at most four are shown). */
    val labels: List<String>,
)

enum class FitKind { SMALL, WIDE, TALL }

enum class TakeMode { NONE, OWN_LINE, INLINE }

/** The chosen sizes. Text widths are the room given to that text; the layout uses them as fixed widths. */
data class Fit(
    val kind: FitKind,
    val scale: Float,
    val padH: Float,
    val padV: Float,
    val temp: Float,
    val place: Float,
    val sub: Float,
    /** Width of the header's text column (small layout: of the temperature). */
    val textW: Float,
    val head: Float,
    val headLines: Int,
    val take: Float,
    val takeMode: TakeMode,
    val takeLines: Int,
    val takeW: Float,
    val pill: Float,
    val pills: Int,
    val label: Float,
    val sticker: Float,
    val stickers: Int,
    val clock: Float,
    val clockW: Float,
    val clockH: Float,
) {
    override fun toString() =
        "$kind s=%.2f temp=%.1f head=%.1f×%d take=%s sticker=%.0f×%d pills=%d clock=%.1f (%.0f×%.0f)".format(
            scale, temp, head, headLines, takeMode, sticker, stickers, pills, clock, clockW, clockH
        )
}

object WidgetFit {
    /** The refresh button's touch target. */
    const val REFRESH = 40f

    /** Room kept on every measured text, for the home screen's own rounding. */
    private const val SAFE = 1.06f

    /** Gaps the layouts put between their parts (scaled ones are multiplied by the scale). */
    const val HEADER_GAP = 10f
    const val STICKER_GAP = 2f
    const val TALL_STICKER_GAP = 4f
    const val CLOCK_GAP = 8f
    const val PILL_PAD_H = 9f
    const val PILL_PAD_V = 3f

    private const val MIN_S = 0.55f
    private const val MAX_S = 3f

    /** The clock grows into what is left, up to this much larger than the temperature. */
    private const val CLOCK_OVER_TEMP = 1.35f

    /** The clock's size at scale 1 next to the temperature's (small 28, wide 36, tall 38). */
    private const val SMALL_CLOCK = 20f
    private const val WIDE_CLOCK = 32f
    private const val TALL_CLOCK = 32f

    /** A variant at least this close to the best scale is taken if it shows more. */
    private const val RICHER = 0.92f

    /** Below this scale text gets hard to read: then a headline cut with … is allowed if it buys size. */
    private const val READABLE = 0.85f

    fun fit(i: FitInput, m: TextMeter): Fit = when {
        i.width < 200f -> small(i, m)
        i.height < 250f -> wide(i, m)
        else -> tall(i, m)
    }

    // ---------------------------------------------------------------- shared

    /** Largest value in [lo, hi] for which [ok] holds (it holds below some point, fails above); null if not even [lo]. */
    private fun largest(lo: Float, hi: Float, ok: (Float) -> Boolean): Float? {
        if (!ok(lo)) return null
        if (ok(hi)) return hi
        var a = lo
        var b = hi
        repeat(16) {
            val mid = (a + b) / 2f
            if (ok(mid)) a = mid else b = mid
        }
        return a
    }

    /**
     * For each variant (richest first): the largest scale that fits, then the largest clock on top of it.
     * Picks the richest variant whose scale is close to the best one; [fallback] when nothing fits.
     */
    private fun <V> choose(
        variants: List<V>,
        baseClock: Float,
        build: (s: Float, v: V, clock: Float) -> Fit?,
        fallback: () -> Fit,
        cut: List<V> = emptyList(),
    ): Fit {
        fun run(vs: List<V>) = vs.mapNotNull { v ->
            val s = largest(MIN_S, MAX_S) { build(it, v, baseClock * it) != null } ?: return@mapNotNull null
            val first = build(s, v, baseClock * s) ?: return@mapNotNull null
            val clock = largest(baseClock * s, max(baseClock * s, first.temp * CLOCK_OVER_TEMP)) { build(s, v, it) != null }
                ?: (baseClock * s)
            build(s, v, clock) ?: first
        }
        fun pick(fits: List<Fit>): Fit? {
            if (fits.isEmpty()) return null
            val best = fits.maxOf { it.scale }
            return fits.first { it.scale >= best * RICHER }
        }
        // The whole headline when its text stays readable; otherwise the larger of whole and cut.
        val whole = pick(run(variants))
        if (whole != null && whole.scale >= READABLE) return whole
        val shortened = pick(run(cut))
        return listOfNotNull(whole, shortened).maxByOrNull { it.scale } ?: fallback()
    }

    private class Header(val height: Float, val tempW: Float, val textW: Float)

    /** Temperature, then the two text lines (single lines, cut with … when long), then the refresh button. */
    private fun header(i: FitInput, m: TextMeter, w: Float, temp: Float, place: Float, sub: Float): Header? {
        val tempW = m.width(i.temp, temp, true) * SAFE
        val textW = w - tempW - HEADER_GAP - REFRESH
        if (textW < 56f) return null
        val h = maxOf(m.lineHeight(temp, true) * SAFE, (m.lineHeight(place, true) + m.lineHeight(sub, true)) * SAFE, REFRESH)
        return Header(h, tempW, textW)
    }

    /** Height of a text that must show whole within [maxLines]; null if it needs more. */
    private fun whole(m: TextMeter, text: String, sp: Float, w: Float, maxLines: Int): Pair<Float, Int>? {
        if (text.isEmpty()) return 0f to 0
        val (h, lines) = m.block(text, sp, true, w / SAFE, 50)
        return if (lines > maxLines) null else h * SAFE to lines
    }

    // ---------------------------------------------------------------- small (under 200 dp wide)

    private fun small(i: FitInput, m: TextMeter): Fit {
        val pad = 10f
        val w = i.width - 2 * pad
        val h = i.height - 2 * pad
        val most = i.labels.size.coerceIn(1, 2)
        val variants = (most downTo 1).toList()
        fun build(s: Float, n: Int, clock: Float, force: Boolean = false): Fit? {
            val temp = 28f * s
            val line = 12f * s
            val sticker = 40f * s
            val tempW = m.width(i.temp, temp, true) * SAFE
            val cw = m.clockWidth(clock) * SAFE
            val ch = m.clockHeight(clock) * SAFE
            val row1 = max(m.lineHeight(temp, true) * SAFE, REFRESH)
            val row2 = m.lineHeight(line, true) * SAFE
            val row3 = max(sticker, ch)
            val fits = tempW + REFRESH <= w &&
                n * sticker + (n - 1) * STICKER_GAP + CLOCK_GAP + cw <= w &&
                row1 + row2 + 4f + row3 <= h
            if (!fits && !force) return null
            return Fit(
                FitKind.SMALL, s, pad, pad, temp, 0f, line, w - REFRESH, 0f, 0, 0f, TakeMode.NONE, 0, 0f,
                0f, 0, 0f, sticker, n, clock, cw, ch
            )
        }
        return choose(variants, SMALL_CLOCK, { s, n, c -> build(s, n, c) }, { build(MIN_S, 1, SMALL_CLOCK * MIN_S, force = true)!! })
    }

    // ---------------------------------------------------------------- wide (200+ dp wide, under 250 dp tall)

    private fun wide(i: FitInput, m: TextMeter): Fit {
        val padH = 14f
        val padV = 10f
        val w = i.width - 2 * padH
        val h = i.height - 2 * padV
        val most = i.labels.size.coerceIn(1, 4)
        val modes = if (i.takeLine.isEmpty()) listOf(TakeMode.NONE) else listOf(TakeMode.OWN_LINE, TakeMode.INLINE)
        val variants = (most downTo minOf(most, 2)).flatMap { n -> modes.map { n to it } }

        fun build(s: Float, n: Int, mode: TakeMode, clock: Float, cut: Boolean = false, force: Boolean = false): Fit? {
            val temp = 36f * s
            val place = 13f * s
            val sub = 12f * s
            val head = 16f * s
            val take = 12f * s
            val sticker = 40f * s
            val hd = header(i, m, w, temp, place, sub) ?: if (force) Header(REFRESH, 0f, w - REFRESH - 60f) else return null
            val (headH, headLines) = (if (cut) m.lineHeight(head, true) * SAFE to 1 else whole(m, i.headline, head, w, 3))
                ?: if (force) (m.lineHeight(head, true) * SAFE to 1) else return null
            var takeH = 0f
            var takeLines = 0
            var takeW = 0f
            val cw = m.clockWidth(clock) * SAFE
            val ch = m.clockHeight(clock) * SAFE
            val rowW = n * sticker + (n - 1) * STICKER_GAP
            var ok = true
            when (mode) {
                TakeMode.OWN_LINE -> {
                    val t = whole(m, i.takeLine, take, w, 2)
                    if (t == null) ok = false else { takeH = 2f + t.first; takeLines = t.second }
                    if (rowW + CLOCK_GAP + cw > w) ok = false
                }
                TakeMode.INLINE -> {
                    takeW = w - rowW - 6f - CLOCK_GAP - cw
                    if (takeW < minOf(m.width(i.takeShort, take, true) * SAFE, 64f)) ok = false
                    takeLines = 1
                }
                TakeMode.NONE -> if (rowW + CLOCK_GAP + cw > w) ok = false
            }
            val total = hd.height + 4f * s + headH + takeH + 4f + max(sticker, ch)
            if (total > h) ok = false
            if (!ok && !force) return null
            return Fit(
                FitKind.WIDE, s, padH, padV, temp, place, sub, hd.textW, head, maxOf(headLines, 1), take, mode,
                maxOf(takeLines, 1), max(takeW, 0f), 0f, 0, 0f, sticker, n, clock, cw, ch
            )
        }
        return choose(
            variants.map { Triple(it.first, it.second, false) }, WIDE_CLOCK,
            { s, v, c -> build(s, v.first, v.second, c, cut = v.third) },
            { build(MIN_S, minOf(most, 3), modes.last(), WIDE_CLOCK * MIN_S, cut = true, force = true)!! },
            cut = variants.map { Triple(it.first, it.second, true) },
        )
    }

    // ---------------------------------------------------------------- tall (250+ dp tall)

    private fun tall(i: FitInput, m: TextMeter): Fit {
        val pad = 14f
        val w = i.width - 2 * pad
        val h = i.height - 2 * pad
        val most = i.labels.size.coerceIn(1, 4)
        val mostPills = i.pills.size.coerceAtMost(2)
        val variants = (most downTo minOf(most, 2)).flatMap { n -> (mostPills downTo 0).map { n to it } }

        fun build(s: Float, n: Int, k: Int, clock: Float, cut: Boolean = false, force: Boolean = false): Fit? {
            val temp = 38f * s
            val place = 13f * s
            val sub = 12f * s
            val pill = 11f * s
            val head = 18f * s
            val sticker = 48f * s
            val label = 11f * s
            val take = 12f * s
            var ok = true
            val hd = header(i, m, w, temp, place, sub) ?: if (force) Header(REFRESH, 0f, w - REFRESH - 60f) else return null
            var pillsH = 0f
            if (k > 0) {
                val pillsW = i.pills.take(k).sumOf { (m.width(it, pill, true) * SAFE + 2 * PILL_PAD_H).toDouble() }.toFloat() +
                    (k - 1) * 4f
                if (pillsW > w) ok = false
                pillsH = m.lineHeight(pill, true) * SAFE + 2 * PILL_PAD_V + 6f
            }
            val (headH, headLines) = whole(m, i.headline, head, w, if (cut) 2 else 4)
                ?: if (cut || force) (m.lineHeight(head, true) * 2 * SAFE to 2) else return null
            val rowW = i.labels.take(n).sumOf { max(sticker, m.width(it, label, true) * SAFE).toDouble() }.toFloat() +
                (n - 1) * TALL_STICKER_GAP
            if (rowW > w) ok = false
            val rowH = sticker + m.lineHeight(label, true) * SAFE
            val cw = m.clockWidth(clock) * SAFE
            val ch = m.clockHeight(clock) * SAFE
            val takeW = w - CLOCK_GAP - cw
            var bottomH = ch
            var takeLines = 1
            if (i.takeLine.isNotEmpty()) {
                if (takeW < 0.4f * w) ok = false
                val t = whole(m, i.takeLine, take, takeW, 2)
                if (t == null) ok = false else { bottomH = max(ch, t.first); takeLines = t.second }
            }
            val total = hd.height + 6f * s + pillsH + headH + 6f + rowH + 8f + bottomH
            if (total > h) ok = false
            if (!ok && !force) return null
            return Fit(
                FitKind.TALL, s, pad, pad, temp, place, sub, hd.textW, head, maxOf(headLines, 1), take,
                if (i.takeLine.isEmpty()) TakeMode.NONE else TakeMode.OWN_LINE, takeLines, max(takeW, 0f),
                pill, k, label, sticker, n, clock, cw, ch
            )
        }
        return choose(
            variants.map { Triple(it.first, it.second, false) }, TALL_CLOCK,
            { s, v, c -> build(s, v.first, v.second, c, cut = v.third) },
            { build(MIN_S, minOf(most, 3), 0, TALL_CLOCK * MIN_S, cut = true, force = true)!! },
            cut = variants.map { Triple(it.first, it.second, true) },
        )
    }
}
