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
import { showForm, type Busy, type FormApi } from "./form.ts";

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
