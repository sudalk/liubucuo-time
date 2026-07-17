import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { and, eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { summaries } from "../schema";
import { newId, nowUtc } from "../lib/utils";

const summariesRouter = new Hono<HonoEnv>();

// 查询某周期的总结
summariesRouter.get("/", async (c) => {
  const userId = c.get("userId")!;
  const period = c.req.query("period");
  const kind = c.req.query("kind") ?? "weekly";
  const db = getDb(c.env);

  if (period) {
    const row = await db.query.summaries.findFirst({
      where: and(
        eq(summaries.userId, userId),
        eq(summaries.period, period),
        eq(summaries.kind, kind)
      )
    });
    return c.json({ summary: row ?? null });
  }

  // 列出所有
  const rows = await db.query.summaries.findMany({
    where: and(eq(summaries.userId, userId), eq(summaries.kind, kind))
  });
  return c.json({ summaries: rows });
});

// 写入/更新某周期总结
summariesRouter.put("/", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{
    period: string;
    kind?: string;
    summary?: string;
    keywords?: string[];
    aiVersion?: string;
  }>().catch(() => ({ period: "", kind: "weekly", summary: "", keywords: [], aiVersion: undefined }));
  if (!body.period) return c.json({ error: "period is required" }, 400);

  const kind = body.kind ?? "weekly";
  const summary = body.summary ?? "";
  const keywords = body.keywords ? JSON.stringify(body.keywords) : null;
  const db = getDb(c.env);
  const now = nowUtc();

  const existing = await db.query.summaries.findFirst({
    where: and(eq(summaries.userId, userId), eq(summaries.period, body.period), eq(summaries.kind, kind))
  });

  if (existing) {
    await db
      .update(summaries)
      .set({
        summary,
        keywords: keywords ?? existing.keywords,
        aiVersion: body.aiVersion ?? existing.aiVersion,
        userEdited: true,
        updatedAt: now
      })
      .where(eq(summaries.id, existing.id));
    return c.json({ ok: true, id: existing.id });
  }

  const id = newId("sum");
  await db.insert(summaries).values({
    id,
    userId,
    period: body.period,
    kind,
    summary,
    keywords,
    aiVersion: body.aiVersion ?? null,
    userEdited: true,
    createdAt: now,
    updatedAt: now
  });
  return c.json({ ok: true, id });
});

export default summariesRouter;
