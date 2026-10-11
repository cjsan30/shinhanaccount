import { describe, expect, it } from 'vitest';
import { adjustBudget } from './budgetAdjustment';
import { confirmPolicyForPeriod, emptyPolicy, getEffectivePolicy, getPolicyLimit, loadPolicyBook, savePolicyBook, validatePolicyAgainstProfile, type SupportPolicy } from './policy';
import { normalizeAppState, denormalizeAppState } from '../native/normalizedState';
import { createEmptyLedger } from './ledger';

const plan = (): SupportPolicy => ({ ...structuredClone(emptyPolicy), plans: { ...emptyPolicy.plans, food: 200000, education: 200000, transport: 100000, cafe: 200000 }, period: { startDay: 15, endDay: 10 } });
const transfer = { from: 'transport', to: 'housing', amount: 50000 };

describe('same-bucket budget adjustment', () => {
  it('funds a zero-planned category without changing totals or the input', () => {
    const original = plan(); const before = structuredClone(original);
    const next = adjustBudget(original, transfer, { transport: 20000 });
    expect(next.plans).toMatchObject({ housing: 50000, transport: 50000 });
    expect(original).toEqual(before);
    expect(getPolicyLimit(next, 'resident')).toBe(500000);
    expect(getPolicyLimit(next, 'studySpace')).toBe(200000);
    expect(validatePolicyAgainstProfile(next)).toEqual([]);
    expect(next.period).toEqual(original.period);
    expect(next.alertTargets).toEqual(original.alertTargets);
  });
  it('permits transfers within learning-space categories', () => {
    expect(adjustBudget(plan(), { from: 'cafe', to: 'readingRoom', amount: 200000 }, {}).plans).toMatchObject({ cafe: 0, readingRoom: 200000 });
  });
  it.each([['transport', 'cafe'], ['cafe', 'housing']])('rejects cross-bucket transfers %s -> %s', (from, to) => {
    expect(() => adjustBudget(plan(), { from, to, amount: 1 }, {})).toThrow('같은 대분류');
  });
  it.each([0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe transfer amount %s', (amount) => {
    expect(() => adjustBudget(plan(), { ...transfer, amount }, {})).toThrow('정수');
  });
  it.each(['missing', '__proto__', 'constructor', '<script>alert(1)</script>'])('rejects unknown or injected category %s', (from) => {
    expect(() => adjustBudget(plan(), { ...transfer, from }, {})).toThrow('항목');
  });
  it('rejects moving to itself and overspending the source plan', () => {
    expect(() => adjustBudget(plan(), { ...transfer, to: 'transport' }, {})).toThrow('서로 다른');
    expect(() => adjustBudget(plan(), { ...transfer, amount: 80001 }, { transport: 20000 })).toThrow('미사용 예산');
    expect(() => adjustBudget(plan(), { ...transfer, amount: 1 }, { transport: 100001 })).toThrow('미사용 예산');
    expect(adjustBudget(plan(), { ...transfer, amount: 80000 }, { transport: 20000 }).plans.transport).toBe(20000);
  });
  it('keeps configured per-item caps for both support profiles', () => {
    expect(() => adjustBudget(plan(), { from: 'transport', to: 'food', amount: 1 }, {})).toThrow('최대 200,000원');
    const smaller = { ...plan(), profileId: 'shinhanhae-40' as const, plans: { ...emptyPolicy.plans, food: 80000, transport: 120000, cafe: 200000 } };
    expect(() => adjustBudget(smaller, { from: 'transport', to: 'food', amount: 1 }, {})).toThrow('최대 80,000원');
    expect(adjustBudget(smaller, transfer, {}).plans.housing).toBe(50000);
  });
  it('validates corrupt plan and spent values instead of silently reallocating', () => {
    expect(() => adjustBudget({ ...plan(), plans: { ...plan().plans, food: NaN } }, transfer, {})).toThrow('저장된 계획');
    expect(() => adjustBudget(plan(), transfer, { transport: -1 })).toThrow('사용 금액');
    expect(() => adjustBudget(plan(), transfer, { transport: Infinity })).toThrow('사용 금액');
  });
  it('includes custom categories but never bypasses bucket or duplicate-key checks', () => {
    const original = { ...plan(), customItems: [{ id: 'local', label: '기타', bucket: 'resident' as const, amount: 0 }] };
    const next = adjustBudget(original, { ...transfer, to: 'local' }, {});
    expect(next.customItems?.[0].amount).toBe(50000);
    expect(getPolicyLimit(next, 'resident')).toBe(getPolicyLimit(original, 'resident'));
    expect(() => adjustBudget(original, { from: 'cafe', to: 'local', amount: 1 }, {})).toThrow('같은 대분류');
    expect(() => adjustBudget({ ...original, customItems: [...original.customItems, ...original.customItems] }, { ...transfer, to: 'local' }, {})).toThrow('항목');
  });
  it('moves from a custom item while preserving other custom allocations', () => {
    const original = { ...plan(), customItems: [{ id: 'local', label: '기타', bucket: 'resident' as const, amount: 1000 }, { id: 'other', label: '별도', bucket: 'resident' as const, amount: 500 }] };
    const next = adjustBudget(original, { from: 'local', to: 'housing', amount: 1000 }, {});
    expect(next.plans.housing).toBe(1000);
    expect(next.customItems).toEqual([{ ...original.customItems[0], amount: 0 }, original.customItems[1]]);
  });
  it('rejects safe integer addition overflow even with corrupt imported custom amounts', () => {
    const original = { ...plan(), customItems: [{ id: 'overflow', label: '기타', bucket: 'resident' as const, amount: Number.MAX_SAFE_INTEGER }] };
    expect(() => adjustBudget(original, { from: 'transport', to: 'overflow', amount: 1 }, {})).toThrow('이동 금액을 확인');
  });
  it('preserves totals and spending through consecutive and reverse transfers', () => {
    let next = plan(); const spent = { transport: 15000, lodging: 12000 };
    for (let i = 0; i < 50; i++) {
      next = adjustBudget(next, { ...transfer, amount: 1000 }, spent);
      expect(getPolicyLimit(next, 'resident')).toBe(500000);
    }
    next = adjustBudget(next, { from: 'housing', to: 'transport', amount: 38000 }, spent);
    expect(next.plans).toMatchObject({ housing: 12000, transport: 88000 });
    expect(spent).toEqual({ transport: 15000, lodging: 12000 });
  });
  it('persists adjusted final plans without replacing scheduled policies or adding PDF history', () => {
    const original = plan(); let book = confirmPolicyForPeriod({ versions: [] }, original, '2026-09');
    book = confirmPolicyForPeriod(book, original, '2026-10');
    const scheduled = structuredClone(book.versions[1]);
    const updated = confirmPolicyForPeriod(book, adjustBudget(original, transfer, {}), '2026-09');
    window.localStorage.clear(); savePolicyBook(window.localStorage, updated);
    const reloaded = loadPolicyBook(window.localStorage);
    const active = getEffectivePolicy(reloaded, new Date('2026-09-20T12:00:00+09:00'));
    expect(active.confirmed).toBe(true);
    expect(active.policy.plans).toMatchObject({ housing: 50000, transport: 50000 });
    expect(reloaded.versions[1]).toEqual(scheduled);
    const ledger = createEmptyLedger();
    expect(denormalizeAppState(normalizeAppState({ policyBook: updated, ledger, merchantRules: [] })).policyBook).toEqual(updated);
    expect(active.policy).not.toHaveProperty('adjustments');
  });
});
