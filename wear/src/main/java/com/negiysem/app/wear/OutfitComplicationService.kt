package com.negiysem.app.wear

import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.drawable.Icon
import androidx.wear.watchface.complications.data.ComplicationData
import androidx.wear.watchface.complications.data.ComplicationType
import androidx.wear.watchface.complications.data.LongTextComplicationData
import androidx.wear.watchface.complications.data.MonochromaticImage
import androidx.wear.watchface.complications.data.MonochromaticImageComplicationData
import androidx.wear.watchface.complications.data.NoDataComplicationData
import androidx.wear.watchface.complications.data.PhotoImageComplicationData
import androidx.wear.watchface.complications.data.PlainComplicationText
import androidx.wear.watchface.complications.data.ShortTextComplicationData
import androidx.wear.watchface.complications.data.SmallImage
import androidx.wear.watchface.complications.data.SmallImageComplicationData
import androidx.wear.watchface.complications.data.SmallImageType
import androidx.wear.watchface.complications.data.TimeRange
import androidx.wear.watchface.complications.datasource.ComplicationDataSourceUpdateRequester
import androidx.wear.watchface.complications.datasource.ComplicationRequest
import androidx.wear.watchface.complications.datasource.SuspendingComplicationDataSourceService
import java.time.Instant
import java.util.Locale

/**
 * The Ne Giysem? complication, for any watch face:
 * - short text: the key garment's sticker (or the warning sign) with the temperature, and the garment's (or warning's) name;
 * - long text: the headline, with place and temperature (or the warning) as its title;
 * - small image / icon: the key garment's sticker;
 * - photo image: the whole outfit card (Ne Giysem's own face uses it in place of its weather-based outfit).
 * The data is the phone app's widget snapshot; without one, or when it is more than 12 hours old, it shows nothing.
 */
class OutfitComplicationService : SuspendingComplicationDataSourceService() {

    override suspend fun onComplicationRequest(request: ComplicationRequest): ComplicationData {
        // Missing or getting old: the phone is asked for a fresh one (it comes back through PhoneListener).
        PhoneListener.ask(this)
        val plan = PlanStore(this).plan()?.takeIf { System.currentTimeMillis() - it.updated < PlanStore.MAX_AGE_MS }
            ?: return NoDataComplicationData()
        return build(this, plan, request.complicationType) ?: NoDataComplicationData()
    }

    /** Just added to a watch face: whatever the phone sent before is read now, and a fresh one is asked for. */
    override fun onComplicationActivated(complicationInstanceId: Int, type: ComplicationType) {
        PhoneListener.pull(this) {}
        PhoneListener.ask(this)
    }

    override fun getPreviewData(type: ComplicationType): ComplicationData? =
        build(this, Plan.sample(Locale.getDefault().language == "tr"), type)

    companion object {
        private fun text(s: String) = PlainComplicationText.Builder(s).build()

        /** Asks every watch face showing this complication for fresh data (after the phone sent a new snapshot). */
        fun refreshAll(context: Context) {
            runCatching {
                ComplicationDataSourceUpdateRequester.create(context, ComponentName(context, OutfitComplicationService::class.java)).requestUpdateAll()
            }
        }

        fun build(context: Context, plan: Plan, type: ComplicationType): ComplicationData? {
            val open = PendingIntent.getActivity(
                context, 0, Intent(context, PlanActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
            val warning = plan.liveWarning()
            val key = plan.key
            // Too old to fit the weather after this: the watch face stops showing it even before the next update.
            val valid = TimeRange.before(Instant.ofEpochMilli(plan.updated + PlanStore.MAX_AGE_MS))
            val sticker = Icon.createWithResource(context, Art.sticker(key?.g))
            val icon = if (warning != null) Icon.createWithResource(context, R.drawable.ic_warn) else sticker
            val said = listOfNotNull(
                plan.place.takeIf { it.isNotBlank() }, plan.tempText, plan.levelName.takeIf { it.isNotBlank() },
                plan.headline.takeIf { it.isNotBlank() }, warning?.let { it.title + " " + it.whenText },
            ).joinToString(". ")
            val description = text(said)
            return when (type) {
                ComplicationType.SHORT_TEXT -> ShortTextComplicationData.Builder(text(plan.tempText), description)
                    .setTitle(text(warning?.short?.ifBlank { null } ?: warning?.title ?: key?.label ?: plan.levelName))
                    .setMonochromaticImage(MonochromaticImage.Builder(icon).build())
                    .setTapAction(open)
                    .setValidTimeRange(valid)
                    .build()
                ComplicationType.LONG_TEXT -> LongTextComplicationData.Builder(text(plan.headline.ifBlank { plan.levelName }), description)
                    .setTitle(text(warning?.let { "⚠ " + it.title + (if (it.whenText.isNotBlank()) " · " + it.whenText else "") }
                        ?: listOf(plan.place, plan.tempText).filter { it.isNotBlank() }.joinToString(" · ")))
                    .setSmallImage(SmallImage.Builder(if (warning != null) icon else sticker, SmallImageType.ICON).build())
                    .setTapAction(open)
                    .setValidTimeRange(valid)
                    .build()
                ComplicationType.SMALL_IMAGE -> SmallImageComplicationData.Builder(SmallImage.Builder(sticker, SmallImageType.ICON).build(), description)
                    .setTapAction(open)
                    .setValidTimeRange(valid)
                    .build()
                ComplicationType.MONOCHROMATIC_IMAGE -> MonochromaticImageComplicationData.Builder(MonochromaticImage.Builder(icon).build(), description)
                    .setTapAction(open)
                    .setValidTimeRange(valid)
                    .build()
                ComplicationType.PHOTO_IMAGE -> PhotoImageComplicationData.Builder(Icon.createWithBitmap(Art.card(context, plan)), description)
                    .setTapAction(open)
                    .setValidTimeRange(valid)
                    .build()
                else -> null
            }
        }
    }
}
