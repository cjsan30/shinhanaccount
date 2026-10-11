export const APP_INFORMATION_TITLE = '앱 안내·정보 출처';
export const APP_INFORMATION_ACK_KEY = 'shinhanhae-app-information-confirmed-v1';
export const OFFICIAL_PROGRAM_URL = 'https://shinchunghae.co.kr/';
export const INFORMATION_SOURCES = [
  { label: '신한금융희망재단 사업 소개', url: 'https://www.shinhanfoundation.or.kr/project/financial/07' },
  { label: '신청해 공식 홈페이지', url: OFFICIAL_PROGRAM_URL },
] as const;
export const SHORT_APP_NOTICE = '신청해 계산기는 개인 개발자가 만든 지원금 관리 도구입니다. 정부기관·신한금융희망재단·신청해 운영 사무국의 공식 앱이 아닙니다.';
export const APP_INFORMATION_PARAGRAPHS = [
  '신청해 계산기는 개인 개발자가 만든 비공식 지원금 관리 도구입니다. 정부·고용노동부·신한금융희망재단·신청해 운영 사무국을 대표하거나 제휴한 공식 앱이 아닙니다.',
  '예산·지출·영수증 정리와 PDF 생성을 돕지만, 사업 신청·선발·심사·지원금 지급은 제공하지 않습니다. 앱의 계산·분류 결과나 생성한 PDF가 사업상 사용 인정 또는 제출 승인을 보장하지는 않습니다.',
] as const;
export const INFORMATION_SOURCE_NOTE = '사업 내용과 제출 기준은 변경될 수 있습니다. 최신 내용은 공식 홈페이지와 운영 사무국에서 받은 안내를 확인해 주세요.';

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
