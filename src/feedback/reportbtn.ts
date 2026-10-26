import type { ReportInput } from "./report.ts";

type ReportModule = typeof import("./report.ts");

export interface ReportEls {
  readonly button: HTMLElement | null;
  readonly note: HTMLElement | null;
}

export function initReportButton(
  { button: btn, note }: ReportEls,
  input: () => ReportInput,
): void {
  if (!btn) return;
  let mod: Promise<ReportModule> | null = null;

  const load = (): Promise<ReportModule> => {
    mod ??= import("./report.ts").catch((e: unknown) => {
      mod = null;
      throw e;
    });
    return mod;
  };

  const setOffline = (on: boolean): void => {
    if (note) note.hidden = !on;
  };

  window.addEventListener("online", () => setOffline(false));
  for (const type of ["pointerenter", "focus"])
    btn.addEventListener(type, () => void load().catch(() => undefined));

  btn.addEventListener("click", () => {
    if (!navigator.onLine) {
      setOffline(true);
      return;
    }
    setOffline(false);
    const win = window.open("", "_blank");
    if (win) win.opener = null;
    const snapshot = input();
    load()
      .then((m) => m.openReport(win, snapshot))
      .catch(() => {
        win?.close();
      });
  });
}
