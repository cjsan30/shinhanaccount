/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');

describe('Android public distribution manifest', () => {
  it('does not request restricted SMS permissions', () => {
    expect(manifest).not.toContain('android.permission.READ_SMS');
    expect(manifest).not.toContain('android.permission.RECEIVE_SMS');
    expect(manifest).not.toContain('.SmsApprovalReceiver');
  });

  it('keeps the Samsung Messages notification listener', () => {
    expect(manifest).toContain('.ShinhanMessageNotificationListener');
    expect(manifest).toContain('android.permission.BIND_NOTIFICATION_LISTENER_SERVICE');
  });
});
