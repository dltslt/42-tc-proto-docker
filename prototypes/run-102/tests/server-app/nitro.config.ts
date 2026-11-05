// A Nitro server with only the API: the same `layers/*/server` folders the Nuxt app uses, without Vue.
// The HTTP tests run this. It builds in seconds (the full Nuxt build takes minutes), and it can point at a
// throwaway database, so tests that really write never touch the dev database.
// Nuxt does for layers what `scanDirs` and `alias` do here: it adds each layer's server folder to Nitro.
import { fileURLToPath } from 'node:url'
import { defineNitroConfig } from 'nitropack/config'

const root = fileURLToPath(new URL('../..', import.meta.url))
// Lowest layer first, like `extends` in nuxt.config.ts.
const LAYERS = ['core', 'workspace', 'events', 'items']

export default defineNitroConfig({
  compatibilityDate: '2025-07-15',
  scanDirs: LAYERS.map((name) => `${root}layers/${name}/server`),
  alias: { '#layers': `${root}layers` },
  // This runs in the same container as node_modules, so packages stay as plain imports.
  externals: { trace: false },
  minify: false,
  sourceMap: false,
})
