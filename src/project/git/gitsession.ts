import { KEYS, readJson, writeJson } from "../../core/store.ts";
import { ProjectError } from "../projecterror.ts";
import type { State } from "../projectstate.ts";
import { createGitApi, githubHost } from "./github.ts";
import { createGitlabHost } from "./gitlab.ts";
import type { GitHost, Provider, RepoSpec } from "./githost.ts";
import { commitChanges, loadRepo, type LoadedRepo } from "./gitsync.ts";

export interface RepoFields {
  readonly provider: Provider;
  readonly host: string;
  readonly repo: string;
  readonly branch: string;
  readonly dir: string;
}

type Where = Pick<RepoSpec, "provider" | "host">;

const tokenKey = (where: Where): string => where.provider + " " + where.host;

function tokens(): Record<string, string> {
  const saved = readJson(KEYS.gitTokens);
  return saved && typeof saved === "object"
    ? (saved as Record<string, string>)
    : {};
}

export function savedToken(where: Where): string | null {
  const token = tokens()[tokenKey(where)];
  return typeof token === "string" ? token : null;
}

function rememberToken(where: Where, token: string): void {
  writeJson(KEYS.gitTokens, { ...tokens(), [tokenKey(where)]: token });
}

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

export function lastRepo(): RepoFields {
  const saved = readJson(KEYS.gitRepo) as Partial<RepoFields> | null;
  return {
    provider: saved?.provider === "gitlab" ? "gitlab" : "github",
    host: text(saved?.host),
    repo: text(saved?.repo),
    branch: text(saved?.branch),
    dir: text(saved?.dir),
  };
}

export function hostFor(
  spec: Pick<RepoSpec, "provider" | "host" | "project">,
  token: string,
): GitHost {
  return spec.provider === "gitlab"
    ? createGitlabHost(token, spec.host, spec.project)
    : githubHost(createGitApi(token, spec.host, spec.project));
}

export async function openRepo(
  spec: RepoSpec,
  token: string,
  host = spec.host,
): Promise<LoadedRepo> {
  const loaded = await loadRepo(hostFor(spec, token), spec);
  rememberToken(spec, token);
  writeJson(KEYS.gitRepo, {
    provider: spec.provider,
    host,
    repo: spec.project,
    branch: spec.branch ?? "",
    dir: spec.dir,
  });
  return loaded;
}

export async function commitState(s: State, message: string): Promise<boolean> {
  const remote = s.remote;
  if (!remote) throw new ProjectError("Repo-ийн мэдээлэл олдсонгүй");
  const token = savedToken(remote);
  if (!token) throw new ProjectError("Token олдсонгүй — repo-г дахин нээнэ үү");
  const outcome = await commitChanges(
    hostFor(remote, token),
    s,
    remote,
    message,
  );
  if (!outcome) return false;
  s.remote = outcome.remote;
  return true;
}
