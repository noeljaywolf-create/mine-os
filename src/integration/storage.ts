/**
 * Storage abstraction (Step 3 foundation).
 * MVP: localStorage-backed implementation for browser pilots.
 * Production: swap with server/API or IndexedDB-backed implementations behind the same interface.
 */
export interface KeyValueStore {
  get<T>(key: string, fallback: T): Promise<T> | T;
  set(key: string, value: unknown): Promise<void> | void;
  remove(key: string): Promise<void> | void;
}

export const localKeyValueStore: KeyValueStore = {
  get<T>(key: string, fallback: T): T {
    try { const raw = localStorage.getItem(key); return raw ? (JSON.parse(raw) as T) : fallback; } catch { return fallback; }
  },
  set(key: string, value: unknown): void {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* quota/private mode */ }
  },
  remove(key: string): void {
    try { localStorage.removeItem(key); } catch {}
  },
};

export const STORAGE_KEYS = {
  auth: 'mineos.auth',
  operatingMode: 'mineos.operatingMode',
  alertRules: 'mineos.alertRules',
  profiles: 'mineos.connectionProfiles',
  lastGateway: 'mineos.lastGateway',
  history: 'mineos.history',
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

export const defaultStore = localKeyValueStore;