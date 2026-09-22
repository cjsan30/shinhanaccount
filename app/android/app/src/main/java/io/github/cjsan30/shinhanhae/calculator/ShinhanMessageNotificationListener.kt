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
private const val SHINHAN_SOL_PAY_PACKAGE = "com.shcard.smartpay"
private const val NOTIFICATION_LOG_TAG = "ShinhanhaeMessageNotice"

internal val supportedApprovalNotificationPackages = setOf(
    SAMSUNG_MESSAGES_PACKAGE,
    SHINHAN_SOL_BANK_PACKAGE,
    SHINHAN_CARD_PACKAGE,
    SHINHAN_SOL_PAY_PACKAGE,
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

internal fun notificationReviewSourceId(review: ApprovalReview, postedAt: Long, conversationKey: String, kind: String): String {
    val raw = listOf(kind, review.cardLast4, review.occurredAt.orEmpty(), review.amount?.toString().orEmpty(), review.merchant.orEmpty(), postedAt.toString(), conversationKey).joinToString("|")
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
        val prefs = secureSmsPreferences(this)
        val eventId = newSmsDiagnosticEventId()
        if (sbn.packageName !in supportedApprovalNotificationPackages) {
            recordSmsDiagnostic(
                prefs,
                eventId,
                SmsDiagnosticStage.NOTIFICATION_SOURCE_UNSUPPORTED,
                status = "skipped",
                sourceApp = sbn.packageName,
            )
            return
        }
        if (sbn.notification.flags and Notification.FLAG_GROUP_SUMMARY != 0) {
            recordSmsDiagnostic(
                prefs,
                eventId,
                SmsDiagnosticStage.NOTIFICATION_GROUP_SUMMARY_SKIPPED,
                status = "skipped",
                sourceApp = sbn.packageName,
            )
            return
        }
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
            markerFound = candidates.any { it.body.contains("[신한체크승인]") || it.body.contains("[신한체크취소]") },
            cardConfigured = true,
            sourceApp = sbn.packageName,
        )
        var queued = 0
        var reviewQueued = 0
        var cancellationQueued = 0
        var budgetAlert: String? = null
        for (candidate in candidates) {
            val cancellation = parseCancellation(candidate.body, card)
            if (cancellation != null) {
                val notice = cancellation.copy(notificationPostedAt = candidate.postedAt, source = "notification")
                val sourceId = notificationSourceId(notice, candidate.postedAt, "cancel|${sbn.key}")
                when (enqueueCancellation(prefs, notice, sourceId)) {
                    EnqueueResult.ADDED -> cancellationQueued += 1
                    EnqueueResult.DUPLICATE -> Unit
                    EnqueueResult.WRITE_FAILED -> { recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.QUEUE_COMMIT_FAILED, status = "error"); return }
                }
                continue
            }
            val review = parseApprovalReview(candidate.body, card)
            if (review == null) continue
            val sourceId = notificationReviewSourceId(review, candidate.postedAt, sbn.key, "approval")
            val approval = parseApproval(candidate.body, card)?.copy(notificationPostedAt = candidate.postedAt, source = "notification")
            if (approval == null) {
                when (enqueueReview(prefs, review.copy(notificationPostedAt = candidate.postedAt, source = "notification"), sourceId)) {
                    EnqueueResult.ADDED -> reviewQueued += 1
                    EnqueueResult.DUPLICATE -> Unit
                    EnqueueResult.WRITE_FAILED -> { recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.QUEUE_COMMIT_FAILED, status = "error"); return }
                }
                continue
            }
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
        if (queued == 0 && reviewQueued == 0 && cancellationQueued == 0) {
            recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.NOTIFICATION_NO_NEW_APPROVAL, status = "ignored")
            return
        }

        val queueSize = org.json.JSONArray(prefs.getString("pending_approvals", "[]")).length() + org.json.JSONArray(prefs.getString("pending_approval_reviews", "[]")).length() + org.json.JSONArray(prefs.getString("pending_cancellations", "[]")).length()
        recordSmsDiagnostic(prefs, eventId, SmsDiagnosticStage.QUEUE_COMMITTED, status = "success", queueSize = queueSize)
        Log.i(NOTIFICATION_LOG_TAG, "$queued approval, $reviewQueued review, $cancellationQueued cancellation notification(s) queued")
        SmsBridgePlugin.notifyApprovalQueued()
        when {
            reviewQueued > 0 -> postReviewNotification(this, prefs, eventId, "결제 정보를 확인해 주세요", "일부 정보가 누락되었거나 겹칩니다. 앱에서 확인 후 등록하세요.")
            cancellationQueued > 0 -> postReviewNotification(this, prefs, eventId, "취소 결제 확인", "기존 결제와 대조한 뒤 예산에서 제외합니다.")
            else -> postApprovalQueuedNotification(this, prefs, eventId, budgetAlert)
        }
        // Deliberately do not cancel the original Samsung Messages notification.
    }
}
