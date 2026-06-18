import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

let hunspellVersion = 'unknown';
try {
  hunspellVersion = readFileSync('./vendor/hunspell-wasm/HUNSPELL_VERSION', 'utf-8').trim();
} catch {}

const base = process.env.VITE_BASE || '/hunspell-mn/';

export default defineConfig({
  base,
  define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
      __HUNSPELL_VERSION__: JSON.stringify(hunspellVersion),
  },
  optimizeDeps: { exclude: ['hunspell-wasm'] },
  server: { fs: { allow: ['.', '../hunspell-wasm'] } },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,json,webmanifest,wasm,zip}'],
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
  ],
});
