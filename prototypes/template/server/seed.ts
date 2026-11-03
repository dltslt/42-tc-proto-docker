// Server-only script: runs inside the Node container to verify DB connectivity
// Programmatic contract: executed via `pnpm db:seed`
import pg from 'pg'

async function checkPostgres(url: string) {
  const pool = new pg.Pool({ connectionString: url })
  try {
    const client = await pool.connect()
    const res = await client.query('SELECT NOW() as current_time, current_database() as db_name')
    console.log(`[seed] PostgreSQL connection OK: DB='${res.rows[0].db_name}', Time=${res.rows[0].current_time}`)
    client.release()
  } finally {
    await pool.end()
  }
}

async function runSeed() {
  const user = process.env.DB_USER
  const pass = process.env.DB_PASSWORD
  const host = process.env.POSTGRES_HOST || 'postgres'
  const port = process.env.POSTGRES_PORT || '5432'
  const db = process.env.DB_NAME || 'proto_template'

  const pgUrl = process.env.POSTGRES_URL || (user && pass ? `postgresql://${user}:${pass}@${host}:${port}/${db}` : undefined)

  console.log('[seed] Starting database connectivity health-check...')

  if (!pgUrl) {
    console.warn('[seed] No PostgreSQL configuration found in environment.')
    return
  }

  try {
    await checkPostgres(pgUrl)
  } catch (err) {
    console.error('[seed] PostgreSQL connection failed:', err)
    process.exit(1)
  }

  console.log('[seed] Health-check completed successfully.')
}

runSeed().catch((err) => {
  console.error('[seed] Fatal error during seed execution:', err)
  process.exit(1)
})
