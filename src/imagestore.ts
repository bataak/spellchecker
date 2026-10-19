import { persistImages, restoreImages } from "./images.ts";
import { storedTexts } from "./storage.ts";
import { storedHistoryTexts } from "./undohistory.ts";
import { noteError } from "./errorlog.ts";

interface StoredImage {
  readonly src: string;
  readonly blob: Blob;
}

const DB_NAME = "bichig-images";
const STORE = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore(STORE, { keyPath: "src" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function settled(request: IDBRequest): Promise<void> {
  return new Promise((resolve) => {
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
  });
}

async function saveImage(src: string, blob: Blob): Promise<void> {
  try {
    const db = await openDb();
    await settled(
      db.transaction(STORE, "readwrite").objectStore(STORE).put({ src, blob }),
    );
  } catch (error) {
    noteError(error);
  }
}

export function referenced(src: string, texts: readonly string[]): boolean {
  return texts.some((text) => text.includes(src));
}

export async function initImageStore(current: () => string): Promise<void> {
  persistImages((src, blob) => void saveImage(src, blob));
  let db: IDBDatabase;
  try {
    db = await openDb();
  } catch {
    return;
  }
  const request = db.transaction(STORE).objectStore(STORE).getAll();
  await settled(request);
  const images = (request.result as StoredImage[] | undefined) ?? [];
  if (!images.length) return;
  const texts = [
    current(),
    ...(await storedTexts()),
    ...(await storedHistoryTexts()),
  ];
  const keep: [string, Blob][] = [];
  const store = db.transaction(STORE, "readwrite").objectStore(STORE);
  for (const image of images) {
    if (referenced(image.src, texts)) keep.push([image.src, image.blob]);
    else store.delete(image.src);
  }
  restoreImages(keep);
}
