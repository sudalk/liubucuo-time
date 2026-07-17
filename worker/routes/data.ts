import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { events, planItems, reflections, summaries, timeRecords, users } from "../schema";

const dataRouter = new Hono<HonoEnv>();

// 导出全部数据为 JSON
dataRouter.get("/export", async (c) => {
  const userId = c.get("userId")!;
  const db = getDb(c.env);

  const [user, userEvents, plans, records, allReflections, allSummaries] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, userId) }),
    db.query.events.findMany({ where: eq(events.userId, userId) }),
    db.query.planItems.findMany({ where: eq(planItems.userId, userId) }),
    db.query.timeRecords.findMany({ where: eq(timeRecords.userId, userId) }),
    db.query.reflections.findMany({ where: eq(reflections.userId, userId) }),
    db.query.summaries.findMany({ where: eq(summaries.userId, userId) })
  ]);

  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    user: user
      ? { email: user.email, nickname: user.nickname, timezone: user.timezone }
      : null,
    events: userEvents,
    plans,
    records,
    reflections: allReflections,
    summaries: allSummaries
  };

  return c.json(payload);
});

// 清除 AI 内容（删除 summaries 表中所有 ai_version 非 null 且未编辑的数据）
dataRouter.post("/clear-ai", async (c) => {
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  await db.delete(summaries).where(eq(summaries.userId, userId));
  return c.json({ ok: true });
});

export default dataRouter;
