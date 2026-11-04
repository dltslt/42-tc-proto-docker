// Server-only Nitro utility: runs strictly inside the Node container
// Auto-imported across server/api routes without explicit import statements

import pg from 'pg'
import { MongoClient, type Db } from 'mongodb'

// Module-level singletons (persisted across warm server requests in container memory)
let pgPoolInstance: pg.Pool | null = null
let mongoClientInstance: MongoClient | null = null

export function getDatabaseConfig() {
  const user = process.env.DB_USER || 'lerch'
  const pass = process.env.DB_PASSWORD || 'lerch_secret'
  const pgHost = process.env.POSTGRES_HOST || 'postgres'
  const pgPort = process.env.POSTGRES_PORT || '5432'
  const mongoHost = process.env.MONGO_HOST || 'mongo'
  const mongoPort = process.env.MONGO_PORT || '27017'
  const dbName = process.env.DB_NAME || 'proto_run_500'

  const pgUrl = process.env.POSTGRES_URL || `postgresql://${user}:${pass}@${pgHost}:${pgPort}/${dbName}`
  const mongoUrl = process.env.MONGO_URL || `mongodb://${user}:${pass}@${mongoHost}:${mongoPort}/${dbName}?authSource=admin`

  return { user, pass, pgHost, pgPort, mongoHost, mongoPort, dbName, pgUrl, mongoUrl }
}

export function getPgPool(): pg.Pool {
  if (!pgPoolInstance) {
    const { pgUrl } = getDatabaseConfig()
    pgPoolInstance = new pg.Pool({
      connectionString: pgUrl,
      max: 10,
      idleTimeoutMillis: 30000,
    })
  }
  return pgPoolInstance
}

export async function getMongoDb(): Promise<Db> {
  if (!mongoClientInstance) {
    const { mongoUrl, dbName } = getDatabaseConfig()
    mongoClientInstance = new MongoClient(mongoUrl, {
      maxPoolSize: 10,
    })
    await mongoClientInstance.connect()
  }
  return mongoClientInstance.db()
}

export async function queryPg<T = any>(sql: string, params: any[] = []): Promise<{ rows: T[]; rowCount: number; durationMs: number }> {
  const pool = getPgPool()
  const start = performance.now()
  const result = await pool.query(sql, params)
  const durationMs = Number((performance.now() - start).toFixed(2))
  return {
    rows: result.rows as T[],
    rowCount: result.rowCount ?? result.rows.length,
    durationMs,
  }
}
