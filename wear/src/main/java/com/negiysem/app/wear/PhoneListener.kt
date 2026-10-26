package com.negiysem.app.wear

import android.content.Context
import android.net.Uri
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService

/** Receives the phone app's snapshot (app: data/WatchSync.kt) and refreshes the complications showing it. */
class PhoneListener : WearableListenerService() {
    override fun onDataChanged(events: DataEventBuffer) {
        var changed = false
        for (e in events) {
            if (e.dataItem.uri.path != PATH) continue
            if (e.type == DataEvent.TYPE_DELETED) PlanStore(this).clear()
            else DataMapItem.fromDataItem(e.dataItem).dataMap.getString("plan")?.let { PlanStore(this).save(it) }
            changed = true
        }
        if (changed) OutfitComplicationService.refreshAll(this)
    }

    companion object {
        const val PATH = "/negiysem/plan"

        /** Reads the phone's current snapshot (in case a change was missed while the watch was away). */
        fun pull(context: Context, done: () -> Unit) {
            val uri = Uri.Builder().scheme("wear").path(PATH).build()
            runCatching {
                Wearable.getDataClient(context).getDataItems(uri).addOnCompleteListener { t ->
                    val items = if (t.isSuccessful) t.result else null
                    if (items != null) {
                        try {
                            items.maxByOrNull { DataMapItem.fromDataItem(it).dataMap.getLong("sent") }?.let { item ->
                                DataMapItem.fromDataItem(item).dataMap.getString("plan")?.let { json ->
                                    if (json != PlanStore(context).json) {
                                        PlanStore(context).save(json)
                                        OutfitComplicationService.refreshAll(context)
                                    }
                                }
                            }
                        } finally {
                            items.release()
                        }
                    }
                    done()
                }
            }.onFailure { done() }
        }
    }
}
