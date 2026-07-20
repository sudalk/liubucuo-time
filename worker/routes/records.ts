import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { and, eq, gte, lt, asc, desc } from "drizzle-orm";
import { getDb } from "../lib/db";
import { activeTimers, timeRecords, users } from "../schema";
import { newId, normalizeEventName, nowUtc, durationMinutes, dateKey, DEFAULT_TIME_ZONE, toLocalIso, zonedDateTimeToUtc } from "../lib/utils";

const records = new Hono<HonoEnv>();

async function userTimeZone(userId: string, db: ReturnType<typeof getDb>): Promise<string> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return user?.timezone || DEFAULT_TIME_ZONE;
}

// ────────────────────────────────────────────────────────────────
// 活动计时器：单计时器约束（MVP 阶段用表唯一约束）
// ────────────────────────────────────────────────────────────────

// 读取当前活动计时器
records.get("/active", async (c) => {
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const timer = await db.query.activeTimers.findFirst({ where: eq(activeTimers.userId, userId) });
  if (!timer) return c.json({ timer: null });
  const timezone = await userTimeZone(userId, db);
  return c.json({ timer: { ...timer, startLocal: toLocalIso(timer.startUtc, timezone) } });
});

// 开始计时
records.post("/start", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{ eventName: string; statusProgress?: number }>().catch(
    () => ({ eventName: "", statusProgress: undefined })
  );
  const eventName = body.eventName?.trim();
  if (!eventName) return c.json({ error: "eventName is required" }, 400);

  const normalized = normalizeEventName(eventName);
  const startUtc = nowUtc();
  const status = body.statusProgress ?? 90;

  const db = getDb(c.env);
  const timezone = await userTimeZone(userId, db);
  const startLocal = toLocalIso(startUtc, timezone);

  // upsert：同一用户同一时刻只有一个计时器
  await db
    .insert(activeTimers)
    .values({
      userId,
      eventName,
      normalizedName: normalized,
      startUtc,
      startLocal,
      statusProgress: status,
      updatedAt: startUtc
    })
    .onConflictDoUpdate({
      target: activeTimers.userId,
      set: {
        eventName,
        normalizedName: normalized,
        startUtc,
        startLocal,
        statusProgress: status,
        updatedAt: startUtc
      }
    });

  return c.json({ ok: true, timer: { userId, eventName, normalizedName: normalized, startUtc, startLocal, statusProgress: status } });
});

// 结束计时：把活动计时器落成一条 timeRecord
records.post("/stop", async (c) => {
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const timer = await db.query.activeTimers.findFirst({ where: eq(activeTimers.userId, userId) });
  if (!timer) return c.json({ error: "no active timer" }, 400);

  const endUtc = nowUtc();
  const duration = durationMinutes(timer.startUtc, endUtc);
  const timezone = await userTimeZone(userId, db);

  const id = newId("r");
  await db
    .insert(timeRecords)
    .values({
      id,
      userId,
      eventName: timer.eventName,
      normalizedName: timer.normalizedName,
      startUtc: timer.startUtc,
      startLocal: toLocalIso(timer.startUtc, timezone),
      endUtc,
      endLocal: toLocalIso(endUtc, timezone),
      durationMinutes: duration,
      statusProgress: timer.statusProgress ?? 50,
      source: "manual",
      isMainSleep: false,
      createdAt: endUtc
    });

  await db.delete(activeTimers).where(eq(activeTimers.userId, userId));

  return c.json({ ok: true, record: { id, durationMinutes: duration } });
});

// 更新计时中的状态进度
records.patch("/active/status", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{ statusProgress: number }>().catch(() => ({ statusProgress: 50 }));
  const status = Math.max(0, Math.min(100, Math.round(body.statusProgress ?? 50)));
  const db = getDb(c.env);
  await db
    .update(activeTimers)
    .set({ statusProgress: status, updatedAt: nowUtc() })
    .where(eq(activeTimers.userId, userId));
  return c.json({ ok: true, statusProgress: status });
});

// ────────────────────────────────────────────────────────────────
// 时间记录查询/修改
// ────────────────────────────────────────────────────────────────

// 按日期查询
records.get("/", async (c) => {
  const userId = c.get("userId")!;
  const date = c.req.query("date") ?? dateKey();
  const db = getDb(c.env);
  const timezone = await userTimeZone(userId, db);
  const dayStartUtc = zonedDateTimeToUtc(date, "00:00:00", timezone);
  const nextDate = dateKey(new Date(new Date(`${date}T12:00:00Z`).getTime() + 24 * 60 * 60 * 1000), timezone);
  const dayEndUtc = zonedDateTimeToUtc(nextDate, "00:00:00", timezone);

  // 用 UTC 精确圈定用户时区中的一天。旧数据即使曾错误写入 startLocal，也会立即正确展示。
  const rows = await db.query.timeRecords.findMany({
    where: and(
      eq(timeRecords.userId, userId),
      gte(timeRecords.startUtc, dayStartUtc),
      lt(timeRecords.startUtc, dayEndUtc)
    ),
    orderBy: [asc(timeRecords.startUtc)]
  });
  return c.json({ records: rows.map((row) => ({
    ...row,
    startLocal: toLocalIso(row.startUtc, timezone),
    endLocal: row.endUtc ? toLocalIso(row.endUtc, timezone) : null
  })) });
});

// 历史进展搜索：只返回真实时间记录，不混入当天计划对比结果。
records.get("/search", async (c) => {
  const userId = c.get("userId")!;
  const query = normalizeEventName(c.req.query("q") ?? "");
  const rawLimit = Number(c.req.query("limit") ?? 300);
  const rawOffset = Number(c.req.query("offset") ?? 0);
  const status = c.req.query("status") ?? "all";
  const limit = Math.max(1, Math.min(80, Number.isFinite(rawLimit) ? rawLimit : 40));
  const offset = Math.max(0, Number.isFinite(rawOffset) ? rawOffset : 0);
  const db = getDb(c.env);
  const timezone = await userTimeZone(userId, db);
  const rows = await db.query.timeRecords.findMany({
    where: eq(timeRecords.userId, userId),
    orderBy: [desc(timeRecords.startUtc)]
  });
  const byQuery = query
    ? rows.filter((row) => (
      row.normalizedName.includes(query) ||
      normalizeEventName(row.eventName).includes(query) ||
      normalizeEventName(row.note ?? "").includes(query)
    ))
    : rows;
  const filtered = byQuery.filter((row) => {
    const value = row.statusProgress ?? 60;
    if (status === "poor") return value <= 45;
    if (status === "medium") return value > 45 && value <= 75;
    if (status === "good") return value > 75;
    return true;
  });
  const page = filtered.slice(offset, offset + limit);
  return c.json({ records: page.map((row) => ({
    ...row,
    startLocal: toLocalIso(row.startUtc, timezone),
    endLocal: row.endUtc ? toLocalIso(row.endUtc, timezone) : null
  })), nextOffset: offset + page.length, hasMore: offset + page.length < filtered.length });
});

// 补录一条已完成的历史记录。此接口不会读写 activeTimers，和主页开始/结束计时完全隔离。
records.post("/", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{
    eventName?: string;
    startUtc?: string;
    endUtc?: string;
    statusProgress?: number;
    note?: string;
  }>().catch(() => ({
    eventName: undefined,
    startUtc: undefined,
    endUtc: undefined,
    statusProgress: undefined,
    note: undefined
  }));
  const eventName = body.eventName?.trim();
  const startUtc = body.startUtc;
  const endUtc = body.endUtc;
  if (!eventName || !startUtc || !endUtc || Number.isNaN(new Date(startUtc).getTime()) || Number.isNaN(new Date(endUtc).getTime())) {
    return c.json({ error: "eventName, startUtc and endUtc are required" }, 400);
  }
  if (new Date(endUtc).getTime() <= new Date(startUtc).getTime()) {
    return c.json({ error: "endUtc must be after startUtc" }, 400);
  }

  const db = getDb(c.env);
  const timezone = await userTimeZone(userId, db);
  const id = newId("r");
  const status = Math.max(0, Math.min(100, Math.round(body.statusProgress ?? 60)));
  await db.insert(timeRecords).values({
    id,
    userId,
    eventName,
    normalizedName: normalizeEventName(eventName),
    startUtc,
    startLocal: toLocalIso(startUtc, timezone),
    endUtc,
    endLocal: toLocalIso(endUtc, timezone),
    durationMinutes: durationMinutes(startUtc, endUtc),
    statusProgress: status,
    source: "manual",
    note: body.note ?? null,
    isMainSleep: false,
    createdAt: nowUtc()
  });
  return c.json({ ok: true, record: { id } }, 201);
});

// 修改记录
records.patch("/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");
  const body = await c.req.json<{
    eventName?: string;
    startUtc?: string;
    endUtc?: string;
    statusProgress?: number;
    note?: string;
    isMainSleep?: boolean;
  }>().catch(() => ({
    eventName: undefined,
    startUtc: undefined,
    endUtc: undefined,
    statusProgress: undefined,
    note: undefined,
    isMainSleep: undefined
  }));

  const db = getDb(c.env);
  const existing = await db.query.timeRecords.findFirst({ where: and(eq(timeRecords.id, id), eq(timeRecords.userId, userId)) });
  if (!existing) return c.json({ error: "not found" }, 404);

  const startUtc = body.startUtc ?? existing.startUtc;
  const endUtc = body.endUtc ?? existing.endUtc;
  if (endUtc && new Date(endUtc).getTime() <= new Date(startUtc).getTime()) {
    return c.json({ error: "endUtc must be after startUtc" }, 400);
  }
  const duration = endUtc ? durationMinutes(startUtc, endUtc) : existing.durationMinutes;
  const timezone = await userTimeZone(userId, db);

  await db
    .update(timeRecords)
    .set({
      eventName: body.eventName ?? existing.eventName,
      normalizedName: body.eventName ? normalizeEventName(body.eventName) : existing.normalizedName,
      startUtc,
      startLocal: toLocalIso(startUtc, timezone),
      endUtc,
      endLocal: endUtc ? toLocalIso(endUtc, timezone) : null,
      durationMinutes: duration,
      statusProgress: body.statusProgress ?? existing.statusProgress,
      note: body.note ?? existing.note,
      isMainSleep: body.isMainSleep ?? existing.isMainSleep,
      revisedAt: nowUtc()
    })
    .where(eq(timeRecords.id, id));

  return c.json({ ok: true });
});

// 删除记录
records.delete("/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  await db.delete(timeRecords).where(and(eq(timeRecords.id, id), eq(timeRecords.userId, userId)));
  return c.json({ ok: true });
});

export default records;
