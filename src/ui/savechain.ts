export interface SaveTrigger {
  readonly shift: boolean;
}

export type SaveStep = (trigger: SaveTrigger) => boolean;

export interface SaveChain {
  readonly intercept: (step: SaveStep) => () => void;
  readonly handle: (step: SaveStep) => () => void;
  readonly run: (trigger: SaveTrigger) => void;
}

export function createSaveChain(button: HTMLElement | null): SaveChain {
  const interceptors: SaveStep[] = [];
  const handlers: SaveStep[] = [];
  const add =
    (list: SaveStep[]) =>
    (step: SaveStep): (() => void) => {
      list.push(step);
      return () => {
        const index = list.indexOf(step);
        if (index >= 0) list.splice(index, 1);
      };
    };
  const run = (trigger: SaveTrigger): void => {
    for (const step of [...interceptors, ...handlers])
      if (step(trigger)) return;
  };
  button?.addEventListener("click", (event) =>
    run({ shift: (event as MouseEvent).shiftKey }),
  );
  return { intercept: add(interceptors), handle: add(handlers), run };
}
