import type { Member } from "./admin.ts";
import {
  actionButton,
  ask,
  element,
  OFFLINE,
  say,
  type SessionSource,
} from "./dialogparts.ts";

const REFRESH_MS = 1500;

function memberRow(
  member: Member,
  remove: (member: Member, wipe: boolean) => void,
): HTMLLIElement {
  const item = element("li", member.online ? "is-online" : "");
  const name = element("span", "collab-member-name", member.name || "Нэргүй");
  const drop = actionButton("Хасах");
  drop.classList.add("collab-stop");
  const choice = element("div", "collab-member-choice");
  choice.hidden = true;
  const question = element(
    "p",
    "",
    "Түүний төхөөрөмж дээрх хуулбарыг устгах уу?",
  );
  const wipe = actionButton("Бүрмөсөн устгах");
  wipe.classList.add("collab-wipe");
  const keep = actionButton("Хуулбар үлдээх");
  const back = actionButton("Болих");
  choice.append(question, back, keep, wipe);
  const toggle = (open: boolean): void => {
    choice.hidden = !open;
    drop.hidden = open;
  };
  const pick = (purge: boolean): void => {
    wipe.disabled = keep.disabled = back.disabled = true;
    remove(member, purge);
  };
  drop.addEventListener("click", () => toggle(true));
  back.addEventListener("click", () => toggle(false));
  wipe.addEventListener("click", () => pick(true));
  keep.addEventListener("click", () => pick(false));
  item.append(name, drop, choice);
  return item;
}

export function memberList(
  deps: SessionSource,
  note: HTMLElement,
  counted: (others: number | null) => void,
  closing: (stop: () => void) => void,
): HTMLElement {
  const box = element("div", "collab-members");
  const title = element("h3", "collab-members-title", "Хамтрагчид");
  const list = element("ul", "");
  box.append(title, list);
  const show = (members: Member[] | null): void => {
    counted(members ? members.filter((m) => !m.owner).length : null);
    if (!members) {
      list.replaceChildren();
      return say(note, "err", OFFLINE);
    }
    const others = members.filter((m) => !m.owner);
    title.textContent = others.length > 1 ? "Хамтрагчид" : "Хамтрагч";
    list.replaceChildren(...others.map((m) => memberRow(m, remove)));
    if (!others.length)
      list.appendChild(
        element("li", "collab-members-empty", "Одоогоор хамтрагч алга"),
      );
  };
  function remove(member: Member, wipe: boolean): void {
    const name = member.name || "Хамтрагч";
    void ask(deps, (live) => live.remove(member.dev, wipe)).then((members) => {
      show(members);
      if (members)
        say(
          note,
          "ok",
          wipe
            ? name + " хасагдаж, бичвэр нь устгагдлаа"
            : name + " хасагдлаа, хуулбар нь түүнд үлдлээ",
        );
    });
  }
  list.appendChild(element("li", "collab-members-empty", "Ачаалж байна…"));
  void ask(deps, (live) => live.members()).then(show);
  let timer: ReturnType<typeof setTimeout> | null = null;
  const refresh = (): void => {
    timer = null;
    if (list.querySelector(".collab-member-choice:not([hidden])"))
      return void (timer = setTimeout(refresh, REFRESH_MS));
    void ask(deps, (live) => live.members()).then((members) => {
      if (members) show(members);
    });
  };
  const changed = (): void => {
    timer ??= setTimeout(refresh, REFRESH_MS);
  };
  void deps
    .session()
    .then((live) => {
      const unwatch = live.watch(changed);
      closing(() => {
        unwatch();
        if (timer) clearTimeout(timer);
      });
    })
    .catch(() => {});
  return box;
}
