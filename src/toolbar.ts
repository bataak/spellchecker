import type { Token, ErrorEntry } from "./textcheck.ts";

export interface ToolbarDeps {
  els: { editor: HTMLTextAreaElement; status: HTMLElement };
  isDocxActive: () => boolean;
  closeDocx: () => void;
  flash: (sel: string, msg: string) => void;
  setStatus: (html: string, animate?: boolean) => void;
  setEditorText: (text: string, caret: number | null) => void;
  insertEditorText: (text: string, start: number, end: number) => void;
  hidePopover: () => void;
  render: () => Promise<void> | void;
  saveText: () => void;
  isTouch: () => boolean;
  buildErrorList: (tokens: Token[]) => ErrorEntry[];
  getBadTokens: () => Token[];
  copyText: (str: string) => Promise<void>;
}

export function initToolbar(deps: ToolbarDeps): void {
  initToolbarScroll();
  initToolbarSnap();
  initSaveReveal();
  initButtons(deps);
}

function initToolbarScroll(): void {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  const clearBtn = document.querySelector<HTMLElement>("#clearBtn");
  if (!bar || !clearBtn) return;
  requestAnimationFrame(() => {
    if (bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollLeft +=
      clearBtn.getBoundingClientRect().left -
      bar.getBoundingClientRect().left;
  });
}

function initToolbarSnap(): void {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  const clearBtn = document.querySelector<HTMLElement>("#clearBtn");
  const endBtn = document.querySelector<HTMLElement>("#openBtn");
  if (!bar || !clearBtn || !endBtn) return;
  const ZONE = 56;
  let snapTimer: ReturnType<typeof setTimeout> | undefined;
  bar.addEventListener(
    "scroll",
    () => {
      clearTimeout(snapTimer);
      snapTimer = setTimeout(() => {
        const barRect = bar.getBoundingClientRect();
        const dHome = clearBtn.getBoundingClientRect().left - barRect.left;
        const dSave = endBtn.getBoundingClientRect().right - barRect.right;
        const aHome = Math.abs(dHome);
        const aSave = Math.abs(dSave);
        if (Math.min(aHome, aSave) > ZONE) return;
        const snapDelta = aHome <= aSave ? dHome : dSave;
        if (Math.abs(snapDelta) > 1)
          bar.scrollBy({ left: snapDelta, behavior: "smooth" });
      }, 90);
    },
    { passive: true },
  );
}

function initSaveReveal(): void {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector<HTMLElement>(".toolbar");
  if (!bar) return;

  for (const id of ["#saveBtn", "#openBtn"]) {
    const btn = document.querySelector<HTMLElement>(id);
    if (!btn) continue;
    btn.addEventListener("click", () => {
      const barRect = bar.getBoundingClientRect();
      const over = btn.getBoundingClientRect().right - barRect.right;
      if (over > 0) bar.scrollBy({ left: over + 8, behavior: "smooth" });
    });
  }
}

function initButtons({
  els,
  isDocxActive,
  closeDocx,
  flash,
  setStatus,
  setEditorText,
  insertEditorText,
  hidePopover,
  render,
  saveText,
  isTouch,
  buildErrorList,
  getBadTokens,
  copyText,
}: ToolbarDeps): void {
  document.querySelector("#clearBtn")!.addEventListener("click", () => {
    if (!els.editor.value) {
      els.editor.focus();
      return;
    }
    try {
      localStorage.setItem("mn-spell:last-cleared", els.editor.value);
    } catch (_) {}
    closeDocx();
    setEditorText("", 0);
    hidePopover();
    render();
    saveText();
  });

  function insertAtCaret(text: string): void {
    let start = els.editor.selectionStart;
    let end = els.editor.selectionEnd;
    if (start == null) {
      start = els.editor.value.length;
      end = start;
    }
    insertEditorText(text, start, end);
    render();
    saveText();
  }

  document.querySelector("#pasteBtn")!.addEventListener("click", async () => {
    if (isDocxActive()) {
      flash("#pasteBtn", "Боломжгүй");
      return;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) insertAtCaret(text);
        else els.editor.focus();
        return;
      }
      throw new Error("no-api");
    } catch (_) {
      els.editor.focus();
      if (isTouch())
        setStatus(
          "Талбар дотор удаан дарахад гарах <b>Paste</b> цэсийг ашиглан буулгана уу",
        );
      else {
        const uaData = navigator.userAgentData;
        const isMac =
          /mac/i.test((uaData && uaData.platform) || "") ||
          /Mac|iPhone|iPad|iPod/i.test(navigator.platform || "");
        flash("#pasteBtn", isMac ? "⌘V" : "Ctrl+V");
      }
    }
  });

  (function initCopyErrorsHold() {
    const btn = document.querySelector<HTMLElement>("#copyBtn");
    if (!btn) return;
    const HOLD = 500;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let armed = false;
    let prevStatus = "";
    let revertTimer: ReturnType<typeof setTimeout> | null = null;
    const showStatus = (msg: string): void => {
      setStatus(msg);
      if (revertTimer) clearTimeout(revertTimer);
      revertTimer = setTimeout(() => {
        if (els.status.innerHTML === msg) setStatus(prevStatus, false);
      }, 1600);
    };
    btn.addEventListener("pointerdown", () => {
      if (timer) clearTimeout(timer);
      armed = false;
      timer = setTimeout(() => {
        armed = true;
        prevStatus = els.status.innerHTML;
        const hasWords = buildErrorList(getBadTokens()).length > 0;
        showStatus(hasWords ? "Алдаатай үгс хуулагдлаа" : "Алдаатай үг алга");
      }, HOLD);
    });
    const clear = () => {
      if (timer) clearTimeout(timer);
    };
    btn.addEventListener("pointerup", clear);
    btn.addEventListener("pointercancel", clear);
    btn.addEventListener("pointerleave", clear);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("click", async () => {
      if (armed) {
        armed = false;
        const words = buildErrorList(getBadTokens()).map(
          (token) => token.word,
        );
        if (!words.length) return;
        try {
          await copyText(words.join("\n"));
        } catch (_) {
          showStatus("Хуулах боломжгүй");
        }
        return;
      }
      try {
        await copyText(els.editor.value || "");
        flash("#copyBtn", "Хуулагдав");
      } catch (_) {
        flash("#copyBtn", "Боломжгүй");
      }
    });
  })();
}
