import { headButton } from "../project/panelicons.ts";
import type { Change } from "./changes.ts";
import type { Chat } from "./chat.ts";
import type { Comments, CommentThread } from "./commentmodel.ts";
import { commentsView, type CommentsView } from "./commentview.ts";
import type { Talk } from "./talk.ts";
import { changesView, chatView, type TalkView } from "./talkview.ts";

export type TalkMode = "chat" | "changes" | "comments";

export interface RevealDeps {
  readonly editor: HTMLTextAreaElement;
  readonly openPath: (path: string) => void;
}

export const ICONS: Record<TalkMode, string> = {
  chat: '<path d="M2.5 3h11v7.5h-6.5l-3 2.5v-2.5h-1.5z"/><path d="M5 6h6M5 8h4"/>',
  changes: '<path d="M8 1.8v7.4M4.3 5.5h7.4M4.3 13h7.4"/>',
  comments:
    '<path d="M2.5 13.5h11"/><path d="M4 10.5l6.5-6.5 2 2-6.5 6.5H4z"/>',
};
export const TALK_LABELS: Record<TalkMode, string> = {
  chat: "Хэлэлцүүлэг",
  changes: "Өөрчлөлт",
  comments: "Шүүмж",
};

export interface Views {
  readonly chat: Chat | null;
  readonly comments: Comments;
  readonly views: Record<"chat" | "changes", TalkView | null> & {
    readonly comments: CommentsView;
  };
  destroy(): void;
}

type Reveal = (path: string | null, from: number, to: number) => void;

function selectRange(
  editor: HTMLTextAreaElement,
  from: number,
  end: number,
): void {
  const to = Math.min(editor.value.length, end);
  editor.focus();
  editor.setSelectionRange(Math.min(from, to), to);
}

function revealer(deps: RevealDeps): Reveal {
  return (path, from, to) => {
    if (path === null) return selectRange(deps.editor, from, to);
    deps.openPath(path);
    requestAnimationFrame(() => selectRange(deps.editor, from, to));
  };
}

function threadsView(comments: Comments, reveal: Reveal): CommentsView {
  return commentsView(comments, (thread: CommentThread) => {
    if (thread.from !== null && thread.to !== null)
      reveal(thread.path, thread.from, thread.to);
  });
}

export function buildViews(talk: Talk, deps: RevealDeps): Views {
  const reveal = revealer(deps);
  const views = {
    chat: chatView(talk.chat),
    changes: changesView(talk.changes, (change: Change) =>
      reveal(change.path, change.from, change.from + change.inserted.length),
    ),
    comments: threadsView(talk.comments, reveal),
  };
  return {
    chat: talk.chat,
    comments: talk.comments,
    views,
    destroy() {
      views.chat.destroy();
      views.changes.destroy();
      views.comments.destroy();
    },
  };
}

export function localViews(comments: Comments, deps: RevealDeps): Views {
  const view = threadsView(comments, revealer(deps));
  return {
    chat: null,
    comments,
    views: { chat: null, changes: null, comments: view },
    destroy: view.destroy,
  };
}

export function shownMode(views: Views | null, mode: TalkMode): TalkMode {
  return views && !views.views[mode] ? "comments" : mode;
}

export function badge(target: HTMLElement, count: number): void {
  let mark = target.querySelector<HTMLElement>(".talk-badge");
  if (!count) return void mark?.remove();
  if (!mark) {
    mark = document.createElement("span");
    mark.className = "talk-badge";
    target.append(mark);
  }
  mark.textContent = count > 99 ? "99+" : String(count);
}

export interface Side {
  sync(views: Views | null): void;
  open(mode: TalkMode): void;
}

export const MODES = ["chat", "changes", "comments"] as const;

export interface Holder {
  current(): Views | null;
  swap(views: Views | null): boolean;
}

export function holder(changed: () => void): Holder {
  let current: Views | null = null;
  let off = (): void => {};
  return {
    current: () => current,
    swap(views) {
      if (views === current) return false;
      current = views;
      off();
      const offChat = views?.chat?.onChange(changed);
      const offComments = views?.comments.onChange(changed);
      off = () => {
        offChat?.();
        offComments?.();
      };
      return true;
    },
  };
}

export function unreadOf(held: Holder, reading: TalkMode | null): number {
  const views = held.current();
  if (!views) return 0;
  const chat = reading === "chat" ? 0 : (views.chat?.unread() ?? 0);
  return chat + unreadComments(held, reading);
}

export function unreadComments(held: Holder, reading: TalkMode | null): number {
  return reading === "comments" ? 0 : (held.current()?.comments.unread() ?? 0);
}

export function unreadChat(held: Holder, reading: TalkMode | null): number {
  return reading === "chat" ? 0 : (held.current()?.chat?.unread() ?? 0);
}

export function talkButton(mode: TalkMode): HTMLButtonElement {
  const node = headButton(TALK_LABELS[mode], ICONS[mode]);
  node.classList.add("talk-toggle");
  node.setAttribute("aria-pressed", "false");
  node.addEventListener("mousedown", (event) => event.preventDefault());
  return node;
}

export function refocus(box: HTMLElement, editor: HTMLTextAreaElement): void {
  if (box.contains(document.activeElement)) editor.focus();
}
