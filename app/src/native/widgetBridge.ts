import { registerPlugin } from '@capacitor/core';

export type WidgetSnapshot = {
  ready: boolean;
  hideAmounts: boolean;
  totalLimit: number;
  totalSpent: number;
  residentLimit: number;
  residentSpent: number;
  studyLimit: number;
  studySpent: number;
  undecidedCount: number;
  residentRows: Array<{ label: string; limit: number; spent: number }>;
};

type WidgetBridgePlugin = { sync(snapshot: WidgetSnapshot): Promise<void> };
export const WidgetBridge = registerPlugin<WidgetBridgePlugin>('WidgetBridge');
