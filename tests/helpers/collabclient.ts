import NodeSocket from "ws";
import { randomId } from "../../src/collab/collabkey.ts";
import { ORIGIN } from "./collabpeer.ts";

export type Message = string | Uint8Array;

export interface Client {
  readonly id: string;
  hi: Record<string, unknown>;
  send(data: string | Uint8Array): void;
  next(): Promise<Message>;
  close(): void;
}

export async function connect(
  base: string,
  room: string,
  dev: string,
  access: string,
): Promise<Client> {
  const id = randomId(12);
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
  const ws = new NodeSocket(url, { headers: { Origin: ORIGIN } });
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
    send: (data) => ws.send(data),
    next: () =>
      inbox.length
        ? Promise.resolve(inbox.shift()!)
        : new Promise((wake) => waiting.push(wake)),
    close: () => ws.terminate(),
  };
  client.hi = (await event(client, "hi")) as Record<string, unknown>;
  return client;
}

export async function event(client: Client, type: string): Promise<unknown> {
  for (;;) {
    const message = await client.next();
    if (typeof message === "string" && JSON.parse(message).t === type)
      return JSON.parse(message);
  }
}
