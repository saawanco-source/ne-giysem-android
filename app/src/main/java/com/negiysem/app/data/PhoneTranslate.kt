package com.negiysem.app.data

import android.content.Context
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.common.model.DownloadConditions
import com.google.mlkit.nl.translate.TranslateLanguage
import com.google.mlkit.nl.translate.Translation
import com.google.mlkit.nl.translate.Translator
import com.google.mlkit.nl.translate.TranslatorOptions
import java.util.concurrent.TimeUnit

/**
 * The app in the phone's language when it is neither Turkish nor English: the English text is translated on the phone
 * (Google ML Kit's on-device model, downloaded once per language, about 30 MB). The text itself never leaves the phone.
 */
object PhoneTranslate {
    private var client: Translator? = null
    private var clientLang = ""

    /** ML Kit's code for a phone language ("de", "pt"), or null when it can't translate into it. */
    fun code(lang: String): String? = lang.lowercase().takeIf { it != "en" && it != "tr" }?.let { TranslateLanguage.fromLanguageTag(it) }

    fun supported(lang: String) = code(lang) != null

    @Synchronized
    private fun translator(lang: String): Translator? {
        val c = code(lang) ?: return null
        if (client == null || clientLang != c) {
            client?.close()
            client = Translation.getClient(TranslatorOptions.Builder().setSourceLanguage(TranslateLanguage.ENGLISH).setTargetLanguage(c).build())
            clientLang = c
        }
        return client
    }

    private fun prefs(context: Context) = context.applicationContext.getSharedPreferences("negiysem", Context.MODE_PRIVATE)

    /** The model for [lang] was downloaded (kept by the app after a successful download). */
    fun ready(context: Context, lang: String): Boolean = code(lang)?.let { prefs(context).getBoolean("xlReady:$it", false) } ?: false

    /** Downloads the model (once); [done] runs with true when it is on the phone. */
    fun prepare(context: Context, lang: String, done: (Boolean) -> Unit) {
        val t = translator(lang) ?: return done(false)
        val c = code(lang) ?: return done(false)
        t.downloadModelIfNeeded(DownloadConditions.Builder().build())
            .addOnSuccessListener { prefs(context).edit().putBoolean("xlReady:$c", true).apply(); done(true) }
            .addOnFailureListener { done(false) }
    }

    /** Translates [texts] in order; a text that couldn't be translated comes back null. */
    fun translate(lang: String, texts: List<String>, done: (List<String?>) -> Unit) {
        val t = translator(lang) ?: return done(texts.map { null })
        val tasks = texts.map { t.translate(it) }
        Tasks.whenAllComplete(tasks).addOnCompleteListener {
            done(tasks.map { k -> if (k.isSuccessful) k.result else null })
        }
    }

    /** For the background (widget, evening note): blocking, only when the model is already on the phone. */
    fun translateNow(context: Context, lang: String, texts: List<String>): List<String>? {
        if (!ready(context, lang)) return null
        val t = translator(lang) ?: return null
        return runCatching { texts.map { s -> if (s.isBlank()) s else Tasks.await(t.translate(s), 10, TimeUnit.SECONDS) } }.getOrNull()
    }

    /** Forgets the downloaded models' record (all data deleted). */
    fun clear(context: Context) {
        val p = prefs(context)
        p.edit().apply { p.all.keys.filter { it.startsWith("xlReady:") }.forEach { remove(it) } }.apply()
    }
}
