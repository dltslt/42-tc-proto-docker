// The items table's rules, tested against a real throwaway database.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PG } from '../../core/server/db/errors'
import { createTestDatabase, failure, type TestDatabase } from '../../core/tests/test-db'
import { columns, spaces } from '../../workspace/server/db/schema'
import { makeColumns, makeSpace } from '../../workspace/tests/builders'
import { items } from '../server/db/schema'

let t: TestDatabase
beforeAll(async () => { t = await createTestDatabase() })
afterAll(async () => { await t.drop() })

// A space with its four columns, and a helper to add an item that sits in the column for `state`.
async function setup() {
  const space = await makeSpace(t.db)
  const cols = await makeColumns(t.db, space.id)
  const add = async (over: Partial<typeof items.$inferInsert> = {}) => {
    const state = over.state ?? 'unstarted'
    const [row] = await t.db
      .insert(items)
      .values({ spaceId: space.id, title: 'An item', state, columnId: cols[state].id, position: 'a0', ...over })
      .returning()
    return row!
  }
  return { space, cols, add }
}

describe('a new item', () => {
  it('needs only a title and gets sensible defaults', async () => {
    const { add } = await setup()
    const item = await add()
    expect(item).toMatchObject({ type: 'task', state: 'unstarted', description: '', parentId: null, leadId: null, version: 1 })
  })

  it('rejects a type outside the list and a version below 1', async () => {
    const { add } = await setup()
    expect((await failure(() => add({ type: 'saga' as never }))).constraint).toBe('items_type_check')
    expect((await failure(() => add({ version: 0 }))).constraint).toBe('items_version_check')
  })
})

describe('space boundaries', () => {
  it('reject a parent from another space', async () => {
    const mine = await setup()
    const theirs = await setup()
    const foreignParent = await theirs.add()
    const err = await failure(() => mine.add({ parentId: foreignParent.id }))
    expect([err.code, err.constraint]).toEqual([PG.foreignKeyViolation, 'items_parent_same_space_fk'])
  })

  it('reject a column from another space', async () => {
    const mine = await setup()
    const theirs = await setup()
    const err = await failure(() => mine.add({ columnId: theirs.cols.unstarted.id }))
    expect([err.code, err.constraint]).toEqual([PG.foreignKeyViolation, 'items_column_same_space_and_state_fk'])
  })
})

describe('column and state move together', () => {
  it('reject an item whose state differs from its column', async () => {
    const { add, cols } = await setup()
    const err = await failure(() => add({ state: 'done', columnId: cols.unstarted.id }))
    expect([err.code, err.constraint]).toEqual([PG.foreignKeyViolation, 'items_column_same_space_and_state_fk'])
  })

  it('reject changing only the state', async () => {
    const { add } = await setup()
    const item = await add()
    const err = await failure(() => t.db.update(items).set({ state: 'started' }).where(eq(items.id, item.id)))
    expect(err.constraint).toBe('items_column_same_space_and_state_fk')
  })

  it('allow changing the state and the column in one update', async () => {
    const { add, cols } = await setup()
    const item = await add()
    const [moved] = await t.db.update(items).set({ state: 'started', columnId: cols.started.id }).where(eq(items.id, item.id)).returning()
    expect(moved!.state).toBe('started')
  })
})

describe('deleting', () => {
  it('a parent removes its whole subtree', async () => {
    const { add } = await setup()
    const root = await add()
    const child = await add({ parentId: root.id })
    const grandchild = await add({ parentId: child.id })
    await t.db.delete(items).where(eq(items.id, root.id))
    for (const gone of [root, child, grandchild]) {
      expect(await t.db.select().from(items).where(eq(items.id, gone.id))).toHaveLength(0)
    }
  })

  it('a column in use is refused', async () => {
    const { add, cols } = await setup()
    await add()
    const err = await failure(() => t.db.delete(columns).where(eq(columns.id, cols.unstarted.id)))
    expect([err.code, err.constraint]).toEqual([PG.foreignKeyViolation, 'items_column_same_space_and_state_fk'])
  })

  it('a space removes its items, columns and memberships', async () => {
    const { space, add } = await setup()
    const item = await add()
    await t.db.delete(spaces).where(eq(spaces.id, space.id))
    expect(await t.db.select().from(items).where(eq(items.id, item.id))).toHaveLength(0)
  })
})
