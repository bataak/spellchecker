declare module "*.css";

declare module "*.md?raw" {
  const text: string;
  export default text;
}

declare module "*.tex?raw" {
  const text: string;
  export default text;
}

interface ImportMetaEnv {
  readonly DEV: boolean;
  readonly BASE_URL: string;
  readonly VITE_TEX_PACKAGES_URL?: string;
  readonly VITE_GIT_AUTH_URL?: string;
  readonly VITE_COLLAB_URL?: string;
  readonly VITE_GITHUB_CLIENT_ID?: string;
  readonly VITE_GITLAB_CLIENT_ID?: string;
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
  showDirectoryPicker?(options?: {
    mode?: "read" | "readwrite";
    startIn?: FileSystemHandle;
  }): Promise<FileSystemDirectoryHandle>;
}

interface FileSystemHandle {
  queryPermission?(descriptor?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
  requestPermission?(descriptor?: {
    mode?: "read" | "readwrite";
  }): Promise<PermissionState>;
}

interface DataTransferItem {
  getAsFileSystemHandle?(): Promise<FileSystemHandle | null>;
}
