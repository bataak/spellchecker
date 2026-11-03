import { first, readMeta } from "./util.ts";

const CONTENT_TABLES = ["snap", "piece", "stage", "invites", "members"];

export function createTables(sql: SqlStorage): void {
  sql.exec(
    "CREATE TABLE IF NOT EXISTS snap (dev TEXT PRIMARY KEY, data BLOB NOT NULL, at INTEGER NOT NULL)",
  );
  for (const table of ["piece", "stage"])
    sql.exec(
      "CREATE TABLE IF NOT EXISTS " +
        table +
        " (dev TEXT NOT NULL, i INTEGER NOT NULL, data BLOB NOT NULL, PRIMARY KEY (dev, i))",
    );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT NOT NULL)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS invites (h TEXT PRIMARY KEY, at INTEGER NOT NULL, dev TEXT)",
  );
  sql.exec(
    "CREATE TABLE IF NOT EXISTS members (dev TEXT PRIMARY KEY, h TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', at INTEGER NOT NULL, gone INTEGER NOT NULL DEFAULT 0)",
  );
}

export function clearContent(sql: SqlStorage): void {
  for (const table of CONTENT_TABLES) sql.exec("DELETE FROM " + table);
}

export function isShared(sql: SqlStorage): boolean {
  return (
    first(sql.exec("SELECT 1 AS x FROM invites LIMIT 1")) !== null ||
    first(
      sql.exec(
        "SELECT 1 AS x FROM members WHERE dev != ? LIMIT 1",
        readMeta(sql, "dev") ?? "",
      ),
    ) !== null
  );
}
