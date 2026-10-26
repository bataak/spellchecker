import type { Chat, ChatMessage } from "./chat.ts";
import { MAX_CHAT_TEXT } from "./chat.ts";
import type { Change } from "./changes.ts";
import type { ChangeTracker } from "./changetracker.ts";
import { CURSOR_COLORS } from "./peercolors.ts";
import { revealText } from "./safetext.ts";
import { element } from "../ui/dom.ts";

export interface TalkView {
  readonly el: HTMLElement;
  shown(on: boolean): void;
  destroy(): void;
}

const MAX_SHOWN = 200;
const MAX_PIECE = 600;
const CHAT_EMPTY = "Одоогоор таны хамтрагчдаас нэг ч зурвас алга.";
const CHANGES_WAIT = "Өөрчлөлтийг хянаж эхэлж байна…";
const CHANGES_EMPTY = "Сүүлд зөвшөөрснөөс хойш өөрчлөлт алга.";

function button(className: string, text: string, title?: string) {
  const node = element("button", className, text);
  node.type = "button";
  if (title) {
    node.title = title;
    node.setAttribute("aria-label", title);
  }
  return node;
}

function dot(color: number | null): HTMLElement {
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
    element("span", "talk-msg-name", message.name),
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

function changeBody(change: Change): HTMLElement {
  const body = element("p", "talk-change-text");
  body.append(document.createTextNode("…" + revealText(change.before)));
  if (change.removed) body.append(element("del", "", clip(change.removed)));
  if (change.inserted) body.append(element("ins", "", clip(change.inserted)));
  body.append(document.createTextNode(revealText(change.after) + "…"));
  return body;
}

export function changeTitle(change: Change): string {
  const who = change.author?.name ?? null;
  if (change.inserted && change.removed)
    return who ? who + " сольсон" : "Солигдсон";
  if (change.inserted) return who ? who + " нэмсэн" : "Нэмэгдсэн";
  return "Устгагдсан";
}

interface ChangeActions {
  readonly reveal: (change: Change) => void;
  readonly tracker: ChangeTracker;
}

function changeRow(change: Change, actions: ChangeActions): HTMLLIElement {
  const row = element("li", "talk-change");
  const head = element("div", "talk-change-head");
  head.append(
    dot(change.author?.color ?? null),
    element("span", "talk-change-who", changeTitle(change)),
  );
  if (change.path)
    head.append(element("span", "talk-change-path", revealText(change.path)));
  const show = button("talk-change-show", "");
  show.append(changeBody(change));
  show.title = "Байрлал руу очих";
  show.addEventListener("click", () => actions.reveal(change));
  const accept = button("talk-change-act", "✓", "Зөвшөөрөх");
  accept.addEventListener("click", () => actions.tracker.accept(change));
  const reject = button("talk-change-act is-reject", "✕", "Татгалзаж буцаах");
  reject.addEventListener("click", () => actions.tracker.reject(change));
  const tools = element("div", "talk-change-tools");
  tools.append(accept, reject);
  head.append(tools);
  row.append(head, show);
  return row;
}

export function changesCount(count: number): string {
  return count === 0 ? "Өөрчлөлтгүй" : count + " өөрчлөлт";
}

export function changesView(
  tracker: ChangeTracker,
  reveal: (change: Change) => void,
): TalkView {
  const el = element("div", "talk-changes");
  const bar = element("div", "talk-changes-bar");
  const count = element("span", "talk-changes-count");
  const acceptAll = button("talk-accept-all", "Бүгдийг зөвшөөр");
  acceptAll.addEventListener("click", () => tracker.acceptAll());
  bar.append(count, acceptAll);
  const list = element("ol", "talk-change-list");
  const empty = element("p", "talk-empty");
  el.append(bar, list, empty);
  let visible = false;
  const actions = { tracker, reveal };

  const render = (): void => {
    if (!visible) return;
    const changes = tracker.list();
    count.textContent = changesCount(changes.length);
    acceptAll.disabled = changes.length === 0;
    list.replaceChildren(
      ...changes
        .slice(0, MAX_SHOWN)
        .map((change) => changeRow(change, actions)),
    );
    empty.hidden = changes.length > 0;
    empty.textContent = tracker.ready() ? CHANGES_EMPTY : CHANGES_WAIT;
  };
  const off = tracker.onChange(render);
  return {
    el,
    shown(on) {
      visible = on;
      render();
    },
    destroy: off,
  };
}
