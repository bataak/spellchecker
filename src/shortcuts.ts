export interface ShortcutDeps {
  readonly editor: HTMLTextAreaElement;
  readonly openDictMenu: () => void;
  readonly lastCaret: () => { start: number; end: number } | null;
}

export function initShortcuts(deps: ShortcutDeps): void {
  const { editor } = deps;
  const isDesktop =
    window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  if (!isDesktop) return;

  const uaData = navigator.userAgentData;
  const uaPlat = (uaData && uaData.platform) || "";
  const isMac =
    /mac/i.test(uaPlat) ||
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "") ||
    (/Mac OS X/i.test(navigator.userAgent || "") &&
      !/Windows|Android/i.test(navigator.userAgent || ""));
  const mod = isMac ? "⌘" : "Ctrl+";
  const shiftSym = isMac ? "⇧" : "Shift+";
  const altSym = isMac ? "⌥" : "Alt+";

  [
    ["#clearBtn", mod + shiftSym + "⌫"],
    ["#pasteBtn", mod + "V"],
    [
      "#copyBtn",
      mod + "C" + "\nУдаан дарж алдаатай үгсийг хуулна · " + mod + "E",
    ],
    ["#copyErrorsBtn", mod + "E"],
    ["#openBtn", mod + "O"],
    [
      "#saveBtn",
      mod +
        "S" +
        "\n" +
        (isMac ? "⇧" : "Shift") +
        "-тэй эсвэл удаан дарж өргөтгөл сонгоно",
    ],
    ["#printBtn", mod + "P"],
    ["#fontDecBtn", mod + "-"],
    ["#fontIncBtn", mod + "+"],
    ["#fontResetBtn", mod + "0"],
    ["#themeBtn", mod + shiftSym + "D"],
    [
      "#defineBtn",
      mod +
        shiftSym +
        "Space" +
        "\nТоль нэмэх · " +
        mod +
        shiftSym +
        altSym +
        "Space",
    ],
  ].forEach(([sel, combo]) => {
    const btn = document.querySelector(sel);
    if (!btn) return;
    const base = btn.getAttribute("title") || "";
    btn.setAttribute("title", base ? base + " · " + combo : combo);
  });

  function trigger(sel: string, doClick = true): void {
    const btn = document.querySelector<HTMLButtonElement>(sel);
    if (!btn || btn.disabled) return;
    if (doClick) btn.click();
    btn.classList.add("kbd-active");
    const kbdBtn = btn as HTMLButtonElement & {
      _kbdTimer?: ReturnType<typeof setTimeout>;
    };
    if (kbdBtn._kbdTimer) clearTimeout(kbdBtn._kbdTimer);
    kbdBtn._kbdTimer = setTimeout(
      () => btn.classList.remove("kbd-active"),
      260,
    );
  }

  window.addEventListener("keydown", (e) => {
    const hasPrimaryModifier = isMac
      ? e.metaKey && !e.ctrlKey
      : e.ctrlKey && !e.metaKey;
    if (!hasPrimaryModifier || e.altKey) return;

    const key = e.key;
    const lowerKey = key.toLowerCase();
    const isLetter = (letter: string): boolean =>
      lowerKey === letter || e.code === "Key" + letter.toUpperCase();

    const ae = document.activeElement;
    const inOtherField =
      !!ae &&
      ae !== editor &&
      (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA");

    if (isLetter("s") && !e.shiftKey) {
      e.preventDefault();
      if (!inOtherField) trigger("#saveBtn");
      return;
    }

    if (inOtherField) return;

    if (e.shiftKey) {
      if (isLetter("l")) {
        e.preventDefault();
        deps.openDictMenu();
        return;
      }
      if (isLetter("d")) {
        e.preventDefault();
        trigger("#themeBtn");
        return;
      }
      if (key === "Backspace") {
        e.preventDefault();
        trigger("#clearBtn");
        return;
      }
      if (key === "+" || e.code === "Equal") {
        e.preventDefault();
        trigger("#fontIncBtn");
        return;
      }
      return;
    }

    if (key === "-" || key === "Subtract" || e.code === "Minus") {
      e.preventDefault();
      trigger("#fontDecBtn");
      return;
    }
    if (key === "+" || key === "=" || key === "Add" || e.code === "Equal") {
      e.preventDefault();
      trigger("#fontIncBtn");
      return;
    }
    if (key === "0" || key === "Numpad0" || e.code === "Digit0") {
      e.preventDefault();
      trigger("#fontResetBtn");
      return;
    }

    if (isLetter("o")) {
      if (!window.showOpenFilePicker) {
        const openFileEl =
          document.querySelector<HTMLInputElement>("#openFile");
        if (openFileEl) openFileEl.click();
        e.preventDefault();
        trigger("#openBtn", false);
      } else {
        e.preventDefault();
        trigger("#openBtn");
      }
    } else if (isLetter("e")) {
      e.preventDefault();
      trigger("#copyErrorsBtn");
    } else if (isLetter("v")) {
      if (document.activeElement !== editor) {
        editor.focus({ preventScroll: true });
        const lastCaret = deps.lastCaret();
        if (lastCaret) {
          try {
            editor.setSelectionRange(lastCaret.start, lastCaret.end, "forward");
          } catch (_) {}
        }
      }
      trigger("#pasteBtn", false);
    } else if (lowerKey === "c") {
      const pageSel = window.getSelection
        ? (window.getSelection()?.toString() ?? "")
        : "";
      const editorFocused = document.activeElement === editor;
      const editorHasSelection =
        editorFocused && editor.selectionStart !== editor.selectionEnd;
      if (!pageSel && !editorHasSelection) {
        e.preventDefault();
        trigger("#copyBtn");
      }
    }
  });
}
