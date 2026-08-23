package io.github.cjsan30.shinhanhae.calculator

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import androidx.core.app.NotificationCompat
import java.security.MessageDigest

private const val SAMSUNG_MESSAGES_PACKAGE = "com.samsung.android.messaging"
private const val SHINHAN_SOL_BANK_PACKAGE = "com.shinhan.sbanking"
private const val SHINHAN_CARD_PACKAGE = "com.shinhancard.smartshinhan"
private const val NOTIFICATION_LOG_TAG = "ShinhanhaeMessageNotice"

internal val supportedApprovalNotificationPackages = setOf(
    SAMSUNG_MESSAGES_PACKAGE,
    SHINHAN_SOL_BANK_PACKAGE,
    SHINHAN_CARD_PACKAGE,
)

internal data class NotificationMessageCandidate(val body: String, val postedAt: Long)

internal fun notificationSourceId(approval: Approval, postedAt: Long, conversationKey: String): String {
    val raw = listOf(
        approval.occurredAt,
        approval.merchant.replace(Regex("""\s+"""), " ").trim(),
        approval.amount.toString(),
        postedAt.toString(),
        conversationKey,
    ).joinToString("|")
    val digest = MessageDigest.getInstance("SHA-256").digest(raw.toByteArray())
    return "notification-" + digest.joinToString("") { "%02x".format(it) }
}

internal fun extractNotificationMessages(notification: Notification, fallbackPostedAt: Long): List<NotificationMessageCandidate> {
    val messagingStyle = NotificationCompat.MessagingStyle.extractMessagingStyleFromNotification(notification)
    val messages = messagingStyle?.messages.orEmpty()
        .mapNotNull { message ->
            val body = message.text?.toString()?.trim().orEmpty()
            if (body.isBlank()) null else NotificationMessageCandidate(body, message.timestamp.takeIf { it > 0L } ?: fallbackPostedAt)
        }
        .sortedBy(NotificationMessageCandidate::postedAt)
    if (messages.isNotEmpty()) return messages

    val extras = notification.extras
    val candidates = linkedSetOf<String>()
    extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString()?.trim()?.takeIf(String::isNotBlank)?.let(candidates::add)
    extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)?.forEach { line -> line?.toString()?.trim()?.takeIf(String::isNotBlank)?.let(candidates::add) }
    extras.getCharSequence(Notification.EXTRA_TEXT)?.toString()?.trim()?.takeIf(String::isNotBlank)?.let(candidates::add)
    val postedAt = notification.`when`.takeIf { it > 0L } ?: fallbackPostedAt
    return candidates.map { NotificationMessageCandidate(it, postedAt) }
}

class ShinhanMessageNotificationListener : NotificationListenerService() {
    override fun onListenerConnected() {
        super.onListenerConnected()
        try {
            activeNotifications?.forEach(::processNotification)
        } catch (error: Exception) {
            Log.e(NOTIFICATION_LOG_TAG, "Failed to inspect active message notifications", error)
        }
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        if (sbn != null) processNotification(sbn)
    }

    private fun processNotification(sbn: StatusBarNotification) {
        if (sbn.packageName !in supportedApprovalNotificationPackages) return
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) return

        val prefs = secureSmsPreferences(this)
        val eventId = newSmsDiagnosticEventId()
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_LISTENER_ENTERED)
        val card = prefs.getString("card_last_4", null)
        if (card == null) {
            recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.CARD_NOT_CONFIGURED, status = "blocked", cardConfigured = false)
            return
        }

        val candidates = extractNotificationMessages(sbn.notification, sbn.postTime)
        recordSmsDiagnostic(
            prefs,
            eventId,
            SmsDiagnosticStage.NOTIFICATION_BODY_EXTRACTED,
            segmentCount = candidates.size,
            bodyLength = candidates.sumOf { it.body.length },
            markerFound = candidates.any { it.body.contains("[신한체크승인]") },
            cardConfigured = true,
            sourceApp = sbn.packageName,
        )
        var queued = 0
        var budgetAlert: String? = null
        for (candidate in candidates) {
            val parsed = parseApproval(candidate.body, card) ?: continue
            val approval = parsed.copy(notificationPostedAt = candidate.postedAt, source = "notification")
            val sourceId = notificationSourceId(approval, candidate.postedAt, sbn.key)
            when (enqueueApproval(prefs, approval, sourceId, sbn.packageName, candidate.postedAt)) {
                EnqueueResult.ADDED -> {
                    queued += 1
                    budgetAlert = consumeBudgetAlert(prefs, approval) ?: budgetAlert
                }
                EnqueueResult.DUPLICATE -> Unit
                EnqueueResult.WRITE_FAILED -> {
                    recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.QUEUE_COMMIT_FAILED, status = "error")
                    Log.e(NOTIFICATION_LOG_TAG, "Notification approval queue commit failed")
                    return
                }
            }
        }
        if (queued == 0) {
            recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_NO_NEW_APPROVAL, status = "ignored")
            return
        }

        val queueSize = org.json.JSONArray(prefs.getString("pending_approvals", "[]")).length()
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.QUEUE_COMMITTED, status = "success", queueSize = queueSize)
        Log.i(NOTIFICATION_LOG_TAG, "$queued approval notification(s) queued")
        SmsBridgePlugin.notifyApprovalQueued()
        postApprovalQueuedNotification(this, prefs, eventId, budgetAlert)
        // Deliberately do not cancel the original Samsung Messages notification.
    }
}
