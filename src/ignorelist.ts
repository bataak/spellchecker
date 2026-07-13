import {
  getIgnored,
  addIgnored,
  removeIgnored,
  clearIgnored,
} from "./ignore.ts";

let overlay: HTMLDivElement | null = null;
let onChange: (() => void) | null = null;

function escapeChip(text: string): string {
  return text.replace(/[&<>"]/g, (char) => {
    if (char === "&") return "&amp;";
    if (char === "<") return "&lt;";
    if (char === ">") return "&gt;";
    return "&quot;";
  });
}

function renderList(): void {
  const box = overlay!.querySelector(".ignore-chips")!;
  const words = getIgnored();
  const empty = overlay!.querySelector<HTMLElement>(".ignore-empty")!;
  const clearBtn = overlay!.querySelector<HTMLButtonElement>(".ignore-clear")!;
  const exportBtn =
    overlay!.querySelector<HTMLButtonElement>(".ignore-export")!;
  const cnt = overlay!.querySelector(".ignore-count");
  if (cnt) cnt.textContent = words.length ? "(" + words.length + ")" : "";
  clearBtn.hidden = words.length < 2;
  exportBtn.disabled = words.length === 0;
  if (!words.length) {
    box.innerHTML = "";
    empty.hidden = false;
    return;
  }
  empty.hidden = true;
  box.innerHTML = words
    .map(
      (word) =>
        '<span class="suggest-chip">' +
        escapeChip(word) +
        '<button type="button" class="suggest-chip-x" data-w="' +
        escapeChip(word) +
        '" aria-label="Хасах">&times;</button></span>',
    )
    .join("");
  box.querySelectorAll<HTMLElement>(".suggest-chip-x").forEach((btn) => {
    btn.addEventListener("click", () => {
      removeIgnored(btn.dataset.w ?? "");
      renderList();
      syncIgnoreVisibility();
      if (onChange) onChange();
    });
  });
}

function doExport(): void {
  const words = getIgnored();
  if (!words.length) return;
  const blob = new Blob([words.join("\n") + "\n"], {
    type: "text/plain;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const downloadLink = document.createElement("a");
  downloadLink.href = url;
  downloadLink.download = "algasah-ugs.txt";
  document.body.appendChild(downloadLink);
  downloadLink.click();
  downloadLink.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const APOS = /['\u2019]/g;
const HAS_LATIN = /[A-Za-z\u00C0-\u024F]/;
const LATIN_WORD_RE =
  /^[A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F'\u2019-]{1,49}$/;
const CYR_WORD_RE = /^[\u0400-\u04FF][\u0400-\u04FF-]{1,49}$/u;

export function normalizeImport(raw: string): string | null {
  const trimmedWord = raw.trim();
  if (!trimmedWord) return null;
  if (HAS_LATIN.test(trimmedWord)) {
    return LATIN_WORD_RE.test(trimmedWord) ? trimmedWord : null;
  }
  const stripped = trimmedWord.replace(APOS, "");
  return CYR_WORD_RE.test(stripped) ? stripped : null;
}

function doImport(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    const text = String(reader.result || "");
    let added = 0;
    for (const part of text.split(/[\s,;]+/)) {
      const importedWord = normalizeImport(part);
      if (!importedWord) continue;
      if (addIgnored(importedWord)) added++;
    }
    renderList();
    syncIgnoreVisibility();
    if (added && onChange) onChange();
  };
  reader.readAsText(file);
}

function closeForm(): void {
  if (!overlay || overlay.hidden) return;
  overlay.hidden = true;
}

function build(): void {
  overlay = document.createElement("div");
  overlay.className = "suggest-overlay ignore-overlay";
  overlay.hidden = true;
  overlay.innerHTML =
    '<div class="suggest-card" role="dialog" aria-modal="true" aria-labelledby="ignoreTitle">' +
    '<h2 id="ignoreTitle" class="suggest-title">\u0428\u0430\u043B\u0433\u0430\u043B\u0442\u044B\u0433 \u0430\u043B\u0433\u0430\u0441\u0430\u0445 \u04AF\u0433 <span class="ignore-count" aria-hidden="true"></span></h2>' +
    '<p class="suggest-hint">\u042D\u0434\u0433\u044D\u044D\u0440 \u04AF\u0433\u0441\u0438\u0439\u0433 \u0430\u043B\u0434\u0430\u0430\u043D\u0434 \u0442\u043E\u043E\u0446\u043E\u0445\u0433\u04AF\u0439 (\u0443\u043B\u0430\u0430\u043D\u0430\u0430\u0440 \u0437\u0443\u0440\u0430\u0445\u0433\u04AF\u0439).</p>' +
    '<div class="ignore-chips"></div>' +
    '<p class="ignore-empty suggest-hint" hidden>\u0410\u043B\u0433\u0430\u0441\u0430\u0445 \u04AF\u0433 \u0430\u043B\u0433\u0430.</p>' +
    '<div class="suggest-actions ignore-actions">' +
    '<div class="ignore-actions-left">' +
    '<button type="button" class="tbtn ignore-export">\u042D\u043A\u0441\u043F\u043E\u0440\u0442</button>' +
    '<button type="button" class="tbtn ignore-import">\u0418\u043C\u043F\u043E\u0440\u0442</button>' +
    '<button type="button" class="tbtn ignore-clear">\u0423\u0441\u0442\u0433\u0430\u0445</button>' +
    "</div>" +
    '<button type="button" class="tbtn ignore-close">\u0425\u0430\u0430\u0445</button>' +
    "</div>" +
    '<input type="file" class="ignore-file" accept=".txt,text/plain" hidden />' +
    "</div>";
  document.body.appendChild(overlay);

  overlay.addEventListener("pointerdown", (e) => {
    if (e.target === overlay) closeForm();
  });
  overlay.querySelector(".ignore-close")!.addEventListener("click", closeForm);
  overlay.querySelector(".ignore-export")!.addEventListener("click", doExport);

  const fileInput = overlay.querySelector<HTMLInputElement>(".ignore-file")!;
  overlay.querySelector(".ignore-import")!.addEventListener("click", () => {
    fileInput.click();
  });
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) doImport(fileInput.files[0]);
    fileInput.value = "";
  });

  overlay.querySelector(".ignore-clear")!.addEventListener("click", () => {
    if (clearIgnored()) {
      renderList();
      syncIgnoreVisibility();
      if (onChange) onChange();
      closeForm();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (!overlay!.hidden && e.key === "Escape") closeForm();
  });
}

function openForm(): void {
  if (!overlay) build();
  overlay!.hidden = false;
  renderList();
}

export function syncIgnoreVisibility(): void {
  document
    .querySelectorAll<HTMLAnchorElement>("a.ignorectl, a.ignore-list-link")
    .forEach((link) => {
      link.classList.remove("link-disabled");
    });
}

export function initIgnoreList(options?: { onChange?: () => void }): void {
  onChange = (options && options.onChange) || null;
  document
    .querySelectorAll<HTMLAnchorElement>("a.ignorectl, a.ignore-list-link")
    .forEach((link) => {
      link.addEventListener("click", (e) => {
        e.preventDefault();
        openForm();
      });
    });
  syncIgnoreVisibility();
}
