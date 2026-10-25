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

    /** The phone's font size setting (1 = normal): text is already that much larger than its sp. */
    val fontScale: Float get() = 1f

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
    /**
     * A weather warning's pill, longest wording first ("Fırtına · 14:00–18:00", "Fırtına"); empty when there is none.
     * The small layout uses only [alertShort] wordings.
     */
    val alert: List<String> = emptyList(),
    val alertShort: List<String> = emptyList(),
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
    /** The warning pill: its wording ("" none), text size, the width its text gets and the warning sign's size. */
    val alert: String = "",
    val alertSp: Float = 0f,
    val alertW: Float = 0f,
    val alertIcon: Float = 0f,
) {
    override fun toString() =
        "$kind s=%.2f temp=%.1f head=%.1f×%d take=%s sticker=%.0f×%d pills=%d clock=%.1f (%.0f×%.0f)".format(
            scale, temp, head, headLines, takeMode, sticker, stickers, pills, clock, clockW, clockH
        ) + if (alert.isEmpty()) "" else " uyarı='$alert'"
}

object WidgetFit {
    /** Room kept on every measured text, for the home screen's own rounding. */
    private const val SAFE = 1.06f

    /** Gaps the layouts put between their parts (scaled ones are multiplied by the scale). */
    const val HEADER_GAP = 10f
    const val STICKER_GAP = 2f
    const val TALL_STICKER_GAP = 4f
    const val CLOCK_GAP = 8f
    const val PILL_PAD_H = 9f
    const val PILL_PAD_V = 3f
    /** Between the warning sign and the warning's words. */
    const val ICON_GAP = 4f

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
        i.height < 240f -> wide(i, m)
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
        m: TextMeter,
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
        // The whole headline when its text stays readable (a larger font setting already makes it larger);
        // otherwise the larger of whole and cut.
        val whole = pick(run(variants))
        if (whole != null && whole.scale * m.fontScale >= READABLE) return whole
        val shortened = pick(run(cut))
        return listOfNotNull(whole, shortened).maxByOrNull { it.scale } ?: fallback()
    }

    private const val TEXT_SHARE = 0.42f

    /** A warning pill: the sign, then the wording that fits ([textW] is the room its text gets). */
    class Pill(val text: String, val textW: Float, val w: Float, val h: Float, val icon: Float, val sp: Float)

    /** The longest of [words] that fits in [maxW] at [sp]; null when none does. */
    private fun pill(m: TextMeter, words: List<String>, sp: Float, maxW: Float): Pill? {
        val icon = sp * m.fontScale * 1.05f
        val h = max(m.lineHeight(sp, true) * SAFE, icon) + 2 * PILL_PAD_V
        for (t in words) {
            val tw = m.width(t, sp, true) * SAFE
            val w = icon + ICON_GAP + tw + 2 * PILL_PAD_H
            if (w <= maxW) return Pill(t, tw, w, h, icon, sp)
        }
        return null
    }

    private fun Fit.with(p: Pill?) = if (p == null) this else copy(alert = p.text, alertSp = p.sp, alertW = p.textW, alertIcon = p.icon)

    private class Header(val height: Float, val tempW: Float, val textW: Float, val pill: Pill? = null)

    /**
     * Temperature, then the two text lines (single lines, cut with … when long).
     * The text lines keep at least [TEXT_SHARE] of the width, so a big temperature can't squeeze the place name away.
     * With [warn], a warning takes the second line's place, as a pill.
     */
    private fun header(i: FitInput, m: TextMeter, w: Float, temp: Float, place: Float, sub: Float, warn: Boolean = false): Header? {
        val tempW = m.width(i.temp, temp, true) * SAFE
        val textW = w - tempW - HEADER_GAP
        if (textW < max(56f, TEXT_SHARE * w)) return null
        if (warn && i.alert.isNotEmpty()) {
            val p = pill(m, i.alert, sub, textW) ?: return null
            val h = max(m.lineHeight(temp, true) * SAFE, m.lineHeight(place, true) * SAFE + 2f + p.h)
            return Header(h, tempW, textW, p)
        }
        val h = max(m.lineHeight(temp, true) * SAFE, (m.lineHeight(place, true) + m.lineHeight(sub, true)) * SAFE)
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
            val row1 = m.lineHeight(temp, true) * SAFE
            // A warning takes the level name's place, as a pill.
            val warn = if (i.alertShort.isEmpty()) null else pill(m, i.alertShort, line, w) ?: if (force) null else return null
            val row2 = warn?.let { it.h + 2f } ?: (m.lineHeight(line, true) * SAFE)
            val row3 = max(sticker, ch)
            val fits = tempW <= w &&
                n * sticker + (n - 1) * STICKER_GAP + CLOCK_GAP + cw <= w &&
                row1 + row2 + 4f + row3 <= h
            if (!fits && !force) return null
            return Fit(
                FitKind.SMALL, s, pad, pad, temp, 0f, line, w, 0f, 0, 0f, TakeMode.NONE, 0, 0f,
                0f, 0, 0f, sticker, n, clock, cw, ch
            ).with(warn)
        }
        return choose(m, variants, SMALL_CLOCK, { s, n, c -> build(s, n, c) }, { build(MIN_S, 1, SMALL_CLOCK * MIN_S, force = true)!! })
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
            val hd = header(i, m, w, temp, place, sub, warn = true) ?: if (force) Header(40f, 0f, w - 60f) else return null
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
                    if (takeW < m.width(i.takeShort, take, true) * SAFE) ok = false
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
            ).with(hd.pill)
        }
        return choose(
            m, variants.map { Triple(it.first, it.second, false) }, WIDE_CLOCK,
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
            val hd = header(i, m, w, temp, place, sub) ?: if (force) Header(40f, 0f, w - 60f) else return null
            var pillsH = 0f
            var warn: Pill? = null
            if (k > 0 || i.alert.isNotEmpty()) {
                val pillsW = i.pills.take(k).sumOf { (m.width(it, pill, true) * SAFE + 2 * PILL_PAD_H).toDouble() }.toFloat() +
                    (k - 1).coerceAtLeast(0) * 4f
                if (pillsW > w) ok = false
                pillsH = m.lineHeight(pill, true) * SAFE + 2 * PILL_PAD_V
                // A warning comes first in the row, in the longest wording that fits the row on its own:
                // it matters more than the other pills, which get what is left.
                if (i.alert.isNotEmpty()) {
                    warn = pill(m, i.alert, pill, w)
                    if (warn == null) { if (!force) return null } else {
                        pillsH = max(pillsH, warn.h)
                        if (k > 0 && warn.w + 4f + pillsW > w) ok = false
                    }
                }
                pillsH += 6f
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
            ).with(warn)
        }
        return choose(
            m, variants.map { Triple(it.first, it.second, false) }, TALL_CLOCK,
            { s, v, c -> build(s, v.first, v.second, c, cut = v.third) },
            { build(MIN_S, minOf(most, 3), 0, TALL_CLOCK * MIN_S, cut = true, force = true)!! },
            cut = variants.map { Triple(it.first, it.second, true) },
        )
    }
}
