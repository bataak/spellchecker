import type { Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { renderPage } from "./src/help/layout.ts";
import { buildPages, sitemapXml, type Page } from "./src/help/site.ts";
import { readSources } from "./src/help/sources.ts";

const DIR = "help";

interface Site {
  readonly pages: readonly Page[];
  readonly html: (page: Page) => string;
}

function loadSite(base: string): Site {
  const pages = buildPages(readSources(DIR), base);
  const ctx = { base, pages };
  return { pages, html: (page) => renderPage(page, ctx) };
}

function serveDev(dev: ViteDevServer, base: string): void {
  dev.watcher.add(DIR);
  dev.middlewares.use((req, res, next) => {
    const url = (req.url ?? "").split(/[?#]/)[0]!;
    if (!url.startsWith(base)) return next();
    const path = url.slice(base.length);
    const site = loadSite(base);
    const page = site.pages.find(
      (item) => item.path === path || item.path === path + "/",
    );
    if (!page) return next();
    if (!path.endsWith("/")) {
      res.statusCode = 301;
      res.setHeader("Location", url + "/");
      res.end();
      return;
    }
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.end(site.html(page));
  });
}

export function helpPages(): Plugin {
  let base = "/";
  return {
    name: "help-pages",
    configResolved(cfg: ResolvedConfig) {
      base = cfg.base;
    },
    configureServer(dev: ViteDevServer) {
      serveDev(dev, base);
    },
    generateBundle() {
      const site = loadSite(base);
      for (const page of site.pages)
        this.emitFile({
          type: "asset",
          fileName: page.path + "index.html",
          source: site.html(page),
        });
      this.emitFile({
        type: "asset",
        fileName: "sitemap.xml",
        source: sitemapXml(site.pages),
      });
    },
  };
}
