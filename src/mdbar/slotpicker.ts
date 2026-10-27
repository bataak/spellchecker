import { requireEl } from "../ui/dom.ts";
import { splitName } from "../office/filename.ts";
import { renameSlot } from "../slots/fileslots.ts";
import { pickerOptions } from "../slots/slotmenu.ts";
import { pickerValue } from "../slots/slotstore.ts";
import type { SlotDropdown } from "../slots/slotdropdown.ts";
import type { SlotList } from "../slots/slotlist.ts";

export interface SlotPickerDeps {
  readonly bar: HTMLElement;
  readonly dropdown: () => SlotDropdown;
  readonly slots: SlotList;
  readonly templateId: () => string;
  readonly fileName: () => string | null;
  readonly projectDirty: () => boolean;
}

export interface SlotPicker {
  rebuild(): void;
  pick(key: string): void;
  syncLabel(): void;
  setProject(name: string | null): void;
}

export function createSlotPicker(d: SlotPickerDeps): SlotPicker {
  const { bar, slots } = d;
  const select = requireEl<HTMLButtonElement>(".md-template", bar);
  const fileBox = requireEl<HTMLElement>(".md-file", bar);
  const fileHead = requireEl<HTMLElement>(".md-file-head", fileBox);
  const fileTail = requireEl<HTMLElement>(".md-file-tail", fileBox);
  let projectName: string | null = null;
  let pickedLabel = "";
  let shownFile: string | null | undefined;

  function rebuild(): void {
    d.dropdown().render(
      pickerOptions(
        slots.all(),
        slots.dirty,
        projectName === null
          ? null
          : { name: projectName, dirty: d.projectDirty() },
      ),
    );
    pick(pickerValue(d.templateId()));
  }

  function pick(key: string): void {
    pickedLabel = d.dropdown().pick(key) ?? pickedLabel;
    shownFile = undefined;
    syncLabel();
  }

  function syncLabel(): void {
    const name = d.fileName();
    if (name === shownFile) return;
    shownFile = name;
    const slot = slots.find(d.templateId());
    if (slot && name && slot.name !== name) {
      slots.update((list) => renameSlot(list, slot.id, name));
      rebuild();
    }
    select.textContent = name ? "Файл" : pickedLabel;
    fileBox.hidden = !name;
    if (!name) return;
    const parts = splitName(name);
    fileHead.textContent = parts.head;
    fileTail.textContent = parts.tail;
    fileBox.title = name;
  }

  return {
    rebuild,
    pick,
    syncLabel,
    setProject(name) {
      if (name === projectName) return;
      projectName = name;
      rebuild();
    },
  };
}
