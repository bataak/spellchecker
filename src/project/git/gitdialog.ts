import { ProjectError } from "../projecterror.ts";
import {
  DEFAULT_HOST,
  cleanHost,
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

function showForm<T>(
  form: Form,
  read: (values: Record<string, string>) => T | Promise<T>,
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
    let pending = false;
    const finish = (value: T | null): void => {
      if (closed.signal.aborted || (pending && value === null)) return;
      closed.abort();
      overlay.remove();
      restore?.focus({ preventScroll: true });
      resolve(value);
    };
    const problemText = (problem: unknown): string =>
      problem instanceof ProjectError ? problem.message : String(problem);
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      if (pending) return;
      let result: T | Promise<T>;
      try {
        result = read(values());
      } catch (problem) {
        fail(problemText(problem));
        return;
      }
      if (!(result instanceof Promise)) {
        finish(result);
        return;
      }
      const label = confirm.textContent;
      pending = true;
      panel.inert = true;
      error.hidden = true;
      confirm.textContent = form.pending ?? label;
      result.then(
        (value) => {
          pending = false;
          finish(value);
        },
        (problem: unknown) => {
          pending = false;
          panel.inert = false;
          confirm.textContent = label;
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

function tokenUrl(provider: Provider, host: string): string {
  return (host || DEFAULT_HOST[provider]) + TOKEN_HELP[provider].path;
}

function paintNote(note: HTMLElement, provider: Provider, host: string): void {
  const help = TOKEN_HELP[provider];
  const link = document.createElement("a");
  link.href = tokenUrl(provider, host.trim().replace(/\/+$/, ""));
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

function whereOf(values: Record<string, string>): {
  provider: Provider;
  host: string;
} {
  if (values.service !== "other")
    return { provider: providerOf(values.service), host: "" };
  return { provider: providerOf(values.provider), host: values.host ?? "" };
}

const needsToken = (where: { provider: Provider; host: string }): boolean =>
  !canSignIn(where.provider, cleanHost(where.host, where.provider));

function showField(panel: HTMLElement, name: string, on: boolean): void {
  const label = panel.querySelector(`[name="${name}"]`)?.closest("label");
  if (label) label.hidden = !on;
}

export interface RepoChoice {
  readonly spec: RepoSpec;
  readonly token: StoredToken;
  readonly host: string;
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
    const where = whereOf(form.values());
    const provider = where.provider;
    const host = cleanHost(where.host, provider);
    attempt?.abort();
    const current = new AbortController();
    attempt = current;
    const finish = (token: OAuthToken): void => {
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
      gitlabLogin(host, {
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
  open: (choice: RepoChoice) => Promise<void>,
): Promise<RepoChoice | null> {
  const note = document.createElement("p");
  note.className = "git-note";
  let signed: OAuthToken | null = null;
  const signIn = (values: Record<string, string>): boolean => {
    const where = whereOf(values);
    return (
      !signed &&
      !needsToken(where) &&
      !savedToken(where.provider, cleanHost(where.host, where.provider))
    );
  };
  const other =
    cleanHost(initial.host, initial.provider) !==
    DEFAULT_HOST[initial.provider];
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
            const where = whereOf(values);
            parseRepo(where.provider, values.repo ?? "", {
              branch: values.branch ?? "",
              dir: values.dir ?? "",
              host: where.host,
            });
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
        const where = whereOf(values);
        const { provider, host } = where;
        const token = needsToken(where);
        showField(panel, "host", values.service === "other");
        showField(panel, "provider", values.service === "other");
        showField(panel, "token", token);
        note.hidden = !token;
        paintNote(note, provider, host);
        const confirm =
          panel.querySelector<HTMLButtonElement>(".export-confirm");
        if (confirm) confirm.textContent = signIn(values) ? "Нэвтрэх" : "Нээх";
        const repo = panel.querySelector<HTMLInputElement>('[name="repo"]');
        if (repo) repo.placeholder = cleanHost(host, provider) + "/нэр/төсөл";
        const hostInput =
          panel.querySelector<HTMLInputElement>('[name="host"]');
        if (hostInput)
          hostInput.placeholder =
            provider === "gitlab" ? "gitlab.example.com" : "github.example.com";
        const tokenInput =
          panel.querySelector<HTMLInputElement>('[name="token"]');
        if (tokenInput)
          tokenInput.placeholder = savedToken(
            provider,
            cleanHost(host, provider),
          )
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
          value: other ? "other" : initial.provider,
          options: [
            ["github", PROVIDER_NAME.github],
            ["gitlab", PROVIDER_NAME.gitlab],
            ["other", "Бусад"],
          ],
        },
        {
          name: "host",
          label: "Сервер",
          value: other ? initial.host : "",
        },
        {
          name: "provider",
          label: "Төрөл",
          kind: "select",
          value: other ? initial.provider : "gitlab",
          options: [
            ["gitlab", PROVIDER_NAME.gitlab],
            ["github", "GitHub Enterprise"],
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
    (values) => {
      const where = whereOf(values);
      const spec = parseRepo(where.provider, values.repo ?? "", {
        branch: values.branch ?? "",
        dir: values.dir ?? "",
        host: where.host,
      });
      const typed = needsToken(where) ? (values.token ?? "").trim() : "";
      const token = typed || signed || savedToken(where.provider, spec.host);
      if (!token)
        throw new ProjectError(
          needsToken(where) ? "Token оруулна уу" : "Нэвтэрнэ үү",
        );
      const choice = { spec, token, host: where.host.trim() };
      return open(choice).then(() => choice);
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

export function askCommitMessage(suggested: string): Promise<string | null> {
  return showForm(
    {
      title: "GitHub-д commit хийх",
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
