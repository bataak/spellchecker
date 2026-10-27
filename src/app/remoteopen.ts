import { askChoice } from "../ui/ask.ts";
import {
  fetchRemote,
  parseRemote,
  type RemoteFailure,
  type RemoteParse,
  type RemoteResult,
  type RemoteSource,
} from "../files/remotefile.ts";
import { hasToken, providerToken } from "../project/git/gitsession.ts";
import { PROVIDER_NAME } from "../project/git/githost.ts";

export interface RemoteOpenDeps {
  readonly openText: (name: string, text: string) => Promise<void>;
  readonly notify: (message: string) => void;
  readonly confirm?: (
    title: string,
    text?: string,
  ) => boolean | Promise<boolean>;
  readonly fetcher?: Parameters<typeof fetchRemote>[2];
}

type ParseFailure = Extract<RemoteParse, { ok: false }>["reason"];

const REPO_HINT = " Бүтэн repo нээх бол «Git repo нээх»-ийг ашиглана уу.";

const PARSE_ERRORS: Readonly<Record<ParseFailure, string>> = {
  invalid: "Холбоос буруу байна",
  host: "Зөвхөн GitHub, GitLab-ын https холбоосоос файл нээнэ",
  folder: "Энэ нь хавтас байна. Файлын холбоос оруулна уу." + REPO_HINT,
  type: "Зөвхөн .txt, .md, .markdown, .tex, .ltx файл нээнэ",
};

const FETCH_ERRORS: Readonly<Record<RemoteFailure, string>> = {
  missing: "Файл олдсонгүй",
  size: "Файл 2 MB-аас том байна",
  binary: "Файл UTF-8 бичвэр биш байна",
  redirect: "Өөр хост уруу чиглүүлсэн тул нээсэнгүй",
  timeout: "Хариу 15 секундэд ирсэнгүй",
  network: "Файлыг татаж чадсангүй",
};

async function fetchFirst(
  urls: readonly string[],
  token: string | null,
  d: RemoteOpenDeps,
): Promise<RemoteResult> {
  let result: RemoteResult = { ok: false, reason: "missing" };
  for (const url of urls) {
    result = await fetchRemote(url, token, d.fetcher);
    if (result.ok || result.reason !== "missing") return result;
  }
  return result;
}

async function publicFetch(
  source: RemoteSource,
  d: RemoteOpenDeps,
): Promise<RemoteResult> {
  if (!source.open) return fetchFirst(source.apis, null, d);
  const result = await fetchRemote(source.open, null, d.fetcher);
  if (result.ok || result.reason !== "network" || !source.apis.length)
    return result;
  return fetchFirst(source.apis, null, d);
}

async function privateFetch(
  source: RemoteSource,
  d: RemoteOpenDeps,
  ask: Ask,
): Promise<RemoteResult | string | null> {
  const { provider, apis } = source;
  if (!provider || !apis[0]) return null;
  const name = PROVIDER_NAME[provider];
  if (!hasToken(provider))
    return (
      "Файл олдсонгүй. Нууц repo бол «Git repo нээх»-ээр " +
      name +
      "-д нэвтэрсний дараа холбоосыг дахин нээнэ үү"
    );
  const host = new URL(apis[0]).host;
  if (
    !(await ask(
      "Файл олдсонгүй эсвэл нууц repo-д байна. " +
        name +
        "-д нэвтэрсэн эрхээрээ " +
        host +
        "-оос татах уу?",
    ))
  )
    return "";
  let token: string;
  try {
    token = await providerToken(provider);
  } catch {
    return name + "-д дахин нэвтэрнэ үү";
  }
  return fetchFirst(apis, token, d);
}

type Ask = (title: string, text?: string) => boolean | Promise<boolean>;

export async function openRemote(
  input: string,
  d: RemoteOpenDeps,
): Promise<boolean> {
  const ask: Ask =
    d.confirm ??
    ((title, text) =>
      askChoice({ title, ...(text && { text }), yes: "Тэгье", no: "Үгүй" }));
  const parsed = parseRemote(input);
  if (!parsed.ok) {
    d.notify(PARSE_ERRORS[parsed.reason]);
    return false;
  }
  const { source } = parsed;
  const question = "Дараах файлыг шинэ талбарт энгийн бичвэр байдлаар нээх үү?";
  if (!(await ask(question, source.shown))) return false;
  let result: RemoteResult | string | null = await publicFetch(source, d);
  if (!result.ok && result.reason === "missing")
    result = (await privateFetch(source, d, ask)) ?? result;
  if (typeof result === "string") {
    if (result) d.notify(result);
    return false;
  }
  if (!result.ok) {
    d.notify(FETCH_ERRORS[result.reason]);
    return false;
  }
  await d.openText(source.name, result.text);
  return true;
}
