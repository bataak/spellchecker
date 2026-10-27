import { DENIED, MAX_MEMBERS, PURGED, REMOVED, TOKEN } from "./limits.ts";
import type { Access } from "./types.ts";
import { digest, first, newToken, readMeta } from "./util.ts";

const goneCode = (gone: number): number => (gone === 2 ? PURGED : REMOVED);

export async function admit(
  sql: SqlStorage,
  params: URLSearchParams,
  dev: string,
): Promise<Access> {
  const owner = params.get("o");
  const member = params.get("m");
  const token = owner ?? member ?? params.get("i");
  if (!token || !TOKEN.test(token)) return { code: DENIED };
  const closed = Number(readMeta(sql, "closed"));
  if (closed) return { code: closed };
  const hash = await digest(token);
  if (owner) return ownerAccess(sql, hash, dev);
  if (member) return memberAccess(sql, hash, dev);
  const fresh = newToken();
  return inviteAccess(sql, hash, dev, fresh, await digest(fresh));
}

function ownerAccess(sql: SqlStorage, hash: string, dev: string): Access {
  const known = readMeta(sql, "owner");
  if (known && known !== hash) return { code: DENIED };
  if (!known) {
    if (first(sql.exec("SELECT 1 AS x FROM members LIMIT 1")))
      return { code: DENIED };
    sql.exec("INSERT INTO meta (k, v) VALUES ('owner', ?)", hash);
    sql.exec("INSERT INTO meta (k, v) VALUES ('dev', ?)", dev);
    sql.exec(
      "INSERT INTO members (dev, h, at) VALUES (?, '', ?)",
      dev,
      Date.now(),
    );
  }
  if (readMeta(sql, "dev") !== dev) return { code: DENIED };
  return { owner: true };
}

function memberAccess(sql: SqlStorage, hash: string, dev: string): Access {
  const row = first(
    sql.exec<{ h: string; gone: number }>(
      "SELECT h, gone FROM members WHERE dev = ?",
      dev,
    ),
  );
  if (row?.gone) return { code: goneCode(row.gone) };
  return row && row.h === hash ? {} : { code: DENIED };
}

function inviteAccess(
  sql: SqlStorage,
  hash: string,
  dev: string,
  fresh: string,
  freshHash: string,
): Access {
  const used = first(
    sql.exec<{ dev: string | null }>(
      "SELECT dev FROM invites WHERE h = ?",
      hash,
    ),
  );
  if (!used || (used.dev && used.dev !== dev)) return { code: DENIED };
  const known = first(
    sql.exec<{ gone: number }>("SELECT gone FROM members WHERE dev = ?", dev),
  );
  if (known?.gone && used.dev) return { code: goneCode(known.gone) };
  if ((!known || known.gone) && activeMembers(sql) >= MAX_MEMBERS)
    return { code: DENIED };
  sql.exec("UPDATE invites SET dev = ? WHERE h = ?", dev, hash);
  sql.exec(
    "INSERT INTO members (dev, h, at) VALUES (?, ?, ?) ON CONFLICT (dev) DO UPDATE SET h = excluded.h, gone = 0, label = '', at = excluded.at",
    dev,
    freshHash,
    Date.now(),
  );
  return { member: fresh };
}

function activeMembers(sql: SqlStorage): number {
  const row = first(
    sql.exec<{ n: number }>("SELECT COUNT(*) AS n FROM members WHERE gone = 0"),
  );
  return row?.n ?? 0;
}
