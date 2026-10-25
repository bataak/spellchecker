const links = new Map<string, FakePeerConnection>();
let nextId = 0;

const later = (run: () => void): void => void setTimeout(run, 0);

class Listeners {
  private readonly map = new Map<string, Set<() => void>>();

  addEventListener(type: string, listener: () => void): void {
    const set = this.map.get(type) ?? new Set();
    set.add(listener);
    this.map.set(type, set);
  }

  removeEventListener(type: string, listener: () => void): void {
    this.map.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of [...(this.map.get(type) ?? [])]) listener();
  }
}

class FakeChannel extends Listeners {
  readyState: RTCDataChannelState = "connecting";
  binaryType: BinaryType = "arraybuffer";
  bufferedAmount = 0;
  bufferedAmountLowThreshold = 0;
  partner: FakeChannel | null = null;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: ArrayBuffer }) => void) | null = null;

  open(): void {
    if (this.readyState !== "connecting") return;
    this.readyState = "open";
    this.onopen?.();
  }

  send(data: Uint8Array): void {
    if (this.readyState !== "open") throw new Error("closed");
    const copy = data.slice().buffer;
    const target = this.partner;
    later(() => {
      if (target?.readyState === "open") target.onmessage?.({ data: copy });
    });
  }

  close(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.emit("close");
    const partner = this.partner;
    later(() => partner?.shut());
  }

  shut(): void {
    if (this.readyState === "closed") return;
    this.readyState = "closed";
    this.emit("close");
    this.onclose?.();
  }
}

export class FakePeerConnection extends Listeners {
  readonly id = "fake-" + String(++nextId);
  readonly channel = new FakeChannel();
  iceGatheringState: RTCIceGatheringState = "complete";
  connectionState: RTCPeerConnectionState = "new";
  signalingState: RTCSignalingState = "stable";
  localDescription: RTCSessionDescriptionInit | null = null;
  onconnectionstatechange: (() => void) | null = null;

  constructor() {
    super();
    links.set(this.id, this);
  }

  createDataChannel(): FakeChannel {
    return this.channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: "offer", sdp: this.id };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: "answer", sdp: this.id };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
    if (desc.type === "offer") this.signalingState = "have-local-offer";
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    const other = links.get(desc.sdp ?? "");
    if (!other) throw new Error("unknown peer");
    this.channel.partner = other.channel;
    other.channel.partner = this.channel;
    if (desc.type !== "answer") return;
    this.signalingState = "stable";
    for (const side of [this, other]) side.connectionState = "connected";
    later(() => {
      this.channel.open();
      other.channel.open();
    });
  }

  setConfiguration(): void {}

  close(): void {
    this.connectionState = "closed";
    links.delete(this.id);
  }
}

export function installRtc(): () => void {
  const target = globalThis as Record<string, unknown>;
  const saved = target.RTCPeerConnection;
  target.RTCPeerConnection = FakePeerConnection;
  return () => {
    target.RTCPeerConnection = saved;
  };
}
