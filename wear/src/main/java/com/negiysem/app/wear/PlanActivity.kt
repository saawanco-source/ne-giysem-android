package com.negiysem.app.wear

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView

/** Today's outfit on the watch: the card, what to take along, the warning, when it was updated. Opened by the complication. */
class PlanActivity : Activity() {
    private lateinit var box: LinearLayout

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val pad = (resources.displayMetrics.widthPixels * 0.12f).toInt()
        box = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER_HORIZONTAL
            setPadding(pad, pad, pad, pad)
        }
        val scroll = ScrollView(this).apply {
            setBackgroundColor(Art.BG)
            isVerticalScrollBarEnabled = false
            // Focused, it takes the turning bezel / crown too.
            isFocusable = true
            isFocusableInTouchMode = true
            addView(box, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        }
        setContentView(scroll)
        scroll.requestFocus()
        show()
    }

    override fun onResume() {
        super.onResume()
        // Something newer may be waiting on the phone side; when what there is is missing or old, the phone is asked.
        PhoneListener.pull(this) { if (!isFinishing) runOnUiThread { show() } }
        PhoneListener.ask(this)
    }

    private fun line(text: String, sp: Float, bold: Boolean = false, color: Int = 0xFFFFFFFF.toInt()) {
        box.addView(TextView(this).apply {
            this.text = text
            textSize = sp
            setTextColor(color)
            gravity = Gravity.CENTER
            if (bold) typeface = Typeface.DEFAULT_BOLD
            setPadding(0, (4 * resources.displayMetrics.density).toInt(), 0, 0)
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }

    private fun show() {
        box.removeAllViews()
        val plan = PlanStore(this).plan()
        if (plan == null) {
            line(getString(R.string.app_name), 16f, bold = true)
            line(getString(R.string.waiting), 13f, color = 0xB3FFFFFF.toInt())
            return
        }
        if (plan.place.isNotBlank()) line(plan.place, 13f, color = 0xB3FFFFFF.toInt())
        box.addView(ImageView(this).apply {
            setImageBitmap(Art.card(this@PlanActivity, plan))
            adjustViewBounds = true
        }, LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
        plan.liveWarning()?.let { w ->
            line("⚠ " + w.title + (if (w.whenText.isNotBlank()) " · " + w.whenText else ""), 13f, bold = true, color = Art.warnBg(w.lv))
        }
        if (plan.take.isNotEmpty()) line(getString(R.string.take, plan.take.joinToString(", ") { it.label }), 13f)
        if (plan.next.isNotBlank()) line(plan.next, 12f, color = 0xB3FFFFFF.toInt())
        val age = System.currentTimeMillis() - plan.updated
        line(
            getString(R.string.updated, PlanStore.stamp(this, plan.updated)) + (if (age > PlanStore.MAX_AGE_MS) "\n" + getString(R.string.old) else ""),
            11f, color = 0x80FFFFFF.toInt()
        )
    }
}
