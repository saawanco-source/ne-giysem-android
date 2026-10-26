package com.negiysem.app.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

/**
 * Severe-weather warnings from the forecast: the web app's rules (index.html → severe(), severeInfo()), ported
 * for the widget and the notification. tests/parity compares both sides, kinds, hours and words, in both languages.
 * These are the app's own forecast-based warnings, not official ones.
 */
object Alerts {

    /** [k]: storm, thunder, rain, snow, ice, heat, cold or fog. [lv]: 1 "Dikkat", 2 "Tehlikeli". [from]/[to]: first and last hour. */
    data class Alert(val k: String, val lv: Int, val from: String, val to: String, val peak: Int?)

    /** What is shown for one warning: "Fırtına", "Tehlikeli", "15:00–18:00 · rüzgâr saatte 98 km'ye kadar", what to do. */
    data class Info(val title: String, val level: String, val whenText: String, val tips: List<String>)

    val KINDS = listOf("storm", "thunder", "rain", "snow", "ice", "heat", "cold", "fog")

    private val TEXT = mapOf(
        "storm" to listOf("Fırtına", "Fırtına"), "thunder" to listOf("Gök gürültülü sağanak", "Dolu ve gök gürültülü sağanak"),
        "rain" to listOf("Kuvvetli yağış", "Çok kuvvetli yağış"), "snow" to listOf("Kar", "Yoğun kar"),
        "ice" to listOf("Buzlanma riski", "Dondurucu yağmur"), "heat" to listOf("Aşırı sıcak", "Aşırı sıcak"),
        "cold" to listOf("Dondurucu soğuk", "Dondurucu soğuk"), "fog" to listOf("Yoğun sis", "Yoğun sis"),
    )
    private val TIPS = mapOf(
        "storm" to listOf("Çatı, tabela, iskele ve ağaçların yakınından geçme.", "Balkondaki saksı ve eşyaları içeri al ya da sabitle.",
            "Vapur ve deniz otobüsü seferleri iptal olabilir; yola çıkmadan kontrol et.", "Şemsiye yerine kapüşonlu, rüzgâr geçirmez bir mont giy."),
        "thunder" to listOf("Açık alanda, ağaç altında ve su kenarında durma; bir binaya ya da araca gir.", "Metal direk ve çitlerden uzak dur."),
        "rain" to listOf("Alt geçitlerden, dere yataklarından ve su birikintilerinden uzak dur.", "Selde yürüme, araçla geçmeye çalışma.",
            "Bodrum ya da zemin kattaysan eşyaları yükseğe kaldır.", "Su geçirmez ayakkabı ve yağmurluk giy."),
        "snow" to listOf("Gerekmedikçe yola çıkma; çıkacaksan toplu taşımayı seç.", "Bot ve yün çorap giy, yedek çorap al.",
            "Çatılardan düşebilecek kar ve buz kütlelerine dikkat et."),
        "ice" to listOf("Kaymayan tabanlı ayakkabı giy; merdiven ve yokuşlarda tutunarak yürü.",
            "Araç kullanacaksan kış lastiği takılı olsun, yavaş git ve takip mesafesini artır."),
        "heat" to listOf("11:00–16:00 arası güneşe çıkma, gölgede kal.", "Susamayı bekleme, sık sık su iç.", "Açık renkli, bol giysi ve şapka giy.",
            "Yaşlılara, çocuklara ve hayvanlara dikkat et; araçta kimseyi bırakma."),
        "cold" to listOf("Kat kat giy; bere, eldiven ve atkı şart.", "Uzun süre dışarıda kalma, ıslanan giysiyi hemen değiştir.",
            "Soba ya da şofben yanan yeri havalandır: karbonmonoksit zehirlenmesine dikkat."),
        "fog" to listOf("Görüş kısa: yolda dikkatli ol, açık renkli ya da yansıtıcı bir şey giy.", "Vapur ve uçak seferlerinde gecikme ya da iptal olabilir."),
    )
    private const val HAIL = "Dolu için aracını kapalı bir yere çek."

    /** The page's English for the same words (index.html → EN). */
    private val EN = mapOf(
        "Fırtına" to "Storm", "Gök gürültülü sağanak" to "Thunderstorms", "Dolu ve gök gürültülü sağanak" to "Hail and thunderstorms",
        "Kuvvetli yağış" to "Heavy rain", "Çok kuvvetli yağış" to "Very heavy rain", "Kar" to "Snow", "Yoğun kar" to "Heavy snow",
        "Buzlanma riski" to "Risk of ice", "Dondurucu yağmur" to "Freezing rain", "Aşırı sıcak" to "Extreme heat", "Dondurucu soğuk" to "Extreme cold",
        "Yoğun sis" to "Dense fog", "Dikkat" to "Caution", "Tehlikeli" to "Danger", "Ne yapmalı?" to "What to do", "yarın" to "tomorrow",
        "rüzgâr saatte {0} km'ye kadar" to "wind up to {0} km/h", "hissedilen {0}'ye kadar" to "feels like up to {0}",
        "hissedilen {0}'ye kadar düşüyor" to "feels as low as {0}",
        "saatte {0} mm'ye kadar" to "up to {0} mm an hour", "sıcaklık {0}" to "temperature {0}",
        "Çatı, tabela, iskele ve ağaçların yakınından geçme." to "Keep away from roofs, signs, scaffolding and trees.",
        "Balkondaki saksı ve eşyaları içeri al ya da sabitle." to "Bring in or tie down pots and anything loose on your balcony.",
        "Vapur ve deniz otobüsü seferleri iptal olabilir; yola çıkmadan kontrol et." to "Ferries may be cancelled; check before you set out.",
        "Şemsiye yerine kapüşonlu, rüzgâr geçirmez bir mont giy." to "Wear a hooded, windproof jacket instead of carrying an umbrella.",
        "Açık alanda, ağaç altında ve su kenarında durma; bir binaya ya da araca gir." to "Don't stay in the open, under trees or by water; get inside a building or a car.",
        "Metal direk ve çitlerden uzak dur." to "Keep away from metal poles and fences.",
        "Dolu için aracını kapalı bir yere çek." to "Move your car under cover from the hail.",
        "Alt geçitlerden, dere yataklarından ve su birikintilerinden uzak dur." to "Avoid underpasses, stream beds and standing water.",
        "Selde yürüme, araçla geçmeye çalışma." to "Don't walk or drive through flood water.",
        "Bodrum ya da zemin kattaysan eşyaları yükseğe kaldır." to "On a basement or ground floor, move your belongings up off the floor.",
        "Su geçirmez ayakkabı ve yağmurluk giy." to "Wear waterproof shoes and a raincoat.",
        "Gerekmedikçe yola çıkma; çıkacaksan toplu taşımayı seç." to "Avoid travel unless you must; if you go, take public transport.",
        "Bot ve yün çorap giy, yedek çorap al." to "Wear boots and wool socks, and take a spare pair.",
        "Çatılardan düşebilecek kar ve buz kütlelerine dikkat et." to "Watch out for snow and ice falling from roofs.",
        "Kaymayan tabanlı ayakkabı giy; merdiven ve yokuşlarda tutunarak yürü." to "Wear shoes with grippy soles; hold on to rails on stairs and slopes.",
        "Araç kullanacaksan kış lastiği takılı olsun, yavaş git ve takip mesafesini artır." to "If you drive, use winter tyres, slow down and keep a longer distance.",
        "11:00–16:00 arası güneşe çıkma, gölgede kal." to "Stay out of the sun between 11:00 and 16:00.",
        "Susamayı bekleme, sık sık su iç." to "Drink water often; don't wait until you're thirsty.",
        "Açık renkli, bol giysi ve şapka giy." to "Wear light-coloured, loose clothes and a hat.",
        "Yaşlılara, çocuklara ve hayvanlara dikkat et; araçta kimseyi bırakma." to "Look out for older people, children and animals; never leave anyone in a car.",
        "Kat kat giy; bere, eldiven ve atkı şart." to "Dress in layers; a beanie, gloves and a scarf are a must.",
        "Uzun süre dışarıda kalma, ıslanan giysiyi hemen değiştir." to "Don't stay out for long; change out of wet clothes right away.",
        "Soba ya da şofben yanan yeri havalandır: karbonmonoksit zehirlenmesine dikkat." to "Air any room with a stove or gas heater on: beware of carbon monoxide.",
        "Görüş kısa: yolda dikkatli ol, açık renkli ya da yansıtıcı bir şey giy." to "Visibility is low: take care on the road and wear something light or reflective.",
        "Vapur ve uçak seferlerinde gecikme ya da iptal olabilir." to "Ferries and flights may be delayed or cancelled.",
    )

    fun t(s: String, lang: String): String = if (lang == "en") EN[s] ?: s else s
    private fun t(s: String, lang: String, arg: String) = t(s, lang).replace("{0}", arg)

    private val HOUR: DateTimeFormatter = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH")
    private fun key(ms: Long, offSec: Long): String = HOUR.format(Instant.ofEpochMilli(ms + offSec * 1000).atOffset(ZoneOffset.UTC))
    private fun JSONArray?.num(i: Int): Double? =
        if (this == null || i < 0 || i >= length()) null else (opt(i) as? Number)?.toDouble()?.takeIf { it.isFinite() }
    private fun JSONArray.str(i: Int): String = opt(i)?.takeIf { it != JSONObject.NULL }?.toString() ?: "null"
    private fun offset(wx: JSONObject): Long = (wx.opt("utc_offset_seconds") as? Number)?.toLong() ?: 0L

    private class Acc(var lv: Int, val i: Int, var j: Int, var peak: Double?)

    /** The warnings for the next 24 hours from the current hour, most dangerous first. */
    fun find(wx: JSONObject, nowMs: Long): List<Alert> {
        val h = wx.optJSONObject("hourly") ?: return emptyList()
        val time = h.optJSONArray("time") ?: return emptyList()
        if (time.length() == 0) return emptyList()
        val n = time.length()
        val k0 = key(nowMs, offset(wx))
        var i0 = -1
        for (i in 0 until n) if (time.str(i).take(13) == k0) { i0 = i; break }
        if (i0 < 0) { if (k0 < time.str(0).take(13)) i0 = 0 else return emptyList() }
        val temp = h.optJSONArray("temperature_2m"); val app = h.optJSONArray("apparent_temperature")
        val code = h.optJSONArray("weather_code"); val wind = h.optJSONArray("wind_speed_10m")
        val gusts = h.optJSONArray("wind_gusts_10m"); val prec = h.optJSONArray("precipitation")
        val found = HashMap<String, Acc>()
        fun hit(k: String, lv: Int, at: Int, peak: Double?) {
            val a = found[k]
            if (a == null) { found[k] = Acc(lv, at, at, peak); return }
            if (lv > a.lv) a.lv = lv
            a.j = at
            if (peak != null && (a.peak == null || (if (k == "cold" || k == "ice") peak < a.peak!! else peak > a.peak!!))) a.peak = peak
        }
        for (j in i0 until minOf(n, i0 + 24)) {
            val tt = temp.num(j)
            val a = app.num(j) ?: tt
            val c = code.num(j)?.let { Math.round(it).toInt() } ?: -1
            val w = wind.num(j); val g = gusts.num(j); val p = prec.num(j)
            var p6 = 0.0
            for (q in j until minOf(n, j + 6)) p6 += prec.num(q) ?: 0.0
            val snow = c in 71..77 || c == 85 || c == 86
            if (a != null && a >= 34) hit("heat", if (a >= 40) 2 else 1, j, a)
            if (a != null && a <= -10) hit("cold", if (a <= -20) 2 else 1, j, a)
            if ((c == 56 || c == 57 || c == 66 || c == 67) && (tt == null || tt <= 2)) hit("ice", 2, j, tt)
            else if (tt != null && tt <= 0.5 && (c in 51..67 || c in 80..82 || snow)) hit("ice", 1, j, tt)
            val wet = p != null && p >= 1
            if (!snow && ((p != null && p >= 15) || (wet && p6 >= 40))) hit("rain", 2, j, p)
            else if (!snow && ((p != null && p >= 6) || (wet && p6 >= 20))) hit("rain", 1, j, p)
            if (c == 96 || c == 99) hit("thunder", 2, j, null) else if (c == 95) hit("thunder", 1, j, null)
            val gust = maxOf(w ?: 0.0, g ?: 0.0)
            if ((g != null && g >= 95) || (w != null && w >= 70)) hit("storm", 2, j, gust)
            else if ((g != null && g >= 70) || (w != null && w >= 50)) hit("storm", 1, j, gust)
            if (c == 75 || c == 86) hit("snow", 2, j, null) else if (c == 73 || c == 85) hit("snow", 1, j, null)
            if (c == 45 || c == 48) hit("fog", 1, j, null)
        }
        return KINDS.mapNotNull { k ->
            found[k]?.let { a -> Alert(k, a.lv, time.str(a.i).take(16), time.str(a.j).take(16), a.peak?.let { Math.round(it).toInt() }) }
        }.sortedWith(compareByDescending<Alert> { it.lv }.thenBy { it.from }.thenBy { KINDS.indexOf(it.k) })
    }

    /** "15:00–21:00", "yarın 03:00–06:00": the last hour that applies ends an hour later. */
    fun whenText(wx: JSONObject, a: Alert, nowMs: Long, lang: String): String {
        val today = key(nowMs, offset(wx)).take(10)
        val d1 = a.from.take(10)
        val end = runCatching { HOUR.format(LocalDateTime.parse(a.to.take(16)).plusHours(1)) }.getOrElse { a.to.take(13) }
        fun day(d: String) = if (d == today) "" else t("yarın", lang) + " "
        return day(d1) + a.from.drop(11).take(5) + "–" + (if (end.take(10) == d1) "" else day(end.take(10))) + end.drop(11).take(2) + ":00"
    }

    private fun peakText(a: Alert, lang: String): String {
        val p = a.peak ?: return ""
        return when (a.k) {
            "storm" -> t("rüzgâr saatte {0} km'ye kadar", lang, "$p")
            "heat" -> t("hissedilen {0}'ye kadar", lang, Outfit.deg(p.toDouble()))
            "cold" -> t("hissedilen {0}'ye kadar düşüyor", lang, Outfit.deg(p.toDouble()))
            "rain" -> if (p > 0) t("saatte {0} mm'ye kadar", lang, "$p") else ""
            "ice" -> t("sıcaklık {0}", lang, Outfit.deg(p.toDouble()))
            else -> ""
        }
    }

    /** When the warning's first hour starts and its last hour ends (epoch ms). */
    fun fromMs(wx: JSONObject, a: Alert): Long = ms(wx, a.from)
    fun untilMs(wx: JSONObject, a: Alert): Long = ms(wx, a.to) + 3_600_000L
    private fun ms(wx: JSONObject, t: String): Long =
        runCatching { LocalDateTime.parse(t.take(16)).toInstant(ZoneOffset.UTC).toEpochMilli() - offset(wx) * 1000 }.getOrDefault(0L)

    /** One or two words for the smallest widget ("Fırtına", "Dolu"); the app's own words, widget only. */
    fun short(a: Alert, lang: String): String {
        val tr = when (a.k) {
            "storm" -> "Fırtına"; "thunder" -> if (a.lv == 2) "Dolu" else "Şimşek"; "rain" -> if (a.lv == 2) "Sel riski" else "Sağanak"; "snow" -> "Kar"
            "ice" -> "Buzlanma"; "heat" -> "Aşırı sıcak"; "cold" -> "Ayaz"; else -> "Sis"
        }
        if (lang != "en") return tr
        return when (a.k) {
            "storm" -> "Storm"; "thunder" -> if (a.lv == 2) "Hail" else "Thunder"; "rain" -> if (a.lv == 2) "Flooding" else "Downpour"; "snow" -> "Snow"
            "ice" -> "Ice"; "heat" -> "Heat"; "cold" -> "Frost"; else -> "Fog"
        }
    }

    /** The line under a notification's text: not an official warning, and where the official ones are. */
    fun note(wx: JSONObject, lang: String): String {
        val turkey = wx.optString("timezone") == "Europe/Istanbul"
        return if (lang == "en") "This is Ne Giysem's own forecast-based warning, not an official one." +
            (if (turkey) " Official warnings: MGM · In an emergency call 112." else " For official warnings, check your local weather service.")
        else "Bu, Ne Giysem’in tahmine dayalı uyarısıdır; resmî uyarı değildir." +
            (if (turkey) " Resmî uyarılar: MGM · Acil durumda 112." else " Resmî uyarılar için yerel meteoroloji servisine bak.")
    }

    fun info(wx: JSONObject, a: Alert, nowMs: Long, lang: String): Info {
        val tips = TIPS.getValue(a.k).toMutableList()
        if (a.k == "thunder" && a.lv == 2) tips.add(HAIL)
        val peak = peakText(a, lang)
        return Info(
            title = t(TEXT.getValue(a.k)[a.lv - 1], lang),
            level = t(if (a.lv == 2) "Tehlikeli" else "Dikkat", lang),
            whenText = whenText(wx, a, nowMs, lang) + if (peak.isNotEmpty()) " · $peak" else "",
            tips = tips.map { t(it, lang) },
        )
    }
}
