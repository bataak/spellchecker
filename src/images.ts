interface Stored {
  readonly blob: Blob;
  readonly url: string;
}

const REMOTE = /^(?:https?:|data:|blob:)/i;

const store = new Map<string, Stored>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function isRemoteImage(src: string): boolean {
  return REMOTE.test(src);
}

export function imageUrl(src: string): string | null {
  if (isRemoteImage(src)) return src;
  return store.get(src)?.url ?? null;
}

export function imageBlob(src: string): Blob | null {
  return store.get(src)?.blob ?? null;
}

export function putImage(src: string, blob: Blob): void {
  const old = store.get(src);
  if (old) URL.revokeObjectURL(old.url);
  store.set(src, { blob, url: URL.createObjectURL(blob) });
  notify();
}

export function clearImages(): void {
  if (!store.size) return;
  for (const { url } of store.values()) URL.revokeObjectURL(url);
  store.clear();
  notify();
}

export function onImagesChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function imagePath(name: string): string {
  return name.replace(/[\s()<>%]/g, (ch) =>
    ch === "(" ? "%28" : ch === ")" ? "%29" : encodeURIComponent(ch),
  );
}

export function pickImage(): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}
