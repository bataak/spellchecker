export type ErrorSink = (error: unknown) => void;

export function attempt<T>(task: () => T, fallback: T, onError?: ErrorSink): T {
  try {
    return task();
  } catch (error) {
    onError?.(error);
    return fallback;
  }
}

export async function attemptAsync<T>(
  task: () => Promise<T>,
  fallback: T,
  onError?: ErrorSink,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    onError?.(error);
    return fallback;
  }
}
