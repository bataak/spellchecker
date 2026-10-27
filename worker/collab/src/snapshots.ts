import {
  MAX_PART,
  MAX_PARTS,
  MAX_SLOTS,
  MAX_SNAPSHOT,
  ROOM_BYTES,
} from "./limits.ts";
import type { PeerMeta } from "./types.ts";

export function snapshots(sql: SqlStorage): ArrayBuffer[][] {
  const out: ArrayBuffer[][] = [];
  for (const row of [
    ...sql.exec<{ dev: string; data: ArrayBuffer }>(
      "SELECT dev, data FROM snap ORDER BY at",
    ),
  ]) {
    const parts = [row.data];
    for (const piece of sql.exec<{ data: ArrayBuffer }>(
      "SELECT data FROM piece WHERE dev = ? ORDER BY i",
      row.dev,
    ))
      parts.push(piece.data);
    out.push(parts);
  }
  return out;
}

export function forget(
  sql: SqlStorage,
  dev: string,
  tables = ["snap", "piece", "stage"],
): void {
  for (const table of tables)
    sql.exec("DELETE FROM " + table + " WHERE dev = ?", dev);
}

export function expect(
  sql: SqlStorage,
  ws: WebSocket,
  meta: PeerMeta,
  n: unknown,
): void {
  sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
  const up =
    typeof n === "number" && Number.isInteger(n) && n > 1 && n <= MAX_PARTS
      ? { n, got: 0, size: 0, bad: false }
      : null;
  ws.serializeAttachment({ ...meta, up });
}

export function receive(
  sql: SqlStorage,
  ws: WebSocket,
  meta: PeerMeta,
  data: ArrayBuffer,
): ArrayBuffer[] | null {
  const up = meta.up;
  if (!up) return [data];
  const size = up.size + data.byteLength;
  const got = up.got + 1;
  const fits =
    !up.bad &&
    data.byteLength > 0 &&
    data.byteLength <= MAX_PART &&
    size <= MAX_SNAPSHOT;
  ws.serializeAttachment({
    ...meta,
    up: got < up.n ? { n: up.n, got, size, bad: !fits } : null,
  });
  if (!fits) {
    if (!up.bad) sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
    return null;
  }
  sql.exec(
    "INSERT OR REPLACE INTO stage (dev, i, data) VALUES (?, ?, ?)",
    meta.dev,
    up.got,
    data,
  );
  if (got < up.n) return null;
  const parts = [
    ...sql.exec<{ data: ArrayBuffer }>(
      "SELECT data FROM stage WHERE dev = ? ORDER BY i",
      meta.dev,
    ),
  ].map((row) => row.data);
  sql.exec("DELETE FROM stage WHERE dev = ?", meta.dev);
  return parts.length === up.n ? parts : null;
}

export function fitsStore(parts: readonly ArrayBuffer[]): boolean {
  return parts.every(
    (data) => data.byteLength > 0 && data.byteLength <= MAX_PART,
  );
}

export function store(
  storage: DurableObjectStorage,
  dev: string,
  parts: readonly ArrayBuffer[],
): void {
  const sql = storage.sql;
  storage.transactionSync(() => {
    sql.exec(
      "INSERT INTO snap (dev, data, at) VALUES (?, ?, ?) ON CONFLICT (dev) DO UPDATE SET data = excluded.data, at = excluded.at",
      dev,
      parts[0]!,
      Date.now(),
    );
    sql.exec("DELETE FROM piece WHERE dev = ?", dev);
    parts
      .slice(1)
      .forEach((data, at) =>
        sql.exec(
          "INSERT INTO piece (dev, i, data) VALUES (?, ?, ?)",
          dev,
          at + 1,
          data,
        ),
      );
    prune(sql);
  });
}

function prune(sql: SqlStorage): void {
  let used = 0;
  let kept = 0;
  for (const row of [
    ...sql.exec<{ dev: string; size: number }>(
      "SELECT dev, length(data) + COALESCE((SELECT SUM(length(data)) FROM piece WHERE piece.dev = snap.dev), 0) AS size FROM snap ORDER BY at DESC",
    ),
  ]) {
    if (kept > 0 && (kept >= MAX_SLOTS || used + row.size > ROOM_BYTES)) {
      forget(sql, row.dev, ["snap", "piece"]);
      continue;
    }
    used += row.size;
    kept++;
  }
}
