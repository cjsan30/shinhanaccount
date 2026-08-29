import { useState } from 'react';
import { SmsBridge, type SmsDiagnosticEvent } from '../native/smsBridge';
import { saveFile } from '../native/fileExport';

const stageLabels: Record<string, string> = {
  RECEIVER_ENTERED: 'SMS 수신기 진입',
  CARD_NOT_CONFIGURED: '카드 미설정',
  BODY_ASSEMBLED: '문자 조각 결합',
  MARKER_MISSING: '신한 승인 문구 없음',
  CARD_MISMATCH: '설정 카드 불일치',
  PARSE_FAILED: '문자 형식 해석 실패',
  DUPLICATE_SKIPPED: '중복 문자 제외',
  QUEUE_COMMITTED: '승인 대기열 저장',
  QUEUE_COMMIT_FAILED: '승인 대기열 저장 실패',
  NOTIFICATION_POSTED: '알림 생성',
  NOTIFICATION_FAILED: '알림 생성 실패',
  RECOVERY_PERMISSION_MISSING: '문자함 읽기 권한 없음',
  RECOVERY_SCAN_STARTED: '누락 문자 검색 시작',
  RECOVERY_SCAN_COMPLETED: '누락 문자 검색 완료',
  RECOVERY_SCAN_FAILED: '누락 문자 검색 실패',
  NOTIFICATION_LISTENER_ENTERED: '승인 알림 수신',
  NOTIFICATION_BODY_EXTRACTED: '승인 알림 본문 확인',
  NOTIFICATION_NO_NEW_APPROVAL: '새 승인 결제 없음',
};

const detailText = (event: SmsDiagnosticEvent) => [
  event.segmentCount !== undefined ? `조각 ${event.segmentCount}` : '',
  event.bodyLength !== undefined ? `길이 ${event.bodyLength}` : '',
  event.markerFound !== undefined ? `승인문구 ${event.markerFound ? '있음' : '없음'}` : '',
  event.cardMatched !== undefined ? `카드 ${event.cardMatched ? '일치' : '불일치'}` : '',
  event.queueSize !== undefined ? `대기 ${event.queueSize}건` : '',
  event.scannedCount !== undefined ? `검색 ${event.scannedCount}건` : '',
  event.matchedCount !== undefined ? `일치 ${event.matchedCount}건` : '',
  event.recoveredCount !== undefined ? `복구 ${event.recoveredCount}건` : '',
  event.sourceApp ? `출처 ${event.sourceApp}` : '',
  event.errorType ? `오류 ${event.errorType}` : '',
].filter(Boolean).join(' · ');

export function SmsDiagnostics({ notify }: { notify: (message: string) => void }) {
  const [items, setItems] = useState<SmsDiagnosticEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const result = await SmsBridge.getSmsDiagnostics();
      setItems([...result.items].sort((left, right) => right.recordedAt - left.recordedAt));
      setLoaded(true);
    } catch {
      notify('결제 수신 진단 이력을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };
  const clear = async () => {
    try {
      await SmsBridge.clearSmsDiagnostics();
      setItems([]);
      setLoaded(true);
      notify('결제 수신 진단 이력을 지웠습니다.');
    } catch {
      notify('결제 수신 진단 이력을 지우지 못했습니다.');
    }
  };
  const exportLog = async () => {
    if (!items.length) { notify('내보낼 진단 이력이 없습니다.'); return; }
    const content = [
      '신청해 계산기 결제 수신 진단 이력',
      '개인정보 보호: 원문 알림, 금액, 상호명, 카드번호는 포함하지 않습니다.',
      '',
      ...items.map((event) => [
        new Date(event.recordedAt).toISOString(),
        stageLabels[event.stage] ?? event.stage,
        event.status,
        detailText(event),
        `event:${event.eventId.slice(0, 8)}`,
      ].filter(Boolean).join(' | ')),
    ].join('\n');
    try {
      const result = await saveFile('shinhanhae_sms_diagnostics.txt', new TextEncoder().encode(content), 'text/plain;charset=utf-8');
      notify(`${result.fileName}을 ${result.relativePath}에 저장했습니다.`);
    } catch {
      notify('진단 이력을 내보내지 못했습니다.');
    }
  };

  return <section className="sms-diagnostics">
    <h3>결제 수신 진단 이력</h3>
    <p>삼성 메시지·신한 SOL·신한카드 승인 알림의 원문·금액·상호명·카드번호 없이 최근 처리 단계만 암호화 저장합니다.</p>
    <div className="sms-diagnostic-actions">
      <button className="sheet-action secondary-action" type="button" onClick={() => void refresh()} disabled={loading}>{loading ? '불러오는 중…' : '진단 이력 새로고침'}</button>
      <button className="sheet-action secondary-action" type="button" onClick={() => void exportLog()} disabled={!items.length}>진단 로그 내보내기</button>
      <button className="sheet-action secondary-action" type="button" onClick={() => void clear()}>진단 이력 지우기</button>
    </div>
    {loaded && (items.length ? <div className="sms-diagnostic-list">{items.map((event) => <article key={event.id} data-status={event.status}>
      <div><strong>{stageLabels[event.stage] ?? event.stage}</strong><time>{new Date(event.recordedAt).toLocaleString('ko-KR')}</time></div>
      {detailText(event) && <small>{detailText(event)}</small>}
      <code>{event.eventId.slice(0, 8)}</code>
    </article>)}</div> : <p className="sms-diagnostic-empty">저장된 진단 이력이 없습니다.</p>)}
  </section>;
}
