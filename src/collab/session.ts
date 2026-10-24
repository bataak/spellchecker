import * as Y from "yjs";
import { deflateSync, inflateSync } from "fflate";
import { noteError } from "../core/errorlog.ts";
import {
  fromBase64Url,
  importKey,
  randomId,
  seal,
  toBase64Url,
  unseal,
  type CollabLink,
} from "./collabkey.ts";
import { dropDoc, loadDoc, saveDoc } from "./docstore.ts";
import { createMesh, type Mesh, type SignalPayload } from "./mesh.ts";
import {
  openSignal,
  type Signal,
  type SignalEvent,
  type SignalState,
} from "./signal.ts";
import { createSync, type Sync } from "./sync.ts";
import { createAdmin, type Admin, type Member } from "./admin.ts";
import type { Access } from "./collabrooms.ts";
import { bindText } from "./textbind.ts";
import {
  createCursors,
  type CursorView,
  type Cursors,
  type Profile,
} from "./cursors.ts";

export interface SessionStatus {
  readonly signal: SignalState;
  readonly peers: number;
}

export type SessionNotice = "too-large";

export interface SessionDeps {
  readonly link: CollabLink;
  readonly endpoint: string;
  readonly device: string;
  readonly editor: HTMLTextAreaElement;
  readonly seed: (() => string) | null;
  readonly onStatus: (status: SessionStatus) => void;
  readonly onNotice: (notice: SessionNotice) => void;
  readonly view: CursorView;
  readonly profile: () => Profile;
  readonly access: () => Access;
  readonly onAccess: (token: string) => void;
}

export interface Session {
  attach(): void;
  detach(): void;
  announce(): void;
  sleep(): void;
  resume(): void;
  invite(): Promise<string | null>;
  members(): Promise<Member[] | null>;
  remove(dev: string, wipe: boolean): Promise<Member[] | null>;
  end(wipe: boolean): Promise<boolean>;
  stop(forget: boolean): Promise<void>;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
const SAVE_MS = 2000;
const SETTLE_MS = 6000;
const EMPTY_ROOM_SETTLE_MS = 1500;
const UPLOAD_IDLE_MS = 30_000;
const UPLOAD_GAP_MS = 5 * 60_000;
const MAX_UPLOAD = 1900 * 1024;
const LOADED = { load: true };
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

export function isUploader(
  self: string,
  room: ReadonlySet<string>,
  open: readonly string[],
): boolean {
  let leader = self;
  for (const peer of room) if (peer < leader) leader = peer;
  return leader === self || !open.includes(leader);
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

export function uploadAt(
  now: number,
  dirtySince: number,
  last: number,
): number {
  const due = Math.min(now + UPLOAD_IDLE_MS, dirtySince + UPLOAD_GAP_MS);
  return last ? Math.max(due, last + UPLOAD_GAP_MS) : due;
}

interface Uploader {
  mark(): void;
  schedule(): void;
  run(): Promise<void>;
  force(): void;
  dirty(): boolean;
  cancel(): void;
}

interface UploaderDeps {
  readonly doc: Y.Doc;
  readonly key: CryptoKey;
  readonly allowed: () => boolean;
  readonly send: (data: Uint8Array) => boolean;
  readonly tooLarge: () => void;
}

function createUploader(deps: UploaderDeps, dirty: boolean): Uploader {
  let last = 0;
  let dirtySince = dirty ? Date.now() : 0;
  let warned = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = async (): Promise<void> => {
    timer = null;
    if (!dirty || !deps.allowed()) return;
    const state = deflateSync(Y.encodeStateAsUpdate(deps.doc));
    const sealed = await seal(deps.key, state);
    if (sealed.byteLength > MAX_UPLOAD) {
      if (!warned) deps.tooLarge();
      warned = true;
      return;
    }
    if (!deps.send(sealed)) return;
    dirty = false;
    last = Date.now();
  };
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = (): void => {
    cancel();
    const now = Date.now();
    timer = setTimeout(() => void run(), uploadAt(now, dirtySince, last) - now);
  };
  return {
    mark() {
      if (!dirty) dirtySince = Date.now();
      dirty = true;
      schedule();
    },
    schedule() {
      if (dirty) schedule();
    },
    run,
    force() {
      if (!dirty) dirtySince = Date.now();
      dirty = true;
      cancel();
      void run();
    },
    dirty: () => dirty,
    cancel,
  };
}

interface Saver {
  soon(): void;
  now(): void;
  cancel(): void;
}

function createSaver(doc: Y.Doc, room: string): Saver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const now = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
    void saveDoc(room, Y.encodeStateAsUpdate(doc));
  };
  return {
    soon() {
      timer ??= setTimeout(now, SAVE_MS);
    },
    now() {
      if (timer) now();
    },
    cancel() {
      if (timer) clearTimeout(timer);
      timer = null;
    },
  };
}

interface OpenedDoc {
  readonly doc: Y.Doc;
  readonly fresh: boolean;
}

async function openDoc(
  room: string,
  seed: (() => string) | null,
): Promise<OpenedDoc> {
  const doc = new Y.Doc();
  const stored = await loadDoc(room);
  if (stored) Y.applyUpdate(doc, stored, LOADED);
  const text = doc.getText("t");
  if (seed && text.length === 0) text.insert(0, seed());
  return { doc, fresh: !stored && !seed };
}

interface Attacher {
  attach(): void;
  detach(): void;
  settle(): void;
  destroy(): void;
}

export function createAttacher(
  editor: HTMLTextAreaElement,
  text: Y.Text,
  fresh: boolean,
  shown: (on: boolean) => void = () => {},
): Attacher {
  const binding = bindText(editor, text);
  let settled = !fresh;
  let wanted = false;
  const timer = settled ? null : setTimeout(() => settle(), SETTLE_MS);
  const attach = (): void => {
    if (fresh && text.length === 0 && editor.value)
      text.insert(0, editor.value);
    binding.attach();
    shown(true);
  };
  function settle(): void {
    if (settled) return;
    settled = true;
    if (timer) clearTimeout(timer);
    if (wanted) attach();
  }
  return {
    attach() {
      wanted = true;
      if (settled) attach();
    },
    detach() {
      wanted = false;
      binding.detach();
      shown(false);
    },
    settle,
    destroy() {
      if (timer) clearTimeout(timer);
      binding.destroy();
    },
  };
}

interface SignalRoute {
  readonly key: CryptoKey;
  readonly room: Set<string>;
  readonly mesh: Mesh;
  readonly uploader: Uploader;
  readonly admin: Admin;
  readonly onAccess: (token: string) => void;
}

async function routeSignal(
  event: SignalEvent,
  { key, room, mesh, uploader, admin, onAccess }: SignalRoute,
): Promise<void> {
  if (admin.receive(event)) return;
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
  } else if (event.t === "member") onAccess(event.m);
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

async function applySnapshot(
  doc: Y.Doc,
  key: CryptoKey,
  data: Uint8Array,
): Promise<void> {
  const plain = await unseal(key, data);
  if (plain) Y.applyUpdate(doc, inflateSync(plain), SNAPSHOT);
}

function createEditing(
  deps: SessionDeps,
  doc: Y.Doc,
  fresh: boolean,
  send: (body: Uint8Array) => void,
): { cursors: Cursors; binding: Attacher } {
  const text = doc.getText("t");
  const cursors = createCursors({
    doc,
    text,
    editor: deps.editor,
    view: deps.view,
    profile: deps.profile,
    send,
  });
  const binding = createAttacher(deps.editor, text, fresh, (on) =>
    cursors.setActive(on),
  );
  return { cursors, binding };
}

function watchDoc(
  doc: Y.Doc,
  saver: Saver,
  binding: Attacher,
  uploader: Uploader,
): void {
  doc.on("update", (_update: Uint8Array, origin: unknown) => {
    if (origin === LOADED) return;
    saver.soon();
    if (origin === SNAPSHOT || isRemote(origin)) binding.settle();
    if (origin !== SNAPSHOT) uploader.mark();
  });
}

function flushWhenHidden(saver: Saver, uploader: Uploader): () => void {
  const flush = (): void => {
    if (document.visibilityState !== "hidden") return;
    saver.now();
    if (uploader.dirty()) void uploader.run();
  };
  document.addEventListener("visibilitychange", flush);
  return () => document.removeEventListener("visibilitychange", flush);
}

interface MeshWiring {
  readonly self: string;
  readonly room: ReadonlySet<string>;
  readonly key: CryptoKey;
  readonly cursors: Cursors;
  readonly status: () => void;
  readonly signal: () => Signal;
  readonly sync: () => Sync;
}

type AdminControls = Pick<Session, "invite" | "members" | "remove" | "end">;

function adminControls(admin: Admin, invited: () => void): AdminControls {
  return {
    invite: () =>
      admin.invite().then((token) => {
        if (token) invited();
        return token;
      }),
    members: () => admin.members(),
    remove: (dev, wipe) => admin.remove(dev, wipe),
    end: (wipe) => admin.end(wipe),
  };
}

function wireMesh(wiring: MeshWiring): Mesh {
  const { key, cursors, status } = wiring;
  return createMesh({
    self: () => wiring.self,
    present: (peer) => wiring.room.has(peer),
    iceServers: ICE_SERVERS,
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

export async function startSession(deps: SessionDeps): Promise<Session> {
  const { link } = deps;
  const key = await importKey(link.key);
  const { doc, fresh } = await openDoc(link.room, deps.seed);
  const { cursors, binding } = createEditing(deps, doc, fresh, (body) =>
    sync.cursor(body),
  );
  const self = randomId(12);
  const room = new Set<string>();
  let signalState: SignalState = "connecting";
  let stopped = false;
  let shared = false;
  const owner = deps.access().kind === "o";
  const status = (): void =>
    deps.onStatus({ signal: signalState, peers: mesh.open().length });
  const saver = createSaver(doc, link.room);
  const uploader = createUploader(
    {
      doc,
      key,
      allowed: () =>
        !stopped &&
        shared &&
        signalState === "open" &&
        isUploader(self, room, mesh.open()),
      send: (data) => signal.upload(data),
      tooLarge: () => deps.onNotice("too-large"),
    },
    deps.seed !== null,
  );

  watchDoc(doc, saver, binding, uploader);

  const mesh = wireMesh({
    self,
    room,
    key,
    cursors,
    status,
    signal: () => signal,
    sync: () => sync,
  });

  const sync = createSync({
    doc,
    open: () => mesh.open(),
    send: (peer, data) => mesh.send(peer, data),
    onCursor: (peer, body) => cursors.receive(peer, body),
  });

  const signal = openSignal({
    url: () =>
      roomUrl(deps.endpoint, link.room, deps.device, self, deps.access()),
    onEvent: (event) => {
      if (event.t === "hi") {
        shared = event.shared;
        if (!event.peers.length)
          setTimeout(binding.settle, EMPTY_ROOM_SETTLE_MS);
        if (!owner) admin.label(deps.profile().name);
      }
      const route = { key, room, mesh, uploader, admin, onAccess };
      void routeSignal(event, route).catch(noteError);
    },
    onSnapshot: (data) => void applySnapshot(doc, key, data).catch(noteError),
    onState: (state) => {
      signalState = state;
      if (state !== "open") room.clear();
      status();
    },
  });

  const admin = createAdmin(key, (message) => signal.command(message));
  const onAccess = deps.onAccess;
  const unwatch = flushWhenHidden(saver, uploader);

  return {
    attach: () => binding.attach(),
    detach: () => binding.detach(),
    announce() {
      cursors.announce();
      if (!owner) admin.label(deps.profile().name);
    },
    sleep: () => void uploader.run().finally(() => signal.sleep()),
    resume: () => signal.resume(),
    ...adminControls(admin, () => {
      if (shared) return;
      shared = true;
      uploader.force();
    }),
    async stop(forget) {
      stopped = true;
      unwatch();
      uploader.cancel();
      saver.cancel();
      binding.destroy();
      cursors.destroy();
      sync.close();
      mesh.close();
      if (forget) signal.command({ t: "leave" });
      signal.close();
      if (forget) await dropDoc(link.room);
      else await saveDoc(link.room, Y.encodeStateAsUpdate(doc));
      doc.destroy();
    },
  };
}
