import { PROJECT_SLOT } from "./fileslots.ts";

export interface TabGuardDeps {
  readonly slot: () => string;
  readonly project: () => string | null;
  readonly warn: (message: string) => void;
  readonly channel?: string;
  readonly delay?: number;
}

export interface TabGuard {
  readonly sync: () => void;
  readonly close: () => void;
}

interface TabState {
  readonly id: string;
  readonly slot: string;
  readonly project: string | null;
}

interface TabMessage extends TabState {
  readonly type: "hello" | "here" | "update" | "bye";
}

export const SAME_SLOT =
  "Бичвэр хөтчийн өөр талбарт мөн нээлттэй байгаа тул андуурагдаж дарагдахаас болгоомжил.";
export const OTHER_PROJECT =
  "Өөр табад өөр LaTeX төсөл нээлттэй байна. Апп зөвхөн нэг төсөл хадгалдаг тул хадгалаагүй засвар алдагдаж болно — нэг табаа хаана уу.";

export function conflictOf(
  mine: Omit<TabState, "id">,
  others: Iterable<TabState>,
): string | null {
  let otherProject = false;
  for (const other of others) {
    const sameProject = other.project === mine.project;
    if (other.slot === mine.slot && (mine.slot !== PROJECT_SLOT || sameProject))
      return SAME_SLOT;
    if (mine.project && other.project && !sameProject) otherProject = true;
  }
  return otherProject ? OTHER_PROJECT : null;
}

export function initTabGuard(deps: TabGuardDeps): TabGuard {
  if (typeof BroadcastChannel === "undefined")
    return { sync: () => {}, close: () => {} };
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const channel = new BroadcastChannel(deps.channel ?? "mn-spell:tabs");
  const others = new Map<string, TabState>();
  let shown: string | null = null;

  const mine = (): TabState => ({
    id,
    slot: deps.slot(),
    project: deps.project(),
  });

  const post = (type: TabMessage["type"]): void => {
    channel.postMessage({ type, ...mine() } satisfies TabMessage);
  };

  let timer: ReturnType<typeof setTimeout> | null = null;
  const check = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      const message = conflictOf(mine(), others.values());
      if (message !== null && message !== shown) deps.warn(message);
      shown = message;
    }, deps.delay ?? 1000);
  };

  channel.onmessage = (event: MessageEvent<TabMessage>) => {
    const { type, ...state } = event.data;
    if (state.id === id) return;
    if (type === "bye") others.delete(state.id);
    else others.set(state.id, state);
    if (type === "hello") post("here");
    check();
  };

  const rejoin = (): void => {
    others.clear();
    shown = null;
    post("hello");
  };

  const onVisible = (): void => {
    if (document.visibilityState !== "visible") return;
    rejoin();
  };
  const onHide = (): void => post("bye");

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", onHide);
  }
  post("hello");

  return {
    sync(): void {
      post("update");
      check();
    },
    close(): void {
      if (timer) clearTimeout(timer);
      post("bye");
      channel.close();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("pagehide", onHide);
      }
    },
  };
}
