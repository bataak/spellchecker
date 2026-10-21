export interface StatusPort {
  readonly set: (html: string, animate?: boolean) => void;
  readonly hold: (html: string, ms?: number, animate?: boolean) => void;
  readonly release: () => void;
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
