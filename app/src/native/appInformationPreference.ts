import { Capacitor, registerPlugin } from '@capacitor/core';
import { confirmAppInformation, hasConfirmedAppInformation } from '../domain/appInformation';
type InformationPreferencePlugin = { getConfirmation(): Promise<{ confirmed: boolean }>; confirm(): Promise<{ confirmed: boolean }> };
const AppInformation = registerPlugin<InformationPreferencePlugin>('AppInformation');
export async function loadInformationConfirmation(storage: Pick<Storage, 'getItem'>) {
  return Capacitor.isNativePlatform() ? (await AppInformation.getConfirmation()).confirmed === true : hasConfirmedAppInformation(storage);
}
export async function saveInformationConfirmation(storage: Pick<Storage, 'setItem'>) {
  return Capacitor.isNativePlatform() ? (await AppInformation.confirm()).confirmed === true : confirmAppInformation(storage);
}
