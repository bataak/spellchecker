declare const HTML_BRAND: unique symbol;

export type Html = string & { readonly [HTML_BRAND]: true };

export const trustedHtml = (markup: string): Html => markup as Html;

export const escapeHtml = (text: string): Html =>
  trustedHtml(
    text.replace(
      /[&<>]/g,
      (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[char]!,
    ),
  );

export function escapeAttr(value: string): Html {
  return trustedHtml(
    value
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;"),
  );
}

export function html(
  parts: TemplateStringsArray,
  ...values: readonly (Html | number)[]
): Html {
  let markup = parts[0]!;
  values.forEach((value, index) => {
    markup += String(value) + parts[index + 1]!;
  });
  return trustedHtml(markup);
}

export const joinHtml = (
  items: readonly Html[],
  separator: Html = html``,
): Html => trustedHtml(items.join(separator));

export function setHtml(element: Element, markup: Html): void {
  element.innerHTML = markup;
}

export function applyDataStyles(root: ParentNode): void {
  for (const el of root.querySelectorAll<HTMLElement>("[data-style]")) {
    el.style.cssText = el.dataset.style ?? "";
    el.removeAttribute("data-style");
  }
}
