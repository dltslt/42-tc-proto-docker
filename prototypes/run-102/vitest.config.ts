// Vitest runs outside Nuxt, in plain Node. It only needs to know the `#layers` alias that Nuxt
// would otherwise provide, so layers can import each other the same way in tests and in the app.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: { '#layers': fileURLToPath(new URL('./layers', import.meta.url)) },
  },
  test: {
    globalSetup: ['./tests/global-setup.ts'],
    // Tests live next to the layer they cover; cross-layer tests live in tests/.
    include: ['layers/*/tests/**/*.test.ts', 'tests/**/*.test.ts'],
  },
})
