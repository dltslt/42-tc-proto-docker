// Server-only: holds credentials and opens TCP connections to the postgres container.
// server/db is not auto-imported by Nitro, so the seed script and tests can import this file under plain Node.
import pg from 'pg'
import { drizzle, type NodePgQueryResultHKT } from 'drizzle-orm/node-postgres'
import type { PgDatabase } from 'drizzle-orm/pg-core'

// Either the database or an open transaction: code taking this type joins the caller's transaction.
export type Queryable = PgDatabase<NodePgQueryResultHKT>

export function databaseUrl(): string {
  const { DB_USER, DB_PASSWORD, POSTGRES_HOST, POSTGRES_PORT, DB_NAME } = process.env
  if (!DB_USER || !DB_PASSWORD || !DB_NAME) {
    throw new Error('DB_USER, DB_PASSWORD and DB_NAME must be set: run this inside the prototype container')
  }
  const auth = `${encodeURIComponent(DB_USER)}:${encodeURIComponent(DB_PASSWORD)}`
  // "postgres" is the service's hostname on the Docker network, not on the host.
  return `postgresql://${auth}@${POSTGRES_HOST ?? 'postgres'}:${POSTGRES_PORT ?? '5432'}/${DB_NAME}`
}

// A pool reuses open connections across requests. The caller owns it and must end it, or a script never exits.
export function createDatabase() {
  const pool = new pg.Pool({ connectionString: databaseUrl() })
  return { pool, db: drizzle(pool) }
}
