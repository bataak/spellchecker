import {
  baseName,
  cleanPath,
  isEditablePath,
  parentDirs,
  skippedPath,
} from "../../tex/texproject.ts";
import { MAX_BYTES, budget } from "../projectdisk.ts";
import { ownValue, pathRecord } from "../../core/pathrecord.ts";
import { Cancelled, PROJECT_TOO_LARGE, ProjectError } from "../projecterror.ts";
import { readText } from "../projectstate.ts";
import {
  inBatches,
  type GitHost,
  type LoadWatch,
  type Provider,
  type RepoSpec,
  type TreeEntry,
} from "./githost.ts";

import {
  conflictsOf,
  merge3,
  resolveChunks,
  type Chunk,
  type Conflict,
  type Pick,
} from "./merge3.ts";

const FILE_MODE = "100644";

export type MergeItem =
  | {
      readonly path: string;
      readonly kind: "text";
      readonly conflicts: readonly Conflict[];
    }
  | {
      readonly path: string;
      readonly kind: "file";
      readonly ours: "changed" | "deleted";
      readonly theirs: "changed" | "deleted";
    };

export type MergeAnswer = ReadonlyMap<
  string,
  readonly Pick[] | "ours" | "theirs"
>;

export type Resolver = (
  items: readonly MergeItem[],
) => Promise<MergeAnswer | null>;

export interface RemoteFile {
  readonly sha: string;
  readonly mode: string;
}

export interface GitRemote {
  readonly provider: Provider;
  readonly host: string;
  readonly project: string;
  readonly branch: string;
  readonly dir: string;
  readonly head: string;
  readonly tree: string;
  readonly files: Readonly<Record<string, RemoteFile>>;
}

export interface LoadedRepo {
  readonly name: string;
  readonly files: [string, Uint8Array][];
  readonly dirs: Set<string>;
  readonly remote: GitRemote;
}

export interface Plan {
  readonly writes: readonly [string, Uint8Array][];
  readonly deletes: readonly string[];
  readonly texts: ReadonlyMap<string, string>;
}

export async function gitBlobSha(bytes: Uint8Array): Promise<string> {
  const head = new TextEncoder().encode("blob " + bytes.length + "\u0000");
  const all = new Uint8Array(head.length + bytes.length);
  all.set(head);
  all.set(bytes, head.length);
  const digest = await crypto.subtle.digest("SHA-1", all);
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function within(spec: { dir: string }, path: string): string | null {
  if (!spec.dir) return path;
  return path.startsWith(spec.dir + "/")
    ? path.slice(spec.dir.length + 1)
    : null;
}

function repoPath(remote: { dir: string }, path: string): string {
  return remote.dir ? remote.dir + "/" + path : path;
}

export function remoteFiles(
  spec: { dir: string },
  entries: readonly TreeEntry[],
): { files: Record<string, RemoteFile>; dirs: Set<string> } {
  const files = pathRecord<RemoteFile>();
  const dirs = new Set<string>();
  for (const entry of entries) {
    const rel = within(spec, entry.path);
    if (rel === null) continue;
    const path = cleanPath(rel);
    if (!path || skippedPath(path)) continue;
    if (entry.type === "tree") dirs.add(path);
    else if (entry.type === "blob")
      files[path] = { sha: entry.sha, mode: entry.mode };
  }
  for (const path of Object.keys(files))
    for (const dir of parentDirs(path)) dirs.add(dir);
  return { files, dirs };
}

export async function loadRepo(
  api: GitHost,
  spec: RepoSpec,
  watch: LoadWatch = {},
): Promise<LoadedRepo> {
  const branch = spec.branch ?? (await api.defaultBranch());
  const head = await api.head(branch);
  const { tree, entries } = await api.list(head, watch.signal);
  const { files, dirs } = remoteFiles(spec, entries);
  const paths = Object.keys(files);
  if (!paths.length) throw new ProjectError("Сонгосон хавтаст файл олдсонгүй");
  const limit = budget();
  const sizes = new Map(entries.map((entry) => [entry.path, entry.size ?? 0]));
  for (const path of paths) limit.take(sizes.get(repoPath(spec, path)) ?? 0);
  let total = 0;
  const bytes = await inBatches(
    paths,
    async (path) => {
      const blob = await api.blob(files[path]!.sha);
      total += blob.length;
      if (total > MAX_BYTES) throw new ProjectError(PROJECT_TOO_LARGE);
      return blob;
    },
    watch,
  );
  return {
    name: baseName(spec.dir || spec.project),
    files: paths.map((path, index) => [path, bytes[index]!]),
    dirs,
    remote: {
      provider: spec.provider,
      host: spec.host,
      project: spec.project,
      branch,
      dir: spec.dir,
      head,
      tree,
      files,
    },
  };
}

export interface CopyChange {
  readonly remote: GitRemote;
  readonly pulled?: ReadonlyMap<string, Uint8Array | null>;
  readonly merged?: ReadonlyMap<string, string>;
  readonly seen?: ReadonlyMap<string, string | undefined>;
  readonly dirs?: ReadonlySet<string>;
  readonly committed?: Plan;
}

export interface WorkingCopy {
  readonly texts: ReadonlyMap<string, string>;
  readonly binaries: ReadonlyMap<string, Uint8Array>;
  saved(path: string): string | undefined;
  added(path: string): boolean;
  encode(path: string, text: string): Uint8Array;
  apply(change: CopyChange): void;
}

export async function planChanges(
  copy: WorkingCopy,
  remote: GitRemote,
): Promise<Plan> {
  const writes: [string, Uint8Array][] = [];
  const texts = new Map<string, string>();
  for (const [path, text] of copy.texts) {
    const unchanged =
      ownValue(remote.files, path) !== undefined &&
      !copy.added(path) &&
      copy.saved(path) === text;
    if (unchanged) continue;
    writes.push([path, copy.encode(path, text)]);
    texts.set(path, text);
  }
  for (const [path, bytes] of copy.binaries) {
    const known = ownValue(remote.files, path);
    if (!known || (await gitBlobSha(bytes)) !== known.sha)
      writes.push([path, bytes]);
  }
  const deletes = Object.keys(remote.files).filter(
    (path) => !copy.texts.has(path) && !copy.binaries.has(path),
  );
  return { writes, deletes, texts };
}

function localBytes(copy: WorkingCopy, path: string): Uint8Array | null {
  const text = copy.texts.get(path);
  if (text !== undefined) return copy.encode(path, text);
  return copy.binaries.get(path) ?? null;
}

async function clashes(
  copy: WorkingCopy,
  changed: readonly string[],
  touched: ReadonlySet<string>,
  files: Readonly<Record<string, RemoteFile>>,
): Promise<Set<string>> {
  const edited = (path: string): boolean =>
    copy.added(path) ||
    (copy.texts.has(path) && copy.texts.get(path) !== copy.saved(path));
  const clash = new Set<string>();
  for (const path of changed) {
    if (!touched.has(path) && !edited(path)) continue;
    const local = localBytes(copy, path);
    const sha = ownValue(files, path)?.sha;
    const same = sha
      ? local !== null && (await gitBlobSha(local)) === sha
      : local === null;
    if (!same) clash.add(path);
  }
  return clash;
}

function mergeItems(
  copy: WorkingCopy,
  clash: ReadonlySet<string>,
  theirs: ReadonlyMap<string, Uint8Array | null>,
  remote: GitRemote,
): { items: MergeItem[]; merges: Map<string, Chunk[]> } {
  const merges = new Map<string, Chunk[]>();
  const items: MergeItem[] = [];
  for (const path of clash) {
    const bytes = theirs.get(path) ?? null;
    const ours = copy.texts.get(path);
    const base = copy.saved(path);
    if (
      bytes &&
      isEditablePath(path) &&
      ours !== undefined &&
      base !== undefined &&
      ownValue(remote.files, path) !== undefined
    ) {
      const chunks = merge3(base, ours, readText(bytes).text);
      merges.set(path, chunks);
      const conflicts = conflictsOf(chunks);
      if (conflicts.length) items.push({ path, kind: "text", conflicts });
      continue;
    }
    items.push({
      path,
      kind: "file",
      ours:
        copy.texts.has(path) || copy.binaries.has(path) ? "changed" : "deleted",
      theirs: bytes ? "changed" : "deleted",
    });
  }
  return { items, merges };
}

async function ask(
  items: readonly MergeItem[],
  resolve?: Resolver,
): Promise<MergeAnswer> {
  if (!items.length) return new Map();
  if (!resolve)
    throw new ProjectError(
      "Commit хийсэнгүй: repo дээр эдгээр файлыг өөр газраас өөрчилсөн байна — " +
        items.map((item) => item.path).join(", "),
    );
  const picked = await resolve(items);
  if (!picked) throw new Cancelled("Commit хийхийг цуцаллаа");
  return picked;
}

async function pullChanges(
  api: GitHost,
  copy: WorkingCopy,
  remote: GitRemote,
  plan: Plan,
  head: string,
  resolve?: Resolver,
): Promise<CopyChange> {
  const listing = await api.list(head);
  const { files, dirs } = remoteFiles(remote, listing.entries);
  const changed = [
    ...new Set([...Object.keys(files), ...Object.keys(remote.files)]),
  ].filter(
    (path) => ownValue(files, path)?.sha !== ownValue(remote.files, path)?.sha,
  );
  const touched = new Set([
    ...plan.writes.map(([path]) => path),
    ...plan.deletes,
  ]);
  const fetched = await inBatches(changed, (path) => {
    const file = ownValue(files, path);
    return file ? api.blob(file.sha) : Promise.resolve(null);
  });
  const theirs = new Map(changed.map((path, index) => [path, fetched[index]!]));
  const clash = await clashes(copy, changed, touched, files);
  const seen = new Map(changed.map((path) => [path, copy.texts.get(path)]));
  const { items, merges } = mergeItems(copy, clash, theirs, remote);
  const answer = await ask(items, resolve);
  const pulled = new Map<string, Uint8Array | null>();
  const merged = new Map<string, string>();
  for (const path of changed) {
    const bytes = theirs.get(path) ?? null;
    const chunks = merges.get(path);
    const choice = answer.get(path);
    if (!clash.has(path) || chunks || choice === "theirs")
      pulled.set(path, bytes);
    if (chunks)
      merged.set(
        path,
        resolveChunks(chunks, Array.isArray(choice) ? choice : []),
      );
  }
  return {
    remote: { ...remote, head, tree: listing.tree, files },
    pulled,
    merged,
    seen,
    dirs,
  };
}

export interface CommitOutcome {
  readonly remote: GitRemote;
  readonly pulled: boolean;
  readonly committed: boolean;
}

export async function commitChanges(
  api: GitHost,
  copy: WorkingCopy,
  remote: GitRemote,
  message: string,
  resolve?: Resolver,
): Promise<CommitOutcome | null> {
  let plan = await planChanges(copy, remote);
  if (!plan.writes.length && !plan.deletes.length) return null;
  const head = await api.head(remote.branch);
  let base = remote;
  const pulled = head !== remote.head;
  if (pulled) {
    const change = await pullChanges(api, copy, remote, plan, head, resolve);
    copy.apply(change);
    base = change.remote;
    plan = await planChanges(copy, base);
    if (!plan.writes.length && !plan.deletes.length)
      return { remote: base, pulled, committed: false };
  }
  const shas = await inBatches(plan.writes, ([, bytes]) => gitBlobSha(bytes));
  const done = await api.commit({
    branch: base.branch,
    head: base.head,
    tree: base.tree,
    message,
    writes: plan.writes.map(([path, bytes]) => ({
      path: repoPath(base, path),
      mode: ownValue(base.files, path)?.mode ?? FILE_MODE,
      bytes,
      exists: ownValue(base.files, path) !== undefined,
    })),
    deletes: plan.deletes.map((path) => ({
      path: repoPath(base, path),
      mode: base.files[path]!.mode,
    })),
  });
  const files = pathRecord(base.files);
  plan.writes.forEach(([path], index) => {
    files[path] = {
      sha: shas[index]!,
      mode: ownValue(base.files, path)?.mode ?? FILE_MODE,
    };
  });
  for (const path of plan.deletes) delete files[path];
  const next = { ...base, head: done.head, tree: done.tree, files };
  copy.apply({ remote: next, committed: plan });
  return { remote: next, pulled, committed: true };
}
