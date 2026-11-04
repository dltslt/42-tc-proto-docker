// Server-only script: `make seed RUN=101` runs it inside the container with tsx (plain Node, no Nuxt).
// There are no auto-imports here, so everything is imported explicitly.
import type pg from 'pg'
import { createDatabase } from '../layers/core/server/db/client'
import { seedFixtures } from './db/fixtures'
import { applyMigrations } from './db/migrate'

// Connection refused, unknown host (Docker DNS not ready), or Postgres still starting.
const NOT_READY = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', '57P03'])

// `make init` starts Postgres and seeds right away, so the first attempts can fail while it boots.
async function waitForDatabase(pool: pg.Pool, timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      await pool.query('SELECT 1')
      return
    }
    catch (error) {
      const code = (error as { code?: string }).code ?? ''
      if (!NOT_READY.has(code) || Date.now() >= deadline) throw error
      console.log(`[seed] waiting for PostgreSQL (${code})`)
      await new Promise(resolve => setTimeout(resolve, 1000))
    }
  }
}

async function main(): Promise<void> {
  const { pool, db } = createDatabase()
  try {
    await waitForDatabase(pool)
    await applyMigrations(db)
    console.log('[seed] migrations applied')
    // One transaction: a failure leaves no partial fixtures behind.
    const inserted = await db.transaction(tx => seedFixtures(tx))
    console.log('[seed] inserted', inserted)
  }
  finally {
    await pool.end()
  }
}

main().catch((error) => {
  console.error('[seed] failed:', error)
  process.exit(1)
})
