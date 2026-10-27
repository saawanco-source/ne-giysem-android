package com.negiysem.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.negiysem.app.data.Store
import com.negiysem.app.work.Scheduler
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class NeGiysemReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = NeGiysemWidget()

    override fun onEnabled(context: Context) {
        super.onEnabled(context)
        Scheduler.schedule(context)
        Scheduler.now(context)
    }

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        super.onUpdate(context, appWidgetManager, appWidgetIds)
        Scheduler.schedule(context)
        if (Store(context).isStale()) Scheduler.now(context)
    }

    override fun onDisabled(context: Context) {
        super.onDisabled(context)
        // The last widget is gone: the background refresh stays only for weather warnings or the watch.
        val ctx = context.applicationContext
        if (!Store(ctx).alertsOn) CoroutineScope(Dispatchers.IO).launch { if (!Scheduler.needed(ctx)) Scheduler.cancel(ctx) }
    }
}
