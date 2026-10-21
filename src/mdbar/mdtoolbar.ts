import { PROJECT_SLOT, isFileSlot } from "../slots/fileslots.ts";
import { PLAIN, isPlain } from "../doc/templates.ts";
import { KEYS } from "../core/store.ts";
import { buildButtons } from "./mdbuttons.ts";
import { createSlotDropdown } from "../slots/slotdropdown.ts";
import { buildPicker } from "../slots/slotmenu.ts";
import {
  chosenExample,
  dropDraft,
  loadCaret,
  loadTemplateId,
  migrateLegacyDrafts,
  migrateSlotDrafts,
  onDraftError,
  pickerValue,
  readDraft,
  saveCaret,
  saveDraft,
  saveExampleChoice,
  saveTemplateId,
  smallDraft,
  type Caret,
} from "../slots/slotstore.ts";
import { createSlotList } from "../slots/slotlist.ts";
import { initTopbarFit } from "../ui/topbarfit.ts";
import { createButtonState } from "./mdbuttonstate.ts";
import { bindFormatting } from "./mdformat.ts";
import { createDraftSwitch } from "./draftswitch.ts";
import { createBarVisibility } from "./mdvisibility.ts";
import { createSlotPicker } from "./slotpicker.ts";
import { createFileSlotOps } from "./fileslotops.ts";

export { sharedSlot, type Caret } from "../slots/slotstore.ts";

export interface MdToolbarOptions {
  readonly editor: HTMLTextAreaElement;
  readonly isMdFile: () => boolean;
  readonly isTexFile?: () => boolean;
  readonly fileName?: () => string | null;
  readonly mount?: HTMLElement;
  readonly onLeave?: (from: string, to: string) => void;
  readonly onTemplate?: (id: string, from: string) => void;
  readonly onExample?: () => void;
  readonly onDraftError?: () => void;
  readonly onCloseFile?: (id: string) => void;
  readonly projectDirty?: () => boolean;
  readonly onCloseProject?: () => void;
}

export interface MdToolbar {
  refresh: () => void;
  template: () => string;
  slot: () => string;
  draft: (key: string) => Promise<string | null>;
  caret: (key: string) => Caret | null;
  writeDraft: (key: string, text: string) => void;
  writeCaret: (key: string, caret: Caret) => void;
  reset: (closeFile: boolean) => void;
  openFile: (name: string, hash?: string) => boolean;
  findFile: (name: string, hash: string, text: string | null) => string | null;
  showFile: (id: string) => void;
  closeFile: (id: string, force?: boolean) => void;
  fileSlots: () => { id: string; name: string; text: string | null }[];
  setProject: (name: string | null) => void;
  enterProject: () => void;
  leaveProject: () => void;
  markSaved: (written?: boolean) => void;
  fileDirty: (id: string) => boolean;
  destroy: () => void;
}

function createBar(mount: HTMLElement | null): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "md-bar";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Хэлбэржүүлэх");
  bar.innerHTML =
    buildPicker() + '<span class="md-group">' + buildButtons() + "</span>";
  if (mount) mount.insertBefore(bar, mount.firstChild);
  return bar;
}

export function initMdToolbar(options: MdToolbarOptions): MdToolbar {
  const { editor, isMdFile, isTexFile = () => false } = options;

  const mount = options.mount ?? editor.parentElement;
  const bar = createBar(mount);
  let templateId = loadTemplateId();
  saveTemplateId(templateId);

  const select = bar.querySelector<HTMLButtonElement>(".md-template")!;
  const slots = createSlotList(
    () => templateId,
    () => editor.value,
  );

  let lastTemplate =
    isFileSlot(templateId) || templateId === PROJECT_SLOT ? PLAIN : templateId;
  const labels = createSlotPicker({
    bar,
    dropdown: () => dropdown,
    slots,
    templateId: () => templateId,
    fileName: () => options.fileName?.() ?? null,
    projectDirty: () => options.projectDirty?.() ?? false,
  });
  const rebuildMenu = labels.rebuild;
  const dropdown = createSlotDropdown({
    select,
    beforeOpen: () => rebuildMenu(),
    afterClose: () => syncVisible(),
    onSelect: (value) => onSelect(value),
    canClose: isFileSlot,
    onCloseSlot: (id) => closeFile(id),
    onCloseProject: () => options.onCloseProject?.(),
  });
  const group = bar.querySelector<HTMLElement>(".md-group")!;
  const picker = bar.querySelector<HTMLElement>(".md-select")!;
  const topbar = initTopbarFit(mount, bar, group);

  onDraftError(options.onDraftError ?? null);
  let legacyPending = migrateLegacyDrafts(templateId);
  migrateSlotDrafts();

  function dropLegacyPending(): void {
    for (const legacy of legacyPending) dropDraft(legacy);
    legacyPending = [];
  }
  rebuildMenu();

  const buttons = createButtonState(
    group,
    editor,
    () => !bar.hidden && !group.hidden,
  );

  function active(): boolean {
    if (isTexFile()) return false;
    return options.fileName?.() ? isMdFile() : !isPlain(templateId);
  }

  const visibility = createBarVisibility({
    bar,
    group,
    picker,
    editor,
    mount,
    buttons,
    menu: dropdown,
    active,
    beforeSync: labels.syncLabel,
    afterSync: () => topbar.sync(),
  });
  const syncVisible = visibility.sync;

  const drafts = createDraftSwitch({
    editor,
    currentKey: () => pickerValue(templateId),
    onExample: options.onExample,
  });

  function chooseTemplate(id: string, example?: string): void {
    const from = pickerValue(templateId);
    if (
      id === templateId &&
      (example === undefined || example === chosenExample(id))
    )
      return;

    drafts.leave(from, legacyPending.map(smallDraft));
    dropLegacyPending();
    templateId = id;
    if (!isFileSlot(id) && id !== PROJECT_SLOT) lastTemplate = id;
    saveTemplateId(id);
    if (example !== undefined) saveExampleChoice(id, example);

    const key = pickerValue(id);
    if (key !== from) options.onLeave?.(from, key);
    drafts.enter(id, key);

    if (options.onTemplate) options.onTemplate(id, from);
    labels.pick(key);
    syncVisible();
  }

  const files = createFileSlotOps({
    editor,
    slots,
    templateId: () => templateId,
    lastTemplate: () => lastTemplate,
    choose: (id) => chooseTemplate(id),
    rebuild: rebuildMenu,
    onCloseFile: options.onCloseFile,
  });
  const closeFile = files.closeFile;

  const onSelect = (value: string): void => {
    const [slot = "", example] = value.split(":");
    chooseTemplate(slot, example);
    editor.focus();
  };

  visibility.hold();

  const unbindFormatting = bindFormatting({ bar, editor, buttons, active });
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== KEYS.slots.name) return;
    slots.reload();
    rebuildMenu();
  };
  window.addEventListener("storage", onStorage);
  editor.addEventListener("input", buttons.sync);

  return {
    refresh: syncVisible,
    template: () => templateId,
    slot: () => pickerValue(templateId),
    draft: readDraft,
    caret: loadCaret,
    writeDraft(key: string, text: string): void {
      if (key !== drafts.loadingKey()) saveDraft(key, text);
    },
    writeCaret(key: string, caret: Caret): void {
      if (key !== drafts.loadingKey()) saveCaret(key, caret);
    },
    reset(close: boolean): void {
      dropDraft(pickerValue(templateId));
      dropLegacyPending();
      visibility.hold();
      if (close && isFileSlot(templateId)) closeFile(templateId, true);
    },
    ...files,
    setProject: labels.setProject,
    destroy(): void {
      visibility.destroy();
      window.removeEventListener("storage", onStorage);
      dropdown.destroy();
      topbar.destroy();
      unbindFormatting();
      editor.removeEventListener("input", buttons.sync);
      mount?.classList.remove("has-mdbar");
      editor.parentElement?.classList.remove("is-markdown");
      bar.remove();
    },
  };
}
