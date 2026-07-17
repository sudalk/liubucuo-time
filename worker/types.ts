// Cloudflare Workers 环境绑定类型
// 由 wrangler.jsonc 中的 bindings 决定

export interface Env {
  // D1 数据库
  DB: D1Database;
  // R2 对象存储（头像、导出文件）
  UPLOADS: R2Bucket;
  // KV（验证码、会话缓存）
  KV: KVNamespace;
  // 静态资源
  ASSETS: Fetcher;

  // 公开变量（vars）
  APP_BASE_URL: string;
  OPENAI_BASE_URL: string;
  DEFAULT_LLM_MODEL: string;
  AUTH_EMAIL_FROM: string;

  // Secrets
  AUTH_SECRET: string;
  RESEND_API_KEY: string;
  OPENAI_CHAT_API_KEY: string;
}

export type HonoEnv = { Bindings: Env; Variables: { userId: string | null } };
