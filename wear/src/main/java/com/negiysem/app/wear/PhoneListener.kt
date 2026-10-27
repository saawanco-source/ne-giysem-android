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
        /** Asks the phone app for a fresh outfit (app: WatchRequestListener). */
        private const val REFRESH_PATH = "/negiysem/refresh"

        /**
         * Asks the phone for a fresh outfit when there is none yet or it is getting old (an hour), at most every
         * 20 minutes; the answer comes back as a new snapshot (onDataChanged).
         */
        fun ask(context: Context, force: Boolean = false) {
            val app = context.applicationContext
            val store = PlanStore(app)
            val now = System.currentTimeMillis()
            val plan = store.plan()
            if (store.wiped && !force) return
            if (!force && plan != null && now - plan.updated < 3_600_000L) return
            if (now - store.asked < 20 * 60_000L) return
            store.asked = now
            runCatching {
                Wearable.getNodeClient(app).connectedNodes.addOnSuccessListener { nodes ->
                    nodes.forEach { n -> runCatching { Wearable.getMessageClient(app).sendMessage(n.id, REFRESH_PATH, ByteArray(0)) } }
                }
            }
        }

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
