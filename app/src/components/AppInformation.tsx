import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { Capacitor } from '@capacitor/core';
import { APP_INFORMATION_TITLE, APP_INFORMATION_PARAGRAPHS, INFORMATION_SOURCES, INFORMATION_SOURCE_NOTE, OFFICIAL_PROGRAM_URL } from '../domain/appInformation';
import { openInformationWebsite } from '../native/externalApp';

export function InformationSourceLink({ url = OFFICIAL_PROGRAM_URL, children = '사업 기준·출처 확인' }: { url?: string; children?: string }) {
  const [error, setError] = useState<string | null>(null);
  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!Capacitor.isNativePlatform()) return;
    event.preventDefault();
    setError(null);
    void openInformationWebsite(url).catch(() => setError('홈페이지를 열지 못했습니다. 브라우저 설치와 연결 상태를 확인한 뒤 다시 눌러 주세요.'));
  };
  return <div className="information-source-link">
    <a className="information-source-button" href={url} target="_blank" rel="noopener noreferrer" onClick={open}>{children}</a>
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function AppInformationContent() {
  return <section className="app-information-content">
    <h3>이 앱에 대해</h3>
    {APP_INFORMATION_PARAGRAPHS.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
    <h3>사업 정보 출처</h3>
    {INFORMATION_SOURCES.map((source) => <InformationSourceLink key={source.url} url={source.url}>{source.label}</InformationSourceLink>)}
    <p>{INFORMATION_SOURCE_NOTE}</p>
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
