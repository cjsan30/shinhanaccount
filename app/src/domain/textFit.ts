/** The budget name, remaining amount and arrow share one row only when all of them fit. */
export function budgetHeadingFits(rowWidth: number, nameWidth: number, amountWidth: number, iconWidth: number, gap: number) {
  return nameWidth + amountWidth + iconWidth + gap * 2 <= rowWidth;
}
/** Scale that keeps text on one line: 1 when it already fits, otherwise just small enough. */
export function fitScale(available: number, needed: number) {
  return needed <= available || available <= 0 ? 1 : Math.floor((available / needed) * 1000) / 1000;
}
