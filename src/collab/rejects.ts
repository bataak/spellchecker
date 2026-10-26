import * as Y from "yjs";
import { fromBase64Url, randomId, toBase64Url } from "./collabkey.ts";
import type { Change, ChangeAuthor } from "./changes.ts";

export interface RejectedChange {
  readonly id: string;
  readonly at: number;
  readonly path: string | null;
  readonly inserted: string;
  readonly removed: string;
  readonly author: ChangeAuthor | null;
  readonly before: string;
  readonly after: string;
  readonly start: string;
  readonly end: string;
}

export const MAX_REJECTED = 50;
const MAX_TEXT = 20_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function relative(text: Y.Text, index: number, assoc: number): string {
  return toBase64Url(
    Y.encodeRelativePosition(
      Y.createRelativePositionFromTypeIndex(text, index, assoc),
    ),
  );
}

function absolute(text: Y.Text, raw: string): number | null {
  try {
    const rel = Y.decodeRelativePosition(fromBase64Url(raw));
    const at = Y.createAbsolutePositionFromRelativePosition(rel, text.doc!);
    return at && at.type === text ? at.index : null;
  } catch {
    return null;
  }
}

export function rejectAnchored(text: Y.Text, change: Change): RejectedChange {
  text.doc!.transact(() => {
    if (change.inserted) text.delete(change.from, change.inserted.length);
    if (change.removed) text.insert(change.from, change.removed);
  });
  return {
    id: randomId(9),
    at: Date.now(),
    path: change.path,
    inserted: change.inserted,
    removed: change.removed,
    author: change.author,
    before: change.before,
    after: change.after,
    start: relative(text, change.from, 0),
    end: relative(text, change.from + change.removed.length, -1),
  };
}

export function restoreRejected(text: Y.Text, record: RejectedChange): boolean {
  const start = absolute(text, record.start);
  const found = absolute(text, record.end);
  if (start === null || found === null) return false;
  const end = Math.max(start, found);
  if (text.toString().slice(start, end) !== record.removed) return false;
  text.doc!.transact(() => {
    if (end > start) text.delete(start, end - start);
    if (record.inserted) text.insert(start, record.inserted);
  });
  return true;
}

function short(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function validAuthor(value: unknown): value is ChangeAuthor | null {
  if (value === null) return true;
  if (!value || typeof value !== "object") return false;
  const { name, color } = value as Partial<ChangeAuthor>;
  return short(name, 80) && Number.isInteger(color);
}

function validRecord(value: unknown): value is RejectedChange {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<RejectedChange>;
  return (
    short(v.id, 24) &&
    Number.isFinite(v.at) &&
    (v.path === null || short(v.path, 1024)) &&
    short(v.inserted, MAX_TEXT) &&
    short(v.removed, MAX_TEXT) &&
    short(v.before, 200) &&
    short(v.after, 200) &&
    short(v.start, 256) &&
    short(v.end, 256) &&
    validAuthor(v.author)
  );
}

export function encodeRejected(list: readonly RejectedChange[]): Uint8Array {
  return encoder.encode(JSON.stringify(list.slice(0, MAX_REJECTED)));
}

export function decodeRejected(bytes: Uint8Array | null): RejectedChange[] {
  if (!bytes) return [];
  try {
    const value: unknown = JSON.parse(decoder.decode(bytes));
    return Array.isArray(value)
      ? value.filter(validRecord).slice(0, MAX_REJECTED)
      : [];
  } catch {
    return [];
  }
}
