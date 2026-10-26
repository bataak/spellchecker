import { escapeHtml } from "../core/htmlutil.ts";
import { askFolder } from "./git/gitdialog.ts";
import { lastRepo, openRepo, savedToken } from "./git/gitsession.ts";
import { askRepo, type RepoChoice } from "./git/repodialog.ts";
import type { Busy } from "./git/form.ts";
import { confirmClose } from "./linkfiles.ts";
import type { PanelParts } from "./panelmarkup.ts";
import { ProjectError, failureMessage } from "./projecterror.ts";
import type { ProjectPanelDeps } from "./projectpanel.ts";
import type { TreeControl, TreeState } from "./treecontrol.ts";

export interface ActionDeps {
  readonly deps: ProjectPanelDeps;
  readonly parts: PanelParts;
  readonly state: TreeState;
  readonly tree: TreeControl;
  readonly run: (task: () => Promise<unknown>) => Promise<void>;
  readonly show: (on: boolean) => void;
  readonly render: () => void;
}

function afterOpen(a: ActionDeps): (prefer?: string) => void {
  return (prefer) => {
    a.state.collapsed.clear();
    a.state.focus = null;
    a.state.selected = null;
    a.state.shown = "";
    a.deps.onOpened(true, prefer);
    a.show(true);
    const view = a.deps.store.project();
    if (view) a.deps.notify("«" + escapeHtml(view.label) + "» төслийг нээлээ");
  };
}

function openChosenRepo(
  a: ActionDeps,
  opened: (prefer?: string) => void,
  prefer: string | undefined,
) {
  return async (choice: RepoChoice, busy: Busy): Promise<void> => {
    try {
      const loaded = await openRepo(choice.spec, choice.token, {
        signal: busy.signal,
        progress: (done, total) =>
          busy.say("Уншиж байна… " + done + " / " + total),
      });
      busy.signal.throwIfAborted();
      let chosen: string | null = null;
      const pick = async (folders: string[]): Promise<string | null> => {
        busy.hide();
        chosen = await askFolder(folders);
        return chosen;
      };
      if (!(await a.deps.store.openGitRepo(loaded, pick))) return;
      opened(prefer);
      a.state.focus = chosen;
      a.render();
    } catch (error) {
      throw new ProjectError(
        failureMessage(error, "Repo-г нээж чадсангүй") ?? "Цуцаллаа",
        { cause: error },
      );
    }
  };
}

function wireOpening(
  a: ActionDeps,
  opened: (prefer?: string) => void,
): (file: File) => Promise<void> {
  const { deps, parts, run } = a;
  const { store } = deps;
  parts.folderBtn.addEventListener("click", () => {
    if (!deps.beforeOpen()) return;
    const file = deps.openedFile();
    void run(async () => {
      if (await store.pickFolder(file?.handle ?? null)) opened(file?.name);
    });
  });
  parts.zipBtn.addEventListener("click", () => {
    if (deps.beforeOpen()) parts.zipInput.click();
  });
  parts.gitBtn.addEventListener("click", () => {
    if (!deps.beforeOpen()) return;
    void askRepo(
      lastRepo(),
      (provider, host) => savedToken({ provider, host }),
      openChosenRepo(a, opened, deps.openedFile()?.name),
    );
  });
  const openZipFile = (file: File): Promise<void> =>
    run(async () => {
      const prefer = deps.openedFile()?.name;
      await store.openZip(file);
      opened(prefer);
    });
  parts.zipInput.addEventListener("change", () => {
    const file = parts.zipInput.files?.[0];
    parts.zipInput.value = "";
    if (file) void openZipFile(file);
  });
  return openZipFile;
}

function wireProjectButtons(a: ActionDeps): void {
  const { deps, parts, run } = a;
  const { store } = deps;
  parts.grantBtn.addEventListener("click", () => {
    void run(async () => {
      if (await store.grantProject()) deps.onOpened(false);
      else deps.notify("Хавтсанд хандах зөвшөөрөл өгөгдсөнгүй");
    });
  });
  parts.forgetBtn.addEventListener("click", () => {
    store.closeProject();
    deps.onClosed();
  });
  parts.newFileBtn.addEventListener("click", () => a.tree.startCreate(false));
  parts.newDirBtn.addEventListener("click", () => a.tree.startCreate(true));
  parts.refreshBtn.addEventListener("click", () => {
    void run(async () => {
      deps.notify(
        (await store.refreshProject())
          ? "Дискэн дээрх өөрчлөлтийг уншлаа"
          : "Дискэн дээр өөрчлөлт алга",
      );
    });
  });
  parts.exportBtn.addEventListener("click", () => {
    void run(async () => {
      await store.exportZip();
      deps.notify("Төслийг zip архив болгож татлаа");
    });
  });
  parts.closeBtn.addEventListener("click", () => {
    if (!confirmClose(store.project()?.unsaved)) return;
    store.closeProject();
    deps.onClosed();
  });
}

export function wireActions(a: ActionDeps): (file: File) => Promise<void> {
  const opened = afterOpen(a);
  wireProjectButtons(a);
  return wireOpening(a, opened);
}
