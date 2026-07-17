import { useToastStore } from "../stores/toast";

export function Toast() {
  const message = useToastStore((s) => s.message);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className={`toast${message ? " show" : ""}`} role="status" aria-live="polite" aria-hidden={!message}>
      <button type="button" tabIndex={message ? 0 : -1} onClick={dismiss} aria-label="关闭提示">
        <span aria-hidden="true">✓</span>
        <span>{message}</span>
      </button>
    </div>
  );
}
