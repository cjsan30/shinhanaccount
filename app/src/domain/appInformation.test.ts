import { beforeEach, describe, expect, it } from 'vitest';
import { APP_INFORMATION_ACK_KEY, APP_INFORMATION_PARAGRAPHS, SHORT_APP_NOTICE, confirmAppInformation, hasConfirmedAppInformation } from './appInformation';
describe('app information confirmation', () => {
  beforeEach(() => localStorage.clear());
  it('records only explicit confirmation and retains it across reopening', () => {
    expect(hasConfirmedAppInformation(localStorage)).toBe(false);
    expect(confirmAppInformation(localStorage)).toBe(true);
    expect(localStorage.getItem(APP_INFORMATION_ACK_KEY)).toBe('confirmed');
    expect(hasConfirmedAppInformation(localStorage)).toBe(true);
    expect(localStorage.length).toBe(1);
  });
  it('does not accept corrupt values or silently confirm after storage failure', () => {
    localStorage.setItem(APP_INFORMATION_ACK_KEY, 'true');
    expect(hasConfirmedAppInformation(localStorage)).toBe(false);
    expect(hasConfirmedAppInformation({ getItem: () => { throw new Error('unavailable'); } })).toBe(false);
    expect(confirmAppInformation({ setItem: () => { throw new Error('full'); } })).toBe(false);
  });
  it('says the app is unofficial without naming organizations or linking to their sites', () => {
    const notices = [SHORT_APP_NOTICE, ...APP_INFORMATION_PARAGRAPHS].join(' ');
    expect(SHORT_APP_NOTICE).toContain('공식 앱이 아닙니다');
    expect(notices).not.toMatch(/신한|재단|정부|고용노동부|사무국|https?:/);
  });
});
