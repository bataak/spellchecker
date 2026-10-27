import NodeSocket from "ws";
import { randomId } from "../../src/collab/collabkey.ts";
import { ORIGIN } from "./collabpeer.ts";

export type Message = string | Uint8Array;

export interface Client {
  readonly id: string;
  hi: Record<string, unknown>;
  member: string | null;
  send(data: string | Uint8Array): void;
  next(): Promise<Message>;
  close(): void;
}

function socket(
  base: string,
  room: string,
  dev: string,
  access: string,
  id: string,
): NodeSocket {
  const url =
    base.replace(/^http/, "ws") +
    "/room/" +
    room +
    "?d=" +
    dev +
    "&p=" +
    id +
    "&" +
    access;
  return new NodeSocket(url, { headers: { Origin: ORIGIN } });
}

export function knock(
  base: string,
  room: string,
  dev: string,
  access: string,
  id = randomId(12),
): Promise<number> {
  const ws = socket(base, room, dev, access, id);
  ws.on("error", () => {});
  return new Promise((resolve) => {
    ws.once("close", (code) => resolve(code));
    ws.on("message", (data: Buffer, binary: boolean) => {
      if (binary || JSON.parse(data.toString()).t !== "hi") return;
      resolve(0);
      ws.terminate();
    });
  });
}

export async function connect(
  base: string,
  room: string,
  dev: string,
  access: string,
  id = randomId(12),
): Promise<Client> {
  const ws = socket(base, room, dev, access, id);
  const inbox: Message[] = [];
  const waiting: ((message: Message) => void)[] = [];
  ws.on("message", (data: Buffer, binary: boolean) => {
    const message = binary ? new Uint8Array(data) : data.toString();
    const wake = waiting.shift();
    if (wake) wake(message);
    else inbox.push(message);
  });
  await new Promise((resolve, reject) => {
    ws.once("error", reject);
    ws.once("open", resolve);
  });
  ws.on("error", () => {});
  const client: Client = {
    id,
    hi: {},
    member: null,
    send: (data) => ws.send(data),
    next: () =>
      inbox.length
        ? Promise.resolve(inbox.shift()!)
        : new Promise((wake) => waiting.push(wake)),
    close: () => ws.terminate(),
  };
  for (;;) {
    const message = await client.next();
    if (typeof message !== "string") continue;
    const value = JSON.parse(message) as Record<string, unknown>;
    if (value.t === "member") client.member = value.m as string;
    if (value.t !== "hi") continue;
    client.hi = value;
    break;
  }
  return client;
}

export async function event(client: Client, type: string): Promise<unknown> {
  for (;;) {
    const message = await client.next();
    if (typeof message === "string" && JSON.parse(message).t === type)
      return JSON.parse(message);
  }
}
