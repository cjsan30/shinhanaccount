import { useEffect, useRef } from 'react';
import type { BackupPayload } from '../domain/backup';
import type { ImportResult, Ledger } from '../domain/ledger';
import type { ImportedCardTransaction } from '../domain/shinhanImport';
import { SHINHANHAE_PROFILES, getAlertTargets, getPolicyLimit, getSupportProfile, POLICY_ITEMS, type PolicyBook, type PolicyItem, type SupportPolicy, type SupportProfileId } from '../domain/policy';
import type { MerchantRule } from '../domain/merchantRules';
import { BackupRestore } from './BackupRestore';

type Props = {
  importFile: File | null;
  importTransactions: ImportedCardTransaction[] | null;
  importResult: ImportResult | null;
  hasMaskedCardWarning: boolean;
  policyText: string;
  policyDraft: SupportPolicy | null;
  policyDraftFocusToken: number;
  merchantRules: MerchantRule[];
  ledger: Ledger;
  policyBook: PolicyBook;
  onFileSelected: (file: File | null) => void;
  onPreviewImport: () => void;
  onApplyImport: () => void;
  onOpenImportGuide: () => void;
  onPolicyTextChange: (value: string) => void;
  onReviewPolicy: () => void;
  onReadPolicyScreenshot: () => void;
  onUpdatePolicyDraft: (item: PolicyItem, value: string) => void;
  onUpdatePolicyProfile: (profileId: SupportProfileId) => void;
  onUpdatePolicyAlertTarget: (item: PolicyItem) => void;
  onConfirmPolicy: (applyTo: 'current' | 'next') => void;
  onOpenRules: () => void;
  onRestore: (payload: BackupPayload) => void;
  notify: (message: string) => void;
};

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

export function DataManagementPanel(props: Props) {
  const policyDraftRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!props.policyDraft || !props.policyDraftFocusToken) return;
    requestAnimationFrame(() => policyDraftRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }, [props.policyDraft, props.policyDraftFocusToken]);
  return <section className="data-sections">
    <details className="data-section">
      <summary><strong>거래내역</strong><span>신한카드 엑셀 가져오기</span></summary>
      <div className="data-section__body import-card">
        <p>신한카드 앱에서 카드 하나만 선택해 내려받은 이용내역 엑셀(.xls/.xlsx)을 읽습니다.</p>
        <button className="sheet-action secondary-action" onClick={props.onOpenImportGuide}>거래내역 등록 가이드</button>
        <label className="file-picker">신한카드 엑셀 파일 선택<input aria-label="거래내역 파일" type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(event) => { props.onFileSelected(event.target.files?.[0] ?? null); event.currentTarget.value = ''; }} /></label>
        {props.importFile && <div className="import-preview"><strong className="import-file-name">{props.importFile.name}</strong><button className="sheet-action" onClick={props.onPreviewImport}>파일 읽기</button></div>}
        {props.importTransactions && <div className="import-preview">{props.hasMaskedCardWarning && <p className="import-warning">카드 번호가 일부 가려져 있습니다. 설정 카드 기준으로 일치하는 내역만 가져옵니다.</p>}<strong>{props.importTransactions.length}건 확인</strong><span>가져오기 전 자동 분류 결과를 확인한 뒤 적용합니다.</span><button className="sheet-action" onClick={props.onApplyImport}>내역 가져오기</button></div>}
        {props.importResult && <p className="success">신규 {props.importResult.imported}건 · 중복 {props.importResult.duplicates}건 · 제외 {props.importResult.excluded}건 · 미정 {props.importResult.undecided}건</p>}
      </div>
    </details>

    <details className="data-section">
      <summary><strong>자동 분류 규칙</strong><span>{props.merchantRules.length}/50개 저장됨</span></summary>
      <div className="data-section__body merchant-rule-card"><p>상호명 포함 또는 정확히 일치하는 조건을 관리합니다.</p><button className="sheet-action" onClick={props.onOpenRules}>규칙 관리</button></div>
    </details>

    <details className="data-section">
      <summary><strong>계획표</strong><span>텍스트 또는 이미지로 수정</span></summary>
      <div className="data-section__body policy-card">
        <p>모바일 웹에서 계획표를 복사해 붙여넣으세요. 자동 확정하지 않으며, 아래 결과를 검토한 뒤 적용합니다.</p>
        <textarea aria-label="계획표 내용" value={props.policyText} onChange={(event) => props.onPolicyTextChange(event.target.value)} placeholder="예: 숙박비 50,000원 · 식비 200,000원 · 교통비 250,000원 · 카페 200,000원" />
        <button className="sheet-action" onClick={props.onReviewPolicy}>계획표 읽기</button>
        <button className="sheet-action secondary-action" onClick={props.onReadPolicyScreenshot}>스크린샷에서 읽기</button>
        {props.policyDraft && <div className="policy-preview" ref={policyDraftRef}><strong>검토 결과</strong><label>지원 유형<select aria-label="정책 지원 유형" value={props.policyDraft.profileId} onChange={(event) => props.onUpdatePolicyProfile(event.target.value as SupportProfileId)}>{SHINHANHAE_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label><div className="policy-lines">
          <section className="policy-group"><h4>정주비 <span>{won(getPolicyLimit(props.policyDraft, 'resident'))} / {won(getSupportProfile(props.policyDraft.profileId).bucketLimits.resident)}</span></h4>{POLICY_ITEMS.filter((item) => item.bucket === 'resident').map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={props.policyDraft?.plans[item.key] ?? 0} onChange={(event) => props.onUpdatePolicyDraft(item.key, event.target.value)} /></label>)}</section>
          <section className="policy-group"><h4>학습공간비 <span>{won(getPolicyLimit(props.policyDraft, 'studySpace'))} / {won(getSupportProfile(props.policyDraft.profileId).bucketLimits.studySpace)}</span></h4>{POLICY_ITEMS.filter((item) => item.bucket === 'studySpace').map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={props.policyDraft?.plans[item.key] ?? 0} onChange={(event) => props.onUpdatePolicyDraft(item.key, event.target.value)} /></label>)}</section>
          <strong>총 한도 {won(getPolicyLimit(props.policyDraft, 'resident') + getPolicyLimit(props.policyDraft, 'studySpace'))} / {won(getSupportProfile(props.policyDraft.profileId).totalLimit)}</strong>
        </div><section className="policy-alert-targets"><strong>잔액 경고 대상</strong>{POLICY_ITEMS.filter((item) => props.policyDraft!.plans[item.key] > 0).map((item) => <label key={item.key}><input type="checkbox" checked={getAlertTargets(props.policyDraft!).includes(item.key)} onChange={() => props.onUpdatePolicyAlertTarget(item.key)} /> {item.label}</label>)}</section><p className="policy-apply-note">이번 기간에 반영하면 기존 결제는 유지한 채 한도와 사용률만 다시 계산합니다.</p><button className="sheet-action" onClick={() => props.onConfirmPolicy('current')}>이번 기간에 바로 반영</button><button className="sheet-action secondary-action" onClick={() => props.onConfirmPolicy('next')}>다음 적용 기간부터 예약</button></div>}
      </div>
    </details>

    <details className="data-section">
      <summary><strong>백업 · 복원</strong><span>기기 변경과 초기화 대비</span></summary>
      <div className="data-section__body"><BackupRestore embedded ledger={props.ledger} policyBook={props.policyBook} merchantRules={props.merchantRules} onRestore={props.onRestore} notify={props.notify} /></div>
    </details>
  </section>;
}
