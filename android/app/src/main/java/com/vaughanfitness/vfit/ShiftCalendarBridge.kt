package com.vaughanfitness.vfit

import android.Manifest
import android.content.pm.PackageManager
import android.provider.BaseColumns
import android.provider.CalendarContract.Attendees
import android.provider.CalendarContract.Calendars
import android.provider.CalendarContract.Instances
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/** Reads only the calendar and event titles the member chooses for their rota. */
class ShiftCalendarBridge(private val activity: AppCompatActivity) {
    private data class Request(val id: String, val owner: String, val page: Int, val reply: (JSONObject) -> Unit)

    private var page = 0
    private var pendingPermission: Request? = null
    private val permissionLauncher = activity.registerForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        val request = pendingPermission ?: return@registerForActivityResult
        pendingPermission = null
        if (request.page != page) return@registerForActivityResult
        if (granted) query(request, ::readCalendars) else send(request, JSONObject().put("status", "permission"))
    }

    fun resetPage() {
        page++
    }

    fun receive(payload: JSONObject, reply: (JSONObject) -> Unit) {
        val id = payload.optString("requestId")
        val owner = payload.optString("ownerUid")
        if (!Regex("[a-zA-Z0-9-]{1,80}").matches(id) || owner.isBlank() || owner.length > 128) return
        val request = Request(id, owner, page, reply)
        val canRead = ContextCompat.checkSelfPermission(activity, Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED
        when (payload.optString("command")) {
            "list" -> when {
                canRead -> query(request, ::readCalendars)
                pendingPermission != null -> send(request, JSONObject().put("status", "busy"))
                else -> {
                    pendingPermission = request
                    try {
                        permissionLauncher.launch(Manifest.permission.READ_CALENDAR)
                    } catch (_: IllegalStateException) {
                        pendingPermission = null
                        send(request, JSONObject().put("status", "unavailable"))
                    }
                }
            }
            "shifts" -> {
                if (!canRead) {
                    send(request, JSONObject().put("status", "permission"))
                    return
                }
                val calendarId = payload.optString("calendarId").toLongOrNull()
                val titleFilter = payload.optString("titleFilter").trim()
                if (calendarId == null || calendarId <= 0L || titleFilter.length > 80 ||
                    (titleFilter.isBlank() && !payload.optBoolean("allTimedEvents"))) {
                    send(request, JSONObject().put("status", "unavailable"))
                    return
                }
                query(request) { readShifts(calendarId, titleFilter) }
            }
        }
    }

    private fun query(request: Request, read: () -> JSONObject) {
        activity.lifecycleScope.launch {
            val result = try {
                withContext(Dispatchers.IO) { read() }
            } catch (error: CancellationException) {
                throw error
            } catch (_: SecurityException) {
                JSONObject().put("status", "permission")
            } catch (_: Exception) {
                JSONObject().put("status", "unavailable")
            }
            send(request, result)
        }
    }

    private fun send(request: Request, result: JSONObject) {
        if (page == request.page) runCatching { request.reply(result.put("requestId", request.id).put("ownerUid", request.owner)) }
    }

    private fun readCalendars(): JSONObject {
        val calendars = JSONArray()
        val columns = arrayOf(BaseColumns._ID, Calendars.CALENDAR_DISPLAY_NAME)
        activity.contentResolver.query(Calendars.CONTENT_URI, columns, "${Calendars.VISIBLE} = 1", null,
            "${Calendars.CALENDAR_DISPLAY_NAME} ASC")?.use { cursor ->
            while (cursor.moveToNext()) {
                calendars.put(JSONObject().put("id", cursor.getLong(0).toString())
                    .put("name", cursor.getString(1)?.take(100)?.ifBlank { "Calendar" } ?: "Calendar"))
            }
        } ?: error("Calendar provider unavailable")
        return JSONObject().put("status", "calendars").put("calendars", calendars)
    }

    private fun readShifts(calendarId: Long, titleFilter: String): JSONObject {
        val resolver = activity.contentResolver
        val id = calendarId.toString()
        val available = resolver.query(Calendars.CONTENT_URI, arrayOf(BaseColumns._ID),
            "${BaseColumns._ID} = ? AND ${Calendars.VISIBLE} = 1", arrayOf(id), null)?.use { it.moveToFirst() }
        if (available != true) return JSONObject().put("status", "calendar-missing")

        val zone = ZoneId.systemDefault()
        val firstDay = LocalDate.now(zone)
        val endDay = firstDay.plusDays(90)
        val begin = minOf(firstDay.atStartOfDay(zone).toInstant(), firstDay.atStartOfDay(ZoneOffset.UTC).toInstant())
        val end = maxOf(endDay.atStartOfDay(zone).toInstant(), endDay.atStartOfDay(ZoneOffset.UTC).toInstant())
        val uri = Instances.CONTENT_URI.buildUpon().appendPath(begin.toEpochMilli().toString())
            .appendPath(end.toEpochMilli().toString()).build()
        val shifts = JSONArray()
        val columns = arrayOf(Instances.BEGIN, Instances.END, Instances.ALL_DAY, Instances.TITLE,
            Instances.STATUS, Instances.SELF_ATTENDEE_STATUS)
        resolver.query(uri, columns, "${Instances.CALENDAR_ID} = ?", arrayOf(id), "${Instances.BEGIN} ASC")?.use { cursor ->
            while (cursor.moveToNext()) {
                if (cursor.getInt(4) == Instances.STATUS_CANCELED ||
                    cursor.getInt(5) == Attendees.ATTENDEE_STATUS_DECLINED) continue
                val title = cursor.getString(3).orEmpty()
                if (!title.contains(titleFilter, ignoreCase = true)) continue
                val start = cursor.getLong(0)
                val finish = cursor.getLong(1)
                if (finish <= start) continue
                if (cursor.getInt(2) != 0) {
                    val type = allDayShiftType(title) ?: continue
                    var date = maxOf(firstDay, Instant.ofEpochMilli(start).atZone(ZoneOffset.UTC).toLocalDate())
                    val until = minOf(endDay, Instant.ofEpochMilli(finish).atZone(ZoneOffset.UTC).toLocalDate())
                    while (date < until) {
                        shifts.put(JSONObject().put("date", date.toString()).put("type", type))
                        date = date.plusDays(1)
                    }
                } else {
                    val date = Instant.ofEpochMilli(start).atZone(zone).toLocalDate()
                    if (date >= firstDay && date < endDay) shifts.put(JSONObject().put("begin", start).put("end", finish))
                }
                check(shifts.length() <= 2000) { "Too many matching events" }
            }
        } ?: error("Calendar provider unavailable")
        return JSONObject().put("status", "shifts").put("from", firstDay.toString())
            .put("through", endDay.minusDays(1).toString()).put("events", shifts)
    }

    private fun allDayShiftType(title: String): String? {
        return ALL_DAY_SHIFT.find(title)?.groupValues?.get(1)?.lowercase()?.let { if (it == "overnight") "night" else it }
    }

    private companion object {
        val ALL_DAY_SHIFT = Regex("\\b(night|overnight|early|day)[\\s-]+shift\\b", RegexOption.IGNORE_CASE)
    }
}
