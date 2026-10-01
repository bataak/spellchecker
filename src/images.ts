import { imageKey } from "./office/docir.ts";
import type { ImageSet, IrImage, PreparedImage } from "./office/docir.ts";

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

let prepared: string[] = [];

function own(blob: Blob): string {
  const url = URL.createObjectURL(blob);
  prepared.push(url);
  return url;
}

async function sourceBlob(src: string): Promise<Blob | null> {
  const stored = imageBlob(src);
  if (stored) return stored;
  if (!isRemoteImage(src)) return null;
  try {
    const response = await fetch(src);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

async function prepareOne(image: IrImage): Promise<PreparedImage | null> {
  const blob = await sourceBlob(image.src);
  if (!blob)
    return isRemoteImage(image.src)
      ? { url: image.src, blob: null, widthPx: 0, heightPx: 0 }
      : null;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const rotate = image.rotate ?? 0;
  const turned = rotate === 90 || rotate === 270;
  const widthPx = turned ? bitmap.height : bitmap.width;
  const heightPx = turned ? bitmap.width : bitmap.height;
  if (!rotate) {
    bitmap.close();
    return {
      url: imageUrl(image.src) ?? own(blob),
      blob,
      widthPx,
      heightPx,
    };
  }
  const canvas = document.createElement("canvas");
  canvas.width = widthPx;
  canvas.height = heightPx;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return null;
  }
  context.translate(widthPx / 2, heightPx / 2);
  context.rotate((rotate * Math.PI) / 180);
  context.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
  bitmap.close();
  const type = blob.type === "image/jpeg" ? "image/jpeg" : "image/png";
  const turnedBlob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, 0.92),
  );
  if (!turnedBlob) return null;
  return { url: own(turnedBlob), blob: turnedBlob, widthPx, heightPx };
}

export async function prepareImages(
  images: readonly IrImage[],
): Promise<ImageSet> {
  for (const url of prepared) URL.revokeObjectURL(url);
  prepared = [];
  const unique = new Map<string, IrImage>();
  for (const image of images) unique.set(imageKey(image), image);
  const out = new Map<string, PreparedImage>();
  await Promise.all(
    [...unique].map(async ([key, image]) => {
      const ready = await prepareOne(image);
      if (ready) out.set(key, ready);
    }),
  );
  return out;
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
