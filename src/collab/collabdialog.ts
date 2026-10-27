import { copyText } from "../ui/clipboard.ts";
import { memberList } from "./collabmembers.ts";
import { element } from "../ui/dom.ts";
import { actionButton, ask, OFFLINE, say } from "./dialogparts.ts";
import type { Session } from "./sessiontypes.ts";
import type { Invite } from "./collabkey.ts";
import { MAX_NAME } from "./profile.ts";

export interface DialogDeps {
  readonly owner: boolean;
  readonly session: () => Promise<Session>;
  readonly started: boolean;
  readonly join?: ((text: string) => boolean) | null;
  readonly inviteUrl: (invite: Invite) => string;
  readonly inviteName?: string | null;
  readonly name: string;
  readonly tip: string | null;
  readonly rename: (name: string) => void;
  readonly stop: () => void;
  readonly end: (wipe: boolean) => Promise<boolean>;
}

const OWNER_HINT =
  "Бичвэрээ бусадтай хамтран засахын тулд хамтрагч бүрдээ урилга үүсгэж илгээнэ үү. Урилга зөвхөн нэг төхөөрөмж дээр нээгдэнэ, өөр хүнд дамжуулбал ажиллахгүй. Бичвэр серверээр дамжихдаа нууцлагдаж байгаа болно.";
const MEMBER_HINT =
  "Та энэхүү бичвэрийг засалцахаар уригджээ. Өөр хүн нэмэх бол урилга илгээсэн хүндээ хандана уу. Бичвэр серверээр дамжихдаа нууцлагдаж байгаа болно.";

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

type InviteMode = "idle" | "give" | "take";

function inviteBox(
  deps: DialogDeps,
  note: HTMLElement,
  invited: () => void,
  join: HTMLElement | null,
): HTMLElement {
  const box = element("div", "collab-invite");
  const row = element("div", "collab-mode-row");
  const create = actionButton("Урилга өгөх");
  const list = element("ol", "collab-invite-list");
  const take = join ? actionButton("Урилга авах") : null;
  let mode: InviteMode = "idle";
  const render = (): void => {
    create.classList.toggle("suggest-send", mode !== "take");
    take?.classList.toggle("suggest-send", mode === "take");
    if (take) take.hidden = mode === "give";
    if (join) join.hidden = mode !== "take";
    list.hidden = mode === "take";
  };
  create.addEventListener("click", () => {
    mode = "give";
    render();
    create.disabled = true;
    say(note, "", "Урилга үүсгэж байна…");
    void ask(deps, (live) => live.invite(deps.inviteName)).then((invite) => {
      create.disabled = false;
      invited();
      if (!invite) return say(note, "err", OFFLINE);
      const row = inviteRow(deps.inviteUrl(invite), note);
      list.appendChild(row);
      row.scrollIntoView({ block: "nearest" });
      say(
        note,
        "ok",
        "Урилга бэлэн. Нэг урилгыг зөвхөн нэг хүнд илгээнэ үү. Дахин дарж өөр хүнд шинийг үүсгэнэ.",
      );
    });
  });
  take?.addEventListener("click", () => {
    mode = "take";
    render();
    say(note, "", "");
    join?.querySelector<HTMLInputElement>("input")?.focus();
  });
  row.append(create, ...(take ? [take] : []));
  box.append(row, list, ...(join ? [join] : []));
  render();
  return box;
}

function joinBox(
  join: (text: string) => boolean,
  note: HTMLElement,
  done: () => void,
): HTMLElement {
  const box = element("div", "collab-join");
  const row = element("div", "collab-invite-row");
  const field = element("input", "collab-join-field");
  field.placeholder = "Урилгын холбоосыг энд буулгана уу";
  field.setAttribute("aria-label", "Урилгын холбоос");
  const submit = (): void => {
    if (!field.value.trim()) return field.focus();
    if (!join(field.value))
      return say(note, "err", "Энэ нь хамтран засах урилгын холбоос биш байна");
    done();
  };
  field.addEventListener("paste", (event) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text.trim()) return;
    event.preventDefault();
    field.value = text.trim();
    submit();
  });
  field.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    submit();
  });
  row.append(field);
  box.appendChild(row);
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
      "Хамтран засварлах ажиллагааг зогсоох уу? Бичвэр энэ төхөөрөмж дээр хадгалагдаж үлдэнэ.",
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
  if (deps.tip) card.append(element("p", "suggest-hint collab-tip", deps.tip));
  let others: number | null = null;
  const stops: (() => void)[] = [];
  let members: HTMLElement | null = null;
  const showMembers = (): void => {
    leave.hidden = false;
    if (members || !deps.owner) return;
    members = memberList(
      deps,
      note,
      (count) => (others = count),
      (stop) => (dialog.open ? stops.push(stop) : stop()),
    );
    card.insertBefore(members, note);
  };
  const join =
    deps.join && !deps.started
      ? joinBox(deps.join, note, () => dialog.close())
      : null;
  if (deps.owner) card.append(inviteBox(deps, note, showMembers, join));
  card.append(nameField(deps));
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
  if (deps.started) showMembers();
  else leave.hidden = true;
  leave.addEventListener("click", () => {
    if (deps.owner && others !== 0) return toggle(true);
    if (deps.owner) return endAlone(deps, note, () => dialog.close());
    if (
      !window.confirm(
        "Хамтран засварлах ажиллагааг зогсоох уу? Дахин хамтран засварлахад шинэ урилга үүсгүүлэх хэрэгтэй. Бичвэр энэ төхөөрөмж дээр хадгалагдаж үлдэнэ.",
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
  dialog.addEventListener("close", () => {
    for (const stop of stops) stop();
    dialog.remove();
  });
  document.body.appendChild(dialog);
  dialog.showModal();
}
