// 时间格式化工具

export const APP_TIME_ZONE = "Asia/Shanghai";

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function formatDurationSeconds(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}

export function timeText(iso: string): string {
  return new Date(iso).toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: APP_TIME_ZONE
  });
}

export function dateLabel(d: Date = new Date()): string {
  return d.toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long", timeZone: APP_TIME_ZONE });
}

export function dateKey(d: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(d);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function offsetDate(days: number, base: Date = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}
