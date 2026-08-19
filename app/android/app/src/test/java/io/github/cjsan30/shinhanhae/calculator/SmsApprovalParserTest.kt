package io.github.cjsan30.shinhanhae.calculator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SmsApprovalParserTest {
    @Test
    fun `policy period runs from the 14th through the next month 10th`() {
        assertTrue(isApprovalInPolicyPeriod("2026-08-14T00:00:00+09:00", "2026-08"))
        assertTrue(isApprovalInPolicyPeriod("2026-09-10T23:59:59+09:00", "2026-08"))
        assertFalse(isApprovalInPolicyPeriod("2026-09-11T00:00:00+09:00", "2026-08"))
        assertFalse(isApprovalInPolicyPeriod("2026-09-13T23:59:59+09:00", "2026-09"))
    }
    @Test
    fun parsesWebOriginatedApprovalWithLineBreaks() {
        val approval = parseApproval(
            """[Web발신]
                [신한체크승인] 박*석(3741) 08/18 19:20
                (금액) 8,000원 삼성웰스토리(주)크래프톤정
            """.trimIndent(),
            "3741",
            2026
        )

        requireNotNull(approval)
        assertEquals("3741", approval.cardLast4)
        assertEquals("2026-08-18T19:20:00+09:00", approval.occurredAt)
        assertEquals(8000, approval.amount)
        assertEquals("삼성웰스토리(주)크래프톤정", approval.merchant)
    }

    @Test
    fun rejectsAnApprovalForAnotherCard() {
        assertNull(parseApproval("[신한체크승인] 박*석(3741) 08/18 19:20 (금액)8,000원 테스트", "1111", 2026))
    }

    @Test
    fun parsesObservedGs25Approval() {
        val approval = parseApproval(
            "[Web발신] [신한체크승인] 박*석(3741) 08/19 00:30 (금액)1,700원 지에스(GS)25 울산대점",
            "3741",
            2026,
        )

        requireNotNull(approval)
        assertEquals(1700, approval.amount)
        assertEquals("지에스(GS)25 울산대점", approval.merchant)
    }

    @Test
    fun parsesObservedCafeApproval() {
        val approval = parseApproval(
            "[Web발신] [신한체크승인] 박*석(3741) 08/18 19:18 (금액)4,700원 갈바트카페 울산무거점",
            "3741",
            2026,
        )

        requireNotNull(approval)
        assertEquals(4700, approval.amount)
        assertEquals("갈바트카페 울산무거점", approval.merchant)
    }

    @Test
    fun fingerprintIsStableAcrossEquivalentWhitespace() {
        val first = smsFingerprint("[Web발신]\n[신한체크승인] 박*석(3741)", 1234L)
        val second = smsFingerprint("[Web발신] [신한체크승인] 박*석(3741)", 1234L)

        assertEquals(first, second)
        assertEquals(68, first.length)
    }

    @Test
    fun fingerprintDistinguishesSeparateMessages() {
        val first = smsFingerprint("[신한체크승인] 박*석(3741)", 1234L)
        val second = smsFingerprint("[신한체크승인] 박*석(3741)", 1235L)

        org.junit.Assert.assertNotEquals(first, second)
    }

    @Test
    fun notificationIdentityKeepsIdenticalSameMinutePaymentsWhenPostedMillisecondsDiffer() {
        val approval = Approval("3741", "2026-08-19T12:30:00+09:00", 1700, "지에스(GS)25 울산대점")
        val first = notificationSourceId(approval, 1000L, "conversation-1")
        val repeated = notificationSourceId(approval, 1000L, "conversation-1")
        val second = notificationSourceId(approval, 2000L, "conversation-1")

        assertEquals(first, repeated)
        org.junit.Assert.assertNotEquals(first, second)
    }
}
