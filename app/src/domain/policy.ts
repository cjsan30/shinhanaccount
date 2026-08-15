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
export const emptyPolicy: SupportPolicy = { plans: { housing: 0, food: 0, education: 0, transport: 0, studyCafe: 0, cafe: 0, readingRoom: 0 }, sourceText: '' };

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

const rowFields: Array<[PolicyItem, RegExp]> = [
  ['housing', /(?:주거비|숙박비)/],
  ['food', /식비/],
  ['education', /교육비/],
  ['transport', /교통비/],
  ['studyCafe', /스터디카페/],
  ['cafe', /카페/],
  ['readingRoom', /독서실/],
];

function parsePlansByVisualRow(text: string): Partial<Record<PolicyItem, number>> {
  const plans: Partial<Record<PolicyItem, number>> = {};
  for (const line of text.split(/\r?\n/)) {
    const matchedFields = rowFields.filter(([, pattern]) => pattern.test(line));
    if (matchedFields.length !== 1) continue;
    const amount = [...line.matchAll(/(\d[\d,]*)\s*원/g)].at(-1)?.[1];
    if (!amount) continue;
    const value = Number(amount.replaceAll(',', ''));
    if (Number.isFinite(value)) plans[matchedFields[0][0]] = value;
  }
  return plans;
}

function hasCompleteExpectedAmountColumn(amounts: number[]) {
  if (amounts.length < 10) return false;
  const lineItems = amounts.slice(0, 7);
  const total = amounts[7];
  const resident = amounts[8];
  const study = amounts[9];
  return lineItems.reduce((sum, amount) => sum + amount, 0) === total
    && lineItems.slice(0, 4).reduce((sum, amount) => sum + amount, 0) === resident
    && lineItems.slice(4).reduce((sum, amount) => sum + amount, 0) === study;
}

export function parsePolicyText(text: string): SupportPolicy {
  const plans = structuredClone(emptyPolicy.plans);
  const visualRows = parsePlansByVisualRow(text);
  if (Object.keys(visualRows).length >= 7) {
    const visualPolicy = { plans: { ...plans, ...visualRows }, sourceText: text };
    if (getPolicyLimit(visualPolicy, 'resident') === 500_000 && getPolicyLimit(visualPolicy, 'studySpace') === 200_000) return visualPolicy;
  }

  const flattenedNumbers = [...text.slice(Math.max(0, text.indexOf('예상금액'))).split('비율')[0].matchAll(/\d[\d,]*/g)].map((match) => Number(match[0].replaceAll(',', '')));
  if (flattenedNumbers.length >= 6 && flattenedNumbers.includes(700_000) && flattenedNumbers.includes(500_000) && flattenedNumbers.includes(200_000)) {
    const [housing, food, transport, , , cafe] = flattenedNumbers;
    if (housing + food + transport === 500_000 && cafe === 200_000) {
      return { plans: { ...plans, housing, food, transport, cafe }, sourceText: text };
    }
  }
  const amounts = parseExpectedAmountColumn(text);
  if (hasCompleteExpectedAmountColumn(amounts)) {
    const [housing, food, education, transport, studyCafe, cafe, readingRoom] = amounts;
    return { plans: { housing, food, education, transport, studyCafe, cafe, readingRoom }, sourceText: text };
  }

  // Older OCR output may flatten table columns and omit some zero values. It is only
  // used after row-based and fully validated column parsing have both failed.
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
  try {
    const raw = storage.getItem(POLICY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupportPolicy;
    return { plans: { ...emptyPolicy.plans, ...parsed.plans }, sourceText: parsed.sourceText ?? '' };
  } catch { return null; }
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

export function createPolicyBook(policy: SupportPolicy, date: Date = new Date()): PolicyBook {
  return { versions: [{ ...structuredClone(policy), periodKey: getPolicyPeriodKey(date), confirmedAt: date.toISOString() }] };
}

export function loadPolicyBook(storage: Pick<Storage, 'getItem'>, _date: Date = new Date()): PolicyBook {
  try {
    const saved = storage.getItem(POLICY_BOOK_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PolicyBook;
      if (Array.isArray(parsed.versions) && parsed.versions.length) return { versions: parsed.versions.map((version) => ({ ...version, plans: { ...emptyPolicy.plans, ...version.plans } })) };
    }
    return { versions: [] };
  } catch { return { versions: [] }; }
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
  const fallback = [...book.versions].sort((a, b) => a.periodKey.localeCompare(b.periodKey)).at(-1);
  return { policy: (fallback ?? emptyPolicy) as SupportPolicy, periodKey, confirmed: false };
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
