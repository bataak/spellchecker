import { askChoice } from "../ui/ask.ts";
import { PROJECT_SLOT, isFileSlot } from "../slots/fileslots.ts";
import { isPlain } from "../doc/templates.ts";
import { copyText } from "../ui/clipboard.ts";
import { showSnackbar } from "../ui/snackbar.ts";
import {
  TEXT_LINK_WARNING,
  fitsTextLink,
  isTextHash,
  readTextHash,
  textHash,
} from "../files/textlink.ts";
import { chosenExample } from "../slots/slotstore.ts";
import {
  exampleInHash,
  parseSlotHash,
  slotHash,
  type SlotTarget,
} from "./slothash.ts";

export interface UrlNavDeps {
  readonly editor: HTMLTextAreaElement;
  readonly copyButton: HTMLElement | null;
  readonly template: () => string;
  readonly fileSlots: () => readonly { id: string; name: string }[];
  readonly choose: (id: string, example?: string) => void;
  readonly showFile: (id: string) => void;
  readonly hasProject: () => boolean;
  readonly projectText: (path: string) => string | null;
  readonly projectPath: () => string | null;
  readonly enterProject: () => void;
  readonly openPath: (path: string) => void;
  readonly openText: (name: string, text: string) => Promise<void>;
  readonly notify: (message: string) => void;
}

const URL_PREFIX = "#url=";
const NO_PROJECT = "Төсөл нээлттэй биш байна";
const BAD_TEXT_LINK = "Холбоос доторх бичвэрийг уншиж чадсангүй";
const LINK_COPIED = "Талбарын холбоос хуулагдлаа";
const WITH_TEXT = "Бичвэртэй хуулах";
const CANT_COPY = "Хуулах боломжгүй";

const pageUrl = (): string =>
  location.origin + location.pathname + location.search;

function clearHash(): void {
  history.replaceState(history.state, "", location.pathname + location.search);
}

function currentTarget(d: UrlNavDeps): SlotTarget | null {
  const id = d.template();
  if (id === PROJECT_SLOT) return { kind: "project", path: d.projectPath() };
  if (!isFileSlot(id))
    return exampleInHash(id)
      ? { kind: "template", id, example: chosenExample(id) }
      : { kind: "template", id };
  const slot = d.fileSlots().find((file) => file.id === id);
  return slot ? { kind: "file", name: slot.name } : null;
}

function linkName(d: UrlNavDeps): string {
  const target = currentTarget(d);
  if (target?.kind === "file") return target.name;
  if (target?.kind === "project" && target.path)
    return target.path.split("/").at(-1)!;
  return target?.kind === "template" && isPlain(target.id)
    ? "бичвэр.txt"
    : "бичвэр.md";
}

function goProject(d: UrlNavDeps, path: string | null): void {
  if (!d.hasProject()) return d.notify(NO_PROJECT);
  if (path !== null && d.projectText(path) === null)
    return d.notify("Төсөлд «" + path + "» файл алга");
  d.enterProject();
  if (path !== null && d.projectPath() !== path) d.openPath(path);
}

function goTarget(d: UrlNavDeps, target: SlotTarget): void {
  if (target.kind === "template") return d.choose(target.id, target.example);
  if (target.kind === "project") return goProject(d, target.path);
  const slot = d.fileSlots().find((file) => file.name === target.name);
  if (slot) return d.showFile(slot.id);
  d.notify("«" + target.name + "» файл энэ төхөөрөмж дээр нээлттэй биш байна");
}

async function openTextLink(d: UrlNavDeps, hash: string): Promise<void> {
  const linked = await readTextHash(hash);
  if (!linked) return d.notify(BAD_TEXT_LINK);
  const name = linked.name ?? "холбоос.txt";
  const ask =
    "Холбоос доторх бичвэрийг (" +
    linked.text.length +
    " тэмдэгт) «" +
    name +
    "» нэртэй шинэ файлд нээх үү?";
  if (await askChoice({ title: ask, yes: "Нээх", no: "Болих" }))
    await d.openText(name, linked.text);
}

function remoteInput(hash: string): string {
  const raw = hash.slice(URL_PREFIX.length);
  try {
    return /^https?%3A/i.test(raw) ? decodeURIComponent(raw) : raw;
  } catch {
    return raw;
  }
}

async function openRemoteLink(d: UrlNavDeps, hash: string): Promise<void> {
  const { openRemote } = await import("./remoteopen.ts");
  await openRemote(remoteInput(hash), {
    openText: d.openText,
    notify: d.notify,
  });
}

async function readHash(d: UrlNavDeps): Promise<void> {
  const hash = location.hash;
  if (isTextHash(hash)) {
    clearHash();
    await openTextLink(d, hash);
  } else if (hash.startsWith(URL_PREFIX)) {
    clearHash();
    await openRemoteLink(d, hash);
  } else {
    const target = parseSlotHash(hash);
    if (!target) return;
    clearHash();
    goTarget(d, target);
  }
}

async function copySlotLink(d: UrlNavDeps): Promise<void> {
  const target = currentTarget(d);
  if (!target) return;
  const text = d.editor.value;
  const name = linkName(d);
  try {
    await copyText(pageUrl() + slotHash(target));
  } catch {
    showSnackbar(CANT_COPY, null);
    return;
  }
  const withText = fitsTextLink(text) ? await textHash(text, name) : null;
  showSnackbar(
    LINK_COPIED,
    withText
      ? {
          label: WITH_TEXT,
          run: () =>
            void copyText(pageUrl() + withText).then(
              () => showSnackbar(TEXT_LINK_WARNING, null),
              () => showSnackbar(CANT_COPY, null),
            ),
        }
      : null,
  );
}

function bindCopy(d: UrlNavDeps): void {
  d.copyButton?.addEventListener(
    "click",
    (event) => {
      if (!event.shiftKey) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      void copySlotLink(d);
    },
    true,
  );
}

export function startUrlNav(d: UrlNavDeps): void {
  bindCopy(d);
  window.addEventListener("hashchange", () => void readHash(d));
  void readHash(d);
}
