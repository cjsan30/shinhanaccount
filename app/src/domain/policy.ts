import { getPolicyPeriodKey, type BudgetKey } from './budget';
import { getPolicyPeriodRange, normalizePolicyPeriod, type PolicyPeriod } from './budget';

export type PolicyItem = 'housing' | 'food' | 'education' | 'transport' | 'studyCafe' | 'cafe' | 'readingRoom';
export type SupportProfileId = 'shinhanhae-70' | 'shinhanhae-40';
export type SupportProfile = { id: SupportProfileId; label: string; totalLimit: number; bucketLimits: Record<BudgetKey, number>; itemCaps: Record<PolicyItem, number> };
export type SupportPolicy = {
  period?: PolicyPeriod; plans: Record<PolicyItem, number>; sourceText: string; profileId?: SupportProfileId; alertTargets?: PolicyItem[]; customItems?: CustomPolicyItem[] };
export type PolicyItemDefinition = { key: PolicyItem; bucket: BudgetKey; label: string; ledgerCategories: string[] };
export type CustomPolicyItem = { id: string; label: string; bucket: BudgetKey; amount: number };

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
export const SHINHANHAE_PROFILES: SupportProfile[] = [
  { id: 'shinhanhae-70', label: '월 70만 원형', totalLimit: 700_000, bucketLimits: { resident: 500_000, studySpace: 200_000 }, itemCaps: { housing: 500_000, food: 200_000, education: 400_000, transport: 400_000, studyCafe: 200_000, cafe: 200_000, readingRoom: 200_000 } },
  { id: 'shinhanhae-40', label: '월 40만 원형', totalLimit: 400_000, bucketLimits: { resident: 200_000, studySpace: 200_000 }, itemCaps: { housing: 200_000, food: 80_000, education: 160_000, transport: 160_000, studyCafe: 200_000, cafe: 200_000, readingRoom: 200_000 } },
];
export const DEFAULT_SUPPORT_PROFILE_ID: SupportProfileId = 'shinhanhae-70';
export function getSupportProfile(id: SupportProfileId | undefined) { return SHINHANHAE_PROFILES.find((profile) => profile.id === id) ?? SHINHANHAE_PROFILES[0]; }
export const emptyPolicy: SupportPolicy = { plans: { housing: 0, food: 0, education: 0, transport: 0, studyCafe: 0, cafe: 0, readingRoom: 0 }, sourceText: '', profileId: DEFAULT_SUPPORT_PROFILE_ID, alertTargets: [], customItems: [] };
export type AnyPolicyItemDefinition = Omit<PolicyItemDefinition, 'key'> & { key: string };
export function getPolicyItems(policy: Pick<SupportPolicy, 'customItems'>): AnyPolicyItemDefinition[] {
  return [...POLICY_ITEMS, ...(policy.customItems ?? []).filter((item) => item.id.trim() && item.label.trim() && Number.isFinite(item.amount) && item.amount >= 0).map((item) => ({ key: item.id, label: item.label.trim(), bucket: item.bucket, ledgerCategories: [`custom:${item.id}`] }))];
}
export function getAlertTargets(policy: SupportPolicy) { return policy.alertTargets ?? POLICY_ITEMS.filter((item) => policy.plans[item.key] > 0).map((item) => item.key); }
export function validatePolicyAgainstProfile(policy: SupportPolicy) {
  const profile = getSupportProfile(policy.profileId);
  const resident = getPolicyLimit(policy, 'resident');
  const study = getPolicyLimit(policy, 'studySpace');
  const total = resident + study;
  const issues: string[] = [];
  if (resident !== profile.bucketLimits.resident) issues.push(`정주비 합계를 ${profile.bucketLimits.resident.toLocaleString()}원으로 맞춰 주세요.`);
  if (study !== profile.bucketLimits.studySpace) issues.push(`학습공간비 합계를 ${profile.bucketLimits.studySpace.toLocaleString()}원으로 맞춰 주세요.`);
  if (total !== profile.totalLimit) issues.push(`전체 합계를 ${profile.totalLimit.toLocaleString()}원으로 맞춰 주세요.`);
  for (const item of POLICY_ITEMS) {
    const amount = policy.plans[item.key];
    if (!Number.isFinite(amount) || amount < 0) issues.push(`${item.label} 항목은 0원 이상으로 설정해 주세요.`);
    else if (amount > profile.itemCaps[item.key]) issues.push(`${item.label}는 최대 ${profile.itemCaps[item.key].toLocaleString()}원까지 설정할 수 있습니다.`);
  }
  for (const item of policy.customItems ?? []) {
    if (!item.id.trim() || !item.label.trim() || !Number.isFinite(item.amount) || item.amount < 0) issues.push('사용자 정의 항목의 이름과 금액을 확인해 주세요.');
  }
  return issues;
}

export const POLICY_ITEM_ALIASES: Record<PolicyItem, readonly string[]> = {
  housing: ['주거비', '주거비용', '숙박비', '숙박비용', '숙박요금', '월세', '월세비', '임대료', '임차료'],
  food: ['식비', '식사비', '식사비용', '식대', '식료품비', '식료품비용'],
  education: ['교육비', '교육비용', '학원비', '수강료', '강의비', '강의료', '온라인강의료', '교재비', '도서구입비'],
  transport: ['교통비', '교통비용', '대중교통비', '버스비', '지하철비', '택시비', '기차비', '철도요금', '고속열차', '유류비', '주유비'],
  studyCafe: ['스터디카페', '스터디카페비', '스터디카페이용료', '스터디룸', '스터디룸이용료'],
  cafe: ['카페', '카페비', '카페이용료', '일반카페', '일반카페비', '일반카페이용료', '커피숍', '커피숍이용료'],
  readingRoom: ['독서실', '독서실비', '독서실이용료', '열람실', '열람실이용료'],
};
const aliasItems = new Map(Object.entries(POLICY_ITEM_ALIASES).flatMap(([key, aliases]) => aliases.map((alias) => [alias, key as PolicyItem] as const)));
// Longest labels first and whole Korean words only: 카페 must not match inside
// 스터디카페. Horizontal spaces allow OCR labels such as 스터디 카페 이용료.
const aliasPattern = [...aliasItems.keys()].sort((a, b) => b.length - a.length).map((alias) => [...alias].join('[\\t \\u00a0]*')).join('|');
function findPolicyLabels(text: string) {
  const pattern = new RegExp(`(?<![가-힣a-zA-Z])(${aliasPattern})(?![가-힣a-zA-Z])`, 'g');
  return [...text.matchAll(pattern)].map((match) => ({ item: aliasItems.get(match[0].replace(/[\t \u00a0]/g, ''))!, start: match.index, end: match.index + match[0].length }));
}
function parseLabeledPlans(text: string): Partial<Record<PolicyItem, number>> {
  const plans: Partial<Record<PolicyItem, number>> = {};
  const labels = findPolicyLabels(text);
  labels.forEach((label, index) => {
    const next = labels.slice(index + 1).find((candidate) => candidate.item !== label.item);
    // Do not borrow the next category's amount or a later total when this item
    // has no amount. Repeated synonymous labels belong to the same item.
    const segment = text.slice(label.end, next?.start ?? text.length).split(/소계|합계|총액|총\s*한도|예상금액|비율/)[0];
    const amount = segment.match(/(-?\d{1,3}(?:,\d{3})+|-?\d+(?:\.\d+)?)\s*(만원|천원|원)?/);
    if (amount) {
      const value = Number(amount[1].replaceAll(',', '')) * (amount[2] === '만원' ? 10_000 : amount[2] === '천원' ? 1_000 : 1);
      if (Number.isSafeInteger(value) && value >= 0 && !/^\s*%/.test(segment.slice((amount.index ?? 0) + amount[0].length))) plans[label.item] = value;
    } else if (/직접\s*입력/.test(segment)) plans[label.item] = 0;
  });
  return plans;
}

function parseExpectedAmountColumn(text: string): number[] {
  const start = text.indexOf('예상금액');
  if (start < 0) return [];
  const afterHeader = text.slice(start + '예상금액'.length);
  const firstRatio = afterHeader.indexOf('비율');
  const column = firstRatio >= 0 && firstRatio < 20 ? '' : afterHeader.slice(0, firstRatio >= 0 ? firstRatio : undefined);
  return [...column.matchAll(/\d[\d,]*/g)].map((match) => Number(match[0].replaceAll(',', ''))).filter(Number.isFinite);
}

function parseVisualRowAmount(line: string) {
  if (/(?:^|\s)-\s*\d|만원|천원/.test(line)) return null;
  const explicitWon = [...line.matchAll(/(\d{1,3}(?:,\d{3})+|\d+)\s+원/g)].map((match) => match[1]);
  const commaAmounts = [...line.matchAll(/(?:^|\D)(\d{1,3}(?:,\d{3})+)(?=\D|$)/g)].map((match) => match[1]);
  const candidates = [...new Set([...explicitWon, ...commaAmounts])]
    .map((amount) => Number(amount.replaceAll(',', '')))
    .filter(Number.isFinite);
  if (candidates.length) return Math.max(...candidates);
  return /직접입력/.test(line) ? 0 : null;
}

function parsePlansByVisualRow(text: string): Partial<Record<PolicyItem, number>> {
  const plans: Partial<Record<PolicyItem, number>> = {};
  for (const line of text.split(/\r?\n/)) {
    const matchedFields = [...new Set(findPolicyLabels(line).map((label) => label.item))];
    if (matchedFields.length !== 1) continue;
    const amount = parseVisualRowAmount(line);
    if (amount !== null) plans[matchedFields[0]] = amount;
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
    return visualPolicy;
  }

  const flattenedNumbers = [...text.slice(Math.max(0, text.indexOf('예상금액'))).split('비율')[0].matchAll(/\d[\d,]*/g)].map((match) => Number(match[0].replaceAll(',', '')));
  if (text.includes('예상금액') && flattenedNumbers.length >= 6 && flattenedNumbers.includes(700_000) && flattenedNumbers.includes(500_000) && flattenedNumbers.includes(200_000)) {
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

  Object.assign(plans, visualRows, parseLabeledPlans(text));
  return { plans, sourceText: text };
}
export function getPolicyLimit(policy: SupportPolicy, bucket: BudgetKey) {
  const validAmount = (amount: number) => Number.isFinite(amount) ? Math.max(0, amount) : 0;
  return POLICY_ITEMS.filter((item) => item.bucket === bucket).reduce((sum, item) => sum + validAmount(policy.plans[item.key]), 0) + (policy.customItems ?? []).filter((item) => item.bucket === bucket && item.id.trim() && item.label.trim()).reduce((sum, item) => sum + validAmount(item.amount), 0);
}
export function loadPolicy(storage: Pick<Storage, 'getItem'>) {
  try {
    const raw = storage.getItem(POLICY_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SupportPolicy;
    return { plans: { ...emptyPolicy.plans, ...parsed.plans }, sourceText: parsed.sourceText ?? '', ...(parsed.period ? { period: normalizePolicyPeriod(parsed.period) } : {}), profileId: parsed.profileId ?? DEFAULT_SUPPORT_PROFILE_ID, alertTargets: parsed.alertTargets ?? [], ...(parsed.customItems?.length ? { customItems: parsed.customItems } : {}) };
  } catch { return null; }
}
export function savePolicy(storage: Pick<Storage, 'setItem'>, policy: SupportPolicy) { storage.setItem(POLICY_STORAGE_KEY, JSON.stringify(policy)); }
export type PolicyVersion = SupportPolicy & { periodKey: string; confirmedAt: string };
export type PolicyBook = { versions: PolicyVersion[]; mode?: 'not-applicant' };
export const POLICY_BOOK_STORAGE_KEY = 'shinhanhae-policy-book-v1';

export function getNextPolicyPeriodKey(date: Date, period?: PolicyPeriod) {
  const [year, month] = getPolicyPeriodKey(date, period).split('-').map(Number);
  const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  return `${next.year}-${String(next.month).padStart(2, '0')}`;
}

export function createPolicyBook(policy: SupportPolicy, date: Date = new Date()): PolicyBook {
  return { versions: [{ ...structuredClone(policy), periodKey: getPolicyPeriodKey(date, policy.period), confirmedAt: date.toISOString() }] };
}

export function loadPolicyBook(storage: Pick<Storage, 'getItem'>, _date: Date = new Date()): PolicyBook {
  try {
    const saved = storage.getItem(POLICY_BOOK_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as PolicyBook;
      if (Array.isArray(parsed.versions)) return { ...(parsed.mode ? { mode: parsed.mode } : {}), versions: parsed.versions.map((version) => ({ ...version, ...(version.period ? { period: normalizePolicyPeriod(version.period) } : {}), plans: { ...emptyPolicy.plans, ...version.plans }, profileId: version.profileId ?? DEFAULT_SUPPORT_PROFILE_ID, alertTargets: version.alertTargets ?? [], ...(version.customItems?.length ? { customItems: version.customItems } : {}) })) };
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
  if (book.mode === 'not-applicant') return { policy: emptyPolicy, periodKey: getPolicyPeriodKey(date), confirmed: true };
  const localDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Seoul' }).format(date);
  const eligible = book.versions.filter((version) => getPolicyPeriodRange(version.periodKey, version.period).start <= localDate);
  const fallback = [...eligible].sort((a, b) => getPolicyPeriodRange(a.periodKey, a.period).start.localeCompare(getPolicyPeriodRange(b.periodKey, b.period).start) || a.confirmedAt.localeCompare(b.confirmedAt)).at(-1);
  const periodKey = getPolicyPeriodKey(date, fallback?.period);
  const exact = eligible.find((version) => version.periodKey === periodKey && getPolicyPeriodKey(date, version.period) === periodKey);
  // Older test builds could persist an all-zero draft as a "confirmed" policy.
  // An exact version is usable only when it satisfies the selected support profile;
  // otherwise the user must return to onboarding and confirm a real plan.
  if (exact && validatePolicyAgainstProfile(exact).length === 0) {
    return { policy: exact as SupportPolicy, periodKey, confirmed: true };
  }
  return { policy: (fallback ?? emptyPolicy) as SupportPolicy, periodKey, confirmed: false };
}

export function confirmPolicyForPeriod(book: PolicyBook, policy: SupportPolicy, periodKey: string, confirmedAt: string = new Date().toISOString()): PolicyBook {
  const version: PolicyVersion = { ...structuredClone(policy), periodKey, confirmedAt };
  return { versions: [...book.versions.filter((candidate) => candidate.periodKey !== periodKey), version].sort((a, b) => a.periodKey.localeCompare(b.periodKey)) };
}
export function getCategoryLimit(policy: SupportPolicy, category: string) {
  const item = POLICY_ITEMS.find((candidate) => candidate.ledgerCategories.includes(category));
  if (item) return policy.plans[item.key];
  const custom = (policy.customItems ?? []).find((candidate) => `custom:${candidate.id}` === category);
  return custom?.amount ?? 0;
}
export function getCategoryLabel(category: string, policy?: SupportPolicy) {
  return POLICY_ITEMS.find((candidate) => candidate.ledgerCategories.includes(category))?.label
    ?? policy?.customItems?.find((candidate) => `custom:${candidate.id}` === category)?.label
    ?? category;
}
