import { useState } from 'react';

type Props = {
  first: number;
  second: number;
  onChange: (index: 0 | 1, value: number) => void;
};

export function AlertThresholdSettings({ first, second, onChange }: Props) {
  const [editing, setEditing] = useState(false);
  const presets = [{ label: '빠른 경고', values: [40, 70] }, { label: '기본', values: [50, 80] }, { label: '여유', values: [70, 90] }] as const;
  const apply = (values: readonly [number, number]) => { onChange(0, values[0]); onChange(1, values[1]); setEditing(false); };
  return <section className="alert-thresholds"><div className="alert-thresholds__summary"><div><strong>경고 기준</strong><span>사용 {first}% · {second}% 시, 잔액 {100 - first}% · {100 - second}% 안내</span></div><button type="button" onClick={() => setEditing((current) => !current)}>{editing ? '닫기' : '변경'}</button></div>{editing && <div className="alert-thresholds__editor"><div className="alert-thresholds__presets">{presets.map((preset) => <button type="button" key={preset.label} className={first === preset.values[0] && second === preset.values[1] ? 'is-selected' : ''} onClick={() => apply(preset.values)}>{preset.label}<small>{preset.values[0]}% · {preset.values[1]}%</small></button>)}</div><details><summary>직접 설정</summary><label>첫 번째 경고 <b>{first}%</b><input aria-label="첫 번째 경고 기준" type="range" min="1" max="99" value={first} onChange={(event) => onChange(0, Number(event.target.value))} /></label><label>두 번째 경고 <b>{second}%</b><input aria-label="두 번째 경고 기준" type="range" min="1" max="99" value={second} onChange={(event) => onChange(1, Number(event.target.value))} /></label></details></div>}</section>;
}
