import zlib from "node:zlib";

async function fullFlushChunks(
  plain: Uint8Array,
  chunkLength: number,
): Promise<{ body: Uint8Array; sizes: number[] }> {
  const deflate = zlib.createDeflateRaw({ level: 9 });
  const parts: Buffer[] = [];
  deflate.on("data", (part: Buffer) => parts.push(part));
  const sizes: number[] = [];
  let previous = 0;
  const total = (): number => parts.reduce((sum, part) => sum + part.length, 0);
  for (let at = 0; at < plain.length; at += chunkLength) {
    deflate.write(plain.subarray(at, at + chunkLength));
    await new Promise<void>((resolve) =>
      deflate.flush(zlib.constants.Z_FULL_FLUSH, resolve),
    );
    sizes.push(total() - previous);
    previous = total();
  }
  await new Promise<void>((resolve) => deflate.end(resolve));
  return { body: new Uint8Array(Buffer.concat(parts)), sizes };
}

function dictZipFile(
  body: Uint8Array,
  sizes: number[],
  chunkLength: number,
  plainLength: number,
  name: string | null,
): Uint8Array {
  const extra = new Uint8Array(4 + 6 + sizes.length * 2);
  const extraView = new DataView(extra.buffer);
  extra[0] = 0x52;
  extra[1] = 0x41;
  extraView.setUint16(2, 6 + sizes.length * 2, true);
  extraView.setUint16(4, 1, true);
  extraView.setUint16(6, chunkLength, true);
  extraView.setUint16(8, sizes.length, true);
  for (let i = 0; i < sizes.length; i++)
    extraView.setUint16(10 + i * 2, sizes[i]!, true);

  const nameBytes = name
    ? new TextEncoder().encode(name + "\u0000")
    : new Uint8Array(0);
  const head = new Uint8Array(12 + extra.length + nameBytes.length);
  const headView = new DataView(head.buffer);
  head[0] = 0x1f;
  head[1] = 0x8b;
  head[2] = 0x08;
  head[3] = 4 | (name ? 8 : 0);
  head[9] = 3;
  headView.setUint16(10, extra.length, true);
  head.set(extra, 12);
  head.set(nameBytes, 12 + extra.length);

  const tail = new Uint8Array(8);
  new DataView(tail.buffer).setUint32(4, plainLength, true);

  const file = new Uint8Array(head.length + body.length + tail.length);
  file.set(head, 0);
  file.set(body, head.length);
  file.set(tail, head.length + body.length);
  return file;
}

export async function buildDictZip(
  plain: Uint8Array,
  chunkLength: number,
  name: string | null = "mn.dict",
): Promise<Uint8Array> {
  const { body, sizes } = await fullFlushChunks(plain, chunkLength);
  return dictZipFile(body, sizes, chunkLength, plain.length, name);
}

export function inflateChunk(chunk: Uint8Array): Uint8Array {
  return new Uint8Array(zlib.inflateRawSync(chunk));
}
