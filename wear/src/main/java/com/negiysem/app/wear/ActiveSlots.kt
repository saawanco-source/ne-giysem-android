package com.negiysem.app.wear

import android.content.Context
import com.google.android.gms.wearable.Wearable

/**
 * While at least one Ne Giysem? complication is on a watch face, the watch advertises "negiysem_watch_active" in the
 * Data Layer; the phone keeps its background refresh going only then (app: Scheduler.hasWatch). An installed watch
 * app nobody looks at doesn't make the phone fetch every half hour.
 */
object ActiveSlots {
    private const val CAPABILITY = "negiysem_watch_active"

    fun on(context: Context, id: Int) {
        val store = PlanStore(context)
        store.activeSlots = store.activeSlots + id.toString()
        advertise(context, true)
    }

    fun off(context: Context, id: Int) {
        val store = PlanStore(context)
        store.activeSlots = store.activeSlots - id.toString()
        if (store.activeSlots.isEmpty()) advertise(context, false)
    }

    /** Again now and then (the Data Layer keeps it, but a reinstall or a reset of Play services may not). */
    fun refresh(context: Context) { if (PlanStore(context).activeSlots.isNotEmpty()) advertise(context, true) }

    private fun advertise(context: Context, active: Boolean) {
        runCatching {
            val client = Wearable.getCapabilityClient(context.applicationContext)
            if (active) client.addLocalCapability(CAPABILITY) else client.removeLocalCapability(CAPABILITY)
        }
    }
}
