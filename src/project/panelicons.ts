export const ICON = {
  folder:
    '<path d="M1.5 4.2c0-.8.6-1.4 1.4-1.4h3.3l1.5 1.7h5.4c.8 0 1.4.6 1.4 1.4v6.6c0 .8-.6 1.4-1.4 1.4H2.9c-.8 0-1.4-.6-1.4-1.4z"/>',
  file: '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3"/>',
  newFile:
    '<path d="M3.5 1.5h6l3 3v10h-9z"/><path d="M9.5 1.5v3h3M8 7.5v4.5M5.75 9.75h4.5"/>',
  newFolder:
    '<path d="M1.5 4.2c0-.8.6-1.4 1.4-1.4h3.3l1.5 1.7h5.4c.8 0 1.4.6 1.4 1.4v6.6c0 .8-.6 1.4-1.4 1.4H2.9c-.8 0-1.4-.6-1.4-1.4z"/><path d="M8 7v4.5M5.75 9.25h4.5"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  more: '<circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
  refresh:
    '<path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9"/><path d="M12.2 1.8v2.6H9.6"/>',
} as const;

export const GLYPH =
  '<svg viewBox="0 0 18 14" class="project-glyph" aria-hidden="true">' +
  '<rect x="1" y="1" width="16" height="12" rx="2.25" class="project-glyph-frame"/>' +
  '<rect x="3.5" y="3.4" width="5.5" height="1.7" rx=".6" class="project-glyph-slot"/>' +
  '<rect x="6" y="6.15" width="7.5" height="1.7" rx=".6" class="project-glyph-slot"/>' +
  '<rect x="6" y="8.9" width="7.5" height="1.7" rx=".6" class="project-glyph-slot"/>' +
  "</svg>";

export function icon(body: string, size = 16): string {
  return (
    '<svg viewBox="0 0 16 16" width="' +
    size +
    '" height="' +
    size +
    '" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">' +
    body +
    "</svg>"
  );
}

export function headButton(label: string, body: string): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "project-act";
  button.title = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon(body);
  button.addEventListener("mousedown", (event) => event.preventDefault());
  return button;
}

export function textButton(
  className: string,
  label: string,
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  return button;
}
