import type { GuideStep } from './SpotlightGuide';
export const APP_GUIDE_STEPS: readonly GuideStep[] = [
  { target: '.settings-button', title: '계획표 설정 · 거래내역 가져오기', body: '계획표는 설정 → 데이터 관리에서 변경하세요. 거래내역 가져오기는 홈 화면과 분류 필요 목록에서도 열 수 있어요. 초기 설정을 다시 할 필요는 없습니다.' },
  { target: '.new-payment', title: '빠진 지출은 직접 등록', body: '결제 알림이나 가져오기에서 빠진 지출을 날짜·금액·분류와 함께 등록하세요. 같은 결제를 중복 등록하지 않도록 확인해 주세요.' },
  { target: '.budgets', title: '예산과 잔액 확인', body: '정주비·학습공간비를 누르면 항목별 계획과 사용 내역을 볼 수 있어요.' },
  { target: '[data-guide="undecided"]', title: '분류 필요 결제를 정리하세요', body: '실제 결제 중 지원금으로 처리할 금액을 확인하고 항목별로 분류하세요. 지원금과 무관한 지출은 사업 무관 제외를 선택하세요.' },
  { target: '[data-guide="history"]', title: '결제 내역을 확인하세요', body: '상호명·금액 검색과 기간 필터로 결제를 찾으세요. 부분 취소 후에는 분류 필요로 되돌려 지원금 반영 금액을 다시 확인할 수 있어요.' },
  { target: '[data-guide="export"]', title: '제출 PDF 만들기', body: '입출금내역과 영수증을 추가해 PDF를 만드세요. 영수증 연결은 선택 사항입니다. 자세한 안내는 PDF 생성 창 상단의 도움말에서 볼 수 있어요.' },
];
