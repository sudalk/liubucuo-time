// 通用工具：ID 生成、时间处理、字符串归一

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function offsetDate(days: number, base: Date = new Date()): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

function zonedParts(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(date);
  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

export function normalizeEventName(name: string): string {
  return name.trim().replace(/\s+/g, "").toLowerCase();
}

export function dateKey(d: Date = new Date(), timezone: string = DEFAULT_TIME_ZONE): string {
  const parts = zonedParts(d, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function nowUtc(): string {
  return new Date().toISOString();
}

export function toLocalIso(utcIso: string, timezone: string = DEFAULT_TIME_ZONE): string {
  try {
    const parts = zonedParts(new Date(utcIso), timezone);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  } catch {
    const parts = zonedParts(new Date(utcIso), DEFAULT_TIME_ZONE);
    return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  }
}

/** 将用户填写的时区本地日期/时间转换成 UTC。用于按“北京时间的一天”查询，不依赖 Worker 所在时区。 */
export function zonedDateTimeToUtc(date: string, time: string, timezone: string = DEFAULT_TIME_ZONE): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const localAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  const parts = zonedParts(new Date(localAsUtc), timezone);
  const renderedAsUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second));
  return new Date(localAsUtc - (renderedAsUtc - localAsUtc)).toISOString();
}

export function durationMinutes(startUtc: string, endUtc: string = nowUtc()): number {
  const ms = new Date(endUtc).getTime() - new Date(startUtc).getTime();
  return Math.max(1, Math.round(ms / 60000));
}

export function jsonParseSafe<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
