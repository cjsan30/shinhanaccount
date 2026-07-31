import * as XLSX from 'xlsx';
import { describe, expect, it } from 'vitest';
import { isImportable, parseShinhanCardExport } from './shinhanImport';

describe('Shinhan Card Excel import', () => {
  it('reads the fixed export headers, skips the summary row, and classifies Wellstory 5,000 won', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['거래일','이용카드','가맹점명','승인번호','금액','매입구분','취소상태'],['2026.07.24 17:58','본인374*','삼성웰스토리(주)크래프톤정글','47806999',5000,'결제확정',''],['총 1건','','','','5000','','']]);
    const book = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(book, sheet, '카드이용내역'); const data = XLSX.write(book, { type: 'array', bookType: 'xls' });
    const [row] = parseShinhanCardExport(data);
    expect(row).toMatchObject({ approvalNumber: '47806999', amount: 5000, classification: { status: 'classified', bucket: 'studySpace', category: 'generalCafe' } });
    expect(isImportable(row)).toBe(true);
  });
});