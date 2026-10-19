import { downloadBlob } from "./download.ts";
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
  downloadBlob(new Blob([text], { type: textMime(fileName) }), fileName);
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
