import type * as Y from "yjs";
import { minimalDiff } from "../mdbar/mdedit.ts";
import { applyRemote, remoteChanges } from "../editor/editortext.ts";
import {
  applyChanges,
  deltaChanges,
  mapOffset,
  type TextChange,
} from "../editor/textdelta.ts";

export interface TextBinding {
  attach(): void;
  detach(): void;
  attached(): boolean;
  destroy(): void;
}

export interface Rebased {
  readonly text: string;
  readonly local: TextChange | null;
}

export function rebaseLocal(
  shadow: string,
  editor: string,
  remote: readonly TextChange[],
): Rebased {
  const merged = applyChanges(shadow, remote);
  const patch = minimalDiff(shadow, editor);
  if (!patch) return { text: merged, local: null };
  const from = mapOffset(remote, patch.from);
  const to = Math.max(from, mapOffset(remote, patch.to));
  const local = { from, to, insert: patch.insert };
  return { text: applyChanges(merged, [local]), local };
}

function writeChange(text: Y.Text, change: TextChange, origin: object): void {
  text.doc!.transact(() => {
    if (change.to > change.from)
      text.delete(change.from, change.to - change.from);
    if (change.insert) text.insert(change.from, change.insert);
  }, origin);
}

export function bindText(
  editor: HTMLTextAreaElement,
  text: Y.Text,
): TextBinding {
  const origin = { local: true };
  let shadow = "";
  let on = false;
  let composing = false;
  let stale = false;

  const write = (change: TextChange): void => writeChange(text, change, origin);

  const pushLocal = (): void => {
    const patch = minimalDiff(shadow, editor.value);
    shadow = editor.value;
    if (patch) write(patch);
  };

  const reconcile = (defer: boolean): void => {
    const target = minimalDiff(shadow, text.toString());
    const rebased = rebaseLocal(shadow, editor.value, target ? [target] : []);
    const patch = minimalDiff(editor.value, rebased.text);
    if (patch) applyRemote(editor, [patch]);
    const local = rebased.local;
    if (!local) {
      shadow = editor.value;
      return;
    }
    shadow = text.toString();
    const commit = (): void => {
      write(local);
      shadow = editor.value;
    };
    if (defer) queueMicrotask(commit);
    else commit();
  };

  const settle = (): void => {
    if (!stale) return pushLocal();
    stale = false;
    reconcile(false);
  };

  const onInput = (event: Event): void => {
    if (!on || remoteChanges(event)) return;
    if (!(event as InputEvent).isComposing) settle();
  };

  const onCompositionStart = (): void => {
    composing = true;
  };

  const onCompositionEnd = (): void => {
    composing = false;
    if (on) settle();
  };

  const onChange = (event: Y.YTextEvent, tx: Y.Transaction): void => {
    if (!on || tx.origin === origin) return;
    if (composing) {
      stale = true;
      return;
    }
    if (editor.value !== shadow) {
      reconcile(true);
      return;
    }
    const changes = deltaChanges(event.delta);
    if (!changes.length) return;
    applyRemote(editor, changes);
    shadow = editor.value;
  };

  editor.addEventListener("input", onInput);
  editor.addEventListener("compositionstart", onCompositionStart);
  editor.addEventListener("compositionend", onCompositionEnd);
  text.observe(onChange);

  return {
    attach() {
      if (on) return;
      on = true;
      composing = false;
      stale = false;
      shadow = editor.value;
      const target = text.toString();
      const patch = minimalDiff(shadow, target);
      if (patch) applyRemote(editor, [patch]);
      shadow = editor.value;
    },
    detach() {
      on = false;
    },
    attached: () => on,
    destroy() {
      on = false;
      editor.removeEventListener("input", onInput);
      editor.removeEventListener("compositionstart", onCompositionStart);
      editor.removeEventListener("compositionend", onCompositionEnd);
      text.unobserve(onChange);
    },
  };
}
