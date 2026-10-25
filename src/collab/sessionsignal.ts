import * as Y from "yjs";
import { inflateSync } from "fflate";
import { noteError } from "../core/errorlog.ts";
import type { Emitter } from "../core/emitter.ts";
import type { Admin } from "./admin.ts";
import type { Attacher } from "./attacher.ts";
import { fromBase64Url, seal, toBase64Url, unseal } from "./collabkey.ts";
import type { Access } from "./collabrooms.ts";
import type { IceKeeper } from "./ice.ts";
import type { Mesh, SignalPayload } from "./mesh.ts";
import type { Uploader } from "./persistence.ts";
import type { SessionContent, SessionLink } from "./sessiontypes.ts";
import {
  openSignal,
  type Signal,
  type SignalEvent,
  type SignalState,
} from "./signal.ts";

export const EMPTY_ROOM_SETTLE_MS = 1500;
const MOVES: ReadonlySet<SignalEvent["t"]> = new Set([
  "hi",
  "join",
  "bye",
  "kick",
]);
const READY_MS = 5000;
export const SNAPSHOT = { snapshot: true };
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function roomUrl(
  endpoint: string,
  room: string,
  device: string,
  peer: string,
  access: Access,
): string {
  return (
    endpoint.replace(/^http/, "ws").replace(/\/+$/, "") +
    "/room/" +
    room +
    "?d=" +
    device +
    "&p=" +
    peer +
    "&" +
    access.kind +
    "=" +
    access.token
  );
}

function parsePayload(bytes: Uint8Array): SignalPayload | null {
  try {
    const value = JSON.parse(decoder.decode(bytes)) as Partial<SignalPayload>;
    if (
      (value.type === "offer" || value.type === "answer") &&
      typeof value.sdp === "string"
    )
      return { type: value.type, sdp: value.sdp };
  } catch {
    return null;
  }
  return null;
}

interface SignalRoute {
  readonly key: CryptoKey;
  readonly room: Set<string>;
  readonly mesh: Mesh;
  readonly uploader: Uploader;
  readonly admin: Admin;
  readonly deps: Pick<SessionLink, "onAccess">;
  readonly ice: IceKeeper;
}

async function routeSignal(
  event: SignalEvent,
  { key, room, mesh, uploader, admin, deps, ice }: SignalRoute,
): Promise<void> {
  if (admin.receive(event)) return;
  if (event.t === "hi" || event.t === "ice") ice.take(event);
  if (event.t === "hi") {
    room.clear();
    const open = mesh.open();
    for (const peer of event.peers) {
      room.add(peer);
      if (!open.includes(peer)) mesh.call(peer);
    }
    uploader.schedule();
  } else if (event.t === "join") room.add(event.id);
  else if (event.t === "bye") {
    room.delete(event.id);
    if (!mesh.open().includes(event.id)) mesh.drop(event.id);
    uploader.schedule();
  } else if (event.t === "kick") {
    room.delete(event.id);
    mesh.drop(event.id);
    uploader.schedule();
  } else if (event.t === "member") deps.onAccess(event.m);
  else if (event.t === "from") {
    const plain = await unseal(key, fromBase64Url(event.d));
    const payload = plain && parsePayload(plain);
    if (payload) mesh.receive(event.from, payload);
  }
}

export async function sealSignal(
  key: CryptoKey,
  payload: SignalPayload,
): Promise<string> {
  const sealed = await seal(key, encoder.encode(JSON.stringify(payload)));
  return toBase64Url(sealed);
}

export function closeSignal(signal: Signal, leave: boolean): void {
  if (leave) signal.command({ t: "leave" });
  signal.close();
}

async function applySnapshot(
  doc: Y.Doc,
  key: CryptoKey,
  data: Uint8Array,
): Promise<void> {
  const plain = await unseal(key, data);
  if (plain) Y.applyUpdate(doc, inflateSync(plain), SNAPSHOT);
}

export interface Gate {
  release(): void;
  wait(): Promise<void>;
}

export function createGate(isOpen: () => boolean, ms = READY_MS): Gate {
  const waiters = new Set<() => void>();
  return {
    release() {
      for (const done of [...waiters]) done();
    },
    wait() {
      if (isOpen()) return Promise.resolve();
      return new Promise((resolve) => {
        const done = (): void => {
          clearTimeout(timer);
          waiters.delete(done);
          resolve();
        };
        const timer = setTimeout(done, ms);
        waiters.add(done);
      });
    },
  };
}

export interface SessionState {
  signal: SignalState;
  stopped: boolean;
  shared: boolean;
}

interface EventHandling extends Omit<SignalRoute, "mesh" | "deps"> {
  readonly deps: Pick<SessionLink, "onAccess"> &
    Pick<SessionContent, "profile">;
  readonly mesh: () => Mesh;
  readonly state: SessionState;
  readonly binding: Attacher;
  readonly owner: boolean;
  readonly moves: Emitter;
}

interface SignalWiring extends EventHandling {
  readonly deps: SessionLink & Pick<SessionContent, "profile">;
  readonly doc: Y.Doc;
  readonly gate: Gate;
  readonly status: () => void;
  readonly self: string;
}

export function connectSignal(on: SignalWiring): Signal {
  const { deps, state } = on;
  return openSignal({
    url: () =>
      roomUrl(
        deps.endpoint,
        deps.link.room,
        deps.device,
        on.self,
        deps.access(),
      ),
    onEvent: signalEvents(on),
    onSnapshot: (data) =>
      void applySnapshot(on.doc, on.key, data).catch(noteError),
    onState: (next) => {
      state.signal = next;
      if (next === "open") on.gate.release();
      else on.room.clear();
      on.status();
    },
  });
}

function signalEvents(on: EventHandling): (event: SignalEvent) => void {
  return (event) => {
    if (on.state.stopped) return;
    if (event.t === "hi") {
      on.state.shared = event.shared;
      if (!event.peers.length)
        setTimeout(on.binding.settle, EMPTY_ROOM_SETTLE_MS);
      if (!on.owner) on.admin.label(on.deps.profile().name);
    }
    if (MOVES.has(event.t)) on.moves.emit();
    void routeSignal(event, { ...on, mesh: on.mesh() }).catch(noteError);
  };
}
