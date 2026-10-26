const failure = (error: DOMException | null): Error =>
  error ?? new Error("IndexedDB request failed");

export function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error));
  });
}

export function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(failure(tx.error));
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
