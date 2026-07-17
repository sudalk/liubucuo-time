import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { and, eq, gte, lt, desc } from "drizzle-orm";
import { getDb } from "../lib/db";
import { events, timeRecords, users } from "../schema";
import { newId, normalizeEventName, nowUtc, dateKey, offsetDate, DEFAULT_TIME_ZONE, zonedDateTimeToUtc, toLocalIso } from "../lib/utils";

const eventsRouter = new Hono<HonoEnv>();

// 历史计划事件去重集合（主页事件区数据源）
eventsRouter.get("/", async (c) => {
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const rows = await db.query.events.findMany({
    where: eq(events.userId, userId),
    orderBy: [desc(events.lastPlanAt)]
  });
  return c.json({ events: rows });
});

// 昨日进展页所有事件去重（计划页事件区数据源）
eventsRouter.get("/yesterday", async (c) => {
  const userId = c.get("userId")!;
  const targetDate = c.req.query("date");
  const anchor = targetDate ? new Date(`${targetDate}T12:00:00`) : new Date();
  const yesterday = dateKey(offsetDate(-1, anchor));
  const db = getDb(c.env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  const timezone = user?.timezone || DEFAULT_TIME_ZONE;
  const dayStartUtc = zonedDateTimeToUtc(yesterday, "00:00:00", timezone);
  const dayEnd = dateKey(new Date(new Date(`${yesterday}T12:00:00Z`).getTime() + 24 * 60 * 60 * 1000), timezone);
  const dayEndUtc = zonedDateTimeToUtc(dayEnd, "00:00:00", timezone);
  const rows = await db.query.timeRecords.findMany({
    where: and(
      eq(timeRecords.userId, userId),
      gte(timeRecords.startUtc, dayStartUtc),
      lt(timeRecords.startUtc, dayEndUtc)
    )
  });
  const seen = new Map<string, { name: string; normalizedName: string; count: number; lastStart: string }>();
  for (const r of rows) {
    const key = r.normalizedName;
    const entry = seen.get(key);
    if (entry) {
      entry.count += 1;
      const startLocal = toLocalIso(r.startUtc, timezone);
      if (startLocal > entry.lastStart) entry.lastStart = startLocal;
    } else {
      seen.set(key, { name: r.eventName, normalizedName: r.normalizedName, count: 1, lastStart: toLocalIso(r.startUtc, timezone) });
    }
  }
  const result = Array.from(seen.values()).sort((a, b) => b.lastStart.localeCompare(a.lastStart));
  return c.json({ events: result });
});

// 快速添加事件（主页加号 → 只维护事件库，不创建计划）
eventsRouter.post("/", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{ eventName: string }>().catch(() => ({ eventName: "" }));
  const eventName = body.eventName?.trim();
  if (!eventName) return c.json({ error: "eventName is required" }, 400);

  const db = getDb(c.env);
  const normalized = normalizeEventName(eventName);
  const now = nowUtc();

  const existing = await db.query.events.findFirst({
    where: and(eq(events.userId, userId), eq(events.normalizedName, normalized))
  });
  if (existing) {
    await db.update(events).set({ lastPlanAt: now }).where(eq(events.id, existing.id));
    return c.json({ ok: true, id: existing.id, eventName: existing.name });
  }

  const id = newId("e");
  await db.insert(events).values({
    id,
    userId,
    name: eventName,
    normalizedName: normalized,
    firstPlanAt: now,
    lastPlanAt: now,
    planCount: 0,
    createdAt: now
  });

  return c.json({ ok: true, id, eventName });
});

// 仅从主页事件库移除标签，不删除已有计划或历史记录。
eventsRouter.delete("/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  const existing = await db.query.events.findFirst({
    where: and(eq(events.id, id), eq(events.userId, userId))
  });
  if (!existing) return c.json({ error: "event not found" }, 404);
  await db.delete(events).where(and(eq(events.id, id), eq(events.userId, userId)));
  return c.json({ ok: true });
});

export default eventsRouter;
