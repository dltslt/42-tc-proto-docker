// Runs once before the tests. The HTTP tests call the running dev server, which reads `proto_run_102`,
// so make sure that database is migrated and seeded. The seed is repeatable, so this changes nothing
// when it has already run.
import { createDb, databaseUrl } from '../layers/core/server/db/client'
import { runMigrations } from '../layers/core/server/db/migrate'
import { loadFixtures } from '../server/seed/load'

export default async function setup() {
  const url = databaseUrl()
  await runMigrations(url)
  const { db, pool } = createDb(url)
  try {
    await db.transaction((tx) => loadFixtures(tx))
  } finally {
    await pool.end()
  }
}
