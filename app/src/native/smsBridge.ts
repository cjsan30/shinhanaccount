import { registerPlugin } from '@capacitor/core';

export type NativeApproval = { cardLast4: string; occurredAt: string; amount: number; merchant: string };
export type NativeBudgetState = { categoryLimits: Record<string, number>; categorySpent: Record<string, number>; thresholds: [number, number]; periodKey: string };
type SmsBridgePlugin = {
  configure(options: { cardLast4: string }): Promise<void>;
  syncBudgetState(state: NativeBudgetState): Promise<void>;
  injectTestApproval(approval: NativeApproval): Promise<void>;
  requestPermission(): Promise<{ granted: boolean }>;
  consumePendingApprovals(): Promise<{ items: NativeApproval[] }>;
};
export const SmsBridge = registerPlugin<SmsBridgePlugin>('SmsBridge');