import { findTemplate } from "../doc/templates.ts";
import { PROJECT_SLOT } from "../slots/fileslots.ts";

export type SlotTarget =
  | {
      readonly kind: "template";
      readonly id: string;
      readonly example?: string;
    }
  | { readonly kind: "project"; readonly path: string | null }
  | { readonly kind: "file"; readonly name: string };

const MAX_HASH = 2048;
const FILE = "file";

export function exampleInHash(id: string): boolean {
  return (findTemplate(id)?.examples?.length ?? 0) > 1;
}

function decode(part: string): string | null {
  try {
    return decodeURIComponent(part);
  } catch {
    return null;
  }
}

const encodePath = (path: string): string =>
  path.split("/").map(encodeURIComponent).join("/");

export function slotHash(target: SlotTarget): string {
  if (target.kind === "template")
    return (
      "#" +
      target.id +
      (target.example && exampleInHash(target.id) ? "/" + target.example : "")
    );
  if (target.kind === "file")
    return "#" + FILE + "/" + encodeURIComponent(target.name);
  return (
    "#" + PROJECT_SLOT + (target.path ? "/" + encodePath(target.path) : "")
  );
}

function cleanPath(raw: string): string | null {
  const path = decode(raw);
  if (path === null || !path || path.length > 1024) return null;
  const parts = path.split("/");
  return parts.every((part) => part && part !== "." && part !== "..")
    ? path
    : null;
}

export function parseSlotHash(hash: string): SlotTarget | null {
  if (!hash.startsWith("#") || hash.length > MAX_HASH) return null;
  const body = hash.slice(1);
  const cut = body.indexOf("/");
  const head = cut < 0 ? body : body.slice(0, cut);
  const rest = cut < 0 ? null : body.slice(cut + 1);
  if (head === PROJECT_SLOT) {
    if (rest === null) return { kind: "project", path: null };
    const path = cleanPath(rest);
    return path === null ? null : { kind: "project", path };
  }
  if (head === FILE) {
    const name = rest === null ? null : decode(rest);
    return name && !name.includes("/") && name.length <= 255
      ? { kind: "file", name }
      : null;
  }
  const template = findTemplate(head);
  if (!template) return null;
  if (rest === null) return { kind: "template", id: head };
  return exampleInHash(head) &&
    template.examples!.some((example) => example.id === rest)
    ? { kind: "template", id: head, example: rest }
    : null;
}
