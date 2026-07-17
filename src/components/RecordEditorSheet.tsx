import type { ReactNode } from "react";

interface RecordEditorSheetProps {
  title: string;
  children: ReactNode;
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
}

/** 计划、进展共用的编辑底部弹层，避免把表单塞进列表行。 */
export function RecordEditorSheet({ title, children, onCancel, onSave, saveLabel = "保存" }: RecordEditorSheetProps) {
  return (
    <div className="record-editor-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onCancel(); }}>
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
            <span>时间记录</span>
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
