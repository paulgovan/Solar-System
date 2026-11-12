import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Absolute site URL for Open Graph / Twitter image links (crawlers need absolute URLs).
// Set SITE_URL, or let GitHub Actions' GITHUB_REPOSITORY derive the Pages URL.
const [owner, repo] = (process.env.GITHUB_REPOSITORY || '').split('/');
const siteUrl = process.env.SITE_URL || (repo ? `https://${owner}.github.io/${repo}/` : '');

// Relative base so the build works at https://<user>.github.io/<repo>/
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { include: ['tests/**/*.test.js'] }, // e2e specs run under Playwright
  plugins: [
    {
      name: 'site-url',
      transformIndexHtml: (html) => html.replaceAll('%SITE_URL%', siteUrl),
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png', 'og.png'],
      manifest: {
        name: 'Solar System — Live 3D Orrery',
        short_name: 'Solar System',
        description: 'Interactive 3D solar system with planets at their real positions for any date.',
        theme_color: '#05060a',
        background_color: '#05060a',
        display: 'standalone',
        orientation: 'any',
        // relative so the app works under a GitHub Pages sub-path
        start_url: './',
        scope: './',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // app shell: html, js (incl. the Earth-mask worker), css, coastline data, icons
        globPatterns: ['**/*.{html,js,css,json,svg,png,webmanifest}'],
        globIgnores: ['og.png'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            // future imagery in public/textures/ (large): cached on first use, bounded
            urlPattern: ({ url }) => /\/textures\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'textures',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 60, purgeOnQuotaError: true },
              cacheableResponse: { statuses: [200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
});
