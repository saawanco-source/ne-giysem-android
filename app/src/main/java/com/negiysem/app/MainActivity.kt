package com.negiysem.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.GeolocationPermissions
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import androidx.webkit.WebViewAssetLoader
import com.negiysem.app.data.Store
import com.negiysem.app.work.Scheduler

/**
 * The app screen: the same Ne Giysem? web app, bundled inside the APK and shown full screen.
 * It shares the chosen place and preferences with the home-screen widget.
 */
class MainActivity : Activity() {

    private lateinit var root: FrameLayout
    private lateinit var web: WebView
    private var pendingGeo: Pair<String, GeolocationPermissions.Callback>? = null

    private val home = "https://appassets.androidplatform.net/assets/www/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        root = FrameLayout(this)
        web = WebView(this)
        web.setBackgroundColor(Color.parseColor("#FFD65E"))
        root.setBackgroundColor(Color.parseColor("#FFD65E"))
        root.addView(web, FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT))
        setContentView(root)

        // Android 15 draws apps edge to edge: keep the page clear of the status and navigation bars.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.VANILLA_ICE_CREAM) {
            root.setOnApplyWindowInsetsListener { v, insets ->
                val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
                v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
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
        }
        web.webChromeClient = object : WebChromeClient() {
            override fun onGeolocationPermissionsShowPrompt(origin: String, callback: GeolocationPermissions.Callback) {
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

        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(home)

        Scheduler.schedule(this)
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
        web.saveState(outState)
    }

    @Deprecated("Kept for older Android versions")
    override fun onBackPressed() {
        if (web.canGoBack()) web.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    /** Called from the page's script. */
    private inner class Bridge {
        @JavascriptInterface
        fun saveState(json: String) {
            val changed = Store(this@MainActivity).saveFromApp(json)
            if (changed) Scheduler.now(this@MainActivity, replace = true)
        }

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
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.VANILLA_ICE_CREAM) paintBars(c)
            }
        }
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
