import { useRef, useState } from "react";
import { eventColor } from "../lib/eventColor";

export interface BubbleEvent {
  id?: string;
  name: string;
}

interface BubbleCloudProps {
  events: BubbleEvent[];
  selectedName: string | null;
  onSelect: (event: BubbleEvent) => void;
  title?: string;
  helperText?: string;
  onDelete?: (event: BubbleEvent) => void;
  onAdd?: () => void;
  adding?: boolean;
  newEventName?: string;
  onNewEventNameChange?: (v: string) => void;
  onAddConfirm?: () => void;
  onAddCancel?: () => void;
}

export function BubbleCloud({
  events,
  selectedName,
  onSelect,
  onAdd,
  adding,
  newEventName,
  onNewEventNameChange,
  onAddConfirm,
  onAddCancel,
  title = "事件",
  helperText,
  onDelete
}: BubbleCloudProps) {
  const canAdd = Boolean(onAdd && onNewEventNameChange && onAddConfirm && onAddCancel);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clearHold = () => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
  };

  const revealDelete = (event: BubbleEvent) => {
    if (!onDelete) return;
    longPressed.current = true;
    setDeleteTarget(event.id ?? event.name);
  };

  return (
    <section className="bubble-section" aria-label={title}>
      <div className="bubble-head">
        <div>
          <h2>{title}</h2>
        </div>
        {helperText && <span className="bubble-helper">{helperText}</span>}
        {canAdd && (
          <button className="icon-add-btn" onClick={onAdd} aria-label="添加事件">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>
      <div className="bubble-cloud">
        {events.length === 0 && !adding && (
          <p className="subtle">{canAdd ? "还没有事件。点右上角加号添加。" : "昨日还没有记录。"}</p>
        )}
        {events.map((event) => {
          const eventKey = event.id ?? event.name;
          const isDeleteVisible = deleteTarget === eventKey;
          return (
            <div key={eventKey} className={`bubble-item${isDeleteVisible ? " is-delete-ready" : ""}`}>
              <button
                className={`bubble-tag${event.name === selectedName ? " is-selected" : ""}`}
                style={{ ["--bubble" as string]: eventColor(event.name) }}
                onPointerDown={() => {
                  if (!onDelete) return;
                  longPressed.current = false;
                  holdTimer.current = setTimeout(() => revealDelete(event), 620);
                }}
                onPointerUp={clearHold}
                onPointerCancel={clearHold}
                onPointerLeave={clearHold}
                onClick={() => {
                  if (longPressed.current) {
                    longPressed.current = false;
                    return;
                  }
                  setDeleteTarget(null);
                  onSelect(event);
                }}
              >
                {event.name}
              </button>
              {onDelete && isDeleteVisible && (
                <button
                  className="bubble-delete-btn"
                  onClick={() => { setDeleteTarget(null); onDelete(event); }}
                  aria-label={`删除事件 ${event.name}`}
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
        {adding && canAdd && (
          <div className="bubble-tag add-bubble is-active">
            <input
              autoFocus
              value={newEventName ?? ""}
              onChange={(e) => onNewEventNameChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") onAddConfirm?.();
                if (e.key === "Escape") onAddCancel?.();
              }}
              onBlur={onAddConfirm}
              placeholder="事件名"
              className="bubble-input"
            />
          </div>
        )}
      </div>
    </section>
  );
}
