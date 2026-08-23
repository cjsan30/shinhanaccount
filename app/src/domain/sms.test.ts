import { describe, expect, it } from 'vitest';
import { classifyPayment, parseApprovalSms } from './sms';

const sample = '[신한체크승인] 박*석(3741) 07/24 17:58 (금액)8,000원 삼성웰스토리(주)크래프톤정';

describe('Shinhan approval SMS parser', () => {
  it('parses the approved payment and never returns the raw SMS', () => {
    expect(parseApprovalSms(sample, '3741', 2026)).toEqual({
      cardLast4: '3741',
      occurredAt: '2026-07-24T17:58:00+09:00',
      amount: 8000,
      merchant: '삼성웰스토리(주)크래프톤정',
    });
  });

  it('ignores a message for a different card or an invalid format', () => {
    expect(parseApprovalSms(sample, '1111', 2026)).toBeNull();
    expect(parseApprovalSms('승인 완료 8,000원', '3741', 2026)).toBeNull();
  });

  it('accepts a web-sent prefix and masked account holder name', () => {
    expect(parseApprovalSms('[Web발신]\n[신한체크승인] 박*석(3741) 07/24 17:58 (금액) 8,000원\n삼성웰스토리(주)크래프톤정', '3741', 2026)).toMatchObject({
      cardLast4: '3741',
      amount: 8000,
      merchant: '삼성웰스토리(주)크래프톤정',
    });
  });
});

describe('automatic classification', () => {
  it.each([
    ['삼성웰스토리(주)크래프톤정', 8000, { status: 'classified', bucket: 'resident', category: 'food' }],
    ['삼성웰스토리(주)크래프톤정', 2000, { status: 'classified', bucket: 'studySpace', category: 'generalCafe' }],
    ['SR', 47800, { status: 'classified', bucket: 'resident', category: 'transport' }],
    ['서브웨이용인시청점', 7900, { status: 'classified', bucket: 'studySpace', category: 'generalCafe' }],
    ['맘스터치 용인둔전점', 10300, { status: 'classified', bucket: 'studySpace', category: 'generalCafe' }],
    ['한국맥도날드 유한회사 용인점DT', 6900, { status: 'classified', bucket: 'studySpace', category: 'generalCafe' }],
    ['주식회사 놀유니버스', 38900, { status: 'classified', bucket: 'resident', category: 'lodging' }],
    ['주식회사 아이햅슨', 12500, { status: 'excluded' }],
    ['분류되지 않은 상호', 12000, { status: 'undecided' }],
  ])('classifies %s', (merchant, amount, expected) => {
    expect(classifyPayment(merchant, amount)).toMatchObject(expected);
  });
});