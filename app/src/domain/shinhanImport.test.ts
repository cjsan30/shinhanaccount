import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { isImportable, parseShinhanCardExport, parseShinhanCardPdfText } from './shinhanImport';

describe('Shinhan Card Excel import', () => {
  it('reads the fixed export headers and skips the summary row', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['거래일','이용카드','가맹점명','승인번호','금액','매입구분','취소상태'],['2026.07.24 17:58','본인374*','테스트 가맹점','47806999',5000,'결제확정',''],['총 1건','','','','5000','','']]);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '카드이용내역'); const data = XLSX.write(book, { type: 'array', bookType: 'xls' });
    const [row] = await parseShinhanCardExport(data);
    expect(row).toMatchObject({ approvalNumber: '47806999', amount: 5000 });
    expect(isImportable(row)).toBe(true);
  });

  it('keeps approval and cancellation fields so the ledger can exclude non-payments', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['거래일', '이용카드', '가맹점명', '승인번호', '금액', '매입구분', '취소상태'],
      ['2026.09.20 10:30', '본인374*', '정상 결제처', '1234', '12,000', '승인', ''],
      ['2026.09.20 10:31', '본인374*', '취소 결제처', '1235', '13,000', '승인', '취소'],
      ['합계', '', '', '', '', '', ''],
    ]);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '카드이용내역');
    const rows = await parseShinhanCardExport(XLSX.write(book, { type: 'array', bookType: 'xls' }));

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ occurredAt: '2026-09-20T10:30:00+09:00', approvalNumber: '00001234', amount: 12000, paymentStatus: '승인' });
    expect(isImportable(rows[0])).toBe(true);
    expect(isImportable(rows[1])).toBe(false);
  });

  it('rejects a spreadsheet that is not a Shinhan Card export', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['날짜', '금액'], ['2026.09.20', '5000']]);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '내역');
    await expect(parseShinhanCardExport(XLSX.write(book, { type: 'array', bookType: 'xls' }))).rejects.toThrow('신한카드 이용내역 양식');
  });

  it('reads a UTF-8 card CSV export with the same headers as the spreadsheet export', async () => {
    const csv = [
      '거래일,이용카드,가맹점명,승인번호,금액,매입구분,취소상태',
      '2026.09.21 09:45,본인374*,테스트카페,5678,"4,500",승인,',
    ].join('\n');

    const [row] = await parseShinhanCardExport(new TextEncoder().encode(csv).buffer);

    expect(row).toMatchObject({ occurredAt: '2026-09-21T09:45:00+09:00', cardMasked: '본인374*', approvalNumber: '00005678', amount: 4500, paymentStatus: '승인' });
    expect(isImportable(row)).toBe(true);
  });

  it('does not mark malformed or zero-value rows as importable payments', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['거래일', '이용카드', '가맹점명', '승인번호', '금액', '매입구분', '취소상태'],
      ['2026.09.21 09:45', '본인374*', '오류 금액', '7777', '확인필요', '승인', ''],
      ['2026.09.21 09:46', '본인374*', '0원 결제', '7778', 0, '승인', ''],
    ]);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '카드이용내역');
    const rows = await parseShinhanCardExport(XLSX.write(book, { type: 'array', bookType: 'xls' }));

    expect(rows).toHaveLength(2);
    expect(rows.every((row) => !isImportable(row))).toBe(true);
  });
});

describe('Shinhan Card PDF import', () => {
  it('extracts native-text payment rows into the same import shape', () => {
    const [row] = parseShinhanCardPdfText('본인374*\n2026.09.14 13:20 5,000원 테스트카페 2026.09.15');
    expect(row).toMatchObject({ cardMasked: '374*', occurredAt: '2026-09-14T13:20:00+09:00', amount: 5000 });
  });

  it('returns no rows when a PDF text block does not contain an approval row', () => {
    expect(parseShinhanCardPdfText('카드 이용 내역을 조회했습니다.')).toEqual([]);
  });
});
