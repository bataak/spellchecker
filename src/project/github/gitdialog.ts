import { ProjectError } from "../projecterror.ts";
import { parseRepo, type RepoSpec } from "./gitapi.ts";
import type { RepoFields } from "./gitsession.ts";

const TOKEN_URL = "https://github.com/settings/personal-access-tokens/new";

interface Field {
  readonly name: string;
  readonly label: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly kind?: "text" | "password" | "area";
}

interface Form {
  readonly title: string;
  readonly fields: readonly Field[];
  readonly confirm: string;
  readonly note?: Node;
}

function input(field: Field): HTMLInputElement | HTMLTextAreaElement {
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

    const finish = (value: T | null): void => {
      overlay.remove();
      restore?.focus({ preventScroll: true });
      resolve(value);
    };
    panel.addEventListener("submit", (event) => {
      event.preventDefault();
      const values = Object.fromEntries(
        controls.map((control) => [control.name, control.value]),
      );
      try {
        finish(read(values));
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

function tokenNote(): HTMLElement {
  const note = document.createElement("p");
  note.className = "git-note";
  const link = document.createElement("a");
  link.href = TOKEN_URL;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = "Fine-grained token үүсгэх";
  note.append(
    link,
    " — зөвхөн энэ repo-г сонгож, Contents эрхийг «Read and write» болгоно. Token зөвхөн энэ хөтөчид хадгалагдана.",
  );
  return note;
}

export interface RepoChoice {
  readonly spec: RepoSpec;
  readonly token: string;
}

export function askRepo(
  initial: RepoFields,
  savedToken: string | null,
): Promise<RepoChoice | null> {
  return showForm(
    {
      title: "GitHub-аас төсөл нээх",
      confirm: "Нээх",
      note: tokenNote(),
      fields: [
        {
          name: "repo",
          label: "Repo — эзэн/нэр эсвэл GitHub хаяг",
          value: initial.repo,
          placeholder: "bataak/thesis",
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
        {
          name: "token",
          label: "Token",
          kind: "password",
          placeholder: savedToken
            ? "Хадгалсан token-ыг ашиглана"
            : "github_pat_…",
        },
      ],
    },
    (values) => {
      const spec = parseRepo(
        values.repo ?? "",
        values.branch ?? "",
        values.dir ?? "",
      );
      const token = (values.token ?? "").trim() || savedToken;
      if (!token) throw new ProjectError("Token оруулна уу");
      return { spec, token };
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
