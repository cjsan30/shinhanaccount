import { describe, expect, it } from 'vitest';
import { parseApprovalSms } from './sms';

const sample = '[신한체크승인] 홍*동(4321) 07/24 17:58 (금액)8,000원 테스트 가맹점';

describe('Shinhan approval SMS parser', () => {
  it('parses the approved payment and never returns the raw SMS', () => {
    expect(parseApprovalSms(sample, '4321', 2026)).toEqual({
      cardLast4: '4321',
      occurredAt: '2026-07-24T17:58:00+09:00',
      amount: 8000,
      merchant: '테스트 가맹점',
    });
  });

  it('ignores a message for a different card or an invalid format', () => {
    expect(parseApprovalSms(sample, '1111', 2026)).toBeNull();
    expect(parseApprovalSms('승인 완료 8,000원', '4321', 2026)).toBeNull();
  });

  it('accepts a web-sent prefix and masked account holder name', () => {
    expect(parseApprovalSms('[Web발신]\n[신한체크승인] 홍*동(4321) 07/24 17:58 (금액) 8,000원\n테스트 가맹점', '4321', 2026)).toMatchObject({
      cardLast4: '4321',
      amount: 8000,
      merchant: '테스트 가맹점',
    });
  });
});
