export function family(name: string): string {
  return '"' + name + '"';
}

export function fontFaces(fontBase: string): string {
  const url = (file: string): string => fontBase + file;
  const face = (name: string, file: string, weight: number, style: string) =>
    "@font-face{font-family:" +
    family(name) +
    ';src:url("' +
    url(file) +
    '") format("woff2");font-weight:' +
    String(weight) +
    ";font-style:" +
    style +
    "}";
  return (
    face("Bichig Serif", "pt-serif-mn-400-v1.woff2", 400, "normal") +
    face("Bichig Serif", "pt-serif-mn-700-v1.woff2", 700, "normal") +
    face("Bichig Serif", "pt-serif-mn-italic-v2.woff2", 400, "italic") +
    face("Bichig Mono", "dejavu-mono-mn-400-v1.woff2", 400, "normal") +
    face(
      "Bichig Print Serif",
      "bichig-print-serif-mn-400-v1.woff2",
      400,
      "normal",
    ) +
    face(
      "Bichig Print Serif",
      "bichig-print-serif-mn-700-v1.woff2",
      700,
      "normal",
    ) +
    face(
      "Bichig Print Serif",
      "bichig-print-serif-mn-400i-v1.woff2",
      400,
      "italic",
    ) +
    face(
      "Bichig Print Serif",
      "bichig-print-serif-mn-700i-v1.woff2",
      700,
      "italic",
    ) +
    face(
      "Bichig Print Sans",
      "bichig-print-sans-mn-400-v1.woff2",
      400,
      "normal",
    ) +
    face(
      "Bichig Print Sans",
      "bichig-print-sans-mn-700-v1.woff2",
      700,
      "normal",
    ) +
    face(
      "Bichig Print Sans",
      "bichig-print-sans-mn-400i-v1.woff2",
      400,
      "italic",
    ) +
    face(
      "Bichig Print Sans",
      "bichig-print-sans-mn-700i-v1.woff2",
      700,
      "italic",
    ) +
    face(
      "Bichig Print Mono",
      "bichig-print-mono-mn-400-v1.woff2",
      400,
      "normal",
    ) +
    face(
      "Bichig Print Mono",
      "bichig-print-mono-mn-700-v1.woff2",
      700,
      "normal",
    ) +
    face(
      "Bichig Print Mono",
      "bichig-print-mono-mn-400i-v1.woff2",
      400,
      "italic",
    ) +
    face(
      "Bichig Print Mono",
      "bichig-print-mono-mn-700i-v1.woff2",
      700,
      "italic",
    )
  );
}

export function printFontBase(): string {
  return new URL(import.meta.env.BASE_URL + "fonts/", location.href).href;
}
