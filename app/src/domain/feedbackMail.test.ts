import { describe, expect, it } from 'vitest';
import { androidVersionFrom, feedbackDiagnosticLines, feedbackMailBody, withMailBody } from './feedbackMail';
import type { SmsDiagnosticEvent } from '../native/smsBridge';

const NOW = Date.parse('2026-11-17T12:00:00+09:00');
const event = (minutesAgo: number, stage: string, extra: Partial<SmsDiagnosticEvent> = {}): SmsDiagnosticEvent => ({ id: `${stage}-${minutesAgo}`, eventId: 'e', recordedAt: NOW - minutesAgo * 60_000, stage, status: 'success', ...extra });

describe('feedback mail', () => {
  it('lists only payment-notification records of the last 7 days, newest first, without app names', () => {
    const lines = feedbackDiagnosticLines([
      event(10, 'NOTIFICATION_LISTENER_ENTERED'),
      event(5, 'NOTIFICATION_BODY_EXTRACTED', { segmentCount: 1, bodyLength: 80, markerFound: true, sourceApp: 'com.samsung.android.messaging' }),
      event(3, 'NOTIFICATION_SOURCE_UNSUPPORTED', { status: 'skipped', sourceApp: 'com.kakao.talk' }),
      event(8 * 24 * 60, 'QUEUE_COMMITTED'),
    ], NOW);
    expect(lines).toEqual([
      '11-17 11:55 · 승인 알림 본문 확인 · 처리 · 조각 1 · 길이 80 · 승인문구 있음',
      '11-17 11:50 · 승인 알림 수신 · 처리',
    ]);
    expect(lines.join('\n')).not.toMatch(/com\.|kakao|samsung/);
  });

  it('keeps at most 30 lines', () => {
    expect(feedbackDiagnosticLines(Array.from({ length: 40 }, (_, index) => event(index, 'QUEUE_COMMITTED')), NOW)).toHaveLength(30);
  });

  it('builds a mail with room for the message, then device facts that can be deleted', () => {
    const body = feedbackMailBody({ appVersion: '1.4.0', androidVersion: '16', notificationAccess: true, cardRegistered: true, events: [], now: NOW });
    expect(body.startsWith('(여기에 불편한 점이나 의견을 적어 주세요.)')).toBe(true);
    expect(body).toContain('앱 버전: 1.4.0');
    expect(body).toContain('알림 접근: 허용');
    expect(body).toContain('카드 끝 4자리 등록: 예');
    expect(body).toContain('기록 없음');
    const url = withMailBody('mailto:feedback@example.invalid?subject=x', feedbackMailBody({ appVersion: '1.4.0', notificationAccess: false, cardRegistered: false, events: [], now: NOW }));
    expect(url.startsWith('mailto:feedback@example.invalid?subject=x&body=')).toBe(true);
    expect(decodeURIComponent(url.split('&body=')[1])).toContain('Android: 알 수 없음');
  });

  it('reads the Android version from the WebView user agent', () => {
    expect(androidVersionFrom('Mozilla/5.0 (Linux; Android 16; SM-S938N Build/AP3A) AppleWebKit/537.36')).toBe('16');
    expect(androidVersionFrom('Mozilla/5.0 (Windows NT 10.0)')).toBeUndefined();
  });
});
