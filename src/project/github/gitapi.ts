import { ProjectError } from "../projecterror.ts";

const API = "https://api.github.com";

export interface RepoSpec {
  readonly owner: string;
  readonly repo: string;
  readonly branch: string | null;
  readonly dir: string;
}

export interface TreeEntry {
  readonly path: string;
  readonly mode: string;
  readonly type: string;
  readonly sha: string;
  readonly size?: number;
}

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

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export function parseRepo(input: string, branch = "", dir = ""): RepoSpec {
  const text = input.trim().replace(/\.git$/, "");
  const url =
    /^(?:https?:\/\/)?(?:www\.)?github\.com\/([^/\s]+)\/([^/\s]+)(?:\/tree\/([^/\s]+)(?:\/(.+))?)?\/?$/.exec(
      text,
    );
  const short = /^([\w.-]+)\/([\w.-]+)$/.exec(text);
  const match = url ?? short;
  if (!match) throw new ProjectError("Repo-г «эзэн/нэр» хэлбэрээр бичнэ үү");
  const pickedBranch = branch.trim() || (url?.[3] ?? "");
  const pickedDir = (dir.trim() || (url?.[4] ?? "")).replace(/^\/+|\/+$/g, "");
  return {
    owner: match[1]!,
    repo: match[2]!,
    branch: pickedBranch || null,
    dir: pickedDir,
  };
}

export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step)
    binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

export function fromBase64(text: string): Uint8Array {
  const binary = atob(text.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function refPath(branch: string): string {
  return branch.split("/").map(encodeURIComponent).join("/");
}

function failure(status: number): ProjectError {
  if (status === 401)
    return new ProjectError(
      "GitHub token буруу эсвэл хугацаа нь дууссан байна",
    );
  if (status === 403)
    return new ProjectError(
      "GitHub хандалтыг хориглолоо: token-д Contents эрх өгсөн эсэхийг шалгана уу",
    );
  if (status === 404)
    return new ProjectError("Repo, салбар эсвэл хавтас олдсонгүй");
  return new ProjectError("GitHub-тай холбогдож чадсангүй (" + status + ")");
}

export function createGitApi(
  token: string,
  spec: Pick<RepoSpec, "owner" | "repo">,
  fetcher: Fetch = (url, init) => fetch(url, init),
): GitApi {
  const base =
    API +
    "/repos/" +
    encodeURIComponent(spec.owner) +
    "/" +
    encodeURIComponent(spec.repo);

  const call = async <T>(
    path: string,
    init: { method?: string; body?: unknown } = {},
    allow: readonly number[] = [],
  ): Promise<{ status: number; data: T | null }> => {
    let response: Response;
    try {
      response = await fetcher(base + path, {
        method: init.method ?? "GET",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + token,
          "X-GitHub-Api-Version": "2022-11-28",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
        },
        ...(init.body ? { body: JSON.stringify(init.body) } : {}),
      });
    } catch {
      throw new ProjectError("GitHub-тай холбогдож чадсангүй");
    }
    if (allow.includes(response.status))
      return { status: response.status, data: null };
    if (!response.ok) throw failure(response.status);
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
      if (data.truncated)
        throw new ProjectError("Repo хэт том тул бүрэн уншиж чадсангүй");
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
