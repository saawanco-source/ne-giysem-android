import com.negiysem.app.data.Alerts
import com.negiysem.app.data.Day
import com.negiysem.app.data.Outfit
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

// Mirrors Updater.refresh(): live parse -> optional day plan -> Outfit.plan, for each case in cases.json.
fun main(args: Array<String>) {
    val cases = JSONArray(File(args[0]).readText())
    val out = StringBuilder("[")
    val now = System.currentTimeMillis()
    for (i in 0 until cases.length()) {
        val c = cases.optJSONObject(i)!!
        val r = JSONObject().put("id", c.optString("id"))
        try {
            val wx = c.optJSONObject("wx")!!
            val lang = c.optString("lang", "tr")
            val fetchedAt = now - c.optLong("agoMin", 0L) * 60_000L
            val hours = c.optInt("hours", 6)
            val input = Outfit.parse(wx, hours, fetchedAt)
            if (input == null) { r.put("err", "noinput") } else {
                // The route picked on the app screen travels inside the routine, as the app sends it.
                val rj = c.optJSONObject("routine")
                c.optJSONObject("choice")?.let { ch -> rj?.put("choice", ch) }
                val routineJson = rj?.toString()
                val routine = Day.parse(routineJson)?.takeIf { it.dayMode && it.trips.isNotEmpty() }
                val bp = c.optJSONObject("byPlace")
                val byPlace = HashMap<String, JSONObject>()
                if (routine != null && bp != null) {
                    Day.tripPlaces(routine).forEach { p -> bp.optJSONObject(p.id)?.let { byPlace[p.id] = it } }
                }
                val day = routine?.let { Day.compute(it, byPlace, lang = lang) }
                val miss = c.optJSONArray("missing")?.let { a -> (0 until a.length()).map { a.optString(it) }.toSet() } ?: emptySet()
                val plan = Outfit.plan(day?.input ?: input, c.optString("feel", "normal"), c.optString("act", "city"), c.optString("who", "me"), miss, lang)
                r.put("useDay", day?.input != null)
                r.put("level", plan.level)
                r.put("head", plan.headline)
                r.put("wear", JSONArray().apply { plan.wear.forEach { put(it.g + ":" + it.label) } })
                r.put("take", JSONArray().apply { plan.take.forEach { put(it.g + ":" + it.label) } })
                r.put("pills", JSONArray().apply { plan.pills.forEach { put(it) } })
                r.put("E", Math.round(plan.mine * 1000) / 1000.0)
                if (day?.next != null) r.put("next", day.next)
            }
        } catch (e: Throwable) {
            r.put("err", "EXC " + e.javaClass.simpleName + ": " + e.message + " @ " + e.stackTrace.take(3).joinToString(" < "))
        }
        try {
            val wx = c.optJSONObject("wx")!!
            val at = c.optLong("at")
            val lang = c.optString("lang", "tr")
            r.put("alerts", JSONArray().apply {
                Alerts.find(wx, at).forEach { a -> val f = Alerts.info(wx, a, at, lang)
                    put(listOf(a.k, a.lv, a.from, a.to, a.peak ?: "", f.title, f.level, f.whenText, f.tips.joinToString(" | ")).joinToString(" ~ ")) }
            })
        } catch (e: Throwable) {
            r.put("alerts", "EXC " + e.javaClass.simpleName + ": " + e.message)
        }
        if (i > 0) out.append(",\n")
        out.append(r.toString())
    }
    out.append("]")
    File(args[1]).writeText(out.toString())
}
