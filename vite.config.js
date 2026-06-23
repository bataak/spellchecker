import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync, readdirSync, rmSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

let hunspellVersion = 'unknown';
try {
  hunspellVersion = readFileSync('./vendor/hunspell-wasm/HUNSPELL_VERSION', 'utf-8').trim();
} catch {}

const base = process.env.VITE_BASE || '/hunspell-mn/';

function dictPreload() {
  return {
    name: 'dict-preload',
    transformIndexHtml() {
      let dicts = [];
      try {
        dicts = JSON.parse(readFileSync('./public/dict/dict-manifest.json', 'utf-8')).dicts || [];
      } catch {}
      const mn = dicts.find((d) => d.id === 'mn_MN');
      if (!mn) return [];
      return [mn.aff, mn.dic].map((f) => ({
        tag: 'link',
        attrs: { rel: 'preload', as: 'fetch', href: base + 'dict/' + f, crossorigin: '' },
        injectTo: 'head',
      }));
    },
  };
}

function stripRawDicts() {
  let outDir = 'dist';
  return {
    name: 'strip-raw-dicts',
    apply: 'build',
    configResolved(cfg) {
      outDir = cfg.build.outDir || 'dist';
    },
    closeBundle() {
      const dir = outDir + '/dict';
      let files = [];
      try {
        files = readdirSync(dir);
      } catch {
        return;
      }
      for (const f of files) {
        if (/\.(aff|dic)$/.test(f)) {
          try {
            rmSync(dir + '/' + f);
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
  optimizeDeps: { exclude: ['hunspell-wasm'] },
  server: { fs: { allow: ['.', '../hunspell-wasm'] } },
  plugins: [
    dictPreload(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'script',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,wasm,gz,json}'],
        navigateFallback: base + 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,

        runtimeCaching: [
          {
            urlPattern: new RegExp(`${base}dict/`),
            handler: 'CacheFirst',
            options: {
              cacheName: 'dict-cache',
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      manifest: {
        name: 'Монгол үгийн алдаа шалгагч',
        short_name: 'Алдаа шалгагч',
        description: 'Монгол болон англи үгийн алдааг хөтөч дотор, офлайн шалгана.',
        lang: 'mn',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f7f4ee',
        theme_color: '#17150f',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
    stripRawDicts(),
  ],
});
