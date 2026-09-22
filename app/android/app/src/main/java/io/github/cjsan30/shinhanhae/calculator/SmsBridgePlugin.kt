package io.github.cjsan30.shinhanhae.calculator

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ApplicationInfo
import android.Manifest
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import android.provider.Settings
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.util.Calendar
import java.lang.ref.WeakReference
import java.time.OffsetDateTime
import java.time.YearMonth

private const val CARD_KEY = "card_last_4"
private const val QUEUE_KEY = "pending_approvals"
private const val REVIEW_QUEUE_KEY = "pending_approval_reviews"
private const val CANCELLATION_QUEUE_KEY = "pending_cancellations"
private const val BUDGET_STATE_KEY = "budget_state"
private const val PROCESSED_SMS_KEY = "processed_sms_ids"
private const val RECENT_APPROVAL_MATCHES_KEY = "recent_approval_matches_v1"
private const val SMS_LOG_TAG = "ShinhanhaeSms"
private const val MAX_QUEUE_SIZE = 500
private const val MAX_PROCESSED_SMS_IDS = 1000
private const val MAX_RECENT_APPROVAL_MATCHES = 1000
private const val CROSS_SOURCE_DEDUPLICATION_WINDOW_MS = 90 * 1000L
private val SMS_QUEUE_LOCK = Any()

private fun isDebugBuild(context: Context): Boolean =
    context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0

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
    val alertCategories = state.optJSONArray("alertCategories") ?: return null
    if ((0 until alertCategories.length()).none { alertCategories.optString(it) == classification.category }) return null
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
    return if (crossed.isEmpty()) null else classification.label + " 잔액이 " + crossed.joinToString(", ") { (100 - it).toString() + "%" } + " 남았습니다."
}
private val approvalRegex = Regex("""\[?신한(?:체크)?승인\]?\s+.*?\((\d{4})\)\s+(\d{2})/(\d{2})\s+(\d{2}):(\d{2})\s+(?:\(금액\)|금액)\s*([\d,]+)\s*원\s+(.+)$""")
private val approvalCardRegex = Regex("""\[신한(?:체크)?승인\]\s+.*?\((\d{4})\)""")
private val genericCardLast4Regex = Regex("""\((\d{4})\)""")
private val approvalOccurredAtRegex = Regex("""(?:승인|결제|거래)\s*(?:일시|시간|시각)\s*[:：]?\s*(\d{2})/(\d{2})\s+(\d{2}):(\d{2})""")
private val approvalAmountRegex = Regex("""(?:승인|결제|거래)\s*금액\s*[:：]?\s*([\d,]+)\s*원""")
private val approvalMerchantRegex = Regex("""(?:가맹점(?:명)?|결제처|상호명)\s*[:：]?\s*(.+?)(?=\s*(?:\[[^]]+]|(?:승인|결제|거래)\s*(?:일시|시간|시각|금액)|$))""")
private val cancellationRegex = Regex("""\[신한(?:체크)?취소\]\s+.*?\((\d{4})\)\s+(\d{2})/(\d{2})\s+(\d{2}):(\d{2})\s+(?:\(금액\)|금액)\s*([\d,]+)\s*원\s+(.+)$""")
private val cancellationCardRegex = Regex("""\[신한(?:체크)?취소\]\s+.*?\((\d{4})\)""")
private val cancellationOccurredAtRegex = Regex("""취소\s*(?:일시|시간|시각)\s*[:：]?\s*(\d{2})/(\d{2})\s+(\d{2}):(\d{2})""")
private val cancellationAmountRegex = Regex("""취소\s*금액\s*[:：]?\s*([\d,]+)\s*원""")
private val bankNoticeRegex = Regex("""(?:입금|출금|입출금|이체|잔액|이자)""")

internal data class Approval(
    val cardLast4: String,
    val occurredAt: String,
    val amount: Int,
    val merchant: String,
    val notificationPostedAt: Long? = null,
    val source: String = "notification",
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
    approvalRegex.find(normalized)?.let { match ->
        if (match.groupValues[1] != cardLast4) return null
        return Approval(match.groupValues[1], "$year-${match.groupValues[2]}-${match.groupValues[3]}T${match.groupValues[4]}:${match.groupValues[5]}:00+09:00", match.groupValues[6].replace(",", "").toInt(), match.groupValues[7].trim())
    }

    val review = parseApprovalReview(normalized, cardLast4, year) ?: return null
    return if (review.occurredAt != null && review.amount != null && review.merchant != null) Approval(cardLast4, review.occurredAt, review.amount, review.merchant) else null
}

internal fun parseCancellation(body: String, cardLast4: String, year: Int = Calendar.getInstance().get(Calendar.YEAR)): Approval? {
    val normalized = body.replace(Regex("""\s+"""), " ").trim()
    cancellationRegex.find(normalized)?.let { match ->
        if (match.groupValues[1] != cardLast4) return null
        val occurredAt = validOccurredAt(listOf(match.groupValues[2], match.groupValues[3], match.groupValues[4], match.groupValues[5]), year) ?: return null
        return Approval(cardLast4, occurredAt, match.groupValues[6].replace(",", "").toIntOrNull() ?: return null, match.groupValues[7].trim())
    }
    val matchedCard = cancellationCardRegex.findAll(normalized).map { it.groupValues[1] }.distinct().singleOrNull() ?: return null
    if (matchedCard != cardLast4) return null
    val occurredParts = cancellationOccurredAtRegex.findAll(normalized).map { listOf(it.groupValues[1], it.groupValues[2], it.groupValues[3], it.groupValues[4]) }.distinct().singleOrNull() ?: return null
    val occurredAt = validOccurredAt(occurredParts, year) ?: return null
    val amount = singleField(cancellationAmountRegex, normalized) { it.groupValues[1].replace(",", "") }?.toIntOrNull() ?: return null
    val merchant = singleField(approvalMerchantRegex, normalized) { it.groupValues[1].trim() } ?: return null
    return Approval(matchedCard, occurredAt, amount, merchant)
}

internal data class ApprovalReview(
    val cardLast4: String,
    val occurredAt: String? = null,
    val amount: Int? = null,
    val merchant: String? = null,
    val notificationPostedAt: Long? = null,
    val source: String = "notification",
) {
    fun queueId() = listOf(cardLast4, occurredAt.orEmpty(), amount?.toString().orEmpty(), merchant.orEmpty(), notificationPostedAt?.toString().orEmpty()).joinToString("|")
    fun toJson(id: String = queueId()) = JSONObject().put("id", id).put("cardLast4", cardLast4).put("source", source).also {
        occurredAt?.let { value -> it.put("occurredAt", value) }
        amount?.let { value -> it.put("amount", value) }
        merchant?.let { value -> it.put("merchant", value) }
        notificationPostedAt?.let { value -> it.put("notificationPostedAt", value) }
    }
}

private fun validOccurredAt(parts: List<String>, year: Int): String? {
    val month = parts[0].toIntOrNull() ?: return null
    val day = parts[1].toIntOrNull() ?: return null
    val hour = parts[2].toIntOrNull() ?: return null
    val minute = parts[3].toIntOrNull() ?: return null
    if (month !in 1..12 || !YearMonth.of(year, month).isValidDay(day) || hour !in 0..23 || minute !in 0..59) return null
    return "$year-${parts[0]}-${parts[1]}T${parts[2]}:${parts[3]}:00+09:00"
}

private fun singleField(regex: Regex, normalized: String, transform: (MatchResult) -> String): String? =
    regex.findAll(normalized).map(transform).filter(String::isNotBlank).distinct().singleOrNull()

internal fun parseApprovalReview(body: String, cardLast4: String, year: Int = Calendar.getInstance().get(Calendar.YEAR)): ApprovalReview? {
    val normalized = body.replace(Regex("""\s+"""), " ").trim()
    if (normalized.isBlank() || bankNoticeRegex.containsMatchIn(normalized) || normalized.contains("취소") || normalized.contains("환불")) return null
    val directMarker = normalized.contains("[신한체크승인]") || normalized.contains("[신한승인]")
    val matchedCard = (if (directMarker) approvalCardRegex else genericCardLast4Regex)
        .findAll(normalized).map { it.groupValues[1] }.distinct().singleOrNull() ?: return null
    if (matchedCard != cardLast4) return null
    val occurredParts = approvalOccurredAtRegex.findAll(normalized).map { listOf(it.groupValues[1], it.groupValues[2], it.groupValues[3], it.groupValues[4]) }.distinct().singleOrNull()
    val occurredAt = occurredParts?.let { validOccurredAt(it, year) }
    val amount = singleField(approvalAmountRegex, normalized) { it.groupValues[1].replace(",", "") }?.toIntOrNull()
    val merchant = singleField(approvalMerchantRegex, normalized) { it.groupValues[1].trim() }
    val structuredFieldCount = listOf(occurredAt, amount?.toString(), merchant).count { !it.isNullOrBlank() }
    val contextProof = Regex("""(?:승인|결제|거래)""").containsMatchIn(normalized) && structuredFieldCount >= 2
    if (!directMarker && !contextProof) return null
    return ApprovalReview(matchedCard, occurredAt, amount, merchant)
}

internal fun approvalMatchId(approval: Approval): String {
    val merchant = approval.merchant.lowercase()
        .replace(Regex("""[\s().,_-]"""), "")
    return listOf(approval.cardLast4, approval.occurredAt, approval.amount.toString(), merchant).joinToString("|")
}

internal fun isCrossSourceApprovalDuplicate(
    previousMatchId: String,
    previousSourcePackage: String,
    previousPostedAt: Long,
    previousAlreadyPaired: Boolean,
    matchId: String,
    sourcePackage: String,
    postedAt: Long,
): Boolean = previousMatchId == matchId &&
    previousSourcePackage != sourcePackage &&
    !previousAlreadyPaired &&
    kotlin.math.abs(previousPostedAt - postedAt) <= CROSS_SOURCE_DEDUPLICATION_WINDOW_MS

internal fun enqueueApproval(
    prefs: android.content.SharedPreferences,
    approval: Approval,
    sourceId: String,
    sourcePackage: String = approval.source,
    postedAt: Long = approval.notificationPostedAt ?: System.currentTimeMillis(),
): EnqueueResult = synchronized(SMS_QUEUE_LOCK) {
    val processed = JSArray(prefs.getString(PROCESSED_SMS_KEY, "[]"))
    val processedIds = (0 until processed.length()).mapNotNull { processed.optString(it, null) }.toMutableList()
    if (sourceId in processedIds) return@synchronized EnqueueResult.DUPLICATE

    val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
    for (index in 0 until queue.length()) {
        if (queue.optJSONObject(index)?.optString("id") == sourceId) return@synchronized EnqueueResult.DUPLICATE
    }

    // The same approval can be announced by Samsung Messages and Shinhan SOL a few
    // seconds apart. Collapse only cross-app duplicates; identical repeat payments
    // from the same app remain independent records.
    val matches = JSArray(prefs.getString(RECENT_APPROVAL_MATCHES_KEY, "[]"))
    val matchId = approvalMatchId(approval)
    for (index in 0 until matches.length()) {
        val previous = matches.optJSONObject(index) ?: continue
        val previousPostedAt = previous.optLong("postedAt", 0L)
        if (isCrossSourceApprovalDuplicate(
                previous.optString("matchId"),
                previous.optString("sourcePackage"),
                previousPostedAt,
                previous.optBoolean("paired", false),
                matchId,
                sourcePackage,
                postedAt,
            )) {
            // Consume this pairing once. A later, genuinely separate payment with
            // the same minute/merchant/amount must not be absorbed into this pair.
            previous.put("paired", true)
            processedIds.add(sourceId)
            while (processedIds.size > MAX_PROCESSED_SMS_IDS) processedIds.removeAt(0)
            val pairedProcessedJson = JSArray().also { array -> processedIds.forEach(array::put) }
            val paired = prefs.edit()
                .putString(PROCESSED_SMS_KEY, pairedProcessedJson.toString())
                .putString(RECENT_APPROVAL_MATCHES_KEY, matches.toString())
                .commit()
            return@synchronized if (paired) EnqueueResult.DUPLICATE else EnqueueResult.WRITE_FAILED
        }
    }

    queue.put(approval.toJson(sourceId))
    while (queue.length() > MAX_QUEUE_SIZE) queue.remove(0)
    matches.put(JSONObject()
        .put("matchId", matchId)
        .put("sourcePackage", sourcePackage)
        .put("postedAt", postedAt)
        .put("paired", false))
    while (matches.length() > MAX_RECENT_APPROVAL_MATCHES) matches.remove(0)
    processedIds.add(sourceId)
    while (processedIds.size > MAX_PROCESSED_SMS_IDS) processedIds.removeAt(0)
    val processedJson = JSArray().also { array -> processedIds.forEach(array::put) }
    val committed = prefs.edit()
        .putString(QUEUE_KEY, queue.toString())
        .putString(PROCESSED_SMS_KEY, processedJson.toString())
        .putString(RECENT_APPROVAL_MATCHES_KEY, matches.toString())
        .commit()
    if (committed) EnqueueResult.ADDED else EnqueueResult.WRITE_FAILED
}

internal fun enqueueReview(
    prefs: android.content.SharedPreferences,
    review: ApprovalReview,
    sourceId: String,
): EnqueueResult = synchronized(SMS_QUEUE_LOCK) {
    val processed = JSArray(prefs.getString(PROCESSED_SMS_KEY, "[]"))
    val processedIds = (0 until processed.length()).mapNotNull { processed.optString(it, null) }.toMutableList()
    if (sourceId in processedIds) return@synchronized EnqueueResult.DUPLICATE
    val queue = JSArray(prefs.getString(REVIEW_QUEUE_KEY, "[]"))
    if ((0 until queue.length()).any { queue.optJSONObject(it)?.optString("id") == sourceId }) return@synchronized EnqueueResult.DUPLICATE
    queue.put(review.toJson(sourceId))
    while (queue.length() > MAX_QUEUE_SIZE) queue.remove(0)
    processedIds.add(sourceId)
    while (processedIds.size > MAX_PROCESSED_SMS_IDS) processedIds.removeAt(0)
    val committed = prefs.edit().putString(REVIEW_QUEUE_KEY, queue.toString())
        .putString(PROCESSED_SMS_KEY, JSArray().also { array -> processedIds.forEach(array::put) }.toString()).commit()
    if (committed) EnqueueResult.ADDED else EnqueueResult.WRITE_FAILED
}

internal fun enqueueCancellation(
    prefs: android.content.SharedPreferences,
    cancellation: Approval,
    sourceId: String,
): EnqueueResult = synchronized(SMS_QUEUE_LOCK) {
    val processed = JSArray(prefs.getString(PROCESSED_SMS_KEY, "[]"))
    val processedIds = (0 until processed.length()).mapNotNull { processed.optString(it, null) }.toMutableList()
    if (sourceId in processedIds) return@synchronized EnqueueResult.DUPLICATE
    val queue = JSArray(prefs.getString(CANCELLATION_QUEUE_KEY, "[]"))
    if ((0 until queue.length()).any { queue.optJSONObject(it)?.optString("id") == sourceId }) return@synchronized EnqueueResult.DUPLICATE
    queue.put(cancellation.toJson(sourceId))
    while (queue.length() > MAX_QUEUE_SIZE) queue.remove(0)
    processedIds.add(sourceId)
    while (processedIds.size > MAX_PROCESSED_SMS_IDS) processedIds.removeAt(0)
    val committed = prefs.edit().putString(CANCELLATION_QUEUE_KEY, queue.toString())
        .putString(PROCESSED_SMS_KEY, JSArray().also { array -> processedIds.forEach(array::put) }.toString()).commit()
    if (committed) EnqueueResult.ADDED else EnqueueResult.WRITE_FAILED
}

private fun acknowledgeQueue(prefs: android.content.SharedPreferences, key: String, ids: JSArray) {
    val acknowledged = (0 until ids.length()).mapNotNull { ids.optString(it, null) }.toSet()
    val queue = JSArray(prefs.getString(key, "[]"))
    val remaining = JSArray()
    for (index in 0 until queue.length()) {
        val item = queue.optJSONObject(index) ?: continue
        if (item.optString("id") !in acknowledged) remaining.put(item)
    }
    prefs.edit().putString(key, remaining.toString()).apply()
}

internal fun postApprovalQueuedNotification(
    context: Context,
    prefs: android.content.SharedPreferences,
    eventId: String,
    budgetAlert: String?,
) {
    try {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_FAILED, status = "skipped", errorType = "NotificationPermissionDenied")
            return
        }
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
        val state = try { JSONObject(prefs.getString(BUDGET_STATE_KEY, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
        val quickCategories = state.optJSONArray("quickCategories") ?: org.json.JSONArray()
        for (index in 0 until minOf(2, quickCategories.length())) {
            val item = quickCategories.optJSONObject(index) ?: continue
            val category = item.optString("category")
            val label = item.optString("label")
            if (category.isBlank() || label.isBlank()) continue
            val actionIntent = Intent(context, ApprovalClassificationReceiver::class.java)
                .setAction(ApprovalClassificationReceiver.ACTION_CLASSIFY)
                .putExtra(ApprovalClassificationReceiver.EXTRA_APPROVAL_ID, eventId)
                .putExtra(ApprovalClassificationReceiver.EXTRA_CATEGORY, category)
            val actionPendingIntent = PendingIntent.getBroadcast(context, 2100 + index, actionIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
            notification.addAction(0, "${label}로 분류", actionPendingIntent)
        }
        val undecidedIntent = Intent(context, ApprovalClassificationReceiver::class.java)
            .setAction(ApprovalClassificationReceiver.ACTION_UNDECIDED)
            .putExtra(ApprovalClassificationReceiver.EXTRA_APPROVAL_ID, eventId)
        val undecidedPendingIntent = PendingIntent.getBroadcast(context, 2103, undecidedIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        notification.addAction(0, "미정으로", undecidedPendingIntent)
        NotificationManagerCompat.from(context).notify(2001, notification.build())
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_POSTED, status = "success")
    } catch (error: Exception) {
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_FAILED, status = "error", errorType = error.javaClass.simpleName)
        Log.e(SMS_LOG_TAG, "Failed to post approval notification", error)
    }
}

internal fun postReviewNotification(context: Context, prefs: android.content.SharedPreferences, eventId: String, title: String, text: String) {
    try {
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        val channelId = "sms_approvals"
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            NotificationManagerCompat.from(context).createNotificationChannel(NotificationChannel(channelId, "승인 결제", NotificationManager.IMPORTANCE_HIGH))
        }
        val launchIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply { addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP) }
        val contentIntent = launchIntent?.let { PendingIntent.getActivity(context, 2004, it, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE) }
        val notification = NotificationCompat.Builder(context, channelId).setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title).setContentText(text).setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true)
            .also { builder -> contentIntent?.let(builder::setContentIntent) }
        NotificationManagerCompat.from(context).notify(2004, notification.build())
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_POSTED, status = "success")
    } catch (error: Exception) {
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_FAILED, status = "error", errorType = error.javaClass.simpleName)
    }
}

@CapacitorPlugin(name = "SmsBridge")
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
        val alertCategories = call.getArray("alertCategories") ?: JSArray()
        val thresholds = call.getArray("thresholds") ?: JSArray()
        val periodKey = call.getString("periodKey") ?: ""
        val quickCategories = call.getArray("quickCategories") ?: JSArray()
        val state = JSONObject()
            .put("categoryLimits", JSONObject(categoryLimits.toString()))
            .put("categorySpent", JSONObject(categorySpent.toString()))
            .put("alertCategories", alertCategories)
            .put("thresholds", thresholds)
            .put("periodKey", periodKey)
            .put("quickCategories", quickCategories)
        prefs.edit().putString(BUDGET_STATE_KEY, state.toString()).apply()
        call.resolve()
    }
    @com.getcapacitor.PluginMethod
    fun injectTestApproval(call: PluginCall) {
        if (!isDebugBuild(context)) { call.reject("Test approval injection is available in debug builds only"); return }
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
        if (!isDebugBuild(context)) { call.reject("Test approval injection is available in debug builds only"); return }
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
        if (!isDebugBuild(context)) return
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
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
        try {
            NotificationManagerCompat.from(context).notify(2002, notification)
        } catch (error: SecurityException) {
            Log.w(SMS_LOG_TAG, "Test notification was blocked", error)
        }
    }
    @com.getcapacitor.PluginMethod
    fun scheduleTestApproval(call: PluginCall) {
        if (!isDebugBuild(context)) { call.reject("Test approval injection is available in debug builds only"); return }
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
        val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
        call.resolve(JSObject().put("items", queue))
    }

    @com.getcapacitor.PluginMethod
    fun consumePendingApprovalReviews(call: PluginCall) {
        call.resolve(JSObject().put("items", JSArray(prefs.getString(REVIEW_QUEUE_KEY, "[]"))))
    }

    @com.getcapacitor.PluginMethod
    fun acknowledgePendingApprovalReviews(call: PluginCall) {
        acknowledgeQueue(prefs, REVIEW_QUEUE_KEY, call.getArray("ids") ?: JSArray())
        call.resolve()
    }

    @com.getcapacitor.PluginMethod
    fun consumePendingCancellations(call: PluginCall) {
        call.resolve(JSObject().put("items", JSArray(prefs.getString(CANCELLATION_QUEUE_KEY, "[]"))))
    }

    @com.getcapacitor.PluginMethod
    fun acknowledgePendingCancellations(call: PluginCall) {
        acknowledgeQueue(prefs, CANCELLATION_QUEUE_KEY, call.getArray("ids") ?: JSArray())
        call.resolve()
    }

    @com.getcapacitor.PluginMethod
    fun acknowledgePendingApprovals(call: PluginCall) {
        acknowledgeQueue(prefs, QUEUE_KEY, call.getArray("ids") ?: JSArray())
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
