import { baseName } from "../tex/texproject.ts";
import { patchText, swapText } from "../editor/editortext.ts";
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

function loadText(deps: BindDeps, text: string, place: Place | null): void {
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
}

function adoptable(deps: BindDeps, strict: boolean): string | null {
  const view = deps.store.project();
  if (!view?.active || view.pending) return null;
  if (deps.file.name() !== baseName(view.active)) return null;
  const matches = strict
    ? deps.store.projectText(view.active) === deps.editor.value
    : read(KEYS.projectSlot) === deps.slots.current();
  return matches ? view.active : null;
}

function createEntering(slots: SlotPort) {
  let entering = false;
  return {
    enter(): void {
      if (slots.inProject()) return;
      entering = true;
      try {
        slots.enterProject();
      } finally {
        entering = false;
      }
    },
    active: () => entering,
  };
}

function movePlace(
  places: Map<string, Place>,
  from: string | null,
  to: string,
): void {
  const moved = places.get(from ?? "");
  if (moved && from) places.delete(from);
  if (moved) places.set(to, moved);
}

function leave(deps: BindDeps): void {
  deps.file.bind(null);
  deps.afterSwitch();
}

function openable(store: ProjectStore, path: string): boolean {
  const view = store.project();
  return !!view && !view.pending && store.projectText(path) !== null;
}

function lostBinding(
  deps: BindDeps,
  view: ProjectView | null,
  boundId: number,
  unbind: (forget: boolean) => void,
  openFile: (path: string) => void,
): boolean | null {
  if (!view || view.id !== boundId) {
    unbind(!view);
    if (!view) leave(deps);
    return true;
  }
  if (view.active !== null) return null;
  unbind(false);
  if (view.main) openFile(view.main);
  else leave(deps);
  return false;
}

function changedText(
  deps: BindDeps,
  view: ProjectView,
  path: string,
  pushed: string | null,
): string | null {
  const text = deps.store.projectText(path);
  if (text === null || text === deps.editor.value) return null;
  if (view.dirty.has(path) && text === pushed) return null;
  return text;
}

export function createBinding(deps: BindDeps): Binding {
  const { editor, store } = deps;
  let bound = false;
  let boundPath: string | null = null;
  let boundId = 0;
  let detached = false;
  const entering = createEntering(deps.slots);
  let pushed: string | null = null;
  const places = new Map<string, Place>();

  const load = (text: string, place: Place | null): void => {
    pushed = text;
    loadText(deps, text, place);
  };
  const pushText = (): void => {
    if (!bound || !boundPath || detached) return;
    const text = editor.value;
    store.setProjectText(boundPath, text);
    if (store.projectText(boundPath) === text) pushed = text;
  };
  const setBound = (on: boolean): void => {
    if (!on && bound && boundPath) places.set(boundPath, placeOf(editor));
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
    setBound(false);
    boundPath = null;
    if (forget) storeSlot(null);
  };
  const openFile = (path: string): void => {
    if (!openable(store, path)) return;
    entering.enter();
    const text = store.projectText(path);
    if (text === null) return;
    if (bound && boundPath === path) {
      editor.focus({ preventScroll: true });
      return;
    }
    pushText();
    setBound(false);
    store.setActive(path);
    bind(path);
    deps.file.bind(baseName(path));
    load(text, places.get(path) ?? null);
  };
  const adopt = (strict: boolean): void => {
    const active = bound ? null : adoptable(deps, strict);
    if (active === null) return;
    bind(active);
    const text = store.projectText(active);
    pushed = text;
    if (text === null || text === editor.value) deps.afterSwitch();
    else load(text, placeOf(editor));
  };
  const moveTo = (active: string): void => {
    movePlace(places, boundPath, active);
    boundPath = active;
    deps.file.bind(baseName(active));
  };
  const reload = (view: ProjectView): void => {
    if (boundPath === null || detached) return;
    const text = changedText(deps, view, boundPath, pushed);
    if (text === null) return;
    pushed = text;
    patchText(editor, text, "project");
    deps.afterSwitch();
  };
  const follow = (view: ProjectView | null): boolean => {
    if (!bound) return true;
    const lost = lostBinding(deps, view, boundId, unbind, openFile);
    if (lost !== null || !view?.active) return lost ?? true;
    if (view.active !== boundPath) moveTo(view.active);
    reload(view);
    return true;
  };

  return {
    bound: () => bound,
    path: () => (bound ? boundPath : null),
    entering: entering.active,
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
