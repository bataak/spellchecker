import { workerJobs } from "../core/workerjobs.ts";

const HEIC_NAME = /\.(heic|heif)$/i;
const HEIC_TYPE = /^image\/hei[cf]/i;
const QUALITY = 0.92;
const DECODE_MS = 60_000;

const decode = workerJobs<{ readonly bytes: ArrayBuffer }, Blob>(
  () =>
    new Worker(new URL("./heicworker.ts", import.meta.url), {
      type: "module",
    }),
  "heic",
  DECODE_MS,
);

export function isHeic(file: File): boolean {
  return HEIC_TYPE.test(file.type) || HEIC_NAME.test(file.name);
}

export function jpegName(name: string): string {
  return name.replace(HEIC_NAME, "") + ".jpg";
}

async function decoded(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  return decode({ bytes }, [bytes]);
}

async function native(file: File): Promise<Blob | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
  bitmap.close();
  return new Promise((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", QUALITY),
  );
}

export async function heicToJpeg(file: File): Promise<File> {
  const blob = (await native(file)) ?? (await decoded(file));
  return new File([blob], jpegName(file.name), {
    type: "image/jpeg",
    lastModified: file.lastModified,
  });
}

export function jpegIfHeic(file: File): Promise<File> {
  return isHeic(file)
    ? heicToJpeg(file).catch(() => file)
    : Promise.resolve(file);
}
