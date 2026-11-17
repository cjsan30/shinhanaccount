import { VERIFY_DATE_OFFSET_KEY } from './domain/verifyTools';

/**
 * Device verification build only: shifts the app's "today" by whole days so states
 * such as the calendar after the 16th or a new period from the 11th can be checked.
 * The Play build is not built in internal mode, so this whole module is dropped there.
 */
function installVerifyClock() {
  if (import.meta.env.MODE !== 'internal') return;
  let offset = 0;
  try { offset = Number(window.localStorage.getItem(VERIFY_DATE_OFFSET_KEY)) || 0; } catch { offset = 0; }
  if (!offset) return;
  const RealDate = Date;
  // Dates built from a value stay exact; only "now" moves.
  const ShiftedDate = function (this: unknown, ...args: unknown[]) {
    if (!new.target) return new RealDate(RealDate.now() + offset).toString();
    return Reflect.construct(RealDate, args.length ? args : [RealDate.now() + offset], new.target);
  } as unknown as DateConstructor;
  Object.setPrototypeOf(ShiftedDate, RealDate);
  Object.defineProperty(ShiftedDate, 'prototype', { value: RealDate.prototype });
  Object.defineProperty(ShiftedDate, 'now', { value: () => RealDate.now() + offset });
  globalThis.Date = ShiftedDate;
}

installVerifyClock();
