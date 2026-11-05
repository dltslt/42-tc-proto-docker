// The events table: append-only, ordered ids, and no cascade from what it describes.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PG } from '../../core/server/db/errors'
import { createTestDatabase, failure, type TestDatabase } from '../../core/tests/test-db'
import { spaces } from '../../workspace/server/db/schema'
import { makeActor, makeSpace } from '../../workspace/tests/builders'
import { events } from '../server/db/schema'

let t: TestDatabase
beforeAll(async () => { t = await createTestDatabase() })
afterAll(async () => { await t.drop() })

async function log(over: Partial<typeof events.$inferInsert> = {}) {
  const actor = await makeActor(t.db)
  const [row] = await t.db
    .insert(events)
    .values({ type: 'item.created', actorId: actor.id, targetKind: 'item', targetId: crypto.randomUUID(), ...over })
    .returning()
  return row!
}

describe('events', () => {
  it('get increasing ids and an empty `changes` by default', async () => {
    const first = await log()
    const second = await log()
    expect(second.id).toBeGreaterThan(first.id)
    expect(first.changes).toEqual({})
    expect(first.spaceId).toBeNull()
  })

  it('refuse an unknown actor', async () => {
    const err = await failure(() => t.db.insert(events).values({ type: 'x', actorId: crypto.randomUUID(), targetKind: 'item', targetId: crypto.randomUUID() }))
    expect(err.code).toBe(PG.foreignKeyViolation)
  })

  it('can never be edited or deleted', async () => {
    const event = await log()
    const edit = await failure(() => t.db.update(events).set({ type: 'tampered' }).where(eq(events.id, event.id)))
    expect([edit.code, edit.message]).toEqual([PG.raised, 'events are append-only: UPDATE is not allowed'])
    const remove = await failure(() => t.db.delete(events).where(eq(events.id, event.id)))
    expect([remove.code, remove.message]).toEqual([PG.raised, 'events are append-only: DELETE is not allowed'])
  })

  it('keep their space from being deleted', async () => {
    const space = await makeSpace(t.db)
    await log({ spaceId: space.id })
    const err = await failure(() => t.db.delete(spaces).where(eq(spaces.id, space.id)))
    expect([err.code, err.constraint]).toEqual([PG.foreignKeyViolation, 'events_space_id_spaces_id_fk'])
  })
})
