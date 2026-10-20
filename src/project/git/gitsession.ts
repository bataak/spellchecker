import { KEYS, readJson, writeJson } from "../../core/store.ts";
import { AuthError, ProjectError } from "../projecterror.ts";
import type { State } from "../projectstate.ts";
import {
  accessOf,
  refreshed,
  type OAuthToken,
  type StoredToken,
} from "./gitauth.ts";
import { createGitApi, githubHost } from "./github.ts";
import { createGitlabHost } from "./gitlab.ts";
import {
  DEFAULT_HOST,
  type GitHost,
  type LoadWatch,
  type Provider,
  type RepoSpec,
} from "./githost.ts";
import {
  commitChanges,
  loadRepo,
  type LoadedRepo,
  type Resolver,
} from "./gitsync.ts";

export interface RepoFields {
  readonly provider: Provider;
  readonly repo: string;
  readonly branch: string;
  readonly dir: string;
}

type Where = Pick<RepoSpec, "provider" | "host">;

const tokenKey = (where: Where): string => where.provider + " " + where.host;

function tokens(): Record<string, StoredToken> {
  const saved = readJson(KEYS.gitTokens);
  return saved && typeof saved === "object"
    ? (saved as Record<string, StoredToken>)
    : {};
}

function stored(where: Where): StoredToken | null {
  const token = tokens()[tokenKey(where)];
  if (typeof token === "string") return token;
  return token && typeof token.access === "string" ? token : null;
}

export function savedToken(where: Where): StoredToken | null {
  return stored(where);
}

function rememberToken(where: Where, token: StoredToken): void {
  writeJson(KEYS.gitTokens, { ...tokens(), [tokenKey(where)]: token });
}

function forgetToken(where: Where): void {
  const { [tokenKey(where)]: _, ...rest } = tokens();
  writeJson(KEYS.gitTokens, rest);
}

async function withToken<T>(
  where: Where,
  used: StoredToken | null,
  task: () => Promise<T>,
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    const saved = stored(where);
    if (
      error instanceof AuthError &&
      saved &&
      (!used || accessOf(saved) === accessOf(used))
    )
      forgetToken(where);
    throw error;
  }
}

async function freshToken(where: Where): Promise<string> {
  const token = stored(where);
  if (!token)
    throw new ProjectError("Нэвтрэлт олдсонгүй — repo-г дахин нээнэ үү");
  if (typeof token === "string") return token;
  const next: OAuthToken =
    where.provider === "gitlab" ? await refreshed(where.host, token) : token;
  if (next !== token) rememberToken(where, next);
  return next.access;
}

const text = (value: unknown): string =>
  typeof value === "string" ? value : "";

export function lastRepo(): RepoFields {
  const saved = readJson(KEYS.gitRepo) as Partial<RepoFields> | null;
  return {
    provider: saved?.provider === "gitlab" ? "gitlab" : "github",
    repo: text(saved?.repo),
    branch: text(saved?.branch),
    dir: text(saved?.dir),
  };
}

export function hostFor(
  spec: Pick<RepoSpec, "provider" | "host" | "project">,
  token: string,
): GitHost {
  if (spec.host !== DEFAULT_HOST[spec.provider])
    throw new ProjectError(
      "Энэ төсөл " +
        spec.host +
        " сервертэй холбоотой — одоо зөвхөн github.com, gitlab.com дэмжинэ. Repo-г дахин нээнэ үү",
    );
  return spec.provider === "gitlab"
    ? createGitlabHost(token, spec.host, spec.project)
    : githubHost(createGitApi(token, spec.project));
}

export async function openRepo(
  spec: RepoSpec,
  token: StoredToken,
  watch: LoadWatch = {},
): Promise<LoadedRepo> {
  const { fresh, loaded } = await withToken(spec, token, async () => {
    const fresh =
      typeof token !== "string" && spec.provider === "gitlab"
        ? await refreshed(spec.host, token)
        : token;
    const loaded = await loadRepo(hostFor(spec, accessOf(fresh)), spec, watch);
    return { fresh, loaded };
  });
  rememberToken(spec, fresh);
  writeJson(KEYS.gitRepo, {
    provider: spec.provider,
    repo: spec.project,
    branch: spec.branch ?? "",
    dir: spec.dir,
  });
  return loaded;
}

export async function commitState(
  s: State,
  message: string,
  resolve?: Resolver,
): Promise<boolean> {
  const remote = s.remote;
  if (!remote) throw new ProjectError("Repo-ийн мэдээлэл олдсонгүй");
  const outcome = await withToken(remote, null, async () =>
    commitChanges(
      hostFor(remote, await freshToken(remote)),
      s,
      remote,
      message,
      resolve,
    ),
  );
  if (!outcome) return false;
  s.remote = outcome.remote;
  if (!outcome.committed) return false;
  return true;
}
