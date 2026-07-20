import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { and, eq, asc } from "drizzle-orm";
import { getDb } from "../lib/db";
import { events, planItems } from "../schema";
import { newId, normalizeEventName, nowUtc, dateKey } from "../lib/utils";

const plans = new Hono<HonoEnv>();

type CopyMode = "append" | "replace";

function copyStartLocal(plannedStartLocal: string | null | undefined, targetDate: string): string | undefined {
  if (!plannedStartLocal) return undefined;
  const hhmm = plannedStartLocal.slice(11, 16) || "09:00";
  return `${targetDate}T${hhmm}:00`;
}

async function touchEvent(db: ReturnType<typeof getDb>, userId: string, eventName: string, now: string) {
  const normalized = normalizeEventName(eventName);
  const existingEvent = await db.query.events.findFirst({
    where: and(eq(events.userId, userId), eq(events.normalizedName, normalized))
  });
  if (existingEvent) {
    await db
      .update(events)
      .set({ lastPlanAt: now, planCount: existingEvent.planCount + 1 })
      .where(eq(events.id, existingEvent.id));
    return;
  }
  await db.insert(events).values({
    id: newId("e"),
    userId,
    name: eventName,
    normalizedName: normalized,
    firstPlanAt: now,
    lastPlanAt: now,
    planCount: 1,
    createdAt: now
  });
}

// 读取某日计划
plans.get("/", async (c) => {
  const userId = c.get("userId")!;
  const date = c.req.query("date") ?? dateKey();
  const db = getDb(c.env);
  const rows = await db.query.planItems.findMany({
    where: and(eq(planItems.userId, userId), eq(planItems.date, date)),
    orderBy: [asc(planItems.sortOrder), asc(planItems.createdAt)]
  });
  return c.json({ plans: rows });
});

// 写入/更新一条计划（行内编辑自动保存）
plans.put("/", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{
    id?: string;
    date: string;
    eventName: string;
    plannedStartLocal?: string;
    estimatedMinutes?: number;
    sortOrder?: number;
    note?: string;
  }>().catch(() => null);

  if (!body || !body.date || !body.eventName?.trim()) {
    return c.json({ error: "date and eventName are required" }, 400);
  }

  const db = getDb(c.env);
  const normalized = normalizeEventName(body.eventName);
  const now = nowUtc();

  try {
    if (body.id) {
      const existing = await db.query.planItems.findFirst({
        where: and(eq(planItems.id, body.id), eq(planItems.userId, userId))
      });
      if (!existing) return c.json({ error: "not found" }, 404);

      await db
        .update(planItems)
        .set({
          eventName: body.eventName,
          normalizedName: normalized,
          plannedStartLocal: body.plannedStartLocal ?? existing.plannedStartLocal,
          estimatedMinutes: body.estimatedMinutes ?? existing.estimatedMinutes,
          sortOrder: body.sortOrder ?? existing.sortOrder,
          note: body.note ?? existing.note,
          updatedAt: now
        })
        .where(eq(planItems.id, body.id));

      await db
        .update(events)
        .set({ lastPlanAt: now })
        .where(and(eq(events.userId, userId), eq(events.normalizedName, normalized)));

      return c.json({ ok: true, id: body.id });
    }

    const id = newId("p");
    await db.insert(planItems).values({
      id,
      userId,
      date: body.date,
      eventName: body.eventName,
      normalizedName: normalized,
      plannedStartLocal: body.plannedStartLocal,
      estimatedMinutes: body.estimatedMinutes,
      sortOrder: body.sortOrder ?? 0,
      note: body.note,
      createdAt: now,
      updatedAt: now
    });

    await touchEvent(db, userId, body.eventName, now);

    return c.json({ ok: true, id });
  } catch (err) {
    console.error("[plans] put failed:", err);
    return c.json({ error: "plan put failed" }, 500);
  }
});

// 从某一天复制计划到目标日期。replace 模式先插入新计划，再删除旧计划，避免插入失败时清空当天。
plans.post("/copy", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{
    sourceDate?: string;
    targetDate?: string;
    mode?: CopyMode;
  }>().catch(() => null);

  const sourceDate = body?.sourceDate;
  const targetDate = body?.targetDate;
  const mode: CopyMode = body?.mode === "replace" ? "replace" : "append";
  if (!sourceDate || !targetDate || sourceDate === targetDate) {
    return c.json({ error: "请选择其他日期" }, 400);
  }

  const db = getDb(c.env);
  const now = nowUtc();
  const sourcePlans = await db.query.planItems.findMany({
    where: and(eq(planItems.userId, userId), eq(planItems.date, sourceDate)),
    orderBy: [asc(planItems.sortOrder), asc(planItems.createdAt)]
  });
  if (sourcePlans.length === 0) {
    return c.json({ error: "来源日期没有计划可复制" }, 400);
  }
  const targetPlans = await db.query.planItems.findMany({
    where: and(eq(planItems.userId, userId), eq(planItems.date, targetDate)),
    orderBy: [asc(planItems.sortOrder), asc(planItems.createdAt)]
  });
  const baseOrder = mode === "append" ? targetPlans.length : 0;
  const insertedIds: string[] = [];

  try {
    for (const [index, plan] of sourcePlans.entries()) {
      const id = newId("p");
      insertedIds.push(id);
      await db.insert(planItems).values({
        id,
        userId,
        date: targetDate,
        eventName: plan.eventName,
        normalizedName: plan.normalizedName,
        plannedStartLocal: copyStartLocal(plan.plannedStartLocal, targetDate),
        estimatedMinutes: plan.estimatedMinutes,
        sortOrder: baseOrder + index,
        note: plan.note,
        createdAt: now,
        updatedAt: now
      });
      await touchEvent(db, userId, plan.eventName, now);
    }

    if (mode === "replace") {
      for (const plan of targetPlans) {
        await db.delete(planItems).where(and(eq(planItems.id, plan.id), eq(planItems.userId, userId)));
      }
    }

    return c.json({ ok: true, copied: insertedIds.length });
  } catch (err) {
    console.error("[plans] copy failed:", err);
    for (const id of insertedIds) {
      await db.delete(planItems).where(and(eq(planItems.id, id), eq(planItems.userId, userId))).catch(() => undefined);
    }
    return c.json({ error: "复制失败" }, 500);
  }
});

// 删除一条计划
plans.delete("/:id", async (c) => {
  const userId = c.get("userId")!;
  const id = c.req.param("id");
  const db = getDb(c.env);
  await db.delete(planItems).where(and(eq(planItems.id, id), eq(planItems.userId, userId)));
  return c.json({ ok: true });
});

export default plans;
