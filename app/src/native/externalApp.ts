import { Capacitor, registerPlugin } from '@capacitor/core';
import { INFORMATION_SOURCES } from '../domain/appInformation';

type ExternalAppPlugin = {
  open(options: { packageId: string; playStoreUrl: string }): Promise<{ opened: boolean; target: 'app' | 'store' }>;
  openWebsite(options: { url: string }): Promise<{ opened: boolean }>;
};

const ExternalApp = registerPlugin<ExternalAppPlugin>('ExternalApp');

const SHINHAN_SOL_PAY_PACKAGE = 'com.shcard.smartpay';
const SHINHAN_SOL_PAY_STORE_URL = `https://play.google.com/store/apps/details?id=${SHINHAN_SOL_PAY_PACKAGE}`;

export async function openInformationWebsite(url: string) {
  if (!INFORMATION_SOURCES.some((source) => source.url === url)) throw new Error('허용되지 않은 정보 출처입니다.');
  if (Capacitor.isNativePlatform()) return ExternalApp.openWebsite({ url });
  window.open(url, '_blank', 'noopener,noreferrer');
  return { opened: true };
}

export async function openShinhanSolPay() {
  if (Capacitor.isNativePlatform()) {
    return ExternalApp.open({ packageId: SHINHAN_SOL_PAY_PACKAGE, playStoreUrl: SHINHAN_SOL_PAY_STORE_URL });
  }
  window.open(SHINHAN_SOL_PAY_STORE_URL, '_blank', 'noopener,noreferrer');
  return { opened: true, target: 'store' as const };
}
