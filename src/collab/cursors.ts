import * as Y from "yjs";
import { fromBase64Url, toBase64Url } from "./collabkey.ts";

export interface CursorView {
  readonly host: HTMLElement;
  readonly caretRect: (offset: number) => DOMRect | null;
  readonly rangeRects: (start: number, end: number) => DOMRect[];
}

export interface Profile {
  readonly name: string;
  readonly color: number;
}

export interface CursorState {
  readonly name: string;
  readonly color: number;
  readonly anchor: Y.RelativePosition | null;
  readonly head: Y.RelativePosition | null;
}

export interface Cursors {
  receive(peer: string, body: Uint8Array): void;
  drop(peer: string): void;
  announce(): void;
  setActive(on: boolean): void;
  destroy(): void;
}

export interface CursorDeps {
  readonly doc: Y.Doc;
  readonly text: Y.Text;
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly profile: () => Profile;
  readonly send: (body: Uint8Array) => void;
}

export const CURSOR_COLORS = [
  "#e8590c",
  "#1c7ed6",
  "#2f9e44",
  "#ae3ec9",
  "#c92a2a",
  "#0c8599",
  "#e67700",
  "#5f3dc4",
];
const SEND_MS = 100;
const LABEL_ROOM = 18;
const MAX_NAME = 40;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeCursor(
  profile: Profile,
  anchor: Y.RelativePosition | null,
  head: Y.RelativePosition | null,
): Uint8Array {
  const value: Record<string, string | number> = {
    n: profile.name.slice(0, MAX_NAME),
    c: profile.color,
  };
  if (anchor && head) {
    value.a = toBase64Url(Y.encodeRelativePosition(anchor));
    value.h = toBase64Url(Y.encodeRelativePosition(head));
  }
  return encoder.encode(JSON.stringify(value));
}

export function decodeCursor(body: Uint8Array): CursorState | null {
  try {
    const value = JSON.parse(decoder.decode(body)) as Record<string, unknown>;
    if (typeof value.n !== "string" || typeof value.c !== "number") return null;
    const position = (raw: unknown): Y.RelativePosition | null =>
      typeof raw === "string"
        ? Y.decodeRelativePosition(fromBase64Url(raw))
        : null;
    return {
      name: value.n.slice(0, MAX_NAME),
      color: Math.abs(Math.trunc(value.c)) % CURSOR_COLORS.length,
      anchor: position(value.a),
      head: position(value.h),
    };
  } catch {
    return null;
  }
}

function absolute(doc: Y.Doc, rel: Y.RelativePosition | null): number | null {
  if (!rel) return null;
  return Y.createAbsolutePositionFromRelativePosition(rel, doc)?.index ?? null;
}

interface Mark {
  readonly root: HTMLDivElement;
  readonly caret: HTMLDivElement;
  readonly label: HTMLDivElement;
  readonly marks: HTMLDivElement;
}

function newMark(layer: HTMLElement): Mark {
  const root = document.createElement("div");
  root.className = "collab-peer";
  const marks = document.createElement("div");
  const caret = document.createElement("div");
  caret.className = "collab-caret";
  const label = document.createElement("div");
  label.className = "collab-label";
  root.append(marks, caret, label);
  layer.appendChild(root);
  return { root, caret, label, marks };
}

function move(el: HTMLElement, rect: DOMRect, origin: DOMRect): void {
  el.style.transform =
    "translate(" +
    (rect.left - origin.left) +
    "px," +
    (rect.top - origin.top) +
    "px)";
}

function place(el: HTMLElement, rect: DOMRect, origin: DOMRect): void {
  move(el, rect, origin);
  el.style.height = rect.height + "px";
}

function paintMark(
  mark: Mark,
  state: CursorState,
  doc: Y.Doc,
  view: CursorView,
  origin: DOMRect,
): void {
  const head = absolute(doc, state.head);
  const anchor = absolute(doc, state.anchor);
  const caret = head === null ? null : view.caretRect(head);
  mark.root.hidden = caret === null;
  if (!caret || head === null) return;
  mark.root.style.setProperty("--peer", CURSOR_COLORS[state.color]!);
  place(mark.caret, caret, origin);
  move(mark.label, caret, origin);
  mark.label.classList.toggle("is-below", caret.top - origin.top < LABEL_ROOM);
  mark.label.textContent = state.name;
  const start = Math.min(head, anchor ?? head);
  const end = Math.max(head, anchor ?? head);
  const rects = start < end ? view.rangeRects(start, end) : [];
  mark.marks.replaceChildren(
    ...rects.map((rect) => {
      const el = document.createElement("div");
      el.className = "collab-selection";
      place(el, rect, origin);
      el.style.width = rect.width + "px";
      return el;
    }),
  );
}

export function createCursors(deps: CursorDeps): Cursors {
  const { doc, text, editor, view } = deps;
  const layer = document.createElement("div");
  layer.className = "collab-cursors";
  layer.hidden = true;
  view.host.appendChild(layer);
  const states = new Map<string, CursorState>();
  const marks = new Map<string, Mark>();
  let active = false;
  let frame = 0;
  let sendTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSent = 0;

  const render = (): void => {
    frame = 0;
    layer.hidden = !active || states.size === 0;
    if (layer.hidden) return;
    const origin = layer.getBoundingClientRect();
    for (const [peer, state] of states) {
      let mark = marks.get(peer);
      if (!mark) {
        mark = newMark(layer);
        marks.set(peer, mark);
      }
      paintMark(mark, state, doc, view, origin);
    }
  };
  const renderSoon = (): void => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const encodeLocal = (): Uint8Array => {
    if (!active) return encodeCursor(deps.profile(), null, null);
    const at = (index: number): Y.RelativePosition =>
      Y.createRelativePositionFromTypeIndex(text, Math.min(index, text.length));
    const forward = editor.selectionDirection !== "backward";
    const anchor = forward ? editor.selectionStart : editor.selectionEnd;
    const head = forward ? editor.selectionEnd : editor.selectionStart;
    return encodeCursor(deps.profile(), at(anchor), at(head));
  };

  const sendNow = (): void => {
    sendTimer = null;
    lastSent = Date.now();
    deps.send(encodeLocal());
  };
  const sendSoon = (): void => {
    if (sendTimer) return;
    sendTimer = setTimeout(
      sendNow,
      Math.max(0, lastSent + SEND_MS - Date.now()),
    );
  };

  const onSelection = (): void => {
    if (active && document.activeElement === editor) sendSoon();
  };
  const onUpdate = (): void => {
    if (active) renderSoon();
  };

  document.addEventListener("selectionchange", onSelection);
  editor.addEventListener("input", onSelection);
  editor.addEventListener("scroll", onUpdate, { passive: true });
  window.addEventListener("resize", onUpdate);
  doc.on("afterTransaction", onUpdate);

  return {
    receive(peer, body) {
      const state = decodeCursor(body);
      if (!state) return;
      states.set(peer, state);
      renderSoon();
    },
    drop(peer) {
      states.delete(peer);
      marks.get(peer)?.root.remove();
      marks.delete(peer);
      renderSoon();
    },
    announce: sendNow,
    setActive(on) {
      if (on === active) return;
      active = on;
      sendNow();
      renderSoon();
    },
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      if (sendTimer) clearTimeout(sendTimer);
      document.removeEventListener("selectionchange", onSelection);
      editor.removeEventListener("input", onSelection);
      editor.removeEventListener("scroll", onUpdate);
      window.removeEventListener("resize", onUpdate);
      doc.off("afterTransaction", onUpdate);
      layer.remove();
    },
  };
}
