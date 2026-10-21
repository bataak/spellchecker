import { validName } from "../tex/texproject.ts";

export interface NameEditorDeps {
  readonly run: (task: () => Promise<unknown>) => Promise<void>;
  readonly notify: (message: string) => void;
  readonly done: () => void;
}

export function editName(
  deps: NameEditorDeps,
  place: (input: HTMLInputElement) => void,
  initial: string,
  commit: (name: string) => Promise<void>,
): HTMLInputElement {
  const input = document.createElement("input");
  input.type = "text";
  input.className = "project-input";
  input.value = initial;
  input.spellcheck = false;
  input.setAttribute("aria-label", "Нэр");
  let finished = false;
  const end = async (save: boolean): Promise<void> => {
    if (finished) return;
    finished = true;
    const name = input.value.trim();
    if (save && name && name !== initial) {
      if (!validName(name)) {
        deps.notify('Нэрд / \\ : * ? " < > | тэмдэгт орж болохгүй');
      } else await deps.run(() => commit(name));
    }
    deps.done();
  };
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void end(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      void end(false);
    }
    event.stopPropagation();
  });
  input.addEventListener("blur", () => void end(true));
  place(input);
  input.focus();
  const dot = initial.lastIndexOf(".");
  input.setSelectionRange(0, dot > 0 ? dot : initial.length);
  return input;
}
