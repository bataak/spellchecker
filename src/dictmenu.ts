const STORAGE_KEY = "mn-spell:en-variants";

export const EN_IDS = ["en_GB", "en_US"] as const;

const EN_SET = new Set<string>(EN_IDS);

const EN_LABEL: Record<string, string> = {
  en_GB: "Британи",
  en_US: "Америк",
};

export function parseEnabled(raw: string | null): Set<string> {
  if (raw == null) return new Set<string>(EN_IDS);
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return new Set<string>(EN_IDS);
  }
  if (!Array.isArray(data)) return new Set<string>(EN_IDS);
  const out = new Set<string>();
  for (const item of data) {
    if (typeof item === "string" && EN_SET.has(item)) out.add(item);
  }
  return out;
}

export function serializeEnabled(enabled: Set<string>): string {
  return JSON.stringify(EN_IDS.filter((id) => enabled.has(id)));
}

export function loadEnabledEnglish(): Set<string> {
  try {
    if (typeof localStorage === "undefined") return new Set<string>(EN_IDS);
    return parseEnabled(localStorage.getItem(STORAGE_KEY));
  } catch {
    return new Set<string>(EN_IDS);
  }
}

export function saveEnabledEnglish(enabled: Set<string>): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(STORAGE_KEY, serializeEnabled(enabled));
  } catch {
    /* хадгалах боломжгүй — алгасна */
  }
}

export function activeIds(enabled: Set<string>): string[] {
  return ["mn_MN", ...EN_IDS.filter((id) => enabled.has(id))];
}

export function visibleIds(loaded: string[], enabled: Set<string>): string[] {
  return loaded.filter((id) => !id.startsWith("en") || enabled.has(id));
}

export interface DictMenuOptions {
  statusEl: HTMLElement;
  getEnabled: () => Set<string>;
  onApply: (enabled: Set<string>) => void;
  onClose?: () => void;
}

export function initDictMenu(opts: DictMenuOptions): void {
  const { statusEl, getEnabled, onApply } = opts;
  let backdrop: HTMLElement | null = null;
  let dialog: HTMLElement | null = null;
  let lastFocus: HTMLElement | null = null;

  const boxes = (): HTMLInputElement[] =>
    dialog
      ? [...dialog.querySelectorAll<HTMLInputElement>("input.dict-en-box")]
      : [];

  function apply(): void {
    const next = new Set<string>();
    for (const box of boxes()) {
      if (box.checked && box.dataset.id) next.add(box.dataset.id);
    }
    saveEnabledEnglish(next);
    onApply(next);
  }

  function build(): void {
    backdrop = document.createElement("div");
    backdrop.className = "dict-backdrop";
    backdrop.hidden = true;
    backdrop.addEventListener("click", close);

    dialog = document.createElement("div");
    dialog.className = "dict-menu";
    dialog.hidden = true;
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    dialog.setAttribute("aria-label", "Толь сонгох");

    const title = document.createElement("p");
    title.className = "dict-menu-title";
    title.textContent = "Ашиглаж буй толь";
    dialog.appendChild(title);

    const mnRow = document.createElement("label");
    mnRow.className = "dict-row is-locked";
    const mnBox = document.createElement("input");
    mnBox.type = "checkbox";
    mnBox.checked = true;
    mnBox.disabled = true;
    const mnSpan = document.createElement("span");
    mnSpan.textContent = "Монгол";
    mnRow.appendChild(mnBox);
    mnRow.appendChild(mnSpan);
    dialog.appendChild(mnRow);

    for (const id of EN_IDS) {
      const row = document.createElement("label");
      row.className = "dict-row";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.className = "dict-en-box";
      box.dataset.id = id;
      box.addEventListener("change", apply);
      const span = document.createElement("span");
      span.textContent = EN_LABEL[id]!;
      row.appendChild(box);
      row.appendChild(span);
      dialog.appendChild(row);
    }

    const done = document.createElement("button");
    done.type = "button";
    done.className = "dict-menu-done";
    done.textContent = "Хаах";
    done.addEventListener("click", close);
    dialog.appendChild(done);

    document.body.appendChild(backdrop);
    document.body.appendChild(dialog);
  }

  function syncBoxes(): void {
    const enabled = getEnabled();
    for (const box of boxes()) {
      box.checked = !!box.dataset.id && enabled.has(box.dataset.id);
    }
  }

  function open(): void {
    if (!dialog || !backdrop) build();
    syncBoxes();
    lastFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    backdrop!.hidden = false;
    dialog!.hidden = false;
    document.body.classList.add("dict-menu-open");
    const first = boxes()[0];
    if (first) first.focus();
  }

  function close(): void {
    if (backdrop) backdrop.hidden = true;
    if (dialog) dialog.hidden = true;
    document.body.classList.remove("dict-menu-open");
    if (opts.onClose) opts.onClose();
    else if (lastFocus) lastFocus.focus();
  }

  const triggered = (e: Event): boolean => {
    const target = e.target instanceof Element ? e.target : null;
    return !!(target && target.closest(".dict-toggle"));
  };

  statusEl.addEventListener("click", (e) => {
    if (!triggered(e)) return;
    e.preventDefault();
    open();
  });

  statusEl.addEventListener("keydown", (e) => {
    if (e.code !== "Enter" && e.code !== "Space" && e.key !== "Enter") return;
    if (!triggered(e)) return;
    e.preventDefault();
    open();
  });

  document.addEventListener("keydown", (e) => {
    if (e.code === "Escape" && dialog && !dialog.hidden) close();
  });
}
