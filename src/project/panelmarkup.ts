import { GLYPH, ICON, headButton, icon, textButton } from "./panelicons.ts";

export interface PanelParts {
  readonly panel: HTMLElement;
  readonly headIcon: HTMLElement;
  readonly title: HTMLElement;
  readonly hideBtn: HTMLButtonElement;
  readonly newFileBtn: HTMLButtonElement;
  readonly newDirBtn: HTMLButtonElement;
  readonly exportBtn: HTMLButtonElement;
  readonly closeBtn: HTMLButtonElement;
  readonly refreshBtn: HTMLButtonElement;
  readonly tree: HTMLElement;
  readonly empty: HTMLElement;
  readonly emptyText: HTMLParagraphElement;
  readonly folderBtn: HTMLButtonElement;
  readonly zipBtn: HTMLButtonElement;
  readonly githubBtn: HTMLButtonElement;
  readonly grantBtn: HTMLButtonElement;
  readonly forgetBtn: HTMLButtonElement;
  readonly zipInput: HTMLInputElement;
  readonly foot: HTMLElement;
  readonly toggle: HTMLButtonElement;
}

export function buildPanel(): PanelParts {
  const panel = document.createElement("aside");
  panel.className = "project-panel";
  panel.setAttribute("aria-label", "LaTeX төсөл");
  panel.hidden = true;

  const head = document.createElement("div");
  head.className = "project-head";
  const headIcon = document.createElement("span");
  headIcon.className = "project-head-icon";
  headIcon.innerHTML = icon(ICON.folder, 16);
  const title = document.createElement("span");
  title.className = "project-title";
  const hideBtn = headButton("Самбарыг нуух", "");
  hideBtn.innerHTML = GLYPH;
  head.append(headIcon, title, hideBtn);

  const newFileBtn = headButton("Шинэ файл үүсгэх", ICON.newFile);
  const newDirBtn = headButton("Шинэ хавтас үүсгэх", ICON.newFolder);
  const exportBtn = textButton("project-foot-btn", "Архивлах");
  exportBtn.addEventListener("mousedown", (event) => event.preventDefault());
  const closeBtn = headButton("Төслийг хаах", ICON.close);
  const refreshBtn = headButton("Дискнээс дахин унших", ICON.refresh);

  const tree = document.createElement("div");
  tree.className = "project-tree";
  tree.setAttribute("role", "tree");
  tree.setAttribute("aria-label", "Төслийн файлууд");

  const empty = document.createElement("div");
  empty.className = "project-empty";
  const emptyText = document.createElement("p");
  const folderBtn = textButton("project-open", "Хавтас нээх");
  const zipBtn = textButton("project-open", "Zip нээх");
  const githubBtn = textButton("project-open", "GitHub-аас нээх");
  const grantBtn = textButton("project-open", "Хандах зөвшөөрөл өгөх");
  const forgetBtn = textButton("project-open project-quiet", "Мартах");
  empty.append(emptyText, folderBtn, zipBtn, githubBtn, grantBtn, forgetBtn);

  const zipInput = document.createElement("input");
  zipInput.type = "file";
  zipInput.accept = ".zip,application/zip";
  zipInput.hidden = true;

  const foot = document.createElement("div");
  foot.className = "project-foot";
  const spacer = document.createElement("span");
  spacer.className = "project-foot-gap";
  foot.append(newFileBtn, newDirBtn, refreshBtn, spacer, exportBtn);
  closeBtn.classList.add("project-close");
  const headGap = document.createElement("span");
  headGap.className = "project-foot-gap";
  head.insertBefore(closeBtn, hideBtn);
  head.insertBefore(headGap, hideBtn);

  panel.append(head, tree, empty, foot, zipInput);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "project-toggle";
  toggle.hidden = true;
  toggle.title = "LaTeX төсөл";
  toggle.setAttribute("aria-label", "LaTeX төслийн самбар");
  toggle.setAttribute("aria-pressed", "false");
  toggle.innerHTML = GLYPH;
  toggle.addEventListener("mousedown", (event) => event.preventDefault());

  return {
    panel,
    headIcon,
    title,
    hideBtn,
    newFileBtn,
    newDirBtn,
    exportBtn,
    closeBtn,
    refreshBtn,
    tree,
    empty,
    emptyText,
    folderBtn,
    zipBtn,
    githubBtn,
    grantBtn,
    forgetBtn,
    zipInput,
    foot,
    toggle,
  };
}
