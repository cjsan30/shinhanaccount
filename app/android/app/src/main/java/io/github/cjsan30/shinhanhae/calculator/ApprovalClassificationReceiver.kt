package io.github.cjsan30.shinhanhae.calculator

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONArray

/** Stores a notification action until the app can save the approval atomically. */
class ApprovalClassificationReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION_CLASSIFY = "io.github.cjsan30.shinhanhae.calculator.CLASSIFY_APPROVAL"
        const val ACTION_UNDECIDED = "io.github.cjsan30.shinhanhae.calculator.UNDECIDED_APPROVAL"
        const val EXTRA_APPROVAL_ID = "approvalId"
        const val EXTRA_CATEGORY = "category"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val approvalId = intent.getStringExtra(EXTRA_APPROVAL_ID) ?: return
        val prefs = secureSmsPreferences(context)
        val queue = try { JSONArray(prefs.getString("pending_approvals", "[]")) } catch (_: Exception) { JSONArray() }
        for (index in 0 until queue.length()) {
            val item = queue.optJSONObject(index) ?: continue
            if (item.optString("id") != approvalId) continue
            if (intent.action == ACTION_CLASSIFY) {
                val category = intent.getStringExtra(EXTRA_CATEGORY) ?: return
                item.put("quickCategory", category)
            } else if (intent.action == ACTION_UNDECIDED) item.put("quickCategory", "undecided")
            prefs.edit().putString("pending_approvals", queue.toString()).apply()
            return
        }
    }
}
