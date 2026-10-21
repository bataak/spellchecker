export type CommandId =
  | "clear"
  | "paste"
  | "copy"
  | "copyErrors"
  | "open"
  | "openFile"
  | "pick"
  | "save"
  | "print"
  | "fontDec"
  | "fontInc"
  | "fontReset"
  | "theme"
  | "define";

const BUTTONS: Readonly<Record<CommandId, string>> = {
  clear: "#clearBtn",
  paste: "#pasteBtn",
  copy: "#copyBtn",
  copyErrors: "#copyErrorsBtn",
  open: "#openBtn",
  openFile: "#openFile",
  pick: "#pickBtn",
  save: "#saveBtn",
  print: "#printBtn",
  fontDec: "#fontDecBtn",
  fontInc: "#fontIncBtn",
  fontReset: "#fontResetBtn",
  theme: "#themeBtn",
  define: "#defineBtn",
};

const FEEDBACK_MS = 260;

export interface Commands {
  readonly run: (id: CommandId) => void;
  readonly click: (id: CommandId) => void;
  readonly flash: (id: CommandId) => void;
  readonly hint: (id: CommandId, combo: string) => void;
}

export function createButtonCommands(root: ParentNode = document): Commands {
  const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();
  const button = (id: CommandId): HTMLButtonElement | null =>
    root.querySelector<HTMLButtonElement>(BUTTONS[id]);

  const mark = (btn: HTMLButtonElement): void => {
    btn.classList.add("kbd-active");
    clearTimeout(timers.get(btn));
    timers.set(
      btn,
      setTimeout(() => btn.classList.remove("kbd-active"), FEEDBACK_MS),
    );
  };

  return {
    run(id) {
      const btn = button(id);
      if (!btn || btn.disabled) return;
      btn.click();
      mark(btn);
    },
    click(id) {
      button(id)?.click();
    },
    flash(id) {
      const btn = button(id);
      if (btn && !btn.disabled) mark(btn);
    },
    hint(id, combo) {
      const btn = button(id);
      if (!btn) return;
      const base = btn.getAttribute("title") || "";
      btn.setAttribute("title", base ? base + " · " + combo : combo);
    },
  };
}
