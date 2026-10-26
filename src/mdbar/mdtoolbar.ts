import { PROJECT_SLOT, isFileSlot } from "../slots/fileslots.ts";
import { PLAIN, isPlain } from "../doc/templates.ts";
import { KEYS } from "../core/store.ts";
import { buildButtons } from "./mdbuttons.ts";
import { createSlotDropdown } from "../slots/slotdropdown.ts";
import { buildPicker } from "../slots/slotmenu.ts";
import {
  chosenExample,
  loadCaret,
  loadTemplateId,
  migrateLegacyDrafts,
  migrateSlotDrafts,
  pickerValue,
  saveCaret,
  saveExampleChoice,
  saveTemplateId,
  smallDraft,
  type Caret,
  createDraftStore,
  type DraftStore,
} from "../slots/slotstore.ts";
import { createSlotList } from "../slots/slotlist.ts";
import { initTopbarFit } from "../ui/topbarfit.ts";
import { createButtonState } from "./mdbuttonstate.ts";
import { bindFormatting } from "./mdformat.ts";
import { createDraftSwitch } from "./draftswitch.ts";
import { createBarVisibility } from "./mdvisibility.ts";
import { createSlotPicker } from "./slotpicker.ts";
import { createFileSlotOps } from "./fileslotops.ts";
import { createToolHost, type BarTools } from "./toolhost.ts";

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
  addTools: (tools: BarTools) => void;
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

interface SlotState {
  id: string;
  last: string;
  legacy: string[];
}

interface ChooseDeps {
  readonly store: DraftStore;
  readonly drafts: ReturnType<typeof createDraftSwitch>;
  readonly labels: ReturnType<typeof createSlotPicker>;
  readonly options: MdToolbarOptions;
  readonly sync: () => void;
}

const regularSlot = (id: string): boolean =>
  !isFileSlot(id) && id !== PROJECT_SLOT;

function dropLegacy(state: SlotState, store: DraftStore): void {
  for (const legacy of state.legacy) store.drop(legacy);
  state.legacy = [];
}

function chooseIn(
  state: SlotState,
  c: ChooseDeps,
  id: string,
  example?: string,
): void {
  const from = pickerValue(state.id);
  if (
    id === state.id &&
    (example === undefined || example === chosenExample(id))
  )
    return;
  c.drafts.leave(from, state.legacy.map(smallDraft));
  dropLegacy(state, c.store);
  state.id = id;
  if (regularSlot(id)) state.last = id;
  saveTemplateId(id);
  if (example !== undefined) saveExampleChoice(id, example);
  const key = pickerValue(id);
  if (key !== from) c.options.onLeave?.(from, key);
  c.drafts.enter(id, key);
  if (c.options.onTemplate) c.options.onTemplate(id, from);
  c.labels.pick(key);
  c.sync();
}

function initialState(): SlotState {
  const id = loadTemplateId();
  saveTemplateId(id);
  return { id, last: regularSlot(id) ? id : PLAIN, legacy: [] };
}

function isActive(options: MdToolbarOptions, state: SlotState): boolean {
  if (options.isTexFile?.()) return false;
  return options.fileName?.() ? options.isMdFile() : !isPlain(state.id);
}

function draftWriters(
  drafts: ReturnType<typeof createDraftSwitch>,
  store: DraftStore,
) {
  return {
    writeDraft(key: string, text: string): void {
      if (key !== drafts.loadingKey()) store.save(key, text);
    },
    writeCaret(key: string, caret: Caret): void {
      if (key !== drafts.loadingKey()) saveCaret(key, caret);
    },
  };
}

function createSlotMenu(
  bar: HTMLElement,
  slots: ReturnType<typeof createSlotList>,
  state: SlotState,
  options: MdToolbarOptions,
  h: {
    readonly sync: () => void;
    readonly select: (value: string) => void;
    readonly close: (id: string) => void;
  },
) {
  const labels = createSlotPicker({
    bar,
    dropdown: () => dropdown,
    slots,
    templateId: () => state.id,
    fileName: () => options.fileName?.() ?? null,
    projectDirty: () => options.projectDirty?.() ?? false,
  });
  const dropdown = createSlotDropdown({
    select: bar.querySelector<HTMLButtonElement>(".md-template")!,
    beforeOpen: () => labels.rebuild(),
    afterClose: h.sync,
    onSelect: h.select,
    canClose: isFileSlot,
    onCloseSlot: h.close,
    onCloseProject: () => options.onCloseProject?.(),
  });
  return { labels, dropdown };
}

function watchSlots(
  slots: ReturnType<typeof createSlotList>,
  rebuild: () => void,
): () => void {
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== KEYS.slots.name) return;
    slots.reload();
    rebuild();
  };
  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function openDraftStore(state: SlotState, onError?: () => void): DraftStore {
  const store = createDraftStore(onError);
  state.legacy = migrateLegacyDrafts(state.id, store);
  migrateSlotDrafts(store);
  return store;
}

export function initMdToolbar(options: MdToolbarOptions): MdToolbar {
  const { editor } = options;

  const mount = options.mount ?? editor.parentElement;
  const bar = createBar(mount);
  const state = initialState();

  const slots = createSlotList(
    () => state.id,
    () => editor.value,
  );

  const { labels, dropdown } = createSlotMenu(bar, slots, state, options, {
    sync: () => syncVisible(),
    select(value) {
      const [slot = "", example] = value.split(":");
      chooseTemplate(slot, example);
      editor.focus();
    },
    close: (id) => closeFile(id),
  });
  const rebuildMenu = labels.rebuild;
  const group = bar.querySelector<HTMLElement>(".md-group")!;
  const picker = bar.querySelector<HTMLElement>(".md-select")!;
  const tools = createToolHost(group, () => syncVisible());
  const topbar = initTopbarFit(mount, bar, tools.anyShown);

  const store = openDraftStore(state, options.onDraftError);
  rebuildMenu();

  const shown = (): boolean => !bar.hidden && !group.hidden;
  const buttons = createButtonState(group, editor, shown);
  const active = (): boolean => isActive(options, state);

  const visibility = createBarVisibility({
    bar,
    group,
    picker,
    editor,
    mount,
    buttons,
    menu: tools.menu(dropdown),
    tools,
    active,
    beforeSync: labels.syncLabel,
    afterSync: () => topbar.sync(),
  });
  const syncVisible = visibility.sync;

  const drafts = createDraftSwitch({
    editor,
    store,
    currentKey: () => pickerValue(state.id),
    onExample: options.onExample,
  });

  const chooseTemplate = (id: string, example?: string): void =>
    chooseIn(
      state,
      { store, drafts, labels, options, sync: syncVisible },
      id,
      example,
    );

  const files = createFileSlotOps({
    editor,
    store,
    slots,
    templateId: () => state.id,
    lastTemplate: () => state.last,
    choose: (id) => chooseTemplate(id),
    rebuild: rebuildMenu,
    onCloseFile: options.onCloseFile,
  });
  const closeFile = files.closeFile;

  visibility.hold();

  const unbindFormatting = bindFormatting({ bar, editor, buttons, active });
  const unwatchSlots = watchSlots(slots, rebuildMenu);
  editor.addEventListener("input", buttons.sync);

  return {
    refresh: syncVisible,
    template: () => state.id,
    slot: () => pickerValue(state.id),
    draft: store.read,
    caret: loadCaret,
    ...draftWriters(drafts, store),
    reset(close: boolean): void {
      store.drop(pickerValue(state.id));
      dropLegacy(state, store);
      visibility.hold();
      if (close && isFileSlot(state.id)) closeFile(state.id, true);
    },
    ...files,
    setProject: labels.setProject,
    addTools: tools.add,
    destroy(): void {
      tools.destroy();
      visibility.destroy();
      unwatchSlots();
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
