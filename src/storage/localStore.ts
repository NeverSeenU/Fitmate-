export type StorageKey =
  | 'fitmate.profile'
  | 'fitmate.records'
  | 'fitmate.conversations'
  | 'fitmate.session';

export type LocalStore = {
  get<T>(key: StorageKey): Promise<T | null>;
  set<T>(key: StorageKey, value: T): Promise<void>;
  remove(key: StorageKey): Promise<void>;
};

export function createMemoryStore(seed: Partial<Record<StorageKey, unknown>> = {}): LocalStore {
  const values = new Map<StorageKey, unknown>(Object.entries(seed) as [StorageKey, unknown][]);

  return {
    async get<T>(key: StorageKey) {
      return (values.get(key) as T | undefined) ?? null;
    },
    async set<T>(key: StorageKey, value: T) {
      values.set(key, value);
    },
    async remove(key: StorageKey) {
      values.delete(key);
    },
  };
}
