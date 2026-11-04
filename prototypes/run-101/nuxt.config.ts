// https://nuxt.com/docs/api/configuration/nuxt-config
// Folders in layers/ are registered automatically: each one is merged into this app like a mini Nuxt app.
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
  // System fonts: no web fonts are downloaded at build or run time.
  ui: { fonts: false },
  vite: {
    server: {
      watch: {
        usePolling: false, // Set to true if inotify events fail in Docker/WSL
      },
      hmr: {
        // Nuxt Vite configuration: ensures browser connects to host-forwarded port
        clientPort: Number(process.env.PORT || 3000),
      },
    },
  },
})
