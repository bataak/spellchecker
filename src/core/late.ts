export type Late<T extends object> = T & {
  provide(parts: Partial<T>): void;
};

export function createLate<T extends object>(): Late<T> {
  const parts: Partial<T> = {};
  const provide = (more: Partial<T>): void => {
    for (const key of Object.keys(more))
      if (key in parts) throw new Error(key + " is already wired");
    Object.assign(parts, more);
  };
  return new Proxy({} as Late<T>, {
    get(_, key) {
      if (key === "provide") return provide;
      if (typeof key === "symbol") return undefined;
      if (!(key in parts)) throw new Error(key + " is used before it is wired");
      return parts[key as keyof T];
    },
  });
}
