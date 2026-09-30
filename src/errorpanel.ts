import { materializeMark } from "./backdrop.ts";
import { copyText } from "./clipboard.ts";
import { escapeHtml } from "./htmlutil.ts";
import { nf } from "./status.ts";
import { buildErrorList } from "./textcheck.ts";
import type { Token } from "./textcheck.ts";

export interface ErrorPanelDeps {
  readonly editor: HTMLTextAreaElement;
  readonly backdrop: HTMLElement;
  readonly desktopMQ: MediaQueryList;
  readonly badTokens: () => Token[];
  readonly lastCaret: () => { start: number; end: number } | null;
  readonly setLastCaret: (caret: { start: number; end: number }) => void;
  readonly onPick: () => void;
  readonly syncScroll: () => void;
  readonly showPopoverFor: (token: Token) => void;
}

export interface ErrorPanel {
  readonly render: () => void;
  readonly clear: (calculating: boolean) => void;
}

export function initErrorPanel(deps: ErrorPanelDeps): ErrorPanel {
  const { editor, backdrop, desktopMQ } = deps;
  const list = document.querySelector<HTMLElement>("#errorList");
  const copy = document.querySelector<HTMLButtonElement>("#copyErrorsBtn");
  const title = document.querySelector<HTMLElement>("#errorPanelTitle");

  function render(): void {
    if (!list) return;
    if (!desktopMQ.matches) return;
    const tokens = deps.badTokens();
    const items = buildErrorList(tokens);
    if (!items.length) {
      if (title) title.textContent = "Алдаагүй";
      list.innerHTML = "";
      if (copy) copy.disabled = true;
      return;
    }
    if (title) title.textContent = "Нийт алдаатай үг: " + nf(tokens.length);
    if (copy) copy.disabled = false;
    list.innerHTML = items
      .map((item) => {
        const repeatCountLabel = item.count > 99 ? "99+" : item.count;
        const badge =
          item.count >= 2
            ? '<span class="ew-count">' + repeatCountLabel + "</span>"
            : "";
        return (
          '<button class="ew" type="button" data-start="' +
          item.start +
          '">' +
          escapeHtml(item.word) +
          badge +
          "</button>"
        );
      })
      .join("");
  }

  function clear(calculating: boolean): void {
    if (list) list.innerHTML = "";
    if (copy) copy.disabled = true;
    if (title && calculating && desktopMQ.matches) {
      title.textContent = "Тооцоолж байна…";
    }
  }

  function scrollMarkIntoView(start: number): void {
    materializeMark(start);
    const mark = backdrop.querySelector('mark[data-start="' + start + '"]');
    if (!mark) return;
    const editorRect = editor.getBoundingClientRect();
    const markRect = mark.getBoundingClientRect();
    const pad = 24;
    if (
      markRect.top >= editorRect.top + pad &&
      markRect.bottom <= editorRect.bottom - pad
    )
      return;
    const targetY =
      editorRect.top + Math.max(pad, Math.min(editorRect.height * 0.3, 160));
    const maxScroll = editor.scrollHeight - editor.clientHeight;
    const next = Math.max(
      0,
      Math.min(editor.scrollTop + (markRect.top - targetY), maxScroll),
    );
    editor.scrollTop = next;
    deps.syncScroll();
  }

  if (list) {
    const ancestorOf = (node: HTMLElement, other: HTMLElement): HTMLElement => {
      for (
        let current: HTMLElement | null = node;
        current;
        current = current.parentElement
      )
        if (current.contains(other)) return current;
      return node;
    };
    const panel = title ? ancestorOf(list, title) : list;

    panel.addEventListener("click", (e) => {
      const target = e.target instanceof Element ? e.target : null;
      if (!target || target.closest("#copyErrorsBtn")) return;
      const btn = target.closest(".ew");
      if (!btn) {
        editor.focus({ preventScroll: true });
        const lastCaret = deps.lastCaret();
        if (lastCaret) {
          try {
            editor.setSelectionRange(lastCaret.start, lastCaret.end, "forward");
          } catch (_) {}
        }
        return;
      }
      const start = Number(btn.getAttribute("data-start"));
      const clickedToken = deps
        .badTokens()
        .find((token) => token.start === start);
      if (!clickedToken) return;
      deps.onPick();
      editor.focus({ preventScroll: true });
      try {
        editor.setSelectionRange(
          clickedToken.start,
          clickedToken.end,
          "forward",
        );
      } catch (_) {}
      deps.setLastCaret({ start: clickedToken.end, end: clickedToken.end });
      scrollMarkIntoView(clickedToken.start);
      deps.showPopoverFor(clickedToken);
    });
  }

  if (copy) {
    const copyIcon = copy.innerHTML;
    const checkIcon =
      '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" ' +
      'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
      'stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
    let copyTimer: ReturnType<typeof setTimeout> | null = null;
    copy.addEventListener("click", async () => {
      const words = buildErrorList(deps.badTokens()).map((token) => token.word);
      if (!words.length) return;
      try {
        await copyText(words.join("\n"));
        copy.classList.add("copied");
        copy.innerHTML = checkIcon;
        if (copyTimer) clearTimeout(copyTimer);
        copyTimer = setTimeout(() => {
          copy.classList.remove("copied");
          copy.innerHTML = copyIcon;
        }, 1100);
      } catch (_) {}
    });
  }

  return { render, clear };
}
