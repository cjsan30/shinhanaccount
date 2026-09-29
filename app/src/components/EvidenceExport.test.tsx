import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EvidenceExport } from './EvidenceExport';

const summary = {
  periodLabel: '2026년 9월', totalBudget: 700000, totalUsed: 10000,
  buckets: [{ key: 'resident' as const, label: '정주비', budget: 500000, used: 10000, items: [{ category: 'food', label: '식비', budget: 200000, used: 10000 }] }, { key: 'studySpace' as const, label: '학습공간비', budget: 200000, used: 0, items: [] }],
};

describe('EvidenceExport', () => {
  it('shows receipt coverage before a submission is generated', () => {
    render(<EvidenceExport reportEvidence={[]} onReportEvidenceChange={vi.fn()} summary={summary} periodKey="2026-09" entries={[{ id: 'payment-1', cardLast4: '1234', occurredAt: '2026-09-20T10:00:00+09:00', merchant: '카페', amount: 10000, status: 'classified', bucket: 'resident', category: 'food' }]} />);
    expect(screen.getByText('영수증 연결 확인')).toBeInTheDocument();
    expect(screen.getByText(/결제 1건 · 연결 0건 · 미연결 1건/)).toBeInTheDocument();
    expect(screen.getByText(/PDF 생성 전에 영수증을 추가하고 연결/)).toBeInTheDocument();
  });
});
