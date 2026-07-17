import { useEffect, useRef, useState } from "react";

interface AppTimePickerProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  minuteStep?: number;
  hourMin?: number;
  hourMax?: number;
  dayOffset?: 0 | 1;
  onDayOffsetChange?: (offset: 0 | 1) => void;
}

const ROW_HEIGHT = 46;

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function parseHHMM(value: string): { h: number; m: number } {
  const [h = 0, m = 0] = value.split(":").map(Number);
  return { h: Number.isFinite(h) ? h : 0, m: Number.isFinite(m) ? m : 0 };
}

/** 应用内时分滚轮。只在点击字段后出现，不使用 Android 的原生 select。 */
export function AppTimePicker({
  value,
  onChange,
  label,
  minuteStep = 1,
  hourMin = 0,
  hourMax = 23,
  dayOffset = 0,
  onDayOffsetChange
}: AppTimePickerProps) {
  const { h, m } = parseHHMM(value);
  const hours = Array.from({ length: hourMax - hourMin + 1 }, (_, index) => hourMin + index);
  const minutes = Array.from({ length: Math.floor(60 / minuteStep) }, (_, index) => index * minuteStep);
  const normalizedMinute = minutes.includes(Math.round(m / minuteStep) * minuteStep) ? Math.round(m / minuteStep) * minuteStep : 0;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState({ h: hours.includes(h) ? h : hourMin, m: normalizedMinute });
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const scrollTimer = useRef<number | null>(null);

  const openPicker = () => {
    setDraft({ h: hours.includes(h) ? h : hourMin, m: normalizedMinute });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      if (hourRef.current) hourRef.current.scrollTop = Math.max(0, hours.indexOf(draft.h)) * ROW_HEIGHT;
      if (minuteRef.current) minuteRef.current.scrollTop = Math.max(0, minutes.indexOf(draft.m)) * ROW_HEIGHT;
    });
    return () => cancelAnimationFrame(frame);
    // 只在每次打开时滚到当前值。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const syncWheel = (kind: "hour" | "minute", element: HTMLDivElement) => {
    if (scrollTimer.current) window.clearTimeout(scrollTimer.current);
    scrollTimer.current = window.setTimeout(() => {
      const options = kind === "hour" ? hours : minutes;
      const index = Math.max(0, Math.min(options.length - 1, Math.round(element.scrollTop / ROW_HEIGHT)));
      const selected = options[index];
      setDraft((current) => kind === "hour" ? { ...current, h: selected } : { ...current, m: selected });
      element.scrollTo({ top: index * ROW_HEIGHT, behavior: "smooth" });
    }, 70);
  };

  const choose = (kind: "hour" | "minute", option: number) => {
    const options = kind === "hour" ? hours : minutes;
    setDraft((current) => kind === "hour" ? { ...current, h: option } : { ...current, m: option });
    const element = kind === "hour" ? hourRef.current : minuteRef.current;
    element?.scrollTo({ top: options.indexOf(option) * ROW_HEIGHT, behavior: "smooth" });
  };

  const complete = () => {
    onChange(`${pad(draft.h)}:${pad(draft.m)}`);
    setOpen(false);
  };

  return (
    <div className="app-time-picker">
      {label && <span className="app-time-label">{label}</span>}
      <button type="button" className="app-time-trigger" onClick={openPicker} aria-haspopup="dialog">
        <span>{pad(hours.includes(h) ? h : hourMin)}:{pad(normalizedMinute)}</span>
        {dayOffset === 1 && <small>次日</small>}
        <i aria-hidden="true">⌄</i>
      </button>
      {open && (
        <div className="time-sheet-scrim" role="presentation" onMouseDown={() => setOpen(false)}>
          <section className="time-sheet time-wheel-sheet" role="dialog" aria-modal="true" aria-label={`选择${label ?? "时间"}`} onMouseDown={(event) => event.stopPropagation()}>
            <div className="time-sheet-head">
              <button type="button" onClick={() => setOpen(false)}>取消</button>
              <strong>{label ?? "选择时间"}</strong>
              <button type="button" onClick={complete}>完成</button>
            </div>
            {onDayOffsetChange && (
              <div className="time-sheet-day-switch" role="group" aria-label="结束日期">
                <button type="button" className={dayOffset === 0 ? "is-active" : ""} onClick={() => onDayOffsetChange(0)}>当天</button>
                <button type="button" className={dayOffset === 1 ? "is-active" : ""} onClick={() => onDayOffsetChange(1)}>次日</button>
              </div>
            )}
            <div className="time-wheel-picker" aria-label="滑动选择时分">
              <div ref={hourRef} className="time-wheel-column" onScroll={(event) => syncWheel("hour", event.currentTarget)}>
                {hours.map((hour) => <button type="button" key={hour} className={draft.h === hour ? "is-selected" : ""} onClick={() => choose("hour", hour)}>{pad(hour)}</button>)}
              </div>
              <span>时</span>
              <div ref={minuteRef} className="time-wheel-column" onScroll={(event) => syncWheel("minute", event.currentTarget)}>
                {minutes.map((minute) => <button type="button" key={minute} className={draft.m === minute ? "is-selected" : ""} onClick={() => choose("minute", minute)}>{pad(minute)}</button>)}
              </div>
              <span>分</span>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
