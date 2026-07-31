import type { BudgetKey } from './budget';

export type CategoryKey = 'lodging' | 'food' | 'transport' | 'generalCafe';
export type SupportPolicy = {
  plans: Record<BudgetKey, Record<CategoryKey, number>>;
};

export const POLICY_STORAGE_KEY = 'shinhanhae-policy-v1';
export const defaultPolicy: SupportPolicy = {
  plans: {
    resident: { lodging: 50_000, food: 200_000, transport: 250_000, generalCafe: 0 },
    studySpace: { lodging: 0, food: 0, transport: 0, generalCafe: 200_000 },
  },
};

const fields: Array<[CategoryKey, RegExp]> = [
  ['lodging', /숙박비[\s\S]{0,80}?([\d,]+)\s*원?/],
  ['food', /식비[\s\S]{0,80}?([\d,]+)\s*원?/],
  ['transport', /교통비[\s\S]{0,80}?([\d,]+)\s*원?/],
  ['generalCafe', /(?:학습공간|카페)[\s\S]{0,80}?([\d,]+)\s*원?/],
];

export function parsePolicyText(text: string): SupportPolicy {
  const plans = structuredClone(defaultPolicy.plans);
  for (const [category, pattern] of fields) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = Number(match[1].replaceAll(',', ''));
    if (Number.isFinite(amount)) {
      const bucket: BudgetKey = category === 'generalCafe' ? 'studySpace' : 'resident';
      plans[bucket][category] = amount;
    }
  }
  return { plans };
}

export function getPolicyLimit(policy: SupportPolicy, bucket: BudgetKey) {
  return Object.values(policy.plans[bucket]).reduce((sum, amount) => sum + amount, 0);
}

export function loadPolicy(storage: Pick<Storage, 'getItem'>) {
  try { const raw = storage.getItem(POLICY_STORAGE_KEY); return raw ? JSON.parse(raw) as SupportPolicy : structuredClone(defaultPolicy); }
  catch { return structuredClone(defaultPolicy); }
}
export function savePolicy(storage: Pick<Storage, 'setItem'>, policy: SupportPolicy) { storage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policy)); }