import { registerPlugin } from '@capacitor/core';

type ReceiptOcrPlugin = {
  recognize(options: { base64Data: string }): Promise<{ text: string }>;
};

export const ReceiptOcr = registerPlugin<ReceiptOcrPlugin>('ReceiptOcr');
