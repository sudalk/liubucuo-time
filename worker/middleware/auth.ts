import type { Context, Next } from "hono";
import type { HonoEnv } from "../types";
import { getSessionUserIdFromBearer, getSessionUserIdFromRequest } from "../lib/session";

// 不需要登录就能访问的路径前缀（但仍会读取 session 注入 userId，允许已登录用户访问）
const PUBLIC_PREFIXES = [
  "/api/auth/request-code",
  "/api/auth/verify-code",
  "/api/auth/me",
  "/api/health"
];

function isPublic(path: string): boolean {
  return PUBLIC_PREFIXES.some((p) => path === p || path.startsWith(`${p}/`));
}

export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  // 始终尝试读取 session，注入 userId（可能为 null）
  const userId = getSessionUserIdFromBearer(c.req.raw, c.env) ?? getSessionUserIdFromRequest(c.req.raw, c.env);
  c.set("userId", userId);

  // 非公开路径且未登录 → 401
  if (!userId && !isPublic(c.req.path) && c.req.path.startsWith("/api/")) {
    return c.json({ error: "unauthorized" }, 401);
  }

  await next();
}
