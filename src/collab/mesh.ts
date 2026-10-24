import { chunk, createAssembler, type Assembler } from "./wire.ts";

export interface SignalPayload {
  readonly type: "offer" | "answer";
  readonly sdp: string;
}

export interface MeshDeps {
  readonly self: () => string;
  readonly iceServers: RTCIceServer[];
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
  broadcast(data: Uint8Array, except?: string): void;
  open(): string[];
  close(): void;
}

interface Link {
  readonly pc: RTCPeerConnection;
  readonly channel: RTCDataChannel;
  readonly assembler: Assembler;
  readonly caller: boolean;
  open: boolean;
}

const GATHER_MS = 3000;
const MAX_MESSAGE = 8 * 1024 * 1024;
const RETRIES = 3;
const RETRY_MS = 2000;

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

function newLink(iceServers: RTCIceServer[], caller: boolean): Link {
  const pc = new RTCPeerConnection({ iceServers });
  const channel = pc.createDataChannel("y", { negotiated: true, id: 0 });
  channel.binaryType = "arraybuffer";
  return {
    pc,
    channel,
    assembler: createAssembler(MAX_MESSAGE),
    caller,
    open: false,
  };
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

export function createMesh(deps: MeshDeps): Mesh {
  const links = new Map<string, Link>();
  const retries = new Map<string, number>();

  function drop(peer: string): void {
    const link = links.get(peer);
    if (!link) return;
    links.delete(peer);
    link.channel.close();
    link.pc.close();
    if (link.open) deps.onClose(peer);
  }

  function failed(peer: string, link: Link): void {
    if (links.get(peer) !== link) return;
    drop(peer);
    const tries = retries.get(peer) ?? 0;
    if (tries >= RETRIES || !shouldRecall(deps.self(), peer)) return;
    retries.set(peer, tries + 1);
    setTimeout(() => {
      if (!links.has(peer)) call(peer);
    }, RETRY_MS);
  }

  function link(peer: string, caller: boolean): Link {
    drop(peer);
    const entry = newLink(deps.iceServers, caller);
    const { pc, channel } = entry;
    links.set(peer, entry);
    channel.onopen = () => {
      if (links.get(peer) !== entry) return;
      entry.open = true;
      retries.delete(peer);
      deps.onOpen(peer);
    };
    channel.onmessage = (event: MessageEvent<ArrayBuffer>) => {
      const data = entry.assembler.push(new Uint8Array(event.data));
      if (data) deps.onData(peer, data);
    };
    channel.onclose = () => failed(peer, entry);
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") failed(peer, entry);
    };
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
    const entry = link(peer, true);
    describe(peer, entry, "offer").catch(() => failed(peer, entry));
  }

  async function answer(peer: string, payload: SignalPayload): Promise<void> {
    if (payload.type === "offer") {
      const entry = link(peer, false);
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
    for (const piece of chunk(data))
      entry.channel.send(piece as Uint8Array<ArrayBuffer>);
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
    broadcast(data, except) {
      for (const [peer, entry] of links)
        if (peer !== except && entry.open) send(peer, data);
    },
    open: () =>
      [...links].filter(([, entry]) => entry.open).map(([peer]) => peer),
    close() {
      for (const peer of [...links.keys()]) drop(peer);
      retries.clear();
    },
  };
}
