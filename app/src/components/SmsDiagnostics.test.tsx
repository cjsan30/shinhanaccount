import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const smsBridge = vi.hoisted(() => ({ getSmsDiagnostics: vi.fn(), clearSmsDiagnostics: vi.fn() }));
const saveFile = vi.hoisted(() => vi.fn());
vi.mock('../native/smsBridge', () => ({ SmsBridge: smsBridge }));
vi.mock('../native/fileExport', () => ({ saveFile }));
import { SmsDiagnostics } from './SmsDiagnostics';

beforeEach(() => {
  vi.clearAllMocks();
  smsBridge.getSmsDiagnostics.mockResolvedValue({ items: [{
    id: 'record-1', eventId: 'event-12345678', recordedAt: 1_787_100_000_000,
    stage: 'QUEUE_COMMITTED', status: 'success', queueSize: 1,
  }] });
  smsBridge.clearSmsDiagnostics.mockResolvedValue(undefined);
  saveFile.mockResolvedValue({ fileName: 'shinhanhae_sms_diagnostics.txt', relativePath: 'Downloads/신청해 계산기' });
});

describe('SMS diagnostics', () => {
  it('loads sanitized native processing stages', async () => {
    render(<SmsDiagnostics notify={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '진단 이력 새로고침' }));

    expect(await screen.findByText('승인 대기열 저장')).toBeInTheDocument();
    expect(screen.getByText('대기 1건')).toBeInTheDocument();
    expect(screen.queryByText('3741')).not.toBeInTheDocument();
  });

  it('clears diagnostics on explicit request', async () => {
    const notify = vi.fn();
    render(<SmsDiagnostics notify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: '진단 이력 지우기' }));

    await waitFor(() => expect(smsBridge.clearSmsDiagnostics).toHaveBeenCalledOnce());
    expect(notify).toHaveBeenCalledWith('결제 수신 진단 이력을 지웠습니다.');
  });

  it('exports processing metadata without payment text, amount, or card suffix', async () => {
    const notify = vi.fn();
    smsBridge.getSmsDiagnostics.mockResolvedValueOnce({ items: [{ id: 'record-1', eventId: 'event-12345678', recordedAt: 1_787_100_000_000, stage: 'NOTIFICATION_BODY_EXTRACTED', status: 'success', bodyLength: 89, markerFound: true, sourceApp: 'com.shcard.smartpay' }] });
    render(<SmsDiagnostics notify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: '진단 이력 새로고침' }));
    await screen.findByText('승인 알림 본문 확인');
    fireEvent.click(screen.getByRole('button', { name: '진단 로그 내보내기' }));
    await waitFor(() => expect(saveFile).toHaveBeenCalledOnce());
    const content = new TextDecoder().decode(saveFile.mock.calls[0][1]);
    expect(content).toContain('길이 89 · 승인문구 있음 · 출처 com.shcard.smartpay');
    expect(content).not.toMatch(/3741|1,230|씨유/);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining('Downloads/신청해 계산기'));
  });

  it('reports native refresh and export failures without leaving stale controls enabled', async () => {
    const notify = vi.fn(); smsBridge.getSmsDiagnostics.mockRejectedValueOnce(new Error('native unavailable'));
    render(<SmsDiagnostics notify={notify} />);
    fireEvent.click(screen.getByRole('button', { name: '진단 이력 새로고침' }));
    await waitFor(() => expect(notify).toHaveBeenCalledWith('결제 수신 진단 이력을 불러오지 못했습니다.'));
    expect(screen.getByRole('button', { name: '진단 로그 내보내기' })).toBeDisabled();
  });
});
