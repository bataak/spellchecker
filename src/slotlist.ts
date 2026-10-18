import { loadSlots, saveSlots, textSum, type FileSlot } from "./fileslots.ts";
import { LARGE_DRAFT, loadDraft } from "./slotstore.ts";

export interface SlotList {
  all(): FileSlot[];
  find(id: string): FileSlot | undefined;
  stored(): FileSlot[];
  reload(): void;
  update(change: (list: FileSlot[]) => FileSlot[]): void;
  text(slot: FileSlot): string | null;
  dirty(slot: FileSlot): boolean;
}

export function createSlotList(
  currentId: () => string,
  currentText: () => string,
): SlotList {
  let files = loadSlots();

  const find = (id: string): FileSlot | undefined =>
    files.find((item) => item.id === id);

  const stored = (): FileSlot[] => {
    const saved = loadSlots();
    const own = find(currentId());
    return own && !saved.some((item) => item.id === own.id)
      ? [...saved, own]
      : saved;
  };

  const text = (slot: FileSlot): string | null => {
    if (slot.id === currentId()) return currentText();
    const draft = loadDraft(slot.id);
    return draft === LARGE_DRAFT ? null : (draft ?? "");
  };

  return {
    all: () => files,
    find,
    stored,
    reload() {
      files = stored();
    },
    update(change) {
      files = change(stored());
      saveSlots(files);
    },
    text,
    dirty(slot) {
      if (slot.sum === null) return false;
      const current = text(slot);
      return current === null || textSum(current) !== slot.sum;
    },
  };
}
