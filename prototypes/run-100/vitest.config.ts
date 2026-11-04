// Test runner config. These are integration tests: plain Node talks HTTP to the running dev server
// (the same Nitro API the browser uses) and to Postgres for cleanup. No Nuxt runtime is loaded here.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 15_000,
  },
})
