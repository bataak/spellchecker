import { AuthError, ProjectError } from "../projecterror.ts";
import type { Fetch, Provider } from "./githost.ts";

export interface OAuthToken {
  readonly access: string;
  readonly refresh?: string;
  readonly expires?: number;
  readonly verifier?: string;
}

export type StoredToken = string | OAuthToken;

export interface AuthConfig {
  readonly proxy: string;
  readonly githubClient: string;
  readonly gitlabClient: string;
  readonly redirect: string;
}

export function authConfig(): AuthConfig {
  const env = import.meta.env;
  return {
    proxy: (env.VITE_GIT_AUTH_URL ?? "").replace(/\/+$/, ""),
    githubClient: env.VITE_GITHUB_CLIENT_ID ?? "",
    gitlabClient: env.VITE_GITLAB_CLIENT_ID ?? "",
    redirect:
      typeof location === "undefined"
        ? ""
        : location.origin + env.BASE_URL + "oauth.html",
  };
}

export function canSignIn(
  provider: Provider,
  config: AuthConfig = authConfig(),
): boolean {
  return provider === "github"
    ? !!config.proxy && !!config.githubClient
    : !!config.gitlabClient;
}

export const accessOf = (token: StoredToken): string =>
  typeof token === "string" ? token : token.access;

const base64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

export function randomVerifier(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(48)));
}

export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64url(new Uint8Array(digest));
}

interface DeviceCode {
  readonly device_code: string;
  readonly user_code: string;
  readonly verification_uri: string;
  readonly interval?: number;
  readonly expires_in?: number;
}

interface DeviceReply {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
  readonly error?: string;
  readonly interval?: number;
}

const aborted = (): DOMException => new DOMException("aborted", "AbortError");

const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(aborted());
      return;
    }
    const stop = (): void => {
      clearTimeout(timer);
      reject(aborted());
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", stop);
      resolve();
    }, ms);
    signal?.addEventListener("abort", stop, { once: true });
  });

async function postJson<T>(
  fetcher: Fetch,
  url: string,
  body: Record<string, string>,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetcher(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch {
    signal?.throwIfAborted();
    throw new ProjectError("Нэвтрэх үйлчилгээтэй холбогдож чадсангүй");
  }
  signal?.throwIfAborted();
  if (!response.ok)
    throw new ProjectError(
      "Нэвтрэх үйлчилгээ алдаа өглөө (" + response.status + ")",
    );
  return (await response.json()) as T;
}

export async function githubDevice(
  onCode: (code: string, url: string) => void,
  signal?: AbortSignal,
  config: AuthConfig = authConfig(),
  fetcher: Fetch = (url, init) => fetch(url, init),
  now: () => number = Date.now,
): Promise<OAuthToken> {
  const start = await postJson<DeviceCode>(
    fetcher,
    config.proxy + "/github/device/code",
    { client_id: config.githubClient, scope: "repo" },
    signal,
  );
  onCode(start.user_code, start.verification_uri);
  let wait = (start.interval ?? 5) * 1000;
  const until = now() + (start.expires_in ?? 900) * 1000;
  while (now() < until) {
    await sleep(wait, signal);
    const reply = await postJson<DeviceReply>(
      fetcher,
      config.proxy + "/github/device/token",
      {
        client_id: config.githubClient,
        device_code: start.device_code,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      },
      signal,
    );
    if (reply.access_token)
      return {
        access: reply.access_token,
        ...(reply.refresh_token ? { refresh: reply.refresh_token } : {}),
        ...(reply.expires_in
          ? { expires: now() + reply.expires_in * 1000 }
          : {}),
      };
    if (reply.error === "slow_down")
      wait = (reply.interval ?? wait / 1000 + 5) * 1000;
    else if (reply.error === "access_denied")
      throw new ProjectError("GitHub-ээр нэвтрэхийг цуцаллаа");
    else if (reply.error && reply.error !== "authorization_pending")
      throw new ProjectError(
        "GitHub-ээр нэвтэрч чадсангүй (" + reply.error + ")",
      );
  }
  throw new ProjectError("Нэвтрэх кодын хугацаа дууслаа — дахин оролдоно уу");
}

interface TokenReply {
  readonly access_token?: string;
  readonly refresh_token?: string;
  readonly expires_in?: number;
}

async function gitlabToken(
  host: string,
  body: Record<string, string>,
  verifier: string,
  fetcher: Fetch,
  now: () => number,
): Promise<OAuthToken> {
  let response: Response;
  try {
    response = await fetcher(host + "/oauth/token", {
      method: "POST",
      body: new URLSearchParams(body),
    });
  } catch {
    throw new ProjectError("GitLab-тай холбогдож чадсангүй");
  }
  const reply = (await response.json().catch(() => ({}))) as TokenReply;
  if (response.status === 400 || response.status === 401)
    throw new AuthError("GitLab-аар нэвтэрч чадсангүй — дахин нэвтэрнэ үү");
  if (!response.ok || !reply.access_token)
    throw new ProjectError(
      "GitLab-ийн нэвтрэх үйлчилгээ алдаа өглөө (" +
        response.status +
        ") — дахин оролдоно уу",
    );
  return {
    access: reply.access_token,
    verifier,
    ...(reply.refresh_token ? { refresh: reply.refresh_token } : {}),
    ...(reply.expires_in ? { expires: now() + reply.expires_in * 1000 } : {}),
  };
}

export interface OAuthMessage {
  readonly type: "git-oauth";
  readonly code?: string | null;
  readonly state?: string | null;
  readonly error?: string | null;
}

export interface LoginWatch {
  readonly signal?: AbortSignal;
  readonly returned?: () => void;
}

export function gitlabLogin(
  host: string,
  watch: LoginWatch = {},
  config: AuthConfig = authConfig(),
  fetcher: Fetch = (url, init) => fetch(url, init),
  now: () => number = Date.now,
): Promise<OAuthToken> {
  const popup = window.open("", "git-oauth", "popup,width=640,height=760");
  if (!popup)
    return Promise.reject(
      new ProjectError("Нэвтрэх цонх нээгдсэнгүй — popup-ийг зөвшөөрнө үү"),
    );
  const verifier = randomVerifier();
  const state = randomVerifier();
  return new Promise<OAuthToken>((resolve, reject) => {
    const channel = new BroadcastChannel("git-oauth");
    const done = (): void => {
      watch.signal?.removeEventListener("abort", stop);
      window.removeEventListener("message", onWindow);
      channel.close();
      if (!popup.closed) popup.close();
    };
    const stop = (): void => {
      done();
      reject(new ProjectError("Нэвтрэхийг цуцаллаа"));
    };
    const take = (data: unknown): void => {
      const message = data as OAuthMessage | null;
      if (message?.type !== "git-oauth" || message.state !== state) return;
      done();
      if (!message.code) {
        reject(new ProjectError("GitLab-аар нэвтрэхийг цуцаллаа"));
        return;
      }
      watch.returned?.();
      gitlabToken(
        host,
        {
          client_id: config.gitlabClient,
          code: message.code,
          grant_type: "authorization_code",
          redirect_uri: config.redirect,
          code_verifier: verifier,
        },
        verifier,
        fetcher,
        now,
      ).then(resolve, reject);
    };
    const onWindow = (event: MessageEvent): void => {
      if (event.origin === location.origin) take(event.data);
    };
    window.addEventListener("message", onWindow);
    channel.onmessage = (event) => take(event.data);
    if (watch.signal?.aborted) return stop();
    watch.signal?.addEventListener("abort", stop);
    void challengeOf(verifier).then((challenge) => {
      const query = new URLSearchParams({
        client_id: config.gitlabClient,
        redirect_uri: config.redirect,
        response_type: "code",
        scope: "api",
        state,
        code_challenge: challenge,
        code_challenge_method: "S256",
      });
      popup.location.href = host + "/oauth/authorize?" + query.toString();
    });
  });
}

export async function refreshed(
  host: string,
  token: OAuthToken,
  config: AuthConfig = authConfig(),
  fetcher: Fetch = (url, init) => fetch(url, init),
  now: () => number = Date.now,
): Promise<OAuthToken> {
  if (!token.expires || token.expires - 60000 > now()) return token;
  if (!token.refresh)
    throw new AuthError("Нэвтрэлтийн хугацаа дууссан — дахин нэвтэрнэ үү");
  return gitlabToken(
    host,
    {
      client_id: config.gitlabClient,
      refresh_token: token.refresh,
      grant_type: "refresh_token",
      redirect_uri: config.redirect,
      ...(token.verifier ? { code_verifier: token.verifier } : {}),
    },
    token.verifier ?? "",
    fetcher,
    now,
  );
}
