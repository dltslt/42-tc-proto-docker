// One writer at a time per space. Server-only.
// Every write transaction takes this lock first and holds it until it commits or rolls back. That gives:
//  - no cycle in the hierarchy: two moves cannot both check "no cycle" against the old tree
//  - no two items placed into the same gap of the order keys
//  - events whose ids follow commit order within a space, so "everything after event N" never skips one
//  - no deadlock between writers, because every writer takes locks in the same order (space, then rows)
// Reads never take it. Writes in different spaces never wait for each other.
import { sql } from 'drizzle-orm'
import type { Tx } from '#layers/core/server/db/client'

export async function lockSpace(tx: Tx, spaceId: string): Promise<void> {
  // A transaction-level advisory lock: released automatically at COMMIT or ROLLBACK.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${spaceId}, 102))`)
}
