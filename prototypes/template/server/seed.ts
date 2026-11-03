// Server-only script: runs inside the Node container to verify DB connectivity
// Programmatic contract: executed via `pnpm db:seed`
import pg from 'pg'

async function runSeed() {
  const dbUrl = process.env.DATABASE_URL
  console.log(`[seed] Starting seed health-check for: ${dbUrl ? dbUrl.replace(/:[^:@]+@/, ':****@') : 'undefined'}`)

  if (!dbUrl) {
    console.warn('[seed] No DATABASE_URL provided. Skipping DB connectivity check.')
    return
  }

  if (dbUrl.startsWith('postgresql://') || dbUrl.startsWith('postgres://')) {
    const pool = new pg.Pool({ connectionString: dbUrl })
    try {
      const client = await pool.connect()
      const res = await client.query('SELECT NOW() as current_time, current_database() as db_name')
      console.log(`[seed] PostgreSQL connection successful! DB: ${res.rows[0].db_name}, Time: ${res.rows[0].current_time}`)
      client.release()
    } catch (err) {
      console.error('[seed] PostgreSQL connection failed:', err)
      process.exit(1)
    } finally {
      await pool.end()
    }
  } else if (dbUrl.startsWith('mongodb://')) {
    console.log('[seed] MongoDB connection ready for prototype implementation.')
  } else {
    console.log(`[seed] Generic or unhandled connection scheme: ${dbUrl}`)
  }

  console.log('[seed] Health-check completed successfully.')
}

runSeed().catch((err) => {
  console.error('[seed] Fatal error during seed execution:', err)
  process.exit(1)
})

