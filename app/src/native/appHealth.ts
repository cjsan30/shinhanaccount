import { registerPlugin } from '@capacitor/core';

type AppHealthPlugin = { getStartupStatus(): Promise<{ forceStopped: boolean; eventId: string }> };
export const AppHealth = registerPlugin<AppHealthPlugin>('AppHealth');
