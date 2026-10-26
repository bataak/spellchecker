import { headButton, icon } from "../project/panelicons.ts";
import {
  badge,
  holder,
  ICONS,
  MODES,
  refocus,
  shownMode,
  TALK_LABELS,
  unreadChat,
  unreadComments,
  unreadOf,
  type Side,
  type TalkMode,
} from "./talkparts.ts";

const TRIGGER_LABEL = "Хэлэлцэх";
const COMMENTS_LABEL = "Шүүмж";

export interface WindowDeps {
  readonly editor: HTMLTextAreaElement;
  readonly anchor: HTMLElement | null;
  readonly workspace: HTMLElement | null;
  readonly editorWrap: HTMLElement | null;
}

interface Shell {
  readonly win: HTMLElement;
  readonly tabs: Record<TalkMode, HTMLButtonElement>;
  readonly close: HTMLButtonElement;
  readonly body: HTMLElement;
}

type Placement = Pick<WindowDeps, "workspace" | "editorWrap">;

function windowShell({ workspace, editorWrap }: Placement): Shell {
  const win = document.createElement("aside");
  win.className = "talk-window";
  win.hidden = true;
  win.setAttribute("aria-label", "Хэлэлцүүлэг, өөрчлөлт, шүүмж");
  const head = document.createElement("div");
  head.className = "talk-window-head";
  const list = document.createElement("div");
  list.className = "talk-tabs";
  list.setAttribute("role", "tablist");
  const tabs = {
    chat: document.createElement("button"),
    changes: document.createElement("button"),
    comments: document.createElement("button"),
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
  list.append(...MODES.map((key) => tabs[key]));
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
  trigger.setAttribute("aria-pressed", "false");
  anchor?.after(trigger);
  return trigger;
}

function paintTrigger(trigger: HTMLButtonElement, shared: boolean): void {
  const label = shared ? TRIGGER_LABEL : COMMENTS_LABEL;
  if (trigger.dataset.label === label) return;
  trigger.dataset.label = label;
  trigger.title = shared
    ? "Хамтрагчидтай хэлэлцэх, өөрчлөлт ба шүүмжийг харах"
    : "Шүүмжийг харах";
  trigger.innerHTML = icon(shared ? ICONS.chat : ICONS.comments, 14);
  trigger.append(document.createTextNode(" " + label));
}

export function fileWindow(deps: WindowDeps): Side {
  const { win, tabs, close, body } = windowShell(deps);
  const trigger = talkTrigger(deps.anchor);
  paintTrigger(trigger, true);
  let mode: TalkMode = "chat";
  const unread = (): void => {
    const current = held.current();
    trigger.hidden =
      !current || (!current.chat && current.comments.list().length === 0);
    if (current) paintTrigger(trigger, current.chat !== null);
    const reading = win.hidden ? null : shownMode(held.current(), mode);
    badge(trigger, unreadOf(held, reading));
    badge(tabs.chat, unreadChat(held, reading));
    badge(tabs.comments, unreadComments(held, reading));
  };
  const held = holder(unread);
  const render = (): void => {
    const current = held.current();
    const shown = shownMode(current, mode);
    for (const key of MODES) {
      tabs[key].hidden = !current?.views[key];
      tabs[key].setAttribute("aria-selected", String(shown === key));
      current?.views[key]?.shown(!win.hidden && shown === key);
    }
    const view = current?.views[shown];
    if (view) body.replaceChildren(view.el);
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
  trigger.addEventListener("click", () => {
    if (!win.hidden) return open(false);
    if (unreadChat(held, null)) mode = "chat";
    else if (unreadComments(held, null)) mode = "comments";
    open(true);
  });
  win.addEventListener("keydown", (event) => {
    if (event.key === "Escape") open(false);
  });
  return {
    sync(views) {
      if (held.swap(views)) {
        if (!views) win.hidden = true;
        render();
      }
      unread();
    },
    open(next) {
      mode = next;
      open(true);
    },
  };
}
