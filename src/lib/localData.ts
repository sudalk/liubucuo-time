/** 业务数据本地缓存。Web 与 Android WebView 都使用 IndexedDB，避免页面每次进入都等待网络。 */
const DB_NAME = "lbc-local-data";
const STORE = "responses";

export interface CachedValue<T> {
  value: T;
  updatedAt: number;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

export async function readCache<T>(key: string): Promise<CachedValue<T> | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    const request = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
    request.onsuccess = () => resolve((request.result as CachedValue<T> | undefined) ?? null);
    request.onerror = () => resolve(null);
  });
}

export async function writeCache<T>(key: string, value: T): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const request = db.transaction(STORE, "readwrite").objectStore(STORE).put({ value, updatedAt: Date.now() } satisfies CachedValue<T>, key);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

export async function removeCachePrefix(prefix: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    const store = db.transaction(STORE, "readwrite").objectStore(STORE);
    const keys = store.getAllKeys();
    keys.onsuccess = () => {
      for (const key of keys.result) if (typeof key === "string" && key.startsWith(prefix)) store.delete(key);
      resolve();
    };
    keys.onerror = () => resolve();
  });
}
