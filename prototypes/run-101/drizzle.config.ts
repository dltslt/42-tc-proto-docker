// Read by the drizzle-kit CLI only: `pnpm db:generate` compares the schemas below with the last snapshot
// and writes the difference as a new SQL file. It never touches the database.
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  // Every layer owns its tables, but one database needs one linear migration history, kept outside the layers.
  schema: './layers/*/server/db/schema.ts',
  out: './server/db/migrations',
})
