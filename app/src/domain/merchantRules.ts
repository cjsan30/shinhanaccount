import type { ManualClassification } from './ledger';
import type { AnyPolicyItemDefinition } from './policy';
import type { PaymentClassification } from './sms';

export type MerchantMatchMode = 'contains' | 'exact';
export type MerchantRule = ManualClassification & {
  id: string;
  merchant: string;
  normalizedMerchant: string;
  matchMode?: MerchantMatchMode;
  alias?: string;
  createdAt: string;
};
export const MERCHANT_RULES_STORAGE_KEY = 'shinhanhae-merchant-rules-v1';

export function normalizeMerchant(merchant: string) { return merchant.toLowerCase().replace(/[\s().,]/g, ''); }
export function createMerchantRule(merchant: string, classification: ManualClassification, createdAt = new Date().toISOString(), matchMode: MerchantMatchMode = 'contains', alias = ''): MerchantRule {
  const normalizedMerchant = normalizeMerchant(merchant);
  if (!normalizedMerchant) throw new Error('상호명을 입력해 주세요.');
  return { id: crypto.randomUUID(), merchant: merchant.trim(), normalizedMerchant, matchMode, alias: alias.trim() || undefined, ...classification, createdAt };
}
export function getMerchantAlias(merchant: string, rules: MerchantRule[]) {
  const normalized = normalizeMerchant(merchant);
  return [...rules]
    .filter((rule) => Boolean(rule.alias) && ((rule.matchMode ?? 'contains') === 'exact' ? rule.normalizedMerchant === normalized : normalized.includes(rule.normalizedMerchant)))
    .sort((a, b) => Number((b.matchMode ?? 'contains') === 'exact') - Number((a.matchMode ?? 'contains') === 'exact') || b.normalizedMerchant.length - a.normalizedMerchant.length)[0]?.alias;
}
const isExactRule = (rule: MerchantRule) => (rule.matchMode ?? 'contains') === 'exact';
// Exact rules win, then the longest keyword, then the newest rule.
const compareRulePriority = (a: MerchantRule, b: MerchantRule) =>
  Number(isExactRule(b)) - Number(isExactRule(a)) || b.normalizedMerchant.length - a.normalizedMerchant.length || b.createdAt.localeCompare(a.createdAt);
// Rules are forward-only: existing ledger entries remain untouched.
export function classifyWithMerchantRules(merchant: string, rules: MerchantRule[]): PaymentClassification {
  const normalized = normalizeMerchant(merchant);
  const matched = [...rules]
    .filter((rule) => isExactRule(rule) ? rule.normalizedMerchant === normalized : normalized.includes(rule.normalizedMerchant))
    .sort(compareRulePriority)[0];
  return matched ? { status: 'classified', bucket: matched.bucket, category: matched.category as 'lodging' | 'food' | 'education' | 'transport' | 'studyCafe' | 'generalCafe' | 'readingRoom' } : { status: 'undecided' };
}

/** A rule as the native notification listener uses it while the app is closed. */
export type NativeMerchantRule = { merchant: string; exact: boolean; category: string; label: string };
/**
 * Rules in priority order, so native code only takes the first match and never decides priority itself.
 * `category` is empty when the rule's bucket and category belong to no budget item: such a payment
 * counts toward no item here, so native code raises no alert but must still stop at that rule.
 */
export function buildNativeRuleSnapshot(rules: MerchantRule[], items: AnyPolicyItemDefinition[]): NativeMerchantRule[] {
  return [...rules].sort(compareRulePriority).map((rule) => {
    const item = items.find((candidate) => candidate.bucket === rule.bucket && candidate.ledgerCategories.includes(rule.category));
    return { merchant: rule.normalizedMerchant, exact: isExactRule(rule), category: item ? rule.category : '', label: item?.label ?? '' };
  });
}
export function loadMerchantRules(storage: Pick<Storage, 'getItem'>): MerchantRule[] { try { const raw = storage.getItem(MERCHANT_RULES_STORAGE_KEY); return raw ? JSON.parse(raw) as MerchantRule[] : []; } catch { return []; } }
export function saveMerchantRules(storage: Pick<Storage, 'setItem'>, rules: MerchantRule[]) { storage.setItem(MERCHANT_RULES_STORAGE_KEY, JSON.stringify(rules)); }
