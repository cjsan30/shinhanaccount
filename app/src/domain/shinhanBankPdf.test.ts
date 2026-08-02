import { describe, expect, it } from 'vitest';
import { parseShinhanBankPdfText } from './shinhanBankPdf';

describe('Shinhan Bank PDF import', () => {
  it('imports only check-card debit rows and ignores unrelated card payment rows', () => {
    const rows = parseShinhanBankPdfText(`거래일자 거래시간 적요 출금(원) 입금(원) 내용 잔액(원) 거래점
20260802 13:35:10 체크카드 16,000 0 돈까스잔치 마 286,984 원신한
20260715 18:08:10 카드결제 1,000 0 체크카드 캐릭 691,000 원신한`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ occurredAt: '2026-08-02T13:35:10+09:00', amount: 16000, merchant: '돈까스잔치 마', paymentStatus: '결제확정' });
  });
});