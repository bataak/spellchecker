export interface Emitter<T = void> {
  emit(value: T): void;
  on(listener: (value: T) => void): () => void;
  clear(): void;
}

export function createEmitter<T = void>(): Emitter<T> {
  const listeners = new Set<(value: T) => void>();
  return {
    emit(value) {
      for (const listener of [...listeners]) listener(value);
    },
    on(listener) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    clear: () => listeners.clear(),
  };
}
