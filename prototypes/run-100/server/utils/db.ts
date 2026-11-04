// Server-only (Nitro): files in server/utils are auto-imported into every API route.
// This module also loads in plain Node via `tsx` (the seed script), so it uses only process.env.
import pg from 'pg'

export function dbUrl(): string {
  const { DB_USER, DB_PASSWORD, POSTGRES_HOST = 'postgres', POSTGRES_PORT = '5432', DB_NAME } = process.env
  return `postgresql://${DB_USER}:${DB_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${DB_NAME}`
}

// One connection pool per process (module-level singleton, like a static in C).
let pool: pg.Pool | undefined
export function getPool(): pg.Pool {
  pool ??= new pg.Pool({ connectionString: dbUrl() })
  return pool
}
