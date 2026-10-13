import { stripInvisible } from "./office/sanitize.ts";

export const MANUAL_FIX_MAX = 200;

const LONE_SURROGATE =
  /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const NONCHARACTER = /[￾￿]/g;
const BREAKS = /[\t\n\r\f\v ]+/g;

export function cleanManualFix(raw: string, original: string): string | null {
  const text = stripInvisible(raw)
    .replace(LONE_SURROGATE, "")
    .replace(NONCHARACTER, "")
    .replace(BREAKS, " ")
    .trim();
  const capped = [...text].slice(0, MANUAL_FIX_MAX).join("").trim();
  if (!capped || capped === original) return null;
  return capped;
}
