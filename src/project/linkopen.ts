import {
  baseName,
  isLatexDocument,
  isTexSource,
  masterPath,
  texMaster,
  viewableType,
} from "../tex/texproject.ts";
import type { PreviewSource } from "../preview/preview.ts";
import { findSameFile, locateFile } from "./linkfiles.ts";
import type { Binding } from "./linkbind.ts";
import type { OpenFilePort, SlotPort } from "./projectlink.ts";
import type { ProjectStore } from "./projectstore.ts";

export interface OpenDeps {
  readonly store: ProjectStore;
  readonly editor: HTMLTextAreaElement;
  readonly slots: SlotPort;
  readonly file: OpenFilePort;
}

export function absorbSlots(deps: OpenDeps): void {
  const view = deps.store.project();
  if (!view || view.pending) return;
  for (const slot of deps.slots.files()) {
    if (slot.text === null || slot.id === deps.slots.current()) continue;
    const text = slot.text;
    const same = findSameFile(
      view.files,
      slot.name,
      (path) => deps.store.projectText(path) === text,
    );
    if (same !== undefined) deps.slots.close(slot.id);
  }
}

export function createOpened(
  deps: OpenDeps,
  binding: Binding,
): (fresh: boolean, prefer?: string) => void {
  const { store, slots } = deps;
  return (fresh, prefer) => {
    const view = store.project();
    if (!view?.active) return;
    if (!fresh) {
      if (slots.inProject()) binding.adopt(false);
      if (!binding.bound()) binding.openFile(view.active);
      absorbSlots(deps);
      return;
    }
    const fromSlot = slots.current();
    const fromText = deps.editor.value;
    const target =
      prefer !== undefined && deps.file.name() === prefer
        ? locateFile(view.files, prefer, fromText, store.projectText)
        : null;
    if (target !== null) {
      store.setProjectText(target, fromText);
      const master = texMaster(fromText);
      const main = master === null ? null : masterPath(target, master);
      if (isTexSource(target) && isLatexDocument(fromText))
        store.setMain(target);
      else if (main !== null && store.projectText(main) !== null)
        store.setMain(main);
    }
    binding.openFile(target ?? view.active);
    if (target !== null && fromSlot !== slots.current()) slots.close(fromSlot);
    absorbSlots(deps);
  };
}

export function createViewer(
  store: ProjectStore,
  show: (source: PreviewSource | null) => void,
): (path: string | null) => boolean {
  let viewing = false;
  return (path) => {
    if (path === null) {
      if (viewing) show(null);
      viewing = false;
      return true;
    }
    const type = viewableType(path);
    const bytes = store.projectBinary(path);
    if (type === null || bytes === null) return false;
    const file = new File([bytes as Uint8Array<ArrayBuffer>], baseName(path), {
      type,
    });
    show({ kind: type === "application/pdf" ? "pdf" : "image", file });
    viewing = true;
    return true;
  };
}
