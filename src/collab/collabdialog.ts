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
  remove: (member: Member) => void,
): HTMLLIElement {
  const item = element("li", member.online ? "is-online" : "");
  const name = element("span", "collab-member-name", member.name || "Нэргүй");
  item.appendChild(name);
  const drop = actionButton("Хасах");
  drop.classList.add("collab-stop");
  drop.addEventListener("click", () => remove(member));
  item.appendChild(drop);
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
    const others = members.filter((m) => !m.owner);
    list.replaceChildren(...others.map((m) => memberRow(m, remove)));
    if (!others.length)
      list.appendChild(
        element("li", "collab-members-empty", "Одоогоор хамтрагч алга"),
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
