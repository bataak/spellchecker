import {
  buildIssueUrl,
  collectDiagnostics,
  type DiagnosticsState,
  type StardictState,
} from "./diagnostics.ts";
import { recentErrors } from "./errorlog.ts";
import { isTouch } from "./input.ts";

export type ReportInput = Pick<
  DiagnosticsState,
  | "entryUrl"
  | "activeDicts"
  | "officeActive"
  | "markdownActive"
  | "fileName"
  | "layout"
  | "text"
  | "errorWords"
  | "personalDict"
> & {
  listDicts(): Promise<readonly StardictState[]>;
};

const LOOKUP_TIMEOUT_MS = 1500;
const ENTRY_RE = /\/assets\/index-[A-Za-z0-9_-]+\.js(?:[?#]|$)/;

function withTimeout<T>(task: Promise<T>, fallback: T): Promise<T> {
  return Promise.race([
    task.catch(() => fallback),
    new Promise<T>((resolve) =>
      setTimeout(() => resolve(fallback), LOOKUP_TIMEOUT_MS),
    ),
  ]);
}

async function cachedEntry(): Promise<string | null> {
  if (!("caches" in window)) return null;
  for (const name of await caches.keys()) {
    if (!name.startsWith("workbox-precache")) continue;
    const cache = await caches.open(name);
    for (const req of await cache.keys()) {
      if (ENTRY_RE.test(req.url)) return new URL(req.url).pathname;
    }
  }
  return null;
}

function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (!window.matchMedia) return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches
  );
}

export async function reportUrl(input: ReportInput): Promise<string> {
  const [swCachedEntry, stardict] = await Promise.all([
    withTimeout(cachedEntry(), null),
    withTimeout<readonly StardictState[] | null>(input.listDicts(), null),
  ]);
  const diagnostics = collectDiagnostics({
    appVersion: typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : null,
    entryUrl: input.entryUrl,
    swCachedEntry,
    swControlled: !!navigator.serviceWorker?.controller,
    userAgent: navigator.userAgent,
    activeDicts: input.activeDicts,
    officeActive: input.officeActive,
    markdownActive: input.markdownActive,
    fileName: input.fileName,
    layout: input.layout,
    text: input.text,
    errorWords: input.errorWords,
    personalDict: input.personalDict,
    stardict,
    theme: document.documentElement.getAttribute("data-theme"),
    standalone: isStandalone(),
    online: navigator.onLine,
    viewport: { width: window.innerWidth, height: window.innerHeight },
    devicePixelRatio: window.devicePixelRatio,
    touch: isTouch(),
  });
  return buildIssueUrl(diagnostics, recentErrors());
}

export async function openReport(
  win: Window | null,
  input: ReportInput,
): Promise<void> {
  const url = await reportUrl(input);
  if (win && !win.closed) win.location.replace(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}
