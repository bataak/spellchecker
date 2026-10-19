import { DICTIONARIES } from "../spell/spellchecker.ts";
import { escapeHtml } from "./htmlutil.ts";
import { noteError } from "./errorlog.ts";

export async function requestDurableStorage(): Promise<void> {
  try {
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      const already = navigator.storage.persisted
        ? await navigator.storage.persisted()
        : false;
      if (!already) await navigator.storage.persist();
    }
  } catch (error) {
    noteError(error);
  }
}

export function offlineCapable(): boolean {
  return "serviceWorker" in navigator && "caches" in window;
}

export async function isOfflineReady(): Promise<boolean> {
  try {
    const base = import.meta.env.BASE_URL;
    const resolveAppUrl = (path: string): string =>
      new URL(base + path, location.href).href;
    const opt = { ignoreSearch: true };
    const reg =
      navigator.serviceWorker &&
      (await navigator.serviceWorker.getRegistration());
    if (!reg || !reg.active) return false;
    const shell =
      (await caches.match(resolveAppUrl("index.html"), opt)) ||
      (await caches.match(resolveAppUrl(""), opt));
    if (!shell) return false;
    const manRes = await caches.match(
      resolveAppUrl("dict/dict-manifest.json"),
      opt,
    );
    if (!manRes) return false;
    const man = (await manRes.clone().json()) as {
      dicts?: { id: string; dic: string }[];
    };
    const mn = (man.dicts || []).find((dict) => dict.id === "mn_MN");
    if (!mn) return false;
    return !!(await caches.match(resolveAppUrl("dict/" + mn.dic), opt));
  } catch {
    return false;
  }
}

const labelOf = (id: string): string =>
  DICTIONARIES.find((dict) => dict.id === id)?.label || id;

export function dictStatusMessage(
  loaded: string[],
  failed: { id: string; error: string }[] | null,
  fallbackReason: string | null,
): string {
  const seenName = new Set<string>();
  const simple: string[] = [];
  for (const id of loaded) {
    const name = id.startsWith("mn")
      ? "монгол"
      : id.startsWith("en")
        ? "англи"
        : labelOf(id);
    if (!seenName.has(name)) {
      seenName.add(name);
      simple.push(name);
    }
  }
  const dictShortcut = /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "")
    ? "⌘⇧L"
    : "Ctrl+Shift+L";
  let msg =
    '<span class="dict-toggle" role="button" tabindex="0" aria-haspopup="dialog" aria-label="Толь сонгох"' +
    ' aria-keyshortcuts="Control+Shift+L Meta+Shift+L" title="Толь сонгох · ' +
    dictShortcut +
    '">' +
    "Ашиглаж буй толь: <b>" +
    simple.join(", ") +
    "</b></span>";
  if (failed && failed.length) {
    msg +=
      ' <span class="muted">(олдсонгүй: ' +
      failed.map((fail) => escapeHtml(String(fail.id))).join(", ") +
      ")</span>";
  }
  if (fallbackReason) {
    msg +=
      '<br><span class="muted">hunspell-wasm амжилтгүй (nspell ашиглаж байна): ' +
      escapeHtml(fallbackReason) +
      "</span>";
  }
  return msg;
}

export interface OfflineIndicatorDeps {
  readonly idle: () => boolean;
  readonly setStatus: (html: string, animate?: boolean) => void;
  readonly base: () => string;
  readonly setActive: (on: boolean) => void;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function runOfflineIndicator(
  deps: OfflineIndicatorDeps,
): Promise<void> {
  const transient = (message: string, animate = true): void => {
    if (deps.idle()) deps.setStatus(message, animate);
  };

  if (import.meta.env.DEV || !offlineCapable()) {
    if (deps.idle()) deps.setStatus(deps.base());
    return;
  }

  deps.setActive(true);
  transient("Офлайн горимд ажиллахад бэлтгэж байна…");

  let ready = await isOfflineReady();
  const deadline = Date.now() + 20000;
  while (!ready && Date.now() < deadline) {
    await wait(700);
    ready = await isOfflineReady();
  }

  if (ready) {
    transient("Офлайн горимд ажиллахад бэлэн", false);
    await wait(1500);
  }

  deps.setActive(false);
  if (deps.idle()) deps.setStatus(deps.base());
}
