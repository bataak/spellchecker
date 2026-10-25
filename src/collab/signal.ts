import {
  finalCode,
  finalState,
  isText,
  joinParts,
  parseSignal,
  snapshotParts,
  splitSnapshot,
  type SignalEvent,
  type SignalState,
} from "./signalwire.ts";

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
  sleep(): void;
  resume(): void;
  close(): void;
}

const MIN_RETRY_MS = 1000;
const MAX_RETRY_MS = 60_000;

function gatherer(done: (data: Uint8Array) => void) {
  let want = 0;
  let parts: Uint8Array[] = [];
  return {
    expect(n: number): void {
      want = n;
      parts = [];
    },
    take(part: Uint8Array): void {
      if (!want) return done(part);
      parts.push(part);
      if (parts.length < want) return;
      want = 0;
      done(joinParts(parts));
      parts = [];
    },
  };
}

export function retryDelay(attempt: number, jitter: number): number {
  const base = Math.min(MAX_RETRY_MS, MIN_RETRY_MS * 2 ** attempt);
  return Math.round(base * (0.5 + jitter / 2));
}

function senders(
  live: () => WebSocket | null,
): Pick<Signal, "send" | "command" | "upload"> {
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
      const parts = splitSnapshot(data);
      if (parts.length > 1)
        ws.send(JSON.stringify({ t: "snap", n: parts.length }));
      for (const part of parts) ws.send(part as Uint8Array<ArrayBuffer>);
      return true;
    },
  };
}

export function openSignal(deps: SignalDeps): Signal {
  let socket: WebSocket | null = null;
  let attempt = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;
  let sleeping = false;

  const ready = (): boolean =>
    !sleeping &&
    navigator.onLine !== false &&
    document.visibilityState === "visible";

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

  function finish(ws: WebSocket, code: number): boolean {
    const final = finalState(code);
    if (!final || socket !== ws) return false;
    socket = null;
    closed = true;
    deps.onState(final);
    ws.close();
    return true;
  }

  function connect(): void {
    if (closed || sleeping || socket) return;
    deps.onState("connecting");
    const ws = new WebSocket(deps.url());
    ws.binaryType = "arraybuffer";
    socket = ws;
    const snapshot = gatherer(deps.onSnapshot);
    ws.onopen = () => {
      attempt = 0;
      deps.onState("open");
    };
    ws.onmessage = (event: MessageEvent<string | ArrayBuffer>) => {
      if (!isText(event.data)) return snapshot.take(new Uint8Array(event.data));
      const parts = snapshotParts(event.data);
      if (parts !== null) return snapshot.expect(parts);
      const code = finalCode(event.data);
      if (code !== null) return void finish(ws, code);
      const parsed = parseSignal(event.data);
      if (parsed) deps.onEvent(parsed);
    };
    ws.onclose = (event: CloseEvent) => {
      if (socket !== ws || finish(ws, event.code)) return;
      socket = null;
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
    ...senders(live),
    sleep() {
      if (closed || sleeping) return;
      sleeping = true;
      if (timer) clearTimeout(timer);
      timer = null;
      const ws = socket;
      socket = null;
      if (!ws) return;
      ws.close();
      deps.onState("closed");
    },
    resume() {
      if (closed || !sleeping) return;
      sleeping = false;
      attempt = 0;
      if (!socket && !timer) connect();
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
