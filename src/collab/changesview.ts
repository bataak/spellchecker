import type { Change } from "./changes.ts";
import type { ChangeTracker, RejectedChange } from "./changetracker.ts";
import { revealText } from "./safetext.ts";
import {
  button,
  changeBody,
  changeTitle,
  clockOf,
  dot,
  type TalkView,
} from "./talkview.ts";
import { element } from "../ui/dom.ts";
import { showSnackbar } from "../ui/snackbar.ts";

const MAX_SHOWN = 200;
const CHANGES_WAIT = "Өөрчлөлтийг хянаж эхэлж байна…";
const CHANGES_EMPTY = "Сүүлд зөвшөөрснөөс хойш өөрчлөлт алга.";
const UNDO = "Буцаах";
const RESTORE_FAILED =
  "Сэргээж чадсангүй: тухайн хэсэг дараа нь өөрчлөгдсөн байна.";

export function changesCount(count: number): string {
  return count === 0 ? "Өөрчлөлтгүй" : count + " өөрчлөлт";
}

export function rejectedLabel(count: number, shown: boolean): string {
  return (
    (shown ? "Татгалзсаныг нуух" : "Татгалзсаныг харуулах") + " (" + count + ")"
  );
}

interface ChangeActions {
  readonly reveal: (change: Change) => void;
  readonly tracker: ChangeTracker;
}

function restore(tracker: ChangeTracker, id: string): void {
  if (!tracker.restore(id)) showSnackbar(RESTORE_FAILED, null);
}

function accept(tracker: ChangeTracker, change: Change): void {
  const undo = tracker.accept(change);
  showSnackbar("Зөвшөөрлөө", { label: UNDO, run: undo });
}

function reject(tracker: ChangeTracker, change: Change): void {
  const id = tracker.reject(change);
  if (id)
    showSnackbar("Татгалзлаа", {
      label: UNDO,
      run: () => restore(tracker, id),
    });
}

function changeRow(change: Change, actions: ChangeActions): HTMLLIElement {
  const row = element("li", "talk-change");
  const head = element("div", "talk-change-head");
  head.append(
    dot(change.author?.color ?? null),
    element("span", "talk-change-who", changeTitle(change)),
  );
  if (change.path)
    head.append(element("span", "talk-change-path", revealText(change.path)));
  const show = button("talk-change-show", "");
  show.append(changeBody(change));
  show.title = "Байрлал руу очих";
  show.addEventListener("click", () => actions.reveal(change));
  const yes = button("talk-change-act", "✓", "Зөвшөөрөх");
  yes.addEventListener("click", () => accept(actions.tracker, change));
  const no = button("talk-change-act is-reject", "✕", "Татгалзаж буцаах");
  no.addEventListener("click", () => reject(actions.tracker, change));
  const tools = element("div", "talk-change-tools");
  tools.append(yes, no);
  head.append(tools);
  row.append(head, show);
  return row;
}

function rejectedRow(
  record: RejectedChange,
  tracker: ChangeTracker,
): HTMLLIElement {
  const row = element("li", "talk-change is-rejected");
  const head = element("div", "talk-change-head");
  head.append(
    dot(record.author?.color ?? null),
    element("span", "talk-change-who", changeTitle(record)),
    element("time", "talk-msg-time", clockOf(record.at)),
  );
  if (record.path)
    head.append(element("span", "talk-change-path", revealText(record.path)));
  const back = button(
    "talk-accept-all",
    "Сэргээх",
    "Татгалзлаа буцааж сэргээх",
  );
  back.addEventListener("click", () => restore(tracker, record.id));
  const tools = element("div", "talk-change-tools");
  tools.append(back);
  head.append(tools);
  row.append(head, changeBody(record));
  return row;
}

export function changesView(
  tracker: ChangeTracker,
  reveal: (change: Change) => void,
): TalkView {
  const el = element("div", "talk-changes");
  const bar = element("div", "talk-changes-bar");
  const count = element("span", "talk-changes-count");
  const acceptAll = button("talk-accept-all", "Бүгдийг зөвшөөр");
  acceptAll.addEventListener("click", () => {
    const undo = tracker.acceptAll();
    showSnackbar("Бүгдийг зөвшөөрлөө", { label: UNDO, run: undo });
  });
  const toggle = button("talk-accept-all", "");
  bar.append(count, acceptAll, toggle);
  const list = element("ol", "talk-change-list");
  const gone = element("ol", "talk-change-list talk-rejected-list");
  const empty = element("p", "talk-empty");
  el.append(bar, list, empty, gone);
  let visible = false;
  let showRejected = false;
  const actions = { tracker, reveal };

  const render = (): void => {
    if (!visible) return;
    const changes = tracker.list();
    const rejected = tracker.rejected();
    count.textContent = changesCount(changes.length);
    acceptAll.disabled = changes.length === 0;
    toggle.hidden = rejected.length === 0;
    toggle.textContent = rejectedLabel(rejected.length, showRejected);
    toggle.setAttribute("aria-pressed", String(showRejected));
    list.replaceChildren(
      ...changes
        .slice(0, MAX_SHOWN)
        .map((change) => changeRow(change, actions)),
    );
    gone.hidden = !showRejected || rejected.length === 0;
    gone.replaceChildren(
      ...rejected.map((record) => rejectedRow(record, tracker)),
    );
    empty.hidden = changes.length > 0;
    empty.textContent = tracker.ready() ? CHANGES_EMPTY : CHANGES_WAIT;
  };
  toggle.addEventListener("click", () => {
    showRejected = !showRejected;
    render();
  });
  const off = tracker.onChange(render);
  return {
    el,
    shown(on) {
      visible = on;
      render();
    },
    destroy: off,
  };
}
