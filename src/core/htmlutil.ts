export const escapeHtml = (text: string): string =>
  text.replace(
    /[&<>]/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!,
  );

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function applyDataStyles(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-style]")) {
    el.style.cssText = el.dataset.style ?? "";
    el.removeAttribute("data-style");
  }
}
