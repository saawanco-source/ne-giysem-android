package com.negiysem.app

import android.app.Application
import android.content.Context
import java.io.File

/** The app's process: keeps a short record of crashes for "Sorun bildir" (CrashLog). */
class NeGiysemApp : Application() {
    override fun onCreate() {
        super.onCreate()
        CrashLog.install(this)
    }
}

/**
 * The last five crashes on this phone (time, what went wrong, where in the app's own code), kept in the app's private
 * files and only sent if the person sends a "Sorun bildir" e-mail. Addresses, query strings and numbers with a decimal
 * part (coordinates) are cut out.
 */
object CrashLog {
    private const val FILE = "crashes.txt"

    fun install(context: Context) {
        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { t, e ->
            runCatching { write(app, e) }
            previous?.uncaughtException(t, e)
        }
    }

    private fun write(context: Context, e: Throwable) {
        // The real cause: a crash while starting a screen arrives wrapped ("Unable to start activity …: …").
        var root = e
        while (root.cause != null && root.cause !== root) root = root.cause!!
        val frames = root.stackTrace.filter { it.className.startsWith("com.negiysem") }.ifEmpty { e.stackTrace.filter { it.className.startsWith("com.negiysem") } }
        val where = frames.take(4).joinToString(" < ") { it.className.substringAfterLast('.') + "." + it.methodName + ":" + it.lineNumber }
        val what = scrub(root.javaClass.simpleName + ": " + (root.message ?: "")).take(160)
        val f = File(context.filesDir, FILE)
        val old = if (f.exists()) f.readLines() else emptyList()
        f.writeText((old + (System.currentTimeMillis().toString() + "\t" + what + "\t" + where)).takeLast(5).joinToString("\n"))
    }

    /** As the page's scrub(): web addresses shrink to their host; query strings and numbers with a decimal part go. */
    fun scrub(t: String): String = t
        .replace(Regex("https?://[^\\s)\"']+")) { m -> runCatching { java.net.URI(m.value).host }.getOrNull() ?: "url" }
        .replace(Regex("\\?[^\\s)\"']*"), "?…")
        .replace(Regex("\\b([A-Za-z_]+)=[^\\s&)\"']*"), "$1=…")
        .replace(Regex("\\d+[.,]\\d+"), "…")
        .replace(Regex("\\s+"), " ")

    /** "2026-10-30 14:05 IllegalStateException: … @ Updater.fetch:120 < …", oldest first. */
    fun read(context: Context): List<String> = runCatching {
        val f = File(context.filesDir, FILE)
        if (!f.exists()) return@runCatching emptyList()
        val fmt = java.text.SimpleDateFormat("yyyy-MM-dd HH:mm", java.util.Locale.ROOT)
        f.readLines().mapNotNull { line ->
            val p = line.split('\t')
            val at = p.getOrNull(0)?.toLongOrNull() ?: return@mapNotNull null
            fmt.format(java.util.Date(at)) + " " + p.getOrElse(1) { "" } + (p.getOrNull(2)?.takeIf { it.isNotBlank() }?.let { " @ $it" } ?: "")
        }
    }.getOrDefault(emptyList())

    fun clear(context: Context) { runCatching { File(context.filesDir, FILE).delete() } }
}
