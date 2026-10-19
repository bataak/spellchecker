import { KEYS, at, read, write } from "../core/store.ts";

const REVOKE_MS = 1000;
const HINT_ID = "firefox-save";
const HINT_MS = 15000;

export const FIREFOX_SAVE_HINT =
  "Firefox файлыг асуулгүйгээр «Татаж авсан файлууд» хавтсанд хадгалдаг. " +
  "Хадгалах газраа сонгохыг хүсвэл Firefox-ийн Settings → General → " +
  "Files and Applications хэсэгт «Always ask you where to save files»-ийг асаана уу";

const listeners = new Set<() => void>();

export function onDownload(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_MS);
  for (const listener of listeners) listener();
}

export function asksWhereToSave(userAgent: string, picker: boolean): boolean {
  return (
    picker ||
    !/\bFirefox\//.test(userAgent) ||
    /\b(?:Android|Mobile)\b/.test(userAgent)
  );
}

export function initDownloadHint(
  hold: (html: string, ms?: number, animate?: boolean) => void,
): void {
  onDownload(() => {
    if (asksWhereToSave(navigator.userAgent, "showSaveFilePicker" in window))
      return;
    const key = at(KEYS.hintSeen, HINT_ID);
    if (read(key) === "1") return;
    write(key, "1");
    hold(FIREFOX_SAVE_HINT, HINT_MS, false);
  });
}
