import {
  alignAt,
  applyEdit,
  enterInsert,
  headingDepthAt,
  insertImage,
} from "./mdedit.ts";
import { replaceRange, swapText } from "./editortext.ts";
import { splitName } from "./office/filename.ts";
import { freeImagePath, pickImage, putImage } from "./images.ts";
import {
  FILE_LIMIT,
  PROJECT_SLOT,
  isFileSlot,
  loadSlots,
  nextFileId,
  sameFile,
  saveSlots,
  textSum,
  type FileSlot,
} from "./fileslots.ts";
import type { AlignKind } from "./mdedit.ts";
import { PLAIN, findTemplate, isPlain } from "./templates.ts";
import { KEYS } from "./store.ts";
import {
  ALIGN_ROLE,
  HEADING_DEPTH,
  buildButtons,
  formatEdit,
  type Role,
} from "./mdbuttons.ts";
import { buildPicker, pickerOptions } from "./slotmenu.ts";
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
} from "./slotstore.ts";
import { initTopbarFit } from "./topbarfit.ts";

export { sharedSlot, type Caret } from "./slotstore.ts";

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
  const menu = document.createElement("div");
  menu.className = "md-menu";
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Баримтын загвар");
  menu.hidden = true;
  let files = loadSlots();

  function storedFiles(): FileSlot[] {
    const stored = loadSlots();
    const own = files.find((item) => item.id === templateId);
    return own && !stored.some((item) => item.id === own.id)
      ? [...stored, own]
      : stored;
  }

  function updateFiles(change: (list: FileSlot[]) => FileSlot[]): void {
    files = change(storedFiles());
    saveSlots(files);
  }
  let lastTemplate =
    isFileSlot(templateId) || templateId === PROJECT_SLOT ? PLAIN : templateId;
  let projectName: string | null = null;
  let items: HTMLButtonElement[] = [];
  document.body.append(menu);

  function slotText(slot: FileSlot): string | null {
    if (slot.id === templateId) return editor.value;
    const text = loadDraft(slot.id);
    return text === LARGE_DRAFT ? null : (text ?? "");
  }

  function isDirty(slot: FileSlot): boolean {
    if (slot.sum === null) return false;
    const text = slotText(slot);
    return text === null || textSum(text) !== slot.sum;
  }

  function rebuildMenu(): void {
    menu.innerHTML = pickerOptions(
      files,
      isDirty,
      projectName === null
        ? null
        : { name: projectName, dirty: options.projectDirty?.() ?? false },
    );
    items = [...menu.querySelectorAll<HTMLButtonElement>(".md-menu-item")];
    setPicked(pickerValue(templateId));
  }
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
    for (const item of items) {
      const on = item.dataset.value === key;
      item.setAttribute("aria-checked", String(on));
      if (on) pickedLabel = item.textContent ?? "";
    }
    shownFile = undefined;
    syncLabel();
  }

  function syncLabel(): void {
    const name = options.fileName?.() ?? null;
    if (name === shownFile) return;
    shownFile = name;
    const slot = files.find((item) => item.id === templateId);
    if (slot && name && slot.name !== name) {
      updateFiles((list) =>
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

  function placeMenu(): void {
    const rect = select.getBoundingClientRect();
    const view = window.visualViewport;
    const bottom = view ? view.offsetTop + view.height : window.innerHeight;
    const right = document.documentElement.clientWidth;
    menu.style.top = rect.bottom + 4 + "px";
    menu.style.maxHeight = Math.max(120, bottom - rect.bottom - 12) + "px";
    menu.style.minWidth = rect.width + "px";
    menu.style.left =
      Math.max(8, Math.min(rect.left, right - menu.offsetWidth - 8)) + "px";
  }

  function closeMenu(refocus: boolean): void {
    if (menu.hidden) return;
    menu.hidden = true;
    select.setAttribute("aria-expanded", "false");
    if (refocus) select.focus();
    syncVisible();
  }

  function openMenu(): void {
    rebuildMenu();
    menu.hidden = false;
    select.setAttribute("aria-expanded", "true");
    placeMenu();
    const checked =
      items.find((item) => item.getAttribute("aria-checked") === "true") ??
      items[0];
    checked?.focus({ preventScroll: true });
    checked?.scrollIntoView({ block: "nearest" });
  }

  rebuildMenu();

  const headingButtons: [HTMLButtonElement, number][] = [];
  for (const button of group.querySelectorAll<HTMLButtonElement>(".md-btn")) {
    const want = HEADING_DEPTH[button.dataset.role as Role];
    if (want !== undefined) headingButtons.push([button, want]);
  }

  const alignButtons: [HTMLButtonElement, AlignKind][] = [];
  for (const button of group.querySelectorAll<HTMLButtonElement>(".md-btn")) {
    const kind = ALIGN_ROLE[button.dataset.role as Role];
    if (kind !== undefined) alignButtons.push([button, kind]);
  }

  let lastState = "";
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

    lastState = "";
    syncActive();
  }

  function active(): boolean {
    if (isTexFile()) return false;
    return options.fileName?.() ? isMdFile() : !isPlain(templateId);
  }

  function syncActive(): void {
    if (bar.hidden || group.hidden) return;
    const depth = headingDepthAt(editor.value, editor.selectionStart);
    const align = alignAt(editor.value, editor.selectionStart);
    const state = String(depth) + ":" + String(align);
    if (state === lastState) return;
    lastState = state;
    for (const [button, want] of headingButtons)
      button.classList.toggle("is-on", want === depth);
    for (const [button, kind] of alignButtons)
      button.classList.toggle("is-on", kind === align);
  }

  function syncVisible(): void {
    if (settle) {
      clearTimeout(settle);
      settle = null;
    }
    const focus = document.activeElement;
    const focused =
      focus === editor ||
      (focus !== null && (bar.contains(focus) || menu.contains(focus)));
    const on = active();
    const show = (ready && focused) || !menu.hidden;
    syncLabel();

    picker.classList.toggle("is-plain", !on);
    editor.parentElement?.classList.toggle("is-markdown", on);

    if (group.hidden !== !on) {
      group.hidden = !on;
      lastState = "";
    }

    if (bar.hidden !== !show) {
      bar.hidden = !show;
      mount?.classList.toggle("has-mdbar", show);
      lastState = "";
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
    const current = storedFiles();
    if (current.length >= FILE_LIMIT) return false;
    const id = nextFileId(current);
    updateFiles((list) => [
      ...list,
      { id, name, sum: null, ...(hash ? { hash } : {}) },
    ]);
    rebuildMenu();
    chooseTemplate(id);
    return true;
  }

  function closeFile(id: string, force = false): void {
    const slot = files.find((item) => item.id === id);
    if (!slot) return;
    if (
      !force &&
      isDirty(slot) &&
      !window.confirm(
        "«" + slot.name + "» хадгалагдаагүй байна. Файлыг хаах уу?",
      )
    )
      return;
    if (templateId === id) {
      const others = files.filter((item) => item.id !== id);
      chooseTemplate(others.at(-1)?.id ?? lastTemplate);
    }
    updateFiles((list) => list.filter((item) => item.id !== id));
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
      const target = files.at(-1)?.id ?? lastTemplate;
      chooseTemplate(target);
    }
    dropDraft(PROJECT_SLOT);
    dropCaret(PROJECT_SLOT);
    options.onCloseFile?.(PROJECT_SLOT);
  }

  function markSaved(written = false): void {
    if (!isFileSlot(templateId)) return;
    const sum = textSum(editor.value);
    updateFiles((list) =>
      list.map((item) => {
        if (item.id !== templateId) return item;
        if (!written) return { ...item, sum };
        const { hash: _opened, ...rest } = item;
        return { ...rest, sum };
      }),
    );
  }

  async function loadDefault(key: string, example: string): Promise<void> {
    const { exampleText } = await import("./examples.ts");
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
    closeMenu(false);
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
  select.addEventListener("click", () => {
    if (menu.hidden) openMenu();
    else closeMenu(true);
  });
  menu.addEventListener("click", (event) => {
    const target = event.target as HTMLElement | null;
    const close = target?.closest<HTMLElement>(".md-menu-close");
    if (close?.dataset.close === PROJECT_SLOT) {
      closeMenu(false);
      options.onCloseProject?.();
      return;
    }
    if (close?.dataset.close) {
      closeFile(close.dataset.close);
      if (!menu.hidden) {
        placeMenu();
        items[0]?.focus({ preventScroll: true });
      }
      return;
    }
    const item = target?.closest<HTMLElement>(".md-menu-item");
    if (item?.dataset.value !== undefined) onSelect(item.dataset.value);
  });
  menu.addEventListener("keydown", (event) => {
    const at = items.indexOf(document.activeElement as HTMLButtonElement);
    let next = -1;
    if (event.key === "ArrowDown") next = (at + 1) % items.length;
    else if (event.key === "ArrowUp")
      next = (at - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else if (event.key === "Delete") {
      const id = items[at]?.dataset.value;
      if (id && isFileSlot(id)) {
        event.preventDefault();
        closeFile(id);
        items[Math.min(at, items.length - 1)]?.focus();
      }
      return;
    } else if (event.key === "Escape" || event.key === "Tab") {
      event.preventDefault();
      closeMenu(true);
      return;
    }
    if (next < 0) return;
    event.preventDefault();
    items[next]?.focus();
  });
  const onMenuPointer = (event: Event): void => {
    const target = event.target as Node;
    if (!menu.contains(target) && !select.contains(target)) closeMenu(false);
  };
  const onMenuViewport = (event: Event): void => {
    if (menu.hidden) return;
    if (event.target instanceof Node && menu.contains(event.target)) return;
    placeMenu();
  };
  document.addEventListener("pointerdown", onMenuPointer);
  window.addEventListener("resize", onMenuViewport);
  window.addEventListener("scroll", onMenuViewport, true);
  window.visualViewport?.addEventListener("resize", onMenuViewport);
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== null && event.key !== KEYS.slots.name) return;
    files = storedFiles();
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
      files.find((slot) => sameFile(slot, name, hash, text))?.id ?? null,
    showFile: (id) => {
      if (files.some((slot) => slot.id === id)) chooseTemplate(id);
    },
    fileDirty: (id) => {
      const slot = files.find((item) => item.id === id);
      return slot ? isDirty(slot) : false;
    },
    closeFile,
    fileSlots: () =>
      files.map((slot) => ({
        id: slot.id,
        name: slot.name,
        text: slotText(slot),
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
      document.removeEventListener("pointerdown", onMenuPointer);
      window.removeEventListener("resize", onMenuViewport);
      window.removeEventListener("scroll", onMenuViewport, true);
      window.visualViewport?.removeEventListener("resize", onMenuViewport);
      menu.remove();
      topbar.destroy();
      editor.removeEventListener("beforeinput", onBeforeInput);
      editor.removeEventListener("input", syncActive);
      mount?.classList.remove("has-mdbar");
      editor.parentElement?.classList.remove("is-markdown");
      bar.remove();
    },
  };
}
