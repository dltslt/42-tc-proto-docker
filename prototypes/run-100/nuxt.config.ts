// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  // Nuxt modules are build-time plugins: @nuxt/ui registers its components (UButton, UModal, ...)
  // as auto-imports and wires Tailwind CSS 4 into the Vite build.
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css'],
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
