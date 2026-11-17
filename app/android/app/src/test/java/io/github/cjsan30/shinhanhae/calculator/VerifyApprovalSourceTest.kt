package io.github.cjsan30.shinhanhae.calculator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class VerifyApprovalSourceTest {
    private val playPackage = "io.github.cjsan30.shinhanhae.calculator"
    private val verifyPackage = "$playPackage.verify"

    @Test
    fun `reads Shinhan app approvals in every build`() {
        assertTrue(isApprovalNotificationSource("com.shinhancard.smartshinhan", playPackage, "any"))
        assertTrue(isApprovalNotificationSource("com.shinhancard.smartshinhan", verifyPackage, null))
    }

    @Test
    fun `reads its own fake approvals only in the verification app and only from the test channel`() {
        assertTrue(isApprovalNotificationSource(verifyPackage, verifyPackage, VERIFY_TEST_APPROVAL_CHANNEL))
        assertFalse(isApprovalNotificationSource(verifyPackage, verifyPackage, "budget-alerts"))
        assertFalse(isApprovalNotificationSource(playPackage, playPackage, VERIFY_TEST_APPROVAL_CHANNEL))
        assertFalse(isApprovalNotificationSource("com.example.other", verifyPackage, VERIFY_TEST_APPROVAL_CHANNEL))
    }

    @Test
    fun `parses the fake approval format the verification app posts`() {
        val approval = parseApproval("[신한체크승인] 검*증(0000) 11/15 13:00 (금액)5,000원 검증 가맹점", "0000", 2026)
        assertNotNull(approval)
        assertEquals(5000L, approval!!.amount.toLong())
        assertEquals("검증 가맹점", approval.merchant)
    }
}
