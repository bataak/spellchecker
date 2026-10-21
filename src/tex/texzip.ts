import { fflate } from "../archive/fflate.ts";
import { texImageSources } from "./teximages.ts";
export interface TexZip {
  readonly blob: Blob;
  readonly missing: readonly string[];
}

export async function zipTexText(text: string, name: string): Promise<TexZip> {
  const { strToU8, zipSync } = await fflate();
  const images = await texImageSources(text);
  const zip = zipSync({
    ...images.files,
    [name + ".tex"]: strToU8(images.rewrite(text)),
  });
  return {
    blob: new Blob([zip as Uint8Array<ArrayBuffer>], {
      type: "application/zip",
    }),
    missing: images.missing,
  };
}
