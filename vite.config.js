import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Shiloh Athletics Tracker',
        short_name: 'Shiloh Tracker',
        description: 'Record body weights for athletes.',
        theme_color: '#030e20',
        background_color: '#030e20',
        display: 'standalone',
        orientation: 'portrait',
        icons: []
      }
    })
  ]
})
