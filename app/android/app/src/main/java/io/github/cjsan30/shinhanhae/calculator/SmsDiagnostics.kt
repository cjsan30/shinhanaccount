package io.github.cjsan30.shinhanhae.calculator

import android.content.SharedPreferences
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.util.UUID

internal const val SMS_DIAGNOSTICS_KEY = "sms_diagnostics_v1"
private const val MAX_SMS_DIAGNOSTICS = 100
private val SMS_DIAGNOSTICS_LOCK = Any()

internal object SmsDiagnosticStage {
    const val RECEIVER_ENTERED = "RECEIVER_ENTERED"
    const val CARD_NOT_CONFIGURED = "CARD_NOT_CONFIGURED"
    const val BODY_ASSEMBLED = "BODY_ASSEMBLED"
    const val MARKER_MISSING = "MARKER_MISSING"
    const val CARD_MISMATCH = "CARD_MISMATCH"
    const val PARSE_FAILED = "PARSE_FAILED"
    const val DUPLICATE_SKIPPED = "DUPLICATE_SKIPPED"
    const val QUEUE_COMMITTED = "QUEUE_COMMITTED"
    const val QUEUE_COMMIT_FAILED = "QUEUE_COMMIT_FAILED"
    const val NOTIFICATION_POSTED = "NOTIFICATION_POSTED"
    const val NOTIFICATION_FAILED = "NOTIFICATION_FAILED"
    const val RECOVERY_PERMISSION_MISSING = "RECOVERY_PERMISSION_MISSING"
    const val RECOVERY_SCAN_STARTED = "RECOVERY_SCAN_STARTED"
    const val RECOVERY_SCAN_COMPLETED = "RECOVERY_SCAN_COMPLETED"
    const val RECOVERY_SCAN_FAILED = "RECOVERY_SCAN_FAILED"
}

internal fun newSmsDiagnosticEventId(): String = UUID.randomUUID().toString()

internal fun recordSmsDiagnostic(
    prefs: SharedPreferences,
    eventId: String,
    stage: String,
    status: String = "info",
    segmentCount: Int? = null,
    bodyLength: Int? = null,
    markerFound: Boolean? = null,
    cardConfigured: Boolean? = null,
    cardMatched: Boolean? = null,
    queueSize: Int? = null,
    scannedCount: Int? = null,
    matchedCount: Int? = null,
    recoveredCount: Int? = null,
    errorType: String? = null,
) {
    try {
        synchronized(SMS_DIAGNOSTICS_LOCK) {
            val history = try {
                JSONArray(prefs.getString(SMS_DIAGNOSTICS_KEY, "[]") ?: "[]")
            } catch (_: Exception) {
                JSONArray()
            }
            val entry = JSONObject()
                .put("id", UUID.randomUUID().toString())
                .put("eventId", eventId)
                .put("recordedAt", System.currentTimeMillis())
                .put("stage", stage)
                .put("status", status)
            segmentCount?.let { entry.put("segmentCount", it) }
            bodyLength?.let { entry.put("bodyLength", it) }
            markerFound?.let { entry.put("markerFound", it) }
            cardConfigured?.let { entry.put("cardConfigured", it) }
            cardMatched?.let { entry.put("cardMatched", it) }
            queueSize?.let { entry.put("queueSize", it) }
            scannedCount?.let { entry.put("scannedCount", it) }
            matchedCount?.let { entry.put("matchedCount", it) }
            recoveredCount?.let { entry.put("recoveredCount", it) }
            errorType?.takeIf { it.isNotBlank() }?.let { entry.put("errorType", it.take(80)) }
            history.put(entry)
            while (history.length() > MAX_SMS_DIAGNOSTICS) history.remove(0)
            prefs.edit().putString(SMS_DIAGNOSTICS_KEY, history.toString()).commit()
        }
    } catch (error: Exception) {
        Log.e("ShinhanhaeSms", "Failed to persist SMS diagnostic metadata", error)
    }
}

