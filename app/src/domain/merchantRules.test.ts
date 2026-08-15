import { describe, expect, it } from 'vitest';
import { classifyWithMerchantRules, createMerchantRule, normalizeMerchant } from './merchantRules';
describe('merchant rules', () => {
  it('applies the newest exact rule to a new payment', () => {
    const first = createMerchantRule('테스트 카페', { bucket: 'studySpace', category: 'generalCafe' }, '2026-08-01T00:00:00.000Z');
    const latest = createMerchantRule('테스트카페', { bucket: 'resident', category: 'food' }, '2026-08-02T00:00:00.000Z');
    expect(normalizeMerchant('테스트 카페')).toBe('테스트카페');
    expect(classifyWithMerchantRules('테스트카페', 10000, [first, latest])).toMatchObject({ status: 'classified', bucket: 'resident', category: 'food' });
  });
});