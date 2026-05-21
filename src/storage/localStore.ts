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

type AsyncStorageLike = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
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

export function createAsyncStorageStore(): LocalStore {
  return {
    async get<T>(key: StorageKey) {
      const AsyncStorage = await getAsyncStorage();
      const value = await AsyncStorage.getItem(key);
      return value ? JSON.parse(value) as T : null;
    },
    async set<T>(key: StorageKey, value: T) {
      const AsyncStorage = await getAsyncStorage();
      await AsyncStorage.setItem(key, JSON.stringify(value));
    },
    async remove(key: StorageKey) {
      const AsyncStorage = await getAsyncStorage();
      await AsyncStorage.removeItem(key);
    },
  };
}

async function getAsyncStorage() {
  const module = await import('@react-native-async-storage/async-storage');
  const loaded = module as unknown as { default?: AsyncStorageLike } & AsyncStorageLike;
  return (loaded.default ?? loaded) as AsyncStorageLike;
}
