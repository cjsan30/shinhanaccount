import { describe, expect, it } from 'vitest';
import { classifyWithMerchantRules, createMerchantRule, getMerchantAlias, normalizeMerchant } from './merchantRules';

describe('merchant rules', () => {
  it('uses contains matching by default for branch names', () => {
    const rule = createMerchantRule('메가커피', { bucket: 'studySpace', category: 'generalCafe' });
    expect(classifyWithMerchantRules('메가커피 강남점', 5000, [rule])).toMatchObject({
      status: 'classified', bucket: 'studySpace', category: 'generalCafe',
    });
  });

  it('prioritizes an exact rule over a contains rule', () => {
    const contains = createMerchantRule('메가커피', { bucket: 'studySpace', category: 'generalCafe' }, '2026-08-02T00:00:00.000Z');
    const exact = createMerchantRule('메가커피 강남점', { bucket: 'resident', category: 'food' }, '2026-08-01T00:00:00.000Z', 'exact');
    expect(classifyWithMerchantRules('메가커피 강남점', 5000, [contains, exact])).toMatchObject({
      status: 'classified', bucket: 'resident', category: 'food',
    });
  });

  it('uses the most specific contains rule and normalizes spacing and punctuation', () => {
    const broad = createMerchantRule('커피', { bucket: 'resident', category: 'food' });
    const specific = createMerchantRule('메가 커피', { bucket: 'studySpace', category: 'generalCafe' });
    expect(normalizeMerchant('메가커피(강남점)')).toBe('메가커피강남점');
    expect(classifyWithMerchantRules('메가커피(강남점)', 5000, [broad, specific])).toMatchObject({
      status: 'classified', bucket: 'studySpace', category: 'generalCafe',
    });
  });

  it('uses an optional display alias without changing the stored merchant', () => {
    const rule = createMerchantRule('메가커피', { bucket: 'studySpace', category: 'generalCafe' }, '2026-08-27T00:00:00.000Z', 'contains', '스터디 카페');
    expect(getMerchantAlias('메가커피 강남점', [rule])).toBe('스터디 카페');
  });
});
