import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { needProfiles, users } from "../schema";
import { nowUtc } from "../lib/utils";

const profileRouter = new Hono<HonoEnv>();

// 个人信息（年龄段/生日/性别/学历/职业，全部可选）
profileRouter.get("/personal", async (c) => {
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  return c.json({
    profile: {
      nickname: user?.nickname ?? null,
      avatarKey: user?.avatarKey ?? null,
      timezone: user?.timezone ?? null,
      aiAuthorized: user?.aiAuthorized ?? true
    }
  });
});

profileRouter.patch("/personal", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{
    nickname?: string;
    timezone?: string;
    aiAuthorized?: boolean;
  }>().catch(() => ({ nickname: undefined, timezone: undefined, aiAuthorized: undefined }));

  const db = getDb(c.env);
  const existing = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!existing) return c.json({ error: "user not found" }, 404);

  await db
    .update(users)
    .set({
      nickname: body.nickname ?? existing.nickname,
      timezone: body.timezone ?? existing.timezone,
      aiAuthorized: body.aiAuthorized ?? existing.aiAuthorized
    })
    .where(eq(users.id, userId));

  return c.json({ ok: true });
});

// 时间管理需求
profileRouter.get("/need", async (c) => {
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const row = await db.query.needProfiles.findFirst({ where: eq(needProfiles.userId, userId) });
  return c.json({ need: row ?? null });
});

profileRouter.put("/need", async (c) => {
  const userId = c.get("userId")!;
  const body = await c.req.json<{ rawText?: string; structured?: unknown }>().catch(
    () => ({ rawText: "", structured: undefined })
  );
  const db = getDb(c.env);
  const now = nowUtc();

  const existing = await db.query.needProfiles.findFirst({ where: eq(needProfiles.userId, userId) });
  const rawText = body.rawText ?? "";
  const structured = body.structured ? JSON.stringify(body.structured) : null;

  if (existing) {
    await db
      .update(needProfiles)
      .set({ rawText, structured: structured ?? existing.structured, updatedAt: now })
      .where(eq(needProfiles.id, existing.id));
    return c.json({ ok: true, id: existing.id });
  }

  await db.insert(needProfiles).values({
    id: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    rawText,
    structured,
    updatedAt: now
  });
  return c.json({ ok: true });
});

export default profileRouter;
