package io.github.cjsan30.shinhanhae.calculator

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
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

private const val PREFS = "sms_approval_queue"
private const val CARD_KEY = "card_last_4"
private const val QUEUE_KEY = "pending_approvals"
private const val BUDGET_STATE_KEY = "budget_state"

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
private val approvalRegex = Regex("""^\[신한체크승인\]\s+.*?\((\d{4})\)\s+(\d{2})/(\d{2})\s+(\d{2}):(\d{2})\s+\(금액\)([\d,]+)원\s+(.+)$""")

data class Approval(val cardLast4: String, val occurredAt: String, val amount: Int, val merchant: String) {
    fun toJson() = JSONObject().put("cardLast4", cardLast4).put("occurredAt", occurredAt).put("amount", amount).put("merchant", merchant)
}

private fun parseApproval(body: String, cardLast4: String): Approval? {
    val match = approvalRegex.matchEntire(body.trim()) ?: return null
    if (match.groupValues[1] != cardLast4) return null
    val year = Calendar.getInstance().get(Calendar.YEAR)
    return Approval(match.groupValues[1], "$year-${match.groupValues[2]}-${match.groupValues[3]}T${match.groupValues[4]}:${match.groupValues[5]}:00+09:00", match.groupValues[6].replace(",", "").toInt(), match.groupValues[7].trim())
}

class SmsApprovalReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Telephony.Sms.Intents.SMS_RECEIVED_ACTION) return
        val card = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(CARD_KEY, null) ?: return
        val body = Telephony.Sms.Intents.getMessagesFromIntent(intent).joinToString("") { it.messageBody ?: "" }
        val approval = parseApproval(body, card) ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
        queue.put(approval.toJson())
        while (queue.length() > 20) queue.remove(0)
        prefs.edit().putString(QUEUE_KEY, queue.toString()).apply()
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
    private val prefs by lazy { context.getSharedPreferences(PREFS, Context.MODE_PRIVATE) }

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
        val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
        prefs.edit().remove(QUEUE_KEY).apply()
        call.resolve(JSObject().put("items", queue))
    }
}