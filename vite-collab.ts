import type { Plugin, ResolvedConfig } from "vite";

const COLLAB_HIDDEN = /(<button\s+id="collabBtn"[^>]*?)\s+hidden=""/;

export function revealCollab(html: string, endpoint: string): string {
  return endpoint ? html.replace(COLLAB_HIDDEN, "$1") : html;
}

export function collabButton(): Plugin {
  let endpoint = "";
  return {
    name: "collab-button",
    configResolved(cfg: ResolvedConfig) {
      endpoint = String(cfg.env.VITE_COLLAB_URL ?? "");
    },
    transformIndexHtml: (html) => revealCollab(html, endpoint),
  };
}
