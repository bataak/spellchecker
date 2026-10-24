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
}

const PRIVACY =
  "Сервер бичвэрийг уншиж чадахгүй. Бичвэр дамжихдаа нууцлагдана.";
const OWNER_HINT =
  "Хүн бүрт тусдаа урилга үүсгэж илгээнэ үү. Урилга зөвхөн нэг төхөөрөмж дээр нээгдэнэ, өөр хүнд дамжуулбал ажиллахгүй. " +
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

function inviteBox(deps: DialogDeps, note: HTMLElement): HTMLElement {
  const box = element("div", "collab-invite");
  const create = actionButton("Шинэ урилга үүсгэх");
  create.classList.add("suggest-send");
  const field = element("input", "collab-link");
  field.readOnly = true;
  field.hidden = true;
  const row = element("div", "collab-invite-actions");
  row.hidden = true;
  const copy = actionButton("Хуулах");
  row.appendChild(copy);
  if (typeof navigator.share === "function") {
    const share = actionButton("Илгээх");
    share.addEventListener("click", () => {
      navigator
        .share({ title: "Хамтын бичвэр", url: field.value })
        .catch(() => {});
    });
    row.appendChild(share);
  }
  create.addEventListener("click", () => {
    create.disabled = true;
    say(note, "", "Урилга үүсгэж байна…");
    void ask(deps, (live) => live.invite()).then((token) => {
      create.disabled = false;
      if (!token) return say(note, "err", OFFLINE);
      field.value = deps.inviteUrl(token);
      field.hidden = false;
      row.hidden = false;
      field.select();
      say(note, "ok", "Нэг хүнд зориулсан урилга бэлэн боллоо");
    });
  });
  copy.addEventListener("click", () => {
    copyText(field.value).then(
      () => say(note, "ok", "Урилгыг хууллаа"),
      () => {
        field.select();
        say(note, "err", "Хуулж чадсангүй, урилгыг гараар хуулна уу");
      },
    );
  });
  box.append(create, field, row);
  return box;
}

function memberRow(
  member: Member,
  remove: (member: Member) => void,
): HTMLLIElement {
  const item = element("li", member.online ? "is-online" : "");
  const name = element("span", "collab-member-name", member.name || "Нэргүй");
  item.appendChild(name);
  if (member.owner)
    item.appendChild(element("span", "collab-member-tag", "та"));
  else {
    const drop = actionButton("Хасах");
    drop.classList.add("collab-stop");
    drop.addEventListener("click", () => remove(member));
    item.appendChild(drop);
  }
  return item;
}

function memberList(deps: DialogDeps, note: HTMLElement): HTMLElement {
  const box = element("div", "collab-members");
  const title = element("h3", "collab-members-title", "Хамтрагчид");
  const list = element("ul", "");
  box.append(title, list);
  const show = (members: Member[] | null): void => {
    if (!members) {
      list.replaceChildren(element("li", "collab-members-empty", OFFLINE));
      return;
    }
    list.replaceChildren(...members.map((m) => memberRow(m, remove)));
    if (members.length < 2)
      list.appendChild(
        element("li", "collab-members-empty", "Одоогоор хэн ч нэгдээгүй"),
      );
  };
  function remove(member: Member): void {
    const name = member.name || "Энэ хүн";
    if (
      !window.confirm(
        name + "-г хасах уу? Тэр цааш энэ бичвэрийг засах боломжгүй болно.",
      )
    )
      return;
    void ask(deps, (live) => live.remove(member.dev)).then((members) => {
      show(members);
      if (members) say(note, "ok", name + " хасагдлаа");
    });
  }
  list.appendChild(element("li", "collab-members-empty", "Ачаалж байна…"));
  void ask(deps, (live) => live.members()).then(show);
  return box;
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
  if (deps.owner) card.append(memberList(deps, note));
  card.append(note, actions);
  dialog.appendChild(card);
  leave.addEventListener("click", () => {
    const warning = deps.owner
      ? "Хамтын засварыг зогсоох уу? Та цааш урилга үүсгэх, хамтрагч хасах боломжгүй болно. Бичвэр энэ төхөөрөмж дээр хадгалагдаж үлдэнэ."
      : "Хамтын засварыг зогсоох уу? Дахин нэгдэхэд шинэ урилга хэрэгтэй. Бичвэр энэ төхөөрөмж дээр хадгалагдаж үлдэнэ.";
    if (!window.confirm(warning)) return;
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
