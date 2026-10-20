import { ProjectError } from "../projecterror.ts";

export interface Field {
  readonly name: string;
  readonly label: string;
  readonly value?: string;
  readonly placeholder?: string;
  readonly kind?: "text" | "password" | "area" | "select";
  readonly options?: readonly (readonly [string, string])[];
  readonly more?: boolean;
  readonly detail?: Node;
}

export interface Form {
  readonly title: string;
  readonly wide?: boolean;
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

export interface FormApi {
  readonly panel: HTMLElement;
  readonly signal: AbortSignal;
  values(): Record<string, string>;
  fail(text: string): void;
  submit(): void;
}

export interface Busy {
  readonly signal: AbortSignal;
  say(text: string): void;
  hide(): void;
}

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

interface FormView {
  readonly overlay: HTMLElement;
  readonly panel: HTMLFormElement;
  readonly controls: readonly Control[];
  readonly error: HTMLElement;
  readonly cancel: HTMLButtonElement;
  readonly confirm: HTMLButtonElement;
}

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

function button(
  type: "button" | "submit",
  className: string,
  text: string,
): HTMLButtonElement {
  const el = document.createElement("button");
  el.type = type;
  el.className = "tbtn " + className;
  el.textContent = text;
  return el;
}

function fieldControls(form: Form, panel: HTMLElement): Control[] {
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
    if (field.detail) label.append(field.detail);
    label.append(control);
    if (field.more) {
      body.append(label);
      if (field.value) more.open = true;
    } else panel.append(label);
    return control;
  });
  if (body.childElementCount) panel.append(more);
  return controls;
}

function buildForm(form: Form): FormView {
  const overlay = document.createElement("div");
  overlay.className = "export-backdrop";
  const panel = document.createElement("form");
  panel.className = "export-panel git-panel";
  if (form.wide) panel.classList.add("git-wide");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", form.title);
  const title = document.createElement("h2");
  title.className = "export-title";
  title.textContent = form.title;
  panel.append(title);
  const controls = fieldControls(form, panel);
  if (form.note) panel.append(form.note);
  const error = document.createElement("p");
  error.className = "export-error";
  error.setAttribute("role", "alert");
  error.hidden = true;
  const actions = document.createElement("div");
  actions.className = "export-actions";
  const cancel = button("button", "export-cancel", "Болих");
  const confirm = button("submit", "export-confirm", form.confirm);
  actions.append(cancel, confirm);
  panel.append(error, actions);
  overlay.append(panel);
  return { overlay, panel, controls, error, cancel, confirm };
}

const problemText = (problem: unknown): string =>
  problem instanceof ProjectError ? problem.message : String(problem);

export function showForm<T>(
  form: Form,
  read: (values: Record<string, string>, busy: Busy) => T | Promise<T>,
): Promise<T | null> {
  return new Promise((resolve) => {
    const restore = document.activeElement as HTMLElement | null;
    const view = buildForm(form);
    const { overlay, panel, controls, error, confirm } = view;
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
    const lock = (on: boolean): void => {
      for (const control of controls) control.disabled = on;
      confirm.disabled = on;
    };
    const settle = (result: Promise<T>, label: string | null): void => {
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
    };
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
      work = current;
      lock(true);
      error.hidden = true;
      confirm.textContent = form.pending ?? label;
      settle(result, label);
    });
    wireClose(view, () => finish(null));
    const shown = controls.filter(
      (control) => control.getClientRects().length > 0,
    );
    (shown.find((control) => !control.value) ?? shown[0])?.focus();
  });
}

function wireClose(view: FormView, close: () => void): void {
  const { overlay, panel, cancel } = view;
  panel.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (
      event.key === "Enter" &&
      (event.ctrlKey || event.metaKey) &&
      event.target instanceof HTMLTextAreaElement
    ) {
      event.preventDefault();
      panel.requestSubmit();
    }
  });
  cancel.addEventListener("click", close);
  overlay.addEventListener("mousedown", (event) => {
    if (event.target === overlay) close();
  });
}
