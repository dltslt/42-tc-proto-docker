// Server-only: brings the database up to the newest file in server/db/migrations.
// Drizzle records applied files in drizzle.__drizzle_migrations, so running this again does nothing.
import { fileURLToPath } from 'node:url'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'

export function applyMigrations(db: NodePgDatabase): Promise<void> {
  return migrate(db, { migrationsFolder: fileURLToPath(new URL('./migrations', import.meta.url)) })
}
