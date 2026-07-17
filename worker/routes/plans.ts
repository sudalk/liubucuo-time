import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { and, eq, asc } from "drizzle-orm";
import { getDb } from "../lib/db";
import { events, planItems } from "../schema";
import { newId, normalizeEventName, nowUtc, dateKey } from "../lib/utils";

const plans = new Hono<HonoEnv>();

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

    const existingEvent = await db.query.events.findFirst({
      where: and(eq(events.userId, userId), eq(events.normalizedName, normalized))
    });
    if (existingEvent) {
      await db
        .update(events)
        .set({ lastPlanAt: now, planCount: existingEvent.planCount + 1 })
        .where(eq(events.id, existingEvent.id));
    } else {
      await db.insert(events).values({
        id: newId("e"),
        userId,
        name: body.eventName,
        normalizedName: normalized,
        firstPlanAt: now,
        lastPlanAt: now,
        planCount: 1,
        createdAt: now
      });
    }

    return c.json({ ok: true, id });
  } catch (err) {
    console.error("[plans] put failed:", err);
    return c.json({ error: "plan put failed" }, 500);
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
