import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import type { Plugin, ResolvedConfig } from "vite";
import { stardictIndex } from "./vite-stardict.ts";
import { attempt } from "./src/core/attempt.ts";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  version: string;
};

const hunspellVersion = attempt(
  () => readFileSync("./vendor/hunspell-wasm/HUNSPELL_VERSION", "utf-8").trim(),
  "unknown",
);

const base = process.env.VITE_BASE || "/hunspell-mn/";

const svgPdfModule = (id: string): boolean =>
  /node_modules\/(?:jspdf|svg2pdf\.js|html2canvas|dompurify|canvg)\//.test(id);

function packDict(): Plugin {
  return {
    name: "pack-dict",
    apply: "build",
    writeBundle() {
      execSync("sh pack-dict.sh", { stdio: "inherit" });
    },
  };
}

function stripRawDicts(): Plugin {
  let outDir = "dist";
  return {
    name: "strip-raw-dicts",
    apply: "build",
    configResolved(cfg: ResolvedConfig) {
      outDir = cfg.build.outDir || "dist";
    },
    closeBundle() {
      const dir = outDir + "/dict";
      const files = attempt(() => readdirSync(dir), null);
      if (!files) return;
      for (const f of files) {
        if (/\.(aff|dic)$/.test(f))
          attempt(() => rmSync(dir + "/" + f), undefined);
      }
    },
  };
}

export default defineConfig({
  base,
  worker: {
    plugins: () => [stardictIndex()],
  },
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __HUNSPELL_VERSION__: JSON.stringify(hunspellVersion),
  },
  build: {
    target: "es2020",
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === "INEFFECTIVE_DYNAMIC_IMPORT")
          throw new Error(warning.message);
        warn(warning);
      },
      output: {
        chunkFileNames: (chunk: { name?: string; moduleIds: string[] }) =>
          chunk.name && /^pdf/.test(chunk.name)
            ? "assets/pdfjs-[hash].js"
            : chunk.name === "svgpdf" || chunk.moduleIds.some(svgPdfModule)
              ? "assets/svgpdf/[name]-[hash].js"
              : "assets/[name]-[hash].js",
      },
    },
  },
  optimizeDeps: { include: ["nspell"], exclude: ["hunspell-wasm"] },
  server: { fs: { allow: [".", "../hunspell-wasm"] } },
  plugins: [
    packDict(),
    stardictIndex(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      workbox: {
        globPatterns: [
          "**/*.{js,mjs,css,html,ico,png,svg,webmanifest,wasm,gz,json,woff2}",
        ],
        globIgnores: [
          "**/dict/stardict/**",
          "**/tex/**",
          "**/examples/**",
          "**/assets/svgpdf/**",
        ],
        navigateFallback: base + "index.html",
        navigateFallbackDenylist: [/\/oauth\.html/],
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\/(?:tex|examples|assets\/svgpdf|fonts\/svgpdf)\//,
            handler: "CacheFirst",
            options: {
              cacheName: "tex-assets",
              expiration: { maxEntries: 400, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      manifest: {
        name: "Монгол үгийн алдаа шалгагч",
        short_name: "Алдаа шалгагч",
        description:
          "Монгол болон англи үгийн алдааг хөтөч дотор, офлайн шалгана.",
        lang: "mn",
        start_url: base,
        scope: base,
        display: "standalone",
        background_color: "#f7f4ee",
        theme_color: "#17150f",
        icons: [
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          {
            src: "maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
    }),
    stripRawDicts(),
  ],
});
