export interface TexModeDeps {
  readonly isTex: () => boolean;
  readonly paint: (on: boolean) => void;
  readonly changed: () => void;
}

export interface TexMode {
  readonly start: () => void;
  readonly sync: () => void;
}

export function createTexMode(deps: TexModeDeps): TexMode {
  let last: boolean | null = null;
  return {
    start() {
      last = deps.isTex();
      deps.paint(last);
    },
    sync() {
      if (last === null) return;
      const tex = deps.isTex();
      if (tex === last) return;
      last = tex;
      deps.paint(tex);
      deps.changed();
    },
  };
}
