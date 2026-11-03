// Server-only script: runs inside the Node container to verify DB connectivity
// Programmatic contract: executed via `pnpm db:seed`
import pg from 'pg'
import { MongoClient } from 'mongodb'

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

async function checkMongo(url: string) {
  const client = new MongoClient(url)
  try {
    await client.connect()
    const db = client.db()
    const res = await db.command({ ping: 1 })
    console.log(`[seed] MongoDB connection OK: DB='${db.databaseName}', Ping=${res.ok}`)
  } finally {
    await client.close()
  }
}

async function runSeed() {
  const user = process.env.DB_USER
  const pass = process.env.DB_PASSWORD
  const pgHost = process.env.POSTGRES_HOST || 'postgres'
  const pgPort = process.env.POSTGRES_PORT || '5432'
  const mongoHost = process.env.MONGO_HOST || 'mongo'
  const mongoPort = process.env.MONGO_PORT || '27017'
  const db = process.env.DB_NAME || 'proto_template'

  const pgUrl = process.env.POSTGRES_URL || (user && pass ? `postgresql://${user}:${pass}@${pgHost}:${pgPort}/${db}` : undefined)
  const mongoUrl = process.env.MONGO_URL || (user && pass ? `mongodb://${user}:${pass}@${mongoHost}:${mongoPort}/${db}?authSource=admin` : undefined)

  console.log('[seed] Starting database connectivity health-check...')

  if (!pgUrl && !mongoUrl) {
    console.warn('[seed] No database configuration found in environment.')
    return
  }

  if (pgUrl) {
    try {
      await checkPostgres(pgUrl)
    } catch (err) {
      console.error('[seed] PostgreSQL connection failed:', err)
      process.exit(1)
    }
  }

  if (mongoUrl) {
    try {
      await checkMongo(mongoUrl)
    } catch (err) {
      console.error('[seed] MongoDB connection failed:', err)
      process.exit(1)
    }
  }

  console.log('[seed] Health-check completed successfully.')
}

runSeed().catch((err) => {
  console.error('[seed] Fatal error during seed execution:', err)
  process.exit(1)
})
