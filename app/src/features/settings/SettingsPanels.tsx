import { useState } from 'react';
import { CaretRight, Eye, EyeSlash } from '@phosphor-icons/react';
import { AlertThresholdSettings } from '../../components/AlertThresholdSettings';
import { withMailBody } from '../../domain/feedbackMail';

export type SettingsDestination = 'operations' | 'data' | 'accessibility' | 'verification' | 'information';

const FEEDBACK_MAIL = 'mailto:cjsan30@gmail.com?subject=%5B%EC%8B%A0%EC%B2%AD%ED%95%B4%20%EA%B3%84%EC%82%B0%EA%B8%B0%5D%20%ED%94%BC%EB%93%9C%EB%B0%B1';

/** Settings home (decision 2026-11-17): four entries as one-line titles and a small feedback row. */
export function SettingsHub({ onOpen, feedbackBody }: { onOpen: (destination: SettingsDestination) => void; feedbackBody?: () => Promise<string> }) {
  const sendFeedback = async (event: { preventDefault: () => void }) => {
    if (!feedbackBody) return;
    event.preventDefault();
    let body = '';
    try { body = await feedbackBody(); } catch { body = ''; }
    window.location.href = body ? withMailBody(FEEDBACK_MAIL, body) : FEEDBACK_MAIL;
  };
  return <section className="settings-hub">
    <button className="settings-destination" onClick={() => onOpen('operations')}><strong>카드 · 알림</strong><CaretRight size={22} /></button>
    <button className="settings-destination" onClick={() => onOpen('data')}><strong>데이터 관리</strong><CaretRight size={22} /></button>
    <button className="settings-destination" onClick={() => onOpen('accessibility')}><strong>접근성 · 개인화</strong><CaretRight size={22} /></button>
    {import.meta.env.MODE === 'internal' && <button className="settings-destination" onClick={() => onOpen('verification')}><strong>실기기 검증</strong><CaretRight size={22} /></button>}
    <button className="settings-destination" onClick={() => onOpen('information')}><strong>앱 안내 · 개인정보</strong><CaretRight size={22} /></button>
    <a className="settings-feedback" href={FEEDBACK_MAIL} onClick={(event) => { void sendFeedback(event); }}>피드백 보내기<CaretRight size={20} /></a>
  </section>;
}

/** 개인정보 처리 안내, shown under 앱 안내 on the same page. */
export function PrivacyNotice() {
  return <section className="privacy-notice">
    <h3 className="privacy-notice__title">개인정보 처리 안내</h3>
      <h3>결제 알림 처리</h3><p>삼성 메시지 또는 신한 SOL 알림 중 등록한 카드 끝 4자리와 일치하는 신한카드 승인 알림만 기기 안에서 처리합니다. <br />같은 승인이 두 앱에 표시되면 한 건으로 합칩니다. <br />거래 시각·금액·상호명·분류만 저장하며 원문 알림과 다른 대화는 저장·전송·삭제하지 않습니다.</p>
      <h3>저장과 보안</h3><p>거래·정책·자동 분류 규칙은 기기 내부 암호화 저장소에 보관합니다. <br />서버나 제3자 분석 서비스로 전송하지 않습니다.</p>
      <h3>권한과 대체 입력</h3><p>알림 접근은 Android 시스템 설정에서 언제든 해제할 수 있습니다. <br />자동 인식이 중단된 기간은 카드 CSV·Excel 또는 은행 PDF 가져오기 또는 직접 지출 등록으로 보완할 수 있습니다.</p>
      <h3>삭제와 백업</h3><p>개별 결제는 결제 상세에서 삭제할 수 있고, 앱 데이터 초기화 또는 앱 삭제 시 기기 내부 데이터가 삭제됩니다. <br />암호화 백업은 사용자가 직접 생성·관리합니다.</p>
      <a href="https://cjsan30.github.io/shinhanaccount/privacy-policy.html" target="_blank" rel="noreferrer">전체 개인정보처리방침 보기</a>
  </section>;
}

type OperationsSettingsProps = {
  card: string;
  showCard: boolean;
  onToggleShowCard: () => void;
  onCardChange: (rawValue: string) => void;
  account: string;
  onAccountChange: (rawValue: string) => void;
  paymentAlertsEnabled: boolean;
  budgetAlertsEnabled: boolean;
  onTogglePaymentAlerts: () => void;
  onToggleBudgetAlerts: () => void;
  thresholds: [number, number];
  onThresholdChange: (index: 0 | 1, value: number) => void;
};

export function OperationsSettings({ card, showCard, onToggleShowCard, onCardChange, account, onAccountChange, paymentAlertsEnabled, budgetAlertsEnabled, onTogglePaymentAlerts, onToggleBudgetAlerts, thresholds, onThresholdChange }: OperationsSettingsProps) {
  const [showAccount, setShowAccount] = useState(false);
  return <section className="operations-settings">
    <p>결제 수신과 예산 경고를 관리합니다. <br />버튼 문구로 현재 사용 상태를 확인할 수 있습니다.</p>
    <SecretDigitsField label="카드 끝 4자리" value={card} visible={showCard} onToggle={onToggleShowCard} onChange={onCardChange} />
    {card.length !== 4 && <small className="card-configuration-hint">카드 4자리를 모두 입력하면 결제 알림 수신이 다시 시작됩니다.</small>}
    <SecretDigitsField label="충전 계좌 끝 4자리 (선택)" inputLabel="충전 계좌 끝 4자리" value={account} visible={showAccount} onToggle={() => setShowAccount((current) => !current)} onChange={onAccountChange} />
    <button className={`sheet-action status-action ${paymentAlertsEnabled ? 'is-enabled' : ''}`} onClick={onTogglePaymentAlerts}>{paymentAlertsEnabled ? '결제 알림 수신 해제' : '결제 알림 수신 설정'}</button>
    <button className={`sheet-action status-action ${budgetAlertsEnabled ? 'is-enabled' : ''}`} onClick={onToggleBudgetAlerts}>{budgetAlertsEnabled ? '예산 경고 알림 해제' : '예산 경고 알림 설정'}</button>
    <AlertThresholdSettings first={thresholds[0]} second={thresholds[1]} onChange={onThresholdChange} />
  </section>;
}

/** Four masked digits with an eye button inside the field that shows or hides them. */
function SecretDigitsField({ label, inputLabel = label, value, visible, onToggle, onChange }: { label: string; inputLabel?: string; value: string; visible: boolean; onToggle: () => void; onChange: (rawValue: string) => void }) {
  return <label className="secret-digits">{label}
    <span className="secret-digits__field">
      <input aria-label={inputLabel} type={visible ? 'text' : 'password'} inputMode="numeric" maxLength={4} value={value} onChange={(event) => onChange(event.target.value)} />
      <button type="button" className="secret-digits__toggle" aria-label={`${inputLabel} ${visible ? '숨기기' : '보기'}`} aria-pressed={visible} onClick={(event) => { event.preventDefault(); onToggle(); }}>
        {visible ? <Eye size={22} aria-hidden="true" /> : <EyeSlash size={22} aria-hidden="true" />}
      </button>
    </span>
  </label>;
}
