import * as Y from "yjs";
import { createEmitter } from "../core/emitter.ts";
import { move, place, watchLayout } from "./overlay.ts";
import { fromBase64Url, toBase64Url } from "./collabkey.ts";
import { CURSOR_COLORS } from "./peercolors.ts";
import type { Profile } from "./profile.ts";

export interface CursorView {
  readonly host: HTMLElement;
  readonly caretRect: (offset: number) => DOMRect | null;
  readonly rangeRects: (start: number, end: number) => DOMRect[];
  readonly onRender: (listener: () => void) => () => void;
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
  active(): boolean;
  onActive(listener: () => void): () => void;
  destroy(): void;
}

export interface CursorDeps {
  readonly doc: Y.Doc;
  readonly text: () => Y.Text | null;
  readonly editor: HTMLTextAreaElement;
  readonly view: CursorView;
  readonly profile: () => Profile;
  readonly send: (body: Uint8Array) => void;
}

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

export function selectionEdges(
  text: Y.Text,
  start: number,
  end: number,
  forward: boolean,
): [anchor: Y.RelativePosition, head: Y.RelativePosition] {
  const at = (index: number, assoc: number): Y.RelativePosition =>
    Y.createRelativePositionFromTypeIndex(
      text,
      Math.min(index, text.length),
      assoc,
    );
  const left = at(start, 0);
  const right = start === end ? left : at(end, -1);
  return forward ? [left, right] : [right, left];
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

function absolute(
  doc: Y.Doc,
  text: Y.Text | null,
  rel: Y.RelativePosition | null,
): number | null {
  if (!rel || !text) return null;
  const at = Y.createAbsolutePositionFromRelativePosition(rel, doc);
  return at && at.type === text ? at.index : null;
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

function paintMark(
  mark: Mark,
  state: CursorState,
  doc: Y.Doc,
  text: Y.Text | null,
  view: CursorView,
  origin: DOMRect,
): void {
  const head = absolute(doc, text, state.head);
  const anchor = absolute(doc, text, state.anchor);
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

function watchDoc(
  editor: HTMLTextAreaElement,
  doc: Y.Doc,
  update: () => void,
): () => void {
  const unwatch = watchLayout(editor, update);
  doc.on("afterTransaction", update);
  return () => {
    unwatch();
    doc.off("afterTransaction", update);
  };
}

export function createCursors(deps: CursorDeps): Cursors {
  const { doc, editor, view } = deps;
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
  const activated = createEmitter();

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
      paintMark(mark, state, doc, deps.text(), view, origin);
    }
  };
  const renderSoon = (): void => {
    if (!frame) frame = requestAnimationFrame(render);
  };

  const encodeLocal = (): Uint8Array => {
    const text = deps.text();
    if (!active || !text) return encodeCursor(deps.profile(), null, null);
    const [anchor, head] = selectionEdges(
      text,
      editor.selectionStart,
      editor.selectionEnd,
      editor.selectionDirection !== "backward",
    );
    return encodeCursor(deps.profile(), anchor, head);
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
  const unwatch = watchDoc(editor, doc, onUpdate);

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
      activated.emit();
    },
    active: () => active,
    onActive: activated.on,
    destroy() {
      if (frame) cancelAnimationFrame(frame);
      if (sendTimer) clearTimeout(sendTimer);
      document.removeEventListener("selectionchange", onSelection);
      editor.removeEventListener("input", onSelection);
      unwatch();
      activated.clear();
      layer.remove();
    },
  };
}
