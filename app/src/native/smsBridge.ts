import { registerPlugin } from '@capacitor/core';

export type NativeApproval = { id?: string; cardLast4: string; occurredAt: string; amount: number; merchant: string; notificationPostedAt?: number; source?: 'demo' | 'sms' | 'notification' | 'excel' | 'manual'; quickCategory?: string };
export type NativeBudgetState = { categoryLimits: Record<string, number>; categorySpent: Record<string, number>; alertCategories: string[]; thresholds: [number, number]; periodKey: string; quickCategories: Array<{ category: string; label: string }> };
export type SmsDiagnosticEvent = {
  id: string;
  eventId: string;
  recordedAt: number;
  stage: string;
  status: 'info' | 'success' | 'ignored' | 'blocked' | 'error';
  segmentCount?: number;
  bodyLength?: number;
  markerFound?: boolean;
  cardConfigured?: boolean;
  cardMatched?: boolean;
  queueSize?: number;
  scannedCount?: number;
  matchedCount?: number;
  recoveredCount?: number;
  errorType?: string;
  sourceApp?: string;
};
type SmsBridgePlugin = {
  addListener(eventName: 'approvalReceived', listener: () => void): Promise<{ remove: () => Promise<void> }>;
  configure(options: { cardLast4: string }): Promise<void>;
  getConfiguration(): Promise<{ cardLast4: string }>;
  syncBudgetState(state: NativeBudgetState): Promise<void>;
  injectTestApproval(approval: NativeApproval): Promise<void>;
  injectTestNotificationApproval(approval: NativeApproval): Promise<void>;
  scheduleTestApproval(options: { approval: NativeApproval; delayMs: number }): Promise<void>;
  getNotificationAccessStatus(): Promise<{ granted: boolean }>;
  openNotificationAccessSettings(): Promise<void>;
  consumePendingApprovals(): Promise<{ items: NativeApproval[] }>;
  acknowledgePendingApprovals(options: { ids: string[] }): Promise<void>;
  getSmsDiagnostics(): Promise<{ items: SmsDiagnosticEvent[] }>;
  clearSmsDiagnostics(): Promise<void>;
};
export const SmsBridge = registerPlugin<SmsBridgePlugin>('SmsBridge');
