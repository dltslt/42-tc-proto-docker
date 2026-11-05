// Server-only: the database client. One connection pool per server process.
// The core layer owns this and knows no tables; each layer imports its own tables and passes them in.
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'

export type Database = NodePgDatabase
// The handle `db.transaction(fn)` gives to `fn`. Services accept this so they run inside the caller's transaction.
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0]

// Connection URL from the root `.env`, which Docker Compose passes into the container.
// `dbName` lets tests point the same credentials at a throwaway database.
export function databaseUrl(dbName?: string): string {
  if (!dbName && process.env.POSTGRES_URL) return process.env.POSTGRES_URL
  const name = dbName ?? process.env.DB_NAME
  const { DB_USER, DB_PASSWORD, POSTGRES_HOST = 'postgres', POSTGRES_PORT = '5432' } = process.env
  if (!DB_USER || !DB_PASSWORD || !name) {
    throw new Error('Database settings missing: set DB_USER, DB_PASSWORD and DB_NAME (see the root .env)')
  }
  const auth = `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`
  return `postgresql://${auth}@${POSTGRES_HOST}:${POSTGRES_PORT}/${name}`
}

export function createDb(url: string): { db: Database; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, connectionTimeoutMillis: 30_000 })
  return { db: drizzle(pool), pool }
}

let shared: { db: Database; pool: pg.Pool } | undefined

// The process-wide client, created on first use.
export function getDb(): Database {
  shared ??= createDb(databaseUrl())
  return shared.db
}

// Run `fn` in one transaction: everything inside commits together or not at all.
// A route's data change and its event both go through here.
export function withTransaction<T>(fn: (tx: Tx) => Promise<T>, db: Database = getDb()): Promise<T> {
  return db.transaction(fn)
}
