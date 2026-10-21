import { AlertThresholdSettings } from '../../components/AlertThresholdSettings';
import { SmsDiagnostics } from '../../components/SmsDiagnostics';

type Props = {
  card: string;
  showCard: boolean;
  onToggleShowCard: () => void;
  onCardChange: (rawValue: string) => void;
  paymentAlertsEnabled: boolean;
  budgetAlertsEnabled: boolean;
  onTogglePaymentAlerts: () => void;
  onToggleBudgetAlerts: () => void;
  thresholds: [number, number];
  onThresholdChange: (index: 0 | 1, value: number) => void;
  notify: (message: string) => void;
};

export function OperationsSettings({ card, showCard, onToggleShowCard, onCardChange, paymentAlertsEnabled, budgetAlertsEnabled, onTogglePaymentAlerts, onToggleBudgetAlerts, thresholds, onThresholdChange, notify }: Props) {
  return <section className="operations-settings">
    <p>결제 수신과 예산 경고를 관리합니다. 버튼 문구로 현재 사용 상태를 확인할 수 있습니다.</p>
    <label>카드 끝 4자리<input aria-label="카드 끝 4자리" type={showCard ? 'text' : 'password'} inputMode="numeric" maxLength={4} value={card} onChange={(event) => onCardChange(event.target.value)} /></label>
    {card.length !== 4 && <small className="card-configuration-hint">카드 4자리를 모두 입력하면 결제 알림 수신이 다시 시작됩니다.</small>}
    <button className="mask-toggle" type="button" onClick={onToggleShowCard}>{showCard ? '숨기기' : '보기'}</button>
    <button className={`sheet-action status-action ${paymentAlertsEnabled ? 'is-enabled' : ''}`} onClick={onTogglePaymentAlerts}>{paymentAlertsEnabled ? '결제 알림 수신 해제' : '결제 알림 수신 설정'}</button>
    <button className={`sheet-action status-action ${budgetAlertsEnabled ? 'is-enabled' : ''}`} onClick={onToggleBudgetAlerts}>{budgetAlertsEnabled ? '예산 경고 알림 해제' : '예산 경고 알림 설정'}</button>
    <AlertThresholdSettings first={thresholds[0]} second={thresholds[1]} onChange={onThresholdChange} />
    <SmsDiagnostics notify={notify} />
  </section>;
}
