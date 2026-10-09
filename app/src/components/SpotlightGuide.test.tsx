import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SpotlightGuide } from './SpotlightGuide';
import { APP_GUIDE_STEPS } from './appGuideSteps';

describe('SpotlightGuide', () => {
  it('fits the guide width inside a zoomed visual viewport', () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, 'visualViewport');
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: {
      width: 280, height: 600, offsetLeft: 20, offsetTop: 40,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    } });
    try {
      const { unmount } = render(<SpotlightGuide title="확대 안내" steps={[{ target: '#missing', title: '설명', body: '설명' }]} onClose={vi.fn()} />);
      const card = document.querySelector<HTMLElement>('.spotlight-card')!;
      expect(card.style.width).toBe('256px');
      expect(card.style.left).toBe('32px');
      expect(card.style.right).toBe('auto');
      expect(card.style.maxHeight).toBe('576px');
      expect(Number.parseFloat(card.style.top)).toBeGreaterThanOrEqual(52);
      unmount();
    } finally {
      if (descriptor) Object.defineProperty(window, 'visualViewport', descriptor);
      else Reflect.deleteProperty(window, 'visualViewport');
    }
  });

  it('opens a collapsed input target while guiding and restores the collapsed state afterward', () => {
    const details = document.createElement('details');
    details.innerHTML = '<summary>연결한 영수증 수정</summary><input id="collapsed-date" type="date" value="2026-09-20" />';
    document.body.append(details);
    const input = details.querySelector<HTMLInputElement>('input')!; input.scrollIntoView = vi.fn();
    const { unmount } = render(<SpotlightGuide title="접힌 안내" steps={[{ target: '#collapsed-date', title: '날짜 입력', body: '설명' }, { target: '#missing', title: '다음 단계', body: '설명' }]} onClose={vi.fn()} />);
    expect(details.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: '다음' }));
    expect(details.open).toBe(false); expect(input.value).toBe('2026-09-20');
    unmount(); details.remove();
  });

  it('keeps the card in the visible viewport when the target is outside the screen', () => {
    const target = document.createElement('button'); target.id = 'offscreen'; target.scrollIntoView = vi.fn();
    target.getBoundingClientRect = () => new DOMRect(0, 2500, 100, 50);
    document.body.append(target);
    const { unmount } = render(<SpotlightGuide title="안내" steps={[{ target: '#offscreen', title: '화면 밖 대상', body: '설명' }]} onClose={vi.fn()} />);
    const card = document.querySelector<HTMLElement>('.spotlight-card')!;
    expect(Number.parseFloat(card.style.top)).toBeLessThanOrEqual(window.innerHeight - 220);
    expect(document.querySelector('.spotlight-highlight')).toBeNull();
    unmount(); target.remove();
  });
  it('scrolls to each target, supports previous, and completes without modifying targets', () => {
    const scroll = vi.fn();
    const close = vi.fn();
    const target = document.createElement('button'); target.id = 'guide-target'; target.textContent = '실제 데이터'; target.scrollIntoView = scroll;
    document.body.append(target);
    const { unmount } = render(<SpotlightGuide title="안내" steps={[{ target: '#guide-target', title: '첫 단계', body: '설명' }, { target: '#guide-target', title: '둘째 단계', body: '설명' }]} onClose={close} />);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', behavior: 'smooth' });
    expect(screen.getByRole('button', { name: '이전' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: '다음' })); expect(screen.getByText('둘째 단계')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '이전' })); expect(screen.getByText('첫 단계')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다음' })); fireEvent.click(screen.getByRole('button', { name: '완료' })); expect(close).toHaveBeenCalledOnce();
    expect(target.textContent).toBe('실제 데이터'); unmount(); target.remove();
  });
  it('handles missing targets, escape, and keyboard focus containment', () => {
    const close = vi.fn(); render(<SpotlightGuide title="안내" steps={APP_GUIDE_STEPS} onClose={close} />);
    const dialog = screen.getByRole('dialog'); expect(dialog).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab' }); expect(screen.getByRole('button', { name: '건너뛰기' })).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Escape' }); expect(close).toHaveBeenCalledOnce();
  });
  it('highlights a fallback target and closes on Android back without changing the screen', () => {
    const target = document.createElement('button'); target.id = 'fallback'; target.scrollIntoView = vi.fn();
    target.getBoundingClientRect = () => ({ left: 10, right: 110, top: 50, bottom: 100, width: 100, height: 50, x: 10, y: 50, toJSON: () => ({}) });
    document.body.append(target);
    const close = vi.fn(); const { unmount } = render(<SpotlightGuide title="안내" steps={[{ target: '#missing', fallbackTarget: '#fallback', title: '설명', body: '설명' }]} onClose={close} />);
    expect(document.querySelector('.spotlight-highlight')).not.toBeNull();
    fireEvent(window, new Event('close-help-guide')); expect(close).toHaveBeenCalledOnce();
    unmount(); target.remove();
  });
});
