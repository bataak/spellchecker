const HEIC_NAME = /\.(heic|heif)$/i;
const HEIC_TYPE = /^image\/hei[cf]/i;
const QUALITY = 0.92;

interface Job {
  readonly resolve: (blob: Blob) => void;
  readonly reject: (error: Error) => void;
}

const jobs = new Map<number, Job>();
let worker: Worker | null = null;
let next = 0;

export function isHeic(file: File): boolean {
  return HEIC_TYPE.test(file.type) || HEIC_NAME.test(file.name);
}

export function jpegName(name: string): string {
  return name.replace(HEIC_NAME, "") + ".jpg";
}

function heicWorker(): Worker {
  if (worker) return worker;
  const made = new Worker(new URL("./heicworker.ts", import.meta.url), {
    type: "module",
  });
  made.onmessage = (
    event: MessageEvent<{ id: number; blob?: Blob; error?: string }>,
  ) => {
    const job = jobs.get(event.data.id);
    if (!job) return;
    jobs.delete(event.data.id);
    if (event.data.blob) job.resolve(event.data.blob);
    else job.reject(new Error(event.data.error ?? "heic"));
  };
  made.onerror = () => {
    for (const job of jobs.values()) job.reject(new Error("heic"));
    jobs.clear();
    made.terminate();
    worker = null;
  };
  worker = made;
  return made;
}

async function decoded(file: File): Promise<Blob> {
  const bytes = await file.arrayBuffer();
  const id = (next += 1);
  return new Promise((resolve, reject) => {
    jobs.set(id, { resolve, reject });
    heicWorker().postMessage({ id, bytes }, [bytes]);
  });
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
