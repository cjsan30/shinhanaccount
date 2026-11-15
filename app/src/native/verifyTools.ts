import { registerPlugin } from '@capacitor/core';

/** Device verification build only; the plugin is absent from the Play build. */
type VerifyToolsPlugin = { scheduleTestApproval(options: { delaySeconds: number; amount: number }): Promise<void> };
export const VerifyTools = registerPlugin<VerifyToolsPlugin>('VerifyTools');
