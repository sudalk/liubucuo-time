import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { getDb } from "../lib/db";
import { reflections } from "../schema";
import { newId, nowUtc, dateKey } from "../lib/utils";

const reflectionsRouter = new Hono<HonoEnv>();

// 读取某日感悟
reflectionsRouter.get("/", async (c) => {
  const userId = c.get("userId")!;
  const date = c.req.query("date") ?? dateKey();
  const db = getDb(c.env);
  const row = await db.query.reflections.findFirst({
    where: and(eq(reflections.userId, userId), eq(reflections.date, date))
  });
  return c.json({ reflection: row ?? null });
});

// 写入/更新某日感悟（自动保存草稿）
reflectionsRouter.put("/", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{ date?: string; content?: string; keywords?: string[] }>().catch(
    () => ({ date: undefined, content: undefined, keywords: undefined })
  );
  const date = body.date ?? dateKey();
  const content = body.content ?? "";
  const keywords = body.keywords ? JSON.stringify(body.keywords) : null;
  const db = getDb(c.env);
  const now = nowUtc();

  const existing = await db.query.reflections.findFirst({
    where: and(eq(reflections.userId, userId), eq(reflections.date, date))
  });

  if (existing) {
    await db
      .update(reflections)
      .set({ content, keywords: keywords ?? existing.keywords, updatedAt: now })
      .where(eq(reflections.id, existing.id));
    return c.json({ ok: true, id: existing.id });
  }

  const id = newId("ref");
  await db.insert(reflections).values({
    id,
    userId,
    date,
    content,
    keywords,
    source: "user",
    updatedAt: now
  });
  return c.json({ ok: true, id });
});

// 查询区间内的感悟
reflectionsRouter.get("/range", async (c) => {
  const userId = c.get("userId")!;
  const start = c.req.query("start");
  const end = c.req.query("end");
  if (!start || !end) return c.json({ error: "start and end are required" }, 400);
  const db = getDb(c.env);
  const rows = await db.query.reflections.findMany({
    where: and(
      eq(reflections.userId, userId),
      gte(reflections.date, start),
      lte(reflections.date, end)
    ),
    orderBy: [desc(reflections.date)]
  });
  return c.json({ reflections: rows });
});

export default reflectionsRouter;
