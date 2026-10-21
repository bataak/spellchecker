import { attempt } from "../core/attempt.ts";

interface Turnstile {
  render(
    el: Element | null,
    options: { sitekey: string; theme: string },
  ): string;
  reset(widgetId: string | null): void;
  getResponse(widgetId: string): string;
}

declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}

const SITEKEY = "0x4AAAAAADvk6t3Gsh_j1vH7";

let scriptPromise: Promise<void> | null = null;

export function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const turnstileScript = document.createElement("script");
      turnstileScript.src =
        "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      turnstileScript.async = true;
      turnstileScript.onload = () => resolve();
      turnstileScript.onerror = () => {
        scriptPromise = null;
        turnstileScript.remove();
        reject(new Error("turnstile-load"));
      };
      document.head.appendChild(turnstileScript);
    });
  }
  return scriptPromise;
}

export interface TurnstileWidget {
  show(host: Element | null): void;
  reset(): void;
  token(): string;
}

export function createTurnstileWidget(): TurnstileWidget {
  let widgetId: string | null = null;
  const reset = (): void => {
    if (!window.turnstile || widgetId == null) return;
    const turnstile = window.turnstile;
    const id = widgetId;
    attempt(() => turnstile.reset(id), undefined);
  };
  return {
    show(host) {
      if (widgetId != null) {
        reset();
        return;
      }
      const theme =
        document.documentElement.dataset.theme === "dark" ? "dark" : "light";
      widgetId = window.turnstile!.render(host, { sitekey: SITEKEY, theme });
    },
    reset,
    token: () =>
      window.turnstile && widgetId != null
        ? window.turnstile.getResponse(widgetId)
        : "",
  };
}
