import { copyText } from "../ui/clipboard.ts";
import type { Member } from "./admin.ts";
import type { Session } from "./session.ts";
import { MAX_NAME } from "./profile.ts";

export interface DialogDeps {
  readonly owner: boolean;
  readonly session: Promise<Session>;
  readonly inviteUrl: (token: string) => string;
  readonly name: string;
  readonly rename: (name: string) => void;
  readonly stop: () => void;
  readonly end: (wipe: boolean) => Promise<boolean>;
}

const PRIVACY =
  "Бичвэр дамжихдаа нууцлагдаж байгаа тул сервер бичвэрийг тайлж чадахгүй.";
const OWNER_HINT =
  "Энэхүү талбарыг хуваалцахдаа хүн бүрд тусдаа урилга үүсгэж илгээнэ үү. Урилга зөвхөн нэг төхөөрөмж дээр нээгдэнэ, өөр хүнд дамжуулбал ажиллахгүй. " +
  PRIVACY;
const MEMBER_HINT =
  "Та энэ бичвэрт уригдсан. Өөр хүн нэмэх бол үүсгэгчид хандана уу. " + PRIVACY;
const OFFLINE =
  "Сервертэй холбогдоогүй байна. Түр хүлээгээд дахин оролдоно уу.";

function ask<T>(
  deps: DialogDeps,
  run: (live: Session) => Promise<T | null>,
): Promise<T | null> {
  return deps.session.then(run).catch(() => null);
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text = "",
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text) el.textContent = text;
  return el;
}

function actionButton(label: string): HTMLButtonElement {
  const button = element("button", "tbtn", label);
  button.type = "button";
  return button;
}

function say(note: HTMLElement, kind: "ok" | "err" | "", text: string): void {
  note.dataset.kind = kind;
  note.textContent = text;
}

function nameField(deps: DialogDeps): HTMLLabelElement {
  const label = element("label", "collab-name", "Таны нэр");
  const input = element("input", "");
  input.maxLength = MAX_NAME;
  input.value = deps.name;
  input.addEventListener("change", () => deps.rename(input.value));
  label.appendChild(input);
  return label;
}

function inviteRow(url: string, note: HTMLElement): HTMLLIElement {
  const row = element("li", "collab-invite-row");
  const field = element("input", "collab-link");
  field.readOnly = true;
  field.value = url;
  const copy = actionButton("Хуулах");
  copy.addEventListener("click", () => {
    copyText(url).then(
      () => {
        copy.textContent = "Хуулсан";
        row.classList.add("is-copied");
        say(note, "ok", "Урилгыг хууллаа");
      },
      () => {
        field.select();
        say(note, "err", "Хуулж чадсангүй, урилгыг гараар хуулна уу");
      },
    );
  });
  row.append(field, copy);
  if (typeof navigator.share === "function") {
    const share = actionButton("Илгээх");
    share.addEventListener("click", () => {
      navigator.share({ title: "Хамтын бичвэр", url }).catch(() => {});
    });
    row.appendChild(share);
  }
  return row;
}

function inviteBox(deps: DialogDeps, note: HTMLElement): HTMLElement {
  const box = element("div", "collab-invite");
  const create = actionButton("Шинэ урилга үүсгэх");
  create.classList.add("suggest-send");
  const list = element("ol", "collab-invite-list");
  create.addEventListener("click", () => {
    create.disabled = true;
    say(note, "", "Урилга үүсгэж байна…");
    void ask(deps, (live) => live.invite()).then((token) => {
      create.disabled = false;
      if (!token) return say(note, "err", OFFLINE);
      const row = inviteRow(deps.inviteUrl(token), note);
      list.appendChild(row);
      row.scrollIntoView({ block: "nearest" });
      say(
        note,
        "ok",
        "Урилга бэлэн. Нэг урилгыг зөвхөн нэг хүнд илгээнэ үү. Дахин дарж өөр хүнд шинийг үүсгэнэ.",
      );
    });
  });
  box.append(create, list);
  return box;
}

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

function memberList(
  deps: DialogDeps,
  note: HTMLElement,
  counted: (others: number | null) => void,
): HTMLElement {
  const box = element("div", "collab-members");
  const title = element("h3", "collab-members-title", "Хамтрагчид");
  const list = element("ul", "");
  box.append(title, list);
  const show = (members: Member[] | null): void => {
    counted(members ? members.filter((m) => !m.owner).length : null);
    if (!members) {
      list.replaceChildren(element("li", "collab-members-empty", OFFLINE));
      return;
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
  return box;
}

function endChoice(
  deps: DialogDeps,
  note: HTMLElement,
  done: () => void,
  cancel: () => void,
): HTMLElement {
  const box = element("div", "collab-end");
  box.hidden = true;
  const text = element(
    "p",
    "suggest-hint",
    "Зогсооход хамтрагчид энэ бичвэрийг цааш засах боломжгүй болно. Тэдний төхөөрөмж дээрх хуулбарыг устгах уу?",
  );
  const row = element("div", "suggest-actions");
  const keep = actionButton("Хуулбарыг үлдээх");
  const wipe = actionButton("Бүрмөсөн устгах");
  wipe.classList.add("collab-wipe");
  const back = actionButton("Болих");
  row.append(back, keep, wipe);
  const choose = (remove: boolean): void => {
    keep.disabled = wipe.disabled = back.disabled = true;
    say(note, "", "Зогсоож байна…");
    void deps.end(remove).then((ok) => {
      keep.disabled = wipe.disabled = back.disabled = false;
      if (ok) return done();
      say(note, "err", OFFLINE);
    });
  };
  keep.addEventListener("click", () => choose(false));
  wipe.addEventListener("click", () => choose(true));
  back.addEventListener("click", cancel);
  box.append(text, row);
  return box;
}

function endAlone(deps: DialogDeps, note: HTMLElement, done: () => void): void {
  if (
    !window.confirm(
      "Хамтын засварыг зогсоох уу? Бичвэр энэ төхөөрөмж дээр хадгалагдаж үлдэнэ.",
    )
  )
    return;
  say(note, "", "Зогсоож байна…");
  void deps.end(false).then((ok) => (ok ? done() : say(note, "err", OFFLINE)));
}

export function openDialog(deps: DialogDeps): void {
  const dialog = element("dialog", "suggest-overlay collab-overlay");
  dialog.setAttribute("aria-labelledby", "collabTitle");
  const card = element("div", "suggest-card");
  const title = element("h2", "suggest-title", "Хамтран засах");
  title.id = "collabTitle";
  const hint = element(
    "p",
    "suggest-hint",
    deps.owner ? OWNER_HINT : MEMBER_HINT,
  );
  const note = element("p", "suggest-note");
  note.setAttribute("role", "status");
  const actions = element("div", "suggest-actions");
  const leave = actionButton("Зогсоох");
  leave.classList.add("collab-stop");
  const close = actionButton("Хаах");
  actions.append(leave, close);
  card.append(title, hint);
  if (deps.owner) card.append(inviteBox(deps, note));
  card.append(nameField(deps));
  let others: number | null = null;
  if (deps.owner)
    card.append(memberList(deps, note, (count) => (others = count)));
  const toggle = (ending: boolean): void => {
    choice.hidden = !ending;
    actions.hidden = ending;
    say(note, "", "");
  };
  const choice = endChoice(
    deps,
    note,
    () => dialog.close(),
    () => toggle(false),
  );
  card.append(note, choice, actions);
  dialog.appendChild(card);
  leave.addEventListener("click", () => {
    if (deps.owner && others !== 0) return toggle(true);
    if (deps.owner) return endAlone(deps, note, () => dialog.close());
    if (
      !window.confirm(
        "Хамтын засварыг зогсоох уу? Дахин нэгдэхэд шинэ урилга хэрэгтэй. Бичвэр энэ төхөөрөмж дээр хадгалагдаж үлдэнэ.",
      )
    )
      return;
    deps.stop();
    dialog.close();
  });
  close.addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  dialog.addEventListener("close", () => dialog.remove());
  document.body.appendChild(dialog);
  dialog.showModal();
}
