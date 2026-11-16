import { Sentences } from './Sentences';
type ToastProps = { message: string | null };
export function Toast({ message }: ToastProps) { return message ? <div className="toast" role="status"><Sentences text={message} /></div> : null; }