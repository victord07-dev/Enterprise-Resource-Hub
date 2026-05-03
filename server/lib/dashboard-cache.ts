type CacheEntry<T> = { value: T; expiresAt: number };

const TTL_MS = 30_000;
const store = new Map<string, CacheEntry<unknown>>();

export function getDashboardCache<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

export function setDashboardCache<T>(key: string, value: T): void {
  store.set(key, { value, expiresAt: Date.now() + TTL_MS });
}

export function clearDashboardCache(): void {
  store.clear();
}

export function dashboardCacheTtlMs(): number {
  return TTL_MS;
}
