import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";

export interface CollabServer {
  readonly url: string;
  allow(origin: string): Promise<void>;
  close(): Promise<void>;
}

const SCRIPT = fileURLToPath(
  new URL("../../worker/collab/src/index.js", import.meta.url),
);

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function options(port: number, origins: string) {
  return {
    modules: true,
    scriptPath: SCRIPT,
    compatibilityDate: "2026-08-01",
    host: "127.0.0.1",
    port,
    durableObjects: {
      ROOMS: { className: "Room", useSQLite: true },
      QUOTA: { className: "Quota", useSQLite: true },
    },
    bindings: { ALLOWED_ORIGINS: origins },
  };
}

export async function startCollab(): Promise<CollabServer> {
  const port = await freePort();
  const mf = new Miniflare(options(port, ""));
  const url = (await mf.ready).origin;
  return {
    url,
    allow: (origin) => mf.setOptions(options(port, origin)),
    close: () => mf.dispose(),
  };
}
