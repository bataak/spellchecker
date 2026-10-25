import { test, mock } from "node:test";
import assert from "node:assert/strict";
import { FakePeerConnection } from "./helpers/fakertc.ts";
import {
  createMesh,
  directServers,
  type Mesh,
  type MeshDeps,
  type PeerFactory,
  type SignalPayload,
} from "../src/collab/mesh.ts";

const TURN: RTCIceServer[] = [
  { urls: ["stun:s:3478", "turn:t:3478"], username: "u", credential: "c" },
];

const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 5));

interface Node {
  readonly mesh: Mesh;
  readonly opened: string[];
  readonly closed: string[];
  readonly data: string[];
  readonly made: FakePeerConnection[];
  readonly configs: RTCConfiguration[];
  outbox: [string, SignalPayload][];
}

function node(
  self: string,
  extra: Partial<MeshDeps> = {},
  make: () => FakePeerConnection = () => new FakePeerConnection(),
): Node {
  const out: Node = {
    opened: [],
    closed: [],
    data: [],
    made: [],
    configs: [],
    outbox: [],
  } as unknown as Node;
  const connect: PeerFactory = (config) => {
    const pc = make();
    out.made.push(pc);
    out.configs.push(config);
    return pc as unknown as RTCPeerConnection;
  };
  const mesh = createMesh({
    connect,
    self: () => self,
    present: () => true,
    iceServers: () => TURN,
    signal: (to, payload) => void out.outbox.push([to, payload]),
    onOpen: (peer) => void out.opened.push(peer),
    onData: (peer, data) =>
      void out.data.push(peer + ":" + new TextDecoder().decode(data)),
    onClose: (peer) => void out.closed.push(peer),
    ...extra,
  });
  return Object.assign(out, { mesh });
}

async function deliver(from: string, sender: Node, to: Node): Promise<void> {
  await settle();
  for (const [, payload] of sender.outbox.splice(0))
    to.mesh.receive(from, payload);
  await settle();
}

async function connected(): Promise<[Node, Node]> {
  const a = node("a");
  const b = node("b");
  a.mesh.call("b");
  await deliver("a", a, b);
  await deliver("b", b, a);
  await settle();
  return [a, b];
}

test("хоёр төхөөрөмж холбогдож өгөгдөл солилцоно", async () => {
  const [a, b] = await connected();
  assert.deepEqual(a.opened, ["b"]);
  assert.deepEqual(b.opened, ["a"]);
  assert.deepEqual(a.mesh.open(), ["b"]);
  a.mesh.send("b", new TextEncoder().encode("сайн"));
  b.mesh.broadcast(new TextEncoder().encode("уу"), "x");
  await settle();
  assert.deepEqual(b.data, ["a:сайн"]);
  assert.deepEqual(a.data, ["b:уу"]);
  a.mesh.close();
  await settle();
  assert.deepEqual(a.closed, ["b"]);
  assert.deepEqual(b.closed, ["a"]);
});

test("шууд холболтод зөвхөн STUN, relay-д бүх серверийг өгнө", () => {
  assert.deepEqual(directServers(TURN), [{ urls: ["stun:s:3478"] }]);
  assert.deepEqual(directServers([{ urls: "turn:t" }]), []);
  const a = node("a");
  a.mesh.call("b");
  assert.deepEqual(a.configs[0], { iceServers: [{ urls: ["stun:s:3478"] }] });
});

test("холболт амжилтгүй болбол relay-ээр дахин залгаж, шинэ серверийг авна", async () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const set: RTCConfiguration[] = [];
    const b = node("b", {}, () => {
      const pc = new FakePeerConnection();
      pc.setConfiguration = (config?: RTCConfiguration) =>
        void set.push(config!);
      return pc;
    });
    b.mesh.call("a");
    const first = b.made[0]!;
    first.connectionState = "failed";
    first.onconnectionstatechange?.();
    mock.timers.tick(2000);
    assert.equal(b.made.length, 2);
    assert.deepEqual(b.configs[1], { iceServers: TURN });
    b.mesh.refresh();
    assert.deepEqual(set, [{ iceServers: TURN }]);
    b.made[1]!.channel.close();
    b.made[1]!.channel.shut();
    mock.timers.tick(10_000);
    b.mesh.drop("a");
    b.mesh.close();
  } finally {
    mock.timers.reset();
  }
});

test("суваг нээгдэхгүй бол хугацаа дуусахад холболтыг тасална", () => {
  mock.timers.enable({ apis: ["setTimeout"] });
  try {
    const a = node("a");
    a.mesh.call("b");
    mock.timers.tick(10_000);
    assert.equal(a.made[0]!.connectionState, "closed");
    assert.deepEqual(a.mesh.open(), []);
  } finally {
    mock.timers.reset();
  }
});

test("ICE цуглуулж дуусахыг хүлээж байж санал илгээнэ", async () => {
  let pc: FakePeerConnection | null = null;
  const a = node("a", {}, () => {
    pc = new FakePeerConnection();
    pc.iceGatheringState = "gathering";
    return pc;
  });
  a.mesh.call("b");
  await settle();
  assert.equal(a.outbox.length, 0);
  pc!.iceGatheringState = "complete";
  pc!.emit("icegatheringstatechange");
  await settle();
  assert.equal(a.outbox[0]?.[1].type, "offer");
});

test("илгээж чадахгүй бол холболтыг хааж, буфер дүүрэхэд хүлээнэ", async () => {
  const [a, b] = await connected();
  const channel = a.made[0]!.channel;
  channel.bufferedAmount = 2 * 1024 * 1024;
  let drained = false;
  const waiting = a.mesh.drain("b").then(() => (drained = true));
  await settle();
  assert.equal(drained, false);
  channel.emit("bufferedamountlow");
  await waiting;
  await a.mesh.drain("x");
  channel.send = () => {
    throw new Error("full");
  };
  a.mesh.send("b", new Uint8Array([1]));
  assert.deepEqual(a.closed, ["b"]);
  b.mesh.close();
});
