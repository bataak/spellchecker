const store = new Map();

globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear(),
};

export function resetStorage() {
  store.clear();
}

export function rawGet(k) {
  return store.has(k) ? store.get(k) : null;
}

export function rawSet(k, v) {
  store.set(k, String(v));
}
