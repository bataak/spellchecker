function memoryStorage(store: Map<string, string>): Storage {
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

const store = new Map<string, string>();
const tabStore = new Map<string, string>();

globalThis.localStorage = memoryStorage(store);
globalThis.sessionStorage = memoryStorage(tabStore);

export function resetSession(): void {
  tabStore.clear();
}

export function resetStorage(): void {
  store.clear();
}

export function rawGet(key: string): string | null {
  return store.has(key) ? store.get(key)! : null;
}

export function rawSet(key: string, value: string): void {
  store.set(key, String(value));
}
