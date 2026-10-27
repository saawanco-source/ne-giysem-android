package com.negiysem.app.widget

import android.appwidget.AppWidgetManager
import android.content.Context
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import com.negiysem.app.data.Store
import com.negiysem.app.work.Scheduler

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
        // (The watch check takes a moment: a small job decides, not this receiver.)
        if (!Store(context).alertsOn) Scheduler.checkNeeded(context.applicationContext)
    }
}
