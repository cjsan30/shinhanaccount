import type { ManualClassification } from './ledger';
import { classifyPayment, type PaymentClassification } from './sms';

export type MerchantRule = ManualClassification & { id: string; merchant: string; normalizedMerchant: string; createdAt: string };
export const MERCHANT_RULES_STORAGE_KEY = 'shinhanhae-merchant-rules-v1';

export function normalizeMerchant(merchant: string) { return merchant.toLowerCase().replace(/[\s().,]/g, ''); }
export function createMerchantRule(merchant: string, classification: ManualClassification, createdAt = new Date().toISOString()): MerchantRule {
  const normalizedMerchant = normalizeMerchant(merchant);
  if (!normalizedMerchant) throw new Error('상호명을 입력해 주세요.');
  return { id: crypto.randomUUID(), merchant: merchant.trim(), normalizedMerchant, ...classification, createdAt };
}
// Rules are forward-only: existing ledger entries remain untouched.
export function classifyWithMerchantRules(merchant: string, amount: number, rules: MerchantRule[]): PaymentClassification {
  const normalized = normalizeMerchant(merchant);
  const matched = [...rules].filter((rule) => rule.normalizedMerchant === normalized).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
  return matched ? { status: 'classified', bucket: matched.bucket, category: matched.category as 'lodging' | 'food' | 'education' | 'transport' | 'studyCafe' | 'generalCafe' | 'readingRoom' } : classifyPayment(merchant, amount);
}
export function loadMerchantRules(storage: Pick<Storage, 'getItem'>): MerchantRule[] { try { const raw = storage.getItem(MERCHANT_RULES_STORAGE_KEY); return raw ? JSON.parse(raw) as MerchantRule[] : []; } catch { return []; } }
export function saveMerchantRules(storage: Pick<Storage, 'setItem'>, rules: MerchantRule[]) { storage.setItem(MERCHANT_RULES_STORAGE_KEY, JSON.stringify(rules)); }