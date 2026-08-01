import { registerPlugin } from '@capacitor/core';

type NotificationBridgePlugin = { requestPermission(): Promise<{ granted: boolean }>; show(options: { title: string; body: string }): Promise<void> };
export const NotificationBridge = registerPlugin<NotificationBridgePlugin>('NotificationBridge');