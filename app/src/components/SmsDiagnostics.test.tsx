import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const smsBridge = vi.hoisted(() => ({ getSmsDiagnostics: vi.fn(), clearSmsDiagnostics: vi.fn() }));
vi.mock('../native/smsBridge', () => ({ SmsBridge: smsBridge }));
import { SmsDiagnostics } from './SmsDiagnostics';

beforeEach(() => {
  vi.clearAllMocks();
  smsBridge.getSmsDiagnostics.mockResolvedValue({ items: [{
    id: 'record-1', eventId: 'event-12345678', recordedAt: 1_787_100_000_000,
    stage: 'QUEUE_COMMITTED', status: 'success', queueSize: 1,
  }] });
  smsBridge.clearSmsDiagnostics.mockResolvedValue(undefined);
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
    expect(notify).toHaveBeenCalledWith('SMS 진단 이력을 지웠습니다.');
  });
});
