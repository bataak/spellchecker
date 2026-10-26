import type { Chat, ChatMessage } from "./chat.ts";
import { MAX_CHAT_TEXT } from "./chat.ts";
import type { Change } from "./changes.ts";
import { CURSOR_COLORS } from "./peercolors.ts";
import { revealText } from "./safetext.ts";
import { element } from "../ui/dom.ts";

export interface TalkView {
  readonly el: HTMLElement;
  shown(on: boolean): void;
  destroy(): void;
}

const MAX_PIECE = 600;
const CHAT_EMPTY = "Одоогоор таны хамтрагчдаас нэг ч зурвас алга.";

export function button(className: string, text: string, title?: string) {
  const node = element("button", className, text);
  node.type = "button";
  if (title) {
    node.title = title;
    node.setAttribute("aria-label", title);
  }
  return node;
}

export function dot(color: number | null): HTMLElement {
  const node = element("span", "talk-dot");
  if (color !== null)
    node.style.setProperty(
      "--peer",
      CURSOR_COLORS[color % CURSOR_COLORS.length]!,
    );
  return node;
}

export function clockOf(at: number, now = Date.now()): string {
  const date = new Date(at);
  const time =
    String(date.getHours()).padStart(2, "0") +
    ":" +
    String(date.getMinutes()).padStart(2, "0");
  if (new Date(now).toDateString() === date.toDateString()) return time;
  return date.getMonth() + 1 + "/" + date.getDate() + " " + time;
}

function messageRow(message: ChatMessage): HTMLLIElement {
  const row = element("li", "talk-msg");
  row.classList.toggle("is-mine", message.mine);
  const head = element("div", "talk-msg-head");
  head.append(
    dot(message.color),
    element("span", "talk-msg-name", ownName(message.name, message.mine)),
    element("time", "talk-msg-time", clockOf(message.at)),
  );
  row.append(head, element("p", "talk-msg-text", message.text));
  return row;
}

export function chatView(chat: Chat): TalkView {
  const el = element("div", "talk-chat");
  const list = element("ol", "talk-messages");
  list.setAttribute("aria-live", "polite");
  const empty = element("p", "talk-empty", CHAT_EMPTY);
  const form = element("form", "talk-form");
  const input = element("textarea", "talk-input");
  input.rows = 2;
  input.maxLength = MAX_CHAT_TEXT;
  input.placeholder = "Зурвас илгээх...";
  input.setAttribute("aria-label", "Зурвас");
  form.append(input);
  el.append(list, empty, form);
  let visible = false;

  const render = (): void => {
    const messages = chat.list();
    const atBottom =
      list.scrollHeight - list.scrollTop - list.clientHeight < 40;
    list.replaceChildren(...messages.map(messageRow));
    empty.hidden = messages.length > 0;
    if (atBottom || visible) list.scrollTop = list.scrollHeight;
    if (visible) chat.seen();
  };
  const submit = (): void => {
    if (chat.send(input.value)) input.value = "";
    input.focus();
  };
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submit();
  });
  const off = chat.onChange(render);
  render();
  return {
    el,
    shown(on) {
      visible = on;
      if (!on) return;
      render();
      input.focus();
    },
    destroy: off,
  };
}

export function clip(text: string): string {
  const shown = revealText(text);
  return shown.length > MAX_PIECE ? shown.slice(0, MAX_PIECE) + "…" : shown;
}

type ChangeText = Pick<Change, "before" | "removed" | "inserted" | "after">;

export function changeBody(change: ChangeText): HTMLElement {
  const body = element("p", "talk-change-text");
  body.append(document.createTextNode("…" + revealText(change.before)));
  if (change.removed) body.append(element("del", "", clip(change.removed)));
  if (change.inserted) body.append(element("ins", "", clip(change.inserted)));
  body.append(document.createTextNode(revealText(change.after) + "…"));
  return body;
}

export const YOU = " (та)";

export function ownName(name: string, mine: boolean | undefined): string {
  return mine ? name + YOU : name;
}

export function changeTitle(
  change: Pick<Change, "author" | "inserted" | "removed">,
): string {
  const author = change.author;
  const who = author ? ownName(author.name, author.mine) : null;
  if (change.inserted && change.removed)
    return who ? who + " сольсон" : "Солигдсон";
  if (change.inserted) return who ? who + " нэмсэн" : "Нэмэгдсэн";
  return "Устгагдсан";
}
