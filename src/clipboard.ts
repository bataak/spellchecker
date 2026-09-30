export function copyText(str: string): Promise<void> {
  if (
    navigator.clipboard &&
    navigator.clipboard.writeText &&
    window.isSecureContext
  ) {
    return navigator.clipboard.writeText(str);
  }
  return new Promise<void>((resolve, reject) => {
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

export function flash(sel: string, msg: string): void {
  const flashBtn = document.querySelector<HTMLElement>(sel);
  if (!flashBtn) return;
  const old = flashBtn.dataset.label || flashBtn.textContent || "";
  flashBtn.dataset.label = old;
  flashBtn.textContent = msg;
  setTimeout(() => {
    flashBtn.textContent = flashBtn.dataset.label ?? "";
  }, 1100);
}
