import {
  KEYS,
  read,
  readJson,
  remove,
  write,
  writeJson,
} from "../../core/store.ts";
import { ProjectError } from "../projecterror.ts";
import type { State } from "../projectstate.ts";
import { createGitApi, type GitApi, type RepoSpec } from "./gitapi.ts";
import { commitChanges, loadRepo, type LoadedRepo } from "./gitsync.ts";

export function githubToken(): string | null {
  return read(KEYS.githubToken);
}

export function forgetGithubToken(): void {
  remove(KEYS.githubToken);
}

export interface RepoFields {
  readonly repo: string;
  readonly branch: string;
  readonly dir: string;
}

export function lastRepo(): RepoFields {
  const saved = readJson(KEYS.githubRepo) as Partial<RepoFields> | null;
  return {
    repo: typeof saved?.repo === "string" ? saved.repo : "",
    branch: typeof saved?.branch === "string" ? saved.branch : "",
    dir: typeof saved?.dir === "string" ? saved.dir : "",
  };
}

function apiFor(
  remote: Pick<RepoSpec, "owner" | "repo">,
  token = githubToken(),
): GitApi {
  if (!token) throw new ProjectError("GitHub token оруулна уу");
  return createGitApi(token, remote);
}

export async function openRepo(
  spec: RepoSpec,
  token: string,
): Promise<LoadedRepo> {
  const loaded = await loadRepo(apiFor(spec, token), spec);
  write(KEYS.githubToken, token);
  writeJson(KEYS.githubRepo, {
    repo: spec.owner + "/" + spec.repo,
    branch: spec.branch ?? "",
    dir: spec.dir,
  });
  return loaded;
}

export async function commitState(s: State, message: string): Promise<boolean> {
  if (!s.remote) throw new ProjectError("GitHub-ийн мэдээлэл олдсонгүй");
  const outcome = await commitChanges(apiFor(s.remote), s, s.remote, message);
  if (!outcome) return false;
  s.remote = outcome.remote;
  return true;
}
