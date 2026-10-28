import libheif, {
  type HeifImage,
} from "libheif-js/libheif-wasm/libheif-bundle.mjs";

interface HeicRequest {
  readonly id: number;
  readonly bytes: ArrayBuffer;
}

const QUALITY = 0.92;
let lib: ReturnType<typeof libheif> | null = null;

function displayed(image: HeifImage | undefined): Promise<ImageData> {
  if (!image) return Promise.reject(new Error("heic"));
  const target = new ImageData(image.get_width(), image.get_height());
  return new Promise((resolve, reject) =>
    image.display(target, (result) =>
      result ? resolve(result) : reject(new Error("heic")),
    ),
  );
}

async function convert(bytes: ArrayBuffer): Promise<Blob> {
  lib ??= libheif();
  const images = new lib.HeifDecoder().decode(new Uint8Array(bytes));
  const pixels = await displayed(images[0]).finally(() => {
    for (const each of images) each.free();
  });
  const { width, height } = pixels;
  const canvas = new OffscreenCanvas(width, height);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("heic");
  context.putImageData(pixels, 0, 0);
  return canvas.convertToBlob({ type: "image/jpeg", quality: QUALITY });
}

self.onmessage = (event: MessageEvent<HeicRequest>) => {
  const { id, bytes } = event.data;
  convert(bytes).then(
    (value) => self.postMessage({ id, value }),
    (error: unknown) =>
      self.postMessage({
        id,
        error: error instanceof Error ? error.message : String(error),
      }),
  );
};
