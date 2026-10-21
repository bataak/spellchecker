import type { AppUpdate } from "./appupdate.ts";
import type { DraftText } from "../editor/drafttext.ts";
import { requestDurableStorage } from "../core/offline.ts";
import type { DictLife } from "./dictlife.ts";

const SCROLL_DROPPERS = ["pointerdown", "wheel", "keydown", "touchstart"];

const BOOT_FALLBACK_MS = 2000;

export interface BootDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: HTMLElement;
  readonly draft: DraftText;
  readonly baseline: () => void;
  readonly restoreFile: () => Promise<void>;
  readonly restoreProject: () => Promise<void>;
  readonly pruneUndo: () => void;
  readonly fontsLoaded: () => void;
  readonly render: () => Promise<void>;
  readonly nudge: () => void;
  readonly appUpdate: AppUpdate;
  readonly dictLife: DictLife;
  readonly status: (message: string) => void;
}

async function restoreView(deps: BootDeps): Promise<void> {
  const { editor, draft } = deps;
  await draft.load();
  deps.baseline();
  await deps.restoreFile();
  await deps.restoreProject();
  deps.pruneUndo();
  void deps.render();
  document.documentElement.classList.remove("booting");
  editor.focus({ preventScroll: true });
  deps.nudge();
  draft.restoreBootScroll();
  void Promise.resolve(document.fonts?.ready).then(() => {
    draft.restoreBootScroll();
    requestAnimationFrame(() => {
      draft.restoreBootScroll();
      draft.dropBootScroll();
    });
  });
  for (const type of SCROLL_DROPPERS)
    editor.addEventListener(type, draft.dropBootScroll, { once: true });
}

export function boot(deps: BootDeps): Promise<void> {
  void document.fonts.ready.then(deps.fontsLoaded);
  if (import.meta.env.DEV) watchMetrics(deps.backdrop, deps.editor);
  const started = start(deps);
  setTimeout(() => {
    document.documentElement.classList.remove("booting");
  }, BOOT_FALLBACK_MS);
  return started;
}

async function start(deps: BootDeps): Promise<void> {
  void requestDurableStorage();
  if (!import.meta.env.DEV) void deps.appUpdate.recoverStale(true);
  deps.dictLife.watchFatal();
  deps.status("Hunspell ачаалж байна…");
  await restoreView(deps);
  await deps.dictLife.start();
}

function watchMetrics(
  backdrop: HTMLElement,
  editor: HTMLTextAreaElement,
): void {
  const check = (): void => {
    const delta = backdrop.scrollHeight - editor.scrollHeight;
    if (delta !== 0)
      console.warn("backdrop/editor өндрийн зөрүү:", delta, "px");
  };
  editor.addEventListener("input", check);
  void document.fonts.ready.then(check);
}
