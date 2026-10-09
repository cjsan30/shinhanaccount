import { beforeEach, describe, expect, it } from 'vitest';
import { APP_INFORMATION_ACK_KEY, INFORMATION_SOURCES, confirmAppInformation, hasConfirmedAppInformation } from './appInformation';
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
  it('lists only the two approved HTTPS sources', () => {
    expect(INFORMATION_SOURCES).toHaveLength(2);
    expect(INFORMATION_SOURCES.map((source) => new URL(source.url).hostname)).toEqual(['www.shinhanfoundation.or.kr', 'shinchunghae.co.kr']);
    expect(INFORMATION_SOURCES.every((source) => new URL(source.url).protocol === 'https:')).toBe(true);
  });
});
