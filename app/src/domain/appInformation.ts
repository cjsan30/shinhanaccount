export const APP_INFORMATION_TITLE = '앱 안내';
export const APP_INFORMATION_ACK_KEY = 'shinhanhae-app-information-confirmed-v1';
export const SHORT_APP_NOTICE = '신청해 계산기는 개인이 개발한 지원금 관리 도구이며, 공식 앱이 아닙니다.';
export const APP_INFORMATION_PARAGRAPHS = [
  '신청해 계산기는 개인이 개발한 지원금 관리 도구입니다. 어떤 기관의 공식 앱도 아니며, 기관을 대표하거나 기관과 제휴하지 않았습니다.',
  '예산·지출·영수증 정리와 PDF 생성을 돕지만, 사업 신청·선발·심사·지원금 지급은 제공하지 않습니다. 앱의 계산·분류 결과나 생성한 PDF가 사업상 사용 인정 또는 제출 승인을 보장하지는 않습니다.',
  '사업 내용과 제출 기준은 바뀔 수 있습니다. 최신 기준은 사업 운영 측에서 받은 안내를 확인해 주세요.',
] as const;

// No financial or identity data. Keep this preference outside backup and reset
// scopes, so normal updates do not repeat a notice already confirmed here.
export function hasConfirmedAppInformation(storage: Pick<Storage, 'getItem'>): boolean {
  try { return storage.getItem(APP_INFORMATION_ACK_KEY) === 'confirmed'; }
  catch { return false; }
}
export function confirmAppInformation(storage: Pick<Storage, 'setItem'>): boolean {
  try { storage.setItem(APP_INFORMATION_ACK_KEY, 'confirmed'); return true; }
  catch { return false; }
}
