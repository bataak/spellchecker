import {
  FILE_LIMIT,
  PROJECT_SLOT,
  isFileSlot,
  nextFileId,
  sameFile,
  textSum,
  addSlot,
  fallbackSlot,
  markSlotSaved,
} from "../slots/fileslots.ts";
import { dropCaret, type DraftStore } from "../slots/slotstore.ts";
import type { SlotList } from "../slots/slotlist.ts";

export interface FileSlotDeps {
  readonly editor: HTMLTextAreaElement;
  readonly store: DraftStore;
  readonly slots: SlotList;
  readonly templateId: () => string;
  readonly lastTemplate: () => string;
  readonly choose: (id: string) => void;
  readonly rebuild: () => void;
  readonly onCloseFile?: (id: string) => void;
}

export interface FileSlotOps {
  openFile(name: string, hash?: string): boolean;
  closeFile(id: string, force?: boolean): void;
  findFile(name: string, hash: string, text: string | null): string | null;
  showFile(id: string): void;
  fileDirty(id: string): boolean;
  fileSlots(): { id: string; name: string; text: string | null }[];
  enterProject(): void;
  leaveProject(): void;
  markSaved(written?: boolean): void;
}

export function createFileSlotOps(d: FileSlotDeps): FileSlotOps {
  const { slots } = d;

  function forget(id: string): void {
    d.store.drop(id);
    dropCaret(id);
    d.onCloseFile?.(id);
  }

  return {
    openFile(name, hash) {
      const current = slots.stored();
      if (current.length >= FILE_LIMIT) return false;
      const id = nextFileId(current);
      slots.update((list) => addSlot(list, id, name, hash));
      d.rebuild();
      d.choose(id);
      return true;
    },
    closeFile(id, force = false) {
      const slot = slots.find(id);
      if (!slot) return;
      if (
        !force &&
        slots.dirty(slot) &&
        !window.confirm(
          "«" + slot.name + "» хадгалагдаагүй байна. Файлыг хаах уу?",
        )
      )
        return;
      if (d.templateId() === id)
        d.choose(fallbackSlot(slots.all(), id, d.lastTemplate()));
      slots.update((list) => list.filter((item) => item.id !== id));
      forget(id);
      d.rebuild();
    },
    findFile: (name, hash, text) =>
      slots.all().find((slot) => sameFile(slot, name, hash, text))?.id ?? null,
    showFile(id) {
      if (slots.find(id)) d.choose(id);
    },
    fileDirty(id) {
      const slot = slots.find(id);
      return slot ? slots.dirty(slot) : false;
    },
    fileSlots: () =>
      slots.all().map((slot) => ({
        id: slot.id,
        name: slot.name,
        text: slots.text(slot),
      })),
    enterProject() {
      if (d.templateId() !== PROJECT_SLOT) d.choose(PROJECT_SLOT);
    },
    leaveProject() {
      if (d.templateId() === PROJECT_SLOT)
        d.choose(slots.all().at(-1)?.id ?? d.lastTemplate());
      forget(PROJECT_SLOT);
    },
    markSaved(written = false) {
      const id = d.templateId();
      if (!isFileSlot(id)) return;
      const sum = textSum(d.editor.value);
      slots.update((list) => markSlotSaved(list, id, sum, written));
    },
  };
}
