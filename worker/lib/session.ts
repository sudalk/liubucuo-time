import { createHmac, timingSafeEqual } from "node:crypto";
import type { Env } from "../types";

// ────────────────────────────────────────────────────────────────
// Session cookie：HMAC 签名 payload.signature
// ────────────────────────────────────────────────────────────────

const COOKIE_NAME = "lbc_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 天

function getAuthSecret(env: Env): string {
  const secret = env.AUTH_SECRET;
  if (!secret) {
    if (env.APP_BASE_URL?.startsWith("https://")) {
      throw new Error("AUTH_SECRET is required in production");
    }
    return "lbc-dev-session-secret";
  }
  return secret;
}

function signPayload(payload: string, env: Env): string {
  return createHmac("sha256", getAuthSecret(env)).update(payload).digest("base64url");
}

function createSessionValue(userId: string, env: Env): string {
  const payload = Buffer.from(
    JSON.stringify({ userId, issuedAt: Date.now() }),
    "utf-8"
  ).toString("base64url");
  return `${payload}.${signPayload(payload, env)}`;
}

/** Android 客户端使用同一签名格式的 Bearer 会话，桌面端仍使用 HttpOnly Cookie。 */
export function createSessionToken(userId: string, env: Env): string {
  return createSessionValue(userId, env);
}

function readUserIdFromSessionValue(value: string, env: Env): string | null {
  const [payload, signature] = value.split(".");
  if (!payload || !signature) return null;

  const expected = signPayload(payload, env);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8")) as {
      userId?: unknown;
      issuedAt?: unknown;
    };
    if (typeof parsed.userId !== "string") return null;
    if (typeof parsed.issuedAt !== "number") return null;
    if (Date.now() - parsed.issuedAt > SESSION_MAX_AGE * 1000) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}

// ────────────────────────────────────────────────────────────────
// Cookie 读写
// ────────────────────────────────────────────────────────────────

export function getSessionUserIdFromRequest(request: Request, env: Env): string | null {
  const cookie = request.headers.get("Cookie");
  if (!cookie) return null;
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  if (!match) return null;
  return readUserIdFromSessionValue(match[1], env);
}

export function getSessionUserIdFromBearer(request: Request, env: Env): string | null {
  const authorization = request.headers.get("Authorization") ?? "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? readUserIdFromSessionValue(match[1], env) : null;
}

export function createSessionCookie(userId: string, env: Env): string {
  const value = createSessionValue(userId, env);
  const parts = [
    `${COOKIE_NAME}=${value}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${SESSION_MAX_AGE}`
  ];
  if (env.APP_BASE_URL?.startsWith("https://")) parts.push("Secure");
  return parts.join("; ");
}

export function clearSessionCookie(): string {
  return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

export const SESSION_COOKIE_NAME = COOKIE_NAME;
