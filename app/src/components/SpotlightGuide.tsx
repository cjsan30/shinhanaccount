import { createPortal } from 'react-dom';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

export type GuideStep = { target: string; fallbackTarget?: string; title: string; body: string };
export function SpotlightGuide({ title, steps, onClose }: { title: string; steps: readonly GuideStep[]; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const card = useRef<HTMLElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const step = steps[index];
  useEffect(() => { window.addEventListener('close-help-guide', onClose); return () => window.removeEventListener('close-help-guide', onClose); }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    layer.current?.focus();
    return () => previous?.focus();
  }, []);
  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(step.target) ?? (step.fallbackTarget ? document.querySelector<HTMLElement>(step.fallbackTarget) : null);
    target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    const measure = () => {
      const bounds = target?.getBoundingClientRect();
      setRect(bounds && bounds.width > 0 && bounds.height > 0 ? bounds : null);
      setCardHeight(card.current?.getBoundingClientRect().height || 220);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (target) observer?.observe(target);
    if (card.current) observer?.observe(card.current);
    const timers = [100, 350, 700].map((delay) => window.setTimeout(measure, delay));
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => { observer?.disconnect(); timers.forEach(window.clearTimeout); window.removeEventListener('scroll', measure, true); window.removeEventListener('resize', measure); };
  }, [step]);
  const height = window.innerHeight;
  const bottom = rect ? Math.min(height - 12, rect.bottom + 6) : 0;
  const top = rect ? Math.max(12, rect.top - 6) : 0;
  const cardTop = rect && height - bottom >= cardHeight + 24 ? bottom + 12 : rect && top >= cardHeight + 24 ? top - cardHeight - 12 : Math.max(12, height - cardHeight - 16);
  const move = (delta: number) => setIndex((current) => Math.max(0, Math.min(steps.length - 1, current + delta)));
  return createPortal(<div ref={layer} className={`spotlight-layer${rect ? '' : ' spotlight-layer--empty'}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} onKeyDown={(event) => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') {
      const buttons = Array.from(layer.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? []);
      const position = buttons.indexOf(document.activeElement as HTMLButtonElement);
      event.preventDefault(); buttons[position < 0 ? (event.shiftKey ? buttons.length - 1 : 0) : (position + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus();
    }
  }}>
    {rect && <div className="spotlight-highlight" aria-hidden="true" style={{ left: Math.max(6, rect.left - 6), top, width: Math.max(0, Math.min(window.innerWidth - 6, rect.right + 6) - Math.max(6, rect.left - 6)), height: Math.max(0, bottom - top) }} />}
    <section ref={card} className="spotlight-card" style={{ top: cardTop }}>
      <small>{title} · {index + 1}/{steps.length}</small><h3>{step.title}</h3><p>{step.body}</p>
      <footer><button type="button" onClick={onClose}>건너뛰기</button><button type="button" disabled={index === 0} onClick={() => move(-1)}>이전</button><button type="button" className="spotlight-next" onClick={() => index === steps.length - 1 ? onClose() : move(1)}>{index === steps.length - 1 ? '완료' : '다음'}</button></footer>
    </section>
  </div>, document.body);
}
