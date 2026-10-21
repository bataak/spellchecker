export interface MarkupMode {
  readonly skips: () => boolean;
  readonly enter: (on: boolean) => void;
}

export interface MarkupModeDeps {
  readonly isMarkdownFile: () => boolean;
  readonly render: () => Promise<void>;
  readonly entered: (on: boolean) => void;
}

export function createMarkupMode(deps: MarkupModeDeps): MarkupMode {
  let skips = false;
  return {
    skips: () => skips,
    enter(on) {
      const markup = on || deps.isMarkdownFile();
      if (markup !== skips) {
        skips = markup;
        void deps.render();
      }
      deps.entered(on);
    },
  };
}
