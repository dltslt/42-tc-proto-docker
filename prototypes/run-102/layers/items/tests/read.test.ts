// The item read services, against a throwaway database with data built to hit the edge cases.
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '../../core/server/lib/errors'
import { createTestDatabase, type TestDatabase } from '../../core/tests/test-db'
import { makeActor, makeColumns, makeMember, makeSpace } from '../../workspace/tests/builders'
import { items } from '../server/db/schema'
import { ListItemsQuery } from '../server/schemas'
import { getItem, listItems } from '../server/services/read'

let t: TestDatabase
beforeAll(async () => { t = await createTestDatabase() })
afterAll(async () => { await t.drop() })

// Build a full query the way the route would: parse it, so defaults (limit 50, sort position) apply.
const query = (input: Record<string, unknown>) => ListItemsQuery.parse(input)

async function setup() {
  const space = await makeSpace(t.db)
  const cols = await makeColumns(t.db, space.id)
  const me = await makeActor(t.db)
  await makeMember(t.db, space.id, me.id)
  return { space, cols, me }
}

// Walk every page and return the item ids in the order they arrived.
async function walk(actorId: string, input: Record<string, unknown>) {
  const ids: string[] = []
  let cursor: string | undefined
  let pages = 0
  do {
    const page = await listItems(t.db, actorId, query({ ...input, cursor }))
    ids.push(...page.data.map((i) => i.id))
    cursor = page.next_cursor ?? undefined
    pages++
  } while (cursor)
  return { ids, pages }
}

describe('pagination', () => {
  it('visits every item exactly once, in order, when many share the same key', async () => {
    const { space, cols, me } = await setup()
    // One INSERT statement: every row gets the same created_at, so only the id tie-break orders them.
    const rows = Array.from({ length: 120 }, (_, i) => ({
      spaceId: space.id, title: `Item ${i}`, columnId: cols.unstarted.id, position: i < 60 ? 'a0' : `a${i}`,
    }))
    const created = await t.db.insert(items).values(rows).returning({ id: items.id, position: items.position })
    for (const sort of ['position', '-position', 'created_at', '-created_at']) {
      const { ids, pages } = await walk(me.id, { space_id: space.id, sort, limit: 7 })
      expect(ids).toHaveLength(120)
      expect(new Set(ids).size).toBe(120)
      expect(pages).toBe(Math.ceil(120 / 7))
      if (sort === 'position') {
        const expected = [...created].sort((a, b) => (a.position < b.position ? -1 : a.position > b.position ? 1 : a.id < b.id ? -1 : 1))
        expect(ids).toEqual(expected.map((r) => r.id))
      }
    }
  })

  it('orders order keys byte by byte, so "Zz" comes before "a0" across a page boundary', async () => {
    const { space, cols, me } = await setup()
    await t.db.insert(items).values(
      ['a1', 'Zz', 'a0', 'a2', 'Zy'].map((position, i) => ({ spaceId: space.id, title: `k${i}`, columnId: cols.unstarted.id, position })),
    )
    const keys: string[] = []
    let cursor: string | undefined
    do {
      const page = await listItems(t.db, me.id, query({ space_id: space.id, limit: 2, cursor }))
      keys.push(...page.data.map((i) => i.position))
      cursor = page.next_cursor ?? undefined
    } while (cursor)
    expect(keys).toEqual(['Zy', 'Zz', 'a0', 'a1', 'a2'])
  })

  it('keeps microsecond differences in created_at, which a JavaScript Date would lose', async () => {
    const { space, cols, me } = await setup()
    for (let i = 0; i < 30; i++) {
      await t.db.execute(sql`
        insert into items (space_id, title, column_id, state, position, created_at)
        values (${space.id}, ${`t${i}`}, ${cols.unstarted.id}, 'unstarted', 'a0', timestamptz '2026-01-01 00:00:00.000100+00' + ${i} * interval '1 microsecond')`)
    }
    const asc = await walk(me.id, { space_id: space.id, sort: 'created_at', limit: 4 })
    expect(asc.ids).toHaveLength(30)
    expect(new Set(asc.ids).size).toBe(30)
    const first = await listItems(t.db, me.id, query({ space_id: space.id, sort: 'created_at', limit: 30 }))
    expect(first.data.map((i) => i.title)).toEqual(Array.from({ length: 30 }, (_, i) => `t${i}`))
  })

  it('rejects a cursor from another sort order, or a forged one, with a 400', async () => {
    const { space, cols, me } = await setup()
    await t.db.insert(items).values([1, 2, 3].map((i) => ({ spaceId: space.id, title: `x${i}`, columnId: cols.unstarted.id, position: `a${i}` })))
    const page = await listItems(t.db, me.id, query({ space_id: space.id, limit: 1 }))
    for (const bad of [{ sort: '-position', cursor: page.next_cursor }, { cursor: 'forged' }]) {
      await expect(listItems(t.db, me.id, query({ space_id: space.id, ...bad }))).rejects.toMatchObject({ status: 400 })
    }
  })
})

describe('filters and search', () => {
  it('combine, and each narrows the result', async () => {
    const { space, cols, me } = await setup()
    const lead = await makeActor(t.db)
    const [root] = await t.db.insert(items).values({ spaceId: space.id, title: 'Root', type: 'project', columnId: cols.unstarted.id, position: 'a0' }).returning()
    await t.db.insert(items).values([
      { spaceId: space.id, parentId: root!.id, title: 'Child one', columnId: cols.unstarted.id, position: 'a0', leadId: lead.id },
      { spaceId: space.id, parentId: root!.id, title: 'Child two', state: 'done', columnId: cols.done.id, position: 'a1' },
    ])
    const titles = async (extra: Record<string, unknown>) =>
      (await listItems(t.db, me.id, query({ space_id: space.id, ...extra }))).data.map((i) => i.title).sort()
    expect(await titles({})).toEqual(['Child one', 'Child two', 'Root'])
    expect(await titles({ parent_id: 'null' })).toEqual(['Root'])
    expect(await titles({ parent_id: root!.id })).toEqual(['Child one', 'Child two'])
    expect(await titles({ state: 'done' })).toEqual(['Child two'])
    expect(await titles({ column_id: cols.done.id })).toEqual(['Child two'])
    expect(await titles({ lead_id: lead.id })).toEqual(['Child one'])
    expect(await titles({ type: 'project' })).toEqual(['Root'])
    expect(await titles({ parent_id: root!.id, state: 'unstarted' })).toEqual(['Child one'])
  })

  it('search ignores case, looks in the description too, and treats % and _ as plain characters', async () => {
    const { space, cols, me } = await setup()
    await t.db.insert(items).values([
      { spaceId: space.id, title: '100% done', columnId: cols.unstarted.id, position: 'a0' },
      { spaceId: space.id, title: 'a_b', columnId: cols.unstarted.id, position: 'a1' },
      { spaceId: space.id, title: 'plain', description: 'Mentions the DEADLINE', columnId: cols.unstarted.id, position: 'a2' },
      { spaceId: space.id, title: 'aXb', columnId: cols.unstarted.id, position: 'a3' },
    ])
    const found = async (q: string) => (await listItems(t.db, me.id, query({ space_id: space.id, q }))).data.map((i) => i.title)
    expect(await found('%')).toEqual(['100% done'])
    expect(await found('a_b')).toEqual(['a_b']) // "_" is not "any character": aXb is not a match
    expect(await found('deadline')).toEqual(['plain'])
    expect(await found('PLAIN')).toEqual(['plain'])
    expect(await found('\\')).toEqual([])
  })
})

describe('space isolation', () => {
  it('never returns another space\'s items, and refuses the request', async () => {
    const mine = await setup()
    const theirs = await setup()
    await t.db.insert(items).values({ spaceId: theirs.space.id, title: 'Theirs', columnId: theirs.cols.unstarted.id, position: 'a0' })
    const mineOnly = await listItems(t.db, mine.me.id, query({ space_id: mine.space.id }))
    expect(mineOnly.data.every((i) => i.space_id === mine.space.id)).toBe(true)
    await expect(listItems(t.db, mine.me.id, query({ space_id: theirs.space.id }))).rejects.toMatchObject({ status: 403 })
    await expect(listItems(t.db, mine.me.id, query({ space_id: crypto.randomUUID() }))).rejects.toMatchObject({ status: 404 })
  })

  it('getItem: 200 for a member, 403 for another space\'s item, 404 for an unknown id', async () => {
    const mine = await setup()
    const theirs = await setup()
    const [item] = await t.db.insert(items).values({ spaceId: theirs.space.id, title: 'Theirs', columnId: theirs.cols.unstarted.id, position: 'a0' }).returning()
    expect((await getItem(t.db, theirs.me.id, item!.id)).title).toBe('Theirs')
    await expect(getItem(t.db, mine.me.id, item!.id)).rejects.toBeInstanceOf(ApiError)
    await expect(getItem(t.db, mine.me.id, item!.id)).rejects.toMatchObject({ status: 403 })
    await expect(getItem(t.db, mine.me.id, crypto.randomUUID())).rejects.toMatchObject({ status: 404 })
  })
})
