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

interface Field {
  readonly name: string;
  readonly label: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly kind?: "text" | "password" | "area" | "select";
  readonly options?: readonly (readonly [string, string])[];
}

interface Form {
  readonly title: string;
  readonly fields: readonly Field[];
  readonly confirm: string;
  readonly note?: Node;
  readonly onChange?: (
    values: Record<string, string>,
    panel: HTMLElement,
  ) => void;
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
  read: (values: Record<string, string>) => T,
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
    const controls = form.fields.map((field) => {
      const label = document.createElement("label");
      label.className = "export-field";
      label.textContent = field.label;
      const control = input(field);
      label.append(control);
      panel.append(label);
      return control;
    });
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
    if (form.onChange) {
      const changed = form.onChange;
      panel.addEventListener("input", () => changed(values(), panel));
      changed(values(), panel);
    }
    const finish = (value: T | null): void => {
      overlay.remove();
      restore?.focus({ preventScroll: true });
      resolve(value);
    };
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      try {
        finish(read(values()));
      } catch (problem) {
        error.textContent =
          problem instanceof ProjectError ? problem.message : String(problem);
        error.hidden = false;
      }
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
    (controls.find((control) => !control.value) ?? controls[0])?.focus();
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

export interface RepoChoice {
  readonly spec: RepoSpec;
  readonly token: string;
  readonly host: string;
}

export function askRepo(
  initial: RepoFields,
  savedToken: (provider: Provider, host: string) => string | null,
): Promise<RepoChoice | null> {
  const note = document.createElement("p");
  note.className = "git-note";
  return showForm(
    {
      title: "Git repo-оос төсөл нээх",
      confirm: "Нээх",
      note,
      onChange: (values, panel) => {
        const provider = providerOf(values.provider);
        const host = values.host ?? "";
        paintNote(note, provider, host);
        const repo = panel.querySelector<HTMLInputElement>('[name="repo"]');
        if (repo)
          repo.placeholder =
            provider === "gitlab" ? "бүлэг/төсөл" : "bataak/thesis";
        const hostInput =
          panel.querySelector<HTMLInputElement>('[name="host"]');
        if (hostInput) hostInput.placeholder = DEFAULT_HOST[provider];
        const token = panel.querySelector<HTMLInputElement>('[name="token"]');
        if (token)
          token.placeholder = savedToken(provider, cleanHost(host, provider))
            ? "Хадгалсан token-ыг ашиглана"
            : provider === "gitlab"
              ? "glpat-…"
              : "github_pat_…";
      },
      fields: [
        {
          name: "provider",
          label: "Үйлчилгээ",
          kind: "select",
          value: initial.provider,
          options: (["github", "gitlab"] as const).map(
            (provider) => [provider, PROVIDER_NAME[provider]] as const,
          ),
        },
        {
          name: "host",
          label: "Сервер — хоосон бол github.com / gitlab.com",
          value: initial.host,
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
        },
        {
          name: "dir",
          label: "Хавтас — хоосон бол repo бүхэлдээ",
          value: initial.dir,
        },
        { name: "token", label: "Token", kind: "password" },
      ],
    },
    (values) => {
      const provider = providerOf(values.provider);
      const spec = parseRepo(provider, values.repo ?? "", {
        branch: values.branch ?? "",
        dir: values.dir ?? "",
        host: values.host ?? "",
      });
      const token =
        (values.token ?? "").trim() || savedToken(provider, spec.host);
      if (!token) throw new ProjectError("Token оруулна уу");
      return { spec, token, host: (values.host ?? "").trim() };
    },
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
