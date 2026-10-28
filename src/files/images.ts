import { heicToJpeg, isHeic } from "./heic.ts";
import { imageKey } from "../office/docir.ts";
import type {
  EmbeddedImage,
  ImageFiles,
  ImageSet,
  IrImage,
  PreparedImage,
} from "../office/docir.ts";

interface Stored {
  readonly blob: Blob;
  readonly url: string;
}

const REMOTE = /^(?:https?:|data:|blob:)/i;
const NETWORK = /^https?:/i;

export function isRemoteImage(src: string): boolean {
  return REMOTE.test(src);
}

interface PrepareContext {
  readonly blob: (src: string) => Blob | null;
  readonly url: (src: string) => string | null;
  readonly own: (blob: Blob) => string;
}

async function sourceBlob(
  src: string,
  stored: Blob | null,
): Promise<Blob | null> {
  if (stored) return stored;
  if (!isRemoteImage(src)) return null;
  try {
    const response = await fetch(src);
    return response.ok ? await response.blob() : null;
  } catch {
    return null;
  }
}

async function prepareOne(
  image: IrImage,
  source: PrepareContext,
): Promise<PreparedImage | null> {
  const blob = await sourceBlob(image.src, source.blob(image.src));
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
      url: source.url(image.src) ?? source.own(blob),
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
  return { url: source.own(turnedBlob), blob: turnedBlob, widthPx, heightPx };
}

async function encodable(
  blob: Blob,
  drawn: boolean,
): Promise<{ blob: Blob; ext: "png" | "jpeg" } | null> {
  const jpeg = blob.type === "image/jpeg";
  if (blob.type === "image/png") return { blob, ext: "png" };
  if (jpeg && drawn) return { blob, ext: "jpeg" };
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(blob);
  } catch {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  const ext = jpeg ? "jpeg" : "png";
  const out = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/" + ext, 0.92),
  );
  return out ? { blob: out, ext } : null;
}

export function imagePath(name: string): string {
  return name.replace(/[\s()<>%]/g, (ch) =>
    ch === "(" ? "%28" : ch === ")" ? "%29" : encodeURIComponent(ch),
  );
}

function sameImage(a: Blob, b: Blob): boolean {
  if (a === b) return true;
  if (a.size !== b.size || a.type !== b.type) return false;
  if (!(a instanceof File && b instanceof File)) return true;
  return a.lastModified === b.lastModified;
}

export function pickImage(): Promise<File | null> {
  return new Promise<File | null>((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,.heic,.heif";
    input.addEventListener("change", () => resolve(input.files?.[0] ?? null));
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  }).then((file) =>
    file && isHeic(file) ? heicToJpeg(file).catch(() => file) : file,
  );
}

export interface ImageStore {
  isBlockedRemote(src: string): boolean;
  allowRemote(srcs: Iterable<string>): void;
  url(src: string): string | null;
  blob(src: string): Blob | null;
  persistTo(save: (src: string, blob: Blob) => void): void;
  put(src: string, blob: Blob): void;
  restore(images: Iterable<[string, Blob]>): void;
  clear(): void;
  onChange(listener: () => void): () => void;
  prepare(image: IrImage): Promise<PreparedImage | null>;
  freePath(name: string, blob: Blob): string;
}

export function createImageStore(): ImageStore {
  const store = new Map<string, Stored>();
  const listeners = new Set<() => void>();
  const prepared = new Map<string, Promise<PreparedImage | null>>();
  const allowed = new Set<string>();
  let owned: string[] = [];
  let persist: ((src: string, blob: Blob) => void) | null = null;

  const notify = (): void => listeners.forEach((listener) => listener());
  const dropPrepared = (): void => {
    for (const url of owned) URL.revokeObjectURL(url);
    owned = [];
    prepared.clear();
  };
  const keep = (src: string, blob: Blob): void => {
    const old = store.get(src);
    if (old) URL.revokeObjectURL(old.url);
    store.set(src, { blob, url: URL.createObjectURL(blob) });
  };
  const isBlockedRemote = (src: string): boolean =>
    NETWORK.test(src) && !allowed.has(src);
  const url = (src: string): string | null => {
    if (isBlockedRemote(src)) return null;
    if (isRemoteImage(src)) return src;
    return store.get(src)?.url ?? null;
  };
  const context: PrepareContext = {
    blob: (src) => store.get(src)?.blob ?? null,
    url,
    own(blob) {
      const made = URL.createObjectURL(blob);
      owned.push(made);
      return made;
    },
  };

  return {
    isBlockedRemote,
    allowRemote(srcs) {
      for (const src of srcs) allowed.add(src);
      notify();
    },
    url,
    blob: context.blob,
    persistTo(save) {
      persist = save;
    },
    put(src, blob) {
      dropPrepared();
      keep(src, blob);
      persist?.(src, blob);
      notify();
    },
    restore(images) {
      let any = false;
      for (const [src, blob] of images) {
        if (store.has(src)) continue;
        keep(src, blob);
        any = true;
      }
      if (!any) return;
      dropPrepared();
      notify();
    },
    clear() {
      if (!store.size && !prepared.size) return;
      for (const { url: made } of store.values()) URL.revokeObjectURL(made);
      store.clear();
      dropPrepared();
      notify();
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    prepare(image) {
      const key = imageKey(image);
      let ready = prepared.get(key);
      if (!ready) {
        ready = prepareOne(image, context);
        prepared.set(key, ready);
      }
      return ready;
    },
    freePath(name, blob) {
      const dot = name.lastIndexOf(".");
      const stem = dot > 0 ? name.slice(0, dot) : name;
      const ext = dot > 0 ? name.slice(dot) : "";
      for (let n = 1; ; n++) {
        const src = imagePath(n === 1 ? name : stem + "-" + n + ext);
        const taken = store.get(src);
        if (!taken || sameImage(taken.blob, blob)) return src;
      }
    },
  };
}

const shared = createImageStore();

export const isBlockedRemote = (src: string): boolean =>
  shared.isBlockedRemote(src);
export const allowRemoteImages = (srcs: Iterable<string>): void =>
  shared.allowRemote(srcs);
export const imageUrl = (src: string): string | null => shared.url(src);
export const imageBlob = (src: string): Blob | null => shared.blob(src);
export const persistImages = (save: (src: string, blob: Blob) => void): void =>
  shared.persistTo(save);
export const putImage = (src: string, blob: Blob): void =>
  shared.put(src, blob);
export const restoreImages = (images: Iterable<[string, Blob]>): void =>
  shared.restore(images);
export const clearImages = (): void => shared.clear();
export const onImagesChange = (listener: () => void): (() => void) =>
  shared.onChange(listener);
export const prepareImage = (image: IrImage): Promise<PreparedImage | null> =>
  shared.prepare(image);
export const freeImagePath = (name: string, blob: Blob): string =>
  shared.freePath(name, blob);

export async function prepareImages(
  images: readonly IrImage[],
): Promise<ImageSet> {
  const out = new Map<string, PreparedImage>();
  await Promise.all(
    images.map(async (image) => {
      const ready = await prepareImage(image);
      if (ready) out.set(imageKey(image), ready);
    }),
  );
  return out;
}

export async function imageFiles(
  images: readonly IrImage[],
): Promise<ImageFiles> {
  const out = new Map<string, EmbeddedImage>();
  await Promise.all(
    images.map(async (image) => {
      const ready = await prepareImage(image);
      if (!ready?.blob) return;
      const file = await encodable(ready.blob, !!image.rotate);
      if (!file) return;
      out.set(imageKey(image), {
        bytes: new Uint8Array(await file.blob.arrayBuffer()),
        ext: file.ext,
        widthPx: ready.widthPx,
        heightPx: ready.heightPx,
      });
    }),
  );
  return out;
}
