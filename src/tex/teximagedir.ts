import { noteError } from "../core/errorlog.ts";
import { databaseOpener } from "../core/idb.ts";

const DB_NAME = "bichig-tex";

const DB_STORE = "handles";

const DIR_KEY = "imageDir";

const openDb = databaseOpener(DB_NAME, (db) => db.createObjectStore(DB_STORE));

export async function savedDir(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const request = db
        .transaction(DB_STORE)
        .objectStore(DB_STORE)
        .get(DIR_KEY);
      request.onsuccess = () =>
        resolve((request.result as FileSystemDirectoryHandle) ?? null);
      request.onerror = () => resolve(null);
    });
  } catch (error) {
    noteError(error);
    return null;
  }
}

export async function saveDir(
  handle: FileSystemDirectoryHandle,
): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(DB_STORE, "readwrite");
      tx.objectStore(DB_STORE).put(handle, DIR_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch (error) {
    noteError(error);
  }
}

export async function fromDir(
  dir: FileSystemDirectoryHandle,
  path: string,
): Promise<Blob | null> {
  const parts = path.split("/").filter((part) => part && part !== ".");
  const file = parts.pop();
  if (!file || parts.includes("..")) return null;
  try {
    let current = dir;
    for (const part of parts) current = await current.getDirectoryHandle(part);
    return await (await current.getFileHandle(file)).getFile();
  } catch {
    return null;
  }
}

export async function readableDir(): Promise<FileSystemDirectoryHandle | null> {
  const dir = await savedDir();
  if (!dir) return null;
  try {
    return (await dir.queryPermission?.({ mode: "read" })) === "granted"
      ? dir
      : null;
  } catch {
    return null;
  }
}
