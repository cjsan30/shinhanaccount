package io.github.cjsan30.shinhanhae.calculator

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
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
        notifyApproval(context)
    }

    private fun notifyApproval(context: Context) {
        val channelId = "sms_approvals"
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = NotificationChannel(channelId, "승인 결제", NotificationManager.IMPORTANCE_HIGH)
            NotificationManagerCompat.from(context).createNotificationChannel(channel)
        }
        val notification = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("새 승인 결제")
            .setContentText("승인 결제가 수신되었습니다. 앱을 열면 자동 반영됩니다.")
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
    fun consumePendingApprovals(call: PluginCall) {
        val queue = JSArray(prefs.getString(QUEUE_KEY, "[]"))
        prefs.edit().remove(QUEUE_KEY).apply()
        call.resolve(JSObject().put("items", queue))
    }
}