import type { createPdfPane } from "./pdfpane.ts";

export interface FileView {
  show(kind: "pdf" | "image", file: File): void;
  release(): void;
}

export function createFileView(
  body: HTMLElement,
  pane: ReturnType<typeof createPdfPane>,
  notice: (text: string) => void,
): FileView {
  let imageUrl: string | null = null;
  const release = (): void => {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageUrl = null;
  };
  return {
    show(kind, file) {
      body.classList.remove("is-empty");
      if (kind === "pdf") {
        body.replaceChildren();
        void pane.render(file, () => notice("PDF хуудсыг зурж чадсангүй"));
        return;
      }
      release();
      imageUrl = URL.createObjectURL(file);
      const image = document.createElement("img");
      image.className = "preview-image";
      image.alt = file.name;
      image.src = imageUrl;
      image.addEventListener("error", () =>
        notice("Зургийг харуулж чадсангүй"),
      );
      body.replaceChildren(image);
    },
    release,
  };
}
