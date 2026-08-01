import type { NativeApproval } from './smsBridge';

export const createTestApproval = (cardLast4 = '', occurredAt = new Date().toISOString()): NativeApproval => ({
  cardLast4: cardLast4 || '3741',
  occurredAt,
  amount: 30000,
  merchant: '삼성웰스토리(주)크래프톤정',
});