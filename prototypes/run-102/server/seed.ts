// Server-only script: `make seed RUN=102` runs this inside the container (`pnpm run db:seed`).
// It applies every migration first, then loads the demo data. Running it again changes nothing.
import { createDb, databaseUrl } from '../layers/core/server/db/client'
import { runMigrations } from '../layers/core/server/db/migrate'
import { pgError } from '../layers/core/server/db/errors'
import { loadFixtures } from './seed/load'
import { loadTagFixtures } from './seed/tags'

async function main() {
  const url = databaseUrl()
  console.log(`[seed] applying migrations to ${new URL(url).pathname.slice(1)}...`)
  await runMigrations(url)

  const { db, pool } = createDb(url)
  try {
    // One transaction: either the whole demo set is there afterwards, or nothing was written.
    const { inserted } = await db.transaction(async (tx) => {
      const core = await loadFixtures(tx)
      const extra = await loadTagFixtures(tx)
      // Tag events count with the other events in the one summary line.
      return { inserted: { ...core.inserted, tags: extra.tags, item_tags: extra.links, events: core.inserted.events + extra.events } }
    })
    const summary = Object.entries(inserted).map(([table, n]) => `${table}=${n}`).join(' ')
    console.log(`[seed] inserted: ${summary}`)
    console.log(Object.values(inserted).every((n) => n === 0) ? '[seed] already up to date.' : '[seed] done.')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  // A readable one-liner instead of a stack trace: most failures here are connection or credentials.
  const code = pgError(err)?.code ?? (err as { code?: string }).code ?? ''
  console.error(`[seed] failed${code ? ` (${code})` : ''}: ${(err as Error).message}`)
  process.exit(1)
})
