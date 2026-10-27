import { fromBase64Url, toBase64Url, validName } from "../collab/collabkey.ts";
import { TEXT_EXT } from "./filetypes.ts";
import { decodeStrict } from "./safetext.ts";

export const TEXT_LINK_MAX = 2000;
export const TEXT_LINK_WARNING =
  "Холбоос дотор бичвэр нууцлалгүй агуулагдаж байгааг анхаарна уу";

export interface LinkedText {
  readonly text: string;
  readonly name: string | null;
}

const PREFIX = "#text=";
const MAX_ENCODED = 12_000;
const MAX_BYTES = TEXT_LINK_MAX * 4;

function pipe(
  bytes: Uint8Array,
  stream: GenericTransformStream,
): ReadableStreamDefaultReader<Uint8Array> {
  const writer = stream.writable.getWriter();
  void writer.write(bytes).catch(() => undefined);
  void writer.close().catch(() => undefined);
  return stream.readable.getReader() as ReadableStreamDefaultReader<Uint8Array>;
}

async function collect(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  max: number,
): Promise<Uint8Array | null> {
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

export function fitsTextLink(text: string): boolean {
  return text.length > 0 && text.length <= TEXT_LINK_MAX;
}

export async function textHash(
  text: string,
  name: string | null,
): Promise<string | null> {
  if (!fitsTextLink(text)) return null;
  const reader = pipe(
    new TextEncoder().encode(text),
    new CompressionStream("deflate-raw"),
  );
  const packed = await collect(reader, Infinity);
  if (!packed) return null;
  const suffix =
    name && validName(name) ? "&name=" + encodeURIComponent(name) : "";
  return PREFIX + toBase64Url(packed) + suffix;
}

export function isTextHash(hash: string): boolean {
  return hash.startsWith(PREFIX);
}

function readName(raw: string | null): string | null {
  if (raw === null) return null;
  try {
    const name = decodeURIComponent(raw);
    return validName(name) && TEXT_EXT.test(name) ? name : null;
  } catch {
    return null;
  }
}

export async function readTextHash(hash: string): Promise<LinkedText | null> {
  if (!isTextHash(hash) || hash.length > MAX_ENCODED) return null;
  const [data = "", ...rest] = hash.slice(PREFIX.length).split("&");
  if (!/^[\w-]+$/.test(data)) return null;
  const nameField = rest.find((part) => part.startsWith("name="));
  try {
    const reader = pipe(
      fromBase64Url(data),
      new DecompressionStream("deflate-raw"),
    );
    const bytes = await collect(reader, MAX_BYTES);
    const text = bytes && decodeStrict(bytes);
    if (!text || !fitsTextLink(text)) return null;
    return { text, name: readName(nameField ? nameField.slice(5) : null) };
  } catch {
    return null;
  }
}
