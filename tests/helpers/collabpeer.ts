import NodeSocket from "ws";
import { randomId, type newLink } from "../../src/collab/collabkey.ts";
import {
  startSession,
  type Session,
  type SessionDeps,
  type SessionStatus,
} from "../../src/collab/session.ts";
import type { Access } from "../../src/collab/collabrooms.ts";

export const ORIGIN = "http://localhost";

export function installSocket(): () => void {
  const target = globalThis as Record<string, unknown>;
  const saved = target.WebSocket;
  target.WebSocket = class extends NodeSocket {
    constructor(url: string | URL) {
      super(url, { headers: { Origin: ORIGIN } });
    }
  };
  return () => {
    target.WebSocket = saved;
  };
}

export async function until(
  ok: () => boolean,
  what: string,
  timeout = 10000,
): Promise<void> {
  const end = Date.now() + timeout;
  while (!ok()) {
    if (Date.now() > end) throw new Error("timeout: " + what);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

export function typeAt(
  editor: HTMLTextAreaElement,
  at: number,
  text: string,
): void {
  editor.setRangeText(text, at, at, "end");
  editor.dispatchEvent(
    new InputEvent("input", { inputType: "insertText", data: text }),
  );
}

export interface Peer {
  readonly session: Session;
  readonly editor: HTMLTextAreaElement;
  readonly status: () => SessionStatus | null;
  readonly access: () => Access;
}

export interface PeerOptions {
  readonly endpoint: string;
  readonly editor: HTMLTextAreaElement;
  readonly link: ReturnType<typeof newLink>;
  readonly access: Access;
  readonly name: string;
  readonly seed: string | null;
}

export async function startPeer(options: PeerOptions): Promise<Peer> {
  const { editor, seed } = options;
  let access = options.access;
  let status: SessionStatus | null = null;
  const deps: SessionDeps = {
    link: options.link,
    endpoint: options.endpoint,
    device: randomId(12),
    editor,
    seed: seed === null ? null : () => seed,
    project: null,
    onStatus: (next) => {
      status = next;
    },
    onNotice: () => {},
    view: {
      host: document.createElement("div"),
      caretRect: () => null,
      rangeRects: () => [],
    },
    profile: () => ({ name: options.name, color: 1 }),
    access: () => access,
    onAccess: (token) => {
      access = { kind: "m", token };
    },
  };
  if (seed !== null) editor.value = seed;
  const session = await startSession(deps);
  session.attach();
  return { session, editor, status: () => status, access: () => access };
}
