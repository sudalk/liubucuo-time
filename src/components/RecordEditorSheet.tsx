import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { Keyboard, type KeyboardInfo } from "@capacitor/keyboard";
import { useEffect, useState, type ReactNode } from "react";

interface RecordEditorSheetProps {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSave: () => void;
  kicker?: string;
  saveLabel?: string;
}

/** 计划、进展共用的编辑底部弹层，避免把表单塞进列表行。 */
export function RecordEditorSheet({ title, children, onCancel, onSave, kicker = "时间记录", saveLabel = "保存" }: RecordEditorSheetProps) {
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    let largestWindowHeight = window.innerHeight;
    let nativeKeyboardOffset = 0;
    let disposed = false;
    const handles: PluginListenerHandle[] = [];

    const applyKeyboardOffset = (keyboardOffset: number, bottomInset: number, availableHeight: number) => {
      if (disposed) return;
      const normalizedKeyboardOffset = Math.max(0, Math.round(keyboardOffset));
      const normalizedBottomInset = Math.max(0, Math.round(bottomInset));
      const normalizedAvailableHeight = Math.max(260, Math.round(availableHeight));
      const sheetMaxHeight = Math.max(240, Math.min(520, normalizedAvailableHeight - 92));
      root.style.setProperty("--editor-viewport-height", `${Math.round(window.innerHeight)}px`);
      root.style.setProperty("--keyboard-offset", `${normalizedKeyboardOffset}px`);
      root.style.setProperty("--keyboard-bottom-inset", `${normalizedBottomInset}px`);
      root.style.setProperty("--editor-sheet-max-height", `${sheetMaxHeight}px`);
      root.style.setProperty("--keyboard-gap", normalizedKeyboardOffset > 0 ? "12px" : "0px");
      root.toggleAttribute("data-editor-keyboard-open", normalizedKeyboardOffset > 0);
      setKeyboardOpen(normalizedKeyboardOffset > 0);
    };

    const updateKeyboardOffset = () => {
      const viewport = window.visualViewport;
      largestWindowHeight = Math.max(largestWindowHeight, window.innerHeight);
      const visualOffset = viewport ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop) : 0;
      const resizeOffset = Math.max(0, largestWindowHeight - window.innerHeight);
      const keyboardOffset = Math.max(nativeKeyboardOffset, visualOffset, resizeOffset);
      const webviewAlreadyResized = resizeOffset > 80 && resizeOffset >= keyboardOffset * 0.45;
      const bottomInset = webviewAlreadyResized ? 0 : Math.max(nativeKeyboardOffset, visualOffset);
      const availableHeight = Math.max(260, window.innerHeight - bottomInset);
      applyKeyboardOffset(keyboardOffset, bottomInset, availableHeight);
    };

    const showFromNative = (info: KeyboardInfo) => {
      nativeKeyboardOffset = info.keyboardHeight || nativeKeyboardOffset;
      updateKeyboardOffset();
    };
    const hideFromNative = () => {
      nativeKeyboardOffset = 0;
      updateKeyboardOffset();
    };

    updateKeyboardOffset();
    if (Capacitor.isNativePlatform()) {
      void Keyboard.addListener("keyboardWillShow", showFromNative).then((handle) => handles.push(handle));
      void Keyboard.addListener("keyboardDidShow", showFromNative).then((handle) => handles.push(handle));
      void Keyboard.addListener("keyboardWillHide", hideFromNative).then((handle) => handles.push(handle));
      void Keyboard.addListener("keyboardDidHide", hideFromNative).then((handle) => handles.push(handle));
    }
    window.visualViewport?.addEventListener("resize", updateKeyboardOffset);
    window.visualViewport?.addEventListener("scroll", updateKeyboardOffset);
    window.addEventListener("resize", updateKeyboardOffset);
    window.addEventListener("focusin", updateKeyboardOffset);
    window.addEventListener("focusout", updateKeyboardOffset);
    return () => {
      disposed = true;
      handles.forEach((handle) => { void handle.remove(); });
      root.style.removeProperty("--editor-viewport-height");
      root.style.removeProperty("--editor-sheet-max-height");
      root.style.setProperty("--keyboard-offset", "0px");
      root.style.setProperty("--keyboard-bottom-inset", "0px");
      root.style.setProperty("--keyboard-gap", "0px");
      root.removeAttribute("data-editor-keyboard-open");
      window.visualViewport?.removeEventListener("resize", updateKeyboardOffset);
      window.visualViewport?.removeEventListener("scroll", updateKeyboardOffset);
      window.removeEventListener("resize", updateKeyboardOffset);
      window.removeEventListener("focusin", updateKeyboardOffset);
      window.removeEventListener("focusout", updateKeyboardOffset);
    };
  }, []);

  return (
    <div className={`record-editor-scrim${keyboardOpen ? " is-keyboard-open" : ""}`} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
      <section
        className="record-editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <span className="record-editor-handle" aria-hidden="true" />
        <header className="record-editor-head">
          <div>
            {kicker && <span>{kicker}</span>}
            <h2>{title}</h2>
          </div>
          <button type="button" className="record-editor-close" onClick={onCancel} aria-label="关闭">×</button>
        </header>
        <div className="record-editor-body">{children}</div>
        <footer className="record-editor-actions">
          <button type="button" className="record-editor-cancel" onClick={onCancel}>取消</button>
          <button type="button" className="record-editor-save" onClick={onSave}>{saveLabel}</button>
        </footer>
      </section>
    </div>
  );
}
