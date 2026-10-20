import { baseName } from "../tex/texproject.ts";
import { swapText } from "../editor/editortext.ts";
import { KEYS, read, remove, write } from "../core/store.ts";
import type { ProjectStore, ProjectView } from "./projectstore.ts";
import type { OpenFilePort, SlotPort } from "./projectlink.ts";

interface Place {
  readonly start: number;
  readonly end: number;
  readonly scroll: number;
}

export interface BindDeps {
  readonly store: ProjectStore;
  readonly editor: HTMLTextAreaElement;
  readonly slots: SlotPort;
  readonly file: OpenFilePort;
  readonly onBound: (bound: boolean) => void;
  readonly afterSwitch: () => void;
}

export interface Binding {
  bound(): boolean;
  path(): string | null;
  entering(): boolean;
  detach(): void;
  pushText(): void;
  unbind(forget: boolean): void;
  openFile(path: string): void;
  adopt(strict: boolean): void;
  follow(view: ProjectView | null): boolean;
}

export function storeSlot(slot: string | null): void {
  if (slot === null) remove(KEYS.projectSlot);
  else write(KEYS.projectSlot, slot);
}

const placeOf = (editor: HTMLTextAreaElement): Place => ({
  start: editor.selectionStart,
  end: editor.selectionEnd,
  scroll: editor.scrollTop,
});

function loadText(deps: BindDeps, text: string, place: Place | null): string {
  const { editor } = deps;
  const end = text.length;
  editor.focus({ preventScroll: true });
  swapText(editor, text, {
    origin: "project",
    start: Math.min(place?.start ?? 0, end),
    end: Math.min(place?.end ?? 0, end),
  });
  editor.scrollTop = place?.scroll ?? 0;
  deps.afterSwitch();
  return text;
}

export function createBinding(deps: BindDeps): Binding {
  const { editor, store } = deps;
  let bound = false;
  let boundPath: string | null = null;
  let boundId = 0;
  let detached = false;
  let entering = false;
  let pushed: string | null = null;
  const places = new Map<string, Place>();

  const pushText = (): void => {
    if (!bound || !boundPath || detached) return;
    pushed = editor.value;
    store.setProjectText(boundPath, pushed);
  };
  const remember = (): void => {
    if (bound && boundPath) places.set(boundPath, placeOf(editor));
  };
  const setBound = (on: boolean): void => {
    bound = on;
    deps.onBound(on);
  };
  const bind = (path: string): void => {
    setBound(true);
    boundPath = path;
    boundId = store.project()?.id ?? 0;
    detached = false;
    storeSlot(deps.slots.current());
  };
  const unbind = (forget: boolean): void => {
    remember();
    setBound(false);
    boundPath = null;
    if (forget) storeSlot(null);
  };
  const enterSlot = (): void => {
    if (deps.slots.inProject()) return;
    entering = true;
    try {
      deps.slots.enterProject();
    } finally {
      entering = false;
    }
  };
  const openFile = (path: string): void => {
    const view = store.project();
    if (!view || view.pending || store.projectText(path) === null) return;
    enterSlot();
    const text = store.projectText(path);
    if (text === null) return;
    if (bound && boundPath === path) {
      editor.focus({ preventScroll: true });
      return;
    }
    pushText();
    remember();
    setBound(false);
    store.setActive(path);
    bind(path);
    deps.file.bind(baseName(path));
    pushed = loadText(deps, text, places.get(path) ?? null);
  };
  const adopt = (strict: boolean): void => {
    const view = store.project();
    if (!view?.active || view.pending || bound) return;
    if (deps.file.name() !== baseName(view.active)) return;
    if (
      strict
        ? store.projectText(view.active) !== editor.value
        : read(KEYS.projectSlot) !== deps.slots.current()
    )
      return;
    bind(view.active);
    const text = store.projectText(view.active);
    pushed = text;
    if (text === null || text === editor.value) deps.afterSwitch();
    else loadText(deps, text, placeOf(editor));
  };
  const leave = (): void => {
    deps.file.bind(null);
    deps.afterSwitch();
  };
  const moveTo = (active: string): void => {
    const moved = places.get(boundPath ?? "");
    if (moved && boundPath) places.delete(boundPath);
    boundPath = active;
    if (moved) places.set(active, moved);
    deps.file.bind(baseName(active));
  };
  const reload = (view: ProjectView): void => {
    if (boundPath === null || detached) return;
    const text = store.projectText(boundPath);
    if (text === null || text === editor.value) return;
    if (view.dirty.has(boundPath) && text === pushed) return;
    pushed = loadText(deps, text, placeOf(editor));
  };
  const follow = (view: ProjectView | null): boolean => {
    if (!bound) return true;
    if (!view || view.id !== boundId) {
      unbind(!view);
      if (!view) leave();
      return true;
    }
    if (view.active === null) {
      unbind(false);
      if (view.main) openFile(view.main);
      else leave();
      return false;
    }
    if (view.active !== boundPath) moveTo(view.active);
    reload(view);
    return true;
  };

  return {
    bound: () => bound,
    path: () => (bound ? boundPath : null),
    entering: () => entering,
    detach() {
      detached = true;
    },
    pushText,
    unbind,
    openFile,
    adopt,
    follow,
  };
}
