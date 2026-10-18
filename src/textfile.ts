import { textMime } from "./filetypes.ts";

export function isDesktopApp(): boolean {
  if (!window.matchMedia) return false;
  const installed =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.matchMedia("(display-mode: window-controls-overlay)").matches ||
    window.matchMedia("(display-mode: minimal-ui)").matches;
  return installed && window.matchMedia("(pointer: fine)").matches;
}

export function downloadText(text: string, fileName: string): void {
  const blob = new Blob([text], { type: textMime(fileName) });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function deliverText(
  text: string,
  fileName: string,
): Promise<boolean> {
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && typeof navigator.canShare === "function") {
    const file = new File([text], fileName, { type: "text/plain" });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return true;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError")
          return false;
      }
    }
  }
  downloadText(text, fileName);
  return true;
}
