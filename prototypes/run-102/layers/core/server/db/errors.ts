// Pure TypeScript: read the Postgres error code behind a Drizzle error.
// Drizzle wraps the driver's error, so the code and constraint name sit on `error.cause`.
export interface PgErrorInfo {
  code: string
  constraint?: string
  message: string
}

export function pgError(err: unknown): PgErrorInfo | undefined {
  for (let e: any = err; e; e = e.cause) {
    if (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) {
      return { code: e.code, constraint: e.constraint, message: e.message }
    }
  }
  return undefined
}

// The codes the services turn into 4xx answers.
export const PG = {
  uniqueViolation: '23505',
  // Also what ON DELETE RESTRICT reports: use the constraint name to tell "bad reference" from "still in use".
  foreignKeyViolation: '23503',
  checkViolation: '23514',
  raised: 'P0001', // RAISE EXCEPTION in a trigger or function
} as const
