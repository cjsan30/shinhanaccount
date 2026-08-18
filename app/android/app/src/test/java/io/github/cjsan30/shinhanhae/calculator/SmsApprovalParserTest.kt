package io.github.cjsan30.shinhanhae.calculator

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SmsApprovalParserTest {
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
}
