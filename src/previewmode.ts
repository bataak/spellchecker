export interface PreviewModeDeps {
  readonly hasText: () => boolean;
  readonly setPaneAvailable: (on: boolean) => void;
  readonly setBodyMode: (on: boolean) => void;
  readonly setLayout: (blocked: boolean, wanted: boolean, tex: boolean) => void;
}

export interface PreviewMode {
  enter(markdown: boolean, tex: boolean): void;
  textChanged(): void;
  cleared(): void;
  templateChanged(): void;
}

export function createPreviewMode(deps: PreviewModeDeps): PreviewMode {
  let wanted = false;
  let cleared = false;

  const syncBody = (): void => deps.setBodyMode(wanted && !cleared);
  const syncPane = (): void => deps.setPaneAvailable(wanted && deps.hasText());

  return {
    enter(markdown, tex) {
      deps.setLayout(!markdown && !tex, markdown || tex, tex);
      wanted = markdown || tex;
      syncPane();
      syncBody();
    },
    textChanged() {
      syncPane();
      if (deps.hasText() && cleared) {
        cleared = false;
        syncBody();
      }
    },
    cleared() {
      cleared = true;
      syncBody();
    },
    templateChanged() {
      cleared = false;
    },
  };
}
