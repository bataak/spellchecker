export function attempt<T>(task: () => T, fallback: T): T {
  try {
    return task();
  } catch {
    return fallback;
  }
}

export async function attemptAsync<T>(
  task: () => Promise<T>,
  fallback: T,
): Promise<T> {
  try {
    return await task();
  } catch {
    return fallback;
  }
}
