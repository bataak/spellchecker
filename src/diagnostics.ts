import { isMeasure, type Measure } from "./layout.ts";

export const DICT_IDS = ["mn_MN", "en_GB", "en_US"] as const;
export type DictId = (typeof DICT_IDS)[number];

export type Mode = "plain" | "markdown" | "office";

export const FILE_EXTS = [
  "docx",
  "pptx",
  "odt",
  "odp",
  "txt",
  "text",
  "md",
  "markdown",
  "mdown",
  "tex",
  "ltx",
  "pdf",
] as const;
export type FileExt = (typeof FILE_EXTS)[number] | "other" | "none";

export type Theme = "light" | "dark";

export interface Diagnostics {
  app: { version: string | null; build: string | null };
  sw: { cache: string | null; controlled: boolean };
  userAgent: string;
  languages: DictId[];
  mode: Mode;
  fileExt: FileExt;
  layout: { measure: Measure; panel: boolean; preview: boolean };
  textLength: number;
  errorCount: number;
  personalDictWords: number;
  stardict: { loaded: boolean; bundled: number; user: number };
  theme: Theme;
  standalone: boolean;
  online: boolean;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  touch: boolean;
}

export interface StardictState {
  name: string;
  words: number;
  user: boolean;
}

export interface DiagnosticsState {
  appVersion: string | null;
  entryUrl: string;
  swCachedEntry: string | null;
  swControlled: boolean;
  userAgent: string;
  activeDicts: readonly string[];
  officeActive: boolean;
  markdownActive: boolean;
  fileName: string | null;
  layout: { measure: string; panel: boolean; preview: boolean } | null;
  text: string;
  errorWords: readonly string[];
  personalDict: readonly string[];
  stardict: readonly StardictState[] | null;
  theme: string | null;
  standalone: boolean;
  online: boolean;
  viewport: { width: number; height: number };
  devicePixelRatio: number;
  touch: boolean;
}

const VERSION_RE = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;
const ENTRY_RE = /(?:^|\/)assets\/index-([A-Za-z0-9_-]{8})\.js(?:[?#]|$)/;
export const USER_AGENT_MAX = 300;

function count(value: unknown, max = 1e9): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(max, Math.max(0, Math.round(value)));
}

function ratio(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(16, Math.max(0, Math.round(value * 100) / 100));
}

function flag(value: unknown): boolean {
  return value === true;
}

export function entryHash(url: unknown): string | null {
  if (typeof url !== "string") return null;
  return ENTRY_RE.exec(url)?.[1] ?? null;
}

export function cleanUserAgent(ua: unknown): string {
  if (typeof ua !== "string") return "";
  return ua.replace(/[^\x20-\x7e]/g, "").slice(0, USER_AGENT_MAX);
}

function fileExtOf(name: string | null): FileExt {
  if (typeof name !== "string" || name === "") return "none";
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "other";
  const ext = name.slice(dot + 1).toLowerCase();
  return (FILE_EXTS as readonly string[]).includes(ext)
    ? (ext as FileExt)
    : "other";
}

function languagesOf(ids: readonly string[]): DictId[] {
  return DICT_IDS.filter((id) => ids.includes(id));
}

export function collectDiagnostics(state: DiagnosticsState): Diagnostics {
  const dicts = Array.isArray(state.stardict) ? state.stardict : [];
  const layout = state.layout;
  return {
    app: {
      version:
        typeof state.appVersion === "string" &&
        VERSION_RE.test(state.appVersion)
          ? state.appVersion
          : null,
      build: entryHash(state.entryUrl),
    },
    sw: {
      cache: entryHash(state.swCachedEntry),
      controlled: flag(state.swControlled),
    },
    userAgent: cleanUserAgent(state.userAgent),
    languages: languagesOf(state.activeDicts),
    mode: state.officeActive
      ? "office"
      : state.markdownActive
        ? "markdown"
        : "plain",
    fileExt: fileExtOf(state.fileName),
    layout: {
      measure: layout && isMeasure(layout.measure) ? layout.measure : "a",
      panel: flag(layout?.panel),
      preview: flag(layout?.preview),
    },
    textLength: count(state.text.length),
    errorCount: count(state.errorWords.length),
    personalDictWords: count(state.personalDict.length),
    stardict: {
      loaded: dicts.length > 0,
      bundled: dicts.filter((d) => d.user !== true).length,
      user: dicts.filter((d) => d.user === true).length,
    },
    theme: state.theme === "dark" ? "dark" : "light",
    standalone: flag(state.standalone),
    online: flag(state.online),
    viewport: {
      width: count(state.viewport.width, 100000),
      height: count(state.viewport.height, 100000),
    },
    devicePixelRatio: ratio(state.devicePixelRatio),
    touch: flag(state.touch),
  };
}
