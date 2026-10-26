import { saveTypes, stampName, textName } from "./filetypes.ts";
import { isDesktopApp } from "./textfile.ts";
import { flash } from "../ui/clipboard.ts";
import { attemptAsync } from "../core/attempt.ts";
import { noteError } from "../core/errorlog.ts";
import type {
  CurrentFile,
  OfficeFiles,
  PdfSave,
  ProjectFiles,
  SaveSource,
} from "./fileports.ts";

export interface FileSaveDeps {
  readonly text: () => string;
  readonly current: CurrentFile;
  readonly office: OfficeFiles;
  readonly project: ProjectFiles;
  readonly pdf: PdfSave;
  readonly defaultExt: () => string;
  readonly onSaved: (written: boolean) => void;
  readonly deliverText: (text: string, fileName: string) => Promise<boolean>;
  readonly button: HTMLElement | null;
}

export type SaveFile = (source?: SaveSource) => Promise<void>;

async function writeTo(
  handle: FileSystemFileHandle,
  text: string,
): Promise<void> {
  const writableStream = await handle.createWritable();
  await writableStream.write(text);
  await writableStream.close();
}

export function stampFor(ext: string): string {
  return stampName(
    ext,
    window.matchMedia?.("(max-width: 700px)").matches ?? false,
    new Date(),
  );
}

async function saveOffice(
  office: OfficeFiles,
  saved: (label: string) => void,
): Promise<boolean> {
  if (!office.active()) return false;
  try {
    saved((await office.save()) ? "Хадгаллаа" : "Цуцаллаа");
  } catch (error) {
    noteError(error);
    saved("Боломжгүй");
  }
  return true;
}

export function createFileSave(d: FileSaveDeps): SaveFile {
  const { current } = d;
  const saved = (label: string): void => flash(d.button, label);
  const stamp = (): string => stampFor(d.defaultExt());
  const deliver = (text: string, name: string): Promise<boolean> =>
    d.deliverText(text, textName(name, d.defaultExt(), stamp));

  async function savePdf(source?: SaveSource): Promise<boolean> {
    if (source || !d.pdf.applies()) return false;
    await d.pdf.save();
    return true;
  }

  async function saveProject(source?: SaveSource): Promise<boolean> {
    if (source) return false;
    try {
      const label = await d.project.save();
      if (label === null) return false;
      saved(label);
    } catch (error) {
      noteError(error);
      saved("Боломжгүй");
    }
    return true;
  }

  async function writeOpenFile(
    text: string,
    source?: SaveSource,
  ): Promise<boolean> {
    const handle = current.handle;
    if (!handle) return false;
    if (source && (source.inProject || source.name !== current.name))
      return false;
    const written = await attemptAsync(
      async () => {
        await writeTo(handle, text);
        return true;
      },
      false,
      noteError,
    );
    if (!written) return false;
    saved("Хадгаллаа");
    if (!source?.inProject) d.onSaved(true);
    return true;
  }

  async function deliverNamed(
    text: string,
    source?: SaveSource,
  ): Promise<boolean> {
    const fileName = source?.name ?? current.name;
    if (!fileName) {
      if (text.trim()) return false;
      saved("Хоосон байна");
      return true;
    }
    try {
      const done = await deliver(text, fileName);
      saved(done ? "Хадгалав" : "Цуцаллаа");
      if (done && !source?.inProject) d.onSaved(false);
    } catch (error) {
      noteError(error);
      saved("Боломжгүй");
    }
    return true;
  }

  async function pickAndWrite(text: string): Promise<boolean> {
    if (!isDesktopApp() || !("showSaveFilePicker" in window)) return false;
    try {
      const handle = await window.showSaveFilePicker!({
        suggestedName: stamp(),
        types: saveTypes(d.defaultExt()),
      });
      await writeTo(handle, text);
      current.handle = handle;
      saved("Хадгаллаа");
      d.onSaved(true);
      return true;
    } catch (e) {
      return e instanceof DOMException && e.name === "AbortError";
    }
  }

  async function deliverStamped(text: string): Promise<void> {
    try {
      const done = await deliver(text, stamp());
      saved(done ? "Хадгаллаа" : "Цуцаллаа");
    } catch (error) {
      noteError(error);
      saved("Боломжгүй");
    }
  }

  return async (source) => {
    if (await saveOffice(d.office, saved)) return;
    if (await savePdf(source)) return;
    if (await saveProject(source)) return;
    const text = d.text();
    if (await writeOpenFile(text, source)) return;
    if (await deliverNamed(text, source)) return;
    if (await pickAndWrite(text)) return;
    await deliverStamped(text);
  };
}
