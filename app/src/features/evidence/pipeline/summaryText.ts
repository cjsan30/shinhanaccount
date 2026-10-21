const won = (value: number) => `${Math.max(0, value).toLocaleString('ko-KR')}원`;

/** The remaining-budget phrase under the total on the summary page. */
export function summaryRemainLabel(totalBudget: number, totalUsed: number) {
  // Without a confirmed plan the total is 0원; that is not an exhausted budget.
  if (totalBudget <= 0) return '확정된 계획 없음';
  const remain = totalBudget - totalUsed;
  return remain > 0 ? `잔액 ${won(remain)}` : '지원금 소진';
}
