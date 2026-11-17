import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, X } from '@phosphor-icons/react';

type BottomSheetProps = { title: string; titleAction?: ReactNode; onClose: () => void; onBack?: () => void; children: ReactNode; initialScrollTop?: number; onScrollPosition?: (top: number) => void };
export function BottomSheet({ title, titleAction, onClose, onBack, children, initialScrollTop = 0, onScrollPosition }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);
  useEffect(() => { if (sheetRef.current) sheetRef.current.scrollTop = initialScrollTop; }, [title, initialScrollTop]);
  // The page behind turns inert while a sheet is open, so focus moves into the sheet; it returns to the opener on close.
  // Read during the first render: once the sheet commits, the page behind turns inert and drops its focus.
  const [opener] = useState(() => document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
  useEffect(() => {
    // The page behind is still inert while this cleanup runs, so focus goes back right after this update.
    return () => { window.setTimeout(() => { if (opener?.isConnected && !opener.closest('[inert]')) opener.focus({ preventScroll: true }); }, 0); };
  }, [opener]);
  // A new screen inside the sheet can remove the focused button; keep focus inside the sheet then.
  useEffect(() => {
    const sheet = sheetRef.current;
    if (sheet && !sheet.contains(document.activeElement)) sheet.focus({ preventScroll: true });
  }, [title]);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section ref={sheetRef} className="sheet" role="dialog" aria-modal="true" tabIndex={-1} aria-label={title} onScroll={(event) => onScrollPosition?.(event.currentTarget.scrollTop)} onMouseDown={event => event.stopPropagation()}><div className="sheet__handle" /><header>{onBack && <button type="button" className="sheet-back" aria-label="이전 화면으로 돌아가기" onClick={onBack}><ArrowLeft size={24} /></button>}<h2>{title}</h2>{titleAction}<button type="button" aria-label={title + ' 닫기'} onClick={onClose}><X size={22} /></button></header>{children}</section></div>;
}
