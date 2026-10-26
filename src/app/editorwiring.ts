import type { EditorPort } from "../core/ports.ts";
import type { Backdrop } from "../editor/backdrop.ts";
import { initDraftText, type DraftText } from "../editor/drafttext.ts";
import { initEditorText, type EditorText } from "../editor/editortext.ts";
import type { MarkLayer } from "../editor/marklayer.ts";
import { initMarkTap } from "../editor/marktap.ts";
import { sharedSlot, type MdToolbar } from "../mdbar/mdtoolbar.ts";
import type { OfficeSession } from "../office/session.ts";
import { createFixFlow, type FixFlow } from "../spell/fixflow.ts";
import type { SpellSession } from "../spell/spellsession.ts";
import { reveal, type StatusControl } from "../ui/status.ts";
import type { CheckLoop } from "./checkloop.ts";
import { bindArming, bindEditorInput } from "./editorinput.ts";
import type { EditorView } from "./editorview.ts";
import { createFixers, type FixButtons, type Fixers } from "./fixers.ts";
import type { LastCaret } from "./lastcaret.ts";
import type { Popovers } from "./popovers.ts";

export interface EditorWiringView {
  readonly editor: HTMLTextAreaElement;
  readonly port: EditorPort;
  readonly backdrop: Backdrop;
  readonly view: EditorView;
  readonly marks: MarkLayer;
  readonly status: StatusControl;
  readonly fixButtons: FixButtons;
}

export interface EditorWiringFlow {
  readonly spell: SpellSession;
  readonly loop: CheckLoop;
  readonly office: OfficeSession;
  readonly popovers: Popovers;
  readonly lastCaret: LastCaret;
  readonly skipClean: () => boolean;
  readonly textChanged: (text: string) => void;
  readonly clearSource: () => void;
  readonly mdBar: () => MdToolbar;
}

export interface EditorWiringDeps {
  readonly view: EditorWiringView;
  readonly flow: EditorWiringFlow;
}

export interface EditorWiring {
  readonly editorText: EditorText;
  readonly fixFlow: FixFlow;
  readonly fixers: Fixers;
  readonly draft: DraftText;
}

export function createEditorWiring(deps: EditorWiringDeps): EditorWiring {
  const { editor, port, backdrop, view, marks, status, fixButtons } = deps.view;
  const { spell, loop, office, popovers, lastCaret } = deps.flow;
  const { pop, suggestPopover } = popovers;

  const fixFlow = createFixFlow({
    editor,
    spell,
    setText: (text, caret) => port.set(text, caret),
    render: () => void loop.render(),
    commit: loop.commit,
    cancel: () => pop.hide(),
  });

  const hadSelection = bindArming(
    editor,
    () => editorText,
    () => fixFlow,
    view.tokenAtCaret,
  );

  const editorText = initEditorText({
    editor,
    onEdit: () => fixFlow.drop(),
    onReplace: deps.flow.clearSource,
    accept: (old, next) => {
      const docx = office.active();
      if (docx && !docx.sync(old, next)) {
        status.hold("Энэ өөрчлөлтийг docx файлд буулгах боломжгүй");
        return false;
      }
      return true;
    },
    onReplaced: () => fixers.sync(),
  });

  const fixers = createFixers({
    editor: port,
    invalidate: () => spell.clear(),
    skipClean: deps.flow.skipClean,
    buttons: fixButtons,
  });

  const draft = initDraftText({
    editor,
    onLoaded: () => {
      fixers.sync();
      if (editor.value) reveal(editor, "glyph-reveal");
    },
    onCaret: lastCaret.set,
    store: () => {
      const mdBar = deps.flow.mdBar();
      return {
        slot: mdBar.slot,
        shared: sharedSlot,
        read: mdBar.draft,
        write: mdBar.writeDraft,
        caret: mdBar.caret,
        writeCaret: mdBar.writeCaret,
      };
    },
  });

  const markTap = initMarkTap({
    editor,
    backdrop,
    tokens: () => marks.tokens(),
    show: (token) => void suggestPopover.showFor(token),
  });

  bindEditorInput({
    editor,
    editorText,
    marks,
    fixFlow,
    loop,
    hadSelection,
    hidePopover: () => pop.hide(),
    textChanged: deps.flow.textChanged,
    saveSoon: draft.saveSoon,
    fixers: [fixers.decode, fixers.clean],
    setLastCaret: lastCaret.set,
    markTap,
    suggest: suggestPopover,
    tokenAtCaret: view.tokenAtCaret,
  });

  return { editorText, fixFlow, fixers, draft };
}
