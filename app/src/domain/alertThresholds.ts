export function clampAlertThreshold(index: 0 | 1, value: number, thresholds: [number, number]): [number, number] {
  const [first, second] = thresholds;
  const normalized = Math.max(1, Math.min(99, Math.round(value)));
  return index === 0
    ? [Math.min(normalized, second - 1), second]
    : [first, Math.max(normalized, first + 1)];
}
