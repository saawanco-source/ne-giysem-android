package com.negiysem.app.widget

import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService
import com.negiysem.app.MainActivity
import com.negiysem.app.data.Outfit
import com.negiysem.app.data.Store
import org.json.JSONObject

/** Quick settings tile: "Kaban · 8°" from the widget's latest snapshot; a tap opens the app. */
class OutfitTile : TileService() {
    override fun onStartListening() {
        super.onStartListening()
        val t = qsTile ?: return
        val o = Store(applicationContext).widgetJson?.let { runCatching { JSONObject(it) }.getOrNull() }
        val wear = o?.optJSONArray("wear")
        val first = (0 until (wear?.length() ?: 0)).mapNotNull { wear?.optJSONObject(it) }
            .firstOrNull { it.optString("g") in setOf("parka", "sisme", "kaban", "mont", "ceket", "yagmurluk", "ruzgarlik", "kazak", "sweatshirt", "hirka") }
            ?: wear?.optJSONObject(0)
        t.label = first?.optString("label")?.takeIf { it.isNotBlank() } ?: getString(com.negiysem.app.R.string.tile_label)
        if (Build.VERSION.SDK_INT >= 29) t.subtitle = o?.let { Outfit.deg(it.optDouble("feels", it.optDouble("temp", 0.0))) + " · " + it.optString("levelName") } ?: ""
        t.state = Tile.STATE_INACTIVE
        t.updateTile()
    }

    override fun onClick() {
        super.onClick()
        val i = Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (Build.VERSION.SDK_INT >= 34) {
            startActivityAndCollapse(PendingIntent.getActivity(this, 9, i, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
        } else {
            @Suppress("DEPRECATION", "StartActivityAndCollapseDeprecated")
            startActivityAndCollapse(i)
        }
    }
}
