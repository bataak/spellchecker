import { escapeHtml } from "../core/htmlutil.ts";
import { readFailureMessage } from "./fileerror.ts";
import type { PreviewSource } from "../preview/preview.ts";
import { swapText } from "../editor/editortext.ts";
import type { EditorPort, StatusPort } from "../app/ports.ts";
import {
  dropOfficeFile,
  loadOfficeFile,
  saveOfficeFile,
} from "../core/storage.ts";
import type { OfficeMode } from "./mode.ts";

const PREPARE_HOLD_MS = 3000;

export interface OfficeSessionDeps {
  readonly editor: EditorPort;
  readonly status: StatusPort;
  readonly showSource: (source: PreviewSource) => void;
  readonly baseline: () => void;
  readonly syncFixButtons: () => void;
  readonly onModeChange: () => void;
}

export interface OfficeSession {
  active(): OfficeMode | null;
  file(): File | null;
  open(
    file: File,
    draftText?: string,
    cancelled?: () => boolean,
  ): Promise<boolean>;
  restore(name: string): Promise<boolean>;
  close(): void;
  park(slot: string): void;
  save(): Promise<boolean>;
  queue(op: () => Promise<void>): void;
  settled(): Promise<void>;
}

function isPdfFile(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name || "");
}

export function createOfficeSession(deps: OfficeSessionDeps): OfficeSession {
  const editor = deps.editor.el;
  const { set: setStatus, hold: holdStatus } = deps.status;
  let mode: OfficeMode | null = null;
  let modeFile: File | null = null;
  let ops: Promise<void> = Promise.resolve();

  const queue = (op: () => Promise<void>): void => {
    ops = ops.then(op).catch(() => undefined);
  };

  const detach = (): void => {
    mode = null;
    modeFile = null;
    editor.readOnly = false;
    document.body.classList.remove("docx-mode");
    deps.onModeChange();
  };

  const close = (): void => {
    if (!mode) return;
    detach();
    queue(() => dropOfficeFile());
  };

  const openPdf = async (file: File): Promise<boolean> => {
    deps.status.release();
    setStatus("PDF файлыг уншиж байна…");
    let text: string;
    let stallTimer: number | null = null;
    const armStall = (): void => {
      if (stallTimer) clearTimeout(stallTimer);
      stallTimer = window.setTimeout(() => {
        stallTimer = null;
        setStatus("Бичвэрийг бэлдэж байна…", false);
      }, 5000);
    };
    try {
      const mod = await import("../preview/pdftext.ts");
      armStall();
      text = await mod.extractPdfText(file, (page, total) => {
        armStall();
        if (total > 1)
          setStatus("PDF уншиж байна — " + page + " / " + total, false);
      });
    } catch (e) {
      if (stallTimer) clearTimeout(stallTimer);
      holdStatus(readFailureMessage(e, "PDF файлыг уншиж чадсангүй"));
      return true;
    }
    if (stallTimer) clearTimeout(stallTimer);
    holdStatus("Бичвэрийг бэлдэж байна…", PREPARE_HOLD_MS, false);
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve(null))),
    );
    close();
    await deps.editor.replace(text, text.length);
    deps.showSource({ kind: "pdf", file });
    return true;
  };

  const open = async (
    file: File,
    draftText?: string,
    cancelled?: () => boolean,
  ): Promise<boolean> => {
    if (isPdfFile(file)) return openPdf(file);
    let mod: typeof import("./mode.ts");
    try {
      mod = await import("./mode.ts");
    } catch {
      holdStatus("Баримт уншигчийг ачаалж чадсангүй");
      return true;
    }

    if (mod.officeFormat(file) === null) return false;

    let opened: OfficeMode;
    try {
      opened = await mod.openOfficeMode(file);
    } catch (e) {
      holdStatus(readFailureMessage(e, "Файлыг уншиж чадсангүй"));
      return true;
    }
    if (cancelled?.()) return true;
    mode = opened;
    modeFile = file;

    editor.readOnly = true;
    const source = opened.text();
    const changed = draftText !== undefined && draftText !== source;
    const restored = changed && opened.sync(source, draftText);
    if (changed && !restored)
      holdStatus("Өмнөх засваруудыг сэргээж чадсангүй", 8000);
    swapText(editor, restored ? draftText : source, {
      origin: "office",
      notify: false,
    });
    deps.baseline();
    if (draftText === undefined) queue(() => saveOfficeFile(file));
    deps.showSource({ kind: "office", name: file.name });
    document.body.classList.add("docx-mode");
    deps.onModeChange();
    deps.syncFixButtons();
    await deps.editor.settle();
    return true;
  };

  return {
    active: () => mode,
    file: () => modeFile,
    open,
    async restore(name) {
      const file = await loadOfficeFile().catch(() => null);
      if (!file || file.name !== name) return false;
      await open(file, editor.value);
      return mode !== null;
    },
    close,
    park(slot) {
      const file = modeFile;
      if (!mode || !file) return close();
      detach();
      queue(() => saveOfficeFile(file, slot).then(() => dropOfficeFile()));
    },
    async save() {
      if (!mode) return false;
      const out = await mode.save();
      if (out.delivered === "cancelled") return false;
      if (out.skipped > 0) {
        console.warn("docx: алгасагдсан засвар", out.skippedWords);
        const names = out.skippedWords
          .map(
            (item) => '"' + escapeHtml(item.word) + '" (' + item.reason + ")",
          )
          .join(", ");
        holdStatus(
          "Засагдсангүй: " +
            names +
            " — үлдсэн " +
            out.applied +
            " засвар хадгалагдлаа",
          12000,
        );
      }
      return true;
    },
    queue,
    settled: () => ops,
  };
}
