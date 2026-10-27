import { cleanText, decodeStrict } from "./safetext.ts";

export type RemoteProvider = "github" | "gitlab";

export interface RemoteSource {
  readonly shown: string;
  readonly name: string;
  readonly provider: RemoteProvider | null;
  readonly open: string | null;
  readonly apis: readonly string[];
}

export type RemoteParse =
  | { readonly ok: true; readonly source: RemoteSource }
  | {
      readonly ok: false;
      readonly reason: "invalid" | "host" | "folder" | "type";
    };

export type RemoteFailure =
  "missing" | "size" | "binary" | "redirect" | "timeout" | "network";

export type RemoteResult =
  | { readonly ok: true; readonly text: string }
  | { readonly ok: false; readonly reason: RemoteFailure };

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

export const REMOTE_MAX_BYTES = 2 * 1024 * 1024;
export const REMOTE_TIMEOUT_MS = 15_000;
const MAX_URL = 2048;
const MAX_REF_PARTS = 3;
const TEXT_NAME = /\.(txt|md|markdown|tex|ltx)$/i;
const RAW_GITHUB = "raw.githubusercontent.com";
const GIST = "gist.githubusercontent.com";
const GITHUB = "github.com";
const GITLAB = "gitlab.com";
const API_GITHUB = "https://api.github.com";
const API_GITLAB = "https://gitlab.com/api/v4";
const HOSTS = new Set([RAW_GITHUB, GIST, GITHUB, GITLAB]);
const FAIL = (reason: "invalid" | "host" | "folder" | "type"): RemoteParse => ({
  ok: false,
  reason,
});

function segments(url: URL): string[] | null {
  try {
    const parts = url.pathname.split("/").slice(1).map(decodeURIComponent);
    if (parts.at(-1) === "") parts.pop();
    return parts.every((part) => part && part !== "." && part !== "..")
      ? parts
      : null;
  } catch {
    return null;
  }
}

const encodePath = (parts: readonly string[]): string =>
  parts.map(encodeURIComponent).join("/");

type Split = readonly [ref: string, path: readonly string[]];

function githubApi(owner: string, repo: string, [ref, path]: Split): string {
  return (
    API_GITHUB +
    "/repos/" +
    encodePath([owner, repo]) +
    "/contents/" +
    encodePath(path) +
    "?ref=" +
    encodeURIComponent(ref)
  );
}

function gitlabApi(project: readonly string[], [ref, path]: Split): string {
  return (
    API_GITLAB +
    "/projects/" +
    encodeURIComponent(project.join("/")) +
    "/repository/files/" +
    encodeURIComponent(path.join("/")) +
    "/raw?ref=" +
    encodeURIComponent(ref)
  );
}

function shownUrl(url: URL): string {
  try {
    return cleanText(decodeURI(url.href));
  } catch {
    return url.href;
  }
}

function source(
  url: URL,
  name: string,
  rest: Omit<RemoteSource, "shown" | "name">,
): RemoteParse {
  if (!TEXT_NAME.test(name)) return FAIL("type");
  return { ok: true, source: { shown: shownUrl(url), name, ...rest } };
}

function splits(parts: readonly string[]): Split[] {
  const tagged =
    parts[0] === "refs" && (parts[1] === "heads" || parts[1] === "tags");
  if (tagged)
    return parts.length > 3
      ? [[parts.slice(0, 3).join("/"), parts.slice(3)]]
      : [];
  const out: Split[] = [];
  for (let size = 1; size < parts.length && size <= MAX_REF_PARTS; size++)
    out.push([parts.slice(0, size).join("/"), parts.slice(size)]);
  return out;
}

function fromGithubParts(
  url: URL,
  owner: string | undefined,
  repo: string | undefined,
  tail: readonly string[],
): RemoteParse {
  const options = splits(tail);
  if (!owner || !repo || !options.length) return FAIL("invalid");
  return source(url, tail.at(-1)!, {
    provider: "github",
    open: "https://" + RAW_GITHUB + "/" + encodePath([owner, repo, ...tail]),
    apis: options.map((split) => githubApi(owner, repo, split)),
  });
}

function fromRawGithub(url: URL, parts: string[]): RemoteParse {
  const [owner, repo, ...tail] = parts;
  return fromGithubParts(url, owner, repo, tail);
}

function fromGist(url: URL, parts: string[]): RemoteParse {
  if (parts.length < 4 || parts[2] !== "raw") return FAIL("invalid");
  return source(url, parts.at(-1)!, {
    provider: null,
    open: url.origin + url.pathname,
    apis: [],
  });
}

function fromGithub(url: URL, parts: string[]): RemoteParse {
  const [owner, repo, kind, ...tail] = parts;
  if (!owner || !repo) return FAIL("invalid");
  if (kind === undefined || kind === "tree") return FAIL("folder");
  if (kind !== "blob" && kind !== "raw") return FAIL("invalid");
  return fromGithubParts(url, owner, repo, tail);
}

function fromGitlab(url: URL, parts: string[]): RemoteParse {
  const dash = parts.indexOf("-");
  if (dash < 0) return parts.length >= 2 ? FAIL("folder") : FAIL("invalid");
  const project = parts.slice(0, dash);
  const [kind, ...tail] = parts.slice(dash + 1);
  if (project.length < 2) return FAIL("invalid");
  if (kind === "tree") return FAIL("folder");
  const options = splits(tail);
  if ((kind !== "blob" && kind !== "raw") || !options.length)
    return FAIL("invalid");
  return source(url, tail.at(-1)!, {
    provider: "gitlab",
    open: null,
    apis: options.map((split) => gitlabApi(project, split)),
  });
}

export function parseRemote(input: string): RemoteParse {
  if (input.length > MAX_URL) return FAIL("invalid");
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    return FAIL("invalid");
  }
  if (url.protocol !== "https:") return FAIL("host");
  if (url.username || url.password || url.port) return FAIL("host");
  if (!HOSTS.has(url.hostname)) return FAIL("host");
  const parts = segments(url);
  if (!parts) return FAIL("invalid");
  if (url.hostname === RAW_GITHUB) return fromRawGithub(url, parts);
  if (url.hostname === GIST) return fromGist(url, parts);
  if (url.hostname === GITHUB) return fromGithub(url, parts);
  return fromGitlab(url, parts);
}

async function readCapped(response: Response): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length"));
  if (declared > REMOTE_MAX_BYTES) return null;
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array(0);
  const parts: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > REMOTE_MAX_BYTES) {
      void reader.cancel().catch(() => undefined);
      return null;
    }
    parts.push(value);
  }
  const out = new Uint8Array(size);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function headersFor(url: URL, token: string | null): HeadersInit {
  if (url.origin === API_GITHUB)
    return {
      Accept: "application/vnd.github.raw",
      ...(token ? { Authorization: "Bearer " + token } : {}),
    };
  if (url.href.startsWith(API_GITLAB + "/"))
    return token ? { Authorization: "Bearer " + token } : {};
  return {};
}

export async function fetchRemote(
  target: string,
  token: string | null,
  fetcher: Fetcher = (url, init) => fetch(url, init),
): Promise<RemoteResult> {
  const url = new URL(target);
  const signal = AbortSignal.timeout(REMOTE_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetcher(url.href, {
      headers: headersFor(url, token),
      credentials: "omit",
      redirect: "follow",
      referrerPolicy: "no-referrer",
      cache: "no-store",
      signal,
    });
  } catch {
    return { ok: false, reason: signal.aborted ? "timeout" : "network" };
  }
  if (response.url && new URL(response.url).host !== url.host)
    return { ok: false, reason: "redirect" };
  if (!response.ok) return { ok: false, reason: "missing" };
  let bytes: Uint8Array | null;
  try {
    bytes = await readCapped(response);
  } catch {
    return { ok: false, reason: signal.aborted ? "timeout" : "network" };
  }
  if (!bytes) return { ok: false, reason: "size" };
  const text = decodeStrict(bytes);
  return text === null ? { ok: false, reason: "binary" } : { ok: true, text };
}
