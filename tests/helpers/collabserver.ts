import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { Miniflare } from "miniflare";
import ts from "typescript";

export interface CollabServer {
  readonly url: string;
  allow(origin: string): Promise<void>;
  expire(room: string): Promise<void>;
  storedRoom(room: string): Promise<string | null>;
  stagedParts(room: string): Promise<number>;
  close(): Promise<void>;
}

const WORKER = fileURLToPath(new URL("../../worker/", import.meta.url));

const SOURCES = [
  "collab/src/index.ts",
  ...readdirSync(join(WORKER, "collab/src"))
    .filter((name) => name.endsWith(".ts") && name !== "index.ts")
    .map((name) => "collab/src/" + name),
  "shared/origin.ts",
  "shared/protocol.ts",
].map((name) => join(WORKER, name));

const ROOM_PROBE =
  '\nRoom.prototype.stagedParts = function () { return this.sql.exec("SELECT COUNT(*) AS n FROM stage").one().n; };\n';

function compiled(path: string): string {
  const output = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  }).outputText;
  return path.endsWith("/room.ts") ? output + ROOM_PROBE : output;
}

const MODULES = SOURCES.map((path) => ({
  type: "ESModule" as const,
  path,
  contents: compiled(path),
}));

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

export interface CollabOptions {
  readonly turn?: (request: Request) => Promise<Response>;
  readonly daily?: number;
}

function options(port: number, origins: string, extra: CollabOptions) {
  const turn = extra.turn
    ? { TURN_KEY_ID: "key", TURN_KEY_TOKEN: "token" }
    : {};
  return {
    modules: MODULES,
    compatibilityDate: "2026-08-01",
    host: "127.0.0.1",
    port,
    durableObjects: {
      ROOMS: { className: "Room", useSQLite: true },
      QUOTA: { className: "Quota", useSQLite: true },
      LINKS: { className: "Links", useSQLite: true },
    },
    bindings: {
      ALLOWED_ORIGINS: origins,
      TURN_DAILY: String(extra.daily ?? 2000),
      ...turn,
    },
    ...(extra.turn && { outboundService: extra.turn }),
  };
}

export async function startCollab(
  extra: CollabOptions = {},
): Promise<CollabServer> {
  const port = await freePort();
  const mf = new Miniflare(options(port, "", extra));
  const url = (await mf.ready).origin;
  return {
    url,
    allow: (origin) => mf.setOptions(options(port, origin, extra)),
    async expire(room) {
      const rooms = await mf.getDurableObjectNamespace("ROOMS");
      const stub = rooms.get(rooms.idFromName(room)) as unknown as {
        sweep(): Promise<void>;
      };
      await stub.sweep();
    },
    async storedRoom(room) {
      const rooms = await mf.getDurableObjectNamespace("ROOMS");
      const stub = rooms.get(rooms.idFromName(room)) as unknown as {
        roomId(): Promise<string | null>;
      };
      return stub.roomId();
    },
    async stagedParts(room) {
      const rooms = await mf.getDurableObjectNamespace("ROOMS");
      const stub = rooms.get(rooms.idFromName(room)) as unknown as {
        stagedParts(): Promise<number>;
      };
      return stub.stagedParts();
    },
    close: () => mf.dispose(),
  };
}
