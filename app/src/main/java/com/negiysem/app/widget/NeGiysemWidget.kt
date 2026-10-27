package com.negiysem.app.widget

import android.content.Context
import android.graphics.Paint
import android.graphics.Typeface
import android.os.Build
import android.text.StaticLayout
import android.text.TextPaint
import android.text.TextUtils
import android.text.style.TextAppearanceSpan
import android.util.TypedValue
import android.widget.RemoteViews
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.ColorFilter
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.AndroidRemoteViews
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.appwidget.state.updateAppWidgetState
import androidx.glance.background
import androidx.glance.currentState
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.Column
import androidx.glance.layout.Row
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.fillMaxWidth
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.layout.size
import androidx.glance.layout.width
import androidx.glance.state.GlanceStateDefinition
import androidx.glance.state.PreferencesGlanceStateDefinition
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import com.negiysem.app.MainActivity
import com.negiysem.app.R
import com.negiysem.app.data.Outfit
import com.negiysem.app.data.Store
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class NeGiysemWidget : GlanceAppWidget() {

    companion object {
        val PLAN = stringPreferencesKey("plan")
        /** The app's language ("tr" / "en") for the widget's own words when there is no snapshot yet. */
        val LANG = stringPreferencesKey("lang")
        /** For a widget without weather yet: "headline\nsecond line" (empty: no place chosen, the usual first message). */
        val HINT = stringPreferencesKey("hint")

        /** What a widget still waiting for its first weather says: looking it up, or when it last tried and why not. */
        fun hintFor(store: Store): String {
            if (store.lat == null || store.wiped) return ""
            val lang = store.lang
            val failAt = store.lastFailAt
            if (failAt <= 0L) return Words.of("Hava alınıyor…", lang) + "\n" + Words.of("Bugünün kıyafeti bir bakışta", lang)
            val hm = SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(failAt))
            return Words.of("Hava henüz alınamadı; bağlantı olunca yeniden denenecek.", lang) + "\n" +
                Words.of("Son deneme", lang) + " " + hm + " · " + (store.lastFail ?: "")
        }

        /** Tells every widget without weather yet what is going on (after a refresh that had nothing to draw). */
        suspend fun pushHint(context: Context) {
            val store = Store(context)
            if (store.widgetJson != null) return
            val hint = hintFor(store)
            val ids = GlanceAppWidgetManager(context).getGlanceIds(NeGiysemWidget::class.java)
            val widget = NeGiysemWidget()
            for (id in ids) {
                updateAppWidgetState(context, id) { prefs -> prefs[HINT] = hint }
                widget.update(context, id)
            }
        }

        /** Sends a fresh snapshot to every widget on the home screen. */
        suspend fun pushAll(context: Context, json: String) {
            val ids = GlanceAppWidgetManager(context).getGlanceIds(NeGiysemWidget::class.java)
            val widget = NeGiysemWidget()
            val lang = Store(context).lang
            for (id in ids) {
                updateAppWidgetState(context, id) { prefs -> prefs[PLAN] = json; prefs[LANG] = lang }
                widget.update(context, id)
            }
        }
    }

    // Laid out for the widget's real size: text is measured and made as large as that size allows (WidgetFit).
    override val sizeMode = SizeMode.Exact
    override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = Store(context)
        val stored = store.widgetJson
        val lang = store.lang
        val hint = hintFor(store)
        updateAppWidgetState(context, id) { prefs ->
            if (stored != null && prefs[PLAN] == null) prefs[PLAN] = stored
            prefs[LANG] = lang
            prefs[HINT] = hint
        }
        provideContent {
            val prefs = currentState<Preferences>()
            Body(WidgetData.from(prefs[PLAN], prefs[LANG] ?: lang, prefs[HINT]))
        }
    }
}

/** The widget's own words in the app's language (the snapshot's texts already come in it). */
private object Words {
    private val EN = mapOf(
        "Uygulamayı aç ve konumunu seç." to "Open the app and choose your location.",
        "Bugünün kıyafeti bir bakışta" to "Today's outfit at a glance",
        "Son güncelleme" to "Last updated", "dün" to "yesterday",
        "Sıradaki: " to "Next: ",
        "Hissedilen " to "Feels like ",
        "Yanına al: " to "Take along: ",
        "Hava alınıyor…" to "Getting the weather…", "Son deneme" to "Last try",
        "Hava henüz alınamadı; bağlantı olunca yeniden denenecek." to "Couldn't get the weather yet; it will try again once there's a connection."
    )
    fun of(s: String, lang: String) = if (lang == "en") EN[s] ?: s else s
}

private data class Garment(val g: String, val label: String)

/** The most dangerous weather warning (Alerts): "Fırtına", "02:00–05:00", short "Fırtına"; shown until [until]. */
private data class Warning(val lv: Int, val title: String, val short: String, val whenText: String, val until: Long) {
    val live get() = System.currentTimeMillis() < until
}

private data class WidgetData(
    val ok: Boolean, val level: Int, val headline: String, val temp: Double, val feels: Double,
    val cond: String, val isDay: Boolean, val place: String, val updated: Long,
    val wear: List<Garment>, val take: List<Garment>, val pills: List<String>, val next: String = "", val lang: String = "tr",
    val warning: Warning? = null,
    /** The empty widget's second line (default: "Bugünün kıyafeti bir bakışta"). */
    val note: String? = null,
) {
    fun w(s: String) = Words.of(s, lang)

    companion object {
        /** [hint]: "headline\nsecond line" for a widget whose place is known but whose weather isn't there yet. */
        fun empty(lang: String, hint: String? = null): WidgetData {
            val h = hint?.takeIf { it.isNotBlank() }?.split("\n", limit = 2)
            return WidgetData(
                ok = false, level = 5, headline = h?.getOrNull(0) ?: Words.of("Uygulamayı aç ve konumunu seç.", lang), temp = Double.NaN, feels = Double.NaN,
                cond = "", isDay = true, place = "Ne Giysem?", updated = 0L,
                wear = listOf(Garment("tshirt", Outfit.label("tshirt", lang))), take = emptyList(), pills = emptyList(), lang = lang,
                note = h?.getOrNull(1)
            )
        }

        /** [lang] is used for the empty widget; a snapshot carries its own (one from before languages existed is Turkish). */
        fun from(json: String?, lang: String = "tr", hint: String? = null): WidgetData {
            if (json.isNullOrBlank()) return empty(lang, hint)
            return runCatching {
                val o = JSONObject(json)
                val sLang = o.optString("lang", "tr").takeIf { it == "tr" || it == "en" } ?: "tr"
                fun list(key: String): List<Garment> {
                    val a = o.optJSONArray(key) ?: return emptyList()
                    return (0 until a.length()).mapNotNull { i -> a.optJSONObject(i)?.let { Garment(it.optString("g"), it.optString("label")) } }
                }
                val pillsArr = o.optJSONArray("pills")
                WidgetData(
                    ok = true,
                    level = o.optInt("level", 4).coerceIn(0, 7),
                    headline = o.optString("headline").replace("{", "").replace("}", ""),
                    temp = o.optDouble("temp", Double.NaN),
                    feels = o.optDouble("feels", Double.NaN),
                    cond = o.optString("cond"),
                    isDay = o.optBoolean("isDay", true),
                    place = Outfit.ownName(o.optString("place", "Konumun"), sLang),
                    updated = o.optLong("updated", 0L),
                    wear = list("wear"),
                    take = list("take"),
                    pills = if (pillsArr == null) emptyList() else (0 until pillsArr.length()).map { pillsArr.optString(it) },
                    next = o.optString("next", ""),
                    lang = sLang,
                    warning = o.optJSONObject("alert")?.let { a ->
                        Warning(a.optInt("lv", 1).coerceIn(1, 2), a.optString("title"), a.optString("short"), a.optString("when"), a.optLong("until"))
                            .takeIf { it.title.isNotBlank() && it.live }
                    }
                ).let { d ->
                    // The warning's pill already says "Fırtına" or "Gök gürültülü sağanak"; the outfit's own pill would only repeat it.
                    val w = d.warning ?: return@let d
                    val thunder = w.title.contains("gürültü", ignoreCase = true) || w.title.contains("thunder", ignoreCase = true)
                    d.copy(pills = d.pills.filter { p ->
                        p != w.short && !w.title.startsWith(p) && !(thunder && (p == "Gök gürültüsü" || p == "Thunder"))
                    })
                }
            }.getOrDefault(empty(lang, hint))
        }
    }
}

private val STICKERS = mapOf(
    "atki" to R.drawable.g_atki, "bere" to R.drawable.g_bere, "bot" to R.drawable.g_bot, "ceket" to R.drawable.g_ceket,
    "corap" to R.drawable.g_corap, "eldiven" to R.drawable.g_eldiven, "gozluk" to R.drawable.g_gozluk, "hirka" to R.drawable.g_hirka,
    "jean" to R.drawable.g_jean, "kaban" to R.drawable.g_kaban, "kazak" to R.drawable.g_kazak, "krem" to R.drawable.g_krem,
    "longsleeve" to R.drawable.g_longsleeve, "mont" to R.drawable.g_mont, "pantolon" to R.drawable.g_pantolon,
    "parka" to R.drawable.g_parka, "ruzgarlik" to R.drawable.g_ruzgarlik, "sandalet" to R.drawable.g_sandalet,
    "sapka" to R.drawable.g_sapka, "semsiye" to R.drawable.g_semsiye, "sisme" to R.drawable.g_sisme,
    "sneaker" to R.drawable.g_sneaker, "sort" to R.drawable.g_sort, "spor" to R.drawable.g_spor, "su" to R.drawable.g_su,
    "sweatshirt" to R.drawable.g_sweatshirt, "tayt" to R.drawable.g_tayt, "thermal" to R.drawable.g_thermal,
    "tshirt" to R.drawable.g_tshirt, "yagmurluk" to R.drawable.g_yagmurluk, "yuruyus" to R.drawable.g_yuruyus
)

/**
 * [base] is the widget's bottom layer: the phone's colour palette (Android 12+, see values-v31/colors.xml), resolved
 * by the home screen so it follows a palette change at once. [overlay] is the level colour on top of it, partly
 * see-through, so the level keeps its own colour but takes on the palette's tint (like Windows' Mica, without blur).
 * [bg] is roughly the colour that results; it colours text on dark pills.
 */
private class Palette(val base: ColorProvider, val overlay: Color, val bg: Color, val ink: Color, val sub: Color, val night: Boolean)

/** Share of the level colour over the palette by day (night keeps the old 24 % over a dark base). */
private const val DAY_LEVEL = 0.6f
private const val NIGHT_LEVEL = 0.24f

private fun palette(d: WidgetData): Palette {
    val lv = Color(Outfit.LEVEL_COLORS[d.level])
    val night = d.ok && !d.isDay
    // Before Android 12 there's no palette to blend with: the level colour alone by day, as before.
    val hasPalette = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
    if (!night) {
        val share = if (hasPalette) DAY_LEVEL else 1f
        return Palette(ColorProvider(R.color.widget_base_day), lv.copy(alpha = share), lv, Color(0xFF14161F), Color(0xB014161F), false)
    }
    val base = Color(0xFF0B0D16)
    val mixed = Color(
        red = lv.red * NIGHT_LEVEL + base.red * (1 - NIGHT_LEVEL),
        green = lv.green * NIGHT_LEVEL + base.green * (1 - NIGHT_LEVEL),
        blue = lv.blue * NIGHT_LEVEL + base.blue * (1 - NIGHT_LEVEL),
        alpha = 1f
    )
    return Palette(ColorProvider(R.color.widget_base_night), lv.copy(alpha = NIGHT_LEVEL), mixed, Color(0xFFF6F4EE), Color(0xB8F6F4EE), true)
}

private fun deg(v: Double): String = if (v.isNaN()) "—" else Outfit.deg(v)

private fun style(color: Color, size: Float, bold: Boolean = true) =
    TextStyle(color = ColorProvider(color), fontSize = size.sp, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)

@Composable
private fun Sticker(g: Garment, size: Float) {
    Image(
        provider = ImageProvider(STICKERS[g.g] ?: R.drawable.g_tshirt),
        contentDescription = g.label,
        modifier = GlanceModifier.size(size.dp)
    )
}

/**
 * Measures text the way the home screen will draw it: the phone's own font (Glance's bold is the device default
 * family at weight 700), its font size setting, and TextView's line height with font padding.
 */
private class AndroidMeter(context: Context) : TextMeter {
    private val dm = context.resources.displayMetrics
    override val fontScale: Float = context.resources.configuration.fontScale
    private val family: Typeface = runCatching {
        Typeface.create(TextAppearanceSpan(context, android.R.style.TextAppearance_DeviceDefault).family, Typeface.NORMAL)
    }.getOrNull() ?: Typeface.DEFAULT
    private val boldFace = if (Build.VERSION.SDK_INT >= 28) Typeface.create(family, 700, false) else Typeface.create(family, Typeface.BOLD)
    private val normalFace = if (Build.VERSION.SDK_INT >= 28) Typeface.create(family, 400, false) else family

    private fun paint(sp: Float, face: Typeface) = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, dm)
        typeface = face
    }

    override fun width(text: String, sp: Float, bold: Boolean) =
        paint(sp, if (bold) boldFace else normalFace).measureText(text) / dm.density

    override fun block(text: String, sp: Float, bold: Boolean, maxWidth: Float, maxLines: Int): Pair<Float, Int> {
        val t = text.ifEmpty { " " }
        val layout = StaticLayout.Builder
            .obtain(t, 0, t.length, paint(sp, if (bold) boldFace else normalFace), maxOf(1, (maxWidth * dm.density).toInt()))
            .setIncludePad(true)
            .setMaxLines(maxLines)
            .setEllipsize(TextUtils.TruncateAt.END)
            .build()
        return layout.height / dm.density to layout.lineCount
    }

    // The clock is a TextClock with textStyle="bold" and no font padding (res/layout/widget_clock.xml).
    override fun clockWidth(sp: Float) =
        CLOCK_SAMPLES.maxOf { paint(sp, Typeface.DEFAULT_BOLD).measureText(it) } / dm.density

    override fun clockHeight(sp: Float): Float {
        val fm = paint(sp, Typeface.DEFAULT_BOLD).fontMetrics
        return (fm.descent - fm.ascent) / dm.density
    }

    private companion object {
        val CLOCK_SAMPLES = listOf("00:00", "22:22", "18:58", "12:59", "20:44")
    }
}

private fun placeLine(d: WidgetData) = if (d.ok) d.place + " · " + Outfit.levelName(d.level, d.lang) else "Ne Giysem?"

private fun subLine(d: WidgetData) = when {
    !d.ok -> d.note ?: d.w("Bugünün kıyafeti bir bakışta")
    staleText(d) != null -> staleText(d)!!
    d.next.isNotEmpty() -> d.w("Sıradaki: ") + d.next
    else -> d.w("Hissedilen ") + deg(d.feels) + " · " + d.cond
}

private fun takeLine(d: WidgetData) =
    if (d.take.isEmpty()) "" else d.w("Yanına al: ") + d.take.take(3).joinToString(", ") { it.label }

/**
 * "Son güncelleme 08:10" when the snapshot is more than two hours old (the phone may have put the app to sleep);
 * "Son güncelleme dün 22:40" or "… 24 Eki 08:10" when it is from another day.
 */
private fun staleText(d: WidgetData): String? {
    if (!d.ok || d.updated <= 0 || System.currentTimeMillis() - d.updated < 2 * 3_600_000L) return null
    val at = java.time.Instant.ofEpochMilli(d.updated).atZone(java.time.ZoneId.systemDefault())
    val days = java.time.temporal.ChronoUnit.DAYS.between(at.toLocalDate(), java.time.LocalDate.now())
    val day = when (days) {
        0L -> ""
        1L -> d.w("dün") + " "
        else -> at.format(java.time.format.DateTimeFormatter.ofPattern("d MMM", if (d.lang == "en") Locale.ENGLISH else Locale.forLanguageTag("tr"))) + " "
    }
    return d.w("Son güncelleme") + " " + day + SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(d.updated))
}

/** The sizes for this widget: [width] × [height] dp, measured with the phone's font. */
internal fun fitFor(context: Context, json: String?, lang: String, width: Float, height: Float): Fit =
    fitFor(context, WidgetData.from(json, lang), width, height)

private fun fitFor(context: Context, d: WidgetData, width: Float, height: Float): Fit {
    val w = d.warning
    return WidgetFit.fit(
        FitInput(
            width = width, height = height, temp = deg(d.temp), place = placeLine(d), sub = subLine(d),
            small = staleText(d) ?: if (d.ok) Outfit.levelName(d.level, d.lang) else "Ne Giysem?",
            headline = d.headline, takeLine = takeLine(d), takeShort = d.take.firstOrNull()?.let { "+ " + it.label } ?: "",
            pills = d.pills, labels = d.wear.take(4).map { it.label },
            alert = if (w == null) emptyList() else listOf(w.title + " · " + w.whenText, w.short + " · " + w.whenText, w.title, w.short)
                .filter { it.isNotBlank() && !it.startsWith(" · ") && !it.endsWith(" · ") }.distinct(),
            alertShort = if (w == null) emptyList() else listOf(w.title, w.short).filter { it.isNotBlank() }.distinct(),
        ),
        AndroidMeter(context)
    )
}

/** The warning pill's colours, as on the app screen: yellow for "Dikkat", orange for "Tehlikeli", dark text. */
private fun warnBg(lv: Int) = Color(if (lv == 2) 0xFFFF8A5B else 0xFFFFE27A)
private fun warnInk(lv: Int) = Color(if (lv == 2) 0xFF2A0C00 else 0xFF2A2100)

/** The warning sign and words on their own coloured pill. */
@Composable
private fun WarningPill(d: WidgetData, f: Fit) {
    val lv = d.warning?.lv ?: 1
    Row(
        modifier = GlanceModifier.background(warnBg(lv)).cornerRadius(999.dp)
            .padding(horizontal = WidgetFit.PILL_PAD_H.dp, vertical = WidgetFit.PILL_PAD_V.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Image(
            provider = ImageProvider(R.drawable.ic_warn), contentDescription = null,
            colorFilter = ColorFilter.tint(ColorProvider(warnInk(lv))), modifier = GlanceModifier.size(f.alertIcon.dp)
        )
        Spacer(GlanceModifier.width(WidgetFit.ICON_GAP.dp))
        Text(f.alert, style = style(warnInk(lv), f.alertSp), maxLines = 1, modifier = GlanceModifier.width(f.alertW.dp))
    }
}

@Composable
private fun Body(d: WidgetData) {
    val p = palette(d)
    val size = LocalSize.current
    // A little room for the home screen's rounding of the size it reports.
    val w = size.width.value.takeIf { it.isFinite() && it > 0f }?.minus(2f) ?: 248f
    val h = size.height.value.takeIf { it.isFinite() && it > 0f }?.minus(2f) ?: 108f
    val f = fitFor(LocalContext.current, d, w, h)
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(p.base)
            .cornerRadius(26.dp)
            .clickable(actionStartActivity<MainActivity>())
    ) {
        Box(modifier = GlanceModifier.fillMaxSize().background(p.overlay)) {
            when (f.kind) {
                FitKind.SMALL -> SmallLayout(d, p, f)
                FitKind.WIDE -> WideLayout(d, p, f)
                FitKind.TALL -> TallLayout(d, p, f)
            }
            CornerClock(p, f)
        }
    }
}

/**
 * The time of day, pinned to the bottom-right corner on its own layer: a TextClock, so it keeps ticking without
 * the app running. It wraps its text (see res/layout/widget_clock.xml); the layouts keep that corner free (their
 * bottom row is at least as tall as the clock, and their widths leave room for its widest time).
 */
@Composable
private fun CornerClock(p: Palette, f: Fit) {
    val views = RemoteViews(LocalContext.current.packageName, R.layout.widget_clock).apply {
        setTextColor(R.id.widget_clock, p.ink.toArgb())
        setTextViewTextSize(R.id.widget_clock, TypedValue.COMPLEX_UNIT_SP, f.clock)
    }
    Box(
        modifier = GlanceModifier.fillMaxSize().padding(end = f.padH.dp, bottom = f.padV.dp),
        contentAlignment = Alignment.BottomEnd
    ) {
        AndroidRemoteViews(views)
    }
}

/** Makes a bottom row at least as tall as the clock beside it. */
@Composable
private fun ClockHeight(f: Fit) = Spacer(GlanceModifier.width(0.dp).height(f.clockH.dp))

@Composable
private fun Stickers(d: WidgetData, f: Fit) {
    d.wear.take(f.stickers).forEachIndexed { i, g ->
        if (i > 0) Spacer(GlanceModifier.width(WidgetFit.STICKER_GAP.dp))
        Sticker(g, f.sticker)
    }
}

@Composable
private fun SmallLayout(d: WidgetData, p: Palette, f: Fit) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(f.padH.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(deg(d.temp), style = style(p.ink, f.temp), modifier = GlanceModifier.width(f.textW.dp), maxLines = 1)
        }
        if (f.alert.isNotEmpty()) {
            Spacer(GlanceModifier.height(2.dp))
            WarningPill(d, f)
        } else {
            Text(staleText(d) ?: if (d.ok) Outfit.levelName(d.level, d.lang) else "Ne Giysem?", style = style(p.sub, f.sub), maxLines = 1)
        }
        Spacer(GlanceModifier.defaultWeight())
        Row(verticalAlignment = Alignment.Bottom) {
            Stickers(d, f)
            ClockHeight(f)
        }
    }
}

/** Temperature, place and level, and the second line; the text column has a fixed width. */
@Composable
private fun Header(d: WidgetData, p: Palette, f: Fit) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(deg(d.temp), style = style(p.ink, f.temp), maxLines = 1)
        Spacer(GlanceModifier.width(WidgetFit.HEADER_GAP.dp))
        Column(modifier = GlanceModifier.width(f.textW.dp)) {
            Text(placeLine(d), style = style(p.ink, f.place), maxLines = 1)
            if (f.kind == FitKind.WIDE && f.alert.isNotEmpty()) {
                Spacer(GlanceModifier.height(2.dp))
                WarningPill(d, f)
            } else {
                Text(subLine(d), style = style(p.sub, f.sub, bold = d.next.isNotEmpty() || staleText(d) != null), maxLines = 1)
            }
        }
    }
}

@Composable
private fun WideLayout(d: WidgetData, p: Palette, f: Fit) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(horizontal = f.padH.dp, vertical = f.padV.dp)) {
        Header(d, p, f)
        Spacer(GlanceModifier.height((4f * f.scale).dp))
        Text(d.headline, style = style(p.ink, f.head), maxLines = f.headLines)
        if (f.takeMode == TakeMode.OWN_LINE) {
            Spacer(GlanceModifier.height(2.dp))
            Text(takeLine(d), style = style(p.sub, f.take), maxLines = f.takeLines)
        }
        Spacer(GlanceModifier.defaultWeight())
        Row(verticalAlignment = Alignment.CenterVertically) {
            Stickers(d, f)
            if (f.takeMode == TakeMode.INLINE) {
                Spacer(GlanceModifier.width(6.dp))
                Text("+ " + d.take.first().label, style = style(p.ink, f.take), maxLines = 1, modifier = GlanceModifier.width(f.takeW.dp))
            }
            ClockHeight(f)
        }
    }
}

@Composable
private fun TallLayout(d: WidgetData, p: Palette, f: Fit) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(f.padH.dp)) {
        Header(d, p, f)
        Spacer(GlanceModifier.height((6f * f.scale).dp))
        if (f.pills > 0 || f.alert.isNotEmpty()) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                if (f.alert.isNotEmpty()) WarningPill(d, f)
                d.pills.take(f.pills).forEachIndexed { i, s ->
                    if (i > 0 || f.alert.isNotEmpty()) Spacer(GlanceModifier.width(4.dp))
                    Text(
                        s,
                        modifier = GlanceModifier.background(p.ink).cornerRadius(999.dp)
                            .padding(horizontal = WidgetFit.PILL_PAD_H.dp, vertical = WidgetFit.PILL_PAD_V.dp),
                        style = style(p.bg, f.pill), maxLines = 1
                    )
                }
            }
            Spacer(GlanceModifier.height(6.dp))
        }
        Text(d.headline, style = style(p.ink, f.head), maxLines = f.headLines)
        Spacer(GlanceModifier.defaultWeight())
        Row(modifier = GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            d.wear.take(f.stickers).forEachIndexed { i, g ->
                if (i > 0) Spacer(GlanceModifier.width(WidgetFit.TALL_STICKER_GAP.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Sticker(g, f.sticker)
                    Text(g.label, style = style(p.ink, f.label), maxLines = 1)
                }
            }
        }
        Spacer(GlanceModifier.height(WidgetFit.CLOCK_GAP.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            if (f.takeMode != TakeMode.NONE) {
                Text(takeLine(d), style = style(p.sub, f.take), maxLines = f.takeLines, modifier = GlanceModifier.width(f.takeW.dp))
            }
            ClockHeight(f)
        }
    }
}
