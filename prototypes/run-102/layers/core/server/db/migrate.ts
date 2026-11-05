// Server-only: apply the migration history in `drizzle/` to a database.
// Run by `make seed` and by the tests, never by a request.
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { createDb } from './client'

// Fixed key for the advisory lock, so two processes migrating at once take turns.
const MIGRATION_LOCK = 102_001

export const migrationsFolder = fileURLToPath(new URL('../../../../drizzle', import.meta.url))

export async function runMigrations(url: string): Promise<void> {
  const { db, pool } = createDb(url)
  // A session-level lock needs one dedicated connection that stays open during the migration.
  const lock = await pool.connect()
  try {
    await lock.query('select pg_advisory_lock($1)', [MIGRATION_LOCK])
    await migrate(db, { migrationsFolder })
  } finally {
    await lock.query('select pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => {})
    lock.release()
    await pool.end()
  }
}
