// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  vite: {
    server: {
      watch: {
        usePolling: false, // Set to true if inotify events fail in Docker/WSL
      },
      hmr: {
        // Nuxt Vite configuration: ensures browser connects to host-forwarded port
        clientPort: Number(process.env.CLIENT_PORT || 3000),
      },
    },
  },
})
