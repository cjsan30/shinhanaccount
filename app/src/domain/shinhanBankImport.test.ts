import { describe, expect, it } from 'vitest';
import { parseShinhanBankCsv, parseShinhanBankPdfTable, parseShinhanBankPdfText } from './shinhanBankImport';

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

describe('Shinhan Bank PDF import', () => {
  it('keeps a PDF withdrawal as an undecided candidate', () => {
    const [row] = parseShinhanBankPdfText('계좌번호 110-123-456789\n2026.09.29 05:36:08 출금 카페 5,000원');
    expect(row).toMatchObject({ direction: 'withdrawal', amount: 5000, occurredAt: '2026-09-29T05:36:08+09:00', classification: { status: 'undecided' } });
  });
  it('rebuilds separated PDF table cells by their visual row and columns', () => {
    const [row] = parseShinhanBankPdfTable([
      // Coordinates mirror the real Shinhan Bank PDF: values are split into
      // individual text items and the merchant/balance begin at 361/466pt.
      { text: '[신한] 110000000000', x: 162, y: 745 }, { text: '20260928', x: 37, y: 655 }, { text: '21:51:33', x: 107, y: 655 }, { text: '체크카드', x: 170, y: 655 }, { text: '10,000', x: 251, y: 655 }, { text: '0', x: 346, y: 655 }, { text: '주식회사 아성', x: 361, y: 655 }, { text: '325,481', x: 466, y: 655 }, { text: '원신한', x: 522, y: 655 },
    ]);
    expect(row).toMatchObject({ direction: 'withdrawal', amount: 10000, merchant: '주식회사 아성', summary: '체크카드', balance: 325481, branch: '원신한', occurredAt: '2026-09-28T21:51:33+09:00' });
  });
  it('fails closed when a document has no recognizable transaction table', () => {
    expect(() => parseShinhanBankPdfTable([{ text: '거래내역조회', x: 10, y: 10 }])).toThrow('입출금 표 행');
  });
  it('identifies deposits so the import layer can exclude them from candidates', () => {
    const [row] = parseShinhanBankPdfTable([
      { text: '110000000000', x: 200, y: 720 }, { text: '20260928', x: 37, y: 500 }, { text: '21:51:33', x: 107, y: 500 }, { text: '타행모바일뱅킹', x: 170, y: 500 }, { text: '0', x: 251, y: 500 }, { text: '3,900', x: 346, y: 500 }, { text: '박민석', x: 352, y: 500 },
    ]);
    expect(row).toMatchObject({ direction: 'deposit', amount: 3900 });
  });
  it('does not concatenate adjacent amount cells into a false large withdrawal', () => {
    const [row] = parseShinhanBankPdfTable([
      { text: '20260916', x: 37, y: 500 }, { text: '11:33:03', x: 107, y: 501 }, { text: '신한카드', x: 170, y: 500 },
      { text: '0', x: 251, y: 500 }, { text: '640', x: 346, y: 500 }, { text: '신한할인캐쉬백', x: 361, y: 500 }, { text: '698,540', x: 466, y: 500 },
    ]);
    expect(row).toMatchObject({ direction: 'deposit', amount: 640, merchant: '신한할인캐쉬백', balance: 698540 });
  });
  it('keeps rows from separate PDF pages apart even when their y coordinates match', () => {
    const rows = parseShinhanBankPdfTable([
      { text: '20260916', x: 37, y: 765, page: 0 }, { text: '11:33:07', x: 107, y: 765, page: 0 }, { text: '체크카드', x: 170, y: 765, page: 0 }, { text: '2,100', x: 257, y: 765, page: 0 }, { text: '0', x: 346, y: 765, page: 0 }, { text: '코레일', x: 361, y: 765, page: 0 },
      { text: '20260915', x: 37, y: 765, page: 1 }, { text: '11:28:15', x: 107, y: 765, page: 1 }, { text: '입금', x: 170, y: 765, page: 1 }, { text: '0', x: 278, y: 765, page: 1 }, { text: '700,000', x: 346, y: 765, page: 1 }, { text: '지원금', x: 361, y: 765, page: 1 },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ occurredAt: '2026-09-16T11:33:07+09:00', amount: 2100, direction: 'withdrawal' });
    expect(rows[1]).toMatchObject({ occurredAt: '2026-09-15T11:28:15+09:00', amount: 700000, direction: 'deposit' });
  });
});
