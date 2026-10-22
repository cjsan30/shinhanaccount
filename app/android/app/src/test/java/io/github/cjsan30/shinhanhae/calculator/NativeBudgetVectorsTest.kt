package io.github.cjsan30.shinhanhae.calculator

import org.json.JSONArray
import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Test
import java.io.File

/** Reads app/src/domain/nativeBudgetVectors.json, which the web tests check against the TypeScript rules. */
class NativeBudgetVectorsTest {
    private val vectors = JSONObject(File(System.getProperty("nativeBudgetVectors")!!).readText(Charsets.UTF_8))

    private fun JSONArray.objects() = (0 until length()).map { getJSONObject(it) }

    @Test
    fun `policy period matches the web app`() {
        for (case in vectors.getJSONArray("period").objects()) {
            assertEquals(
                case.getString("name"),
                case.getBoolean("inPeriod"),
                isApprovalInPolicyPeriod(case.getString("occurredAt"), case.getString("periodKey"), case.getString("periodStart"), case.getString("periodEnd")),
            )
        }
    }

    @Test
    fun `merchant rule snapshot classifies like the web app`() {
        val rules = vectors.getJSONObject("rules")
        val snapshot = parseNativeRules(rules.getJSONArray("snapshot"))
        for (payment in rules.getJSONArray("payments").objects()) {
            assertEquals(payment.getString("name"), payment.getString("category"), classifyForBudget(snapshot, payment.getString("merchant"))?.category ?: "")
        }
    }

    @Test
    fun `alert thresholds match the web app`() {
        for (case in vectors.getJSONArray("thresholds").objects()) {
            val previous = case.getInt("previous")
            val thresholds = case.getJSONArray("thresholds").let { array -> (0 until array.length()).map { array.getInt(it) } }
            val expected = case.getJSONArray("crossed").let { array -> (0 until array.length()).map { array.getInt(it) } }
            assertEquals(case.getString("name"), expected, crossedAlertThresholds(previous, previous + case.getInt("amount"), case.getInt("limit"), thresholds))
        }
    }

    @Test
    fun `labels from the snapshot are used for the alert`() {
        val snapshot = parseNativeRules(vectors.getJSONObject("rules").getJSONArray("snapshot"))
        assertEquals(NativeClassification("food", "식비"), classifyForBudget(snapshot, "동네커피"))
        assertEquals(null, classifyForBudget(emptyList(), "동네커피"))
    }
}
