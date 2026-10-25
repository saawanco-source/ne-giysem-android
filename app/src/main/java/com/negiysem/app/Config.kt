package com.negiysem.app

/** Settings filled in when the app goes live. */
object Config {
    /**
     * The app's own server (Cloudflare Pages Functions in web/functions), e.g. "https://negiysem.com".
     * Empty: the widget calls the free, non-commercial services directly (development only).
     */
    const val API = "https://ne-giysem.pages.dev"
}
