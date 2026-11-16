import type { SmsDiagnosticEvent } from '../native/smsBridge';

const STAGE_LABELS: Record<string, string> = {
  RECEIVER_ENTERED: 'SMS 수신기 진입',
  CARD_NOT_CONFIGURED: '카드 미설정',
  BODY_ASSEMBLED: '문자 조각 결합',
  MARKER_MISSING: '신한 승인 문구 없음',
  CARD_MISMATCH: '설정 카드 불일치',
  PARSE_FAILED: '형식 해석 실패',
  DUPLICATE_SKIPPED: '중복 제외',
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
  NOTIFICATION_GROUP_SUMMARY_SKIPPED: '묶음 알림 요약 건너뜀',
};

const STATUS_LABELS: Record<SmsDiagnosticEvent['status'], string> = { info: '기록', success: '처리', ignored: '무시', skipped: '건너뜀', blocked: '막힘', error: '오류' };

/** Counts and flags only; the source app name is left out of anything sent. */
function detail(event: SmsDiagnosticEvent) {
  return [
    event.segmentCount !== undefined ? `조각 ${event.segmentCount}` : '',
    event.bodyLength !== undefined ? `길이 ${event.bodyLength}` : '',
    event.markerFound !== undefined ? `승인문구 ${event.markerFound ? '있음' : '없음'}` : '',
    event.cardMatched !== undefined ? `카드 ${event.cardMatched ? '일치' : '불일치'}` : '',
    event.queueSize !== undefined ? `대기 ${event.queueSize}건` : '',
    event.scannedCount !== undefined ? `검색 ${event.scannedCount}건` : '',
    event.matchedCount !== undefined ? `일치 ${event.matchedCount}건` : '',
    event.recoveredCount !== undefined ? `복구 ${event.recoveredCount}건` : '',
    event.errorType ? `오류 ${event.errorType}` : '',
  ].filter(Boolean).join(' · ');
}

const DAY = 24 * 60 * 60 * 1000;
export const FEEDBACK_DIAGNOSTIC_DAYS = 7;
export const FEEDBACK_DIAGNOSTIC_LINES = 30;

/** MM-DD HH:mm in Korea time. */
const koreaTime = (time: number) => {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(time)).map((part) => [part.type, part.value]));
  return `${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
};

/**
 * Payment-notification records worth sending with feedback: the last 7 days, newest first,
 * at most 30 lines. Notifications from other apps are never part of it (decision 2026-11-17).
 */
export function feedbackDiagnosticLines(events: SmsDiagnosticEvent[], now: number): string[] {
  return events
    .filter((event) => event.stage !== 'NOTIFICATION_SOURCE_UNSUPPORTED' && now - event.recordedAt <= FEEDBACK_DIAGNOSTIC_DAYS * DAY && event.recordedAt <= now)
    .sort((a, b) => b.recordedAt - a.recordedAt)
    .slice(0, FEEDBACK_DIAGNOSTIC_LINES)
    .map((event) => [koreaTime(event.recordedAt), STAGE_LABELS[event.stage] ?? event.stage, STATUS_LABELS[event.status] ?? event.status, detail(event)].filter(Boolean).join(' · '));
}

export type FeedbackContext = {
  appVersion: string;
  androidVersion?: string;
  notificationAccess: boolean;
  cardRegistered: boolean;
  events: SmsDiagnosticEvent[];
  now: number;
};

/** The prefilled mail body: room for the user's words, then device facts they can read and delete. */
export function feedbackMailBody(context: FeedbackContext): string {
  const lines = feedbackDiagnosticLines(context.events, context.now);
  return [
    '(여기에 불편한 점이나 의견을 적어 주세요.)',
    '',
    '',
    '---',
    '아래는 문제를 확인하기 위한 기기 정보입니다.',
    '알림 원문, 금액, 상호, 카드번호는 들어 있지 않습니다.',
    '원하지 않으면 지우고 보내셔도 됩니다.',
    `앱 버전: ${context.appVersion}`,
    `Android: ${context.androidVersion ?? '알 수 없음'}`,
    `알림 접근: ${context.notificationAccess ? '허용' : '허용 안 됨'}`,
    `카드 끝 4자리 등록: ${context.cardRegistered ? '예' : '아니오'}`,
    `최근 ${FEEDBACK_DIAGNOSTIC_DAYS}일 결제 알림 처리 기록 (최근 ${FEEDBACK_DIAGNOSTIC_LINES}건까지):`,
    ...(lines.length ? lines : ['기록 없음']),
  ].join('\n');
}

/** Adds the body to the app's existing feedback mailto link (address and subject stay where they are). */
export function withMailBody(mailto: string, body: string): string {
  return `${mailto}${mailto.includes('?') ? '&' : '?'}body=${encodeURIComponent(body)}`;
}

/** "16" from a WebView user agent such as "Linux; Android 16; ...", or undefined. */
export function androidVersionFrom(userAgent: string): string | undefined {
  return userAgent.match(/Android\s+([\d.]+)/)?.[1];
}
