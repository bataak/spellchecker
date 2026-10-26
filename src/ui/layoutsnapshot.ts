import { KEYS, writeJson } from "../core/store.ts";

const SKIPPED = new Set(["theme"]);

const pending = new Map<string, () => void>();

function holdsRestoredLayout(root: HTMLElement): boolean {
  return (
    root.classList.contains("booting") &&
    root.classList.contains("layout-restored")
  );
}

export function afterBoot(key: string, run: () => void): void {
  const root = document.documentElement;
  if (!holdsRestoredLayout(root)) {
    pending.delete(key);
    run();
    return;
  }
  if (pending.size === 0) {
    const observer = new MutationObserver(() => {
      if (holdsRestoredLayout(root)) return;
      observer.disconnect();
      const runs = [...pending.values()];
      pending.clear();
      for (const later of runs) later();
    });
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
  }
  pending.set(key, run);
}

export interface LayoutSnapshot {
  readonly width: number;
  readonly data: Readonly<Record<string, string>>;
  readonly style: Readonly<Record<string, string>>;
}

export function takeLayoutSnapshot(
  root: HTMLElement,
  width: number,
): LayoutSnapshot {
  const data: Record<string, string> = {};
  for (const [key, value] of Object.entries(root.dataset))
    if (value !== undefined && !SKIPPED.has(key)) data[key] = value;
  const style: Record<string, string> = {};
  for (let i = 0; i < root.style.length; i++) {
    const name = root.style.item(i);
    if (name.startsWith("--")) style[name] = root.style.getPropertyValue(name);
  }
  return { width, data, style };
}

export function keepLayoutOnReload(): void {
  window.addEventListener("pagehide", () => {
    writeJson(
      KEYS.layoutSnapshot,
      takeLayoutSnapshot(document.documentElement, window.innerWidth),
    );
  });
}
