import { registerPlugin } from '@capacitor/core';

import type { OcrLineBox } from '../domain/planOcr';

/** `lines` is absent in app versions before 2026-11-16. */
type PolicyOcrPlugin = { pickAndRecognize(): Promise<{ text: string; lines?: OcrLineBox[] }> };
export const PolicyOcr = registerPlugin<PolicyOcrPlugin>('PolicyOcr');