import type { StatusControl } from "../ui/status.ts";

export type StatusPort = StatusControl;

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

export interface EditorPortDeps {
  readonly el: HTMLTextAreaElement;
  readonly set: (text: string, caret: number | null) => void;
  readonly insert: (text: string, start: number, end: number) => void;
  readonly render: () => Promise<void>;
  readonly save: () => void;
  readonly hidePopover: () => void;
}

export function createEditorPort(deps: EditorPortDeps): EditorPort {
  const { el, set, render, save } = deps;
  const settle = (): Promise<void> => {
    deps.hidePopover();
    save();
    return render();
  };
  return {
    el,
    set,
    insert: deps.insert,
    render,
    save,
    settle,
    replace(text, caret) {
      set(text, caret);
      return settle();
    },
    async reformat(text, caret) {
      const { scrollTop, scrollLeft } = el;
      const restoreView = (): void => {
        el.scrollTop = scrollTop;
        el.scrollLeft = scrollLeft;
      };
      set(text, caret);
      restoreView();
      save();
      await render();
      restoreView();
      requestAnimationFrame(() => requestAnimationFrame(restoreView));
    },
  };
}
