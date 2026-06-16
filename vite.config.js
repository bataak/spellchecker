import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.VITE_BASE || '/hunspell-mn/';

export default defineConfig({
  base,
  optimizeDeps: { exclude: ['hunspell-wasm'] },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['dict*'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webmanifest,wasm,aff,dic,zip}'],
        maximumFileSizeToCacheInBytes: 60 * 1024 * 1024,
      },
      manifest: {
        name: 'Монгол үгийн алдаа шалгагч',
        short_name: 'Зөв бичиг',
        description: 'Монгол болон англи үгийн алдааг хөтөч дотор, офлайн шалгана.',
        lang: 'mn',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f7f4ee',
        theme_color: '#b3261e',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
});
