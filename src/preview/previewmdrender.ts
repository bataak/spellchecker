import { createMarkdownView } from "./previewmd.ts";
import { initImageEdit } from "./imageedit.ts";
import { createTidy } from "./previewtidy.ts";
import { createPreviewSync } from "./previewsync.ts";

const MD_NAME = /\.(md|markdown|mdown|mkd)$/i;

function noticeOf(text: string): HTMLElement {
  const note = document.createElement("p");
  note.className = "preview-notice";
  note.textContent = text;
  return note;
}

export function createMdRender(
  area: HTMLTextAreaElement,
  md: ReturnType<typeof createMarkdownView>,
  imageEdit: ReturnType<typeof initImageEdit>,
  tidy: ReturnType<typeof createTidy>,
  sync: ReturnType<typeof createPreviewSync>,
) {
  let raf = 0;
  let isMdFile = false;
  let markdownMode = false;
  return {
    schedule(): void {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const text = area.value;
        const blocks = md.render(text, () => imageEdit.refresh());
        tidy.markdown(text, blocks, isMdFile || markdownMode);
        void sync.flush();
      });
    },
    cancel(): void {
      if (raf) cancelAnimationFrame(raf);
    },
    file(name: string | null): void {
      isMdFile = MD_NAME.test(name ?? "");
    },
    markdown(on: boolean): boolean {
      if (on === markdownMode) return false;
      markdownMode = on;
      md.clear();
      return true;
    },
  };
}

export function noticeIn(
  panel: HTMLElement,
  body: HTMLElement,
  md: ReturnType<typeof createMarkdownView>,
): (text: string) => void {
  return (text) => {
    md.clear();
    body.replaceChildren(noticeOf(text));
    body.classList.remove("is-empty");
    panel.classList.add("is-blank");
  };
}
