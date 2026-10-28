import { element } from "./dom.ts";

export interface AskOptions {
  readonly title: string;
  readonly text?: string;
  readonly yes: string;
  readonly no: string;
  readonly danger?: boolean;
}

let asked = 0;

function choiceButton(label: string): HTMLButtonElement {
  const node = element("button", "tbtn", label);
  node.type = "button";
  return node;
}

export function askChoice(options: AskOptions): Promise<boolean> {
  const id = "askTitle" + ++asked;
  const dialog = element("dialog", "suggest-overlay dialog-overlay ask-dialog");
  dialog.setAttribute("aria-labelledby", id);
  const card = element("div", "suggest-card");
  const title = element("h2", "suggest-title", options.title);
  title.id = id;
  card.append(title);
  if (options.text) card.append(element("p", "suggest-hint", options.text));
  const row = element("div", "suggest-actions");
  const no = choiceButton(options.no);
  const yes = choiceButton(options.yes);
  yes.classList.add(options.danger ? "collab-wipe" : "suggest-send");
  row.append(no, yes);
  card.append(row);
  dialog.append(card);
  document.body.append(dialog);
  return new Promise((resolve) => {
    let chosen = false;
    no.addEventListener("click", () => dialog.close());
    yes.addEventListener("click", () => {
      chosen = true;
      dialog.close();
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(chosen);
    });
    dialog.showModal();
    (options.danger ? no : yes).focus();
  });
}
