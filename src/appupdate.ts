import { KEYS, at, read, write } from "./store.ts";
export interface AppUpdate {
  readonly setDictVersion: (version: string | null) => void;
  readonly checkFreshness: () => Promise<void>;
  readonly recoverStale: () => Promise<boolean>;
}

function swSettled(worker: ServiceWorker): Promise<void> {
  return new Promise<void>((resolve) => {
    const check = (): void => {
      if (worker.state === "installed")
        worker.postMessage({ type: "SKIP_WAITING" });
      if (worker.state === "activated" || worker.state === "redundant") {
        worker.removeEventListener("statechange", check);
        resolve();
      }
    };
    worker.addEventListener("statechange", check);
    check();
  });
}

async function fetchFreshEntry(): Promise<string | null> {
  try {
    const swUrl = new URL(import.meta.env.BASE_URL + "sw.js", location.href);
    swUrl.searchParams.set("fresh", String(Date.now()));
    const res = await fetch(swUrl.href, { cache: "no-store" });
    if (!res.ok) return null;
    const m = (await res.text()).match(/assets\/index-[\w-]+\.js/);
    return m ? m[0] : null;
  } catch (_) {
    return null;
  }
}

async function servesEntry(entry: string): Promise<boolean> {
  try {
    const res = await fetch(
      new URL(import.meta.env.BASE_URL, location.href).href,
      { cache: "no-store" },
    );
    return res.ok && (await res.text()).includes(entry);
  } catch (_) {
    return false;
  }
}

const IDLE_RELOAD_MS = 10 * 60 * 1000;

// Дараагийн ачааллыг бүдгэрүүлэхийг app-init.js-д мэдэгдээд ачаална.
function reloadForUpdate(): void {
  write(KEYS.updateReload, "1");
  location.reload();
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, ms)));
}

export function initAppUpdate(
  setStatus: (html: string) => void,
  entryUrl: string,
): AppUpdate {
  const reloadEl = document.querySelector<HTMLElement>("#appReloadBtn");
  let freshEntry: string | null = null;
  let appUpdating = false;
  let verBase = "";

  let prepared: Promise<boolean> | null = null;
  let lastActivity = Date.now();
  let composing = false;

  async function prepareLatest(): Promise<boolean> {
    const deadline = Date.now() + 2 * 60 * 1000;
    try {
      const reg = navigator.serviceWorker
        ? await navigator.serviceWorker.getRegistration()
        : null;
      const entry = freshEntry ?? (await fetchFreshEntry());
      if (!reg) return true;
      if (entry) {
        while (Date.now() < deadline) {
          const pending = reg.installing || reg.waiting;
          if (pending && pending.state !== "redundant") {
            await Promise.race([
              swSettled(pending),
              waitMs(deadline - Date.now()),
            ]);
            continue;
          }
          if (await servesEntry(entry)) return true;
          await reg.update().catch(() => undefined);
          const next = reg.installing || reg.waiting;
          if (!next || next.state === "redundant") await waitMs(5000);
        }
      }
    } catch (_) {}
    return false;
  }

  function prepareOnce(): Promise<boolean> {
    prepared ??= prepareLatest().then((ok) => {
      if (!ok) prepared = null;
      return ok;
    });
    return prepared;
  }

  async function reloadToLatest(): Promise<void> {
    appUpdating = true;
    await prepareOnce();
    reloadForUpdate();
  }

  // Шинэ хувилбарыг чимээгүй бэлдээд, бичих явцад саад болохгүйн тулд
  // зөвхөн товч дарах эсвэл удаан идэвхгүй байх үед ачаална.
  function markActive(): void {
    lastActivity = Date.now();
  }
  for (const type of [
    "keydown",
    "pointerdown",
    "pointermove",
    "wheel",
    "touchstart",
    "input",
  ])
    document.addEventListener(type, markActive, {
      capture: true,
      passive: true,
    });
  document.addEventListener("compositionstart", () => {
    composing = true;
    markActive();
  });
  document.addEventListener("compositionend", () => {
    composing = false;
    markActive();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") markActive();
  });

  function armIdleReload(): void {
    const timer = setInterval(() => {
      if (appUpdating) return clearInterval(timer);
      if (composing || document.querySelector("dialog[open]")) return;
      if (Date.now() - lastActivity < IDLE_RELOAD_MS) return;
      clearInterval(timer);
      appUpdating = true;
      reloadForUpdate();
    }, 30 * 1000);
  }

  // Шинэ SW идэвхжсэний дараа хуучин хувилбарын lazy chunk кэшээс
  // устдаг тул ийм import амжилтгүй болбол дахин ачаалахыг санал болгоно.
  window.addEventListener("vite:preloadError", async () => {
    if (appUpdating) return;
    const selfName = entryUrl.split("/").pop();
    const entry = freshEntry ?? (await fetchFreshEntry());
    if (!selfName || !entry || entry.endsWith("/" + selfName)) return;
    freshEntry = entry;
    if (reloadEl) reloadEl.hidden = false;
    // Экспортын өөрийн алдааны мессежийн дараа харагдуулна.
    await waitMs(0);
    setStatus(
      "Шинэ хувилбар суусан тул энэ үйлдлийг хийхийн тулд ↻ товчийг дарж хуудсыг дахин ачаална уу",
    );
  });

  if (reloadEl) {
    reloadEl.addEventListener("click", () => {
      reloadEl.hidden = true;
      setStatus("Шинэ хувилбарыг ачаалж байна…");
      void reloadToLatest();
    });
  }

  const verEl = document.querySelector<HTMLElement>("#appVersion");
  if (verEl) {
    const av = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "";
    const hv =
      typeof __HUNSPELL_VERSION__ !== "undefined" ? __HUNSPELL_VERSION__ : "";
    verEl.dataset.short = av ? "v" + av : "";
    verBase = (av ? "v" + av : "") + (hv ? " · hunspell " + hv : "");
    verEl.dataset.full = verBase;
    verEl.textContent = verEl.dataset.short;
    verEl.style.cursor = "pointer";
    verEl.addEventListener("click", () => {
      const expanded = verEl.textContent !== verEl.dataset.short;
      verEl.textContent =
        (expanded ? verEl.dataset.short : verEl.dataset.full) ?? "";
    });
  }

  function setDictVersion(version: string | null): void {
    if (!verEl) return;
    const full = verBase + (version ? " · mn_MN " + version : "");
    const wasExpanded = verEl.textContent === verEl.dataset.full;
    verEl.dataset.full = full;
    if (wasExpanded) verEl.textContent = full;
  }

  async function checkFreshness(): Promise<void> {
    if (!reloadEl || !reloadEl.hidden || appUpdating) return;
    const selfName = entryUrl.split("/").pop();
    const entry = await fetchFreshEntry();
    if (!selfName || !entry || entry.endsWith("/" + selfName)) return;
    freshEntry = entry;
    const ready = await prepareOnce();
    if (appUpdating || !reloadEl.hidden) return;
    reloadEl.hidden = false;
    if (ready) armIdleReload();
  }

  async function recoverStale(): Promise<boolean> {
    if (appUpdating) return true;
    const selfName = entryUrl.split("/").pop();
    const entry = await fetchFreshEntry();
    if (!selfName || !entry || entry.endsWith("/" + selfName)) return false;
    const key = at(KEYS.staleReload, entry);
    if (read(key) || !write(key, "1")) return false;
    freshEntry = entry;
    if (reloadEl) reloadEl.hidden = true;
    setStatus("Шинэ хувилбарыг ачаалж байна…");
    void reloadToLatest();
    return true;
  }

  return { setDictVersion, checkFreshness, recoverStale };
}
