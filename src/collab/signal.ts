export type SignalEvent =
  | { readonly t: "hi"; readonly id: string; readonly peers: string[] }
  | { readonly t: "join"; readonly id: string }
  | { readonly t: "bye"; readonly id: string }
  | { readonly t: "from"; readonly from: string; readonly d: string }
  | { readonly t: "kick"; readonly id: string }
  | { readonly t: "member"; readonly m: string }
  | { readonly t: "invited"; readonly i: string }
  | { readonly t: "members"; readonly list: RosterEntry[] };

export interface RosterEntry {
  readonly dev: string;
  readonly label: string;
  readonly online: boolean;
  readonly owner: boolean;
}

export type SignalState =
  "connecting" | "open" | "closed" | "full" | "denied" | "removed";

export interface SignalDeps {
  readonly url: () => string;
  readonly onEvent: (event: SignalEvent) => void;
  readonly onSnapshot: (data: Uint8Array) => void;
  readonly onState: (state: SignalState) => void;
}

export interface Signal {
  send(to: string, d: string): void;
  command(message: Record<string, unknown>): boolean;
  upload(data: Uint8Array): boolean;
  close(): void;
}

export const DENIED_CODE = 4003;
export const REMOVED_CODE = 4004;
export const FULL_CODE = 4009;
const FINAL: Record<number, SignalState> = {
  [DENIED_CODE]: "denied",
  [REMOVED_CODE]: "removed",
  [FULL_CODE]: "full",
};
const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 60_000;

const isText = (value: unknown): value is string => typeof value === "string";

function parseRoster(list: unknown[]): RosterEntry[] {
  const out: RosterEntry[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    if (!isText(v.dev)) continue;
    out.push({
      dev: v.dev,
      label: isText(v.l) ? v.l : "",
      online: v.on === true,
      owner: v.o === true,
    });
  }
  return out;
}

export function parseSignal(raw: string): SignalEvent | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  if (v.t === "hi" && isText(v.id) && Array.isArray(v.peers))
    return { t: "hi", id: v.id, peers: v.peers.filter(isText) };
  if ((v.t === "join" || v.t === "bye" || v.t === "kick") && isText(v.id))
    return { t: v.t, id: v.id };
  if (v.t === "from" && isText(v.from) && isText(v.d))
    return { t: "from", from: v.from, d: v.d };
  if (v.t === "member" && isText(v.m)) return { t: "member", m: v.m };
  if (v.t === "invited" && isText(v.i)) return { t: "invited", i: v.i };
  if (v.t === "members" && Array.isArray(v.list))
    return { t: "members", list: parseRoster(v.list) };
  return null;
}

export function retryDelay(attempt: number, jitter: number): number {
  const base = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** attempt);
  return Math.round(base * (0.5 + jitter / 2));
}

export function openSignal(deps: SignalDeps): Signal {
  let socket: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  const ready = (): boolean =>
    navigator.onLine !== false && document.visibilityState === "visible";

  const schedule = (): void => {
    if (closed || timer) return;
    if (!ready()) return;
    timer = setTimeout(
      () => {
        timer = null;
        connect();
      },
      retryDelay(attempt++, Math.random()),
    );
  };

  function connect(): void {
    if (closed || socket) return;
    deps.onState("connecting");
    const ws = new WebSocket(deps.url());
    ws.binaryType = "arraybuffer";
    socket = ws;
    ws.onopen = () => {
      attempt = 0;
      deps.onState("open");
    };
    ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (isText(event.data)) {
        const parsed = parseSignal(event.data);
        if (parsed) deps.onEvent(parsed);
      } else deps.onSnapshot(new Uint8Array(event.data));
    };
    ws.onclose = (event: CloseEvent) => {
      if (socket !== ws) return;
      socket = null;
      const final = FINAL[event.code];
      if (final) {
        closed = true;
        deps.onState(final);
        return;
      }
      deps.onState("closed");
      schedule();
    };
  }

  const wake = (): void => {
    if (!socket && !timer) schedule();
  };
  const onVisible = (): void => {
    if (document.visibilityState === "visible") wake();
  };
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", onVisible);
  connect();

  const live = (): WebSocket | null =>
    socket?.readyState === WebSocket.OPEN ? socket : null;

  return {
    send(to, d) {
      live()?.send(JSON.stringify({ t: "to", to, d }));
    },
    command(message) {
      const ws = live();
      ws?.send(JSON.stringify(message));
      return ws !== null;
    },
    upload(data) {
      const ws = live();
      if (!ws) return false;
      ws.send(data as Uint8Array<ArrayBuffer>);
      return true;
    },
    close() {
      closed = true;
      if (timer) clearTimeout(timer);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", onVisible);
      const ws = socket;
      socket = null;
      ws?.close();
    },
  };
}
