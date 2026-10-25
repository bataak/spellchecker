import { ProjectError, REPO_TOO_LARGE } from "../projecterror.ts";
import {
  RACE,
  fromBase64,
  inBatches,
  request,
  toBase64,
  type Fetch,
  type GitHost,
  type TreeEntry,
} from "./githost.ts";

export interface TreeChange {
  readonly path: string;
  readonly mode: string;
  readonly sha: string | null;
}

export interface GitApi {
  defaultBranch(): Promise<string>;
  head(branch: string): Promise<string>;
  commitTree(commit: string): Promise<string>;
  tree(sha: string): Promise<readonly TreeEntry[]>;
  blob(sha: string): Promise<Uint8Array>;
  createBlob(bytes: Uint8Array): Promise<string>;
  createTree(base: string, changes: readonly TreeChange[]): Promise<string>;
  createCommit(message: string, tree: string, parent: string): Promise<string>;
  moveBranch(branch: string, commit: string): Promise<boolean>;
}

function refPath(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}

function requestInit(
  token: string,
  init: { method?: string; body?: unknown },
): RequestInit {
  return {
    method: init.method ?? "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: "Bearer " + token,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  };
}

export function createGitApi(
  token: string,
  project: string,
  fetcher: Fetch = (url, init) => fetch(url, init),
): GitApi {
  const base =
    "https://api.github.com/repos/" +
    project.split("/").map(encodeURIComponent).join("/");

  const call = async <T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
    allow: readonly number[] = [],
  ): Promise<{ status: number; data: T | null }> => {
    const response = await request(
      "github",
      fetcher,
      base + path,
      requestInit(token, init),
      allow,
    );
    if (allow.includes(response.status))
      return { status: response.status, data: null };
    return { status: response.status, data: (await response.json()) as T };
  };

  const get = async <T>(path: string): Promise<T> =>
    (await call<T>(path)).data!;
  const post = async <T>(path: string, body: unknown): Promise<T> =>
    (await call<T>(path, { method: "POST", body })).data!;

  return {
    async defaultBranch() {
      return (await get<{ default_branch: string }>("")).default_branch;
    },
    async head(branch) {
      return (
        await get<{ object: { sha: string } }>(
          "/git/ref/heads/" + refPath(branch),
        )
      ).object.sha;
    },
    async commitTree(commit) {
      return (await get<{ tree: { sha: string } }>("/git/commits/" + commit))
        .tree.sha;
    },
    async tree(sha) {
      const data = await get<{ tree: TreeEntry[]; truncated: boolean }>(
        "/git/trees/" + sha + "?recursive=1",
      );
      if (data.truncated) throw new ProjectError(REPO_TOO_LARGE);
      return data.tree;
    },
    async blob(sha) {
      const data = await get<{ content: string; encoding: string }>(
        "/git/blobs/" + sha,
      );
      if (data.encoding !== "base64")
        return new TextEncoder().encode(data.content);
      return fromBase64(data.content);
    },
    async createBlob(bytes) {
      return (
        await post<{ sha: string }>("/git/blobs", {
          content: toBase64(bytes),
          encoding: "base64",
        })
      ).sha;
    },
    async createTree(baseTree, changes) {
      return (
        await post<{ sha: string }>("/git/trees", {
          base_tree: baseTree,
          tree: changes.map((change) => ({
            path: change.path,
            mode: change.mode,
            type: "blob",
            sha: change.sha,
          })),
        })
      ).sha;
    },
    async createCommit(message, tree, parent) {
      return (
        await post<{ sha: string }>("/git/commits", {
          message,
          tree,
          parents: [parent],
        })
      ).sha;
    },
    async moveBranch(branch, commit) {
      const { status } = await call(
        "/git/refs/heads/" + refPath(branch),
        { method: "PATCH", body: { sha: commit, force: false } },
        [409, 422],
      );
      return status !== 409 && status !== 422;
    },
  };
}

export function githubHost(api: GitApi): GitHost {
  return {
    defaultBranch: () => api.defaultBranch(),
    head: (branch) => api.head(branch),
    async list(commit) {
      const tree = await api.commitTree(commit);
      return { tree, entries: await api.tree(tree) };
    },
    blob: (sha) => api.blob(sha),
    async commit(input) {
      const shas = await inBatches(input.writes, (write) =>
        api.createBlob(write.bytes),
      );
      const tree = await api.createTree(input.tree, [
        ...input.writes.map((write, index) => ({
          path: write.path,
          mode: write.mode,
          sha: shas[index]!,
        })),
        ...input.deletes.map((del) => ({
          path: del.path,
          mode: del.mode,
          sha: null,
        })),
      ]);
      const head = await api.createCommit(input.message, tree, input.head);
      if (!(await api.moveBranch(input.branch, head)))
        throw new ProjectError(RACE);
      return { head, tree };
    },
  };
}
