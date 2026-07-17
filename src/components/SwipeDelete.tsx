import { useRef, useState, type ReactNode } from "react";

interface SwipeDeleteProps {
  children: ReactNode;
  onDelete: () => void;
  label: string;
}

/** 手机列表的左滑删除。删除操作不常驻在卡片上，避免误触。 */
export function SwipeDelete({ children, onDelete, label }: SwipeDeleteProps) {
  const [open, setOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  return (
    <div className="swipe-delete">
      <button className="swipe-delete-action" onClick={onDelete} aria-label={`删除${label}`} tabIndex={open ? 0 : -1} style={{ pointerEvents: open ? "auto" : "none" }}>删除</button>
      <div
        className="swipe-delete-content"
        style={{ transform: open ? "translateX(-86px)" : "translateX(0)" }}
        onTouchStart={(event) => { touchStartX.current = event.touches[0]?.clientX ?? null; }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          const end = event.changedTouches[0]?.clientX;
          touchStartX.current = null;
          if (start == null || end == null) return;
          const delta = end - start;
          if (delta <= -38) setOpen(true);
          if (delta >= 24) setOpen(false);
        }}
        onTouchCancel={() => { touchStartX.current = null; setOpen(false); }}
        onClickCapture={(event) => {
          if (!open) return;
          event.stopPropagation();
          setOpen(false);
        }}
      >
        {children}
      </div>
    </div>
  );
}
