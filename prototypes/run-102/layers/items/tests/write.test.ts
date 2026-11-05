// The item write services, against a throwaway database. Each test builds the little tree it needs
// through the real create service, then checks the result in the database and in the event log.
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { ActorRef } from '../../core/server/lib/actor'
import { ApiError } from '../../core/server/lib/errors'
import { registerModule, resetRegistry } from '../../core/server/lib/registry'
import { createTestDatabase, type TestDatabase } from '../../core/tests/test-db'
import { events } from '../../events/server/db/schema'
import { makeActor, makeColumns, makeMember, makeSpace } from '../../workspace/tests/builders'
import { itemEventTypes } from '../server/contracts'
import { items } from '../server/db/schema'
import { createItem, deleteItem, moveItem, updateItem } from '../server/services/write'

let t: TestDatabase
beforeAll(async () => { t = await createTestDatabase() })
afterAll(async () => { await t.drop() })
beforeEach(() => {
  resetRegistry()
  registerModule({ name: 'items', dependsOn: [], routes: [], eventTypes: itemEventTypes })
})

// A space with the four columns, a member who acts, and a stranger who is not in the space.
async function world() {
  const space = await makeSpace(t.db)
  const cols = await makeColumns(t.db, space.id)
  const me = await makeActor(t.db, { name: 'Me' })
  const stranger = await makeActor(t.db, { name: 'Stranger' })
  await makeMember(t.db, space.id, me.id)
  const actor: ActorRef = { id: me.id, name: me.name, kind: 'human' }
  const outsider: ActorRef = { id: stranger.id, name: stranger.name, kind: 'human' }
  const add = (title: string, extra: Partial<Parameters<typeof createItem>[2]> = {}) =>
    createItem(t.db, actor, { space_id: space.id, title, ...extra })
  return { space, cols, me, actor, outsider, add }
}

const statusOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (err) {
    if (err instanceof ApiError) return err.status
    throw err
  }
  return 200
}
const failure = async (run: () => Promise<unknown>): Promise<ApiError> => {
  try {
    await run()
  } catch (err) {
    if (err instanceof ApiError) return err
    throw err
  }
  throw new Error('Expected an ApiError, but the call succeeded')
}

const eventsFor = (targetId: string) => t.db.select().from(events).where(eq(events.targetId, targetId)).orderBy(asc(events.id))
const countEvents = async () => (await t.db.select({ n: sql<number>`count(*)::int` }).from(events))[0]!.n
const countItems = async () => (await t.db.select({ n: sql<number>`count(*)::int` }).from(items))[0]!.n
// Titles of the children of a parent (null = roots), in the order the database reads them.
async function order(spaceId: string, parentId: string | null) {
  const rows = await t.db.select().from(items).where(and(eq(items.spaceId, spaceId), parentId ? eq(items.parentId, parentId) : sql`parent_id is null`)).orderBy(asc(items.position), asc(items.id))
  return rows.map((r) => r.title)
}

describe('create', () => {
  it('needs only a title: first unstarted column, task, version 1, and one event', async () => {
    const { space, cols, add } = await world()
    const item = await add('Buy milk')
    expect(item).toMatchObject({ title: 'Buy milk', type: 'task', state: 'unstarted', column_id: cols.unstarted.id, description: '', parent_id: null, lead_id: null, version: 1 })
    const log = await eventsFor(item.id)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ type: 'item.created', spaceId: space.id, targetKind: 'item' })
    expect(log[0]!.changes).toMatchObject({ title: { from: null, to: 'Buy milk' }, state: { from: null, to: 'unstarted' } })
  })

  it('puts a new item at the end of its siblings, under any parent', async () => {
    const { space, add } = await world()
    const a = await add('A')
    await add('B')
    await add('A1', { parent_id: a.id })
    await add('A2', { parent_id: a.id })
    expect(await order(space.id, null)).toEqual(['A', 'B'])
    expect(await order(space.id, a.id)).toEqual(['A1', 'A2'])
  })

  it('takes its state from the column, or the column from the state', async () => {
    const { cols, add } = await world()
    expect((await add('By column', { column_id: cols.done.id })).state).toBe('done')
    const byState = await add('By state', { state: 'started' })
    expect(byState.column_id).toBe(cols.started.id)
  })

  it('refuses what does not fit, with a field to blame, and writes nothing', async () => {
    const w = await world()
    const other = await world()
    const foreignParent = await other.add('Elsewhere')
    const cases: [() => Promise<unknown>, string][] = [
      [() => w.add('x', { column_id: w.cols.done.id, state: 'started' }), 'body.state'],
      [() => w.add('x', { column_id: other.cols.done.id }), 'body.column_id'],
      [() => w.add('x', { parent_id: foreignParent.id }), 'body.parent_id'],
      [() => w.add('x', { parent_id: crypto.randomUUID() }), 'body.parent_id'],
      [() => w.add('x', { lead_id: other.me.id }), 'body.lead_id'],
    ]
    const itemsBefore = await countItems()
    const eventsBefore = await countEvents()
    for (const [call, field] of cases) {
      const err = await failure(call)
      expect([err.status, Object.keys(err.fields)]).toEqual([400, [field]])
    }
    expect([await countItems(), await countEvents()]).toEqual([itemsBefore, eventsBefore])
  })

  it('answers 403 for a stranger and 404 for an unknown space', async () => {
    const { space, outsider, actor } = await world()
    expect(await statusOf(() => createItem(t.db, outsider, { space_id: space.id, title: 'x' }))).toBe(403)
    expect(await statusOf(() => createItem(t.db, actor, { space_id: crypto.randomUUID(), title: 'x' }))).toBe(404)
  })

  it('leaves neither the item nor an event behind when the event cannot be written', async () => {
    const { space, actor } = await world()
    resetRegistry() // nobody registered "item.created": the event write fails after the insert
    const before = [await countItems(), await countEvents()]
    await expect(createItem(t.db, actor, { space_id: space.id, title: 'Ghost' })).rejects.toThrow(/Unknown event type/)
    expect([await countItems(), await countEvents()]).toEqual(before)
  })
})

describe('update', () => {
  it('saves a text edit, raises the version, and records what changed', async () => {
    const { actor, add } = await world()
    const item = await add('Draft')
    const saved = await updateItem(t.db, actor, item.id, { title: 'Final', expected_version: 1 })
    expect(saved).toMatchObject({ title: 'Final', version: 2 })
    const [, edit] = await eventsFor(item.id)
    expect(edit).toMatchObject({ type: 'item.updated', actorId: actor.id })
    expect(edit!.changes).toEqual({ title: { from: 'Draft', to: 'Final' } })
  })

  it('refuses a stale version with 409 and the stored item, and changes nothing', async () => {
    const { actor, add } = await world()
    const item = await add('Draft')
    await updateItem(t.db, actor, item.id, { description: 'Ada was here', expected_version: 1 })
    const eventsBefore = await countEvents()
    const err = await failure(() => updateItem(t.db, actor, item.id, { description: 'Ben was here', expected_version: 1 }))
    expect(err.status).toBe(409)
    expect(err.current).toMatchObject({ id: item.id, version: 2, description: 'Ada was here' })
    expect((await eventsFor(item.id)).length).toBe(2) // created + Ada's edit, nothing for Ben
    expect(await countEvents()).toBe(eventsBefore)
  })

  it('does not bump the version or write an event when nothing really changes', async () => {
    const { actor, add } = await world()
    const item = await add('Same')
    const again = await updateItem(t.db, actor, item.id, { title: 'Same', expected_version: 1 })
    expect(again.version).toBe(1)
    expect(await eventsFor(item.id)).toHaveLength(1)
  })

  it('moves the item to the first column of a new state, without a version', async () => {
    const { cols, actor, add } = await world()
    const item = await add('Task')
    const done = await updateItem(t.db, actor, item.id, { state: 'done' })
    expect(done).toMatchObject({ state: 'done', column_id: cols.done.id, version: 1 }) // state is last write wins: no bump
    const [, change] = await eventsFor(item.id)
    expect(change!.changes).toMatchObject({ state: { from: 'unstarted', to: 'done' }, column_id: { from: cols.unstarted.id, to: cols.done.id } })
  })

  it('sets and clears the lead, which must be a member of the space', async () => {
    const w = await world()
    const item = await w.add('Led')
    const led = await updateItem(t.db, w.actor, item.id, { lead_id: w.me.id, expected_version: 1 })
    expect([led.lead_id, led.version]).toEqual([w.me.id, 2])
    const err = await failure(() => updateItem(t.db, w.actor, item.id, { lead_id: w.outsider.id, expected_version: 2 }))
    expect([err.status, Object.keys(err.fields)]).toEqual([400, ['body.lead_id']])
    expect((await updateItem(t.db, w.actor, item.id, { lead_id: null, expected_version: 2 })).lead_id).toBeNull()
  })

  it('answers 403 for a stranger and 404 for an unknown item', async () => {
    const { outsider, actor, add } = await world()
    const item = await add('Private')
    expect(await statusOf(() => updateItem(t.db, outsider, item.id, { state: 'done' }))).toBe(403)
    expect(await statusOf(() => updateItem(t.db, actor, crypto.randomUUID(), { state: 'done' }))).toBe(404)
  })

  it('of two simultaneous text edits from the same version, saves one and answers 409 to the other', async () => {
    const { actor, add } = await world()
    for (let round = 0; round < 10; round++) {
      const item = await add(`Shared ${round}`)
      const results = await Promise.allSettled([
        updateItem(t.db, actor, item.id, { description: 'Ada', expected_version: 1 }),
        updateItem(t.db, actor, item.id, { description: 'Ben', expected_version: 1 }),
      ])
      const saved = results.filter((r) => r.status === 'fulfilled')
      const refused = results.filter((r) => r.status === 'rejected')
      expect(saved).toHaveLength(1)
      expect(refused).toHaveLength(1)
      expect(((refused[0] as PromiseRejectedResult).reason as ApiError).status).toBe(409)
      const [row] = await t.db.select().from(items).where(eq(items.id, item.id))
      expect(row!.version).toBe(2)
      expect(await eventsFor(item.id)).toHaveLength(2) // created + the one edit that won
    }
  })
})

describe('move', () => {
  it('to another column: the state follows, and the item goes to the bottom', async () => {
    const { space, cols, actor, add } = await world()
    const item = await add('Mover')
    await add('Already done', { column_id: cols.done.id })
    const moved = await moveItem(t.db, actor, item.id, { column_id: cols.done.id })
    expect(moved).toMatchObject({ state: 'done', column_id: cols.done.id, version: 1 })
    expect(await order(space.id, null)).toEqual(['Already done', 'Mover'])
    const [, ev] = await eventsFor(item.id)
    expect(ev).toMatchObject({ type: 'item.moved' })
    expect(Object.keys(ev!.changes as object).sort()).toEqual(['column_id', 'position', 'state'])
  })

  it('to another column when it is already the last sibling: only the column and state change', async () => {
    const { cols, actor, add } = await world()
    await add('First')
    const last = await add('Last')
    const moved = await moveItem(t.db, actor, last.id, { column_id: cols.started.id })
    expect(moved.position).toBe(last.position) // no need to touch the key
    const [, ev] = await eventsFor(last.id)
    expect(Object.keys(ev!.changes as object).sort()).toEqual(['column_id', 'state'])
  })

  it('places an item right after, or right before, a named sibling', async () => {
    const { space, actor, add } = await world()
    const [a, b, c, d] = [await add('A'), await add('B'), await add('C'), await add('D')]
    await moveItem(t.db, actor, d.id, { after_id: a.id })
    expect(await order(space.id, null)).toEqual(['A', 'D', 'B', 'C'])
    await moveItem(t.db, actor, c.id, { before_id: a.id })
    expect(await order(space.id, null)).toEqual(['C', 'A', 'D', 'B'])
    await moveItem(t.db, actor, b.id, { before_id: d.id })
    expect(await order(space.id, null)).toEqual(['C', 'A', 'B', 'D'])
  })

  it('to a new parent, at a chosen place, and back to the root with null', async () => {
    const { space, actor, add } = await world()
    const p = await add('P')
    const x = await add('X', { parent_id: p.id })
    const y = await add('Y')
    await moveItem(t.db, actor, y.id, { parent_id: p.id, before_id: x.id })
    expect(await order(space.id, p.id)).toEqual(['Y', 'X'])
    await moveItem(t.db, actor, y.id, { parent_id: null })
    expect(await order(space.id, null)).toEqual(['P', 'Y'])
    expect(await order(space.id, p.id)).toEqual(['X'])
  })

  it('writes no event when the item is already exactly there', async () => {
    const { actor, add } = await world()
    const a = await add('A')
    const b = await add('B')
    const before = await countEvents()
    await moveItem(t.db, actor, b.id, { after_id: a.id }) // already right after A
    await moveItem(t.db, actor, b.id, { parent_id: null }) // already a root item
    expect(await countEvents()).toBe(before)
  })

  it('refuses to put an item under itself or under its own descendant (409), and changes nothing', async () => {
    const { actor, add } = await world()
    const a = await add('A')
    const b = await add('B', { parent_id: a.id })
    const c = await add('C', { parent_id: b.id })
    const before = await countEvents()
    for (const under of [a.id, b.id, c.id]) {
      expect(await statusOf(() => moveItem(t.db, actor, a.id, { parent_id: under }))).toBe(409)
    }
    const [row] = await t.db.select().from(items).where(eq(items.id, a.id))
    expect(row!.parentId).toBeNull()
    expect(await countEvents()).toBe(before)
  })

  it('refuses a neighbour that is not a sibling, and anything from another space (400)', async () => {
    const w = await world()
    const other = await world()
    const a = await w.add('A')
    const child = await w.add('Child', { parent_id: a.id })
    const b = await w.add('B')
    const foreign = await other.add('Foreign')
    const cases: [Parameters<typeof moveItem>[3], string][] = [
      [{ after_id: child.id }, 'body.after_id'], // a child of A is not a sibling of B
      [{ before_id: b.id }, 'body.before_id'], // the item itself
      [{ after_id: foreign.id }, 'body.after_id'],
      [{ parent_id: foreign.id }, 'body.parent_id'],
      [{ column_id: other.cols.done.id }, 'body.column_id'],
    ]
    for (const [body, field] of cases) {
      const err = await failure(() => moveItem(t.db, w.actor, b.id, body))
      expect([err.status, Object.keys(err.fields)]).toEqual([400, [field]])
    }
  })

  it('answers 403 for a stranger and 404 for an unknown item', async () => {
    const { outsider, actor, add } = await world()
    const item = await add('A')
    expect(await statusOf(() => moveItem(t.db, outsider, item.id, { parent_id: null }))).toBe(403)
    expect(await statusOf(() => moveItem(t.db, actor, crypto.randomUUID(), { parent_id: null }))).toBe(404)
  })

  it('drops an item between two siblings that share the same order key, without error', async () => {
    const { space, actor, add } = await world()
    const tied = [await add('A'), await add('B'), await add('C')]
    const mover = await add('Mover')
    // Force a tie, as two writers racing into the same gap could have: A, B and C all share one key.
    await t.db.update(items).set({ position: 'a1' }).where(inArray(items.id, tied.map((i) => i.id)))
    const [first, second, third] = (await order(space.id, null)).slice(0, 3) as [string, string, string]
    expect([first, second, third].sort()).toEqual(['A', 'B', 'C']) // the three tied items read first
    const firstId = tied.find((i) => i.title === first)!.id

    const eventsBefore = await countEvents()
    await moveItem(t.db, actor, mover.id, { after_id: firstId })

    // The mover landed between the first and second tied item, and the order of the others is unchanged.
    expect(await order(space.id, null)).toEqual([first, 'Mover', second, third])
    // The tied items after the anchor were spread out: the move itself plus one event for each of them.
    expect(await countEvents()).toBe(eventsBefore + 1 + 2)
    const keys = (await t.db.select({ p: items.position }).from(items).where(eq(items.spaceId, space.id))).map((r) => r.p)
    expect(new Set(keys).size).toBe(4) // no ties are left
  })

  it('a move and a text edit never conflict, in either order', async () => {
    const { actor, cols, add } = await world()
    for (let round = 0; round < 10; round++) {
      const item = await add(`Both ${round}`)
      const results = await Promise.allSettled([
        updateItem(t.db, actor, item.id, { title: 'Renamed', expected_version: 1 }),
        moveItem(t.db, actor, item.id, { column_id: cols.started.id }),
      ])
      expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled'])
      const [row] = await t.db.select().from(items).where(eq(items.id, item.id))
      expect(row).toMatchObject({ title: 'Renamed', state: 'started', version: 2 })
    }
  })

  it('of two simultaneous moves that would form a cycle, makes one and refuses the other (409)', async () => {
    const { space, actor, add } = await world()
    for (let round = 0; round < 15; round++) {
      const a = await add(`A${round}`)
      const b = await add(`B${round}`)
      // A under B and B under A at the same moment: each is fine alone, both together are a cycle.
      const results = await Promise.allSettled([
        moveItem(t.db, actor, a.id, { parent_id: b.id }),
        moveItem(t.db, actor, b.id, { parent_id: a.id }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
      const refused = results.find((r) => r.status === 'rejected') as PromiseRejectedResult
      expect((refused.reason as ApiError).status).toBe(409)
    }
    // Whatever happened, the whole hierarchy is still a forest: every item reaches a root.
    const stuck = await t.db.execute(sql`
      with recursive walk as (
        select id, parent_id, 0 as depth from items where space_id = ${space.id}::uuid
        union all
        select w.id, i.parent_id, w.depth + 1 from walk w join items i on i.id = w.parent_id where w.depth < 100
      )
      select count(*)::int as n from walk where depth >= 100`)
    expect((stuck.rows[0] as { n: number }).n).toBe(0)
  })

  it('of many simultaneous creates under one parent, gives every item its own place', async () => {
    const { space, actor, add } = await world()
    const parent = await add('Parent')
    await Promise.all(Array.from({ length: 25 }, (_, i) => createItem(t.db, actor, { space_id: space.id, title: `Child ${i}`, parent_id: parent.id })))
    const rows = await t.db.select({ p: items.position }).from(items).where(eq(items.parentId, parent.id))
    expect(rows).toHaveLength(25)
    expect(new Set(rows.map((r) => r.p)).size).toBe(25)
  })
})

describe('delete', () => {
  it('removes a leaf and records it', async () => {
    const { actor, add } = await world()
    const item = await add('Leaf')
    expect(await deleteItem(t.db, actor, item.id, {})).toEqual({ deleted_ids: [item.id], lifted_ids: [] })
    expect(await t.db.select().from(items).where(eq(items.id, item.id))).toHaveLength(0)
    const log = await eventsFor(item.id)
    expect(log.map((e) => e.type)).toEqual(['item.created', 'item.deleted'])
    expect(log[1]!.changes).toMatchObject({ title: { from: 'Leaf', to: null } })
  })

  it('refuses an item with children unless a mode is given (409), and deletes nothing', async () => {
    const { actor, add } = await world()
    const parent = await add('Parent')
    await add('Child', { parent_id: parent.id })
    const before = [await countItems(), await countEvents()]
    const err = await failure(() => deleteItem(t.db, actor, parent.id, {}))
    expect(err.status).toBe(409)
    expect(err.message).toContain('mode=subtree')
    expect([await countItems(), await countEvents()]).toEqual(before)
  })

  it('mode=subtree removes every descendant, with an event for each', async () => {
    const { space, actor, add } = await world()
    const root = await add('Root')
    const mid = await add('Mid', { parent_id: root.id })
    const leaf = await add('Leaf', { parent_id: mid.id })
    const keep = await add('Keep')
    const result = await deleteItem(t.db, actor, root.id, { mode: 'subtree' })
    expect([...result.deleted_ids].sort()).toEqual([root.id, mid.id, leaf.id].sort())
    expect(await order(space.id, null)).toEqual(['Keep'])
    for (const gone of [root, mid, leaf]) expect((await eventsFor(gone.id)).at(-1)!.type).toBe('item.deleted')
    expect((await eventsFor(keep.id)).map((e) => e.type)).toEqual(['item.created'])
  })

  it('mode=lift moves the children up one level, in order, into the place the item had', async () => {
    const { space, actor, add } = await world()
    const before = await add('Before')
    const parent = await add('Parent')
    const after = await add('After')
    const c1 = await add('Child 1', { parent_id: parent.id })
    const c2 = await add('Child 2', { parent_id: parent.id })
    const grandchild = await add('Grandchild', { parent_id: c1.id })
    const result = await deleteItem(t.db, actor, parent.id, { mode: 'lift' })
    expect(result).toEqual({ deleted_ids: [parent.id], lifted_ids: [c1.id, c2.id] })
    expect(await order(space.id, null)).toEqual(['Before', 'Child 1', 'Child 2', 'After'])
    expect(await order(space.id, c1.id)).toEqual(['Grandchild']) // deeper levels stay where they were
    expect((await eventsFor(c1.id)).at(-1)).toMatchObject({ type: 'item.moved' })
    expect((await eventsFor(parent.id)).at(-1)!.type).toBe('item.deleted')
    expect(before.id).toBeDefined(); expect(after.id).toBeDefined(); expect(c2.id).toBeDefined(); expect(grandchild.id).toBeDefined()
  })

  it('mode=lift under a parent lifts into that parent, not the root', async () => {
    const { space, actor, add } = await world()
    const top = await add('Top')
    const mid = await add('Mid', { parent_id: top.id })
    await add('Leaf', { parent_id: mid.id })
    await deleteItem(t.db, actor, mid.id, { mode: 'lift' })
    expect(await order(space.id, top.id)).toEqual(['Leaf'])
  })

  it('answers 403 for a stranger and 404 for an unknown item', async () => {
    const { outsider, actor, add } = await world()
    const item = await add('Keep me')
    expect(await statusOf(() => deleteItem(t.db, outsider, item.id, {}))).toBe(403)
    expect(await statusOf(() => deleteItem(t.db, actor, crypto.randomUUID(), {}))).toBe(404)
  })
})
