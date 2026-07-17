import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { users } from "../schema";
import { nowUtc } from "../lib/utils";

const uploadRouter = new Hono<HonoEnv>();

// 上传头像到 R2，更新用户 avatar_key
uploadRouter.post("/avatar", async (c) => {
  const userId = c.get("userId")!;
  const form = await c.req.formData().catch(() => null);
  if (!form) return c.json({ error: "form data required" }, 400);
  const file = form.get("file");
  if (!(file instanceof File)) return c.json({ error: "file is required" }, 400);

  const allowed = ["image/png", "image/jpeg", "image/webp"];
  if (!allowed.includes(file.type)) {
    return c.json({ error: "only png/jpeg/webp allowed" }, 400);
  }
  if (file.size > 2 * 1024 * 1024) {
    return c.json({ error: "file too large (max 2MB)" }, 400);
  }

  const ext = file.type.split("/")[1];
  const key = `avatars/${userId}/${nowUtc().replace(/[:.]/g, "-")}.${ext}`;
  await c.env.UPLOADS.put(key, file.stream(), {
    httpMetadata: { contentType: file.type }
  });

  const db = getDb(c.env);
  const existing = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (existing?.avatarKey) {
    await c.env.UPLOADS.delete(existing.avatarKey).catch(() => {});
  }
  await db.update(users).set({ avatarKey: key }).where(eq(users.id, userId));

  return c.json({ ok: true, key });
});

// 读取当前登录用户的头像
uploadRouter.get("/avatar", async (c) => {
  const userId = c.get("userId")!;
  const db = getDb(c.env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user?.avatarKey) return c.json({ error: "no avatar" }, 404);
  const object = await c.env.UPLOADS.get(user.avatarKey);
  if (!object) return c.json({ error: "not found" }, 404);
  return new Response(object.body, {
    headers: {
      "Content-Type": object.httpMetadata?.contentType ?? "image/png",
      "Cache-Control": "private, max-age=3600"
    }
  });
});

export default uploadRouter;
