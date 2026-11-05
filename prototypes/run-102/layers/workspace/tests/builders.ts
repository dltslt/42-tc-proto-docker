// Test builders: small helpers that insert valid rows, so a test only states what it cares about.
import type { Database } from '../../core/server/db/client'
import { actors, columns, memberships, spaces, STATES } from '../server/db/schema'

export async function makeSpace(db: Database, over: Partial<typeof spaces.$inferInsert> = {}) {
  const [row] = await db.insert(spaces).values({ name: 'Test space', type: 'organization', ...over }).returning()
  return row!
}

export async function makeActor(db: Database, over: Partial<typeof actors.$inferInsert> = {}) {
  const [row] = await db.insert(actors).values({ name: 'Test actor', kind: 'human', ...over }).returning()
  return row!
}

export async function makeMember(db: Database, spaceId: string, actorId: string) {
  await db.insert(memberships).values({ spaceId, actorId })
}

// One column per state, like a seeded space. Returns them keyed by state.
export async function makeColumns(db: Database, spaceId: string) {
  const names = { unstarted: 'Backlog', started: 'In progress', done: 'Done', discarded: 'Discarded' }
  const rows = await db
    .insert(columns)
    .values(STATES.map((state, i) => ({ spaceId, state, name: names[state], position: `a${i}` })))
    .returning()
  return Object.fromEntries(rows.map((row) => [row.state, row])) as Record<(typeof STATES)[number], (typeof rows)[number]>
}
