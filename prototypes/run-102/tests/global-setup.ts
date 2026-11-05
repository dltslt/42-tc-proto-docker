// Runs once before the tests, and its returned function runs once after them.
// The HTTP tests talk to an API-only server (tests/server-app) that reads a throwaway database,
// seeded with the demo data. Tests that really write can therefore never leave junk in `proto_run_102`.
import type { ChildProcess } from 'node:child_process'
import { createDb, databaseUrl } from '../layers/core/server/db/client'
import { runMigrations } from '../layers/core/server/db/migrate'
import { loadFixtures } from '../server/seed/load'
import { dropDatabase, ensureBuilt, recreateDatabase, startServer, stopServer, TEST_DB } from './test-server'

export default async function setup() {
  ensureBuilt()
  await recreateDatabase(TEST_DB)
  const url = databaseUrl(TEST_DB)
  await runMigrations(url)
  const { db, pool } = createDb(url)
  try {
    await db.transaction((tx) => loadFixtures(tx))
  } finally {
    await pool.end()
  }
  const server: ChildProcess = await startServer(TEST_DB)

  return async function teardown() {
    await stopServer(server)
    await dropDatabase(TEST_DB)
  }
}
