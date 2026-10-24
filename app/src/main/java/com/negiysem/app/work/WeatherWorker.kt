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
    override suspend fun doWork(): Result = try {
        Updater.refresh(applicationContext)
        Result.success()
    } catch (e: Exception) {
        if (runAttemptCount < 3) Result.retry() else Result.failure()
    }
}

object Scheduler {
    private const val PERIODIC = "negiysem-periodic"
    private const val NOW = "negiysem-now"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** Background refresh only makes sense while a widget is on the home screen. */
    suspend fun hasWidgets(context: Context): Boolean =
        runCatching { GlanceAppWidgetManager(context).getGlanceIds(NeGiysemWidget::class.java).isNotEmpty() }.getOrDefault(false)

    /** Keeps the widget fresh: every 30 minutes while there is a connection. UPDATE lets a new app version change the schedule. */
    fun schedule(context: Context) {
        val req = PeriodicWorkRequestBuilder<WeatherWorker>(30, TimeUnit.MINUTES).setConstraints(online).build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(PERIODIC, ExistingPeriodicWorkPolicy.UPDATE, req)
    }

    /**
     * One refresh as soon as possible. [replace] restarts a refresh that is already queued;
     * [delaySeconds] lets quick successive edits in the app collapse into one request.
     */
    fun now(context: Context, replace: Boolean = false, delaySeconds: Long = 0) {
        val req = OneTimeWorkRequestBuilder<WeatherWorker>().setConstraints(online).setInitialDelay(delaySeconds, TimeUnit.SECONDS).build()
        WorkManager.getInstance(context).enqueueUniqueWork(
            NOW, if (replace) ExistingWorkPolicy.REPLACE else ExistingWorkPolicy.KEEP, req
        )
    }

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(NOW)
    }
}
