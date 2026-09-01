import type { StorageAdapter } from './schema';

/**
 * Default `StorageAdapter` when the host doesn't supply one — a `Map` that
 * lives for the process lifetime. Nothing is cached across app restarts, so a
 * host that cares about instant cold starts should pass a real adapter
 * (AsyncStorage, MMKV) instead.
 */
export const createMemoryStorage = (): StorageAdapter => {
  const store = new Map<string, string>();

  return {
    get: async (key) => store.get(key) ?? null,
    set: async (key, value) => {
      store.set(key, value);
    },
  };
};
