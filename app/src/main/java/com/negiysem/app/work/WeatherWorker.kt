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
import com.negiysem.app.data.Store
import com.negiysem.app.data.Updater
import com.negiysem.app.widget.NeGiysemWidget
import androidx.glance.appwidget.GlanceAppWidgetManager
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.CapabilityClient
import com.google.android.gms.wearable.Wearable
import com.negiysem.app.data.WatchSync
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.work.ForegroundInfo
import androidx.work.OutOfQuotaPolicy
import com.negiysem.app.R
import java.util.concurrent.TimeUnit

class WeatherWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    /** Only used for an expedited refresh on Android 11 and older, where it runs as a short foreground job. */
    override suspend fun getForegroundInfo(): ForegroundInfo = Scheduler.foregroundInfo(applicationContext)

    override suspend fun doWork(): Result {
        // Redraws from the kept forecast even when the fetch fails; then fetches again as soon as there's a connection.
        val result = runCatching { Updater.refresh(applicationContext) }
        result.exceptionOrNull()?.let { e ->
            // Nothing to draw yet: the waiting widget says when it last tried and what went wrong.
            Store(applicationContext).noteFail(e.javaClass.simpleName + (e.message?.let { ": $it" } ?: ""))
            runCatching { NeGiysemWidget.pushHint(applicationContext) }
        }
        if (result.getOrDefault(false) != true) Scheduler.whenOnline(applicationContext)
        return Result.success()
    }
}

object Scheduler {
    private const val PERIODIC = "negiysem-periodic"
    private const val NOW = "negiysem-now"
    private const val ONLINE = "negiysem-online"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    suspend fun hasWidgets(context: Context): Boolean =
        runCatching { GlanceAppWidgetManager(context).getGlanceIds(NeGiysemWidget::class.java).isNotEmpty() }.getOrDefault(false)

    /** The Ne Giysem? watch app is on a paired watch (reachable now or not); false without Google Play services. */
    suspend fun hasWatch(context: Context): Boolean = withContext(Dispatchers.IO) {
        runCatching {
            val task = Wearable.getCapabilityClient(context.applicationContext).getCapability(WatchSync.CAPABILITY, CapabilityClient.FILTER_ALL)
            Tasks.await(task, 5, TimeUnit.SECONDS).nodes.isNotEmpty()
        }.getOrDefault(false)
    }

    /** Something outside the app shows the forecast: a widget on the home screen or the watch. */
    suspend fun shows(context: Context): Boolean = hasWidgets(context) || hasWatch(context)

    /** Background refresh is needed while a widget or the watch shows the outfit, or weather warnings are turned on. */
    suspend fun needed(context: Context): Boolean = Store(context).alertsOn || shows(context)

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

    /**
     * A refresh the watch asked for (it shows nothing, or something old): expedited, so Android runs it now even when
     * it holds back the app's ordinary background work (no widget, app not opened for days); without expedited quota
     * left it runs as an ordinary one.
     */
    fun forWatch(context: Context) {
        val req = OneTimeWorkRequestBuilder<WeatherWorker>()
            .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(NOW, ExistingWorkPolicy.REPLACE, req)
    }

    /** Android 11 and older run an expedited job as a foreground service, which needs a (quiet) notification. */
    fun foregroundInfo(context: Context): ForegroundInfo {
        val en = Store(context).lang == "en"
        val nm = context.getSystemService(NotificationManager::class.java)
        if (Build.VERSION.SDK_INT >= 26) nm?.createNotificationChannel(
            NotificationChannel(REFRESH_CHANNEL, if (en) "Weather refresh" else "Hava yenileme", NotificationManager.IMPORTANCE_MIN)
        )
        val n = NotificationCompat.Builder(context, REFRESH_CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_warn)
            .setContentTitle(if (en) "Getting the weather for the watch" else "Saat için hava alınıyor")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()
        return ForegroundInfo(7301, n)
    }
    private const val REFRESH_CHANNEL = "refresh"

    /** After the last widget went: decides off the main thread whether the background refresh is still needed. */
    fun checkNeeded(context: Context) {
        WorkManager.getInstance(context).enqueueUniqueWork(NEED, ExistingWorkPolicy.REPLACE, OneTimeWorkRequestBuilder<NeedWorker>().build())
    }
    private const val NEED = "negiysem-need"

    fun cancel(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(PERIODIC)
        WorkManager.getInstance(context).cancelUniqueWork(NOW)
        WorkManager.getInstance(context).cancelUniqueWork(ONLINE)
    }
}

/** Stops the background refresh when nothing needs it any more (no widget, no watch complication, warnings off). */
class NeedWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        if (!Scheduler.needed(applicationContext)) Scheduler.cancel(applicationContext)
        return Result.success()
    }
}
