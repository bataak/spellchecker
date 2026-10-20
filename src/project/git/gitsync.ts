import {
  baseName,
  cleanPath,
  isEditablePath,
  parentDirs,
  skippedPath,
} from "../../tex/texproject.ts";
import { budget } from "../projectdisk.ts";
import { ProjectError } from "../projecterror.ts";
import { dropEntries } from "../projectedit.ts";
import {
  diskText,
  noteEol,
  readText,
  recountDirty,
  type State,
} from "../projectstate.ts";
import {
  inBatches,
  type GitHost,
  type LoadWatch,
  type Provider,
  type RepoSpec,
  type TreeEntry,
} from "./githost.ts";

const FILE_MODE = "100644";

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
  const files: Record<string, RemoteFile> = {};
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
  const bytes = await inBatches(
    paths,
    (path) => api.blob(files[path]!.sha),
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

export async function planChanges(s: State, remote: GitRemote): Promise<Plan> {
  const writes: [string, Uint8Array][] = [];
  const texts = new Map<string, string>();
  const encoder = new TextEncoder();
  for (const [path, text] of s.texts) {
    const unchanged =
      remote.files[path] !== undefined &&
      !s.added.has(path) &&
      s.saved.get(path) === text;
    if (unchanged) continue;
    writes.push([path, encoder.encode(diskText(s, path, text))]);
    texts.set(path, text);
  }
  for (const [path, bytes] of s.binaries) {
    const known = remote.files[path];
    if (!known || (await gitBlobSha(bytes)) !== known.sha)
      writes.push([path, bytes]);
  }
  const deletes = Object.keys(remote.files).filter(
    (path) => !s.texts.has(path) && !s.binaries.has(path),
  );
  return { writes, deletes, texts };
}

function applyRemoteFile(
  s: State,
  path: string,
  bytes: Uint8Array | null,
): void {
  if (bytes === null) {
    dropEntries(s, path);
    return;
  }
  if (isEditablePath(path)) {
    const { text, crlf } = readText(bytes);
    noteEol(s, path, crlf);
    s.texts.set(path, text);
    s.saved.set(path, text);
  } else s.binaries.set(path, bytes);
  for (const dir of parentDirs(path)) s.dirs.add(dir);
}

async function catchUp(
  api: GitHost,
  s: State,
  remote: GitRemote,
  plan: Plan,
  head: string,
): Promise<GitRemote> {
  const listing = await api.list(head);
  const tree = listing.tree;
  const { files, dirs } = remoteFiles(remote, listing.entries);
  const changed = [
    ...new Set([...Object.keys(files), ...Object.keys(remote.files)]),
  ].filter((path) => files[path]?.sha !== remote.files[path]?.sha);
  const touched = new Set([
    ...plan.writes.map(([path]) => path),
    ...plan.deletes,
  ]);
  const clash = changed.filter((path) => touched.has(path));
  if (clash.length)
    throw new ProjectError(
      "Commit хийсэнгүй: repo дээр эдгээр файлыг өөр газраас өөрчилсөн байна — " +
        clash.join(", "),
    );
  const fetched = await inBatches(changed, (path) =>
    files[path] ? api.blob(files[path].sha) : Promise.resolve(null),
  );
  changed.forEach((path, index) => applyRemoteFile(s, path, fetched[index]!));
  for (const dir of dirs) s.dirs.add(dir);
  return { ...remote, head, tree, files };
}

export interface CommitOutcome {
  readonly remote: GitRemote;
  readonly pulled: boolean;
}

export async function commitChanges(
  api: GitHost,
  s: State,
  remote: GitRemote,
  message: string,
): Promise<CommitOutcome | null> {
  let plan = await planChanges(s, remote);
  if (!plan.writes.length && !plan.deletes.length) return null;
  const head = await api.head(remote.branch);
  let base = remote;
  const pulled = head !== remote.head;
  if (pulled) {
    base = await catchUp(api, s, remote, plan, head);
    s.remote = base;
    plan = await planChanges(s, base);
  }
  const shas = await inBatches(plan.writes, ([, bytes]) => gitBlobSha(bytes));
  const done = await api.commit({
    branch: base.branch,
    head: base.head,
    tree: base.tree,
    message,
    writes: plan.writes.map(([path, bytes]) => ({
      path: repoPath(base, path),
      mode: base.files[path]?.mode ?? FILE_MODE,
      bytes,
      exists: base.files[path] !== undefined,
    })),
    deletes: plan.deletes.map((path) => ({
      path: repoPath(base, path),
      mode: base.files[path]!.mode,
    })),
  });
  const files: Record<string, RemoteFile> = { ...base.files };
  plan.writes.forEach(([path], index) => {
    files[path] = {
      sha: shas[index]!,
      mode: base.files[path]?.mode ?? FILE_MODE,
    };
  });
  for (const path of plan.deletes) delete files[path];
  for (const [path, text] of plan.texts) {
    s.saved.set(path, text);
    s.added.delete(path);
  }
  for (const [path] of plan.writes) s.fresh.delete(path);
  for (const path of plan.deletes) s.saved.delete(path);
  s.unsynced = false;
  recountDirty(s);
  return {
    remote: { ...base, head: done.head, tree: done.tree, files },
    pulled,
  };
}
