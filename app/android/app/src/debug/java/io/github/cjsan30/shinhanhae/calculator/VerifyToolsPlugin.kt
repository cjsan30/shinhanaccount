package io.github.cjsan30.shinhanhae.calculator

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import androidx.core.app.NotificationCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

private const val TEST_APPROVAL_REQUEST = 7301
private const val EXTRA_AMOUNT = "amount"

private fun isVerifyApp(context: Context) = context.packageName.endsWith(".verify")

/**
 * Debug source set only (never in the Play build). Schedules a fake approval
 * notification so the tester can close the app and check what arrives.
 */
@CapacitorPlugin(name = "VerifyTools")
class VerifyToolsPlugin : Plugin() {
    @PluginMethod
    fun scheduleTestApproval(call: PluginCall) {
        val context = context
        if (!isVerifyApp(context)) { call.reject("검증 앱에서만 쓸 수 있습니다."); return }
        if (secureSmsPreferences(context).getString("card_last_4", null) == null) { call.reject("카드 끝 4자리를 먼저 등록해 주세요."); return }
        val delaySeconds = (call.getInt("delaySeconds") ?: 15).coerceIn(5, 120)
        val intent = Intent(context, VerifyTestApprovalReceiver::class.java).putExtra(EXTRA_AMOUNT, call.getInt("amount") ?: 5000)
        val pending = PendingIntent.getBroadcast(context, TEST_APPROVAL_REQUEST, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        context.getSystemService(AlarmManager::class.java)
            .setAndAllowWhileIdle(AlarmManager.ELAPSED_REALTIME_WAKEUP, SystemClock.elapsedRealtime() + delaySeconds * 1000L, pending)
        call.resolve()
    }
}

/** Posts the fake approval in the Shinhan check card format, using the card registered on this device. */
class VerifyTestApprovalReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (!isVerifyApp(context)) return
        val card = secureSmsPreferences(context).getString("card_last_4", null) ?: return
        val amount = intent.getIntExtra(EXTRA_AMOUNT, 5000)
        val time = SimpleDateFormat("MM/dd HH:mm", Locale.KOREA).apply { timeZone = TimeZone.getTimeZone("Asia/Seoul") }.format(Date())
        val body = "[신한체크승인] 검*증($card) $time (금액)${String.format(Locale.KOREA, "%,d", amount)}원 검증 가맹점"
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(VERIFY_TEST_APPROVAL_CHANNEL, "검증용 가짜 결제 알림", NotificationManager.IMPORTANCE_DEFAULT))
        val notification = NotificationCompat.Builder(context, VERIFY_TEST_APPROVAL_CHANNEL)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("검증용 결제 알림")
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .build()
        manager.notify((System.currentTimeMillis() % 100_000).toInt() + TEST_APPROVAL_REQUEST, notification)
    }
}
