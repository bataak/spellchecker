import * as Y from "yjs";
import { inflateSync } from "fflate";
import { noteError } from "../core/errorlog.ts";
import { createEmitter, type Emitter } from "../core/emitter.ts";
import {
  fromBase64Url,
  importKey,
  randomId,
  seal,
  toBase64Url,
  unseal,
  type CollabLink,
} from "./collabkey.ts";
import { dropDoc, saveDoc } from "./docstore.ts";
import {
  createEditing,
  LOADED,
  openDoc,
  type Attacher,
  type Editing,
  type Talk,
} from "./roomdoc.ts";
import { forgetBaseline } from "./changetracker.ts";
import { openChatDoc, type ChatDoc } from "./chatdoc.ts";
import {
  createSaver,
  createUploader,
  flushWhenHidden,
  isUploader,
  type Saver,
  type UploadNotice,
  type Uploader,
} from "./persistence.ts";
import { createMesh, type Mesh, type SignalPayload } from "./mesh.ts";
import {
  openSignal,
  type Signal,
  type SignalEvent,
  type SignalState,
} from "./signal.ts";
import { createSync, type Sync } from "./sync.ts";
import type { BlobTransport } from "./blobswap.ts";
import { createAdmin, type Admin, type Member } from "./admin.ts";
import type { Access } from "./collabrooms.ts";
import { createIceKeeper, type IceKeeper } from "./ice.ts";
import type { ProjectHooks } from "./projectsession.ts";
import type { CursorView, Cursors } from "./cursors.ts";
import type { Profile } from "./profile.ts";

export interface SessionStatus {
  readonly signal: SignalState;
  readonly peers: number;
}

export type SessionNotice = UploadNotice;

export interface SessionDeps {
  readonly link: CollabLink;
  readonly endpoint: string;
  readonly device: string;
  readonly editor: HTMLTextAreaElement;
  readonly seed: (() => string) | null;
  readonly project: ProjectHooks | null;
  readonly onStatus: (status: SessionStatus) => void;
  readonly onNotice: (notice: SessionNotice) => void;
  readonly view: CursorView;
  readonly profile: () => Profile;
  readonly access: () => Access;
  readonly onAccess: (token: string) => void;
}

export interface Session {
  readonly talk: Talk;
  attach(): void;
  detach(): void;
  announce(): void;
  sleep(): void;
  resume(): void;
  watch(listener: () => void): () => void;
  invite(): Promise<string | null>;
  members(): Promise<Member[] | null>;
  remove(dev: string, wipe: boolean): Promise<Member[] | null>;
  end(wipe: boolean): Promise<boolean>;
  stop(forget: boolean): Promise<void>;
}

const EMPTY_ROOM_SETTLE_MS = 1500;
const MOVES: ReadonlySet<SignalEvent["t"]> = new Set([
  "hi",
  "join",
  "bye",
  "kick",
]);
const READY_MS = 5000;
const SNAPSHOT = { snapshot: true };
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

function isRemote(origin: unknown): boolean {
  return !!origin && typeof origin === "object" && "peer" in origin;
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
  readonly deps: Pick<SessionDeps, "onAccess">;
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

async function sealSignal(
  key: CryptoKey,
  payload: SignalPayload,
): Promise<string> {
  const sealed = await seal(key, encoder.encode(JSON.stringify(payload)));
  return toBase64Url(sealed);
}

function closeSignal(signal: Signal, leave: boolean): void {
  if (leave) signal.command({ t: "leave" });
  signal.close();
}

async function keepOrDrop(
  room: string,
  docs: { readonly doc: Y.Doc; readonly chat: ChatDoc },
  forget: boolean,
): Promise<void> {
  await docs.chat.close(forget);
  if (!forget) return saveDoc(room, Y.encodeStateAsUpdate(docs.doc));
  await forgetBaseline(room);
  await dropDoc(room);
}

async function applySnapshot(
  doc: Y.Doc,
  key: CryptoKey,
  data: Uint8Array,
): Promise<void> {
  const plain = await unseal(key, data);
  if (plain) Y.applyUpdate(doc, inflateSync(plain), SNAPSHOT);
}

function sessionUploader(
  deps: SessionDeps,
  doc: Y.Doc,
  key: CryptoKey,
  allowed: () => boolean,
  send: (data: Uint8Array) => boolean,
): Uploader {
  return createUploader(
    { doc, key, allowed, send, notice: deps.onNotice },
    deps.seed !== null || !!deps.project?.seed,
  );
}

function watchDoc(
  doc: Y.Doc,
  saver: Saver,
  binding: Attacher,
  uploader: Uploader,
  live: () => boolean,
): void {
  doc.on("update", (_update: Uint8Array, origin: unknown) => {
    if (origin === LOADED || !live()) return;
    saver.soon();
    if (origin === SNAPSHOT || isRemote(origin)) binding.settle();
    if (origin !== SNAPSHOT) uploader.mark();
  });
}

interface MeshWiring {
  readonly self: string;
  readonly room: ReadonlySet<string>;
  readonly key: CryptoKey;
  readonly cursors: Cursors;
  readonly ice: () => RTCIceServer[];
  readonly status: () => void;
  readonly signal: () => Signal;
  readonly sync: () => Sync;
}

type ConnectionControls = Pick<Session, "sleep" | "resume" | "watch">;

export function connectionControls(
  signal: Signal,
  uploader: Uploader,
  moves: Emitter,
): ConnectionControls {
  let resting = false;
  return {
    sleep() {
      resting = true;
      void uploader.run().finally(() => {
        if (resting) signal.sleep();
      });
    },
    resume() {
      resting = false;
      signal.resume();
    },
    watch: moves.on,
  };
}

type AdminControls = Pick<Session, "invite" | "members" | "remove" | "end">;

interface Gate {
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

function adminControls(
  admin: Admin,
  gate: Gate,
  invited: () => void,
): AdminControls {
  return {
    invite: () =>
      gate
        .wait()
        .then(() => admin.invite())
        .then((token) => {
          if (token) invited();
          return token;
        }),
    members: () => gate.wait().then(() => admin.members()),
    remove: (dev, wipe) => gate.wait().then(() => admin.remove(dev, wipe)),
    end: (wipe) => gate.wait().then(() => admin.end(wipe)),
  };
}

function wireMesh(wiring: MeshWiring): Mesh {
  const { key, cursors, status } = wiring;
  return createMesh({
    self: () => wiring.self,
    present: (peer) => wiring.room.has(peer),
    iceServers: wiring.ice,
    signal: (to, payload) =>
      void sealSignal(key, payload)
        .then((d) => wiring.signal().send(to, d))
        .catch(noteError),
    onOpen: (peer) => {
      wiring.sync().joined(peer);
      cursors.announce();
      status();
    },
    onData: (peer, data) => {
      try {
        wiring.sync().receive(peer, data);
      } catch (error) {
        noteError(error);
      }
    },
    onClose: (peer) => {
      wiring.sync().left(peer);
      cursors.drop(peer);
      status();
    },
  });
}

function meshTransport(mesh: () => Mesh): BlobTransport {
  return {
    send: (peer, data) => mesh().send(peer, data),
    open: () => mesh().open(),
    drain: (peer) => mesh().drain(peer),
  };
}

function wireSync(
  docs: { readonly doc: Y.Doc; readonly chat: ChatDoc },
  peers: BlobTransport,
  editing: Editing,
): Sync {
  const { cursors, swap } = editing;
  return createSync({
    doc: docs.doc,
    chat: docs.chat.doc,
    open: peers.open,
    send: peers.send,
    onCursor: (peer, body) => cursors.receive(peer, body),
    onBlob: (peer, kind, body) => swap?.receive(peer, kind, body),
    onJoined: (peer) => swap?.joined(peer),
  });
}

export async function startSession(deps: SessionDeps): Promise<Session> {
  const { link } = deps;
  const key = await importKey(link.key);
  const { doc, fresh } = await openDoc(link.room, deps.seed, deps.project);
  const chat = await openChatDoc(link.room);
  const peers = meshTransport(() => mesh);
  const editing = createEditing(deps, { doc, chat }, fresh, peers, (b) =>
    sync.cursor(b),
  );
  const { cursors, binding } = editing;
  const self = randomId(12);
  const room = new Set<string>();
  let signalState: SignalState = "connecting";
  let stopped = false;
  let shared = false;
  const ice = createIceKeeper(() => ({ signal, mesh }));
  const owner = deps.access().kind === "o";
  const moves = createEmitter();
  const status = (): void =>
    deps.onStatus({ signal: signalState, peers: mesh.open().length });
  const saver = createSaver(doc, link.room);
  const canUpload = (): boolean =>
    !stopped &&
    shared &&
    signalState === "open" &&
    isUploader(self, room, mesh.open());
  const uploader = sessionUploader(deps, doc, key, canUpload, (data) =>
    signal.upload(data),
  );

  watchDoc(doc, saver, binding, uploader, () => !stopped);

  const mesh = wireMesh({
    self,
    room,
    key,
    cursors,
    ice: () => ice.servers(),
    status,
    signal: () => signal,
    sync: () => sync,
  });

  const sync = wireSync({ doc, chat }, peers, editing);

  const signal = openSignal({
    url: () =>
      roomUrl(deps.endpoint, link.room, deps.device, self, deps.access()),
    onEvent: (event) => {
      if (stopped) return;
      if (event.t === "hi") {
        shared = event.shared;
        if (!event.peers.length)
          setTimeout(binding.settle, EMPTY_ROOM_SETTLE_MS);
        if (!owner) admin.label(deps.profile().name);
      }
      if (MOVES.has(event.t)) moves.emit();
      const route = { key, room, mesh, uploader, admin, deps, ice };
      void routeSignal(event, route).catch(noteError);
    },
    onSnapshot: (data) => void applySnapshot(doc, key, data).catch(noteError),
    onState: (state) => {
      signalState = state;
      if (state === "open") gate.release();
      else room.clear();
      status();
    },
  });

  const admin = createAdmin(key, (message) => signal.command(message));
  const gate = createGate(() => signalState === "open");
  const unwatch = flushWhenHidden(saver, uploader);

  return {
    talk: editing.talk,
    attach: () => binding.attach(),
    detach: () => binding.detach(),
    announce() {
      cursors.announce();
      editing.talk.announce();
      if (!owner) admin.label(deps.profile().name);
    },
    ...connectionControls(signal, uploader, moves),
    ...adminControls(admin, gate, () => {
      if (shared) return;
      shared = true;
      uploader.force();
    }),
    async stop(forget) {
      stopped = true;
      ice.stop();
      unwatch();
      uploader.cancel();
      saver.cancel();
      editing.destroy();
      sync.close();
      mesh.close();
      closeSignal(signal, forget);
      await keepOrDrop(link.room, { doc, chat }, forget);
      doc.destroy();
    },
  };
}
