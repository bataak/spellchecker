import { MAX_SIGNAL } from "./limits.ts";
export async function digest(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function first<T>(cursor: Iterable<T>): T | null {
  for (const row of cursor) return row;
  return null;
}

export function refuse(code: number, reason: string): Response {
  const [client, server] = Object.values(new WebSocketPair()) as [
    WebSocket,
    WebSocket,
  ];
  server.accept();
  server.close(code, reason);
  return new Response(null, { status: 101, webSocket: client });
}

export type Signal = Readonly<Record<string, unknown>>;

export function parseSignal(message: string): Signal | null {
  if (message.length > MAX_SIGNAL) return null;
  try {
    const value: unknown = JSON.parse(message);
    return value && typeof value === "object" ? (value as Signal) : null;
  } catch {
    return null;
  }
}

export function readMeta(sql: SqlStorage, key: string): string | null {
  return (
    first(sql.exec<{ v: string }>("SELECT v FROM meta WHERE k = ?", key))?.v ??
    null
  );
}
