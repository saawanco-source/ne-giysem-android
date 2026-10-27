package com.negiysem.app.work

import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.WearableListenerService
import com.negiysem.app.data.WatchSync

/**
 * The watch app asks for the outfit (just installed, a complication just added, or what it has is old): the background
 * refresh is set up for it, and one runs at once (it sends the snapshot to the watch, WatchSync).
 */
class WatchRequestListener : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != WatchSync.REFRESH_PATH) return
        Scheduler.schedule(applicationContext)
        Scheduler.now(applicationContext)
    }
}
