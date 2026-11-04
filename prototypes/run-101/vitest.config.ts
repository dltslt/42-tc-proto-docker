// Plain Node test runner: these tests import files directly, without Nuxt's auto-imports.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: { include: ['tests/**/*.test.ts'] },
})
