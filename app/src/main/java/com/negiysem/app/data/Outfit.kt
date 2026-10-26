package com.negiysem.app.data

import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Same outfit rules as the web app (index.html → plan()), ported for the home-screen widget.
 * [lang] is "tr" or "en"; the English text is the web app's English (index.html → EN), word for word
 * (tests/parity compares both languages). What the engine decides never depends on the language.
 */
object Outfit {

    private val TR = Locale("tr", "TR")

    val LEVEL_NAMES = listOf("Dondurucu", "Çok soğuk", "Soğuk", "Soğukça", "Serin", "Ilık", "Sıcak", "Çok sıcak")
    val LEVEL_NAMES_EN = listOf("Freezing", "Very cold", "Cold", "Chilly", "Cool", "Mild", "Warm", "Hot")
    private val LEVEL_MIN = doubleArrayOf(Double.NEGATIVE_INFINITY, -3.0, 3.0, 8.0, 13.0, 17.0, 21.0, 26.0)
    val LEVEL_COLORS = longArrayOf(0xFF86AEFF, 0xFF9CCBF7, 0xFF86D6C6, 0xFFAEDD8E, 0xFFE6E86E, 0xFFFFD65E, 0xFFFFAD62, 0xFFFF8270)

    val LABELS = mapOf(
        "tshirt" to "Tişört", "longsleeve" to "Uzun kollu", "thermal" to "Termal içlik", "sweatshirt" to "Sweatshirt",
        "hirka" to "Hırka", "kazak" to "Kazak", "ceket" to "İnce ceket", "mont" to "Mont", "kaban" to "Kaban",
        "sisme" to "Şişme mont", "parka" to "Parka", "yagmurluk" to "Yağmurluk", "ruzgarlik" to "Rüzgarlık",
        "jean" to "Jean", "pantolon" to "Kalın pantolon", "sort" to "Şort", "tayt" to "Tayt", "sneaker" to "Sneaker",
        "spor" to "Spor ayakkabı", "bot" to "Bot", "yuruyus" to "Yürüyüş botu", "sandalet" to "Sandalet", "bere" to "Bere",
        "sapka" to "Şapka", "semsiye" to "Şemsiye", "gozluk" to "Güneş gözlüğü", "atki" to "Atkı", "eldiven" to "Eldiven",
        "su" to "Su", "krem" to "Güneş kremi", "corap" to "Yedek çorap"
    )
    val LABELS_EN = mapOf(
        "tshirt" to "T-shirt", "longsleeve" to "Long sleeve", "thermal" to "Thermal top", "sweatshirt" to "Sweatshirt",
        "hirka" to "Cardigan", "kazak" to "Sweater", "ceket" to "Light jacket", "mont" to "Jacket", "kaban" to "Wool coat",
        "sisme" to "Puffer jacket", "parka" to "Parka", "yagmurluk" to "Raincoat", "ruzgarlik" to "Windbreaker",
        "jean" to "Jeans", "pantolon" to "Warm pants", "sort" to "Shorts", "tayt" to "Leggings", "sneaker" to "Sneakers",
        "spor" to "Running shoes", "bot" to "Boots", "yuruyus" to "Hiking boots", "sandalet" to "Sandals", "bere" to "Beanie",
        "sapka" to "Cap", "semsiye" to "Umbrella", "gozluk" to "Sunglasses", "atki" to "Scarf", "eldiven" to "Gloves",
        "su" to "Water", "krem" to "Sunscreen", "corap" to "Spare socks"
    )
    private val ACC = mapOf(
        "hirka" to "Hırkanı", "ceket" to "İnce ceketini", "mont" to "Montunu", "kaban" to "Kabanını", "sisme" to "Şişme montunu",
        "parka" to "Parkanı", "kazak" to "Kazağını", "sweatshirt" to "Sweatshirtünü", "bere" to "Bereni", "atki" to "Atkını",
        "ruzgarlik" to "Rüzgarlığını", "yagmurluk" to "Yağmurluğunu", "eldiven" to "Eldivenlerini"
    )
    private val OUTER = setOf("ceket", "mont", "kaban", "sisme", "parka", "yagmurluk", "ruzgarlik")
    private val MID = setOf("hirka", "sweatshirt", "kazak")
    private val SHOES = setOf("sneaker", "spor", "bot", "yuruyus", "sandalet")
    private val BOTTOMS = setOf("jean", "pantolon", "sort", "tayt")
    /** Clothes kept (marked) when nothing in the wardrobe can replace them; accessories are left out instead. */
    private val MUST = OUTER + MID + setOf("thermal", "longsleeve", "tshirt") + BOTTOMS + SHOES
    // People and wardrobe (same as the app screen: WHO, SUBS, MUST, STEMS in index.html)
    private val WHO_OFF = mapOf("me" to 0.0, "child" to -2.0, "elder" to -2.0)
    private val SUBS = mapOf(
        "parka" to listOf("sisme", "kaban", "mont"), "sisme" to listOf("parka", "kaban", "mont"), "kaban" to listOf("sisme", "mont", "parka"),
        "mont" to listOf("kaban", "sisme", "ceket"), "ceket" to listOf("ruzgarlik", "hirka", "mont"), "ruzgarlik" to listOf("ceket", "yagmurluk", "hirka"),
        "yagmurluk" to listOf("ruzgarlik", "ceket", "mont", "kaban", "sisme", "parka"),
        "kazak" to listOf("sweatshirt", "hirka"), "sweatshirt" to listOf("kazak", "hirka"), "hirka" to listOf("sweatshirt", "ceket", "kazak"),
        "thermal" to listOf("longsleeve"), "longsleeve" to listOf("thermal", "tshirt"), "tshirt" to listOf("longsleeve"),
        "jean" to listOf("pantolon"), "pantolon" to listOf("jean"), "sort" to listOf("jean"), "tayt" to listOf("pantolon", "jean"),
        "sneaker" to listOf("spor", "bot"), "spor" to listOf("sneaker"), "bot" to listOf("yuruyus", "sneaker"),
        "yuruyus" to listOf("bot", "spor", "sneaker"), "sandalet" to listOf("sneaker", "spor")
    )
    private val STEMS = mapOf(
        "parka" to "parka", "sisme" to "şişme mont", "kaban" to "kaban", "mont" to "mont", "ceket" to "ceket", "hirka" to "hırka",
        "sweatshirt" to "sweatshirt", "tshirt" to "tişört", "thermal" to "termal", "kazak" to "kaza", "yagmurluk" to "yağmurlu",
        "ruzgarlik" to "rüzgarlı", "bere" to "bere", "atki" to "atkı", "eldiven" to "eldiven", "sort" to "şort", "tayt" to "tayt",
        "longsleeve" to "uzun kollu", "semsiye" to "şemsiye", "sapka" to "şapka"
    )

    val WIND_NAMES = listOf("Yıldız", "Poyraz", "Gündoğusu", "Keşişleme", "Kıble", "Lodos", "Günbatısı", "Karayel")
    /** English gives the compass direction instead of the Turkish wind names. */
    val WIND_NAMES_EN = listOf("N", "NE", "E", "SE", "S", "SW", "W", "NW")

    private val COND = mapOf(
        0 to "Açık", 1 to "Çoğunlukla açık", 2 to "Parçalı bulutlu", 3 to "Kapalı", 45 to "Sisli", 48 to "Kırağılı sis",
        51 to "Hafif çisenti", 53 to "Çisenti", 55 to "Yoğun çisenti", 56 to "Donan çisenti", 57 to "Donan çisenti",
        61 to "Hafif yağmur", 63 to "Yağmurlu", 65 to "Kuvvetli yağmur", 66 to "Donan yağmur", 67 to "Donan yağmur",
        71 to "Hafif kar", 73 to "Karlı", 75 to "Yoğun kar", 77 to "Kar taneleri", 80 to "Hafif sağanak", 81 to "Sağanak",
        82 to "Şiddetli sağanak", 85 to "Kar sağanağı", 86 to "Yoğun kar sağanağı", 95 to "Gök gürültülü fırtına",
        96 to "Dolulu fırtına", 99 to "Şiddetli dolulu fırtına"
    )

    /** English for the engine's fixed Turkish text (headlines, labels, pills, conditions), as in index.html → EN. */
    private val EN = mapOf(
        // conditions
        "Açık" to "Clear", "Çoğunlukla açık" to "Mostly clear", "Parçalı bulutlu" to "Partly cloudy", "Kapalı" to "Overcast",
        "Sisli" to "Foggy", "Kırağılı sis" to "Freezing fog", "Hafif çisenti" to "Light drizzle", "Çisenti" to "Drizzle",
        "Yoğun çisenti" to "Heavy drizzle", "Donan çisenti" to "Freezing drizzle", "Hafif yağmur" to "Light rain", "Yağmurlu" to "Rainy",
        "Kuvvetli yağmur" to "Heavy rain", "Donan yağmur" to "Freezing rain", "Hafif kar" to "Light snow", "Karlı" to "Snowy",
        "Yoğun kar" to "Heavy snow", "Kar taneleri" to "Snow grains", "Hafif sağanak" to "Light showers", "Sağanak" to "Showers",
        "Şiddetli sağanak" to "Heavy showers", "Kar sağanağı" to "Snow showers", "Yoğun kar sağanağı" to "Heavy snow showers",
        "Gök gürültülü fırtına" to "Thunderstorm", "Dolulu fırtına" to "Thunderstorm with hail", "Şiddetli dolulu fırtına" to "Severe thunderstorm with hail",
        // parts of the day
        "sabah" to "morning", "öğleden sonra" to "afternoon", "akşam" to "evening", "gece" to "night",
        // headlines
        "Kat kat giy: termal, kazak, {parka}." to "Layer up: thermal, sweater, {parka}.",
        "{Şişme mont}, bere, eldiven: tam kış." to "{Puffer jacket}, beanie, gloves: full winter.",
        "{Kaban} ve atkı zamanı." to "Time for a {wool coat} and scarf.",
        "Kazak üstüne {mont} giy." to "Wear a {jacket} over a sweater.",
        "{Sweatshirt} havası, ince ceketi yanına al." to "{Sweatshirt} weather, bring a light jacket.",
        "{Tişört} yeter, yanına ince bir hırka al." to "A {T-shirt} will do, bring a light cardigan.",
        "Bugün {tişört} havası." to "{T-shirt} weather today.",
        "En {hafif} kıyafetlerini giy, bol su iç." to "Wear your {lightest} clothes, drink lots of water.",
        "{Şort} ve tişörtle çık, su al." to "Go out in {shorts} and a T-shirt, take water.",
        "{Uzun kollu} ve tayt yeter." to "A {long sleeve} and leggings will do.",
        "Tayta {rüzgarlık} ekle, ısınınca açarsın." to "Add a {windbreaker} to your leggings, unzip it as you warm up.",
        "{Termal} katman ve rüzgarlık şart." to "A {thermal} layer and a windbreaker are a must.",
        "Yağmur var: su itici {rüzgarlık} giy, kaymayan taban seç." to "Rain today: wear a water-repellent {windbreaker} and shoes that grip.",
        "{Kapüşonlu yağmurluğunu} giy; rüzgarda şemsiye uçar." to "Wear your {hooded raincoat}; umbrellas fly away in this wind.",
        "Su geçirmez, {kapüşonlu} bir dış katman giy; rüzgarda şemsiye uçar." to "Wear a waterproof, {hooded} outer layer; umbrellas fly away in this wind.",
        "{Yağmurluğunu} giy, şemsiyeni al." to "Wear your {raincoat}, take your umbrella.",
        "Kuvvetli yağmur: {yağmurluğunu} giy, şemsiye tek başına yetmez." to "Heavy rain: wear your {raincoat}, an umbrella alone won't do.",
        "Kuvvetli yağmur: {şemsiyeni} al, dış katmanın su geçirmez olsun." to "Heavy rain: take your {umbrella} and wear a waterproof outer layer.",
        // labels set by the weather
        "Uzun pantolon" to "Long pants", "Su itici rüzgarlık" to "Water-repellent windbreaker", "İnce yağmurluk" to "Light raincoat",
        "Su geçirmez ayakkabı" to "Waterproof shoes", "Kaymaz bot" to "Non-slip boots",
        // pills
        "Yağmur yağıyor" to "Raining", "Çiseliyor" to "Drizzling", "Kar yağıyor" to "Snowing", "Kar" to "Snow", "Buzlanma" to "Icy", "Fırtına" to "Storm",
        "UV yüksek" to "High UV", "Sis" to "Fog",
        // my day (Day.kt) and stored names
        "Bugün" to "Today", "Yarın" to "Tomorrow",
        "Pazar" to "Sunday", "Pazartesi" to "Monday", "Salı" to "Tuesday", "Çarşamba" to "Wednesday", "Perşembe" to "Thursday",
        "Cuma" to "Friday", "Cumartesi" to "Saturday",
        "Konumun" to "Your location", "Kayıtlı yer" to "Saved place"
    )
    /** Names the app stores itself in Turkish (a place without a name); anything else is the person's own text. */
    private val OWN = setOf("Konumun", "Kayıtlı yer")

    private data class Base(val wear: List<String>, val take: List<String>, val head: String)

    private val OUT = listOf(
        Base(listOf("thermal", "kazak", "parka", "pantolon", "bot", "bere"), listOf("eldiven", "atki"), "Kat kat giy: termal, kazak, {parka}."),
        Base(listOf("kazak", "sisme", "pantolon", "bot", "bere"), listOf("eldiven", "atki"), "{Şişme mont}, bere, eldiven: tam kış."),
        Base(listOf("kazak", "kaban", "pantolon", "bot"), listOf("atki", "bere"), "{Kaban} ve atkı zamanı."),
        Base(listOf("kazak", "mont", "jean", "sneaker"), emptyList(), "Kazak üstüne {mont} giy."),
        Base(listOf("sweatshirt", "jean", "sneaker"), listOf("ceket"), "{Sweatshirt} havası, ince ceketi yanına al."),
        Base(listOf("tshirt", "jean", "sneaker"), listOf("hirka"), "{Tişört} yeter, yanına ince bir hırka al."),
        Base(listOf("tshirt", "jean", "sneaker"), emptyList(), "Bugün {tişört} havası."),
        Base(listOf("tshirt", "sort", "sandalet", "sapka"), listOf("su"), "En {hafif} kıyafetlerini giy, bol su iç.")
    )

    private fun sport(level: Int): Base = when {
        level >= 6 -> Base(listOf("tshirt", "sort", "spor"), listOf("su"), "{Şort} ve tişörtle çık, su al.")
        level >= 4 -> Base(listOf("longsleeve", "tayt", "spor"), listOf("su"), "{Uzun kollu} ve tayt yeter.")
        level >= 2 -> Base(listOf("longsleeve", "ruzgarlik", "tayt", "spor"), listOf("su"), "Tayta {rüzgarlık} ekle, ısınınca açarsın.")
        else -> Base(listOf("thermal", "ruzgarlik", "tayt", "spor", "bere"), listOf("eldiven"), "{Termal} katman ve rüzgarlık şart.")
    }

    data class Item(val g: String, val label: String, val need: Boolean = false)
    /** [mm]: rain in that hour (NaN when the forecast doesn't say). */
    data class Hour(val time: String, val app: Double, val p: Double, val code: Int, val wind: Double, val mm: Double = Double.NaN)
    data class Now(
        val t: Double, val app: Double, val code: Int, val isDay: Boolean,
        val wind: Double, val gust: Double, val dir: Double?, val rh: Double?, val precip: Double
    )
    /** [trip]: the "now" is the first outdoor moment of a day plan, not the present (no "it's raining now" wording). */
    data class Input(val now: Now, val window: List<Hour>, val uvMax: Double?, val uvDay: Boolean, val trip: Boolean = false)
    data class Plan(
        val level: Int, val headline: String, val wear: List<Item>, val take: List<Item>,
        val pills: List<String>, val mine: Double
    )

    /** Fixed Turkish text in [lang] ("tr" leaves it as it is). */
    fun t(s: String, lang: String): String = if (lang == "en") EN[s] ?: s else s
    /** A name the app stored itself ("Konumun") in [lang]; the person's own names stay as they are. */
    fun ownName(s: String, lang: String): String = if (s in OWN) t(s, lang) else s
    fun label(g: String, lang: String = "tr"): String = (if (lang == "en") LABELS_EN else LABELS).getValue(g)
    fun levelName(level: Int, lang: String = "tr"): String = (if (lang == "en") LEVEL_NAMES_EN else LEVEL_NAMES)[level]

    fun isRain(c: Int) = (c in 51..67) || (c in 80..82) || c >= 95
    fun isSnow(c: Int) = (c in 71..77) || c == 85 || c == 86
    fun condition(c: Int, lang: String = "tr"): String = t(COND[c] ?: "", lang)
    private fun levelOf(e: Double): Int { var l = 0; for (i in LEVEL_MIN.indices) if (e >= LEVEL_MIN[i]) l = i; return l }
    private fun windIdx(d: Double?): Int = if (d == null || d.isNaN()) -1 else (((d % 360 + 360) % 360) / 45.0).roundToInt() % 8
    fun deg(v: Double): String { val r = v.roundToInt(); return (if (r < 0) "−${-r}" else "$r") + "°" }
    private fun cap(s: String, en: Boolean) = if (s.isEmpty()) s else s.substring(0, 1).uppercase(if (en) Locale.ROOT else TR) + s.substring(1)
    /** First letter in lower case; English keeps "T-shirt" and acronyms as they are (same as the page's lcf()). */
    private fun lcf(s: String, en: Boolean): String = when {
        s.isEmpty() -> s
        en -> if (Regex("^[A-Z][-A-Z]").containsMatchIn(s)) s else s.substring(0, 1).lowercase(Locale.ROOT) + s.substring(1)
        else -> s.substring(0, 1).lowercase(TR) + s.substring(1)
    }
    /** A name used inside a sentence (the page's low()). */
    private fun low(s: String, en: Boolean) = if (en) lcf(s, true) else s.lowercase(TR)
    private fun daypart(t: String): String {
        val h = t.substring(11, 13).toIntOrNull() ?: 18
        return when (h) { in 5..11 -> "sabah"; in 12..16 -> "öğleden sonra"; in 17..20 -> "akşam"; else -> "gece" }
    }
    /** "akşam soğuyor" / "it gets cold in the evening" */
    private fun dpAt(dp: String) = when (dp) { "sabah" -> "in the morning"; "öğleden sonra" -> "in the afternoon"; "akşam" -> "in the evening"; else -> "at night" }

    private fun JSONArray?.d(i: Int): Double = if (this == null || i >= length() || isNull(i)) Double.NaN else optDouble(i, Double.NaN)
    private fun JSONObject?.d(k: String): Double = if (this == null || isNull(k)) Double.NaN else optDouble(k, Double.NaN)

    /** Reads an Open-Meteo forecast into the window the person will be outside for. */
    fun parse(wx: JSONObject, hours: Int, fetchedAt: Long = System.currentTimeMillis()): Input? {
        val hourly = wx.optJSONObject("hourly") ?: return null
        val times = hourly.optJSONArray("time") ?: return null
        if (times.length() == 0) return null
        val cur: JSONObject? = wx.optJSONObject("current")
        val daily: JSONObject? = wx.optJSONObject("daily")
        val offset = wx.optLong("utc_offset_seconds", 0L)
        val nowKey = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH").withZone(ZoneOffset.UTC)
            .format(Instant.ofEpochMilli(System.currentTimeMillis() + offset * 1000))
        var idx = -1
        for (i in 0 until times.length()) if (times.optString(i).take(13) == nowKey) { idx = i; break }
        if (idx < 0) { if (nowKey < times.optString(0).take(13)) idx = 0 else return null }

        val temp: JSONArray? = hourly.optJSONArray("temperature_2m"); val app: JSONArray? = hourly.optJSONArray("apparent_temperature")
        val prob: JSONArray? = hourly.optJSONArray("precipitation_probability"); val code: JSONArray? = hourly.optJSONArray("weather_code")
        val wind: JSONArray? = hourly.optJSONArray("wind_speed_10m"); val dir: JSONArray? = hourly.optJSONArray("wind_direction_10m")
        val day: JSONArray? = hourly.optJSONArray("is_day"); val rain: JSONArray? = hourly.optJSONArray("precipitation")
        val fresh = System.currentTimeMillis() - fetchedAt < 45 * 60_000L && cur != null && !cur.d("temperature_2m").isNaN()
        fun appAt(j: Int): Double { val a = app.d(j); return if (!a.isNaN()) a else temp.d(j) }
        val now0 = if (fresh && cur != null) Now(
            t = cur.d("temperature_2m"), app = cur.d("apparent_temperature").let { if (it.isNaN()) cur.d("temperature_2m") else it }, code = cur.optInt("weather_code", 3),
            isDay = cur.optInt("is_day", 1) == 1, wind = cur.d("wind_speed_10m").let { if (it.isNaN()) 0.0 else it },
            gust = cur.d("wind_gusts_10m").let { if (it.isNaN()) 0.0 else it }, dir = cur.d("wind_direction_10m").takeIf { !it.isNaN() },
            rh = cur.d("relative_humidity_2m").takeIf { !it.isNaN() }, precip = cur.d("precipitation").let { if (it.isNaN()) 0.0 else it }
        ) else Now(
            t = temp.d(idx), app = appAt(idx), code = code?.optInt(idx, 3) ?: 3, isDay = (day?.optInt(idx, 1) ?: 1) == 1,
            wind = wind.d(idx).let { if (it.isNaN()) 0.0 else it }, gust = 0.0, dir = dir.d(idx).takeIf { !it.isNaN() },
            rh = null, precip = 0.0
        )
        if (now0.app.isNaN()) return null
        val now = if (now0.t.isNaN()) now0.copy(t = now0.app) else now0

        val window = ArrayList<Hour>()
        var k = 0
        while (k <= hours && idx + k < times.length()) {
            val j = idx + k
            window.add(Hour(times.optString(j), appAt(j), prob.d(j).let { if (it.isNaN()) 0.0 else it }, code?.optInt(j, 3) ?: 3,
                wind.d(j).let { if (it.isNaN()) 0.0 else it }, rain.d(j)))
            k++
        }
        val dTimes: JSONArray? = daily?.optJSONArray("time")
        var di = -1
        if (dTimes != null) for (i in 0 until dTimes.length()) if (dTimes.optString(i) == nowKey.take(10)) { di = i; break }
        val uvArr: JSONArray? = daily?.optJSONArray("uv_index_max")
        val uv: Double? = if (di >= 0) uvArr.d(di).takeIf { !it.isNaN() } else null
        // Only today's daylight hours: today's UV maximum says nothing about tomorrow morning.
        val uvDay = window.any { val hr = it.time.substring(11, 13).toIntOrNull() ?: 0; hr in 10..16 && it.time.take(10) == nowKey.take(10) }
        return Input(now, window, uv, uvDay)
    }

    /**
     * [who]: "me", "child" or "elder" (children and older people are dressed as if it were 2° colder).
     * [missing]: pieces the person doesn't have; the closest piece they do have is suggested instead.
     * [lang]: "tr" or "en", the language of the headline, labels and pills.
     */
    fun plan(inp: Input, feel: String, act: String, who: String = "me", missing: Set<String> = emptySet(), lang: String = "tr"): Plan {
        val en = lang == "en"
        val off = (when (feel) { "cold" -> -3.0; "warm" -> 3.0; else -> 0.0 }) + (when (act) { "field" -> -1.0; "sport" -> 6.0; else -> 0.0 }) +
            (WHO_OFF[who] ?: 0.0)
        fun owned(g: String) = g !in missing
        fun lab(g: String) = label(g, lang)
        val w = inp.window.filter { !it.app.isNaN() }
        val rawNow = inp.now.app
        var rawLow = rawNow; var rawHigh = rawNow; var lowAt: String? = null; var highAt: String? = null
        for (h in w) {
            if (h.app < rawLow) { rawLow = h.app; lowAt = h.time }
            if (h.app > rawHigh) { rawHigh = h.app; highAt = h.time }
        }
        val e = rawNow + off
        // The level follows the rounded number the person sees, like the app screen.
        val level = levelOf(e.roundToInt().toDouble())
        val lLow = min(level, levelOf(rawLow + off + 0.7))
        val lHigh = max(level, levelOf(rawHigh + off - 0.7))
        val sport = act == "sport"
        val base = if (sport) sport(level) else OUT[level]
        val night = !inp.now.isDay && !inp.uvDay
        val wear = base.wear.filter { !(night && it == "sapka") }.map { Item(it, lab(it)) }.toMutableList()
        var take = base.take.map { Item(it, lab(it)) }.toMutableList()
        // head is the verdict shown; headT the same verdict in Turkish, for noticing the pieces it names (below).
        var head = t(base.head, lang)
        var headT = base.head
        val pills = ArrayList<String>()

        fun has(g: String) = wear.any { it.g == g }
        fun swap(group: Set<String>, g: String, label: String = lab(g)) {
            val i = wear.indexOfFirst { it.g in group }
            if (i >= 0) wear[i] = Item(g, label) else wear.add(Item(g, label))
        }
        fun addTake(g: String, label: String = lab(g), first: Boolean = false) {
            if (has(g) || take.any { it.g == g }) return
            if (first) take.add(0, Item(g, label)) else take.add(Item(g, label))
        }
        fun strip(s: String) = s.replace("{", "").replace("}", "")
        fun outerNow(): String? = wear.firstOrNull { it.g in OUTER }?.g
        fun takesOuter() = take.any { it.g in OUTER }

        val trip = inp.trip
        val codes = listOf(inp.now.code) + w.map { it.code }
        val pMax = (listOf(0.0) + w.map { it.p }).maxOrNull()!!.roundToInt()
        val windMax = (listOf(inp.now.wind) + w.map { it.wind }).maxOrNull()!!.roundToInt()
        val gust = inp.now.gust.roundToInt()
        val wi = windIdx(inp.now.dir)
        val precipNow = !trip && inp.now.precip >= 0.2
        val snowNow = !trip && (isSnow(inp.now.code) || (precipNow && !isRain(inp.now.code) && !inp.now.t.isNaN() && inp.now.t <= 0.5))
        val rainNow = !trip && (isRain(inp.now.code) || (precipNow && !snowNow))
        val snowy = snowNow || codes.any { isSnow(it) }
        val wet = rainNow || (codes.any { isRain(it) } && pMax >= (if (trip) 30 else 40)) || (pMax >= 60 && !snowy)
        val maybe = !wet && !snowy && pMax >= 30
        val icy = codes.any { it == 56 || it == 57 || it == 66 || it == 67 }
        val thunder = codes.any { it >= 95 }
        // How hard it rains, in mm an hour (as the app screen): the wettest hour ahead (snow aside) or what is falling now.
        // Drizzle (under 0.5 mm) needs no raincoat or boots; from 6 mm an umbrella alone won't do.
        val mms = w.filter { !it.mm.isNaN() && !isSnow(it.code) }.map { it.mm }.toMutableList()
        if (!trip && !snowNow && inp.now.precip > 0) mms.add(inp.now.precip)
        val mmMax = mms.maxOrNull()
        val heavy = wet && mmMax != null && mmMax >= 6
        val drizzle = wet && !heavy && !thunder && mmMax != null && mmMax >= 0.1 && mmMax < 0.5 && codes.none { it == 65 || it == 67 || it == 82 }
        val windy = windMax >= 28 || gust >= 45
        val hasOuter = wear.any { it.g in OUTER }

        if (act == "field") {
            swap(BOTTOMS, "pantolon", t("Uzun pantolon", lang))
            swap(SHOES, "yuruyus")
            if (level >= 5 && !night && !has("sapka")) wear.add(Item("sapka", lab("sapka")))
        }

        var lowPool: List<String> = emptyList()
        var carry: String? = null
        if (lLow < level) {
            val lo = if (sport) sport(lLow) else OUT[lLow]
            val pool = (lo.wear + lo.take).filter { !has(it) && owned(it) }
            lowPool = pool
            // Already wearing a coat: carry a warmer layer or a scarf/beanie, never a second coat.
            val cand = (if (hasOuter) pool.firstOrNull { it in MID } ?: pool.firstOrNull { it in setOf("atki", "bere", "eldiven") }
                else pool.firstOrNull { it in OUTER } ?: pool.firstOrNull { it in MID })
                ?: (if (sport) pool.firstOrNull { it == "longsleeve" || it == "thermal" } else null)
            val dp = lowAt?.let { daypart(it) } ?: "akşam"
            if (cand != null) {
                take = take.filter { it.g !in OUTER && it.g !in MID }.toMutableList()
                addTake(cand, first = true)
                carry = cand
                val acc = ACC[cand]
                if (acc != null && !sport) {
                    val cold = rawLow + off < 8
                    headT = "{$acc} yanına al, $dp " + (if (cold) "soğuyor" else "serinliyor") + "."
                    head = if (en) "Take your {" + low(lab(cand), true) + "}, it gets " + (if (cold) "cold" else "chilly") + " " + dpAt(dp) + "." else headT
                }
            }
            pills.add(cap(t(dp, lang), en) + " " + deg(rawLow))
        } else if (lHigh > level && highAt != null) {
            pills.add(cap(t(daypart(highAt), lang), en) + " " + deg(rawHigh))
        }

        if (wet) {
            pills.add(0, if (drizzle) { if (rainNow) t("Çiseliyor", lang) else if (en) "Drizzle $pMax%" else "Çiseleme %$pMax" }
                else if (rainNow) t("Yağmur yağıyor", lang) else if (en) "Rain $pMax%" else "Yağmur %$pMax")
            if (sport) {
                // No umbrella while running: a water-repellent shell instead.
                if (!has("ruzgarlik")) wear.add(Item("ruzgarlik", t("Su itici rüzgarlık", lang)))
                headT = "Yağmur var: su itici {rüzgarlık} giy, kaymayan taban seç."; head = t(headT, lang)
            } else if (drizzle) {
                // Just drizzle: an umbrella in the bag, or a hood in the wind; no raincoat, no boots.
                if (!windy) addTake("semsiye")
            } else {
                var addedCoat = false
                val hot = level >= 6
                if (!hasOuter && !(hot && !windy && !heavy)) {
                    // Something waterproof is worn, not carried: a raincoat replaces the jacket to take along.
                    val dropped = takesOuter()
                    take = take.filter { it.g !in OUTER }.toMutableList()
                    wear.add(Item("yagmurluk", if (hot) t("İnce yağmurluk", lang) else lab("yagmurluk"))); addedCoat = true
                    if (dropped && carry != null && carry in OUTER) lowPool.firstOrNull { it in MID && !has(it) }?.let { addTake(it, first = true) }
                }
                if (act == "city" && !hot && wear.any { it.g == "sneaker" || it.g == "sandalet" }) swap(SHOES, "bot", t("Su geçirmez ayakkabı", lang))
                if (windy) {
                    headT = if (addedCoat) "{Kapüşonlu yağmurluğunu} giy; rüzgarda şemsiye uçar." else "Su geçirmez, {kapüşonlu} bir dış katman giy; rüzgarda şemsiye uçar."
                    head = t(headT, lang)
                } else {
                    addTake("semsiye", first = true)
                    if (heavy) {
                        headT = if (addedCoat) "Kuvvetli yağmur: {yağmurluğunu} giy, şemsiye tek başına yetmez." else "Kuvvetli yağmur: {şemsiyeni} al, dış katmanın su geçirmez olsun."
                        head = t(headT, lang)
                    }
                    else if (addedCoat) { headT = "{Yağmurluğunu} giy, şemsiyeni al."; head = t(headT, lang) }
                    else {
                        val umbT = "{Şemsiyeni} al; " + lcf(strip(headT), false)
                        head = if (en) "Take your {umbrella}; " + lcf(strip(head), true) else umbT
                        headT = umbT
                    }
                }
            }
        } else if (maybe) {
            pills.add(if (en) "Chance of rain $pMax%" else "Yağmur ihtimali %$pMax")
            if (!windy && !sport) addTake("semsiye", if (en) "Umbrella ($pMax%)" else "Şemsiye (%$pMax)")
        }
        if (snowy) {
            pills.add(0, t(if (snowNow) "Kar yağıyor" else "Kar", lang))
            if (!sport) swap(SHOES, "bot", t("Kaymaz bot", lang))
            addTake("eldiven")
        }
        if (icy) {
            pills.add(0, t("Buzlanma", lang))
            if (act == "city") swap(SHOES, "bot", t("Kaymaz bot", lang))
        }
        if (thunder) pills.add(0, t("Fırtına", lang))
        if (windy) {
            // "Poyraz 32 km/sa" / "NE wind 32 km/h"
            pills.add(
                if (en) (if (wi >= 0) WIND_NAMES_EN[wi] + " wind" else "Wind") + (if (windMax >= 28) " $windMax km/h" else ", gusts $gust km/h")
                else (if (wi >= 0) WIND_NAMES[wi] + " " else "Rüzgar ") + (if (windMax >= 28) "$windMax km/sa" else "hamlede $gust km/sa")
            )
            if (!hasOuter && level in 4..5 && !sport && outerNow() == null && !takesOuter()) addTake("ruzgarlik")
        }
        val rainAllDay = wet && w.isNotEmpty() && w.all { isRain(it.code) }
        val uv = inp.uvMax
        if (inp.uvDay && uv != null && !rainAllDay) {
            if (uv >= 6) { addTake("gozluk"); addTake("krem"); addTake("sapka"); pills.add(t("UV yüksek", lang)) }
            else if (uv >= 3 && rawNow >= 15) addTake("gozluk")
        }
        if (codes.any { it == 45 || it == 48 }) pills.add(t("Sis", lang))
        if (act == "field" && wet) addTake("corap")

        // Wardrobe: a missing piece becomes the closest one the person has; clothes with no stand-in stay (marked), accessories go.
        val lost = ArrayList<String>()
        if (missing.isNotEmpty()) for (li in 0..1) {
            val list = if (li == 0) wear else take
            var i = list.size - 1
            while (i >= 0) {
                val g = list[i].g
                if (!owned(g)) {
                    val alt = SUBS[g].orEmpty().firstOrNull { x -> owned(x) && !has(x) && take.none { it.g == x } }
                    lost.add(g)
                    when {
                        alt != null -> list[i] = Item(alt, lab(alt))
                        li == 0 && g in MUST -> list[i] = list[i].copy(need = true)
                        else -> list.removeAt(i)
                    }
                }
                i--
            }
        }
        // A headline that names a piece the person doesn't have is rewritten from what they will actually wear.
        // (Decided on the Turkish verdict, so both languages rewrite the same verdicts.)
        val hl = headT.lowercase(TR)
        if (wear.isNotEmpty() && lost.any { g -> val st = STEMS[g]; st != null && hl.contains(st) && wear.none { it.g == g } }) {
            val outerIt = wear.firstOrNull { it.g in OUTER }
            val midIt = wear.firstOrNull { it.g in MID }
            val firstIt = outerIt ?: midIt ?: wear[0]
            val carryIt = take.firstOrNull { it.g != "semsiye" }
            val gh = if (en) "Wear the {" + low(firstIt.label, true) + "}" + (if (outerIt != null && midIt != null) " and " + low(midIt.label, true) else "") +
                    (if (carryIt != null) ", bring the " + low(carryIt.label, true) else "") + "."
                else "{" + firstIt.label + "}" + (if (outerIt != null && midIt != null) " ve " + midIt.label.lowercase(TR) else "") + " giy" +
                    (if (carryIt != null) ", yanına " + carryIt.label.lowercase(TR) + " al" else "") + "."
            head = if (headT.startsWith("{Şemsiyeni} al; ") && take.any { it.g == "semsiye" })
                (if (en) "Take your {umbrella}; " else "{Şemsiyeni} al; ") + lcf(strip(gh), en) else gh
        }

        return Plan(level, head, wear.take(6), take.take(5), pills.take(3), e)
    }

    /** The wind's name for a direction: "Poyraz" / "NE wind". */
    fun windName(dir: Double?, lang: String = "tr"): String? {
        val i = windIdx(dir)
        return if (i < 0) null else if (lang == "en") WIND_NAMES_EN[i] + " wind" else WIND_NAMES[i]
    }
}
