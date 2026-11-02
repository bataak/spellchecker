import type { Html } from "./htmlutil.ts";

export interface StatusPort {
  readonly set: (markup: Html, animate?: boolean) => void;
  readonly hold: (markup: Html, ms?: number, animate?: boolean) => void;
  readonly release: () => void;
  readonly shown: () => Html;
}

export interface EditorPort {
  readonly el: HTMLTextAreaElement;
  set(text: string, caret: number | null): void;
  insert(text: string, start: number, end: number): void;
  render(): Promise<void>;
  save(): void;
  settle(): Promise<void>;
  replace(text: string, caret: number | null): Promise<void>;
  reformat(text: string, caret: number): Promise<void>;
}
