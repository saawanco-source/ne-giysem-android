package com.negiysem.app

/** Settings filled in when the app goes live. */
object Config {
    /**
     * The app's own server (Cloudflare Pages Functions in web/functions), e.g. "https://negiysem.com".
     * Empty: the widget calls the free, non-commercial services directly (development only).
     */
    // Set at build time (app/build.gradle.kts): the live site, or the "dev" branch's preview site for a test build.
    val API: String = BuildConfig.NG_API
}
