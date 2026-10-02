package com.vaughanfitness.vfit

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.IBinder
import android.os.Looper
import android.util.Log
import androidx.core.content.ContextCompat
import androidx.core.app.ServiceCompat
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID
import kotlin.math.max

/** Records a user-started outdoor run while the screen is locked. The draft is
 * persisted after every accepted fix so reopening the WebView restores it. */
class RunTrackerService : Service(), LocationListener {
    companion object {
        private const val PREFS = "vfit_outdoor_run"
        private const val SESSION = "session"
        private const val CHANNEL = "vfit_outdoor_run_tracking"
        private const val NOTIFICATION_ID = 3032
        @Volatile var running = false
            private set
        private var lastStartAttemptAt = 0L

        fun read(context: Context): JSONObject? = try {
            context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(SESSION, null)?.let(::JSONObject)
        } catch (error: Exception) {
            Log.e("VFIT Run", "Could not read saved run", error)
            null
        }

        private fun write(context: Context, session: JSONObject?) {
            val editor = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            if (session == null) editor.remove(SESSION) else editor.putString(SESSION, session.toString())
            editor.apply()
        }

        fun begin(context: Context, ownerUid: String): Boolean {
            if (ownerUid.isBlank() || read(context) != null) return false
            val now = System.currentTimeMillis()
            write(context, JSONObject()
                .put("id", UUID.randomUUID().toString())
                .put("ownerUid", ownerUid)
                .put("startedAt", now)
                .put("status", "recording")
                .put("distanceMeters", 0.0)
                .put("maxSpeedKmh", 0.0)
                .put("points", JSONArray()))
            return try {
                lastStartAttemptAt = now
                ContextCompat.startForegroundService(context, Intent(context, RunTrackerService::class.java))
                true
            } catch (error: Exception) {
                write(context, null)
                Log.e("VFIT Run", "Could not start location service", error)
                false
            }
        }

        /** Recover an active draft if Android stopped its service. Only called while
         * the app is visible (the bridge receives a status or retry command). */
        fun resume(context: Context, ownerUid: String, force: Boolean = false): Boolean {
            val session = read(context) ?: return false
            if (session.optString("ownerUid") != ownerUid || session.optString("status") != "recording") return false
            if (running) return true
            if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED) return false
            val now = System.currentTimeMillis()
            if (!force && now - lastStartAttemptAt < 15000L) return false
            lastStartAttemptAt = now
            return try {
                ContextCompat.startForegroundService(context, Intent(context, RunTrackerService::class.java))
                true
            } catch (error: Exception) {
                Log.e("VFIT Run", "Could not resume location service", error)
                false
            }
        }

        fun finish(context: Context, ownerUid: String): JSONObject? {
            val session = read(context) ?: return null
            if (session.optString("ownerUid") != ownerUid) return null
            if (session.optString("status") != "completed") {
                session.put("status", "completed")
                session.put("endedAt", if (running) System.currentTimeMillis()
                    else session.optLong("lastFixAt", System.currentTimeMillis()))
                write(context, session)
            }
            context.stopService(Intent(context, RunTrackerService::class.java))
            return session
        }

        fun acknowledgeSaved(context: Context, ownerUid: String, id: String) {
            val session = read(context) ?: return
            if (session.optString("ownerUid") == ownerUid && session.optString("id") == id &&
                session.optString("status") == "completed") write(context, null)
        }

        fun discard(context: Context, ownerUid: String) {
            val session = read(context) ?: return
            if (session.optString("ownerUid") != ownerUid) return
            context.stopService(Intent(context, RunTrackerService::class.java))
            write(context, null)
        }
    }

    private lateinit var locationManager: LocationManager

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED ||
            read(this)?.optString("status") != "recording") {
            stopSelf()
            return START_NOT_STICKY
        }
        createChannel()
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
            running = true
            locationManager = getSystemService(LOCATION_SERVICE) as LocationManager
            var activeProviders = 0
            for (provider in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER)) {
                if (locationManager.isProviderEnabled(provider)) {
                    locationManager.requestLocationUpdates(provider, 2000L, 0f, this, Looper.getMainLooper())
                    activeProviders++
                }
            }
            if (activeProviders == 0) throw IllegalStateException("No location provider is enabled")
        } catch (error: Exception) {
            Log.e("VFIT Run", "Location tracking could not start", error)
            val session = read(this)
            if (session != null) {
                session.put("status", "interrupted")
                write(this, session)
            }
            stopSelf()
        }
        return START_STICKY
    }

    override fun onLocationChanged(location: Location) {
        val session = read(this) ?: return
        if (session.optString("status") != "recording") return
        if (location.time < session.optLong("startedAt") - 3000L) return
        session.put("lastLocationAt", location.time)
        if (location.hasAccuracy()) session.put("lastLocationAccuracy", location.accuracy.toDouble())
        if (!location.hasAccuracy() || location.accuracy > 40f) {
            write(this, session)
            return
        }
        val points = session.optJSONArray("points") ?: JSONArray()
        val last = if (points.length() > 0) points.optJSONObject(points.length() - 1) else null
        val elapsed = if (last == null) 0L else location.time - last.optLong("t")
        if (last != null && elapsed <= 0L) return
        val previous = if (last == null) null else Location("recorded").apply {
            latitude = last.optDouble("lat")
            longitude = last.optDouble("lon")
        }
        val metres = if (previous == null) 0.0 else previous.distanceTo(location).toDouble()
        if (last != null && metres < max(6.0, (last.optDouble("accuracy") + location.accuracy) / 2.0)) return
        // Ignore GPS jumps. A long gap starts a new route segment without
        // inventing a straight-line distance through an area with no signal.
        if (last != null && elapsed <= 120000L && metres > max(30.0, 14.0 * elapsed / 1000.0)) return
        val gap = last != null && elapsed > 120000L
        val speedKmh = if (!gap && elapsed > 0L) (metres / (elapsed / 1000.0)) * 3.6 else 0.0
        if (last != null && !gap) {
            session.put("distanceMeters", session.optDouble("distanceMeters") + metres)
            session.put("maxSpeedKmh", max(session.optDouble("maxSpeedKmh"), speedKmh))
        }
        points.put(JSONObject()
            .put("lat", location.latitude).put("lon", location.longitude)
            .put("t", location.time).put("accuracy", location.accuracy)
            .put("breakBefore", gap))
        // Bound the saved route and cloud record while keeping its shape.
        if (points.length() > 1800) {
            val reduced = JSONArray()
            for (i in 0 until points.length()) if (i == 0 || i % 2 == 0 || i == points.length() - 1)
                reduced.put(points.getJSONObject(i))
            session.put("points", reduced)
        }
        session.put("lastFixAt", location.time)
        write(this, session)
    }

    private fun createChannel() {
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Outdoor run tracking", NotificationManager.IMPORTANCE_LOW))
    }

    private fun notification(): Notification {
        val openApp = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        return Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.vfit_icon)
            .setContentTitle("VFIT is recording your run")
            .setContentText("Distance and route tracking are active. Tap to return.")
            .setOngoing(true)
            .setContentIntent(openApp)
            .build()
    }

    override fun onDestroy() {
        if (::locationManager.isInitialized) locationManager.removeUpdates(this)
        running = false
        super.onDestroy()
    }
}
