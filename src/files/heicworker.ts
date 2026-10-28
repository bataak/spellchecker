import libheif from "libheif-js/libheif-wasm/libheif-bundle.mjs";

interface HeicRequest {
  readonly id: number;
  readonly bytes: ArrayBuffer;
}

const QUALITY = 0.92;
let lib: ReturnType<typeof libheif> | null = null;

async function convert(bytes: ArrayBuffer): Promise<Blob> {
  lib ??= libheif();
  const images = new lib.HeifDecoder().decode(new Uint8Array(bytes));
  const image = images[0];
  if (!image) throw new Error("heic");
  const width = image.get_width();
  const height = image.get_height();
  const pixels = await new Promise<ImageData>((resolve, reject) =>
    image.display(new ImageData(width, height), (result) =>
      result ? resolve(result) : reject(new Error("heic")),
    ),
  );
  for (const each of images) each.free();
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("heic");
  context.putImageData(pixels, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY });
}

self.onmessage = (event: MessageEvent<HeicRequest>) => {
  const { id, bytes } = event.data;
  convert(bytes).then(
    (blob) => self.postMessage({ id, blob }),
    (error: unknown) =>
      self.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
};
