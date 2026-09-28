declare module "*.css";

declare module "*.md?raw" {
  const text: string;
  export default text;
}

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly BASE_URL: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __APP_VERSION__: string | undefined;
declare const __HUNSPELL_VERSION__: string | undefined;

interface Navigator {
  readonly userAgentData?: { readonly platform: string };
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: { description?: string; accept: Record<string, string[]> }[];
}

interface OpenFilePickerOptions {
  types?: { description?: string; accept: Record<string, string[]> }[];
  multiple?: boolean;
}

interface Window {
  showSaveFilePicker?(
    options?: SaveFilePickerOptions,
  ): Promise<FileSystemFileHandle>;
  showOpenFilePicker?(
    options?: OpenFilePickerOptions,
  ): Promise<FileSystemFileHandle[]>;
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}
