import type { OpenFile } from "./fileio.ts";
import { PROJECT_SLOT } from "./fileslots.ts";
import {
  dropOfficeFile,
  loadDraftFile,
  loadOfficeFile,
  saveDraftFile,
  saveOfficeFile,
  type DraftFile,
} from "./storage.ts";

export interface SlotSwitchDeps {
  readonly editor: HTMLTextAreaElement;
  readonly files: {
    readonly take: () => OpenFile | null;
    readonly put: (file: OpenFile | null) => void;
    readonly restore: (ref: DraftFile) => void;
    readonly name: () => string | null;
  };
  readonly office: {
    readonly file: () => File | null;
    readonly park: (slot: string) => void;
    readonly open: (
      file: File,
      text: string | undefined,
      cancelled: () => boolean,
    ) => Promise<boolean>;
    readonly queue: (op: () => Promise<void>) => void;
    readonly settled: () => Promise<void>;
  };
  readonly project: () => {
    readonly bound: () => boolean;
    readonly unbind: (forget: boolean) => void;
    readonly enter: () => void;
  } | null;
  readonly draft: (slot: string) => Promise<string | null>;
  readonly setName: (name: string | null) => void;
  readonly refreshPreview: () => void;
  readonly entered: () => void;
}

export interface SlotSwitch {
  readonly leave: (from: string) => void;
  readonly enter: (to: string) => void;
  readonly forget: (slot: string) => void;
}

export function initSlotSwitch(deps: SlotSwitchDeps): SlotSwitch {
  const files = new Map<string, OpenFile>();
  const parked = new Map<string, File>();
  let restoring: { slot: string; name: string } | null = null;
  let seq = 0;
  let wasBound = false;

  function leave(from: string): void {
    const project = deps.project();
    wasBound = project?.bound() ?? false;
    project?.unbind(true);
    seq += 1;
    const officeName =
      deps.office.file()?.name ??
      (restoring?.slot === from ? restoring.name : null);
    if (restoring) deps.editor.readOnly = false;
    restoring = null;
    const office = deps.office.file();
    deps.office.park(from);
    if (office) parked.set(from, office);
    const left = deps.files.take();
    if (left) files.set(from, left);
    else files.delete(from);
    saveDraftFile(
      officeName
        ? { name: officeName, kind: "office" }
        : left
          ? { name: left.name, kind: "text" }
          : null,
      from,
    );
  }

  function enter(to: string): void {
    const stored = loadDraftFile(to);
    if (stored?.kind === "office") {
      deps.files.put(null);
      deps.setName(stored.name);
      if (wasBound) deps.refreshPreview();
      void unpark(to, stored);
      return;
    }
    const next =
      files.get(to) ?? (stored ? { handle: null, name: stored.name } : null);
    deps.files.put(next);
    deps.setName(next ? next.name : null);
    saveDraftFile(next ? { name: next.name, kind: "text" } : null, to);
    if (wasBound) deps.refreshPreview();
    if (to === PROJECT_SLOT) deps.project()?.enter();
  }

  async function unpark(slot: string, ref: DraftFile): Promise<void> {
    const mine = seq;
    const cancelled = (): boolean => mine !== seq;
    restoring = { slot, name: ref.name };
    deps.editor.readOnly = true;
    const file =
      parked.get(slot) ??
      (await deps.office
        .settled()
        .then(() => loadOfficeFile(slot))
        .catch(() => null));
    const text = await deps.draft(slot);
    if (cancelled()) return;
    const opened =
      file !== null &&
      file.name === ref.name &&
      (await deps.office.open(file, text ?? undefined, cancelled));
    if (cancelled()) return;
    restoring = null;
    if (opened && file) {
      parked.delete(slot);
      deps.office.queue(() =>
        saveOfficeFile(file).then(() => dropOfficeFile(slot)),
      );
    } else {
      deps.editor.readOnly = false;
      deps.files.restore(ref);
      const name = deps.files.name();
      deps.setName(name);
      saveDraftFile(name ? { name, kind: "text" } : null, slot);
    }
    deps.entered();
  }

  function forget(slot: string): void {
    files.delete(slot);
    parked.delete(slot);
    saveDraftFile(null, slot);
    deps.office.queue(() => dropOfficeFile(slot));
  }

  return { leave, enter, forget };
}
