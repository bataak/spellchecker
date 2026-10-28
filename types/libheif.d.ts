declare module "libheif-js/libheif-wasm/libheif-bundle.mjs" {
  export interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(target: ImageData, done: (result: ImageData | null) => void): void;
    free(): void;
  }
  interface HeifDecoder {
    decode(bytes: Uint8Array): HeifImage[];
  }
  interface LibHeif {
    HeifDecoder: new () => HeifDecoder;
  }
  export default function libheif(): LibHeif;
}
