type Props = {
  first: number;
  second: number;
  onChange: (index: 0 | 1, value: number) => void;
};

export function AlertThresholdSettings({ first, second, onChange }: Props) {
  return <section className="alert-thresholds">
    <label>첫 번째 경고 <b>{first}%</b><input aria-label="첫 번째 경고 기준" type="range" min="1" max="99" value={first} onChange={(event) => onChange(0, Number(event.target.value))} /></label>
    <label>두 번째 경고 <b>{second}%</b><input aria-label="두 번째 경고 기준" type="range" min="1" max="99" value={second} onChange={(event) => onChange(1, Number(event.target.value))} /></label>
    <small>각 슬라이더는 독립적으로 조절되며 첫 번째 경고는 두 번째 경고보다 낮게 유지됩니다.</small>
  </section>;
}
