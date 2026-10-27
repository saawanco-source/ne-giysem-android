package com.negiysem.app.data

import android.content.Context
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable

/**
 * Hands the widget's snapshot to the watch (the Ne Giysem? watch app, same package and signing key) through Google Play
 * services' Data Layer, so the watch complication shows exactly what the phone shows. Without a paired watch the call
 * fails quietly; nothing waits for it.
 */
object WatchSync {
    const val PATH = "/negiysem/plan"
    /** The watch app declares this (wear/src/main/res/values/wear.xml): the phone keeps refreshing for it. */
    const val CAPABILITY = "negiysem_watch"
    /** The watch asks for a refresh (just installed, or its outfit is old): the phone fetches and sends at once. */
    const val REFRESH_PATH = "/negiysem/refresh"

    fun send(context: Context, snapshot: String) {
        runCatching {
            val req = PutDataMapRequest.create(PATH).apply {
                dataMap.putString("plan", snapshot)
                // A new time each refresh: the watch hears about it even when the outfit didn't change ("yarın" moves on).
                dataMap.putLong("sent", System.currentTimeMillis())
            }.asPutDataRequest().setUrgent()
            Wearable.getDataClient(context.applicationContext).putDataItem(req)
        }
    }

    /** "Tüm verilerimi sil": the watch forgets the snapshot too. */
    fun clear(context: Context) {
        runCatching {
            val uri = android.net.Uri.Builder().scheme("wear").path(PATH).build()
            Wearable.getDataClient(context.applicationContext).deleteDataItems(uri)
        }
    }
}
