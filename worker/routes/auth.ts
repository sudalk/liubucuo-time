import { Hono } from "hono";
import type { HonoEnv } from "../types";
import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { users } from "../schema";
import { isEmailAllowed, normalizeEmail, createVerificationCode, verifyStoredCode, storeVerificationCode } from "../lib/code";
import { sendLoginCodeEmail } from "../lib/email";
import { createSessionCookie, createSessionToken, clearSessionCookie } from "../lib/session";
import { newId } from "../lib/utils";

const auth = new Hono<HonoEnv>();

// 请求验证码
auth.post("/request-code", async (c) => {
  const body = await c.req.json<{ email: string }>().catch(() => ({ email: "" }));
  const email = normalizeEmail(body.email ?? "");
  if (!email) return c.json({ error: "email is required" }, 400);
  if (!isEmailAllowed(email, c.env)) return c.json({ error: "email not allowed" }, 403);

  const isLocalBaseUrl = c.env.APP_BASE_URL?.startsWith("http://localhost") || c.env.APP_BASE_URL?.startsWith("http://127.0.0.1");
  if (isLocalBaseUrl && email === "codex-test@example.com") {
    await storeVerificationCode(email, "000000", c.env);
    return c.json({ ok: true, devCode: "000000" });
  }

  const code = createVerificationCode();
  try {
    await sendLoginCodeEmail(email, code, c.env);
  } catch (err) {
    console.error("[auth] send code failed:", err);
    return c.json({ error: "send code failed" }, 500);
  }

  // 哈希后存 KV（10 分钟 TTL）
  await storeVerificationCode(email, code, c.env);

  return c.json({ ok: true });
});

// 验证码登录：验证 → 创建/查找用户 → 签发 session cookie
auth.post("/verify-code", async (c) => {
  const body = await c.req.json<{ email: string; code: string }>().catch(() => ({ email: "", code: "" }));
  const email = normalizeEmail(body.email ?? "");
  const code = (body.code ?? "").trim();

  if (!email || !code) return c.json({ error: "email and code are required" }, 400);
  if (!isEmailAllowed(email, c.env)) return c.json({ error: "email not allowed" }, 403);

  const ok = await verifyStoredCode(email, code, c.env);
  if (!ok) return c.json({ error: "invalid or expired code" }, 400);

  const db = getDb(c.env);
  // 查找用户
  let user = await db.query.users.findFirst({ where: eq(users.email, email) });
  if (!user) {
    user = {
      id: newId("u"),
      email,
      nickname: null,
      avatarKey: null,
      timezone: "Asia/Shanghai",
      aiAuthorized: true,
      createdAt: new Date().toISOString()
    };
    await db.insert(users).values(user!);
  }

  c.header("Set-Cookie", createSessionCookie(user.id, c.env));
  const token = c.req.header("X-Lbc-Client") === "android" ? createSessionToken(user.id, c.env) : undefined;
  return c.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      timezone: user.timezone,
      aiAuthorized: user.aiAuthorized
    },
    token
  });
});

// 登出
auth.post("/logout", (c) => {
  c.header("Set-Cookie", clearSessionCookie());
  return c.json({ ok: true });
});

// 当前用户
auth.get("/me", async (c) => {
  const userId = c.get("userId");
  if (!userId) return c.json({ user: null });
  const db = getDb(c.env);
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
  if (!user) return c.json({ user: null });
  return c.json({
    user: {
      id: user.id,
      email: user.email,
      nickname: user.nickname,
      timezone: user.timezone,
      aiAuthorized: user.aiAuthorized
    }
  });
});

export default auth;
