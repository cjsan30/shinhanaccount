import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, X } from '@phosphor-icons/react';

type BottomSheetProps = { title: string; onClose: () => void; onBack?: () => void; children: ReactNode };
export function BottomSheet({ title, onClose, onBack, children }: BottomSheetProps) {
  const sheetRef = useRef<HTMLElement>(null);
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);
  useEffect(() => { if (sheetRef.current) sheetRef.current.scrollTop = 0; }, [title]);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section ref={sheetRef} className="sheet" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}><div className="sheet__handle" /><header>{onBack && <button type="button" className="sheet-back" aria-label="이전 화면으로 돌아가기" onClick={onBack}><ArrowLeft size={24} /></button>}<h2>{title}</h2><button type="button" aria-label={title + ' 닫기'} onClick={onClose}><X size={22} /></button></header>{children}</section></div>;
}
