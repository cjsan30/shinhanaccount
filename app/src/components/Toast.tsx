type ToastProps = { message: string | null };
export function Toast({ message }: ToastProps) { return message ? <div className="toast" role="status">{message}</div> : null; }