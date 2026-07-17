import { useEffect, useRef } from "react";
import { useConfirmStore } from "../stores/confirm";

/** 应用内确认框，替代 Android WebView 的浏览器 confirm。 */
export function ConfirmDialog() {
  const message = useConfirmStore((s) => s.message);
  const close = useConfirmStore((s) => s.close);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!message) return;
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [message, close]);

  if (!message) return null;
  return (
    <div className="confirm-scrim" role="presentation" onMouseDown={() => close(false)}>
      <section
        className="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title">确认操作</h2>
        <p>{message}</p>
        <div className="confirm-actions">
          <button ref={cancelRef} className="confirm-button is-cancel" onClick={() => close(false)}>取消</button>
          <button className="confirm-button is-confirm" onClick={() => close(true)}>确认</button>
        </div>
      </section>
    </div>
  );
}
