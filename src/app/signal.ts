export interface Signal<T> {
  readonly emit: (value: T) => void;
  readonly on: (listener: (value: T) => void) => void;
}

export function createSignal<T>(): Signal<T> {
  const listeners: ((value: T) => void)[] = [];
  return {
    emit(value) {
      for (const listener of listeners) listener(value);
    },
    on(listener) {
      listeners.push(listener);
    },
  };
}
