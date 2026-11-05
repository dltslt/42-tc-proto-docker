// drizzle-kit reads this to turn the layers' table definitions into SQL migrations.
// One config collects every layer's schema, so the migration history is one ordered list.
// Adding a layer with tables means adding `layers/<name>/server/db/schema.ts`; this file stays as it is.
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './layers/*/server/db/schema.ts',
  out: './drizzle',
})
