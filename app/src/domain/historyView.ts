export type HistorySort = 'latest' | 'oldest' | 'amount-desc' | 'amount-asc';
export type HistoryView = { page: number; category: string; sort: HistorySort; query: string; period: 'all' | 'current' };
export const INITIAL_HISTORY_VIEW: HistoryView = { page: 0, category: 'all', sort: 'latest', query: '', period: 'all' };
