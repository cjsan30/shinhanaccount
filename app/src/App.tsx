import { useState } from 'react';
import { CaretRight, ChatCircleDots, GearSix, ListBullets, X } from '@phosphor-icons/react';
import './App.css';

type Panel = 'resident' | 'study' | 'undecided' | 'recent' | 'settings' | 'payment' | null;
const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;
const resident = [['숙박비', 50000, 38900], ['식비', 200000, 88000], ['교통비', 250000, 88800]];
const study = [['학습공간 이용비', 200000, 77700]];

function Detail({ title, rows }: { title: string; rows: number[][] | string[][] | (string | number)[][] }) {
  return <section className="panel"><h2>{title} 상세</h2><div className="table"><div><span>항목</span><span>계획</span><span>사용</span><span>잔액</span></div>{rows.map(([name, plan, spent]) => <div key={String(name)}><strong>{name}</strong><span>{won(Number(plan))}</span><span>{won(Number(spent))}</span><span>{won(Number(plan) - Number(spent))}</span></div>)}</div></section>;
}
function Budget({ name, remaining, usage, onClick }: { name: string; remaining: number; usage: number; onClick: () => void }) {
  return <button className="budget" onClick={onClick} aria-label={`${name} 상세 보기`}><span><strong>{name}</strong><em>잔액 {won(remaining)}</em><CaretRight size={27} weight="bold" /></span><i><b style={{ width: `${usage}%` }} /></i><small>{usage.toFixed(1)}% 사용</small></button>;
}
function App() {
  const [panel, setPanel] = useState<Panel>(null); const [first, setFirst] = useState(50); const [second, setSecond] = useState(80); const [result, setResult] = useState('');
  const toggle = (next: Panel) => setPanel(panel === next ? null : next);
  return <main className="app"><header><h1>지원금 관리</h1><button aria-label="설정 열기" onClick={() => toggle('settings')}><GearSix size={39} /></button></header><section className="summary"><p>총 잔액</p><strong>406,600원</strong><span>700,000원 중 293,400원 사용 · 41.9%</span><i><b /></i></section><section className="budgets"><Budget name="정주비" remaining={284300} usage={43.1} onClick={() => toggle('resident')} /><Budget name="학습공간 지원비" remaining={122300} usage={38.9} onClick={() => toggle('study')} /></section><section className="quick"><h2>빠른 확인</h2><button onClick={() => toggle('undecided')}><i><ChatCircleDots size={29} /></i>미정 지출 1건<CaretRight size={25} /></button><button onClick={() => toggle('recent')}><i><ListBullets size={29} /></i>최근 결제 보기<CaretRight size={25} /></button></section>{panel === 'resident' && <Detail title="정주비" rows={resident} />}{panel === 'study' && <Detail title="학습공간 지원비" rows={study} />}{panel === 'undecided' && <section className="panel"><h2>미정 지출</h2><p>아직 지원금 분류가 확정되지 않은 결제입니다.</p><div className="item"><strong>분류 필요 결제</strong><span>2026. 7. 28 · 12,500원</span></div></section>}{panel === 'recent' && <section className="panel"><h2>최근 결제</h2><div className="item"><strong>삼성웰스토리 · 식비</strong><span>8,000원</span></div><div className="item"><strong>SR · 교통비</strong><span>47,800원</span></div></section>}{panel === 'settings' && <section className="panel"><h2>설정</h2><p>경고 기준은 지원금 구분별로 각각 적용됩니다.</p><label>첫 번째 경고 <b>{first}%</b><input aria-label="첫 번째 경고 기준" type="range" min="1" max="99" value={first} onChange={e => setFirst(+e.target.value)} /></label><label>두 번째 경고 <b>{second}%</b><input aria-label="두 번째 경고 기준" type="range" min="1" max="99" value={second} onChange={e => setSecond(+e.target.value)} /></label></section>}{panel === 'payment' && <section className="panel"><h2>새 결제 확인 <button aria-label="새 결제 확인 닫기" onClick={() => setPanel(null)}><X size={20} /></button></h2><p>문자 연동 전에는 이 화면에서 결제 내역을 확인하고 분류할 수 있습니다.</p><div className="item"><strong>삼성웰스토리(주)크래프톤정</strong><span>2026. 7. 24 · 8,000원</span></div><div className="choices"><button onClick={() => setResult('미정 지출로 저장했습니다.')}>미정으로 저장</button><button onClick={() => setResult('정주비 · 식비로 분류했습니다.')}>식비로 분류</button></div>{result && <p className="success">{result}</p>}</section>}<button className="primary" onClick={() => toggle('payment')}>새 결제 확인</button></main>;
}
export default App;