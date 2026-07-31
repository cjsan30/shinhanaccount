import { registerPlugin } from '@capacitor/core';

export type NativeApproval = { cardLast4: string; occurredAt: string; amount: number; merchant: string };
type SmsBridgePlugin = { configure(options: { cardLast4: string }): Promise<void>; requestPermission(): Promise<{ granted: boolean }>; consumePendingApprovals(): Promise<{ items: NativeApproval[] }> };
export const SmsBridge = registerPlugin<SmsBridgePlugin>('SmsBridge');