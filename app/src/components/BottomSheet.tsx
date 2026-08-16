import { useEffect, type ReactNode } from 'react';
import { X } from '@phosphor-icons/react';

type BottomSheetProps = { title: string; onClose: () => void; children: ReactNode };
export function BottomSheet({ title, onClose, children }: BottomSheetProps) {
  useEffect(() => { const previous = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = previous; }; }, []);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={onClose}><section className="sheet" role="dialog" aria-modal="true" aria-label={title} onMouseDown={event => event.stopPropagation()}><div className="sheet__handle" /><header><h2>{title}</h2><button type="button" aria-label={`${title} 닫기`} onClick={onClose}><X size={22} /></button></header>{children}</section></div>;
}