import { MAX_CHAT_TEXT } from "./chat.ts";
import type {
  CommentDraft,
  CommentNote,
  Comments,
  CommentThread,
} from "./comments.ts";
import { revealText } from "./safetext.ts";
import {
  button,
  clip,
  clockOf,
  dot,
  ownName,
  type TalkView,
} from "./talkview.ts";
import { element } from "../ui/dom.ts";

export interface CommentsView extends TalkView {
  compose(draft: CommentDraft): void;
  focus(id: string, reply?: boolean): void;
  busy(): boolean;
}

const EMPTY = "Шүүмжлэхийг хүссэн бичвэрээ сонгоод Шүүмж товчийг дарна уу.";
const GONE = "Шүүмж бичсэн хэсэг устсан";
const EDITED = " · засварласан";

export function commentsCount(open: number): string {
  return open === 0 ? "Шүүмжлэл алга" : open + " нээлттэй шүүмж";
}

export function resolveAllQuestion(open: number): string {
  return (
    open +
    " нээлттэй шүүмжийг шийдсэн гэж тэмдэглэх үү? Дараа нь «Шийдсэнийг харуулах»-аас дахин нээж болно."
  );
}

export function resolvedLabel(count: number, shown: boolean): string {
  return (
    (shown ? "Шийдсэнийг нуух" : "Шийдсэнийг харуулах") + " (" + count + ")"
  );
}

interface State {
  showResolved: boolean;
  active: string | null;
  editing: string | null;
  readonly values: Map<string, string>;
}

interface RowActions {
  readonly comments: Comments;
  readonly reveal: (thread: CommentThread) => void;
  readonly state: State;
  readonly render: () => void;
}

function textBox(
  className: string,
  key: string,
  actions: RowActions,
  submit: (value: string) => boolean,
): HTMLTextAreaElement {
  const input = element("textarea", className);
  input.rows = 1;
  input.maxLength = MAX_CHAT_TEXT;
  input.dataset.key = key;
  input.value = actions.state.values.get(key) ?? "";
  input.addEventListener("input", () =>
    actions.state.values.set(key, input.value),
  );
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && actions.state.editing === key) {
      event.stopPropagation();
      actions.state.editing = null;
      actions.state.values.delete(key);
      return actions.render();
    }
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    if (!submit(input.value)) return;
    actions.state.values.delete(key);
    if (actions.state.editing === key) actions.state.editing = null;
    actions.render();
  });
  return input;
}

function noteTools(note: CommentNote, actions: RowActions): HTMLElement[] {
  if (!note.mine) return [];
  const edit = button("talk-change-act", "✎", "Засах");
  edit.addEventListener("click", () => {
    actions.state.editing = note.id;
    actions.state.values.set(note.id, note.text);
    actions.render();
  });
  const remove = button("talk-change-act is-reject", "✕", "Устгах");
  remove.addEventListener("click", () => {
    if (window.confirm("Энэ шүүмжийг устгах уу?"))
      actions.comments.remove(note.id);
  });
  return [edit, remove];
}

function noteHead(note: CommentNote, extra: HTMLElement[]): HTMLElement {
  const head = element("div", "talk-msg-head");
  const time = element("time", "talk-msg-time", clockOf(note.at));
  if (note.edited) time.textContent += EDITED;
  head.append(
    dot(note.color),
    element("span", "talk-msg-name", ownName(note.name, note.mine)),
    time,
  );
  const tools = element("div", "talk-change-tools");
  tools.append(...extra);
  head.append(tools);
  return head;
}

function noteBody(note: CommentNote, actions: RowActions): HTMLElement {
  if (actions.state.editing !== note.id)
    return element("p", "talk-msg-text", note.text);
  return textBox("talk-input talk-edit", note.id, actions, (value) =>
    actions.comments.edit(note.id, value),
  );
}

function replyRow(note: CommentNote, actions: RowActions): HTMLLIElement {
  const row = element("li", "talk-reply");
  row.append(noteHead(note, noteTools(note, actions)), noteBody(note, actions));
  return row;
}

function quoteOf(thread: CommentThread, actions: RowActions): HTMLElement {
  const quote = button("talk-change-show talk-quote", "");
  const text = element("p", "talk-change-text", clip(thread.quote));
  quote.append(text);
  if (thread.from === null) {
    quote.disabled = true;
    quote.title = GONE;
    quote.classList.add("is-gone");
  } else {
    quote.title = "Байрлал руу очих";
    quote.addEventListener("click", () => actions.reveal(thread));
  }
  return quote;
}

function threadRow(thread: CommentThread, actions: RowActions): HTMLLIElement {
  const { comments, state } = actions;
  const row = element("li", "talk-thread");
  row.dataset.id = thread.id;
  row.classList.toggle("is-resolved", thread.resolved);
  row.classList.toggle("is-active", state.active === thread.id);
  const resolve = thread.resolved
    ? button("talk-change-act", "↺", "Дахин нээх")
    : button("talk-change-act", "✓", "Шийдсэн гэж тэмдэглэх");
  resolve.addEventListener("click", () =>
    comments.resolve(thread.id, !thread.resolved),
  );
  const head = noteHead(thread, [resolve, ...noteTools(thread, actions)]);
  if (thread.path)
    head.insertBefore(
      element("span", "talk-change-path", revealText(thread.path)),
      head.lastChild,
    );
  const replies = element("ol", "talk-replies");
  replies.append(...thread.replies.map((note) => replyRow(note, actions)));
  row.append(head, quoteOf(thread, actions), noteBody(thread, actions));
  if (thread.replies.length) row.append(replies);
  if (!thread.resolved) {
    const reply = textBox(
      "talk-input talk-reply-input",
      "reply:" + thread.id,
      actions,
      (value) => comments.reply(thread.id, value),
    );
    reply.placeholder = "Хариулах...";
    reply.setAttribute("aria-label", "Хариулт");
    row.append(reply);
    row.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("button, textarea, input, a")) return;
      markActive(row, thread.id, state);
      reply.focus();
    });
  }
  return row;
}

function markActive(row: HTMLElement, id: string, state: State): void {
  state.active = id;
  for (const other of row.parentElement?.children ?? [])
    other.classList.toggle("is-active", other === row);
}

interface Composer {
  readonly form: HTMLFormElement;
  open(draft: CommentDraft): void;
  focus(): void;
}

function composer(comments: Comments, added: (id: string) => void): Composer {
  const form = element("form", "talk-compose");
  form.hidden = true;
  const quote = element("p", "talk-change-text talk-compose-quote");
  const input = element("textarea", "talk-input");
  input.rows = 3;
  input.maxLength = MAX_CHAT_TEXT;
  input.placeholder = "Шүүмж бичих...";
  input.setAttribute("aria-label", "Шүүмж");
  const cancel = button("talk-accept-all", "Болих");
  const send = button("talk-accept-all is-primary", "Нэмэх");
  send.type = "submit";
  const row = element("div", "talk-compose-actions");
  row.append(cancel, send);
  form.append(quote, input, row);
  let draft: CommentDraft | null = null;
  const close = (): void => {
    draft = null;
    form.hidden = true;
    input.value = "";
  };
  const submit = (): void => {
    const id = draft ? comments.add(draft, input.value) : null;
    if (!id) return input.focus();
    close();
    added(id);
  };
  cancel.addEventListener("click", close);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    submit();
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.stopPropagation();
      return close();
    }
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) return;
    event.preventDefault();
    submit();
  });
  return {
    form,
    open(next) {
      draft = next;
      quote.textContent = clip(next.quote);
      form.hidden = false;
      input.focus();
    },
    focus: () => input.focus(),
  };
}

function refocus(list: HTMLElement, key: string | undefined): void {
  if (!key) return;
  const input = list.querySelector<HTMLTextAreaElement>(
    'textarea[data-key="' + CSS.escape(key) + '"]',
  );
  if (!input) return;
  input.focus();
  input.setSelectionRange(input.value.length, input.value.length);
}

export function commentsView(
  comments: Comments,
  reveal: (thread: CommentThread) => void,
): CommentsView {
  const el = element("div", "talk-changes talk-comments");
  const bar = element("div", "talk-changes-bar");
  const count = element("span", "talk-changes-count");
  const toggle = button("talk-accept-all", "");
  const resolveAll = button("talk-accept-all", "Бүгдийг шийдэх");
  resolveAll.title = "Нээлттэй бүх шүүмжийг шийдсэн гэж тэмдэглэх";
  resolveAll.addEventListener("click", () => {
    const open = comments.list().filter((thread) => !thread.resolved);
    if (!open.length || !window.confirm(resolveAllQuestion(open.length)))
      return;
    for (const thread of open) comments.resolve(thread.id, true);
  });
  bar.append(count, resolveAll, toggle);
  const list = element("ol", "talk-change-list talk-thread-list");
  const empty = element("p", "talk-empty", EMPTY);
  const state: State = {
    showResolved: false,
    active: null,
    editing: null,
    values: new Map(),
  };
  let visible = false;
  const focusRow = (id: string, reply = false): void => {
    state.active = id;
    render();
    const row = list.querySelector<HTMLElement>(
      '[data-id="' + CSS.escape(id) + '"]',
    );
    row?.scrollIntoView({ block: "nearest" });
    if (reply) row?.querySelector<HTMLElement>(".talk-reply-input")?.focus();
  };
  const draft = composer(comments, (id) => focusRow(id));
  el.append(bar, draft.form, list, empty);
  const actions: RowActions = { comments, reveal, state, render };

  function render(): void {
    if (!visible) return;
    comments.seen();
    const threads = comments.list();
    const resolved = threads.filter((thread) => thread.resolved).length;
    count.textContent = commentsCount(threads.length - resolved);
    toggle.hidden = resolved === 0;
    resolveAll.hidden = threads.length - resolved === 0;
    toggle.textContent = resolvedLabel(resolved, state.showResolved);
    toggle.setAttribute("aria-pressed", String(state.showResolved));
    const shown = threads.filter(
      (thread) => state.showResolved || !thread.resolved,
    );
    const focused = list.contains(document.activeElement)
      ? (document.activeElement as HTMLElement).dataset.key
      : undefined;
    list.replaceChildren(...shown.map((thread) => threadRow(thread, actions)));
    refocus(list, focused);
    empty.hidden = threads.length > 0;
  }
  toggle.addEventListener("click", () => {
    state.showResolved = !state.showResolved;
    render();
  });
  const off = comments.onChange(render);
  return {
    el,
    shown(on) {
      visible = on;
      render();
      if (on && !draft.form.hidden) draft.focus();
    },
    compose: draft.open,
    focus: focusRow,
    busy: () => !draft.form.hidden,
    destroy: off,
  };
}
