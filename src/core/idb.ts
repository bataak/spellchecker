const failure = (error: DOMException | null): Error =>
  error ?? new Error("IndexedDB request failed");

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error));
  });
}

export function openDatabase(
  name: string,
  create: (db: IDBDatabase) => void,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => create(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error));
  });
}

export function transactionFailure(
  tx: IDBTransaction,
  request?: IDBRequest,
): Error {
  return failure(tx.error ?? request?.error ?? null);
}
