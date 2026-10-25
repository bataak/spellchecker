import { headButton, icon } from "../project/panelicons.ts";
import type { Collab, TalkKind } from "./collab.ts";
import type { Change } from "./changes.ts";
import type { Talk } from "./talk.ts";
import { changesView, chatView, type TalkView } from "./talkview.ts";

export type TalkMode = "chat" | "changes";

export interface TalkHostDeps {
  readonly collab: Pick<Collab, "talk" | "onTalk">;
  readonly editor: HTMLTextAreaElement;
  readonly openPath: (path: string) => void;
  readonly anchor: HTMLElement | null;
  readonly workspace: HTMLElement | null;
  readonly editorWrap: HTMLElement | null;
}

const ICONS: Record<TalkMode, string> = {
  chat: '<path d="M2.5 3h11v7.5h-6.5l-3 2.5v-2.5h-1.5z"/><path d="M5 6h6M5 8h4"/>',
  changes: '<path d="M8 1.8v7.4M4.3 5.5h7.4M4.3 13h7.4"/>',
};
export const TALK_LABELS: Record<TalkMode, string> = {
  chat: "Хэлэлцүүлэг",
  changes: "Өөрчлөлт",
};
const TRIGGER_LABEL = "Хэлэлцэх";

interface Views {
  readonly talk: Talk;
  readonly views: Record<TalkMode, TalkView>;
  destroy(): void;
}

function selectChange(editor: HTMLTextAreaElement, change: Change): void {
  const to = Math.min(
    editor.value.length,
    change.from + change.inserted.length,
  );
  editor.focus();
  editor.setSelectionRange(Math.min(change.from, to), to);
}

function buildViews(talk: Talk, deps: TalkHostDeps): Views {
  const reveal = (change: Change): void => {
    if (change.path === null) return selectChange(deps.editor, change);
    deps.openPath(change.path);
    requestAnimationFrame(() => selectChange(deps.editor, change));
  };
  const views = {
    chat: chatView(talk.chat),
    changes: changesView(talk.changes, reveal),
  };
  return {
    talk,
    views,
    destroy() {
      views.chat.destroy();
      views.changes.destroy();
    },
  };
}

function badge(target: HTMLElement, count: number): void {
  let mark = target.querySelector<HTMLElement>(".talk-badge");
  if (!count) return void mark?.remove();
  if (!mark) {
    mark = document.createElement("span");
    mark.className = "talk-badge";
    target.append(mark);
  }
  mark.textContent = count > 99 ? "99+" : String(count);
}

interface Side {
  sync(views: Views | null): void;
}

const MODES = ["chat", "changes"] as const;

interface Holder {
  current(): Views | null;
  swap(views: Views | null): boolean;
}

function holder(unread: () => void): Holder {
  let current: Views | null = null;
  let off = (): void => {};
  return {
    current: () => current,
    swap(views) {
      if (views === current) return false;
      current = views;
      off();
      off = views?.talk.chat.onChange(unread) ?? (() => {});
      return true;
    },
  };
}

function unreadOf(held: Holder, reading: boolean): number {
  return reading ? 0 : (held.current()?.talk.chat.unread() ?? 0);
}

function talkButton(mode: TalkMode): HTMLButtonElement {
  const node = headButton(TALK_LABELS[mode], ICONS[mode]);
  node.classList.add("talk-toggle");
  node.setAttribute("aria-pressed", "false");
  node.addEventListener("mousedown", (event) => event.preventDefault());
  return node;
}

function refocus(box: HTMLElement, editor: HTMLTextAreaElement): void {
  if (box.contains(document.activeElement)) editor.focus();
}

function projectSide(editor: HTMLTextAreaElement): Side | null {
  const panel = document.querySelector<HTMLElement>(".project-panel");
  const foot = panel?.querySelector<HTMLElement>(".project-foot");
  const head = panel?.querySelector<HTMLElement>(".project-head");
  if (!panel || !foot || !head) return null;
  const archive = foot.querySelector(".project-foot-btn");
  const buttons = { changes: talkButton("changes"), chat: talkButton("chat") };
  const pair = document.createElement("span");
  pair.className = "talk-pair";
  pair.append(buttons.changes, buttons.chat);
  foot.insertBefore(pair, archive);
  const side = document.createElement("section");
  side.className = "project-talk";
  side.hidden = true;
  const title = document.createElement("h2");
  title.className = "project-talk-title";
  side.append(title);
  head.after(side);
  let mode: TalkMode | null = null;
  const unread = (): void =>
    badge(buttons.chat, unreadOf(held, mode === "chat"));
  const held = holder(unread);

  const show = (next: TalkMode | null): void => {
    const current = held.current();
    mode = current ? next : null;
    if (mode === null) refocus(side, editor);
    panel.classList.toggle("is-talk", mode !== null);
    side.hidden = mode === null;
    for (const key of MODES) {
      buttons[key].setAttribute("aria-pressed", String(mode === key));
      current?.views[key].shown(mode === key);
    }
    if (!current || !mode) return;
    title.textContent = TALK_LABELS[mode];
    side.replaceChildren(title, current.views[mode].el);
  };
  for (const key of MODES)
    buttons[key].addEventListener("click", () =>
      show(mode === key ? null : key),
    );
  return {
    sync(views) {
      if (held.swap(views)) show(views ? mode : null);
      pair.hidden = views === null;
      unread();
    },
  };
}

interface Shell {
  readonly win: HTMLElement;
  readonly tabs: Record<TalkMode, HTMLButtonElement>;
  readonly close: HTMLButtonElement;
  readonly body: HTMLElement;
}

type Placement = Pick<TalkHostDeps, "workspace" | "editorWrap">;

function windowShell({ workspace, editorWrap }: Placement): Shell {
  const win = document.createElement("aside");
  win.className = "talk-window";
  win.hidden = true;
  win.setAttribute("aria-label", "Хэлэлцүүлэг ба өөрчлөлт");
  const head = document.createElement("div");
  head.className = "talk-window-head";
  const list = document.createElement("div");
  list.className = "talk-tabs";
  list.setAttribute("role", "tablist");
  const tabs = {
    chat: document.createElement("button"),
    changes: document.createElement("button"),
  };
  for (const key of MODES) {
    tabs[key].type = "button";
    tabs[key].className = "talk-tab";
    tabs[key].setAttribute("role", "tab");
    tabs[key].textContent = TALK_LABELS[key];
  }
  const close = headButton("Хаах", '<path d="M4 4l8 8M12 4l-8 8"/>');
  const gap = document.createElement("span");
  gap.className = "project-foot-gap";
  list.append(tabs.chat, tabs.changes);
  head.append(list, gap, close);
  const body = document.createElement("div");
  body.className = "talk-window-body";
  body.setAttribute("role", "tabpanel");
  win.append(head, body);
  if (workspace) workspace.insertBefore(win, editorWrap);
  else document.body.append(win);
  return { win, tabs, close, body };
}

function talkTrigger(anchor: HTMLElement | null): HTMLButtonElement {
  const trigger = document.createElement("button");
  trigger.type = "button";
  trigger.className = "tbtn talk-trigger";
  trigger.hidden = true;
  trigger.title = "Хамтрагчидтай хэлэлцэх, өөрчлөлтийг харах";
  trigger.innerHTML = icon(ICONS.chat, 14);
  trigger.append(document.createTextNode(" " + TRIGGER_LABEL));
  trigger.setAttribute("aria-pressed", "false");
  anchor?.after(trigger);
  return trigger;
}

function fileWindow(deps: TalkHostDeps): Side {
  const { win, tabs, close, body } = windowShell(deps);
  const trigger = talkTrigger(deps.anchor);
  let mode: TalkMode = "chat";
  const unread = (): void =>
    badge(trigger, unreadOf(held, !win.hidden && mode === "chat"));
  const held = holder(unread);
  const render = (): void => {
    const current = held.current();
    for (const key of MODES) {
      tabs[key].setAttribute("aria-selected", String(mode === key));
      current?.views[key].shown(!win.hidden && mode === key);
    }
    if (current) body.replaceChildren(current.views[mode].el);
    trigger.setAttribute("aria-pressed", String(!win.hidden));
    document.documentElement.toggleAttribute("data-talk", !win.hidden);
    unread();
  };
  const open = (on: boolean): void => {
    if (!on) refocus(win, deps.editor);
    win.hidden = !on || !held.current();
    render();
  };
  for (const key of MODES)
    tabs[key].addEventListener("click", () => {
      mode = key;
      render();
    });
  close.addEventListener("click", () => open(false));
  trigger.addEventListener("click", () => open(win.hidden !== false));
  win.addEventListener("keydown", (event) => {
    if (event.key === "Escape") open(false);
  });
  return {
    sync(views) {
      if (held.swap(views)) {
        if (!views) win.hidden = true;
        render();
      }
      trigger.hidden = views === null;
      unread();
    },
  };
}

export function initTalk(deps: TalkHostDeps): void {
  const sides: Record<TalkKind, Side | null> = {
    project: projectSide(deps.editor),
    file: fileWindow(deps),
  };
  const built = new Map<Talk, Views>();
  const sync = (): void => {
    const live = new Set<Talk>();
    for (const kind of ["project", "file"] as const) {
      const talk = deps.collab.talk(kind);
      let views: Views | null = null;
      if (talk) {
        live.add(talk);
        views = built.get(talk) ?? buildViews(talk, deps);
        built.set(talk, views);
      }
      sides[kind]?.sync(views);
    }
    for (const [talk, views] of built)
      if (!live.has(talk)) {
        views.destroy();
        built.delete(talk);
      }
  };
  deps.collab.onTalk(sync);
  sync();
}
