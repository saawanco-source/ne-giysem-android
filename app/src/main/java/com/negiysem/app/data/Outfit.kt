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

/** Same outfit rules as the web app (index.html → plan()), ported for the home-screen widget. */
object Outfit {

    private val TR = Locale("tr", "TR")

    val LEVEL_NAMES = listOf("Dondurucu", "Çok soğuk", "Soğuk", "Soğukça", "Serin", "Ilık", "Sıcak", "Çok sıcak")
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
    private val ACC = mapOf(
        "hirka" to "Hırkanı", "ceket" to "İnce ceketini", "mont" to "Montunu", "kaban" to "Kabanını", "sisme" to "Şişme montunu",
        "parka" to "Parkanı", "kazak" to "Kazağını", "sweatshirt" to "Sweatshirtünü", "bere" to "Bereni", "atki" to "Atkını",
        "ruzgarlik" to "Rüzgarlığını", "yagmurluk" to "Yağmurluğunu", "eldiven" to "Eldivenlerini"
    )
    private val OUTER = setOf("ceket", "mont", "kaban", "sisme", "parka", "yagmurluk", "ruzgarlik")
    private val MID = setOf("hirka", "sweatshirt", "kazak")
    private val SHOES = setOf("sneaker", "spor", "bot", "yuruyus", "sandalet")
    private val BOTTOMS = setOf("jean", "pantolon", "sort", "tayt")
    val WIND_NAMES = listOf("Yıldız", "Poyraz", "Gündoğusu", "Keşişleme", "Kıble", "Lodos", "Günbatısı", "Karayel")

    private val COND = mapOf(
        0 to "Açık", 1 to "Çoğunlukla açık", 2 to "Parçalı bulutlu", 3 to "Kapalı", 45 to "Sisli", 48 to "Kırağılı sis",
        51 to "Hafif çisenti", 53 to "Çisenti", 55 to "Yoğun çisenti", 56 to "Donan çisenti", 57 to "Donan çisenti",
        61 to "Hafif yağmur", 63 to "Yağmurlu", 65 to "Kuvvetli yağmur", 66 to "Donan yağmur", 67 to "Donan yağmur",
        71 to "Hafif kar", 73 to "Karlı", 75 to "Yoğun kar", 77 to "Kar taneleri", 80 to "Hafif sağanak", 81 to "Sağanak",
        82 to "Şiddetli sağanak", 85 to "Kar sağanağı", 86 to "Yoğun kar sağanağı", 95 to "Gök gürültülü fırtına",
        96 to "Dolulu fırtına", 99 to "Şiddetli dolulu fırtına"
    )

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

    data class Item(val g: String, val label: String)
    data class Hour(val time: String, val app: Double, val p: Double, val code: Int, val wind: Double)
    data class Now(
        val t: Double, val app: Double, val code: Int, val isDay: Boolean,
        val wind: Double, val gust: Double, val dir: Double?, val rh: Double?, val precip: Double
    )
    data class Input(val now: Now, val window: List<Hour>, val uvMax: Double?, val uvDay: Boolean)
    data class Plan(
        val level: Int, val headline: String, val wear: List<Item>, val take: List<Item>,
        val pills: List<String>, val mine: Double
    )

    fun isRain(c: Int) = (c in 51..67) || (c in 80..82) || c >= 95
    fun isSnow(c: Int) = (c in 71..77) || c == 85 || c == 86
    fun condition(c: Int): String = COND[c] ?: ""
    private fun levelOf(e: Double): Int { var l = 0; for (i in LEVEL_MIN.indices) if (e >= LEVEL_MIN[i]) l = i; return l }
    private fun windIdx(d: Double?): Int = if (d == null || d.isNaN()) -1 else (((d % 360 + 360) % 360) / 45.0).roundToInt() % 8
    fun deg(v: Double): String { val r = v.roundToInt(); return (if (r < 0) "−${-r}" else "$r") + "°" }
    private fun cap(s: String) = if (s.isEmpty()) s else s.substring(0, 1).uppercase(TR) + s.substring(1)
    private fun lcf(s: String) = if (s.isEmpty()) s else s.substring(0, 1).lowercase(TR) + s.substring(1)
    private fun daypart(t: String): String {
        val h = t.substring(11, 13).toIntOrNull() ?: 18
        return when (h) { in 5..11 -> "sabah"; in 12..16 -> "öğleden sonra"; in 17..20 -> "akşam"; else -> "gece" }
    }

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
        val day: JSONArray? = hourly.optJSONArray("is_day")
        val fresh = System.currentTimeMillis() - fetchedAt < 45 * 60_000L && cur != null && !cur.d("temperature_2m").isNaN()
        val now = if (fresh && cur != null) Now(
            t = cur.d("temperature_2m"), app = cur.d("apparent_temperature"), code = cur.optInt("weather_code", 3),
            isDay = cur.optInt("is_day", 1) == 1, wind = cur.d("wind_speed_10m").let { if (it.isNaN()) 0.0 else it },
            gust = cur.d("wind_gusts_10m").let { if (it.isNaN()) 0.0 else it }, dir = cur.d("wind_direction_10m").takeIf { !it.isNaN() },
            rh = cur.d("relative_humidity_2m").takeIf { !it.isNaN() }, precip = cur.d("precipitation").let { if (it.isNaN()) 0.0 else it }
        ) else Now(
            t = temp.d(idx), app = app.d(idx), code = code?.optInt(idx, 3) ?: 3, isDay = (day?.optInt(idx, 1) ?: 1) == 1,
            wind = wind.d(idx).let { if (it.isNaN()) 0.0 else it }, gust = 0.0, dir = dir.d(idx).takeIf { !it.isNaN() },
            rh = null, precip = 0.0
        )
        if (now.app.isNaN() || now.t.isNaN()) return null

        val window = ArrayList<Hour>()
        var k = 0
        while (k <= hours && idx + k < times.length()) {
            val j = idx + k
            window.add(Hour(times.optString(j), app.d(j), prob.d(j).let { if (it.isNaN()) 0.0 else it }, code?.optInt(j, 3) ?: 3,
                wind.d(j).let { if (it.isNaN()) 0.0 else it }))
            k++
        }
        val dTimes: JSONArray? = daily?.optJSONArray("time")
        var di = -1
        if (dTimes != null) for (i in 0 until dTimes.length()) if (dTimes.optString(i) == nowKey.take(10)) { di = i; break }
        val uvArr: JSONArray? = daily?.optJSONArray("uv_index_max")
        val uv: Double? = if (di >= 0) uvArr.d(di).takeIf { !it.isNaN() } else null
        val uvDay = window.any { val hr = it.time.substring(11, 13).toIntOrNull() ?: 0; hr in 10..16 }
        return Input(now, window, uv, uvDay)
    }

    fun plan(inp: Input, feel: String, act: String): Plan {
        val off = (when (feel) { "cold" -> -3.0; "warm" -> 3.0; else -> 0.0 }) + (when (act) { "field" -> -1.0; "sport" -> 6.0; else -> 0.0 })
        val w = inp.window.filter { !it.app.isNaN() }
        val rawNow = inp.now.app
        var rawLow = rawNow; var rawHigh = rawNow; var lowAt: String? = null; var highAt: String? = null
        for (h in w) {
            if (h.app < rawLow) { rawLow = h.app; lowAt = h.time }
            if (h.app > rawHigh) { rawHigh = h.app; highAt = h.time }
        }
        val e = rawNow + off
        val level = levelOf(e)
        val lLow = min(level, levelOf(rawLow + off + 0.7))
        val lHigh = max(level, levelOf(rawHigh + off - 0.7))
        val base = if (act == "sport") sport(level) else OUT[level]
        val wear = base.wear.map { Item(it, LABELS.getValue(it)) }.toMutableList()
        var take = base.take.map { Item(it, LABELS.getValue(it)) }.toMutableList()
        var head = base.head
        val pills = ArrayList<String>()

        fun has(g: String) = wear.any { it.g == g }
        fun swap(group: Set<String>, g: String, label: String = LABELS.getValue(g)) {
            val i = wear.indexOfFirst { it.g in group }
            if (i >= 0) wear[i] = Item(g, label) else wear.add(Item(g, label))
        }
        fun addTake(g: String, label: String = LABELS.getValue(g), first: Boolean = false) {
            if (has(g) || take.any { it.g == g }) return
            if (first) take.add(0, Item(g, label)) else take.add(Item(g, label))
        }
        fun strip(s: String) = s.replace("{", "").replace("}", "")

        val codes = listOf(inp.now.code) + w.map { it.code }
        val pMax = (listOf(0.0) + w.map { it.p }).maxOrNull()!!.roundToInt()
        val windMax = (listOf(inp.now.wind) + w.map { it.wind }).maxOrNull()!!.roundToInt()
        val gust = inp.now.gust.roundToInt()
        val wi = windIdx(inp.now.dir)
        val rainNow = isRain(inp.now.code) || inp.now.precip >= 0.2
        val snowy = codes.any { isSnow(it) }
        val wet = rainNow || pMax >= 60 || (codes.any { isRain(it) } && pMax >= 40)
        val maybe = !wet && !snowy && pMax >= 30
        val windy = windMax >= 28 || gust >= 45
        val hasOuter = wear.any { it.g in OUTER }

        if (act == "field") {
            swap(BOTTOMS, "pantolon", "Uzun pantolon")
            swap(SHOES, "yuruyus")
            if (level >= 5 && !has("sapka")) wear.add(Item("sapka", LABELS.getValue("sapka")))
        }

        if (lLow < level) {
            val lo = if (act == "sport") sport(lLow) else OUT[lLow]
            val pool = (lo.wear + lo.take).filter { !has(it) }
            val cand = pool.firstOrNull { it in OUTER } ?: pool.firstOrNull { it in MID }
            val dp = lowAt?.let { daypart(it) } ?: "akşam"
            if (cand != null) {
                take = take.filter { it.g !in OUTER && it.g !in MID }.toMutableList()
                addTake(cand, first = true)
                val acc = ACC[cand]
                if (acc != null && act != "sport") head = "{$acc} yanına al, $dp serinliyor."
            }
            pills.add(cap(dp) + " " + deg(rawLow))
        } else if (lHigh > level && highAt != null) {
            pills.add(cap(daypart(highAt)) + " " + deg(rawHigh))
        }

        if (wet) {
            pills.add(0, if (rainNow) "Yağmur yağıyor" else "Yağmur %$pMax")
            var addedCoat = false
            val takeOuter = take.any { it.g in OUTER }
            if (!hasOuter && !takeOuter && act != "sport") {
                wear.add(Item("yagmurluk", LABELS.getValue("yagmurluk"))); addedCoat = true
                take = take.filter { it.g !in OUTER }.toMutableList()
            }
            if (act == "city" && wear.any { it.g == "sneaker" || it.g == "sandalet" }) swap(SHOES, "bot", "Su geçirmez ayakkabı")
            if (windy) head = "{Kapüşonlu} bir şey giy, rüzgarda şemsiye uçar."
            else {
                addTake("semsiye", first = true)
                head = if (addedCoat) "{Yağmurluğunu} giy, şemsiyeni al." else "{Şemsiyeni} al; " + lcf(strip(head))
            }
        } else if (maybe) {
            addTake("semsiye", "Şemsiye (%$pMax)")
            pills.add("Yağmur ihtimali %$pMax")
        }
        if (snowy) {
            pills.add(0, "Kar")
            if (act != "sport") swap(SHOES, "bot", "Kaymaz bot")
            addTake("eldiven")
        }
        if (windy) {
            pills.add((if (wi >= 0) WIND_NAMES[wi] + " " else "Rüzgar ") + "$windMax km/sa")
            if (!hasOuter && level >= 4 && act != "sport" && take.none { it.g in OUTER }) addTake("ruzgarlik")
        }
        val uv = inp.uvMax
        if (inp.uvDay && uv != null) {
            if (uv >= 6) { addTake("gozluk"); addTake("krem"); addTake("sapka"); pills.add("UV yüksek") }
            else if (uv >= 3 && rawNow >= 15) addTake("gozluk")
        }
        if (codes.any { it == 45 || it == 48 }) pills.add("Sis")
        if (act == "field" && wet) addTake("corap")

        return Plan(level, head, wear.take(6), take.take(5), pills.take(3), e)
    }

    fun windName(dir: Double?): String? { val i = windIdx(dir); return if (i >= 0) WIND_NAMES[i] else null }
}
