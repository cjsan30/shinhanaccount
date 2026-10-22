export type ParsedApproval = {
  cardLast4: string;
  occurredAt: string;
  amount: number;
  merchant: string;
};

export type PaymentClassification =
  | { status: 'classified'; bucket: 'resident' | 'studySpace'; category: 'lodging' | 'food' | 'education' | 'transport' | 'studyCafe' | 'generalCafe' | 'readingRoom' }
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
