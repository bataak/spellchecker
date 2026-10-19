import { applyEdit, enterInsert, insertImage } from "./mdedit.ts";
import { replaceRange, swapText } from "../editortext.ts";
import { splitName } from "../office/filename.ts";
import { freeImagePath, pickImage, putImage } from "../images.ts";
import {
  FILE_LIMIT,
  PROJECT_SLOT,
  isFileSlot,
  nextFileId,
  sameFile,
  textSum,
} from "../slots/fileslots.ts";
import { PLAIN, findTemplate, isPlain } from "../templates.ts";
import { KEYS } from "../store.ts";
import { buildButtons, formatEdit, type Role } from "./mdbuttons.ts";
import { createSlotDropdown } from "../slots/slotdropdown.ts";
import { buildPicker, pickerOptions } from "../slots/slotmenu.ts";
import {
  LARGE_DRAFT,
  chosenExample,
  draftError,
  dropCaret,
  dropDraft,
  loadCaret,
  loadDraft,
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
import { initTopbarFit } from "../topbarfit.ts";
import { createButtonState } from "./mdbuttonstate.ts";

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

const TITLE_HOLD_MS = 3000;

const FOCUS_SETTLE_MS = 150;

export function initMdToolbar(options: MdToolbarOptions): MdToolbar {
  const { editor, isMdFile, isTexFile = () => false } = options;

  const bar = document.createElement("div");
  bar.className = "md-bar";
  bar.hidden = true;
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Хэлбэржүүлэх");
  let templateId = loadTemplateId();
  saveTemplateId(templateId);

  bar.innerHTML =
    buildPicker() + '<span class="md-group">' + buildButtons() + "</span>";

  const mount = options.mount ?? editor.parentElement;
  if (mount) mount.insertBefore(bar, mount.firstChild);

  const select = bar.querySelector<HTMLButtonElement>(".md-template")!;
  const slots = createSlotList(
    () => templateId,
    () => editor.value,
  );

  let lastTemplate =
    isFileSlot(templateId) || templateId === PROJECT_SLOT ? PLAIN : templateId;
  let projectName: string | null = null;

  function rebuildMenu(): void {
    dropdown.render(
      pickerOptions(
        slots.all(),
        slots.dirty,
        projectName === null
          ? null
          : { name: projectName, dirty: options.projectDirty?.() ?? false },
      ),
    );
    setPicked(pickerValue(templateId));
  }
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
  const fileBox = bar.querySelector<HTMLElement>(".md-file")!;
  const fileHead = fileBox.querySelector<HTMLElement>(".md-file-head")!;
  const fileTail = fileBox.querySelector<HTMLElement>(".md-file-tail")!;
  const topbar = initTopbarFit(mount, bar, group);

  onDraftError(options.onDraftError ?? null);
  let legacyPending = migrateLegacyDrafts(templateId);
  migrateSlotDrafts();

  function dropLegacyPending(): void {
    for (const legacy of legacyPending) dropDraft(legacy);
    legacyPending = [];
  }
  let pickedLabel = "";
  let shownFile: string | null | undefined;

  function setPicked(key: string): void {
    pickedLabel = dropdown.pick(key) ?? pickedLabel;
    shownFile = undefined;
    syncLabel();
  }

  function syncLabel(): void {
    const name = options.fileName?.() ?? null;
    if (name === shownFile) return;
    shownFile = name;
    const slot = slots.find(templateId);
    if (slot && name && slot.name !== name) {
      slots.update((list) =>
        list.map((item) => (item.id === slot.id ? { ...item, name } : item)),
      );
      rebuildMenu();
    }
    select.textContent = name ? "Файл" : pickedLabel;
    fileBox.hidden = !name;
    if (!name) return;
    const parts = splitName(name);
    fileHead.textContent = parts.head;
    fileTail.textContent = parts.tail;
    fileBox.title = name;
  }

  rebuildMenu();

  const buttons = createButtonState(
    group,
    editor,
    () => !bar.hidden && !group.hidden,
  );
  const syncActive = (): void => buttons.sync();

  let ready = false;
  let settle: ReturnType<typeof setTimeout> | null = null;
  let readyTimer: ReturnType<typeof setTimeout> | null = null;

  function run(role: Role): void {
    const start = editor.selectionStart;
    if (role === "image")
      void pickImage().then((file) => {
        if (!file) return;
        const src = freeImagePath(file.name, file);
        putImage(src, file);
        applyEdit(
          editor,
          insertImage(editor.value, Math.min(start, editor.value.length), src),
        );
        syncActive();
      });
    else
      applyEdit(
        editor,
        formatEdit(role, editor.value, start, editor.selectionEnd, new Date()),
      );

    buttons.reset();
    syncActive();
  }

  function active(): boolean {
    if (isTexFile()) return false;
    return options.fileName?.() ? isMdFile() : !isPlain(templateId);
  }

  function syncVisible(): void {
    if (settle) {
      clearTimeout(settle);
      settle = null;
    }
    const focus = document.activeElement;
    const focused =
      focus === editor ||
      (focus !== null && (bar.contains(focus) || dropdown.contains(focus)));
    const on = active();
    const show = (ready && focused) || dropdown.isOpen();
    syncLabel();

    picker.classList.toggle("is-plain", !on);
    editor.parentElement?.classList.toggle("is-markdown", on);

    if (group.hidden !== !on) {
      group.hidden = !on;
      buttons.reset();
    }

    if (bar.hidden !== !show) {
      bar.hidden = !show;
      mount?.classList.toggle("has-mdbar", show);
      buttons.reset();
    }

    topbar.sync();
    syncActive();
  }

  function holdTitle(): void {
    if (readyTimer) clearTimeout(readyTimer);
    ready = false;
    syncVisible();
    readyTimer = setTimeout(() => {
      readyTimer = null;
      ready = true;
      syncVisible();
    }, TITLE_HOLD_MS);
  }

  let switchSeq = 0;
  let loadingKey: string | null = null;

  function resetText(text: string, start: number, end: number): void {
    swapText(editor, text, { origin: "slot", start, end });
  }

  function showDraft(id: string, key: string, stored: string | null): void {
    const text = stored ?? findTemplate(id)?.skeleton ?? "";
    const caret = stored === null ? null : loadCaret(key);
    const start = Math.min(caret?.start ?? text.length, text.length);
    const end = Math.min(caret?.end ?? text.length, text.length);

    resetText(text, start, end);
    if (caret !== null) {
      editor.scrollTop = caret.scroll;
      requestAnimationFrame(() => {
        if (pickerValue(templateId) === key) editor.scrollTop = caret.scroll;
      });
    }
    const first = chosenExample(id);
    if (stored === null && first) void loadDefault(key, first);
  }

  function chooseTemplate(id: string, example?: string): void {
    const from = pickerValue(templateId);
    if (
      id === templateId &&
      (example === undefined || example === chosenExample(id))
    )
      return;

    const parts = [editor.value, ...legacyPending.map(smallDraft)].filter(
      (part): part is string => part !== null && part.trim() !== "",
    );
    if (from !== loadingKey) saveDraft(from, parts.join("\n\n"));
    saveCaret(from, {
      start: editor.selectionStart,
      end: editor.selectionEnd,
      scroll: editor.scrollTop,
    });
    dropLegacyPending();
    templateId = id;
    if (!isFileSlot(id) && id !== PROJECT_SLOT) lastTemplate = id;
    saveTemplateId(id);
    if (example !== undefined) saveExampleChoice(id, example);

    const key = pickerValue(id);
    if (key !== from) options.onLeave?.(from, key);
    const seq = ++switchSeq;
    if (loadDraft(key) === LARGE_DRAFT) {
      loadingKey = key;
      void readDraft(key).then((stored) => {
        if (seq !== switchSeq) return;
        if (stored === null) draftError();
        else loadingKey = null;
        showDraft(id, key, stored);
      });
    } else {
      loadingKey = null;
      showDraft(id, key, loadDraft(key));
    }

    if (options.onTemplate) options.onTemplate(id, from);
    setPicked(key);
    syncVisible();
  }

  function openFile(name: string, hash?: string): boolean {
    const current = slots.stored();
    if (current.length >= FILE_LIMIT) return false;
    const id = nextFileId(current);
    slots.update((list) => [
      ...list,
      { id, name, sum: null, ...(hash ? { hash } : {}) },
    ]);
    rebuildMenu();
    chooseTemplate(id);
    return true;
  }

  function closeFile(id: string, force = false): void {
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
    if (templateId === id) {
      const others = slots.all().filter((item) => item.id !== id);
      chooseTemplate(others.at(-1)?.id ?? lastTemplate);
    }
    slots.update((list) => list.filter((item) => item.id !== id));
    dropDraft(id);
    dropCaret(id);
    options.onCloseFile?.(id);
    rebuildMenu();
  }

  function setProject(name: string | null): void {
    if (name === projectName) return;
    projectName = name;
    rebuildMenu();
  }

  function enterProject(): void {
    if (templateId !== PROJECT_SLOT) chooseTemplate(PROJECT_SLOT);
  }

  function leaveProject(): void {
    if (templateId === PROJECT_SLOT) {
      const target = slots.all().at(-1)?.id ?? lastTemplate;
      chooseTemplate(target);
    }
    dropDraft(PROJECT_SLOT);
    dropCaret(PROJECT_SLOT);
    options.onCloseFile?.(PROJECT_SLOT);
  }

  function markSaved(written = false): void {
    if (!isFileSlot(templateId)) return;
    const sum = textSum(editor.value);
    slots.update((list) =>
      list.map((item) => {
        if (item.id !== templateId) return item;
        if (!written) return { ...item, sum };
        const { hash: _opened, ...rest } = item;
        return { ...rest, sum };
      }),
    );
  }

  async function loadDefault(key: string, example: string): Promise<void> {
    const { exampleText } = await import("../examples.ts");
    const text = exampleText(example);
    if (
      text === undefined ||
      pickerValue(templateId) !== key ||
      editor.value.trim()
    )
      return;
    resetText(text, 0, 0);
    editor.scrollTop = 0;
    options.onExample?.();
  }

  const onFocus = (): void => {
    if (settle) clearTimeout(settle);
    settle = setTimeout(() => {
      settle = null;
      syncVisible();
    }, FOCUS_SETTLE_MS);
  };
  const onSelectionChange = (): void => {
    if (!bar.hidden && document.activeElement === editor) syncActive();
  };

  const onPointerDown = (event: Event): void => {
    const target = event.target as HTMLElement | null;
    if (target?.closest(".md-btn")) event.preventDefault();
  };

  const onClick = (event: Event): void => {
    const button = (
      event.target as HTMLElement | null
    )?.closest<HTMLButtonElement>(".md-btn");
    const role = button?.dataset.role as Role | undefined;
    if (role) run(role);
  };

  const onSelect = (value: string): void => {
    const [slot = "", example] = value.split(":");
    if (example !== undefined) {
      chooseTemplate(slot, example);
      editor.focus();
      return;
    }
    chooseTemplate(value);
    editor.focus();
  };

  const onBeforeInput = (event: InputEvent): void => {
    if (
      event.inputType !== "insertLineBreak" &&
      event.inputType !== "insertParagraph"
    )
      return;
    if (!active()) return;

    const insert = enterInsert(editor.value, editor.selectionStart);
    if (insert === "\n") return;

    event.preventDefault();
    if (
      !replaceRange(editor, editor.selectionStart, editor.selectionEnd, insert)
    )
      editor.dispatchEvent(new Event("input", { bubbles: true }));
  };

  holdTitle();

  bar.addEventListener("mousedown", onPointerDown);
  bar.addEventListener("click", onClick);
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== KEYS.slots.name) return;
    slots.reload();
    rebuildMenu();
  };
  window.addEventListener("storage", onStorage);
  editor.addEventListener("beforeinput", onBeforeInput);
  editor.addEventListener("input", syncActive);
  document.addEventListener("focusin", onFocus);
  document.addEventListener("focusout", onFocus);
  document.addEventListener("selectionchange", onSelectionChange);

  return {
    refresh: syncVisible,
    template: () => templateId,
    slot: () => pickerValue(templateId),
    draft: readDraft,
    caret: loadCaret,
    writeDraft(key: string, text: string): void {
      if (key !== loadingKey) saveDraft(key, text);
    },
    writeCaret(key: string, caret: Caret): void {
      if (key !== loadingKey) saveCaret(key, caret);
    },
    reset(close: boolean): void {
      dropDraft(pickerValue(templateId));
      dropLegacyPending();
      holdTitle();
      if (close && isFileSlot(templateId)) closeFile(templateId, true);
    },
    openFile,
    findFile: (name, hash, text) =>
      slots.all().find((slot) => sameFile(slot, name, hash, text))?.id ?? null,
    showFile: (id) => {
      if (slots.find(id)) chooseTemplate(id);
    },
    fileDirty: (id) => {
      const slot = slots.find(id);
      return slot ? slots.dirty(slot) : false;
    },
    closeFile,
    fileSlots: () =>
      slots.all().map((slot) => ({
        id: slot.id,
        name: slot.name,
        text: slots.text(slot),
      })),
    setProject,
    enterProject,
    leaveProject,
    markSaved,
    destroy(): void {
      if (readyTimer) clearTimeout(readyTimer);
      if (settle) clearTimeout(settle);
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("focusout", onFocus);
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("storage", onStorage);
      dropdown.destroy();
      topbar.destroy();
      editor.removeEventListener("beforeinput", onBeforeInput);
      editor.removeEventListener("input", syncActive);
      mount?.classList.remove("has-mdbar");
      editor.parentElement?.classList.remove("is-markdown");
      bar.remove();
    },
  };
}
