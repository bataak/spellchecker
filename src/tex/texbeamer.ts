import { TexSource } from "./texsource.ts";

const OVERLAY =
  /\\pause\b|\\[a-zA-Z]+\*?\s*<[^>\n]*>|\\begin\s*\{[^}]*\}\s*<|\[\s*<[^\]\n]*>\s*\]/g;
const FRAGILE_FRAME =
  /\\begin\s*\{frame\}\s*\[([^\]]*)\]([\s\S]*?)\\end\s*\{frame\}/g;
const NON_ASCII = /\P{ASCII}/u;

export function usesOverlay(text: string): boolean {
  return TexSource.of(text).matches(OVERLAY).length > 0;
}

export function singleSlideFrames(text: string): string {
  if (!text.includes("fragile")) return text;
  return TexSource.of(text).replace(
    FRAGILE_FRAME,
    (whole, options = "", body = "") => {
      const items = options.split(",").map((item) => item.trim());
      const eligible =
        items.includes("fragile") &&
        !items.includes("allowframebreaks") &&
        !options.includes("<") &&
        NON_ASCII.test(body) &&
        !usesOverlay(body);
      if (!eligible) return whole;
      const next = items.map((item) =>
        item === "fragile" ? "fragile=singleslide" : item,
      );
      return "\\begin{frame}[" + next.join(",") + "]" + body + "\\end{frame}";
    },
  );
}
