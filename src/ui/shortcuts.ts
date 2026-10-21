import type { CommandId, Commands } from "./commands.ts";
import { lineSelection, type LineDirection } from "../editor/lineselect.ts";

type Action = (e: KeyboardEvent) => void;

interface Binding {
  readonly alt?: boolean;
  readonly shift: boolean;
  readonly anywhere?: boolean;
  readonly match: (e: KeyboardEvent) => boolean;
  readonly run: Action;
}

export interface Platform {
  readonly desktop: boolean;
  readonly mac: boolean;
}

export interface ShortcutDeps {
  readonly editor: HTMLTextAreaElement;
  readonly commands: Commands;
  readonly wipe: () => void;
  readonly openDictMenu: () => void;
  readonly lastCaret: () => { start: number; end: number } | null;
  readonly platform?: Platform;
  readonly target?: EventTarget;
}

const letter =
  (l: string) =>
  (e: KeyboardEvent): boolean =>
    e.key.toLowerCase() === l || e.code === "Key" + l.toUpperCase();

const anyOf =
  (keys: readonly string[], code?: string) =>
  (e: KeyboardEvent): boolean =>
    keys.includes(e.key) || (code !== undefined && e.code === code);

export function detectPlatform(): Platform {
  const desktop =
    !!window.matchMedia && window.matchMedia("(pointer: fine)").matches;
  const uaPlat = navigator.userAgentData?.platform || "";
  const mac =
    /mac/i.test(uaPlat) ||
    /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "") ||
    (/Mac OS X/i.test(navigator.userAgent || "") &&
      !/Windows|Android/i.test(navigator.userAgent || ""));
  return { desktop, mac };
}

function hints(mac: boolean): readonly [CommandId, string][] {
  const mod = mac ? "⌘" : "Ctrl+";
  const shift = mac ? "⇧" : "Shift+";
  const alt = mac ? "⌥" : "Alt+";
  return [
    [
      "clear",
      mod +
        shift +
        "⌫\nShift товчтой хамт эсвэл удаан дарвал бүх өгөгдөл устана · " +
        mod +
        shift +
        alt +
        "⌫",
    ],
    ["paste", mod + "V"],
    ["copy", mod + "C" + "\nУдаан дарж алдаатай үгсийг хуулна · " + mod + "E"],
    ["copyErrors", mod + "E"],
    ["open", mod + "O"],
    [
      "save",
      mod +
        "S" +
        "\n" +
        (mac ? "⇧" : "Shift") +
        "-тэй эсвэл удаан дарж өргөтгөл сонгоно",
    ],
    ["print", mod + "P"],
    ["fontDec", mod + "-"],
    ["fontInc", mod + "+"],
    ["fontReset", mod + "0"],
    ["theme", mod + shift + "D"],
    [
      "define",
      mod + shift + "Space" + "\nТоль нэмэх · " + mod + shift + alt + "Space",
    ],
  ];
}

function otherField(editor: HTMLTextAreaElement): boolean {
  const ae = document.activeElement;
  return (
    !!ae &&
    ae !== editor &&
    (ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")
  );
}

function actions(deps: ShortcutDeps) {
  const { editor, commands } = deps;
  const openFile: Action = (e) => {
    e.preventDefault();
    commands.click(window.showOpenFilePicker ? "pick" : "openFile");
    commands.flash("open");
  };
  const paste: Action = () => {
    if (document.activeElement !== editor) {
      editor.focus({ preventScroll: true });
      const lastCaret = deps.lastCaret();
      if (lastCaret) {
        editor.setSelectionRange(lastCaret.start, lastCaret.end, "forward");
      }
    }
    commands.flash("paste");
  };
  const copy: Action = (e) => {
    const pageSel = window.getSelection?.()?.toString() ?? "";
    const editorHasSelection =
      document.activeElement === editor &&
      editor.selectionStart !== editor.selectionEnd;
    if (pageSel || editorHasSelection) {
      commands.flash("copy");
      return;
    }
    e.preventDefault();
    commands.run("copy");
  };
  const selectLines =
    (direction: LineDirection): Action =>
    (e) => {
      if (document.activeElement !== editor) return;
      e.preventDefault();
      const [start, end] = lineSelection(
        editor.value,
        editor.selectionStart,
        editor.selectionEnd,
        direction,
      );
      editor.setSelectionRange(
        start,
        end,
        direction === "up" ? "backward" : "forward",
      );
    };
  return { openFile, paste, copy, selectLines };
}

export function initShortcuts(deps: ShortcutDeps): void {
  const { editor, commands } = deps;
  const { desktop, mac } = deps.platform ?? detectPlatform();
  if (!desktop) return;

  for (const [id, combo] of hints(mac)) commands.hint(id, combo);

  const press =
    (id: CommandId): Action =>
    (e) => {
      e.preventDefault();
      commands.run(id);
    };

  const inOtherField = (): boolean => otherField(editor);
  const { openFile, paste, copy, selectLines } = actions(deps);

  const bindings: readonly Binding[] = [
    { shift: true, match: anyOf(["<"], "Comma"), run: selectLines("up") },
    { shift: true, match: anyOf([">"], "Period"), run: selectLines("down") },
    {
      alt: true,
      shift: true,
      anywhere: true,
      match: anyOf(["Backspace"]),
      run: (e) => {
        e.preventDefault();
        commands.flash("clear");
        deps.wipe();
      },
    },
    {
      shift: false,
      anywhere: true,
      match: letter("s"),
      run: (e) => {
        e.preventDefault();
        if (!inOtherField()) commands.run("save");
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
    { shift: true, match: letter("d"), run: press("theme") },
    { shift: true, match: anyOf(["Backspace"]), run: press("clear") },
    { shift: true, match: anyOf(["+"], "Equal"), run: press("fontInc") },
    {
      shift: false,
      match: anyOf(["-", "Subtract"], "Minus"),
      run: press("fontDec"),
    },
    {
      shift: false,
      match: anyOf(["+", "=", "Add"], "Equal"),
      run: press("fontInc"),
    },
    {
      shift: false,
      match: anyOf(["0", "Numpad0"], "Digit0"),
      run: press("fontReset"),
    },
    { shift: false, match: letter("o"), run: openFile },
    { shift: false, match: letter("e"), run: press("copyErrors") },
    { shift: false, match: letter("v"), run: paste },
    {
      shift: false,
      match: (e) => letter("c")(e) || e.key.toLowerCase() === "ё",
      run: copy,
    },
  ];

  (deps.target ?? window).addEventListener("keydown", (event) => {
    const e = event as KeyboardEvent;
    const primary = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
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
