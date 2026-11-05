// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // Layers, lowest first. Each is a folder with its own routes and plugins, merged into this app.
  // Removing a layer means removing its line here and its folder.
  extends: ['./layers/core', './layers/workspace', './layers/events', './layers/items', './layers/tags'],
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
