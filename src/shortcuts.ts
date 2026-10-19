import { confirmWipe } from "./wipe.ts";

type Action = (e: KeyboardEvent) => void;

interface Binding {
  readonly alt?: boolean;
  readonly shift: boolean;
  readonly anywhere?: boolean;
  readonly match: (e: KeyboardEvent) => boolean;
  readonly run: Action;
}

const letter =
  (l: string) =>
  (e: KeyboardEvent): boolean =>
    e.key.toLowerCase() === l || e.code === "Key" + l.toUpperCase();

const anyOf =
  (keys: readonly string[], code?: string) =>
  (e: KeyboardEvent): boolean =>
    keys.includes(e.key) || (code !== undefined && e.code === code);

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
    [
      "#clearBtn",
      mod +
        shiftSym +
        "⌫\nShift товчтой хамт эсвэл удаан дарвал бүх өгөгдөл устана · " +
        mod +
        shiftSym +
        altSym +
        "⌫",
    ],
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

  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  function trigger(sel: string, doClick = true): void {
    const btn = document.querySelector<HTMLButtonElement>(sel);
    if (!btn || btn.disabled) return;
    if (doClick) btn.click();
    btn.classList.add("kbd-active");
    clearTimeout(timers.get(btn));
    timers.set(
      btn,
      setTimeout(() => btn.classList.remove("kbd-active"), 260),
    );
  }

  const press =
    (sel: string): Action =>
    (e) => {
      e.preventDefault();
      trigger(sel);
    };

  const inOtherField = (): boolean => {
    const ae = document.activeElement;
    return (
      !!ae &&
      ae !== editor &&
      (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")
    );
  };

  const openFile: Action = (e) => {
    e.preventDefault();
    if (window.showOpenFilePicker) {
      trigger("#openBtn");
      return;
    }
    document.querySelector<HTMLInputElement>("#openFile")?.click();
    trigger("#openBtn", false);
  };

  const paste: Action = () => {
    if (document.activeElement !== editor) {
      editor.focus({ preventScroll: true });
      const lastCaret = deps.lastCaret();
      if (lastCaret) {
        editor.setSelectionRange(lastCaret.start, lastCaret.end, "forward");
      }
    }
    trigger("#pasteBtn", false);
  };

  const copy: Action = (e) => {
    const pageSel = window.getSelection?.()?.toString() ?? "";
    const editorHasSelection =
      document.activeElement === editor &&
      editor.selectionStart !== editor.selectionEnd;
    if (pageSel || editorHasSelection) {
      trigger("#copyBtn", false);
      return;
    }
    e.preventDefault();
    trigger("#copyBtn");
  };

  const bindings: readonly Binding[] = [
    {
      alt: true,
      shift: true,
      anywhere: true,
      match: anyOf(["Backspace"]),
      run: (e) => {
        e.preventDefault();
        trigger("#clearBtn", false);
        confirmWipe();
      },
    },
    {
      shift: false,
      anywhere: true,
      match: letter("s"),
      run: (e) => {
        e.preventDefault();
        if (!inOtherField()) trigger("#saveBtn");
      },
    },
    {
      shift: true,
      match: letter("l"),
      run: (e) => {
        e.preventDefault();
        deps.openDictMenu();
      },
    },
    { shift: true, match: letter("d"), run: press("#themeBtn") },
    { shift: true, match: anyOf(["Backspace"]), run: press("#clearBtn") },
    { shift: true, match: anyOf(["+"], "Equal"), run: press("#fontIncBtn") },
    {
      shift: false,
      match: anyOf(["-", "Subtract"], "Minus"),
      run: press("#fontDecBtn"),
    },
    {
      shift: false,
      match: anyOf(["+", "=", "Add"], "Equal"),
      run: press("#fontIncBtn"),
    },
    {
      shift: false,
      match: anyOf(["0", "Numpad0"], "Digit0"),
      run: press("#fontResetBtn"),
    },
    { shift: false, match: letter("o"), run: openFile },
    { shift: false, match: letter("e"), run: press("#copyErrorsBtn") },
    { shift: false, match: letter("v"), run: paste },
    {
      shift: false,
      match: (e) => letter("c")(e) || e.key.toLowerCase() === "ё",
      run: copy,
    },
  ];

  window.addEventListener("keydown", (e) => {
    const primary = isMac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (!primary) return;
    const binding = bindings.find(
      (b) =>
        (b.alt ?? false) === e.altKey && b.shift === e.shiftKey && b.match(e),
    );
    if (!binding) return;
    if (!binding.anywhere && inOtherField()) return;
    binding.run(e);
  });
}
