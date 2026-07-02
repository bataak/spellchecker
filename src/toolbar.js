export function initToolbar(deps) {
  initToolbarScroll();
  initToolbarSnap();
  initSaveReveal();
  initButtons(deps);
}

function initToolbarScroll() {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector(".toolbar");
  const clearBtn = document.querySelector("#clearBtn");
  if (!bar || !clearBtn) return;
  requestAnimationFrame(() => {
    if (bar.scrollWidth <= bar.clientWidth) return;
    bar.scrollLeft +=
      clearBtn.getBoundingClientRect().left - bar.getBoundingClientRect().left;
  });
}

function initToolbarSnap() {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector(".toolbar");
  const clearBtn = document.querySelector("#clearBtn");
  const saveBtn = document.querySelector("#saveBtn");
  if (!bar || !clearBtn || !saveBtn) return;
  const ZONE = 56;
  let st;
  bar.addEventListener(
    "scroll",
    () => {
      clearTimeout(st);
      st = setTimeout(() => {
        const b = bar.getBoundingClientRect();
        const dHome = clearBtn.getBoundingClientRect().left - b.left;
        const dSave = saveBtn.getBoundingClientRect().right - b.right;
        const aHome = Math.abs(dHome);
        const aSave = Math.abs(dSave);
        if (Math.min(aHome, aSave) > ZONE) return;
        const d = aHome <= aSave ? dHome : dSave;
        if (Math.abs(d) > 1) bar.scrollBy({ left: d, behavior: "smooth" });
      }, 90);
    },
    { passive: true },
  );
}

function initSaveReveal() {
  if (window.matchMedia("(min-width: 1024px)").matches) return;
  const bar = document.querySelector(".toolbar");
  const saveBtn = document.querySelector("#saveBtn");
  if (!bar || !saveBtn) return;
  saveBtn.addEventListener("click", () => {
    const b = bar.getBoundingClientRect();
    const r = saveBtn.getBoundingClientRect();
    const over = r.right - b.right;
    if (over > 0) bar.scrollBy({ left: over + 8, behavior: "smooth" });
  });
}

function initButtons({
  els,
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
}) {
  document.querySelector("#clearBtn").addEventListener("click", () => {
    if (!els.editor.value) {
      els.editor.focus();
      return;
    }
    setEditorText("", 0);
    hidePopover();
    render();
    saveText();
  });

  function insertAtCaret(text) {
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

  document.querySelector("#pasteBtn").addEventListener("click", async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.readText) {
        const text = await navigator.clipboard.readText();
        if (text) insertAtCaret(text);
        else if (!isTouch()) els.editor.focus();
        return;
      }
      throw new Error("no-api");
    } catch (_) {
      if (isTouch()) return;
      els.editor.focus();
      flash("#pasteBtn", "Ctrl+V");
    }
  });

  (function initCopyErrorsHold() {
    const btn = document.querySelector("#copyBtn");
    if (!btn) return;
    const HOLD = 500;
    let timer = null;
    let armed = false;
    let prevStatus = "";
    let revertTimer = null;
    const showStatus = (msg) => {
      setStatus(msg);
      clearTimeout(revertTimer);
      revertTimer = setTimeout(() => {
        if (els.status.innerHTML === msg) setStatus(prevStatus, false);
      }, 1600);
    };
    btn.addEventListener("pointerdown", () => {
      clearTimeout(timer);
      armed = false;
      timer = setTimeout(() => {
        armed = true;
        prevStatus = els.status.innerHTML;
        const hasWords = buildErrorList(getBadTokens()).length > 0;
        showStatus(hasWords ? "Алдаатай үгс хуулагдлаа" : "Алдаатай үг алга");
      }, HOLD);
    });
    const clear = () => clearTimeout(timer);
    btn.addEventListener("pointerup", clear);
    btn.addEventListener("pointercancel", clear);
    btn.addEventListener("pointerleave", clear);
    btn.addEventListener("contextmenu", (e) => e.preventDefault());
    btn.addEventListener("click", async () => {
      if (armed) {
        armed = false;
        const words = buildErrorList(getBadTokens()).map((t) => t.word);
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
        flash("#copyBtn", "Хууллаа");
      } catch (_) {
        flash("#copyBtn", "Боломжгүй");
      }
    });
  })();

  function copyText(str) {
    if (
      navigator.clipboard &&
      navigator.clipboard.writeText &&
      window.isSecureContext
    ) {
      return navigator.clipboard.writeText(str);
    }
    return new Promise((resolve, reject) => {
      try {
        const ta = document.createElement("textarea");
        ta.value = str;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.top = "-1000px";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ta.setSelectionRange(0, str.length);
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        ok ? resolve() : reject(new Error("exec"));
      } catch (e) {
        reject(e);
      }
    });
  }
}
