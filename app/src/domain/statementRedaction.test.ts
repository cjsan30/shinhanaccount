import { describe, expect, it } from 'vitest';
import { formatStatementAmount, redactStatementRows } from './statementRedaction';

const rows = [
  { id: 'business', date: '2026-09-20', time: '12:00:00', summary: '체크카드', withdrawal: 5000, deposit: 0, merchant: '지원사업 카페', balance: 695000 },
  { id: 'private', date: '2026-09-20', time: '13:00:00', summary: '체크카드', withdrawal: 12000, deposit: 0, merchant: '개인 결제처', balance: 683000 },
];

describe('statement redaction', () => {
  it('preserves row order and money while masking only excluded descriptions', () => {
    const result = redactStatementRows(rows, ['private']);
    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'business', redacted: false, displayMerchant: '지원사업 카페', withdrawal: 5000 });
    expect(result[1]).toMatchObject({ id: 'private', redacted: true, displayMerchant: '████████', displaySummary: '████████', reason: '사업 무관 내역', withdrawal: 12000, balance: 683000 });
  });

  it('does not hide legitimate zero-value columns', () => {
    expect(formatStatementAmount(0)).toBe('');
    expect(formatStatementAmount(12000)).toBe('12,000');
  });
});
