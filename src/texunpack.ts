import { untar } from "./tar.ts";
import { unxz } from "./xz.ts";

interface UnpackRequest {
  readonly id: number;
  readonly bytes: Uint8Array;
  readonly keep: readonly string[];
}

self.onmessage = (event: MessageEvent<UnpackRequest>) => {
  const { id, bytes, keep } = event.data;
  try {
    const wanted = new Set(keep);
    const files: [string, Uint8Array][] = [];
    const seen = new Set<string>();
    for (const entry of untar(unxz(bytes))) {
      const name = entry.name.slice(entry.name.lastIndexOf("/") + 1);
      if (!wanted.has(name) || seen.has(name)) continue;
      seen.add(name);
      files.push([name, entry.data]);
    }
    self.postMessage(
      { id, files },
      { transfer: files.map(([, data]) => data.buffer) },
    );
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
