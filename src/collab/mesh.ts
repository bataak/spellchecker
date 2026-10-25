import { chunk, createAssembler, type Assembler } from "./wire.ts";

export interface SignalPayload {
  readonly type: "offer" | "answer";
  readonly sdp: string;
}

export interface MeshDeps {
  readonly self: () => string;
  readonly present: (peer: string) => boolean;
  readonly iceServers: () => RTCIceServer[];
  readonly signal: (to: string, payload: SignalPayload) => void;
  readonly onOpen: (peer: string) => void;
  readonly onData: (peer: string, data: Uint8Array) => void;
  readonly onClose: (peer: string) => void;
}

export interface Mesh {
  call(peer: string): void;
  receive(peer: string, payload: SignalPayload): void;
  drop(peer: string): void;
  send(peer: string, data: Uint8Array): void;
  drain(peer: string): Promise<void>;
  broadcast(data: Uint8Array, except?: string): void;
  open(): string[];
  refresh(): void;
  close(): void;
}

interface Link {
  readonly pc: RTCPeerConnection;
  readonly channel: RTCDataChannel;
  readonly assembler: Assembler;
  readonly caller: boolean;
  readonly relay: boolean;
  open: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface LinkEvents {
  open(): void;
  data(data: Uint8Array): void;
  fail(): void;
}

const GATHER_MS = 3000;
const MAX_MESSAGE = 8 * 1024 * 1024;
const RETRIES = 3;
const RETRY_MS = 2000;
const CONNECT_MS = 10_000;
const RELAY_CANDIDATE = " typ relay";
const DRAIN_BYTES = 1024 * 1024;

function gathered(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(done, GATHER_MS);
    function done(): void {
      clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }
    function check(): void {
      if (pc.iceGatheringState === "complete") done();
    }
    pc.addEventListener("icegatheringstatechange", check);
  });
}

export function shouldRecall(self: string, peer: string): boolean {
  return self > peer;
}

export function directServers(servers: RTCIceServer[]): RTCIceServer[] {
  return servers.flatMap((server) => {
    const urls = [server.urls].flat().filter((url) => url.startsWith("stun:"));
    return urls.length ? [{ urls }] : [];
  });
}

function reconfigure(links: Iterable<Link>, iceServers: RTCIceServer[]): void {
  for (const { pc, relay } of links) if (relay) setServers(pc, iceServers);
}

function setServers(
  pc: RTCPeerConnection,
  iceServers: RTCIceServer[],
): boolean {
  try {
    pc.setConfiguration({ iceServers });
    return true;
  } catch {
    return false;
  }
}

function newLink(
  iceServers: RTCIceServer[],
  caller: boolean,
  relay: boolean,
): Link {
  const pc = new RTCPeerConnection({
    iceServers: relay ? iceServers : directServers(iceServers),
  });
  const channel = pc.createDataChannel("y", { negotiated: true, id: 0 });
  channel.binaryType = "arraybuffer";
  return {
    pc,
    channel,
    assembler: createAssembler(MAX_MESSAGE),
    caller,
    relay,
    open: false,
    timer: null,
  };
}

function watch(entry: Link, on: LinkEvents): void {
  const { pc, channel } = entry;
  channel.onopen = () => {
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    on.open();
  };
  channel.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    const data = entry.assembler.push(new Uint8Array(event.data));
    if (data) on.data(data);
  };
  channel.onclose = on.fail;
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === "failed") on.fail();
  };
  entry.timer = setTimeout(() => {
    entry.timer = null;
    if (!entry.open) on.fail();
  }, CONNECT_MS);
}

async function localSdp(
  pc: RTCPeerConnection,
  type: SignalPayload["type"],
): Promise<string | null> {
  const desc =
    type === "offer" ? await pc.createOffer() : await pc.createAnswer();
  await pc.setLocalDescription(desc);
  await gathered(pc);
  return pc.localDescription?.sdp ?? null;
}

function sendChunks(channel: RTCDataChannel, data: Uint8Array): boolean {
  try {
    for (const piece of chunk(data))
      channel.send(piece as Uint8Array<ArrayBuffer>);
    return true;
  } catch {
    return false;
  }
}

function drainChannel(channel: RTCDataChannel | undefined): Promise<void> {
  if (!channel || channel.bufferedAmount <= DRAIN_BYTES)
    return Promise.resolve();
  channel.bufferedAmountLowThreshold = DRAIN_BYTES;
  return new Promise((resolve) => {
    const done = (): void => {
      channel.removeEventListener("bufferedamountlow", done);
      channel.removeEventListener("close", done);
      resolve();
    };
    channel.addEventListener("bufferedamountlow", done);
    channel.addEventListener("close", done);
  });
}

export function createMesh(deps: MeshDeps): Mesh {
  const links = new Map<string, Link>();
  const retries = new Map<string, number>();
  let closed = false;

  function drop(peer: string): void {
    const link = links.get(peer);
    if (!link) return;
    links.delete(peer);
    if (link.timer) clearTimeout(link.timer);
    link.channel.close();
    link.pc.close();
    if (link.open) deps.onClose(peer);
  }

  function failed(peer: string, link: Link): void {
    if (links.get(peer) !== link) return;
    drop(peer);
    const tries = retries.get(peer) ?? 0;
    if (closed || tries >= RETRIES || !shouldRecall(deps.self(), peer)) return;
    retries.set(peer, tries + 1);
    setTimeout(() => {
      if (!closed && !links.has(peer) && deps.present(peer)) call(peer);
    }, RETRY_MS);
  }

  function link(peer: string, caller: boolean, relay: boolean): Link {
    drop(peer);
    const entry = newLink(deps.iceServers(), caller, relay);
    links.set(peer, entry);
    watch(entry, {
      open() {
        if (links.get(peer) !== entry) return;
        entry.open = true;
        retries.delete(peer);
        deps.onOpen(peer);
      },
      data: (data) => deps.onData(peer, data),
      fail: () => failed(peer, entry),
    });
    return entry;
  }

  async function describe(
    peer: string,
    entry: Link,
    type: SignalPayload["type"],
  ): Promise<void> {
    const sdp = await localSdp(entry.pc, type);
    if (links.get(peer) === entry && sdp) deps.signal(peer, { type, sdp });
  }

  function call(peer: string): void {
    const entry = link(peer, true, (retries.get(peer) ?? 0) > 0);
    describe(peer, entry, "offer").catch(() => failed(peer, entry));
  }

  async function answer(peer: string, payload: SignalPayload): Promise<void> {
    if (payload.type === "offer") {
      const entry = link(peer, false, payload.sdp.includes(RELAY_CANDIDATE));
      await entry.pc.setRemoteDescription(payload);
      await describe(peer, entry, "answer");
      return;
    }
    const entry = links.get(peer);
    if (!entry?.caller || entry.pc.signalingState !== "have-local-offer")
      return;
    await entry.pc.setRemoteDescription(payload);
  }

  function send(peer: string, data: Uint8Array): void {
    const entry = links.get(peer);
    if (!entry?.open || entry.channel.readyState !== "open") return;
    if (!sendChunks(entry.channel, data)) failed(peer, entry);
  }

  return {
    call,
    receive(peer, payload) {
      answer(peer, payload).catch(() => {
        const entry = links.get(peer);
        if (entry) failed(peer, entry);
      });
    },
    drop(peer) {
      retries.delete(peer);
      drop(peer);
    },
    send,
    drain: (peer) => drainChannel(links.get(peer)?.channel),
    broadcast(data, except) {
      for (const [peer, entry] of links)
        if (peer !== except && entry.open) send(peer, data);
    },
    open: () =>
      [...links].filter(([, entry]) => entry.open).map(([peer]) => peer),
    refresh: () => reconfigure(links.values(), deps.iceServers()),
    close() {
      closed = true;
      for (const peer of [...links.keys()]) drop(peer);
      retries.clear();
    },
  };
}
