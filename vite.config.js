import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  build: {
    rolldownOptions: {
      output: {
        // Vendor code changes far less often than app code - splitting it out
        // means a deploy only invalidates the (small) app chunk, and the
        // browser/service worker keeps React and Supabase cached across deploys.
        codeSplitting: {
          groups: [
            { name: 'react-vendor', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
            { name: 'supabase-vendor', test: /node_modules[\\/](@supabase|iceberg-js|tslib)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        // clientsClaim + skipWaiting so a newly-installed service worker takes
        // over immediately instead of waiting for every open tab to close -
        // paired with the registerSW() call in main.jsx, which is what
        // actually triggers the reload once it does.
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // Google Fonts kept by the service worker (v5.15.9): a rack iPad on slow school WiFi
        // waited on the icon font at every launch, and offline the icons showed as words.
        // The stylesheets are served from the cache and refreshed behind it; the font
        // files have versioned URLs, so a cached one never changes. Only real 200s are kept
        // (v5.16.0): index.html loads the stylesheets with crossorigin, so an error or a
        // school filter page can be told apart and is never cached (an opaque reply could
        // be either, and costs ~7 MB of storage quota each in Chrome).
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css', expiration: { maxEntries: 10, maxAgeSeconds: 30 * 24 * 3600 }, cacheableResponse: { statuses: [200] } },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 30, maxAgeSeconds: 365 * 24 * 3600 }, cacheableResponse: { statuses: [200] } },
          },
        ],
      },
      includeAssets: ['logo1.png', 'favicon-32.png', 'favicon-64.png', 'apple-touch-icon.png', 'og-image.png'],
      manifest: {
        name: 'HPD · Shiloh Christian Human Performance',
        short_name: 'HPD',
        description: 'Weigh-ins, sleep, session RPE, lifts and jump testing for Shiloh Christian S&C staff.',
        theme_color: '#030e20',
        background_color: '#030e20',
        display: 'standalone',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' }
        ]
      }
    })
  ]
})
