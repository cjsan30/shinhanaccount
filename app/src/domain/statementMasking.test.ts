import { describe, expect, it } from 'vitest';
import { groupStatementMaskBlocks } from './statementMasking';

const rows = [
  { id: 'outside', date: '2026-08-14', time: '10:00:00', summary: '체크카드', withdrawal: 1000, deposit: 0, merchant: '기간 외', sourceY: 500 },
  { id: 'deposit', date: '2026-08-14', time: '11:00:00', summary: '입금', withdrawal: 0, deposit: 1000, merchant: '입금', sourceY: 480 },
  { id: 'business', date: '2026-08-15', time: '12:00:00', summary: '체크카드', withdrawal: 1000, deposit: 0, merchant: '사업 결제', sourceY: 460 },
  { id: 'private', date: '2026-08-15', time: '13:00:00', summary: '체크카드', withdrawal: 1000, deposit: 0, merchant: '개인 결제', sourceY: 440 },
];

describe('statement mask blocks', () => {
  it('merges adjacent hidden rows and combines their reasons', () => {
    const result = groupStatementMaskBlocks(rows, new Map([['outside', '정책 기간 외 내역'], ['deposit', '입금 내역 제외'], ['private', '사업 무관 제외']]));
    expect(result).toEqual([
      { firstIndex: 0, lastIndex: 1, label: '정책 기간 외 · 입금 내역 제외' },
      { firstIndex: 3, lastIndex: 3, label: '사업 무관 제외' },
    ]);
  });

  it('does not merge across a visible transaction', () => {
    const result = groupStatementMaskBlocks(rows, new Map([['outside', '정책 기간 외 내역'], ['private', '사업 무관 제외']]));
    expect(result).toHaveLength(2);
    expect(result.map((block) => [block.firstIndex, block.lastIndex])).toEqual([[0, 0], [3, 3]]);
  });
});
