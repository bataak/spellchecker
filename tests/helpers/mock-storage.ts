const store = new Map<string, string>();

globalThis.localStorage = {
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

export function resetStorage(): void {
  store.clear();
}

export function rawGet(key: string): string | null {
  return store.has(key) ? store.get(key)! : null;
}

export function rawSet(key: string, value: string): void {
  store.set(key, String(value));
}
