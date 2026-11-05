// The event writer, against a throwaway database.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { registerModule, resetRegistry } from '../../core/server/lib/registry'
import { createTestDatabase, type TestDatabase } from '../../core/tests/test-db'
import { actors } from '../../workspace/server/db/schema'
import { makeActor, makeSpace } from '../../workspace/tests/builders'
import { events } from '../server/db/schema'
import { createdChanges, diffChanges, recordEvent, removedChanges } from '../server/services/record'

let t: TestDatabase
beforeAll(async () => { t = await createTestDatabase() })
afterAll(async () => { await t.drop() })
beforeEach(() => {
  resetRegistry()
  registerModule({ name: 'demo', dependsOn: [], routes: [], eventTypes: ['demo.happened'] })
})

const base = async () => ({ actor: await makeActor(t.db), space: await makeSpace(t.db) })

describe('recordEvent', () => {
  it('writes the event and returns its id; later events get bigger ids', async () => {
    const { actor, space } = await base()
    const input = { spaceId: space.id, type: 'demo.happened', actorId: actor.id, targetKind: 'demo', targetId: crypto.randomUUID() }
    const first = await recordEvent(t.db, { ...input, changes: { title: { from: null, to: 'x' } } })
    const second = await recordEvent(t.db, input)
    expect(second).toBeGreaterThan(first)
    const [row] = await t.db.select().from(events).where(eq(events.id, first))
    expect(row).toMatchObject({ type: 'demo.happened', actorId: actor.id, spaceId: space.id, changes: { title: { from: null, to: 'x' } } })
  })

  it('refuses a type that no layer registered, and writes nothing', async () => {
    const { actor } = await base()
    const before = (await t.db.select().from(events)).length
    await expect(recordEvent(t.db, { spaceId: null, type: 'demo.typo', actorId: actor.id, targetKind: 'demo', targetId: crypto.randomUUID() })).rejects.toThrow(/Unknown event type/)
    expect((await t.db.select().from(events)).length).toBe(before)
  })

  it('is saved and rolled back together with the change it describes', async () => {
    const { actor, space } = await base()
    const before = (await t.db.select().from(events)).length
    const targetId = crypto.randomUUID()
    await expect(
      t.db.transaction(async (tx) => {
        await tx.insert(actors).values({ name: 'Created in the failing transaction', kind: 'human' })
        await recordEvent(tx, { spaceId: space.id, type: 'demo.happened', actorId: actor.id, targetKind: 'demo', targetId })
        throw new Error('the write fails after the event was written')
      }),
    ).rejects.toThrow('the write fails')
    expect((await t.db.select().from(events)).length).toBe(before)
    expect(await t.db.select().from(actors).where(eq(actors.name, 'Created in the failing transaction'))).toHaveLength(0)
  })
})

describe('change helpers', () => {
  const before = { title: 'A', state: 'unstarted', lead: null as string | null, note: '' }
  const after = { title: 'B', state: 'unstarted', lead: 'ada', note: '' }

  it('diffChanges lists only the fields that changed', () => {
    expect(diffChanges(before, after, ['title', 'state', 'lead', 'note'])).toEqual({
      title: { from: 'A', to: 'B' },
      lead: { from: null, to: 'ada' },
    })
    expect(diffChanges(before, before, ['title', 'state'])).toEqual({})
  })

  it('createdChanges and removedChanges skip empty values', () => {
    expect(createdChanges(after, ['title', 'lead', 'note'])).toEqual({ title: { from: null, to: 'B' }, lead: { from: null, to: 'ada' } })
    expect(removedChanges(before, ['title', 'lead', 'note'])).toEqual({ title: { from: 'A', to: null } })
  })
})
