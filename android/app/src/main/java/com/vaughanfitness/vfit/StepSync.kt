package com.vaughanfitness.vfit

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.concurrent.TimeUnit

data class CachedStepTotal(
    val date: String,
    val steps: Long,
    val capturedAt: String
)

object StepCache {
    private const val PREFERENCES = "vfit_health_connect_steps"
    private const val DATE = "date"
    private const val STEPS = "steps"
    private const val CAPTURED_AT = "captured_at"
    private const val HISTORY_SYNC_DATE = "history_sync_date"

    fun write(context: Context, value: CachedStepTotal) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(DATE, value.date)
            .putLong(STEPS, value.steps)
            .putString(CAPTURED_AT, value.capturedAt)
            .apply()
    }

    fun read(context: Context): CachedStepTotal? {
        val preferences = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
        val date = preferences.getString(DATE, null) ?: return null
        val capturedAt = preferences.getString(CAPTURED_AT, null) ?: return null
        return CachedStepTotal(date, preferences.getLong(STEPS, 0L), capturedAt)
    }

    fun historyDaysToSync(context: Context, today: LocalDate): Int {
        val saved = context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .getString(HISTORY_SYNC_DATE, null)
        val lastDate = try {
            saved?.let { LocalDate.parse(it) }
        } catch (error: Exception) {
            null
        }
        if (lastDate == null) return 30
        val elapsed = ChronoUnit.DAYS.between(lastDate, today).coerceAtLeast(0)
        return (elapsed + 1L).coerceIn(1L, 30L).toInt()
    }

    fun markHistorySynced(context: Context, date: LocalDate) {
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit()
            .putString(HISTORY_SYNC_DATE, date.toString())
            .apply()
    }
}

object HealthStepReader {
    const val PROVIDER_PACKAGE = "com.google.android.apps.healthdata"
    val readStepsPermission: String = HealthPermission.getReadPermission(StepsRecord::class)

    fun sdkStatus(context: Context): Int =
        HealthConnectClient.getSdkStatus(context, PROVIDER_PACKAGE)

    fun client(context: Context): HealthConnectClient = HealthConnectClient.getOrCreate(context)

    fun backgroundReadAvailable(client: HealthConnectClient): Boolean =
        client.features.getFeatureStatus(
            HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND
        ) == HealthConnectFeatures.FEATURE_STATUS_AVAILABLE

    suspend fun readToday(context: Context): CachedStepTotal {
        val client = client(context)
        val zone = ZoneId.systemDefault()
        val date = LocalDate.now(zone)
        val now = Instant.now()
        return readDate(client, zone, date, now, includeZero = true)!!
    }

    suspend fun readRecentDays(context: Context, dayCount: Int): List<CachedStepTotal> {
        val client = client(context)
        val zone = ZoneId.systemDefault()
        val today = LocalDate.now(zone)
        val now = Instant.now()
        return (0 until dayCount.coerceIn(1, 30)).mapNotNull { offset ->
            val date = today.minusDays(offset.toLong())
            readDate(client, zone, date, now, includeZero = offset == 0)
        }
    }

    private suspend fun readDate(
        client: HealthConnectClient,
        zone: ZoneId,
        date: LocalDate,
        capturedAt: Instant,
        includeZero: Boolean
    ): CachedStepTotal? {
        val today = LocalDate.now(zone)
        val start = date.atStartOfDay(zone).toInstant()
        val end = if (date == today) capturedAt else date.plusDays(1).atStartOfDay(zone).toInstant()
        val response = client.aggregate(
            AggregateRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(start, end)
            )
        )
        val total = response[StepsRecord.COUNT_TOTAL]
        if (total == null && !includeZero) return null
        return CachedStepTotal(
            date = date.toString(),
            steps = total ?: 0L,
            capturedAt = capturedAt.toString()
        )
    }
}

class StepSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {
    override suspend fun doWork(): Result {
        if (HealthStepReader.sdkStatus(applicationContext) != HealthConnectClient.SDK_AVAILABLE) {
            return Result.success()
        }
        return try {
            val client = HealthStepReader.client(applicationContext)
            val granted = client.permissionController.getGrantedPermissions()
            val backgroundPermission = HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND
            if (HealthStepReader.readStepsPermission !in granted || backgroundPermission !in granted) {
                Result.success()
            } else {
                StepCache.write(applicationContext, HealthStepReader.readToday(applicationContext))
                Result.success()
            }
        } catch (error: SecurityException) {
            Result.success()
        } catch (error: Exception) {
            Result.retry()
        }
    }
}

object StepSyncScheduler {
    private const val WORK_NAME = "vfit-health-connect-step-sync"

    fun schedule(context: Context) {
        val request = PeriodicWorkRequestBuilder<StepSyncWorker>(15, TimeUnit.MINUTES)
            .setConstraints(
                Constraints.Builder()
                    .setRequiresBatteryNotLow(true)
                    .build()
            )
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            WORK_NAME,
            ExistingPeriodicWorkPolicy.UPDATE,
            request
        )
    }
}
