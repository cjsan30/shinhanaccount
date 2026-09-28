import { describe, expect, it } from 'vitest';
import { parseShinhanBankCsv } from './shinhanBankImport';

describe('Shinhan Bank CSV import', () => {
  it('keeps withdrawals as undecided candidates and labels deposits separately', () => {
    const csv = '거래일자,거래시간,거래내용,출금금액,입금금액,계좌번호\n20260914,13:20:00,카페,5000,0,110-123-456789\n20260914,14:00:00,지원금 입금,0,700000,110-123-456789';
    const records = parseShinhanBankCsv(new TextEncoder().encode(csv).buffer);
    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({ direction: 'withdrawal', amount: 5000, classification: { status: 'undecided' } });
    expect(records[1]).toMatchObject({ direction: 'deposit', amount: 700000 });
  });
  it('rejects unreadable header encoding instead of guessing rows', () => {
    expect(() => parseShinhanBankCsv(new TextEncoder().encode('???,???\n1,2').buffer)).toThrow('한글 열 제목');
  });
});
