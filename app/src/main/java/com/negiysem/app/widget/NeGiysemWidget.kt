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
        private val SMALL = DpSize(110.dp, 110.dp)
        private val WIDE = DpSize(250.dp, 110.dp)
        private val TALL = DpSize(250.dp, 220.dp)

        /** Sends a fresh snapshot to every widget on the home screen. */
        suspend fun pushAll(context: Context, json: String) {
            val ids = GlanceAppWidgetManager(context).getGlanceIds(NeGiysemWidget::class.java)
            val widget = NeGiysemWidget()
            for (id in ids) {
                updateAppWidgetState(context, id) { prefs -> prefs[PLAN] = json }
                widget.update(context, id)
            }
        }
    }

    override val sizeMode = SizeMode.Responsive(setOf(SMALL, WIDE, TALL))
    override val stateDefinition: GlanceStateDefinition<*> = PreferencesGlanceStateDefinition

    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val stored = Store(context).widgetJson
        if (stored != null) {
            updateAppWidgetState(context, id) { prefs -> if (prefs[PLAN] == null) prefs[PLAN] = stored }
        }
        provideContent {
            val prefs = currentState<Preferences>()
            Body(WidgetData.from(prefs[PLAN]))
        }
    }
}

private data class Garment(val g: String, val label: String)

private data class WidgetData(
    val ok: Boolean, val level: Int, val headline: String, val temp: Double, val feels: Double,
    val cond: String, val isDay: Boolean, val place: String, val updated: Long,
    val wear: List<Garment>, val take: List<Garment>, val pills: List<String>
) {
    companion object {
        val EMPTY = WidgetData(
            ok = false, level = 5, headline = "Uygulamayı aç ve konumunu seç.", temp = Double.NaN, feels = Double.NaN,
            cond = "", isDay = true, place = "Ne Giysem?", updated = 0L,
            wear = listOf(Garment("tshirt", "Tişört")), take = emptyList(), pills = emptyList()
        )

        fun from(json: String?): WidgetData {
            if (json.isNullOrBlank()) return EMPTY
            return runCatching {
                val o = JSONObject(json)
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
                    place = o.optString("place", "Konumun"),
                    updated = o.optLong("updated", 0L),
                    wear = list("wear"),
                    take = list("take"),
                    pills = if (pillsArr == null) emptyList() else (0 until pillsArr.length()).map { pillsArr.optString(it) }
                )
            }.getOrDefault(EMPTY)
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
private fun RefreshIcon(p: Palette) {
    Image(
        provider = ImageProvider(if (p.night) R.drawable.ic_refresh_light else R.drawable.ic_refresh_ink),
        contentDescription = "Yenile",
        modifier = GlanceModifier.size(22.dp).clickable(actionRunCallback<RefreshAction>())
    )
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
            size.height < 200.dp -> WideLayout(d, p)
            else -> TallLayout(d, p)
        }
    }
}

@Composable
private fun SmallLayout(d: WidgetData, p: Palette) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(12.dp)) {
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            Text(deg(d.temp), style = style(p.ink, 32), modifier = GlanceModifier.defaultWeight(), maxLines = 1)
            RefreshIcon(p)
        }
        Text(if (d.ok) Outfit.LEVEL_NAMES[d.level] else "Ne Giysem?", style = style(p.sub, 12), maxLines = 1)
        Spacer(GlanceModifier.defaultWeight())
        Row(verticalAlignment = Alignment.CenterVertically) {
            d.wear.take(2).forEachIndexed { i, g ->
                if (i > 0) Spacer(GlanceModifier.width(2.dp))
                Sticker(g, 46.dp)
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
                if (d.ok) d.place + " · " + Outfit.LEVEL_NAMES[d.level] else "Ne Giysem?",
                style = style(p.ink, 13), maxLines = 1
            )
            Text(
                if (d.ok) "Hissedilen " + deg(d.feels) + " · " + d.cond else "Bugünün kıyafeti bir bakışta",
                style = style(p.sub, 12, bold = false), maxLines = 1
            )
        }
        RefreshIcon(p)
    }
}

@Composable
private fun WideLayout(d: WidgetData, p: Palette) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(horizontal = 16.dp, vertical = 12.dp)) {
        Header(d, p, 36)
        Spacer(GlanceModifier.height(6.dp))
        Text(d.headline, style = style(p.ink, 16), maxLines = 2)
        Spacer(GlanceModifier.defaultWeight())
        Row(modifier = GlanceModifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
            d.wear.take(4).forEachIndexed { i, g ->
                if (i > 0) Spacer(GlanceModifier.width(2.dp))
                Sticker(g, 44.dp)
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
private fun TallLayout(d: WidgetData, p: Palette) {
    Column(modifier = GlanceModifier.fillMaxSize().padding(16.dp)) {
        Header(d, p, 44)
        Spacer(GlanceModifier.height(10.dp))
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
        Text(d.headline, style = style(p.ink, 20), maxLines = 3)
        Spacer(GlanceModifier.defaultWeight())
        Row(modifier = GlanceModifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
            d.wear.take(4).forEachIndexed { i, g ->
                if (i > 0) Spacer(GlanceModifier.width(4.dp))
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Sticker(g, 58.dp)
                    Text(g.label, style = style(p.ink, 11), maxLines = 1)
                }
            }
        }
        if (d.take.isNotEmpty() || d.updated > 0) {
            Spacer(GlanceModifier.height(8.dp))
            val time = if (d.updated > 0) SimpleDateFormat("HH:mm", Locale.getDefault()).format(Date(d.updated)) else ""
            val takeText = if (d.take.isNotEmpty()) "Yanına al: " + d.take.take(3).joinToString(", ") { it.label } else ""
            Text(
                listOf(takeText, if (time.isNotEmpty()) "Güncelleme $time" else "").filter { it.isNotEmpty() }.joinToString("  ·  "),
                style = style(p.sub, 12), maxLines = 2
            )
        }
    }
}
