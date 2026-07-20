import { useMemo, useState } from "react";
import { dateKey, offsetDate } from "../lib/time";

interface DateNavigatorProps {
  value: string;
  onChange: (date: string) => void;
}

function fromKey(value: string): Date {
  return new Date(`${value}T12:00:00+08:00`);
}

function dateWord(value: string): string {
  const today = dateKey();
  if (value === today) return "今";
  if (value === dateKey(offsetDate(-1))) return "昨";
  if (value === dateKey(offsetDate(1))) return "明";
  if (value === dateKey(offsetDate(2))) return "后";
  return "";
}

/** 计划与进展共用的日期条，日历用于快速跳到远日期。 */
export function DateNavigator({ value, onChange }: DateNavigatorProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => {
    const date = fromKey(value);
    return new Date(date.getFullYear(), date.getMonth(), 1, 12);
  });
  const dates = useMemo(() => [-2, -1, 0, 1, 2].map((offset) => offsetDate(offset, fromKey(value))), [value]);
  const firstWeekday = (month.getDay() + 6) % 7;
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((firstWeekday + daysInMonth) / 7) * 7 }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth ? new Date(month.getFullYear(), month.getMonth(), day, 12) : null;
  });
  const openCalendar = () => {
    const selected = fromKey(value);
    setMonth(new Date(selected.getFullYear(), selected.getMonth(), 1, 12));
    setOpen(true);
  };
  const select = (date: Date) => {
    onChange(dateKey(date));
    setOpen(false);
  };

  return (
    <div className="date-navigator">
      <div className="date-strip-wrap">
        <div className="date-strip-head">
          <div className="date-strip-month">{fromKey(value).getFullYear()} 年 {fromKey(value).getMonth() + 1} 月</div>
          <button type="button" className="date-calendar-button" onClick={openCalendar} aria-label="打开日历">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" /><path d="M8 3v4M16 3v4M3.5 10h17M8 14h3M8 17h6" /></svg>
          </button>
        </div>
        <div className="date-strip" aria-label="选择日期">
          {dates.map((date) => {
            const key = dateKey(date);
            return (
              <button key={key} className={`date-pill${key === value ? " is-active" : ""}`} onClick={() => onChange(key)}>
                <b>{date.getDate()}</b>
                <small>{dateWord(key)}</small>
              </button>
            );
          })}
        </div>
      </div>
      {open && (
        <div className="date-calendar-scrim" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="date-calendar-sheet" role="dialog" aria-modal="true" aria-label="选择日期">
            <span className="date-calendar-handle" aria-hidden="true" />
            <header className="date-calendar-head">
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1, 12))} aria-label="上个月">‹</button>
              <strong>{month.getFullYear()} 年 {month.getMonth() + 1} 月</strong>
              <button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1, 12))} aria-label="下个月">›</button>
            </header>
            <div className="date-calendar-weekdays" aria-hidden="true">{["一", "二", "三", "四", "五", "六", "日"].map((day) => <span key={day}>{day}</span>)}</div>
            <div className="date-calendar-grid">
              {cells.map((date, index) => date ? (
                <button key={dateKey(date)} type="button" className={`${dateKey(date) === value ? "is-selected" : ""}${dateKey(date) === dateKey() ? " is-today" : ""}`} onClick={() => select(date)}>{date.getDate()}</button>
              ) : <span key={`empty-${index}`} />)}
            </div>
            <button type="button" className="date-calendar-today" onClick={() => select(new Date())}>回到今天</button>
          </section>
        </div>
      )}
    </div>
  );
}
