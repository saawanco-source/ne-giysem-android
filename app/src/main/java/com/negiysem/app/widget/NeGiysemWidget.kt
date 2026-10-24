package com.negiysem.app.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalSize
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import androidx.glance.appwidget.SizeMode
import androidx.glance.appwidget.action.actionRunCallback
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
        // Sizes Android lays the widget out for; the layout picked for each keeps its content inside the box.
        private val SMALL = DpSize(110.dp, 110.dp)
        private val WIDE = DpSize(250.dp, 110.dp)
        private val WIDE_MID = DpSize(250.dp, 160.dp)
        private val TALL = DpSize(250.dp, 250.dp)
        private val TALL_XL = DpSize(250.dp, 310.dp)

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

    override val sizeMode = SizeMode.Responsive(setOf(SMALL, WIDE, WIDE_MID, TALL, TALL_XL))
    override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val store = Store(context)
        val stored = store.widgetJson
        val lang = store.lang
        updateAppWidgetState(context, id) { prefs ->
            if (stored != null && prefs[PLAN] == null) prefs[PLAN] = stored
            prefs[LANG] = lang
        }
        provideContent {
            val prefs = currentState<Preferences>()
            Body(WidgetData.from(prefs[PLAN], prefs[LANG] ?: lang))
        }
    }
}

/** The widget's own words in the app's language (the snapshot's texts already come in it). */
private object Words {
    private val EN = mapOf(
        "Uygulamayı aç ve konumunu seç." to "Open the app and choose your location.",
        "Bugünün kıyafeti bir bakışta" to "Today's outfit at a glance",
        "Yenile" to "Refresh",
        "Son güncelleme" to "Last updated",
        "Sıradaki: " to "Next: ",
        "Hissedilen " to "Feels like ",
        "Yanına al: " to "Take along: ",
        "Güncelleme" to "Updated"
    )
    fun of(s: String, lang: String) = if (lang == "en") EN[s] ?: s else s
}

private data class Garment(val g: String, val label: String)

private data class WidgetData(
    val ok: Boolean, val level: Int, val headline: String, val temp: Double, val feels: Double,
    val cond: String, val isDay: Boolean, val place: String, val updated: Long,
    val wear: List<Garment>, val take: List<Garment>, val pills: List<String>, val next: String = "", val lang: String = "tr"
) {
    fun w(s: String) = Words.of(s, lang)

    companion object {
        fun empty(lang: String) = WidgetData(
            ok = false, level = 5, headline = Words.of("Uygulamayı aç ve konumunu seç.", lang), temp = Double.NaN, feels = Double.NaN,
            cond = "", isDay = true, place = "Ne Giysem?", updated = 0L,
            wear = listOf(Garment("tshirt", Outfit.label("tshirt", lang))), take = emptyList(), pills = emptyList(), lang = lang
        )

        /** [lang] is used for the empty widget; a snapshot carries its own (one from before languages existed is Turkish). */
        fun from(json: String?, lang: String = "tr"): WidgetData {
            if (json.isNullOrBlank()) return empty(lang)
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
                    lang = sLang
                )
            }.getOrDefault(empty(lang))
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

private class Palette(val bg: Color, val ink: Color, val sub: Color, val night: Boolean)

private fun palette(d: WidgetData): Palette {
    val c = Outfit.LEVEL_COLORS[d.level]
    val lv = Color(c)
    val night = d.ok && !d.isDay
    if (!night) return Palette(lv, Color(0xFF14161F), Color(0xB014161F), false)
    val base = Color(0xFF0B0D16)
    val t = 0.24f
    val mixed = Color(
        red = lv.red * t + base.red * (1 - t),
        green = lv.green * t + base.green * (1 - t),
        blue = lv.blue * t + base.blue * (1 - t),
        alpha = 1f
    )
    return Palette(mixed, Color(0xFFF6F4EE), Color(0xB8F6F4EE), true)
}

private fun deg(v: Double): String = if (v.isNaN()) "—" else Outfit.deg(v)

private fun style(color: Color, size: Int, bold: Boolean = true) =
    TextStyle(color = ColorProvider(color), fontSize = size.sp, fontWeight = if (bold) FontWeight.Bold else FontWeight.Normal)

@Composable
private fun Sticker(g: Garment, size: Dp) {
    Image(
        provider = ImageProvider(STICKERS[g.g] ?: R.drawable.g_tshirt),
        contentDescription = g.label,
        modifier = GlanceModifier.size(size)
    )
}

@Composable
private fun RefreshIcon(p: Palette, d: WidgetData) {
    // A 40 dp touch area around the 22 dp icon.
    Box(
        modifier = GlanceModifier.size(40.dp).clickable(actionRunCallback<RefreshAction>()),
        contentAlignment = Alignment.Center
    ) {
        Image(
            provider = ImageProvider(if (p.night) R.drawable.ic_refresh_light else R.drawable.ic_refresh_ink),
            contentDescription = d.w("Yenile"),
            modifier = GlanceModifier.size(22.dp)
        )
    }
}

/** "Son güncelleme 08:10" when the snapshot is more than two hours old (the phone may have put the app to sleep). */
private fun staleText(d: WidgetData): String? {
    if (!d.ok || d.updated <= 0 || System.currentTimeMillis() - d.updated < 2 * 3_600_000L) return null
    return d.w("Son güncelleme") + " " + SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(d.updated))
}

@Composable
private fun Body(d: WidgetData) {
    val p = palette(d)
    val size = LocalSize.current
    Box(
        modifier = GlanceModifier
            .fillMaxSize()
            .background(p.bg)
            .cornerRadius(26.dp)
            .clickable(actionStartActivity<MainActivity>())
    ) {
        when {
            size.width < 200.dp -> SmallLayout(d, p)
            size.height < 160.dp -> WideLayout(d, p, compact = true)
            size.height < 250.dp -> WideLayout(d, p, compact = false)
            else -> TallLayout(d, p, roomy = size.height >= 310.dp)
        }
    }
}

@Composable
private fun SmallLayout(d: WidgetData, p: Palette) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(10.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(deg(d.temp), style = style(p.ink, 28), modifier = GlanceModifier.defaultWeight(), maxLines = 1)
            RefreshIcon(p, d)
        }
        Text(staleText(d) ?: if (d.ok) Outfit.levelName(d.level, d.lang) else "Ne Giysem?", style = style(p.sub, 12), maxLines = 1)
        Spacer(GlanceModifier.defaultWeight())
        Row(verticalAlignment = Alignment.CenterVertically) {
            d.wear.take(2).forEachIndexed { i, g ->
                if (i > 0) Spacer(GlanceModifier.width(2.dp))
                Sticker(g, 40.dp)
            }
        }
    }
}

@Composable
private fun Header(d: WidgetData, p: Palette, tempSize: Int) {
    Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        Text(deg(d.temp), style = style(p.ink, tempSize), maxLines = 1)
        Spacer(GlanceModifier.width(10.dp))
        Column(modifier = GlanceModifier.defaultWeight()) {
            Text(
                if (d.ok) d.place + " · " + Outfit.levelName(d.level, d.lang) else "Ne Giysem?",
                style = style(p.ink, 13), maxLines = 1
            )
            Text(
                when {
                    !d.ok -> d.w("Bugünün kıyafeti bir bakışta")
                    staleText(d) != null -> staleText(d)!!
                    d.next.isNotEmpty() -> d.w("Sıradaki: ") + d.next
                    else -> d.w("Hissedilen ") + deg(d.feels) + " · " + d.cond
                },
                style = style(p.sub, 12, bold = d.next.isNotEmpty() || staleText(d) != null), maxLines = 1
            )
        }
        RefreshIcon(p, d)
    }
}

@Composable
private fun WideLayout(d: WidgetData, p: Palette, compact: Boolean) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(horizontal = 14.dp, vertical = if (compact) 8.dp else 12.dp)) {
        Header(d, p, if (compact) 28 else 36)
        Spacer(GlanceModifier.height(if (compact) 2.dp else 6.dp))
        Text(d.headline, style = style(p.ink, if (compact) 14 else 16), maxLines = if (compact) 1 else 2)
        Spacer(GlanceModifier.defaultWeight())
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            d.wear.take(4).forEachIndexed { i, g ->
                if (i > 0) Spacer(GlanceModifier.width(2.dp))
                Sticker(g, if (compact) 34.dp else 44.dp)
            }
            if (d.take.isNotEmpty()) {
                Spacer(GlanceModifier.width(8.dp))
                Text(
                    "+ " + d.take.take(2).joinToString(", ") { it.label },
                    style = style(p.ink, 12), maxLines = 2, modifier = GlanceModifier.defaultWeight()
                )
            }
        }
    }
}

@Composable
private fun TallLayout(d: WidgetData, p: Palette, roomy: Boolean) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(if (roomy) 16.dp else 14.dp)) {
        Header(d, p, if (roomy) 44 else 38)
        Spacer(GlanceModifier.height(if (roomy) 10.dp else 6.dp))
        if (d.pills.isNotEmpty()) {
            Row {
                d.pills.take(2).forEachIndexed { i, s ->
                    if (i > 0) Spacer(GlanceModifier.width(4.dp))
                    Text(
                        s,
                        modifier = GlanceModifier.background(p.ink).cornerRadius(999.dp).padding(horizontal = 9.dp, vertical = 3.dp),
                        style = style(p.bg, 11), maxLines = 1
                    )
                }
            }
            Spacer(GlanceModifier.height(6.dp))
        }
        Text(d.headline, style = style(p.ink, if (roomy) 20 else 18), maxLines = if (roomy) 3 else 2)
        Spacer(GlanceModifier.defaultWeight())
        Row(modifier = GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            d.wear.take(4).forEachIndexed { i, g ->
                if (i > 0) Spacer(GlanceModifier.width(4.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Sticker(g, if (roomy) 58.dp else 48.dp)
                    Text(g.label, style = style(p.ink, 11), maxLines = 1)
                }
            }
        }
        if (d.take.isNotEmpty() || d.updated > 0) {
            Spacer(GlanceModifier.height(8.dp))
            val time = if (d.updated > 0) SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(d.updated)) else ""
            val takeText = if (d.take.isNotEmpty()) d.w("Yanına al: ") + d.take.take(3).joinToString(", ") { it.label } else ""
            Text(
                listOf(takeText, if (time.isNotEmpty()) d.w("Güncelleme") + " " + time else "").filter { it.isNotEmpty() }.joinToString("  ·  "),
                style = style(p.sub, 12), maxLines = if (roomy) 2 else 1
            )
        }
    }
}
