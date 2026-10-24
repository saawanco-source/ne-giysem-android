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
import android.widget.LinearLayout
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import androidx.annotation.RequiresApi
import com.google.android.gms.ads.AdRequest
import com.google.android.gms.ads.AdSize
import com.google.android.gms.ads.AdView
import com.google.android.gms.ads.MobileAds
import com.google.android.ump.ConsentInformation
import com.google.android.ump.ConsentRequestParameters
import com.google.android.ump.UserMessagingPlatform
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

    private lateinit var root: LinearLayout
    private lateinit var webBox: FrameLayout
    /** Bottom banner (AdMob); only when the app's own server and a real ad unit are set. */
    private lateinit var adBox: FrameLayout
    private var adView: AdView? = null
    private var adsStarted = false
    private var adsInitialized = false
    /** Width (dp) the current banner was made for; a resized window (rotation, split screen, foldable) gets a new one. */
    private var bannerWidthDp = 0
    /** Android 13+: Back goes through the system's back dispatcher (onBackPressed is never called when targeting Android 16). */
    private var back: WebBack? = null
    private var keyboardUp = false
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

        root = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        webBox = FrameLayout(this)
        adBox = FrameLayout(this).apply { visibility = View.GONE }
        web = WebView(this)
        val nightUi = (resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
        val startBg = Color.parseColor(if (nightUi) "#15171F" else "#FFD65E") // no yellow flash in dark mode
        web.setBackgroundColor(startBg)
        root.setBackgroundColor(startBg)
        webBox.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        root.addView(webBox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f))
        root.addView(adBox, LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT))
        setContentView(root)
        // The adaptive banner is made for one width: make it again when the window gets narrower or wider.
        webBox.addOnLayoutChangeListener { _, l, _, r, _, oldL, _, oldR, _ -> if (r - l != oldR - oldL) webBox.post { resizeBanner() } }

        // Android 15 draws apps edge to edge: keep the page clear of the status and navigation bars,
        // and of the keyboard (the window is no longer resized for it), so text fields stay visible while typing.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            root.setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                val ime = insets.getInsets(WindowInsets.Type.ime())
                v.setPadding(bars.left, bars.top, bars.right, maxOf(bars.bottom, ime.bottom))
                // The banner steps aside while typing.
                keyboardUp = ime.bottom > 0
                adBox.visibility = if (adView != null && !keyboardUp) View.VISIBLE else View.GONE
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

            // Back first steps back through the page's history; with no history left the system closes the app.
            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) = updateBack()

            override fun onPageFinished(view: WebView, url: String?) = updateBack()

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                if (url.host == "appassets.androidplatform.net") return false
                runCatching { startActivity(Intent(Intent.ACTION_VIEW, url)) }
                return true
            }

            // The system stopped the page's renderer (low memory): start the screen again instead of closing the app.
            override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                webGone = true
                webBox.removeView(view)
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

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            back = WebBack(this) { if (!webGone && web.canGoBack()) web.goBack() }
        }
        if (savedInstanceState == null || web.restoreState(savedInstanceState) == null) web.loadUrl(home)
        updateBack()

        startAds()

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

    /** Android 13+: Back is handled by [WebBack] only while the page has somewhere to go back to. */
    private fun updateBack() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) back?.enable(!webGone && web.canGoBack())
    }

    /** Android 8–12 only: with android:enableOnBackInvokedCallback="true", Android 13+ never calls this. */
    @Deprecated("Android 12 and older; Android 13+ uses WebBack")
    override fun onBackPressed() {
        if (!webGone && web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onPause() {
        adView?.pause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        adView?.resume()
    }

    /**
     * Ads: Google's consent form first where the law asks for one (UMP decides, e.g. in the EU),
     * then one adaptive banner under the page. Nothing happens until the server and an ad unit are configured.
     */
    private fun startAds() {
        val unit = getString(R.string.admob_banner_id)
        if (Config.API.isEmpty() || unit.isBlank()) return
        val consent = UserMessagingPlatform.getConsentInformation(this)
        consent.requestConsentInfoUpdate(
            this, ConsentRequestParameters.Builder().build(),
            { UserMessagingPlatform.loadAndShowConsentFormIfRequired(this) { _ -> if (consent.canRequestAds()) loadBanner(unit) } },
            { _ -> if (consent.canRequestAds()) loadBanner(unit) }
        )
        if (consent.canRequestAds()) loadBanner(unit)
    }

    private fun loadBanner(unit: String) {
        if (adsStarted || isFinishing || isDestroyed) return
        adsStarted = true
        if (!adsInitialized) { adsInitialized = true; MobileAds.initialize(this) {} }
        val widthDp = availableWidthDp()
        bannerWidthDp = widthDp
        val view = AdView(this)
        view.adUnitId = unit
        view.setAdSize(AdSize.getCurrentOrientationAnchoredAdaptiveBannerAdSize(this, widthDp))
        adBox.addView(view, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT))
        adView = view
        adBox.visibility = if (keyboardUp) View.GONE else View.VISIBLE
        view.loadAd(AdRequest.Builder().build())
    }

    /** The width the page gets (inside the system bar padding); before the first layout, the window width. */
    private fun availableWidthDp(): Int {
        val px = webBox.width.takeIf { it > 0 } ?: resources.displayMetrics.widthPixels
        return (px / resources.displayMetrics.density).toInt()
    }

    /** A banner wider than the window would be cut off (not allowed by AdMob), a narrower one looks lost: make a new one. */
    private fun resizeBanner() {
        val view = adView ?: return
        if (isFinishing || isDestroyed || availableWidthDp() == bannerWidthDp) return
        val unit = view.adUnitId
        adBox.removeView(view)
        view.destroy()
        adView = null
        adsStarted = false
        loadBanner(unit)
    }

    override fun onDestroy() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) back?.enable(false)
        adView?.destroy()
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

        /** Whether the page should offer "Reklam tercihleri" (required where the consent form applies). */
        @JavascriptInterface
        fun adPrivacyRequired(): Boolean = runCatching {
            UserMessagingPlatform.getConsentInformation(this@MainActivity).privacyOptionsRequirementStatus ==
                ConsentInformation.PrivacyOptionsRequirementStatus.REQUIRED
        }.getOrDefault(false)

        @JavascriptInterface
        fun openAdPrivacy() {
            runOnUiThread { UserMessagingPlatform.showPrivacyOptionsForm(this@MainActivity) { _ -> } }
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

/**
 * Back on Android 13 and newer. The callback is registered only while [goBack] has somewhere to go,
 * so on the first page the system's own Back closes the app, with Android's back-to-home animation.
 */
@RequiresApi(Build.VERSION_CODES.TIRAMISU)
private class WebBack(private val activity: Activity, private val goBack: () -> Unit) {
    private val callback = OnBackInvokedCallback { goBack() }
    private var registered = false

    fun enable(on: Boolean) {
        if (on == registered) return
        val dispatcher = activity.onBackInvokedDispatcher
        if (on) dispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, callback)
        else dispatcher.unregisterOnBackInvokedCallback(callback)
        registered = on
    }
}
