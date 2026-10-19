import { initTabGuard, type TabGuard } from "../core/tabguard.ts";

export interface TabWatchDeps {
  readonly slot: () => string;
  readonly project: () => string | null;
  readonly onProjectChange: (listener: () => void) => unknown;
  readonly warn: (message: string) => void;
}

export function watchTabs(deps: TabWatchDeps): TabGuard {
  const guard = initTabGuard(deps);
  let guarded: string | null = null;
  deps.onProjectChange(() => {
    const uid = deps.project();
    if (uid === guarded) return;
    guarded = uid;
    guard.sync();
  });
  return guard;
}
