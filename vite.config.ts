import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import type { Plugin, ResolvedConfig } from "vite";

const pkg = JSON.parse(readFileSync("./package.json", "utf-8")) as {
  version: string;
};

let hunspellVersion = "unknown";
try {
  hunspellVersion = readFileSync(
    "./vendor/hunspell-wasm/HUNSPELL_VERSION",
    "utf-8",
  ).trim();
} catch {}

const base = process.env.VITE_BASE || "/hunspell-mn/";

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
      let files: string[] = [];
      try {
        files = readdirSync(dir);
      } catch {
        return;
      }
      for (const f of files) {
        if (/\.(aff|dic)$/.test(f)) {
          try {
            rmSync(dir + "/" + f);
          } catch {}
        }
      }
    },
  };
}

export default defineConfig({
  base,
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __HUNSPELL_VERSION__: JSON.stringify(hunspellVersion),
  },
  build: {
    target: "es2020",
    rollupOptions: {
      output: {
        chunkFileNames: (chunk: { name?: string }) =>
          chunk.name && /^pdf/.test(chunk.name)
            ? "assets/pdfjs-[hash].js"
            : "assets/[name]-[hash].js",
      },
    },
  },
  optimizeDeps: { exclude: ["hunspell-wasm"] },
  server: { fs: { allow: [".", "../hunspell-wasm"] } },
  plugins: [
    packDict(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "script",
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,ico,png,svg,webmanifest,wasm,gz,json,woff2}",
        ],
        globIgnores: ["**/pdfjs-*.js", "**/pdf.worker*.mjs"],
        navigateFallback: base + "index.html",
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
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
