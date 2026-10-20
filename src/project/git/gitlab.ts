import { ProjectError } from "../projecterror.ts";
import {
  RACE,
  request,
  toBase64,
  type Fetch,
  type GitHost,
  type TreeEntry,
} from "./githost.ts";

const PAGE = 100;
const MAX_PAGES = 200;

interface GitlabEntry {
  readonly id: string;
  readonly path: string;
  readonly type: string;
  readonly mode: string;
}

export function createGitlabHost(
  token: string,
  host: string,
  project: string,
  fetcher: Fetch = (url, init) => fetch(url, init),
): GitHost {
  const base = host + "/api/v4/projects/" + encodeURIComponent(project);

  const call = (
    path: string,
    init: { method?: string; body?: unknown } = {},
  ): Promise<Response> =>
    request("gitlab", fetcher, base + path, {
      method: init.method ?? "GET",
      headers: {
        Authorization: "Bearer " + token,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      ...(init.body ? { body: JSON.stringify(init.body) } : {}),
    });

  const json = async <T>(path: string): Promise<T> =>
    (await (await call(path)).json()) as T;

  const head = async (branch: string): Promise<string> =>
    (
      await json<{ commit: { id: string } }>(
        "/repository/branches/" + encodeURIComponent(branch),
      )
    ).commit.id;

  return {
    async defaultBranch() {
      return (await json<{ default_branch: string }>("")).default_branch;
    },
    head,
    async list(commit) {
      const entries: TreeEntry[] = [];
      let page: string | null = "1";
      for (let count = 0; page; count++) {
        if (count >= MAX_PAGES)
          throw new ProjectError("Repo хэт том тул бүрэн уншиж чадсангүй");
        const response = await call(
          "/repository/tree?recursive=true&per_page=" +
            PAGE +
            "&page=" +
            page +
            "&ref=" +
            encodeURIComponent(commit),
        );
        for (const entry of (await response.json()) as GitlabEntry[])
          entries.push({
            path: entry.path,
            mode: entry.mode,
            type: entry.type,
            sha: entry.id,
          });
        page = response.headers.get("x-next-page") || null;
      }
      return { tree: commit, entries };
    },
    async blob(sha) {
      const response = await call("/repository/blobs/" + sha + "/raw");
      return new Uint8Array(await response.arrayBuffer());
    },
    async commit(input) {
      if ((await head(input.branch)) !== input.head)
        throw new ProjectError(RACE);
      const response = await call("/repository/commits", {
        method: "POST",
        body: {
          branch: input.branch,
          commit_message: input.message,
          actions: [
            ...input.writes.map((write) => ({
              action: write.exists ? "update" : "create",
              file_path: write.path,
              content: toBase64(write.bytes),
              encoding: "base64",
            })),
            ...input.deletes.map((del) => ({
              action: "delete",
              file_path: del.path,
            })),
          ],
        },
      });
      const id = ((await response.json()) as { id: string }).id;
      return { head: id, tree: id };
    },
  };
}
