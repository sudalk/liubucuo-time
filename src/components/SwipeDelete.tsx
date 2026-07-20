import { useRef, useState, type MouseEvent, type ReactNode, type TouchEvent } from "react";

interface SwipeDeleteProps {
  children: ReactNode;
  onDelete: () => void;
  label: string;
}

/** 手机列表的左滑删除。删除操作不常驻在卡片上，避免误触。 */
export function SwipeDelete({ children, onDelete, label }: SwipeDeleteProps) {
  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const gestureStartX = useRef<number | null>(null);
  const gestureStartY = useRef<number | null>(null);
  const gestureStartOffset = useRef(0);
  const swiping = useRef(false);
  const suppressClick = useRef(false);
  const actionWidth = 64;
  const offset = isDragging ? dragOffset : open ? -actionWidth : 0;

  const beginGesture = (clientX: number, clientY: number) => {
    gestureStartX.current = clientX;
    gestureStartY.current = clientY;
    gestureStartOffset.current = open ? -actionWidth : 0;
    swiping.current = false;
    setIsDragging(false);
    setDragOffset(open ? -actionWidth : 0);
  };

  const moveGesture = (clientX: number, clientY: number, preventDefault: () => void) => {
    const start = gestureStartX.current;
    const startY = gestureStartY.current;
    if (start == null || startY == null) return;
    const dx = clientX - start;
    const dy = clientY - startY;

    if (!swiping.current) {
      if (Math.abs(dx) < 8) return;
      if (Math.abs(dy) > Math.abs(dx) * 1.1) return;
      swiping.current = true;
      setIsDragging(true);
    }

    preventDefault();
    setDragOffset(Math.max(-actionWidth, Math.min(0, gestureStartOffset.current + dx)));
  };

  const finishGesture = (clientX: number) => {
    const start = gestureStartX.current;
    if (start == null) return;
    const delta = clientX - start;
    const finalOffset = Math.max(-actionWidth, Math.min(0, gestureStartOffset.current + delta));
    const wasSwiping = swiping.current;
    gestureStartX.current = null;
    gestureStartY.current = null;
    swiping.current = false;
    setIsDragging(false);
    setDragOffset(0);
    suppressClick.current = wasSwiping;

    if (!wasSwiping) return;

    if (delta >= 18) {
      setOpen(false);
      return;
    }
    setOpen(delta <= -24 || finalOffset <= -actionWidth * 0.34);
  };

  const cancelGesture = () => {
    gestureStartX.current = null;
    gestureStartY.current = null;
    swiping.current = false;
    setIsDragging(false);
    setDragOffset(0);
  };

  return (
    <div className={`swipe-delete${open ? " is-open" : ""}${isDragging ? " is-dragging" : ""}`}>
      <button className="swipe-delete-action" onClick={onDelete} aria-label={`删除${label}`} tabIndex={open ? 0 : -1} style={{ pointerEvents: open ? "auto" : "none" }}>
        <span aria-hidden="true">删除</span>
      </button>
      <div
        className="swipe-delete-content"
        style={{ transform: `translateX(${offset}px)` }}
        onTouchStart={(event: TouchEvent<HTMLDivElement>) => {
          const touch = event.touches[0];
          if (!touch) return;
          beginGesture(touch.clientX, touch.clientY);
        }}
        onTouchMove={(event: TouchEvent<HTMLDivElement>) => {
          const touch = event.touches[0];
          if (!touch) return;
          moveGesture(touch.clientX, touch.clientY, () => event.preventDefault());
        }}
        onTouchEnd={(event: TouchEvent<HTMLDivElement>) => {
          const touch = event.changedTouches[0];
          finishGesture(touch?.clientX ?? gestureStartX.current ?? 0);
        }}
        onTouchCancel={cancelGesture}
        onMouseDown={(event: MouseEvent<HTMLDivElement>) => {
          if (event.button !== 0) return;
          beginGesture(event.clientX, event.clientY);
        }}
        onMouseMove={(event: MouseEvent<HTMLDivElement>) => {
          moveGesture(event.clientX, event.clientY, () => event.preventDefault());
        }}
        onMouseUp={(event: MouseEvent<HTMLDivElement>) => {
          finishGesture(event.clientX);
        }}
        onMouseLeave={() => {
          if (isDragging) finishGesture(gestureStartX.current ?? 0);
        }}
        onClickCapture={(event) => {
          if (!open && !suppressClick.current) return;
          event.stopPropagation();
          event.preventDefault();
          suppressClick.current = false;
          if (open) setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
