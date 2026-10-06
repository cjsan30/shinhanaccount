import { getCategoryLimit, getPolicyItems, getSupportProfile, POLICY_ITEMS, type SupportPolicy } from './policy';

export type BudgetTransfer = { from: string; to: string; amount: number };

// Amounts are plan allocations, not transactions: a transfer must never change spending.
export function adjustBudget(policy: SupportPolicy, transfer: BudgetTransfer, spent: Readonly<Record<string, number>>): SupportPolicy {
  const items = getPolicyItems(policy);
  const from = items.filter((item) => item.key === transfer.from);
  const to = items.filter((item) => item.key === transfer.to);
  if (from.length !== 1 || to.length !== 1) throw new Error('예산을 이동할 항목을 다시 선택해 주세요.');
  if (transfer.from === transfer.to) throw new Error('서로 다른 항목을 선택해 주세요.');
  if (from[0].bucket !== to[0].bucket) throw new Error('같은 대분류 안에서만 예산을 이동할 수 있습니다.');
  if (!Number.isSafeInteger(transfer.amount) || transfer.amount <= 0) throw new Error('이동 금액은 1원 이상의 정수로 입력해 주세요.');
  const plans = items.map((item) => getCategoryLimit(policy, item.ledgerCategories[0]));
  if (plans.some((amount) => !Number.isSafeInteger(amount) || amount < 0)) throw new Error('저장된 계획 금액을 확인해 주세요.');
  const used = spent[from[0].ledgerCategories[0]] ?? 0;
  if (!Number.isSafeInteger(used) || used < 0) throw new Error('사용 금액을 확인한 뒤 다시 시도해 주세요.');
  const fromAmount = getCategoryLimit(policy, from[0].ledgerCategories[0]);
  const toAmount = getCategoryLimit(policy, to[0].ledgerCategories[0]);
  if (transfer.amount > Math.max(0, fromAmount - used)) throw new Error('가져올 항목의 미사용 예산을 초과할 수 없습니다.');
  const nextToAmount = toAmount + transfer.amount;
  if (!Number.isSafeInteger(nextToAmount)) throw new Error('이동 금액을 확인해 주세요.');
  const standardItem = POLICY_ITEMS.find((item) => item.key === transfer.to);
  if (standardItem && nextToAmount > getSupportProfile(policy.profileId).itemCaps[standardItem.key]) {
    throw new Error(`${standardItem.label}는 최대 ${getSupportProfile(policy.profileId).itemCaps[standardItem.key].toLocaleString('ko-KR')}원까지 설정할 수 있습니다.`);
  }
  const next = structuredClone(policy);
  for (const [item, amount] of [[from[0], fromAmount - transfer.amount], [to[0], nextToAmount]] as const) {
    const standard = POLICY_ITEMS.find((candidate) => candidate.key === item.key);
    if (standard) next.plans[standard.key] = amount;
    else next.customItems = next.customItems?.map((custom) => custom.id === item.key ? { ...custom, amount } : custom);
  }
  return next;
}
