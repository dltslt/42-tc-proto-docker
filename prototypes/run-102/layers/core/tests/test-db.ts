// Test helper: a throwaway database with every migration applied.
// Each test file makes its own, so files can run in parallel and never touch `proto_run_102`.
import { randomBytes } from 'node:crypto'
import pg from 'pg'
import { createDb, databaseUrl, type Database } from '../server/db/client'
import { runMigrations } from '../server/db/migrate'

export interface TestDatabase {
  db: Database
  url: string
  drop: () => Promise<void>
}

export async function createTestDatabase(): Promise<TestDatabase> {
  const name = `proto_run_102_test_${randomBytes(4).toString('hex')}`
  // CREATE/DROP DATABASE must run on another database; `postgres` always exists.
  const admin = new pg.Client({ connectionString: databaseUrl('postgres') })
  await admin.connect()
  await admin.query(`create database ${name}`)
  const url = databaseUrl(name)
  await runMigrations(url)
  const { db, pool } = createDb(url)
  return {
    db,
    url,
    async drop() {
      await pool.end()
      await admin.query(`drop database ${name} with (force)`)
      await admin.end()
    },
  }
}

// Run a statement that is expected to fail and return the Postgres error behind it.
import { pgError, type PgErrorInfo } from '../server/db/errors'
export async function failure(run: () => Promise<unknown>): Promise<PgErrorInfo> {
  try {
    await run()
  } catch (err) {
    const info = pgError(err)
    if (!info) throw err
    return info
  }
  throw new Error('Expected the statement to fail, but it succeeded')
}
