import * as Y from "yjs";
import { noteError } from "../core/errorlog.ts";
import { createEmitter, type Emitter } from "../core/emitter.ts";
import { importKey, randomId } from "./collabkey.ts";
import { dropRoom, saveDoc } from "./docstore.ts";
import {
  createEditing,
  LOADED,
  openDoc,
  type Editing,
  type RoomDocs,
} from "./roomdoc.ts";
import type { Attacher } from "./attacher.ts";
import { openChatDoc } from "./chatdoc.ts";
import {
  createSaver,
  createUploader,
  flushWhenHidden,
  isUploader,
  type Saver,
  type Uploader,
  type UploaderDeps,
} from "./persistence.ts";
import { createMesh, type Mesh } from "./mesh.ts";
import type { Signal } from "./signal.ts";
import { createSync, type Sync } from "./sync.ts";
import type { BlobTransport } from "./blobswap.ts";
import { createAdmin, type Admin, type Member } from "./admin.ts";
import { createIceKeeper } from "./ice.ts";
import type { Cursors } from "./cursors.ts";
import {
  closeSignal,
  connectSignal,
  createGate,
  sealSignal,
  SNAPSHOT,
  type Gate,
  type SessionState,
} from "./sessionsignal.ts";
import type { Session, SessionDeps } from "./sessiontypes.ts";

export type {
  Session,
  SessionDeps,
  SessionNotice,
  SessionStatus,
} from "./sessiontypes.ts";
export { createGate, roomUrl } from "./sessionsignal.ts";

function isRemote(origin: unknown): boolean {
  return !!origin && typeof origin === "object" && "peer" in origin;
}

async function keepOrDrop(
  room: string,
  docs: RoomDocs,
  forget: boolean,
): Promise<void> {
  await docs.chat.close(forget);
  if (forget) await dropRoom(room);
  else await saveDoc(room, Y.encodeStateAsUpdate(docs.doc));
}

function sessionUploader(
  deps: Pick<SessionDeps, "onNotice" | "seed" | "project">,
  doc: Y.Doc,
  key: CryptoKey,
  gate: Pick<UploaderDeps, "allowed" | "send">,
): Uploader {
  return createUploader(
    { doc, key, ...gate, notice: deps.onNotice },
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

interface MemberLook {
  paint(members: Member[] | null): Member[] | null;
  removed(dev: string): void;
}

function memberLook(editing: Editing): MemberLook {
  return {
    paint: (list) =>
      list?.map((member) => ({
        ...member,
        color: editing.colorOf(member.dev),
      })) ?? null,
    removed: (dev) => editing.forgetColor(dev),
  };
}

function adminControls(
  admin: Admin,
  gate: Gate,
  invited: () => void,
  look: MemberLook,
): AdminControls {
  return {
    invite: (name) =>
      gate
        .wait()
        .then(() => admin.invite(name))
        .then((token) => {
          if (token) invited();
          return token;
        }),
    members: () =>
      gate
        .wait()
        .then(() => admin.members())
        .then(look.paint),
    remove: (dev, wipe) =>
      gate
        .wait()
        .then(() => admin.remove(dev, wipe))
        .then((list) => {
          if (list) look.removed(dev);
          return look.paint(list);
        }),
    end: (wipe) => gate.wait().then(() => admin.end(wipe)),
  };
}

function wireMesh(wiring: MeshWiring): Mesh {
  const { key, cursors, status } = wiring;
  return createMesh({
    connect: (config) => new RTCPeerConnection(config),
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
  docs: RoomDocs,
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

interface Links {
  readonly mesh: Mesh;
  readonly sync: Sync;
  readonly signal: Signal;
}

interface LateLinks {
  get(): Links;
  peek(): Links | null;
  set(links: Links): void;
}

export function lateLinks(): LateLinks {
  let links: Links | null = null;
  return {
    get() {
      if (!links) throw new Error("session links are not ready");
      return links;
    },
    peek: () => links,
    set(next) {
      links = next;
    },
  };
}

export async function startSession(deps: SessionDeps): Promise<Session> {
  const { link } = deps;
  const key = await importKey(link.key);
  const { doc, fresh } = await openDoc(link.room, deps.seed, deps.project);
  const chat = await openChatDoc(link.room);
  const links = lateLinks();
  const state: SessionState = {
    signal: "connecting",
    stopped: false,
    shared: false,
  };
  const peers = meshTransport(() => links.get().mesh);
  const editing = createEditing(deps, { doc, chat }, fresh, peers, (b) =>
    links.get().sync.cursor(b),
  );
  const { cursors, binding } = editing;
  const self = randomId(12);
  const room = new Set<string>();
  const ice = createIceKeeper(links.get);
  const owner = deps.access().kind === "o";
  const moves = createEmitter();
  const status = (): void =>
    deps.onStatus({
      signal: state.signal,
      peers: links.peek()?.mesh.open().length ?? 0,
    });
  const saver = createSaver(doc, link.room);
  const uploader = sessionUploader(deps, doc, key, {
    allowed: () =>
      !state.stopped &&
      state.shared &&
      state.signal === "open" &&
      isUploader(self, room, peers.open()),
    send: (data) => links.get().signal.upload(data),
  });
  const admin = createAdmin(key, (message) =>
    links.get().signal.command(message),
  );
  const gate = createGate(() => state.signal === "open");

  watchDoc(doc, saver, binding, uploader, () => !state.stopped);

  const mesh = wireMesh({
    self,
    room,
    key,
    cursors,
    ice: () => ice.servers(),
    status,
    signal: () => links.get().signal,
    sync: () => links.get().sync,
  });
  const sync = wireSync({ doc, chat }, peers, editing);
  const signal = connectSignal({
    ...{ key, room, uploader, admin, deps, ice, state, binding, owner },
    ...{ moves, doc, gate, status, self },
    mesh: () => links.get().mesh,
  });
  links.set({ mesh, sync, signal });
  const unwatch = flushWhenHidden(saver, uploader);

  return {
    talk: editing.talk,
    profile: editing.profile,
    attach: () => binding.attach(),
    detach: () => binding.detach(),
    announce() {
      cursors.announce();
      editing.talk.announce();
      if (!owner) admin.label(editing.profile().name);
    },
    ...connectionControls(signal, uploader, moves),
    ...adminControls(
      admin,
      gate,
      () => {
        if (state.shared) return;
        state.shared = true;
        uploader.force();
      },
      memberLook(editing),
    ),
    async stop(forget) {
      state.stopped = true;
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
