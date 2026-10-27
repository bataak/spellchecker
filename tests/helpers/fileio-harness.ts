import { initFileIO, type FileIOControl } from "../../src/files/fileio.ts";
import { createSaveChain } from "../../src/ui/savechain.ts";
import type { EditorPort, StatusPort } from "../../src/core/ports.ts";

export interface SaveScenario {
  readonly text?: string;
  readonly officeActive?: boolean;
  readonly officeSave?: boolean | "throw";
  readonly pdfApplies?: boolean;
  readonly projectLabel?: string | null | "throw";
  readonly handle?: "ok" | "fail" | null;
  readonly fileName?: string | null;
  readonly deliver?: boolean | "throw";
  readonly desktop?: boolean;
  readonly picker?: "ok" | "abort" | "fail" | null;
  readonly source?: { readonly name: string; readonly inProject: boolean };
}

export interface SaveOutcome {
  readonly log: string[];
  readonly label: string | null;
  readonly handle: string | null;
}

class FakeEl {
  textContent = "";
  readonly dataset: Record<string, string> = {};
  readonly listeners = new Map<string, ((e?: unknown) => unknown)[]>();
  readonly classList = { add() {}, remove() {} };
  addEventListener(type: string, fn: (e?: unknown) => unknown): void {
    const list = this.listeners.get(type) ?? [];
    list.push(fn);
    this.listeners.set(type, list);
  }
  click(): void {}
}

function fakeHandle(name: string, ok: boolean, log: string[]) {
  return {
    name,
    async createWritable() {
      if (!ok) throw new Error("denied");
      return {
        write: async (data: string) => void log.push(`write:${name}:${data}`),
        close: async () => void log.push(`close:${name}`),
      };
    },
  } as unknown as FileSystemFileHandle;
}

export async function runSave(scenario: SaveScenario): Promise<SaveOutcome> {
  const log: string[] = [];
  const els = new Map<string, FakeEl>();
  const el = (sel: string): FakeEl => {
    let found = els.get(sel);
    if (!found) els.set(sel, (found = new FakeEl()));
    return found;
  };
  const g = globalThis as unknown as Record<string, unknown>;
  const win: Record<string, unknown> = {
    matchMedia: (query: string) => ({
      matches:
        (scenario.desktop ?? false) &&
        (query.includes("standalone") || query.includes("pointer: fine")),
    }),
  };
  if (scenario.picker !== null && scenario.picker !== undefined)
    win.showSaveFilePicker = async () => {
      log.push("picker");
      if (scenario.picker === "abort")
        throw new DOMException("x", "AbortError");
      if (scenario.picker === "fail") throw new Error("boom");
      return fakeHandle("picked.txt", true, log);
    };
  g.window = win;
  g.document = { querySelector: (sel: string) => el(sel) };

  const editorEl = new FakeEl() as unknown as HTMLTextAreaElement;
  (editorEl as unknown as { value: string }).value = scenario.text ?? "бичвэр";
  const io: FileIOControl = initFileIO({
    saveChain: createSaveChain(el("#saveBtn") as unknown as HTMLElement),
    buttons: {
      open: el("#openBtn") as unknown as HTMLElement,
      pick: el("#pickBtn") as unknown as HTMLElement,
      input: el("#openFile") as unknown as HTMLInputElement,
      save: el("#saveBtn") as unknown as HTMLElement,
    },
    editor: { el: editorEl } as unknown as EditorPort,
    status: { set: () => {}, hold: () => {} } as unknown as StatusPort,
    office: {
      active: () => scenario.officeActive ?? false,
      open: async () => true,
      close: () => {},
      save: async () => {
        log.push("office.save");
        if (scenario.officeSave === "throw") throw new Error("x");
        return scenario.officeSave ?? true;
      },
    },
    project: {
      save: async () => {
        log.push("project.save");
        if (scenario.projectLabel === "throw") throw new Error("x");
        return scenario.projectLabel ?? null;
      },
      openZip: async () => {},
      openDir: async () => {},
      openExisting: () => false,
    },
    pdf: {
      applies: () => scenario.pdfApplies ?? false,
      save: async () => void log.push("pdf.save"),
    },
    defaultExt: () => "md",
    onFileOpened: () => {},
    prepareOpen: async () => "new",
    onLoaded: () => {},
    onSaved: (written) => void log.push("saved:" + written),
    deliverText: async (text, name) => {
      log.push(`deliver:${name}:${text}`);
      if (scenario.deliver === "throw") throw new Error("x");
      return scenario.deliver ?? true;
    },
  });
  const name = scenario.fileName ?? null;
  io.putFile(
    name === null
      ? null
      : {
          name,
          handle:
            scenario.handle === null || scenario.handle === undefined
              ? null
              : fakeHandle(name, scenario.handle === "ok", log),
        },
  );
  if (scenario.source)
    await io.saveSource(scenario.source.name, scenario.source.inProject);
  else
    for (const fn of el("#saveBtn").listeners.get("click") ?? [])
      await fn({ shiftKey: false });
  await new Promise((resolve) => setImmediate(resolve));
  const label = el("#saveBtn").textContent || null;
  return { log, label, handle: io.targetHandle()?.name ?? null };
}
