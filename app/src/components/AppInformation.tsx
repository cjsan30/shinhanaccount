import { useEffect, useRef } from 'react';
import { APP_INFORMATION_TITLE, APP_INFORMATION_PARAGRAPHS } from '../domain/appInformation';

export function AppInformationContent() {
  return <section className="app-information-content">
    <h3>이 앱에 대해</h3>
    {APP_INFORMATION_PARAGRAPHS.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
  </section>;
}

export function AppInformationNotice({ onConfirm, error, saving = false }: { onConfirm: () => void; error: string | null; saving?: boolean }) {
  const dialog = useRef<HTMLElement>(null);
  useEffect(() => {
    const priorFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.current?.focus();
    return () => { document.body.style.overflow = priorOverflow; priorFocus?.focus(); };
  }, []);
  return <div className="app-information-backdrop">
    <section ref={dialog} className="app-information-notice" data-app-information-notice role="dialog" aria-modal="true" aria-labelledby="app-information-notice-title" tabIndex={-1} onKeyDown={(event) => {
      if (event.key !== 'Tab') return;
      const controls = dialog.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled)');
      const first = controls?.[0]; const last = controls?.[controls.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); }
    }}>
      <h2 id="app-information-notice-title">{APP_INFORMATION_TITLE}</h2>
      <div className="app-information-notice__body"><AppInformationContent /></div>
      {error && <p className="app-information-error" role="alert">{error}</p>}
      <button className="sheet-action" type="button" onClick={onConfirm} disabled={saving}>{saving ? '확인 중…' : '확인'}</button>
    </section>
  </div>;
}
