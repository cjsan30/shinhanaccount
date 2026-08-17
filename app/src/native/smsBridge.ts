import { registerPlugin } from '@capacitor/core';

export type NativeApproval = { id?: string; cardLast4: string; occurredAt: string; amount: number; merchant: string; source?: 'demo' | 'sms' | 'excel' | 'manual' };
export type NativeBudgetState = { categoryLimits: Record<string, number>; categorySpent: Record<string, number>; thresholds: [number, number]; periodKey: string };
type SmsBridgePlugin = {
  configure(options: { cardLast4: string }): Promise<void>;
  getConfiguration(): Promise<{ cardLast4: string }>;
  syncBudgetState(state: NativeBudgetState): Promise<void>;
  injectTestApproval(approval: NativeApproval): Promise<void>;
  scheduleTestApproval(options: { approval: NativeApproval; delayMs: number }): Promise<void>;
  requestPermission(): Promise<{ granted: boolean }>;
  consumePendingApprovals(): Promise<{ items: NativeApproval[] }>;
  acknowledgePendingApprovals(options: { ids: string[] }): Promise<void>;
};
export const SmsBridge = registerPlugin<SmsBridgePlugin>('SmsBridge');