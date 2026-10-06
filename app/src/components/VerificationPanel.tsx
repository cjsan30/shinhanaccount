import { useMemo, useState } from 'react';
import type { Ledger } from '../domain/ledger';
import type { PolicyBook } from '../domain/policy';
import type { ReportEvidenceRecord } from '../domain/reportEvidence';
import { buildAutomaticChecks, createVerificationState, manualChecks, sanitizeVerificationNote, verificationReport, type VerificationDecision, type VerificationState } from '../domain/verification';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { saveFile } from '../native/fileExport';

type Props = {
  storageReady: boolean;
  storageError: boolean;
  policyBook: PolicyBook;
  ledger: Ledger;
  evidence: ReportEvidenceRecord[];
  value?: VerificationState;
  onChange: (next: VerificationState) => void;
  notify: (message: string) => void;
};

const formatTime = (value?: string) => value ? new Date(value).toLocaleString('ko-KR') : '아직 확정하지 않음';

export function VerificationPanel(props: Props) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const value = props.value ?? createVerificationState();
  const automatic = useMemo(() => buildAutomaticChecks({ storageReady: props.storageReady, storageError: props.storageError, policyBook: props.policyBook, ledger: props.ledger, evidence: props.evidence }), [props.evidence, props.ledger, props.policyBook, props.storageError, props.storageReady]);
  const snapshot = () => props.onChange({ ...value, automatic: Object.fromEntries(automatic.map((check) => [check.id, check.evidence])) });
  const decide = (id: string, status: VerificationDecision['status']) => {
    const note = sanitizeVerificationNote(notes[id] ?? '');
    props.onChange({ ...value, decisions: { ...value.decisions, [id]: { status, decidedAt: new Date().toISOString(), ...(note ? { note } : {}) } } });
  };
  const exportReport = async () => {
    try {
      const info = Capacitor.isNativePlatform() ? await NativeApp.getInfo() : null;
      const content = verificationReport(value, automatic, { version: info ? `${info.version} (빌드 ${info.build}; ${import.meta.env.MODE})` : `웹 (${import.meta.env.MODE})`, platform: Capacitor.getPlatform() });
      const result = await saveFile('shinhanhae_device_verification.txt', new TextEncoder().encode(content), 'text/plain;charset=utf-8');
      props.notify(`${result.fileName}을 ${result.relativePath}에 저장했습니다.`);
    } catch {
      props.notify('검증 결과를 내보내지 못했습니다.');
    }
  };

  return <section className="verification-panel">
    <p>내부 테스트 전용 화면입니다. 자동 확인은 앱의 저장된 결과만 요약하며, 알림·위젯·PDF 품질처럼 화면 확인이 필요한 항목은 Yes 또는 No로 확정하세요. 메모에는 상호명·금액·카드·계좌번호를 적지 마세요.</p>
    <section className="verification-summary" aria-label="검증 현황">
      <strong>자동 통과 {automatic.filter((check) => check.evidence.passed).length}/{automatic.length}</strong>
      <strong>사용자 통과 {Object.values(value.decisions).filter((decision) => decision.status === 'passed').length}/{manualChecks.length}</strong>
    </section>
    <section className="verification-section">
      <div className="verification-section__heading"><h3>자동 확인</h3><button className="sheet-action secondary-action" type="button" onClick={snapshot}>현재 상태 기록</button></div>
      {automatic.map((check) => <article className="verification-item" key={check.id} data-status={check.evidence.passed ? 'passed' : 'pending'}>
        <div><strong>{check.title}</strong><span>{check.evidence.passed ? '자동 통과' : '자동 근거 없음'}</span></div>
        <p>{check.description}</p><small>{check.evidence.summary} · {formatTime(check.evidence.observedAt)}</small>
      </article>)}
    </section>
    <section className="verification-section">
      <h3>사용자 확정</h3>
      {manualChecks.map((check) => {
        const decision = value.decisions[check.id];
        return <article className="verification-item verification-item--manual" key={check.id} data-status={decision?.status ?? 'pending'}>
          <div><strong>{check.title}</strong><span>{decision?.status === 'passed' ? 'Yes · 통과' : decision?.status === 'failed' ? 'No · 실패' : '미확정'}</span></div>
          <p>{check.description}</p>
          <div className="verification-item__actions"><button type="button" className="sheet-action verification-pass" onClick={() => decide(check.id, 'passed')}>Yes · 통과</button><button type="button" className="sheet-action secondary-action verification-fail" onClick={() => decide(check.id, 'failed')}>No · 실패</button></div>
          {decision?.status === 'failed' && <label>실패 메모<textarea aria-label={`${check.title} 실패 메모`} value={notes[check.id] ?? decision.note ?? ''} onChange={(event) => setNotes({ ...notes, [check.id]: event.target.value })} onBlur={() => decide(check.id, 'failed')} placeholder="재현 조건 또는 화면 이상만 간단히 기록 (개인정보 제외)" maxLength={240} /></label>}
          <small>최종 판정: {formatTime(decision?.decidedAt)}</small>
        </article>;
      })}
    </section>
    <div className="verification-panel__footer"><button className="sheet-action" type="button" onClick={() => { void exportReport(); }}>검증 결과 내보내기</button><button className="sheet-action secondary-action" type="button" onClick={() => props.onChange(createVerificationState())}>검증 이력 초기화</button></div>
  </section>;
}
