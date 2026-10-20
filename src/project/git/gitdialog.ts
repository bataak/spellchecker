import { ProjectError } from "../projecterror.ts";
import {
  DEFAULT_HOST,
  PROVIDER_NAME,
  parseRepo,
  type Provider,
  type RepoSpec,
} from "./githost.ts";
import type { RepoFields } from "./gitsession.ts";
import {
  canSignIn,
  githubDevice,
  gitlabLogin,
  type OAuthToken,
  type StoredToken,
} from "./gitauth.ts";

interface Field {
  readonly name: string;
  readonly label: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly kind?: "text" | "password" | "area" | "select";
  readonly options?: readonly (readonly [string, string])[];
  readonly more?: boolean;
}

interface Form {
  readonly title: string;
  readonly more?: string;
  readonly fields: readonly Field[];
  readonly confirm: string;
  readonly pending?: string;
  readonly note?: Node;
  readonly onChange?: (
    values: Record<string, string>,
    panel: HTMLElement,
  ) => void;
  readonly extra?: (form: FormApi) => void;
}

interface FormApi {
  readonly panel: HTMLElement;
  readonly signal: AbortSignal;
  values(): Record<string, string>;
  fail(text: string): void;
  submit(): void;
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function input(field: Field): Control {
  if (field.kind === "select") {
    const select = document.createElement("select");
    select.className = "export-name git-input";
    select.name = field.name;
    for (const [value, label] of field.options ?? []) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      select.append(option);
    }
    select.value = field.value ?? "";
    return select;
  }
  const control =
    field.kind === "area"
      ? document.createElement("textarea")
      : document.createElement("input");
  if (control instanceof HTMLInputElement)
    control.type = field.kind === "password" ? "password" : "text";
  else control.rows = 3;
  control.className = "export-name git-input";
  control.name = field.name;
  control.value = field.value ?? "";
  control.placeholder = field.placeholder ?? "";
  control.autocomplete = "off";
  control.spellcheck = false;
  control.setAttribute("autocapitalize", "off");
  return control;
}

export interface Busy {
  readonly signal: AbortSignal;
  say(text: string): void;
  hide(): void;
}

function showForm<T>(
  form: Form,
  read: (values: Record<string, string>, busy: Busy) => T | Promise<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    const restore = document.activeElement as HTMLElement | null;
    const overlay = document.createElement("div");
    overlay.className = "export-backdrop";
    const panel = document.createElement("form");
    panel.className = "export-panel git-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", form.title);
    const title = document.createElement("h2");
    title.className = "export-title";
    title.textContent = form.title;
    panel.append(title);
    const more = document.createElement("details");
    more.className = "git-more";
    const summary = document.createElement("summary");
    summary.textContent = form.more ?? "";
    const body = document.createElement("div");
    body.className = "git-more-body";
    more.append(summary, body);
    const controls = form.fields.map((field) => {
      const label = document.createElement("label");
      label.className = "export-field";
      label.textContent = field.label;
      const control = input(field);
      label.append(control);
      if (field.more) {
        body.append(label);
        if (field.value) more.open = true;
      } else panel.append(label);
      return control;
    });
    if (body.childElementCount) panel.append(more);
    if (form.note) panel.append(form.note);
    const error = document.createElement("p");
    error.className = "export-error";
    error.setAttribute("role", "alert");
    error.hidden = true;
    const actions = document.createElement("div");
    actions.className = "export-actions";
    const cancel = document.createElement("button");
    cancel.type = "button";
    cancel.className = "tbtn export-cancel";
    cancel.textContent = "Болих";
    const confirm = document.createElement("button");
    confirm.type = "submit";
    confirm.className = "tbtn export-confirm";
    confirm.textContent = form.confirm;
    actions.append(cancel, confirm);
    panel.append(error, actions);
    overlay.append(panel);
    document.body.append(overlay);

    const values = (): Record<string, string> =>
      Object.fromEntries(
        controls.map((control) => [control.name, control.value]),
      );
    const closed = new AbortController();
    const fail = (text: string): void => {
      error.textContent = text;
      error.hidden = false;
    };
    form.extra?.({
      panel,
      signal: closed.signal,
      values,
      fail,
      submit: () => panel.requestSubmit(),
    });
    if (form.onChange) {
      const changed = form.onChange;
      panel.addEventListener("input", () => changed(values(), panel));
      changed(values(), panel);
    }
    let work: AbortController | null = null;
    const finish = (value: T | null): void => {
      if (closed.signal.aborted) return;
      work?.abort();
      closed.abort();
      overlay.remove();
      restore?.focus({ preventScroll: true });
      resolve(value);
    };
    const problemText = (problem: unknown): string =>
      problem instanceof ProjectError ? problem.message : String(problem);
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      if (work) return;
      const current = new AbortController();
      const busy: Busy = {
        signal: current.signal,
        say: (text) => {
          confirm.textContent = text;
        },
        hide: () => {
          overlay.hidden = true;
        },
      };
      let result: T | Promise<T>;
      try {
        result = read(values(), busy);
      } catch (problem) {
        fail(problemText(problem));
        return;
      }
      if (!(result instanceof Promise)) {
        finish(result);
        return;
      }
      const label = confirm.textContent;
      const lock = (on: boolean): void => {
        for (const control of controls) control.disabled = on;
        confirm.disabled = on;
      };
      work = current;
      lock(true);
      error.hidden = true;
      confirm.textContent = form.pending ?? label;
      result.then(
        (value) => {
          work = null;
          finish(value);
        },
        (problem: unknown) => {
          work = null;
          if (closed.signal.aborted) return;
          overlay.hidden = false;
          lock(false);
          confirm.textContent = label;
          form.onChange?.(values(), panel);
          fail(problemText(problem));
        },
      );
    });
    panel.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish(null);
      } else if (
        event.key === "Enter" &&
        (event.ctrlKey || event.metaKey) &&
        event.target instanceof HTMLTextAreaElement
      ) {
        event.preventDefault();
        panel.requestSubmit();
      }
    });
    cancel.addEventListener("click", () => finish(null));
    overlay.addEventListener("mousedown", (event) => {
      if (event.target === overlay) finish(null);
    });
    const shown = controls.filter(
      (control) => control.getClientRects().length > 0,
    );
    (shown.find((control) => !control.value) ?? shown[0])?.focus();
  });
}

const TOKEN_HELP: Readonly<
  Record<Provider, { path: string; link: string; rest: string }>
> = {
  github: {
    path: "/settings/personal-access-tokens/new",
    link: "Fine-grained token үүсгэх",
    rest: " — зөвхөн энэ repo-г сонгож, Contents эрхийг «Read and write» болгоно.",
  },
  gitlab: {
    path: "/-/user_settings/personal_access_tokens",
    link: "Personal access token үүсгэх",
    rest: " — «api» эрх сонгоно. Эсвэл зөвхөн энэ төсөлд Project access token үүсгэнэ.",
  },
};

function tokenUrl(provider: Provider): string {
  return DEFAULT_HOST[provider] + TOKEN_HELP[provider].path;
}

function paintNote(note: HTMLElement, provider: Provider): void {
  const help = TOKEN_HELP[provider];
  const link = document.createElement("a");
  link.href = tokenUrl(provider);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = help.link;
  note.replaceChildren(
    link,
    help.rest + " Token зөвхөн энэ хөтөчид хадгалагдана.",
  );
}

const providerOf = (value: string | undefined): Provider =>
  value === "gitlab" ? "gitlab" : "github";

function specOf(values: Record<string, string>): RepoSpec {
  const provider = providerOf(values.service);
  const spec = parseRepo(provider, values.repo ?? "", {
    branch: values.branch ?? "",
    dir: values.dir ?? "",
  });
  if (spec.host !== DEFAULT_HOST[provider])
    throw new ProjectError(
      "Зөвхөн github.com болон gitlab.com дээрх repo-г нээнэ — хаяг «Үйлчилгээ»-тэй таарах ёстой",
    );
  return spec;
}

const needsToken = (provider: Provider): boolean => !canSignIn(provider);

function showField(panel: HTMLElement, name: string, on: boolean): void {
  const label = panel.querySelector(`[name="${name}"]`)?.closest("label");
  if (label) label.hidden = !on;
}

export interface RepoChoice {
  readonly spec: RepoSpec;
  readonly token: StoredToken;
}

function showCode(status: HTMLElement, code: string, url: string): void {
  const link = document.createElement("a");
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = url.replace(/^https?:\/\//, "");
  const strong = document.createElement("strong");
  strong.className = "git-code";
  strong.textContent = code;
  status.replaceChildren(
    link,
    " хуудсанд очоод ",
    strong,
    " кодыг оруулна уу. Зөвшөөрмөгц автоматаар үргэлжилнэ.",
  );
  status.hidden = false;
}

function signInFlow(
  form: FormApi,
  done: (token: OAuthToken) => void,
): { status: HTMLElement; start: () => void } {
  const confirm =
    form.panel.querySelector<HTMLButtonElement>(".export-confirm");
  const status = document.createElement("p");
  status.className = "git-note";
  status.hidden = true;
  let attempt: AbortController | null = null;
  form.signal.addEventListener("abort", () => attempt?.abort());
  const say = (text: string): void => {
    status.textContent = text;
    status.hidden = false;
  };
  const lock = (on: boolean): void => {
    if (confirm) confirm.disabled = on;
  };
  const start = (): void => {
    const provider = providerOf(form.values().service);
    attempt?.abort();
    const current = new AbortController();
    attempt = current;
    const finish = (token: OAuthToken): void => {
      if (current.signal.aborted) return;
      lock(false);
      done(token);
      form.submit();
    };
    const failed = (problem: unknown): void => {
      if (current.signal.aborted) return;
      lock(false);
      status.hidden = true;
      form.fail(
        problem instanceof ProjectError ? problem.message : "Нэвтэрч чадсангүй",
      );
    };
    if (provider === "gitlab") {
      say(
        "Нээгдсэн цонхонд GitLab-д нэвтэрч зөвшөөрнө үү. Цонх хаагдсан бол дахин дарна уу.",
      );
      gitlabLogin(DEFAULT_HOST.gitlab, {
        signal: current.signal,
        returned: () => {
          lock(true);
          say("Нэвтэрч байна…");
        },
      }).then(finish, failed);
      return;
    }
    lock(true);
    githubDevice(
      (code, url) => showCode(status, code, url),
      current.signal,
    ).then(finish, failed);
  };
  return { status, start };
}

export function askRepo(
  initial: RepoFields,
  savedToken: (provider: Provider, host: string) => StoredToken | null,
  open: (choice: RepoChoice, busy: Busy) => Promise<void>,
): Promise<RepoChoice | null> {
  const note = document.createElement("p");
  note.className = "git-note";
  let signed: OAuthToken | null = null;
  const signIn = (values: Record<string, string>): boolean => {
    const provider = providerOf(values.service);
    return (
      !signed &&
      !needsToken(provider) &&
      !savedToken(provider, DEFAULT_HOST[provider])
    );
  };
  return showForm(
    {
      title: "Git repo төсөл",
      confirm: "Нээх",
      pending: "Repo-г уншиж байна…",
      more: "Салбар, хавтас",
      note,
      extra: (form) => {
        const flow = signInFlow(form, (token) => {
          signed = token;
        });
        note.before(flow.status);
        form.panel.addEventListener("submit", (event) => {
          const values = form.values();
          if (!signIn(values)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
          try {
            specOf(values);
          } catch (problem) {
            form.fail(
              problem instanceof ProjectError
                ? problem.message
                : String(problem),
            );
            return;
          }
          flow.start();
        });
      },
      onChange: (values, panel) => {
        const provider = providerOf(values.service);
        const token = needsToken(provider);
        showField(panel, "token", token);
        note.hidden = !token;
        paintNote(note, provider);
        const confirm =
          panel.querySelector<HTMLButtonElement>(".export-confirm");
        if (confirm) confirm.textContent = signIn(values) ? "Нэвтрэх" : "Нээх";
        const repo = panel.querySelector<HTMLInputElement>('[name="repo"]');
        if (repo) repo.placeholder = DEFAULT_HOST[provider] + "/нэр/төсөл";
        const tokenInput =
          panel.querySelector<HTMLInputElement>('[name="token"]');
        if (tokenInput)
          tokenInput.placeholder = savedToken(provider, DEFAULT_HOST[provider])
            ? "Хадгалсан token-ыг ашиглана"
            : provider === "gitlab"
              ? "glpat-…"
              : "github_pat_…";
      },
      fields: [
        {
          name: "service",
          label: "Үйлчилгээ",
          kind: "select",
          value: initial.provider,
          options: [
            ["github", PROVIDER_NAME.github],
            ["gitlab", PROVIDER_NAME.gitlab],
          ],
        },
        {
          name: "repo",
          label: "Repo — нэр эсвэл хаяг",
          value: initial.repo,
        },
        {
          name: "branch",
          label: "Салбар — хоосон бол үндсэн салбар",
          value: initial.branch,
          more: true,
        },
        {
          name: "dir",
          label: "Хавтас — хоосон бол repo бүхэлдээ",
          value: initial.dir,
          more: true,
        },
        { name: "token", label: "Token", kind: "password" },
      ],
    },
    (values, busy) => {
      const provider = providerOf(values.service);
      const spec = specOf(values);
      const typed = needsToken(provider) ? (values.token ?? "").trim() : "";
      const token = typed || signed || savedToken(provider, spec.host);
      if (!token)
        throw new ProjectError(
          needsToken(provider) ? "Token оруулна уу" : "Нэвтэрнэ үү",
        );
      const choice = { spec, token };
      return open(choice, busy).then(() => choice);
    },
  );
}

export function askFolder(folders: readonly string[]): Promise<string | null> {
  return showForm(
    {
      title: "Төслийн хавтас",
      confirm: "Нээх",
      fields: [
        {
          name: "folder",
          label: "Repo-д хэд хэдэн төсөл байна — аль хавтсыг нээх вэ?",
          kind: "select",
          value: folders[0] ?? "",
          options: folders.map((folder) => [folder, folder] as const),
        },
      ],
    },
    (values) => values.folder ?? "",
  );
}

export function askCommitMessage(
  suggested: string,
  provider: Provider,
): Promise<string | null> {
  return showForm(
    {
      title: PROVIDER_NAME[provider] + "-д commit хийх",
      confirm: "Commit хийх",
      fields: [
        {
          name: "message",
          label: "Тайлбар",
          kind: "area",
          value: suggested,
        },
      ],
    },
    (values) => {
      const message = (values.message ?? "").trim();
      if (!message) throw new ProjectError("Тайлбар бичнэ үү");
      return message;
    },
  );
}
