import { registerPlugin } from '@capacitor/core';

type PolicyOcrPlugin = { pickAndRecognize(): Promise<{ text: string }> };
export const PolicyOcr = registerPlugin<PolicyOcrPlugin>('PolicyOcr');