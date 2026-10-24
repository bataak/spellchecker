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
import { openSignal, type SignalEvent, type SignalState } from "./signal.ts";
import { createSync } from "./sync.ts";
import { bindText } from "./textbind.ts";

export interface SessionStatus {
  readonly signal: SignalState;
  readonly peers: number;
}

export interface SessionDeps {
  readonly link: CollabLink;
  readonly endpoint: string;
  readonly device: string;
  readonly editor: HTMLTextAreaElement;
  readonly seed: (() => string) | null;
  readonly onStatus: (status: SessionStatus) => void;
}

export interface Session {
  attach(): void;
  detach(): void;
  stop(forget: boolean): Promise<void>;
}

const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.cloudflare.com:3478" }];
const SAVE_MS = 500;
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
): string {
  return (
    endpoint.replace(/^http/, "ws").replace(/\/+$/, "") +
    "/room/" +
    room +
    "?d=" +
    device +
    "&p=" +
    peer
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

interface Uploader {
  mark(): void;
  schedule(): void;
  run(): Promise<void>;
  dirty(): boolean;
  cancel(): void;
}

function createUploader(
  doc: Y.Doc,
  key: CryptoKey,
  allowed: () => boolean,
  send: (data: Uint8Array) => boolean,
  dirty: boolean,
): Uploader {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const run = async (): Promise<void> => {
    timer = null;
    if (!dirty || !allowed()) return;
    const sealed = await seal(key, deflateSync(Y.encodeStateAsUpdate(doc)));
    if (sealed.byteLength > MAX_UPLOAD || !send(sealed)) return;
    dirty = false;
    last = Date.now();
  };
  const cancel = (): void => {
    if (timer) clearTimeout(timer);
    timer = null;
  };
  const schedule = (): void => {
    cancel();
    const wait = Math.max(UPLOAD_IDLE_MS, last + UPLOAD_GAP_MS - Date.now());
    timer = setTimeout(() => void run(), wait);
  };
  return {
    mark() {
      dirty = true;
      schedule();
    },
    schedule() {
      if (dirty) schedule();
    },
    run,
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

async function openDoc(
  room: string,
  seed: (() => string) | null,
): Promise<Y.Doc> {
  const doc = new Y.Doc();
  const stored = await loadDoc(room);
  if (stored) Y.applyUpdate(doc, stored, LOADED);
  const text = doc.getText("t");
  if (seed && text.length === 0) text.insert(0, seed());
  return doc;
}

interface SignalRoute {
  readonly key: CryptoKey;
  readonly room: Set<string>;
  readonly mesh: Mesh;
  readonly uploader: Uploader;
}

async function routeSignal(
  event: SignalEvent,
  { key, room, mesh, uploader }: SignalRoute,
): Promise<void> {
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
  } else {
    const plain = await unseal(key, fromBase64Url(event.d));
    const payload = plain && parsePayload(plain);
    if (payload) mesh.receive(event.from, payload);
  }
}

export async function startSession(deps: SessionDeps): Promise<Session> {
  const { link } = deps;
  const key = await importKey(link.key);
  const doc = await openDoc(link.room, deps.seed);
  const binding = bindText(deps.editor, doc.getText("t"));
  const self = randomId(12);
  const room = new Set<string>();
  let signalState: SignalState = "connecting";
  let stopped = false;

  const status = (): void =>
    deps.onStatus({ signal: signalState, peers: mesh.open().length });
  const saver = createSaver(doc, link.room);
  const uploader = createUploader(
    doc,
    key,
    () =>
      !stopped && signalState === "open" && isUploader(self, room, mesh.open()),
    (data) => signal.upload(data),
    deps.seed !== null,
  );

  doc.on("update", (_update: Uint8Array, origin: unknown) => {
    if (origin === LOADED) return;
    saver.soon();
    if (origin !== SNAPSHOT) uploader.mark();
  });

  const sendSignal = async (
    to: string,
    payload: SignalPayload,
  ): Promise<void> => {
    const sealed = await seal(key, encoder.encode(JSON.stringify(payload)));
    signal.send(to, toBase64Url(sealed));
  };

  const mesh = createMesh({
    self: () => self,
    iceServers: ICE_SERVERS,
    signal: (to, payload) => void sendSignal(to, payload).catch(noteError),
    onOpen: (peer) => {
      sync.joined(peer);
      status();
    },
    onData: (peer, data) => {
      try {
        sync.receive(peer, data);
      } catch (error) {
        noteError(error);
      }
    },
    onClose: (peer) => {
      sync.left(peer);
      status();
    },
  });

  const sync = createSync({
    doc,
    open: () => mesh.open(),
    send: (peer, data) => mesh.send(peer, data),
    onCursor: () => {},
  });

  const onSnapshot = async (data: Uint8Array): Promise<void> => {
    const plain = await unseal(key, data);
    if (plain) Y.applyUpdate(doc, inflateSync(plain), SNAPSHOT);
  };

  const signal = openSignal({
    url: roomUrl(deps.endpoint, link.room, deps.device, self),
    onEvent: (event) =>
      void routeSignal(event, { key, room, mesh, uploader }).catch(noteError),
    onSnapshot: (data) => void onSnapshot(data).catch(noteError),
    onState: (state) => {
      signalState = state;
      if (state !== "open") room.clear();
      status();
    },
  });

  const flush = (): void => {
    if (document.visibilityState !== "hidden") return;
    saver.now();
    if (uploader.dirty()) void uploader.run();
  };
  document.addEventListener("visibilitychange", flush);

  return {
    attach: () => binding.attach(),
    detach: () => binding.detach(),
    async stop(forget) {
      stopped = true;
      document.removeEventListener("visibilitychange", flush);
      uploader.cancel();
      saver.cancel();
      binding.destroy();
      sync.close();
      mesh.close();
      signal.close();
      if (forget) await dropDoc(link.room);
      else await saveDoc(link.room, Y.encodeStateAsUpdate(doc));
      doc.destroy();
    },
  };
}
