package io.github.cjsan30.shinhanhae.calculator

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import android.provider.Telephony
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PermissionState
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONObject
import java.util.Calendar
import java.lang.ref.WeakReference
import java.security.MessageDigest
import java.time.OffsetDateTime
import java.time.YearMonth

private const val CARD_KEY = "card_last_4"
private const val QUEUE_KEY = "pending_approvals"
private const val BUDGET_STATE_KEY = "budget_state"
private const val PROCESSED_SMS_KEY = "processed_sms_ids"
private const val LAST_SMS_SCAN_KEY = "last_sms_scan_at"
private const val SMS_LOG_TAG = "ShinhanhaeSms"
private const val MAX_QUEUE_SIZE = 500
private const val MAX_PROCESSED_SMS_IDS = 1000
private const val FIRST_RECOVERY_LOOKBACK_MS = 24L * 60 * 60 * 1000
private const val RECOVERY_OVERLAP_MS = 5L * 60 * 1000
private val SMS_QUEUE_LOCK = Any()

internal enum class EnqueueResult { ADDED, DUPLICATE, WRITE_FAILED }

internal fun isApprovalInPolicyPeriod(occurredAt: String, periodKey: String): Boolean = try {
    val date = OffsetDateTime.parse(occurredAt).toLocalDate()
    if (date.dayOfMonth in 11..13) false else {
        val startMonth = if (date.dayOfMonth >= 14) YearMonth.from(date) else YearMonth.from(date).minusMonths(1)
        startMonth.toString() == periodKey
    }
} catch (_: Exception) { false }

private data class NativeClassification(val category: String, val label: String)

private fun classifyForBudget(merchant: String, amount: Int): NativeClassification? {
    val normalized = merchant.lowercase().replace(Regex("""[\s().,]"""), "")
    if (normalized.contains("아이햅슨")) return null
    if (normalized.contains("놀유니버스")) return NativeClassification("lodging", "주거비")
    if (normalized == "sr") return NativeClassification("transport", "교통비")
    if (normalized.contains("삼성웰스토리")) {
        return if (amount == 8000) NativeClassification("food", "식비") else NativeClassification("generalCafe", "카페")
    }
    if (normalized.contains("서브웨이") || normalized.contains("써브웨이") || normalized.contains("맘스터치") || normalized.contains("맥도날드")) {
        return NativeClassification("generalCafe", "카페")
    }
    return null
}

internal fun consumeBudgetAlert(prefs: android.content.SharedPreferences, approval: Approval): String? {
    val state = try { JSONObject(prefs.getString(BUDGET_STATE_KEY, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
    if (!isApprovalInPolicyPeriod(approval.occurredAt, state.optString("periodKey"))) return null
    val classification = classifyForBudget(approval.merchant, approval.amount) ?: return null
    val limits = state.optJSONObject("categoryLimits") ?: return null
    val spent = state.optJSONObject("categorySpent") ?: JSONObject()
    val thresholds = state.optJSONArray("thresholds") ?: return null
    val limit = limits.optInt(classification.category, 0)
    if (limit <= 0) return null
    val previous = spent.optInt(classification.category, 0)
    val current = previous + approval.amount
    spent.put(classification.category, current)
    state.put("categorySpent", spent)
    prefs.edit().putString(BUDGET_STATE_KEY, state.toString()).apply()
    val crossed = mutableListOf<Int>()
    for (index in 0 until thresholds.length()) {
        val threshold = thresholds.optInt(index, 0)
        val boundary = limit * threshold / 100.0
        if (previous < boundary && current >= boundary) crossed.add(threshold)
    }
    return if (crossed.isEmpty()) null else classification.label + " 사용액이 " + crossed.joinToString(", ") { it.toString() + "%" } + " 기준을 넘었습니다."
}
private val approvalRegex = Regex("""\[신한체크승인\]\s+.*?\((\d{4})\)\s+(\d{2})/(\d{2})\s+(\d{2}):(\d{2})\s+(?:\(금액\)|금액)\s*([\d,]+)\s*원\s+(.+)$""")

internal data class Approval(
    val cardLast4: String,
    val occurredAt: String,
    val amount: Int,
    val merchant: String,
    val notificationPostedAt: Long? = null,
    val source: String = "sms",
) {
    fun queueId() = "$cardLast4|$occurredAt|$amount|$merchant"
    fun toJson(id: String = queueId()) = JSONObject()
        .put("id", id)
        .put("cardLast4", cardLast4)
        .put("occurredAt", occurredAt)
        .put("amount", amount)
        .put("merchant", merchant)
        .put("source", source)
        .also { notificationPostedAt?.let { postedAt -> it.put("notificationPostedAt", postedAt) } }
}

internal fun parseApproval(body: String, cardLast4: String, year: Int = Calendar.getInstance().get(Calendar.YEAR)): Approval? {
    val normalized = body.replace(Regex("""\s+"""), " ").trim()
    val match = approvalRegex.find(normalized) ?: return null
    if (match.groupValues[1] != cardLast4) return null
    return Approval(match.groupValues[1], "$year-${match.groupValues[2]}-${match.groupValues[3]}T${match.groupValues[4]}:${match.groupValues[5]}:00+09:00", match.groupValues[6].replace(",", "").toInt(), match.groupValues[7].trim())
}

internal fun smsFingerprint(body: String, sentAt: Long): String {
    val normalized = body.replace(Regex("""\s+"""), " ").trim()
    val digest = MessageDigest.getInstance("SHA-256").digest("$sentAt|$normalized".toByteArray())
    return "sms-" + digest.joinToString("") { "%02x".format(it) }
}

internal fun enqueueApproval(
    prefs: android.content.SharedPreferences,
    approval: Approval,
    sourceId: String,
): EnqueueResult = synchronized(SMS_QUEUE_LOCK) {
    val processed = JSArray(prefs.getString(PROCESSED_SMS_KEY, "[]"))
    val processedIds = (0 until processed.length()).mapNotNull { processed.optString(it, null) }.toMutableList()
    if (sourceId in processedIds) return@synchronized EnqueueResult.DUPLICATE

    val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
    for (index in 0 until queue.length()) {
        if (queue.optJSONObject(index)?.optString("id") == sourceId) return@synchronized EnqueueResult.DUPLICATE
    }
    queue.put(approval.toJson(sourceId))
    while (queue.length() > MAX_QUEUE_SIZE) queue.remove(0)
    processedIds.add(sourceId)
    while (processedIds.size > MAX_PROCESSED_SMS_IDS) processedIds.removeAt(0)
    val processedJson = JSArray().also { array -> processedIds.forEach(array::put) }
    val committed = prefs.edit()
        .putString(QUEUE_KEY, queue.toString())
        .putString(PROCESSED_SMS_KEY, processedJson.toString())
        .commit()
    if (committed) EnqueueResult.ADDED else EnqueueResult.WRITE_FAILED
}

internal fun postApprovalQueuedNotification(
    context: Context,
    prefs: android.content.SharedPreferences,
    eventId: String,
    budgetAlert: String?,
) {
    try {
        val channelId = "sms_approvals"
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "승인 결제", NotificationManager.IMPORTANCE_HIGH)
            NotificationManagerCompat.from(context).createNotificationChannel(channel)
        }
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val contentIntent = launchIntent?.let {
            PendingIntent.getActivity(context, 2001, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(if (budgetAlert == null) "새 승인 결제" else "지원금 사용 경고")
            .setContentText(budgetAlert ?: "승인 결제가 수신되었습니다. 앱을 열면 자동 반영됩니다.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .also { builder -> contentIntent?.let(builder::setContentIntent) }
            .build()
        NotificationManagerCompat.from(context).notify(2001, notification)
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_POSTED, status = "success")
    } catch (error: Exception) {
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_FAILED, status = "error", errorType = error.javaClass.simpleName)
        Log.e(SMS_LOG_TAG, "Failed to post approval notification", error)
    }
}

private fun recoverMissedApprovals(context: Context, prefs: android.content.SharedPreferences): Int {
    val eventId = newSmsDiagnosticEventId()
    if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_SMS) != PackageManager.PERMISSION_GRANTED) {
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.RECOVERY_PERMISSION_MISSING, status = "blocked")
        return 0
    }
    val card = prefs.getString(CARD_KEY, null) ?: return 0
    recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.RECOVERY_SCAN_STARTED)
    val now = System.currentTimeMillis()
    val previousScan = prefs.getLong(LAST_SMS_SCAN_KEY, 0L)
    val since = if (previousScan == 0L) now - FIRST_RECOVERY_LOOKBACK_MS else (previousScan - RECOVERY_OVERLAP_MS).coerceAtLeast(0L)
    var recovered = 0
    var scanned = 0
    var matched = 0
    var earliestUnparsedApproval: Long? = null
    val projection = arrayOf(Telephony.Sms._ID, Telephony.Sms.DATE, Telephony.Sms.DATE_SENT, Telephony.Sms.BODY)
    context.contentResolver.query(
        Telephony.Sms.Inbox.CONTENT_URI,
        projection,
        "${Telephony.Sms.DATE} >= ?",
        arrayOf(since.toString()),
        "${Telephony.Sms.DATE} ASC",
    )?.use { cursor ->
        val dateIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE)
        val sentIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.DATE_SENT)
        val bodyIndex = cursor.getColumnIndexOrThrow(Telephony.Sms.BODY)
        while (cursor.moveToNext()) {
            scanned += 1
            val receivedAt = cursor.getLong(dateIndex)
            val sentAt = cursor.getLong(sentIndex).takeIf { it > 0L } ?: receivedAt
            val body = cursor.getString(bodyIndex) ?: continue
            val approval = parseApproval(body, card)
            if (approval != null) {
                matched += 1
                if (enqueueApproval(prefs, approval, smsFingerprint(body, sentAt)) == EnqueueResult.ADDED) recovered += 1
            } else if (body.contains("[신한체크승인]")) {
                earliestUnparsedApproval = minOf(earliestUnparsedApproval ?: receivedAt, receivedAt)
            }
        }
    }
    val nextScan = earliestUnparsedApproval?.minus(1L) ?: now
    prefs.edit().putLong(LAST_SMS_SCAN_KEY, nextScan).commit()
    recordSmsDiagnostic(
        prefs,
        eventId,
        SmsDiagnosticStage.RECOVERY_SCAN_COMPLETED,
        status = "success",
        scannedCount = scanned,
        matchedCount = matched,
        recoveredCount = recovered,
    )
    if (recovered > 0) Log.i(SMS_LOG_TAG, "Recovered $recovered missed approval(s) from inbox")
    return recovered
}

class SmsApprovalReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val prefs = secureSmsPreferences(context)
        val eventId = newSmsDiagnosticEventId()
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.RECEIVER_ENTERED)
        Log.i(SMS_LOG_TAG, "SMS broadcast received")
        val card = prefs.getString(CARD_KEY, null)
        if (card == null) {
            recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.CARD_NOT_CONFIGURED, status = "blocked", cardConfigured = false)
            Log.w(SMS_LOG_TAG, "SMS ignored: card is not configured")
            return
        }
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        val body = messages.joinToString("") { it.messageBody ?: "" }
        val normalizedBody = body.replace(Regex("""\s+"""), " ").trim()
        val formatMatch = approvalRegex.find(normalizedBody)
        val markerFound = normalizedBody.contains("[신한체크승인]")
        val cardMatched = formatMatch?.groupValues?.getOrNull(1) == card
        recordSmsDiagnostic(
            prefs,
            eventId,
            SmsDiagnosticStage.BODY_ASSEMBLED,
            segmentCount = messages.size,
            bodyLength = body.length,
            markerFound = markerFound,
            cardConfigured = true,
            cardMatched = cardMatched,
        )
        val approval = parseApproval(body, card)
        if (approval == null) {
            val stage = when {
                !markerFound -> SmsDiagnosticStage.MARKER_MISSING
                formatMatch == null -> SmsDiagnosticStage.PARSE_FAILED
                !cardMatched -> SmsDiagnosticStage.CARD_MISMATCH
                else -> SmsDiagnosticStage.PARSE_FAILED
            }
            recordSmsDiagnostic(prefs, eventId, stage, status = "ignored", markerFound = markerFound, cardConfigured = true, cardMatched = cardMatched)
            Log.w(SMS_LOG_TAG, "SMS ignored: approval format or card did not match")
            return
        }
        val sentAt = messages.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
        when (enqueueApproval(prefs, approval, smsFingerprint(body, sentAt))) {
            EnqueueResult.DUPLICATE -> {
                recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.DUPLICATE_SKIPPED, status = "ignored")
                Log.i(SMS_LOG_TAG, "SMS ignored: approval was already processed")
                return
            }
            EnqueueResult.WRITE_FAILED -> {
                recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.QUEUE_COMMIT_FAILED, status = "error")
                Log.e(SMS_LOG_TAG, "SMS queue commit failed")
                return
            }
            EnqueueResult.ADDED -> Unit
        }
        val queueSize = JSArray(prefs.getString(QUEUE_KEY, "[]")).length()
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.QUEUE_COMMITTED, status = "success", queueSize = queueSize)
        Log.i(SMS_LOG_TAG, "Approval queued")
        SmsBridgePlugin.notifyApprovalQueued()
        postApprovalQueuedNotification(context, prefs, eventId, consumeBudgetAlert(prefs, approval))
    }
}

@CapacitorPlugin(name = "SmsBridge", permissions = [Permission(alias = "receiveSms", strings = ["android.permission.RECEIVE_SMS", "android.permission.READ_SMS"])])
class SmsBridgePlugin : Plugin() {
    companion object {
        @Volatile private var activeInstance: WeakReference<SmsBridgePlugin>? = null

        internal fun notifyApprovalQueued() {
            activeInstance?.get()?.emitApprovalQueued()
        }
    }

    private val prefs by lazy { secureSmsPreferences(context) }

    override fun load() {
        super.load()
        activeInstance = WeakReference(this)
    }

    override fun handleOnDestroy() {
        if (activeInstance?.get() === this) activeInstance = null
        super.handleOnDestroy()
    }

    private fun emitApprovalQueued() {
        notifyListeners("approvalReceived", JSObject())
    }

    @com.getcapacitor.PluginMethod
    fun configure(call: PluginCall) {
        val card = call.getString("cardLast4")?.filter { it.isDigit() }
        if (card?.length != 4) { call.reject("cardLast4 must be four digits"); return }
        prefs.edit().putString(CARD_KEY, card).apply()
        call.resolve()
    }

    @com.getcapacitor.PluginMethod
    fun requestPermission(call: PluginCall) = requestPermissionForAlias("receiveSms", call, "permissionResult")

    @PermissionCallback
    private fun permissionResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", getPermissionState("receiveSms") == PermissionState.GRANTED))
    }

    @com.getcapacitor.PluginMethod
    fun getNotificationAccessStatus(call: PluginCall) {
        call.resolve(JSObject().put("granted", NotificationManagerCompat.getEnabledListenerPackages(context).contains(context.packageName)))
    }

    @com.getcapacitor.PluginMethod
    fun openNotificationAccessSettings(call: PluginCall) {
        try {
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            context.startActivity(intent)
            call.resolve()
        } catch (error: Exception) {
            call.reject("Notification access settings could not be opened", error)
        }
    }


    @com.getcapacitor.PluginMethod
    fun getConfiguration(call: PluginCall) {
        call.resolve(JSObject().put("cardLast4", prefs.getString(CARD_KEY, "") ?: ""))
    }    @com.getcapacitor.PluginMethod
    fun syncBudgetState(call: PluginCall) {
        val categoryLimits = call.getObject("categoryLimits") ?: JSObject()
        val categorySpent = call.getObject("categorySpent") ?: JSObject()
        val thresholds = call.getArray("thresholds") ?: JSArray()
        val periodKey = call.getString("periodKey") ?: ""
        val state = JSONObject()
            .put("categoryLimits", JSONObject(categoryLimits.toString()))
            .put("categorySpent", JSONObject(categorySpent.toString()))
            .put("thresholds", thresholds)
            .put("periodKey", periodKey)
        prefs.edit().putString(BUDGET_STATE_KEY, state.toString()).apply()
        call.resolve()
    }
    @com.getcapacitor.PluginMethod
    fun injectTestApproval(call: PluginCall) {
        val card = call.getString("cardLast4")?.filter { it.isDigit() } ?: prefs.getString(CARD_KEY, "3741") ?: "3741"
        val approval = Approval(
            card,
            call.getString("occurredAt") ?: java.time.OffsetDateTime.now().toString(),
            call.getInt("amount") ?: 30000,
            call.getString("merchant") ?: "삼성웰스토리(주)크래프톤정"
        )
        val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
        queue.put(approval.toJson())
        while (queue.length() > 20) queue.remove(0)
        prefs.edit().putString(QUEUE_KEY, queue.toString()).apply()
        showInjectedNotification(consumeBudgetAlert(prefs, approval))
        call.resolve()
    }

    @com.getcapacitor.PluginMethod
    fun injectTestNotificationApproval(call: PluginCall) {
        val card = call.getString("cardLast4")?.filter { it.isDigit() } ?: prefs.getString(CARD_KEY, "3741") ?: "3741"
        val postedAt = System.currentTimeMillis()
        val approval = Approval(
            card,
            call.getString("occurredAt") ?: java.time.OffsetDateTime.now().withSecond(0).withNano(0).toString(),
            call.getInt("amount") ?: 5000,
            call.getString("merchant") ?: "삼성웰스토리(주)크래프톤정",
            notificationPostedAt = postedAt,
            source = "notification",
        )
        val eventId = newSmsDiagnosticEventId()
        val sourceId = notificationSourceId(approval, postedAt, "developer-replay")
        when (enqueueApproval(prefs, approval, sourceId)) {
            EnqueueResult.ADDED -> {
                recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.QUEUE_COMMITTED, status = "success", queueSize = JSArray(prefs.getString(QUEUE_KEY, "[]")).length())
                showInjectedNotification(consumeBudgetAlert(prefs, approval))
                notifyApprovalQueued()
                call.resolve(JSObject().put("id", sourceId))
            }
            EnqueueResult.DUPLICATE -> call.resolve(JSObject().put("id", sourceId))
            EnqueueResult.WRITE_FAILED -> call.reject("Test notification approval could not be queued")
        }
    }

    private fun showInjectedNotification(budgetAlert: String?) {
        val channelId = "sms_approvals"
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "승인 결제", NotificationManager.IMPORTANCE_HIGH)
            NotificationManagerCompat.from(context).createNotificationChannel(channel)
        }
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
            addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP)
        }
        val contentIntent = launchIntent?.let {
            PendingIntent.getActivity(context, 2002, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(if (budgetAlert == null) "테스트 승인 결제" else "지원금 사용 경고")
            .setContentText(budgetAlert ?: "테스트 승인 결제가 수신되었습니다.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .also { builder -> contentIntent?.let(builder::setContentIntent) }
            .build()
        NotificationManagerCompat.from(context).notify(2002, notification)
    }
    @com.getcapacitor.PluginMethod
    fun scheduleTestApproval(call: PluginCall) {
        val approvalObject = call.getObject("approval") ?: JSObject()
        val card = approvalObject.getString("cardLast4")?.filter { it.isDigit() } ?: prefs.getString(CARD_KEY, "3741") ?: "3741"
        val approval = Approval(
            card,
            approvalObject.getString("occurredAt") ?: java.time.OffsetDateTime.now().toString(),
            approvalObject.getInteger("amount") ?: 30000,
            approvalObject.getString("merchant") ?: "삼성웰스토리(주)크래프톤정"
        )
        val delayMs = call.getInt("delayMs")?.coerceIn(1_000, 60_000) ?: 10_000
        Handler(Looper.getMainLooper()).postDelayed({
            val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
            queue.put(approval.toJson())
            while (queue.length() > 20) queue.remove(0)
            prefs.edit().putString(QUEUE_KEY, queue.toString()).apply()
            showInjectedNotification(consumeBudgetAlert(prefs, approval))
        }, delayMs.toLong())
        call.resolve()
    }
    @com.getcapacitor.PluginMethod
    fun consumePendingApprovals(call: PluginCall) {
        // Reading is deliberately non-destructive. JavaScript acknowledges only after its local ledger is saved.
        Thread {
            try {
                recoverMissedApprovals(context, prefs)
                val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
                Handler(Looper.getMainLooper()).post { call.resolve(JSObject().put("items", queue)) }
            } catch (error: Exception) {
                Log.e(SMS_LOG_TAG, "Failed to recover missed approvals", error)
                recordSmsDiagnostic(prefs, newSmsDiagnosticEventId(), SmsDiagnosticStage.RECOVERY_SCAN_FAILED, status = "error", errorType = error.javaClass.simpleName)
                val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
                Handler(Looper.getMainLooper()).post { call.resolve(JSObject().put("items", queue)) }
            }
        }.start()
    }

    @com.getcapacitor.PluginMethod
    fun acknowledgePendingApprovals(call: PluginCall) {
        val ids = call.getArray("ids") ?: JSArray()
        val acknowledged = (0 until ids.length()).mapNotNull { ids.optString(it, null) }.toSet()
        val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
        val remaining = JSArray()
        for (index in 0 until queue.length()) {
            val item = queue.optJSONObject(index) ?: continue
            val id = item.optString("id", "${item.optString("cardLast4")}|${item.optString("occurredAt")}|${item.optInt("amount")}|${item.optString("merchant")}")
            if (!acknowledged.contains(id)) remaining.put(item)
        }
        prefs.edit().putString(QUEUE_KEY, remaining.toString()).apply()
        call.resolve()
    }

    @com.getcapacitor.PluginMethod
    fun getSmsDiagnostics(call: PluginCall) {
        val history = try {
            JSArray(prefs.getString(SMS_DIAGNOSTICS_KEY, "[]"))
        } catch (_: Exception) {
            JSArray()
        }
        call.resolve(JSObject().put("items", history))
    }

    @com.getcapacitor.PluginMethod
    fun clearSmsDiagnostics(call: PluginCall) {
        if (prefs.edit().remove(SMS_DIAGNOSTICS_KEY).commit()) call.resolve()
        else call.reject("SMS diagnostics could not be cleared")
    }
}
