import { setHtml, trustedHtml } from "../core/htmlutil.ts";
import type { Html } from "../core/htmlutil.ts";
export const PIN_ICON = trustedHtml(
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>',
);
export const PAUSE_ICON = trustedHtml(
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M9 5v14"/><path d="M15 5v14"/></svg>',
);
export const PLAY_ICON = trustedHtml(
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M7 5v14l11-7z"/></svg>',
);
export const PAUSE_LABEL = "Түр зогсоох (эсвэл Shift дарж барих)";
export const RESUME_LABEL = "Заагчийг чагнах (эсвэл Ctrl+Shift дарж үг шалгах)";
export const CLOSE_ICON = trustedHtml(
  '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" ' +
    'stroke="currentColor" stroke-width="2" stroke-linecap="round" ' +
    'stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
);

export function iconButton(
  className: string,
  icon: Html,
  label: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.title = label;
  button.setAttribute("aria-label", label);
  setHtml(button, icon);
  return button;
}
