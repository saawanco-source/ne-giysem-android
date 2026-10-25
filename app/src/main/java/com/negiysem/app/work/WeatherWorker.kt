package com.negiysem.app.work

import android.content.Context
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.negiysem.app.data.Updater
import com.negiysem.app.widget.NeGiysemWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import java.util.concurrent.TimeUnit

class WeatherWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        // Redraws from the kept forecast even when the fetch fails; then fetches again as soon as there's a connection.
        val fetched = runCatching { Updater.refresh(applicationContext) }.getOrDefault(false)
        if (!fetched) Scheduler.whenOnline(applicationContext)
        return Result.success()
    }
}

object Scheduler {
    private const val PERIODIC = "negiysem-periodic"
    private const val NOW = "negiysem-now"
    private const val ONLINE = "negiysem-online"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Background refresh only makes sense while a widget is on the home screen. */
    suspend fun hasWidgets(context: Context): Boolean =
        runCatching { GlanceAppWidgetManager(context).getGlanceIds(NeGiysemWidget::class.java).isNotEmpty() }.getOrDefault(false)

    /**
     * Keeps the widget fresh: every 30 minutes, with or without a connection (without one it moves on to the current
     * hour of the forecast kept, and fetches once the connection is back). UPDATE lets a new app version change it.
     */
    fun schedule(context: Context) {
        val req = PeriodicWorkRequestBuilder<WeatherWorker>(30, TimeUnit.MINUTES).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    /**
     * One refresh as soon as possible. [replace] restarts a refresh that is already queued;
     * [delaySeconds] lets quick successive edits in the app collapse into one request.
     */
    fun now(context: Context, replace: Boolean = false, delaySeconds: Long = 0) {
        val req = OneTimeWorkRequestBuilder<WeatherWorker>().setInitialDelay(delaySeconds, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            NOW, if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP, req
        )
    }

    /** A refresh that waits for a connection (after one that couldn't fetch). KEEP: one waiting at a time. */
    fun whenOnline(context: Context) {
        val req = OneTimeWorkRequestBuilder<WeatherWorker>().setConstraints(online).build()
        WorkManager.getInstance(context).enqueueUniqueWork(ONLINE, ExistingWorkPolicy.KEEP, req)
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(NOW)
        WorkManager.getInstance(context).cancelUniqueWork(ONLINE)
    }
}
