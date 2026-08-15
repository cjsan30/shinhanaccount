export type ParsedApproval = {
  cardLast4: string;
  occurredAt: string;
  amount: number;
  merchant: string;
};

export type PaymentClassification =
  | { status: 'classified'; bucket: 'resident' | 'studySpace'; category: 'lodging' | 'food' | 'transport' | 'generalCafe' }
  | { status: 'excluded' }
  | { status: 'undecided' };

const approvalPattern = /\[신한체크승인\]\s+.*?\((\d{4})\)\s+(\d{2})\/(\d{2})\s+(\d{2}):(\d{2})\s+(?:\(금액\)|금액)\s*([\d,]+)\s*원\s+(.+)$/;

export function parseApprovalSms(message: string, expectedCardLast4: string, year: number): ParsedApproval | null {
  const normalized = message.replace(/\s+/g, ' ').trim();
  const matched = normalized.match(approvalPattern);
  if (!matched) return null;

  const [, cardLast4, month, day, hour, minute, rawAmount, merchant] = matched;
  if (cardLast4 !== expectedCardLast4) return null;

  return {
    cardLast4,
    occurredAt: `${year}-${month}-${day}T${hour}:${minute}:00+09:00`,
    amount: Number(rawAmount.replaceAll(',', '')),
    merchant: merchant.trim(),
  };
}

function normalizeMerchant(merchant: string) {
  return merchant.toLowerCase().replace(/[\s().,㈜]/g, '');
}

export function classifyPayment(merchant: string, amount: number): PaymentClassification {
  const normalized = normalizeMerchant(merchant);

  if (normalized.includes('아이햅슨')) return { status: 'excluded' };
  if (normalized.includes('놀유니버스')) return { status: 'classified', bucket: 'resident', category: 'lodging' };
  if (normalized === 'sr') return { status: 'classified', bucket: 'resident', category: 'transport' };
  if (normalized.includes('삼성웰스토리')) {
    return amount === 8000
      ? { status: 'classified', bucket: 'resident', category: 'food' }
      : { status: 'classified', bucket: 'studySpace', category: 'generalCafe' };
  }
  if (normalized.includes('서브웨이') || normalized.includes('써브웨이') || normalized.includes('맘스터치') || normalized.includes('맥도날드')) {
    return { status: 'classified', bucket: 'studySpace', category: 'generalCafe' };
  }

  return { status: 'undecided' };
}