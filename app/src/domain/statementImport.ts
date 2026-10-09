import type { ImportedBankTransaction } from './shinhanBankImport';
import type { StatementRow } from './statementRedaction';

export function toStatementRows(transactions: ImportedBankTransaction[]): StatementRow[] {
  return transactions.map((transaction) => {
    const date = new Date(transaction.occurredAt);
    return {
      id: transaction.transactionId,
      date: transaction.occurredAt.slice(0, 10),
      time: `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`,
      summary: transaction.summary ?? (transaction.direction === 'withdrawal' ? '출금' : '입금'),
      withdrawal: transaction.direction === 'withdrawal' ? transaction.amount : 0,
      deposit: transaction.direction === 'deposit' ? transaction.amount : 0,
      merchant: transaction.merchant,
      ...(transaction.balance ? { balance: transaction.balance } : {}),
      ...(transaction.branch ? { branch: transaction.branch } : {}),
      ...(transaction.sourcePage !== undefined ? { sourcePage: transaction.sourcePage } : {}),
      ...(transaction.sourceY !== undefined ? { sourceY: transaction.sourceY } : {}),
    };
  });
}
