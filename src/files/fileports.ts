export interface FileButtons {
  readonly open: HTMLElement | null;
  readonly pick: HTMLElement | null;
  readonly input: HTMLInputElement | null;
  readonly save: HTMLElement | null;
}

export interface OfficeFiles {
  readonly active: () => boolean;
  readonly open: (file: File) => Promise<boolean>;
  readonly close: () => void;
  readonly save: () => Promise<boolean>;
}

export interface ProjectFiles {
  readonly save: () => Promise<string | null>;
  readonly openZip: (file: File) => Promise<void>;
  readonly openDir: (handle: FileSystemDirectoryHandle) => Promise<void>;
  readonly openExisting: (name: string, text: string) => boolean;
}

export interface PdfSave {
  readonly applies: () => boolean;
  readonly save: () => Promise<void>;
}

export interface CurrentFile {
  handle: FileSystemFileHandle | null;
  name: string | null;
  stamp: number | null;
}

export interface SaveSource {
  readonly name: string;
  readonly inProject: boolean;
}
