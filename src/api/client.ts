import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { readCache, removeCachePrefix, writeCache } from "../lib/localData";

// API 客户端：桌面保留同源 Cookie；Android 使用保存于本机的 Bearer 会话。

export interface ApiError {
  error: string;
  status: number;
}

const isAndroid = Capacitor.isNativePlatform();
const apiOrigin = isAndroid ? "https://lbc.myelephantgo.xyz" : "";
const MOBILE_TOKEN_KEY = "lbc_session_token";
let mobileToken: string | null = null;

function canCache(path: string): boolean {
  return path.startsWith("/api/") && !path.startsWith("/api/auth/") && !path.startsWith("/api/ai/") && !path.startsWith("/api/data/") && path !== "/api/records/active";
}

async function cachedGet<T>(path: string): Promise<T> {
  const key = `get:${path}`;
  const cached = await readCache<T>(key);
  // 有本地快照就先渲染，网络只负责悄悄刷新下一次打开时的数据。
  // 这样切换页面不会被远端 RTT 卡住，断网也能继续查看已经同步的数据。
  if (cached) {
    void request<T>(path).then((value) => writeCache(key, value)).catch(() => undefined);
    return cached.value;
  }
  try {
    const value = await request<T>(path);
    void writeCache(key, value);
    return value;
  } catch (error) {
    throw error;
  }
}

function invalidateAfterMutation(path: string) {
  if (path.startsWith("/api/records")) {
    void removeCachePrefix("get:/api/records");
    void removeCachePrefix("get:/api/summaries");
  } else if (path.startsWith("/api/plans")) {
    void removeCachePrefix("get:/api/plans");
  } else if (path.startsWith("/api/events")) {
    void removeCachePrefix("get:/api/events");
  } else if (path.startsWith("/api/reflections")) {
    void removeCachePrefix("get:/api/reflections");
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== "undefined" && init?.body instanceof FormData;
  const resp = await fetch(`${apiOrigin}${path}`, {
    credentials: isAndroid ? "omit" : "include",
    headers: {
      ...(!isFormData ? { "Content-Type": "application/json" } : {}),
      ...(isAndroid ? { "X-Lbc-Client": "android", ...(mobileToken ? { Authorization: `Bearer ${mobileToken}` } : {}) } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as ApiError;
      msg = body.error ?? msg;
    } catch {
      // ignore
    }
    const err = new Error(msg) as Error & { status: number };
    err.status = resp.status;
    throw err;
  }

  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

async function requestBlob(path: string): Promise<Blob> {
  const resp = await fetch(`${apiOrigin}${path}`, {
    credentials: isAndroid ? "omit" : "include",
    headers: isAndroid ? { "X-Lbc-Client": "android", ...(mobileToken ? { Authorization: `Bearer ${mobileToken}` } : {}) } : undefined
  });
  if (!resp.ok) {
    const err = new Error(`HTTP ${resp.status}`) as Error & { status: number };
    err.status = resp.status;
    throw err;
  }
  return resp.blob();
}

async function requestText(path: string, init?: RequestInit): Promise<string> {
  const resp = await fetch(`${apiOrigin}${path}`, {
    credentials: isAndroid ? "omit" : "include",
    headers: {
      "Content-Type": "application/json",
      ...(isAndroid ? { "X-Lbc-Client": "android", ...(mobileToken ? { Authorization: `Bearer ${mobileToken}` } : {}) } : {}),
      ...(init?.headers ?? {})
    },
    ...init
  });

  if (!resp.ok) {
    let msg = `HTTP ${resp.status}`;
    try {
      const body = (await resp.json()) as ApiError;
      msg = body.error ?? msg;
    } catch {
      // ignore
    }
    const err = new Error(msg) as Error & { status: number };
    err.status = resp.status;
    throw err;
  }

  return await resp.text();
}

export const api = {
  initMobileSession: async () => {
    if (!isAndroid) return;
    const { value } = await Preferences.get({ key: MOBILE_TOKEN_KEY });
    mobileToken = value;
  },
  setMobileSession: async (token: string | undefined) => {
    if (!isAndroid || !token) return;
    mobileToken = token;
    await Preferences.set({ key: MOBILE_TOKEN_KEY, value: token });
  },
  clearMobileSession: async () => {
    if (isAndroid) {
      mobileToken = null;
      await Preferences.remove({ key: MOBILE_TOKEN_KEY });
    }
    await removeCachePrefix("get:/api/");
  },
  get: <T>(path: string) => canCache(path) ? cachedGet<T>(path) : request<T>(path),
  getBlob: (path: string) => requestBlob(path),
  upload: <T>(path: string, form: FormData) => request<T>(path, { method: "POST", body: form }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body != null ? JSON.stringify(body) : undefined }).then((value) => { invalidateAfterMutation(path); return value; }),
  postText: (path: string, body?: unknown) =>
    requestText(path, { method: "POST", body: body != null ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PUT", body: JSON.stringify(body) }).then((value) => { invalidateAfterMutation(path); return value; }),
  patch: <T>(path: string, body: unknown) =>
    request<T>(path, { method: "PATCH", body: JSON.stringify(body) }).then((value) => { invalidateAfterMutation(path); return value; }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }).then((value) => { invalidateAfterMutation(path); return value; })
};

// ────────────────────────────────────────────────────────────────
// 类型定义（与 worker/schema.ts 对齐，但前端独立定义避免直接依赖 worker 代码）
// ────────────────────────────────────────────────────────────────

export interface User {
  id: string;
  email: string;
  nickname: string | null;
  timezone: string | null;
  aiAuthorized: boolean;
}

export interface EventItem {
  id: string;
  name: string;
  normalizedName: string;
  firstPlanAt: string | null;
  lastPlanAt: string | null;
  planCount: number;
}

export interface PlanItem {
  id: string;
  date: string;
  eventName: string;
  normalizedName: string;
  plannedStartLocal: string | null;
  estimatedMinutes: number | null;
  sortOrder: number;
  note: string | null;
}

export interface TimeRecord {
  id: string;
  eventName: string;
  normalizedName: string;
  startUtc: string;
  startLocal: string;
  endUtc: string | null;
  endLocal: string | null;
  durationMinutes: number | null;
  statusProgress: number | null;
  source: string;
  note: string | null;
  isMainSleep: boolean;
}

export interface ActiveTimer {
  userId: string;
  eventName: string;
  normalizedName: string;
  startUtc: string;
  startLocal: string;
  statusProgress: number;
}
