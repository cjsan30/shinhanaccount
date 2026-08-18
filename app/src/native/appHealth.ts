import { registerPlugin } from '@capacitor/core';

type AppHealthPlugin = { getStartupStatus(): Promise<{ forceStopped: boolean }> };
export const AppHealth = registerPlugin<AppHealthPlugin>('AppHealth');
