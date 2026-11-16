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
import com.getcapacitor.JSObject
import com.google.android.gms.tasks.Tasks
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.korean.KoreanTextRecognizerOptions
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
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

    /**
     * Reads every image pushed to <app files>/plan-ocr with the same OCR and row grouping as
     * [계획표 스크린샷에서 읽기], and writes the texts to <app files>/plan-ocr-results.json for
     * comparison on the computer. Images and results stay on the device; nothing is uploaded.
     */
    @PluginMethod
    fun recognizePlanImages(call: PluginCall) {
        val context = context
        if (!isVerifyApp(context)) { call.reject("검증 앱에서만 쓸 수 있습니다."); return }
        val folder = context.getExternalFilesDir("plan-ocr")
        val images = folder?.listFiles { file -> file.isFile && file.extension.lowercase() in setOf("jpg", "jpeg", "png", "webp") }?.sortedBy { it.name }.orEmpty()
        if (images.isEmpty()) { call.reject("plan-ocr 폴더에 이미지가 없습니다."); return }
        Thread {
            val recognizer = TextRecognition.getClient(KoreanTextRecognizerOptions.Builder().build())
            val results = JSONArray()
            try {
                for (image in images) {
                    val entry = JSONObject().put("file", image.name)
                    try {
                        val text = Tasks.await(recognizer.process(PolicyOcrPlugin.preparedImage(context, android.net.Uri.fromFile(image))))
                        entry.put("text", PolicyOcrPlugin.toVisualRows(text))
                        entry.put("lines", PolicyOcrPlugin.toLineBoxes(text))
                        entry.put("width", image.let { android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }.also { options -> android.graphics.BitmapFactory.decodeFile(it.path, options) }.outWidth })
                    } catch (error: Exception) {
                        entry.put("error", error.message ?: error.javaClass.simpleName)
                    }
                    results.put(entry)
                }
                File(context.getExternalFilesDir(null), "plan-ocr-results.json").writeText(results.toString(2))
                call.resolve(JSObject().put("count", images.size))
            } catch (error: Exception) {
                call.reject("계획표 OCR 결과를 저장하지 못했습니다.", error)
            } finally {
                recognizer.close()
            }
        }.start()
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
