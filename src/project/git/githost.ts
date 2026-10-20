import { AuthError, ProjectError } from "../projecterror.ts";

export type Provider = "github" | "gitlab";

export const PROVIDER_NAME: Readonly<Record<Provider, string>> = {
  github: "GitHub",
  gitlab: "GitLab",
};

export const DEFAULT_HOST: Readonly<Record<Provider, string>> = {
  github: "https://github.com",
  gitlab: "https://gitlab.com",
};

export interface RepoSpec {
  readonly provider: Provider;
  readonly host: string;
  readonly project: string;
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

export interface Listing {
  readonly tree: string;
  readonly entries: readonly TreeEntry[];
}

export interface FileWrite {
  readonly path: string;
  readonly mode: string;
  readonly bytes: Uint8Array;
  readonly exists: boolean;
}

export interface FileDelete {
  readonly path: string;
  readonly mode: string;
}

export interface CommitInput {
  readonly branch: string;
  readonly head: string;
  readonly tree: string;
  readonly message: string;
  readonly writes: readonly FileWrite[];
  readonly deletes: readonly FileDelete[];
}

export interface GitHost {
  defaultBranch(): Promise<string>;
  head(branch: string): Promise<string>;
  list(commit: string, signal?: AbortSignal): Promise<Listing>;
  blob(sha: string): Promise<Uint8Array>;
  commit(input: CommitInput): Promise<{ head: string; tree: string }>;
}

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export const RACE = "Repo дээр яг одоо шинэ өөрчлөлт орлоо — дахин хадгална уу";

const PARALLEL = 6;

export interface LoadWatch {
  readonly signal?: AbortSignal;
  readonly progress?: (done: number, total: number) => void;
}

export async function inBatches<T, R>(
  items: readonly T[],
  run: (item: T) => Promise<R>,
  watch: LoadWatch = {},
): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      watch.signal?.throwIfAborted();
      const index = next++;
      out[index] = await run(items[index]!);
      watch.progress?.(++done, items.length);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(PARALLEL, items.length) }, worker),
  );
  return out;
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

export function hostFailure(provider: Provider, status: number): ProjectError {
  const name = PROVIDER_NAME[provider];
  if (status === 401)
    return new AuthError(
      name + " token буруу эсвэл хугацаа нь дууссан байна — дахин нэвтэрнэ үү",
    );
  if (status === 403)
    return new ProjectError(
      name +
        " хандалтыг хориглолоо: token-д repo-д бичих эрх өгсөн эсэхийг шалгана уу",
    );
  if (status === 404)
    return new ProjectError("Repo, салбар эсвэл хавтас олдсонгүй");
  return new ProjectError(name + "-тай холбогдож чадсангүй (" + status + ")");
}

export async function request(
  provider: Provider,
  fetcher: Fetch,
  url: string,
  init: RequestInit,
  allow: readonly number[] = [],
): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(url, init);
  } catch {
    throw new ProjectError(
      PROVIDER_NAME[provider] + "-тай холбогдож чадсангүй",
    );
  }
  if (!response.ok && !allow.includes(response.status))
    throw hostFailure(provider, response.status);
  return response;
}

export function cleanHost(host: string, provider: Provider): string {
  const text = host.trim().replace(/\/+$/, "");
  if (!text) return DEFAULT_HOST[provider];
  return /^https?:\/\//.test(text) ? text : "https://" + text;
}

function splitUrl(input: string): { origin: string | null; rest: string } {
  const text = input
    .trim()
    .replace(/\.git$/, "")
    .replace(/\/+$/, "");
  const url = /^(https?:\/\/[^/\s]+)\/(.+)$/.exec(text);
  if (url) return { origin: url[1]!, rest: url[2]! };
  const bare = /^((?:www\.)?(?:github|gitlab)\.com)\/(.+)$/.exec(text);
  if (bare)
    return {
      origin: "https://" + bare[1]!.replace(/^www\./, ""),
      rest: bare[2]!,
    };
  return { origin: null, rest: text };
}

const SEGMENT = /^[\w.-]+$/;

export function parseRepo(
  provider: Provider,
  input: string,
  options: { branch?: string; dir?: string } = {},
): RepoSpec {
  const { origin, rest } = splitUrl(input);
  const marker = provider === "gitlab" ? "/-/tree/" : "/tree/";
  const at = rest.indexOf(marker);
  const path = at === -1 ? rest : rest.slice(0, at);
  const tail = at === -1 ? [] : rest.slice(at + marker.length).split("/");
  const parts = path.split("/").filter(Boolean);
  const valid =
    parts.every((part) => SEGMENT.test(part)) &&
    (provider === "gitlab" ? parts.length >= 2 : parts.length === 2);
  if (!valid)
    throw new ProjectError(
      provider === "gitlab"
        ? "Төслийг «бүлэг/нэр» хэлбэрээр бичнэ үү"
        : "Repo-г «эзэн/нэр» хэлбэрээр бичнэ үү",
    );
  const branch = options.branch?.trim() || tail[0] || "";
  const dir = (options.dir?.trim() || tail.slice(1).join("/")).replace(
    /^\/+|\/+$/g,
    "",
  );
  return {
    provider,
    host: cleanHost(origin ?? "", provider),
    project: parts.join("/"),
    branch: branch || null,
    dir,
  };
}
