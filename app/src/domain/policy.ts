import { getPolicyPeriodKey, type BudgetKey } from './budget';

export type PolicyItem = 'housing' | 'food' | 'education' | 'transport' | 'studyCafe' | 'cafe' | 'readingRoom';
export type SupportPolicy = { plans: Record<PolicyItem, number>; sourceText: string };
export type PolicyItemDefinition = { key: PolicyItem; bucket: BudgetKey; label: string; ledgerCategories: string[] };

export const POLICY_STORAGE_KEY = 'shinhanhae-policy-v1';
export const POLICY_ITEMS: PolicyItemDefinition[] = [
  { key: 'housing', bucket: 'resident', label: '주거비', ledgerCategories: ['lodging'] },
  { key: 'food', bucket: 'resident', label: '식비', ledgerCategories: ['food'] },
  { key: 'education', bucket: 'resident', label: '교육비', ledgerCategories: ['education'] },
  { key: 'transport', bucket: 'resident', label: '교통비', ledgerCategories: ['transport'] },
  { key: 'studyCafe', bucket: 'studySpace', label: '스터디카페', ledgerCategories: ['studyCafe'] },
  { key: 'cafe', bucket: 'studySpace', label: '카페', ledgerCategories: ['generalCafe'] },
  { key: 'readingRoom', bucket: 'studySpace', label: '독서실', ledgerCategories: ['readingRoom'] },
];
export const defaultPolicy: SupportPolicy = { plans: { housing: 50_000, food: 200_000, education: 0, transport: 250_000, studyCafe: 0, cafe: 200_000, readingRoom: 0 }, sourceText: '' };

const fields: Array<[PolicyItem, RegExp]> = [
  ['housing', /숙박비[\s\S]{0,80}?([\d,]+)\s*원?/],
  ['food', /(?:^|\n)식비[\s\S]{0,80}?([\d,]+)\s*원?/m],
  ['education', /교육비[\s\S]{0,80}?([\d,]+)\s*원?/],
  ['transport', /교통비[\s\S]{0,80}?([\d,]+)\s*원?/],
  ['studyCafe', /스터디카페[\s\S]{0,80}?([\d,]+)\s*원?/],
  ['cafe', /(?:^|\n)카페[\s\S]{0,80}?([\d,]+)\s*원?/m],
  ['readingRoom', /독서실[\s\S]{0,80}?([\d,]+)\s*원?/],
];

function parseExpectedAmountColumn(text: string): number[] {
  const start = text.indexOf('예상금액');
  if (start < 0) return [];
  const afterHeader = text.slice(start + '예상금액'.length);
  const firstRatio = afterHeader.indexOf('비율');
  const column = firstRatio >= 0 && firstRatio < 20 ? '' : afterHeader.slice(0, firstRatio >= 0 ? firstRatio : undefined);
  return [...column.matchAll(/\d[\d,]*/g)].map((match) => Number(match[0].replaceAll(',', ''))).filter(Number.isFinite);
}

export function parsePolicyText(text: string): SupportPolicy {
  const plans = structuredClone(defaultPolicy.plans);
  const amounts = parseExpectedAmountColumn(text);
  if (amounts.length >= 4) {
    plans.housing = amounts[0];
    plans.food = amounts[1];
    const trailing = amounts.slice(2);
    const totalIndex = trailing.findIndex((amount, index) => amount === amounts[0] + amounts[1] + trailing.slice(0, index).reduce((sum, value) => sum + value, 0));
    const lineItems = totalIndex >= 0 ? trailing.slice(0, totalIndex) : trailing;
    const nonZero = lineItems.filter((amount) => amount > 0);
    if (nonZero.length) { plans.transport = nonZero[0]; plans.cafe = nonZero.at(-1) ?? plans.cafe; }
    return { plans, sourceText: text };
  }
  for (const [item, pattern] of fields) {
    const match = text.match(pattern);
    if (!match) continue;
    const amount = Number(match[1].replaceAll(',', ''));
    if (Number.isFinite(amount)) plans[item] = amount;
  }
  return { plans, sourceText: text };
}

export function getPolicyLimit(policy: SupportPolicy, bucket: BudgetKey) {
  return POLICY_ITEMS.filter((item) => item.bucket === bucket).reduce((sum, item) => sum + policy.plans[item.key], 0);
}
export function loadPolicy(storage: Pick<Storage, 'getItem'>) {
  try { const raw = storage.getItem(POLICY_STORAGE_KEY); return raw ? { plans: { ...defaultPolicy.plans, ...(JSON.parse(raw) as SupportPolicy).plans }, sourceText: (JSON.parse(raw) as SupportPolicy).sourceText ?? '' } : structuredClone(defaultPolicy); }
  catch { return structuredClone(defaultPolicy); }
}
export function savePolicy(storage: Pick<Storage, 'setItem'>, policy: SupportPolicy) { storage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policy)); }
export type PolicyVersion = SupportPolicy & { periodKey: string; confirmedAt: string };
export type PolicyBook = { versions: PolicyVersion[] };
export const POLICY_BOOK_STORAGE_KEY = 'shinhanhae-policy-book-v1';

export function getNextPolicyPeriodKey(date: Date) {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + 10);
  return getPolicyPeriodKey(next);
}

export function createPolicyBook(policy: SupportPolicy = defaultPolicy, date: Date = new Date()): PolicyBook {
  return { versions: [{ ...structuredClone(policy), periodKey: getPolicyPeriodKey(date), confirmedAt: date.toISOString() }] };
}

export function loadPolicyBook(storage: Pick<Storage, 'getItem'>, date: Date = new Date()): PolicyBook {
  try {
    const saved = storage.getItem(POLICY_BOOK_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PolicyBook;
      if (Array.isArray(parsed.versions) && parsed.versions.length) return { versions: parsed.versions.map((version) => ({ ...version, plans: { ...defaultPolicy.plans, ...version.plans } })) };
    }
    return createPolicyBook(loadPolicy(storage), date);
  } catch { return createPolicyBook(defaultPolicy, date); }
}

export function savePolicyBook(storage: Pick<Storage, 'setItem'>, book: PolicyBook) {
  storage.setItem(POLICY_BOOK_STORAGE_KEY, JSON.stringify(book));
}

export function getPolicyVersion(book: PolicyBook, periodKey: string) {
  return book.versions.find((version) => version.periodKey === periodKey) ?? null;
}

export function getEffectivePolicy(book: PolicyBook, date: Date) {
  const periodKey = getPolicyPeriodKey(date);
  const exact = getPolicyVersion(book, periodKey);
  if (exact) return { policy: exact as SupportPolicy, periodKey, confirmed: true };
  const fallback = [...book.versions].sort((a, b) => a.periodKey.localeCompare(b.periodKey)).at(-1) ?? createPolicyBook(defaultPolicy, date).versions[0];
  return { policy: fallback as SupportPolicy, periodKey, confirmed: false };
}

export function confirmPolicyForPeriod(book: PolicyBook, policy: SupportPolicy, periodKey: string, confirmedAt: string = new Date().toISOString()): PolicyBook {
  const version: PolicyVersion = { ...structuredClone(policy), periodKey, confirmedAt };
  return { versions: [...book.versions.filter((candidate) => candidate.periodKey !== periodKey), version].sort((a, b) => a.periodKey.localeCompare(b.periodKey)) };
}
export function getCategoryLimit(policy: SupportPolicy, category: string) {
  const item = POLICY_ITEMS.find((candidate) => candidate.ledgerCategories.includes(category));
  return item ? policy.plans[item.key] : 0;
}
export function getCategoryLabel(category: string) {
  return POLICY_ITEMS.find((candidate) => candidate.ledgerCategories.includes(category))?.label ?? category;
}
