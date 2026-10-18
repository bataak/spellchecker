export interface TexZip {
  readonly blob: Blob;
  readonly missing: readonly string[];
}

export async function zipTexText(text: string, name: string): Promise<TexZip> {
  const [{ zipSync, strToU8 }, { texImageSources }] = await Promise.all([
    import("fflate"),
    import("./teximages.ts"),
  ]);
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
