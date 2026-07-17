import { useEffect, useRef } from "react";

interface TimeWheelProps {
  value: string; // "HH:MM"
  kind: "start" | "duration";
  onChange: (value: string) => void;
}

const ROW_HEIGHT = 32;
const HOUR_COUNT = 24;
const MINUTE_COUNT = 60;

// 用 WeakMap 存定时器，避免污染 DOM 类型
const timers = new WeakMap<HTMLDivElement, ReturnType<typeof setTimeout>>();

/**
 * 双列时间滚轮：手机闹钟式小时/分钟选择器
 * 迁移自原型 initTimeWheels / setWheelValue
 */
export function TimeWheel({ value, kind, onChange }: TimeWheelProps) {
  const [hour, minute] = value.split(":").map(Number);
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);
  const readyRef = useRef<{ hour: boolean; minute: boolean }>({ hour: false, minute: false });

  useEffect(() => {
    if (hourRef.current) {
      hourRef.current.scrollTop = hour * ROW_HEIGHT;
      requestAnimationFrame(() => {
        readyRef.current.hour = true;
      });
    }
    if (minuteRef.current) {
      minuteRef.current.scrollTop = minute * ROW_HEIGHT;
      requestAnimationFrame(() => {
        readyRef.current.minute = true;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScroll = (unit: "hour" | "minute", el: HTMLDivElement) => {
    if (!readyRef.current[unit]) return;
    const max = unit === "hour" ? HOUR_COUNT - 1 : MINUTE_COUNT - 1;
    const next = Math.max(0, Math.min(max, Math.round(el.scrollTop / ROW_HEIGHT)));
    const newHour = unit === "hour" ? next : hour;
    const newMinute = unit === "minute" ? next : minute;
    const m = kind === "duration" && newHour === 0 && newMinute === 0 ? 1 : newMinute;
    const newValue = `${pad(newHour)}:${pad(m)}`;
    if (newValue !== value) {
      onChange(newValue);
    }
    el.scrollTo({ top: next * ROW_HEIGHT, behavior: "smooth" });
  };

  const onScroll = (unit: "hour" | "minute", el: HTMLDivElement) => {
    const prev = timers.get(el);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => handleScroll(unit, el), 90);
    timers.set(el, t);
  };

  const clickOption = (unit: "hour" | "minute", idx: number, el: HTMLDivElement) => {
    readyRef.current[unit] = false;
    el.scrollTo({ top: idx * ROW_HEIGHT, behavior: "smooth" });
    const newHour = unit === "hour" ? idx : hour;
    const newMinute = unit === "minute" ? idx : minute;
    const m = kind === "duration" && newHour === 0 && newMinute === 0 ? 1 : newMinute;
    onChange(`${pad(newHour)}:${pad(m)}`);
    setTimeout(() => (readyRef.current[unit] = true), 100);
  };

  return (
    <div className="time-wheel" data-wheel-kind={kind}>
      <div className="time-wheel-labels">
        <span>小时</span>
        <span>分钟</span>
      </div>
      <div className="time-wheel-body">
        <div
          ref={hourRef}
          className="time-wheel-column"
          onScroll={(e) => onScroll("hour", e.currentTarget)}
        >
          {Array.from({ length: HOUR_COUNT }, (_, i) => (
            <div
              key={i}
              className={`time-wheel-option${i === hour ? " is-selected" : ""}`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => hourRef.current && clickOption("hour", i, hourRef.current)}
            >
              {pad(i)}
            </div>
          ))}
        </div>
        <span className="time-wheel-colon">:</span>
        <div
          ref={minuteRef}
          className="time-wheel-column"
          onScroll={(e) => onScroll("minute", e.currentTarget)}
        >
          {Array.from({ length: MINUTE_COUNT }, (_, i) => (
            <div
              key={i}
              className={`time-wheel-option${i === minute ? " is-selected" : ""}`}
              style={{ height: ROW_HEIGHT }}
              onClick={() => minuteRef.current && clickOption("minute", i, minuteRef.current)}
            >
              {pad(i)}
            </div>
          ))}
        </div>
      </div>
      <small className="autosave-note">
        {kind === "duration" ? `${hour}小时 ${minute}分钟` : "滑动即自动保存"}
      </small>
    </div>
  );
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

