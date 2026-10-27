import { Capacitor, registerPlugin } from '@capacitor/core';

type ExternalAppPlugin = {
  open(options: { packageId: string; playStoreUrl: string }): Promise<{ opened: boolean; target: 'app' | 'store' }>;
};

const ExternalApp = registerPlugin<ExternalAppPlugin>('ExternalApp');

const SHINHAN_SOL_PAY_PACKAGE = 'com.shcard.smartpay';
const SHINHAN_SOL_PAY_STORE_URL = `https://play.google.com/store/apps/details?id=${SHINHAN_SOL_PAY_PACKAGE}`;

export async function openShinhanSolPay() {
  if (Capacitor.isNativePlatform()) {
    return ExternalApp.open({ packageId: SHINHAN_SOL_PAY_PACKAGE, playStoreUrl: SHINHAN_SOL_PAY_STORE_URL });
  }
  window.open(SHINHAN_SOL_PAY_STORE_URL, '_blank', 'noopener,noreferrer');
  return { opened: true, target: 'store' as const };
}
