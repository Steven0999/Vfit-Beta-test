package com.vaughanfitness.vfit

import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.ViewGroup
import android.widget.Button
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class HealthPermissionsRationaleActivity : AppCompatActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val padding = (24 * resources.displayMetrics.density).toInt()
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(padding, padding, padding, padding)
            setBackgroundColor(Color.rgb(17, 24, 39))
        }

        content.addView(TextView(this).apply {
            text = "VFIT step-data privacy"
            textSize = 24f
            setTextColor(Color.rgb(251, 146, 60))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        })
        content.addView(TextView(this).apply {
            text = "VFIT requests read-only access to your step count so it can show your total from local midnight. It does not write, change or delete Health Connect records.\n\nYour daily total is stored with your VFIT fitness log so it can appear in your dashboard and reports. Cloud sync follows the Cloud health-data sync control in VFIT’s Privacy Centre. VFIT does not sell Health Connect data or use it for advertising.\n\nYou can deny or revoke access at any time in Android Settings → Health Connect → App permissions. Manual step entry and the visible-app web counter remain available without Health Connect."
            textSize = 16f
            setTextColor(Color.LTGRAY)
            setPadding(0, padding, 0, padding)
            setLineSpacing(0f, 1.15f)
        })
        content.addView(Button(this).apply {
            text = "Return to VFIT"
            setTextColor(Color.rgb(17, 24, 39))
            setBackgroundColor(Color.rgb(249, 115, 22))
            setOnClickListener { finish() }
            gravity = Gravity.CENTER
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
        })

        setContentView(ScrollView(this).apply { addView(content) })
    }
}
