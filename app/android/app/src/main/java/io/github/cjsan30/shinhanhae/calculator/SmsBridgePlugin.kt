package io.github.cjsan30.shinhanhae.calculator

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.app.NotificationChannel
import android.app.NotificationManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import android.provider.Telephony
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

private const val CARD_KEY = "card_last_4"
private const val QUEUE_KEY = "pending_approvals"
private const val BUDGET_STATE_KEY = "budget_state"
private const val SMS_LOG_TAG = "ShinhanhaeSms"

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

private fun consumeBudgetAlert(prefs: android.content.SharedPreferences, approval: Approval): String? {
    val classification = classifyForBudget(approval.merchant, approval.amount) ?: return null
    val state = try { JSONObject(prefs.getString(BUDGET_STATE_KEY, "{}") ?: "{}") } catch (_: Exception) { JSONObject() }
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

internal data class Approval(val cardLast4: String, val occurredAt: String, val amount: Int, val merchant: String) {
    fun queueId() = "$cardLast4|$occurredAt|$amount|$merchant"
    fun toJson() = JSONObject().put("id", queueId()).put("cardLast4", cardLast4).put("occurredAt", occurredAt).put("amount", amount).put("merchant", merchant)
}

internal fun parseApproval(body: String, cardLast4: String, year: Int = Calendar.getInstance().get(Calendar.YEAR)): Approval? {
    val normalized = body.replace(Regex("""\s+"""), " ").trim()
    val match = approvalRegex.find(normalized) ?: return null
    if (match.groupValues[1] != cardLast4) return null
    return Approval(match.groupValues[1], "$year-${match.groupValues[2]}-${match.groupValues[3]}T${match.groupValues[4]}:${match.groupValues[5]}:00+09:00", match.groupValues[6].replace(",", "").toInt(), match.groupValues[7].trim())
}

class SmsApprovalReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        Log.i(SMS_LOG_TAG, "SMS broadcast received")
        val card = secureSmsPreferences(context).getString(CARD_KEY, null)
        if (card == null) {
            Log.w(SMS_LOG_TAG, "SMS ignored: card is not configured")
            return
        }
        val body = Telephony.Sms.Intents.getMessagesFromIntent(intent).joinToString("") { it.messageBody ?: "" }
        val approval = parseApproval(body, card)
        if (approval == null) {
            Log.w(SMS_LOG_TAG, "SMS ignored: approval format or card did not match")
            return
        }
        val prefs = secureSmsPreferences(context)
        val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
        queue.put(approval.toJson())
        while (queue.length() > 20) queue.remove(0)
        prefs.edit().putString(QUEUE_KEY, queue.toString()).apply()
        Log.i(SMS_LOG_TAG, "Approval queued")
        SmsBridgePlugin.notifyApprovalQueued()
        notifyApproval(context, consumeBudgetAlert(prefs, approval))
    }

    private fun notifyApproval(context: Context, budgetAlert: String?) {
        val channelId = "sms_approvals"
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "승인 결제", NotificationManager.IMPORTANCE_HIGH)
            NotificationManagerCompat.from(context).createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(if (budgetAlert == null) "새 승인 결제" else "지원금 사용 경고")
            .setContentText(budgetAlert ?: "승인 결제가 수신되었습니다. 앱을 열면 자동 반영됩니다.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()
        NotificationManagerCompat.from(context).notify(2001, notification)
    }
}

@CapacitorPlugin(name = "SmsBridge", permissions = [Permission(alias = "receiveSms", strings = ["android.permission.RECEIVE_SMS"])])
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

    private fun showInjectedNotification(budgetAlert: String?) {
        val channelId = "sms_approvals"
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "승인 결제", NotificationManager.IMPORTANCE_HIGH)
            NotificationManagerCompat.from(context).createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(if (budgetAlert == null) "테스트 승인 결제" else "지원금 사용 경고")
            .setContentText(budgetAlert ?: "테스트 승인 결제가 수신되었습니다.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
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
        val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
        call.resolve(JSObject().put("items", queue))
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
}
