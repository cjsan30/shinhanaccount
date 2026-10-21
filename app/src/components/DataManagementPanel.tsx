import { normalizePolicyPeriod, type PolicyPeriod } from '../domain/budget';
import { getCurrentPeriodRange } from '../domain/periodSelectors';
import { useEffect, useRef, type ReactNode } from 'react';
import type { BackupPayload } from '../domain/backup';
import type { ImportResult, Ledger } from '../domain/ledger';
import type { ImportedCardTransaction } from '../domain/shinhanImport';
import { SHINHANHAE_PROFILES, getAlertTargets, getPolicyLimit, getSupportProfile, POLICY_ITEMS, type PolicyBook, type PolicyItem, type SupportPolicy, type SupportProfileId } from '../domain/policy';
import type { MerchantRule } from '../domain/merchantRules';
import { BackupRestore } from './BackupRestore';
import { DataIntegrityPanel } from './DataIntegrityPanel';
import { InformationSourceLink } from './AppInformation';

type Props = {
  now: Date;
  budgetAdjustment?: ReactNode;
  importFile: File | null;
  importTransactions: ImportedCardTransaction[] | null;
  importResult: ImportResult | null;
  importReading: boolean;
  importMessage: string | null;
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
  periodKey: string;
  period?: PolicyPeriod;
  onEditPolicy?: () => void;
  onUpdatePolicyPeriod?: (period: PolicyPeriod) => void;
  canUndoImport: boolean;
  onUndoImport: () => void;
  onResetData: (scopes: Array<'ledger' | 'rules' | 'policy'>) => void;
  onRestore: (payload: BackupPayload) => void;
  notify: (message: string) => void;
};

const won = (value: number) => `${value.toLocaleString('ko-KR')}원`;

export function DataManagementPanel(props: Props) {
  const policyDraftRef = useRef<HTMLDivElement>(null);
  const draftPeriodRange = getCurrentPeriodRange(props.now, props.policyDraft?.period);
  useEffect(() => {
    if (!props.policyDraft || !props.policyDraftFocusToken) return;
    requestAnimationFrame(() => policyDraftRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }));
  }, [props.policyDraft, props.policyDraftFocusToken]);
  return <section className="data-sections">
    <details className="data-section">
      <summary><strong>거래내역</strong><span>카드 CSV·Excel / 은행 PDF</span></summary>
      <div className="data-section__body import-card">
        <p>카드번호 또는 계좌번호 끝 4자리를 입력한 뒤 해당 파일을 가져옵니다. 현재 정책 기간 밖의 거래는 저장하지 않습니다.</p>
        <button className="sheet-action" onClick={props.onOpenImportGuide}>거래내역 가져오기</button>
      </div>
    </details>

    <details className="data-section">
      <summary><strong>자동 분류 규칙</strong><span>{props.merchantRules.length}/50개 저장됨</span></summary>
      <div className="data-section__body merchant-rule-card"><p>상호명 포함 또는 정확히 일치하는 조건을 관리합니다.</p><button className="sheet-action" onClick={props.onOpenRules}>규칙 관리</button></div>
    </details>

    <details className="data-section">
      <summary><strong>계획표</strong><span>텍스트 또는 이미지로 수정</span></summary>
      <div className="data-section__body policy-card">
        {props.budgetAdjustment}
        <p>정주비는 식비·교육비·교통비·주거비, 학습공간비는 카페·스터디카페·독서실입니다.</p><p>모바일 웹에서 계획표를 복사해 붙여넣으세요. 자동 확정하지 않으며, 아래 결과를 검토한 뒤 적용합니다.</p>
        <textarea aria-label="계획표 내용" value={props.policyText} onChange={(event) => props.onPolicyTextChange(event.target.value)} placeholder="예: 식비 200000원 교육비 160000원 교통비 140000원 카페 200000원" />
        {props.onEditPolicy && <button className="sheet-action secondary-action" onClick={props.onEditPolicy}>저장된 계획·기간 수정</button>}
        <button className="sheet-action" onClick={props.onReviewPolicy}>계획표 읽기</button>
        <button className="sheet-action secondary-action" onClick={props.onReadPolicyScreenshot}>스크린샷에서 읽기</button>
        {props.policyDraft && <div className="policy-preview" ref={policyDraftRef}><strong>검토 결과</strong><section className="policy-period-settings"><strong>매월 사용 가능 기간</strong>{(['startDay', 'endDay'] as const).map((field) => <label key={field}>{field === 'startDay' ? '시작일' : '종료일'}<select aria-label={`정책 기간 ${field === 'startDay' ? '시작일' : '종료일'}`} value={normalizePolicyPeriod(props.policyDraft?.period)[field]} onChange={(event) => props.onUpdatePolicyPeriod?.({ ...normalizePolicyPeriod(props.policyDraft?.period), [field]: Number(event.target.value) })}>{Array.from({ length: 31 }, (_, index) => <option key={index + 1} value={index + 1}>{index + 1}일</option>)}</select></label>)}<small>종료일이 시작일보다 이르면 다음 달까지 사용합니다. 없는 날짜는 월말로 맞춥니다.</small><small>이번 기간: {draftPeriodRange.start} ~ {draftPeriodRange.end}</small></section><label>지원 유형<select aria-label="정책 지원 유형" value={props.policyDraft.profileId} onChange={(event) => props.onUpdatePolicyProfile(event.target.value as SupportProfileId)}>{SHINHANHAE_PROFILES.map((profile) => <option key={profile.id} value={profile.id}>{profile.label}</option>)}</select></label><InformationSourceLink /><div className="policy-lines">
          <section className="policy-group"><h4>정주비 <span>{won(getPolicyLimit(props.policyDraft, 'resident'))} / {won(getSupportProfile(props.policyDraft.profileId).bucketLimits.resident)}</span></h4>{POLICY_ITEMS.filter((item) => item.bucket === 'resident').map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={props.policyDraft?.plans[item.key] ?? 0} onChange={(event) => props.onUpdatePolicyDraft(item.key, event.target.value)} /></label>)}</section>
          <section className="policy-group"><h4>학습공간비 <span>{won(getPolicyLimit(props.policyDraft, 'studySpace'))} / {won(getSupportProfile(props.policyDraft.profileId).bucketLimits.studySpace)}</span></h4>{POLICY_ITEMS.filter((item) => item.bucket === 'studySpace').map((item) => <label className="policy-amount" key={item.key}>{item.label}<input aria-label={`${item.label} 계획 금액`} type="number" inputMode="numeric" min="0" step="1000" value={props.policyDraft?.plans[item.key] ?? 0} onChange={(event) => props.onUpdatePolicyDraft(item.key, event.target.value)} /></label>)}</section>
          <strong>총 한도 {won(getPolicyLimit(props.policyDraft, 'resident') + getPolicyLimit(props.policyDraft, 'studySpace'))} / {won(getSupportProfile(props.policyDraft.profileId).totalLimit)}</strong>
        </div><section className="policy-alert-targets policy-alert-targets--review"><strong>잔액 경고 대상</strong><span>선택한 항목만 공통 경고 기준에 따라 알려드립니다.</span>{POLICY_ITEMS.filter((item) => props.policyDraft!.plans[item.key] > 0).map((item) => <label key={item.key}><input type="checkbox" checked={getAlertTargets(props.policyDraft!).includes(item.key)} onChange={() => props.onUpdatePolicyAlertTarget(item.key)} /><b>{item.label}</b><small>{won(props.policyDraft!.plans[item.key])}</small></label>)}</section><p className="policy-apply-note">이번 기간에 반영하면 기존 결제는 유지한 채 한도와 사용률만 다시 계산합니다.</p><button className="sheet-action" onClick={() => props.onConfirmPolicy('current')}>이번 기간에 바로 반영</button><button className="sheet-action secondary-action" onClick={() => props.onConfirmPolicy('next')}>다음 적용 기간부터 예약</button></div>}
      </div>
    </details>

    <details className="data-section">
      <summary><strong>백업 · 복원</strong><span>기기 변경과 초기화 대비</span></summary>
      <div className="data-section__body"><BackupRestore embedded ledger={props.ledger} policyBook={props.policyBook} merchantRules={props.merchantRules} onRestore={props.onRestore} notify={props.notify} /></div>
    </details>

    <DataIntegrityPanel ledger={props.ledger} periodKey={props.periodKey} period={props.period} canUndoImport={props.canUndoImport} onUndoImport={props.onUndoImport} onReset={props.onResetData} />
  </section>;
}
