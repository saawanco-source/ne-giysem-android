package com.negiysem.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.RenderProcessGoneDetail
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.core.content.FileProvider
import androidx.webkit.WebViewAssetLoader
import com.negiysem.app.data.Store
import com.negiysem.app.widget.NeGiysemWidget
import com.negiysem.app.work.Scheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File

/**
 * The app screen: the same Ne Giysem? web app, bundled inside the APK and shown full screen.
 * It shares the chosen place and preferences with the home-screen widget.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null
    private var webGone = false
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private val home = "https://appassets.androidplatform.net/assets/www/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        root = FrameLayout(this)
        web = WebView(this)
        val nightUi = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val startBg = Color.parseColor(if (nightUi) "#15171F" else "#FFD65E") // no yellow flash in dark mode
        web.setBackgroundColor(startBg)
        root.setBackgroundColor(startBg)
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Android 15 draws apps edge to edge: keep the page clear of the status and navigation bars,
        // and of the keyboard (the window is no longer resized for it), so text fields stay visible while typing.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            root.setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val ime = insets.getInsets(WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
                insets
            }
        }

        web.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            setGeolocationEnabled(true)
            allowFileAccess = false
            allowContentAccess = false
        }
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }

            // The system stopped the page's renderer (low memory): start the screen again instead of closing the app.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                webGone = true
                root.removeView(view)
                view.destroy()
                recreate()
                return true
            }
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
                // Answered fresh every time (retain = false), so a permission taken back in Android settings is asked again.
                // With the permission in place this shows nothing to the person.
                if (hasLocation()) {
                    callback.invoke(origin, true, false)
                } else {
                    pendingGeo = origin to callback
                    requestPermissions(
                        arrayOf(Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION),
                        REQ_LOCATION
                    )
                }
            }
        }
        web.addJavascriptInterface(Bridge(), "NeGiysemAndroid")

        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(home)

        // The 30-minute background refresh is only for the home-screen widget.
        scope.launch { if (Scheduler.hasWidgets(applicationContext)) Scheduler.schedule(applicationContext) }
    }

    private fun hasLocation(): Boolean =
        checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
            checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == REQ_LOCATION) {
            val granted = grantResults.any { it == PackageManager.PERMISSION_GRANTED }
            pendingGeo?.let { (origin, cb) -> cb.invoke(origin, granted, false) }
            pendingGeo = null
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (!webGone) web.saveState(outState)
    }

    @Deprecated("Kept for older Android versions")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        scope.cancel()
        if (!webGone) web.destroy()
        super.onDestroy()
    }

    /** Called from the page's script. */
    private inner class Bridge {
        @JavascriptInterface
        fun saveState(json: String) {
            val ctx = applicationContext
            val changed = Store(ctx).saveFromApp(json)
            // A few seconds' wait lets a burst of edits in Rutinim become one refresh.
            if (changed) scope.launch { if (Scheduler.hasWidgets(ctx)) Scheduler.now(ctx, replace = true, delaySeconds = 4) }
        }

        /** "Tüm verilerimi sil": wipe the app's own store and show the empty widget until a new place is chosen. */
        @JavascriptInterface
        fun reset() {
            val ctx = applicationContext
            Store(ctx).clear()
            Scheduler.cancel(ctx)
            CoroutineScope(Dispatchers.IO).launch {
                runCatching { NeGiysemWidget.pushAll(ctx, "") }
                if (Scheduler.hasWidgets(ctx)) Scheduler.schedule(ctx) // stays empty: the refresh skips a wiped store
            }
        }

        /** "Paylaş": the picture the page drew (PNG as base64) goes to the phone's share sheet (Instagram, WhatsApp, Galeri…). */
        @JavascriptInterface
        fun shareImage(base64: String, fileName: String, caption: String) {
            if (base64.length > 20_000_000) return
            val bytes = runCatching { Base64.decode(base64, Base64.DEFAULT) }.getOrNull() ?: return
            val dir = File(cacheDir, "shared").apply { mkdirs() }
            dir.listFiles()?.forEach { it.delete() } // only the latest picture is kept
            val safe = fileName.replace(Regex("[^A-Za-z0-9._-]"), "_").let { if (it.endsWith(".png")) it else "ne-giysem.png" }
            val file = File(dir, safe).apply { writeBytes(bytes) }
            val uri = FileProvider.getUriForFile(this@MainActivity, "$packageName.files", file)
            val send = Intent(Intent.ACTION_SEND)
                .setType("image/png")
                .putExtra(Intent.EXTRA_STREAM, uri)
                .putExtra(Intent.EXTRA_TEXT, caption)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            send.clipData = ClipData.newRawUri(safe, uri)
            runOnUiThread { runCatching { startActivity(Intent.createChooser(send, "Paylaş")) } }
        }

        /** Text to share (e.g. the packing list) through the phone's share sheet. */
        @JavascriptInterface
        fun shareText(text: String, title: String) {
            val send = Intent(Intent.ACTION_SEND).setType("text/plain").putExtra(Intent.EXTRA_TEXT, text).putExtra(Intent.EXTRA_SUBJECT, title)
            runOnUiThread { runCatching { startActivity(Intent.createChooser(send, title)) } }
        }

        /** Lets the page tell whether asking for the position would show Android's permission dialog. */
        @JavascriptInterface
        fun hasLocation(): Boolean = this@MainActivity.hasLocation()

        @JavascriptInterface
        fun setTheme(color: String, dark: Boolean) {
            runOnUiThread {
                val c = runCatching { Color.parseColor(color) }.getOrDefault(Color.parseColor("#FFD65E"))
                web.setBackgroundColor(c)
                root.setBackgroundColor(c)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                    val flags = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS or WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS
                    window.insetsController?.setSystemBarsAppearance(if (dark) 0 else flags, flags)
                }
                else lightBarsLegacy(!dark)
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) paintBars(c)
            }
        }
    }

    /** Android 8–10: dark status and navigation bar icons on a light bar, light icons on the night colour. */
    @Suppress("DEPRECATION")
    private fun lightBarsLegacy(light: Boolean) {
        val flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR or View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
        val v = window.decorView
        v.systemUiVisibility = if (light) v.systemUiVisibility or flags else v.systemUiVisibility and flags.inv()
    }

    /** Status and navigation bar colour on Android 14 and older (Android 15 draws the page behind them). */
    @Suppress("DEPRECATION")
    private fun paintBars(color: Int) {
        window.statusBarColor = color
        window.navigationBarColor = color
    }

    companion object {
        private const val REQ_LOCATION = 7
    }
}
