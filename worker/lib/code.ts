import { createHash, randomInt, timingSafeEqual } from "node:crypto";
import type { Env } from "../types";

// ────────────────────────────────────────────────────────────────
// 邮箱验证码：发码 + 校验
// ────────────────────────────────────────────────────────────────

const CODE_TTL_MINUTES = 10;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function createVerificationCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** 所有有效邮箱都可登录，不再维护静态白名单。 */
export function isEmailAllowed(email: string, _env: Env): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(email));
}

// 验证码哈希：email + code + AUTH_SECRET
export function hashVerificationCode(email: string, code: string, env: Env): string {
  const secret = env.AUTH_SECRET ?? "lbc-dev-auth-secret";
  return createHash("sha256")
    .update(`${normalizeEmail(email)}:${code.trim()}:${secret}`)
    .digest("hex");
}

export function isSameCodeHash(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

// 把验证码哈希存 KV，10 分钟 TTL
const KV_CODE_PREFIX = "code:";

export async function storeVerificationCode(
  email: string,
  code: string,
  env: Env
): Promise<void> {
  const hash = hashVerificationCode(email, code, env);
  const key = `${KV_CODE_PREFIX}${normalizeEmail(email)}`;
  await env.KV.put(key, hash, { expirationTtl: CODE_TTL_MINUTES * 60 });
}

export async function verifyStoredCode(
  email: string,
  code: string,
  env: Env
): Promise<boolean> {
  const key = `${KV_CODE_PREFIX}${normalizeEmail(email)}`;
  const stored = await env.KV.get(key);
  if (!stored) return false;
  const candidate = hashVerificationCode(email, code, env);
  if (!isSameCodeHash(candidate, stored)) return false;
  // 用一次后删除
  await env.KV.delete(key);
  return true;
}
