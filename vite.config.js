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
