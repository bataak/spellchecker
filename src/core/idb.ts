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

function openDatabase(
  name: string,
  create: (db: IDBDatabase) => void,
  version: number,
): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => create(request.result);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(failure(request.error));
  });
}

export function databaseOpener(
  name: string,
  create: (db: IDBDatabase) => void,
  version = 1,
): () => Promise<IDBDatabase> {
  let pending: Promise<IDBDatabase> | null = null;
  const forget = (): void => {
    pending = null;
  };
  return () =>
    (pending ??= openDatabase(name, create, version).then(
      (db) => {
        db.onclose = forget;
        db.onversionchange = () => {
          db.close();
          forget();
        };
        return db;
      },
      (error: unknown) => {
        forget();
        throw error;
      },
    ));
}
